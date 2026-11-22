/**
 * 装配入口。
 *
 * 职责边界（重要）：
 *   本文件【只做接线】，不实现业务逻辑。
 *   所有功能都在各自的模块里，由各任务负责人填充（见 docs/tasks.md）。
 *
 * T0 阶段的目标只有三个：
 *   1. 所有模块都能被 import 且不报错
 *   2. 循环能跑起来
 *   3. 控制台能打出 ready
 */

import { bus, emit } from './core/bus.js';
import { createLoop } from './core/loop.js';
import { EVENTS, INTENTS, SURFACES, CONFIDENCE } from './core/contracts.js';

// —— T1 空间音频 ——
import * as audio from './audio/engine.js';
import * as probe from './audio/probe.js';
// —— T2 移动 / 碰撞 / 场景 ——
import * as player from './world/player.js';
import * as scene from './world/scene.js';
// —— T4 语音识别与意图 ——
import * as asr from './speech/asr.js';
import * as nlu from './nlu/intents.js';
// —— T5 台词播放 ——
import * as voice from './speech/voice.js';
// —— T6 界面与无障碍 ——
import * as screens from './ui/screens.js';
import * as a11y from './ui/a11y.js';
// —— T7 任务与单局 ——
import * as tasks from './game/tasks.js';
import * as session from './game/session.js';

/** 全局上下文，方便调试时在控制台查看 */
export const ctx = {
  loop: null,
  scene: null,
  ready: false
};

function boot() {
  console.info('[main] 启动装配…');

  // 1) 界面与无障碍先行：后面所有模块都可能要播报或切换屏幕
  screens.init();
  a11y.init();

  // 2) 单局与任务状态
  session.init();
  tasks.init();

  // 3) 台词模块（只做准备，不创建 AudioContext）
  voice.init();

  // 4) 语音识别：不支持也不影响启动，只是走降级通道
  const asrState = asr.init();
  if (!asrState || asrState.ok !== true) {
    emit(EVENTS.DEGRADE_ON, { reason: asrState?.reason || 'unsupported' });
  }

  // 5) 音频解锁：浏览器禁止无用户手势出声，所以挂一次性监听。
  //    必须在载入场景【之前】把探测函数注入好，否则第一次敲杖会落空。
  audio.setProbeFunction(probe.probeCone);
  armAudioUnlock();

  // 6) 载入场景，然后初始化玩家。
  //    顺序不能反：player.init() 要读场景起点与障碍物。
  //    场景文件由 T3 提供；还没有时保持 null，游戏仍能启动（只是没有关卡）。
  loadScene().then((loaded) => {
    if (loaded) {
      player.init();
      const s = scene.getCurrent();
      console.info('[main] 场景就绪，可操作', {
        起点: s?.start,
        障碍物数: s?.obstacles.length,
        告示牌数: s?.signs.length,
        任务数: s?.tasks.length
      });

      // 环境声：此时音频可能还没解锁，playAmbience 会在解锁后补建
      pendingAmbience = s?.emitters || [];
    } else {
      console.info('[main] 尚无场景数据（content/scene1.json），' +
                   '移动与音频模块不会启动。这是 T3 尚未交付时的正常状态。');
    }

    startLoop();
  });
}

/** 待建立的环境声源（等音频解锁后补建） */
let pendingAmbience = [];

/**
 * 挂一次性监听，在首次用户交互时解锁音频。
 *
 * 用三个事件是因为不同浏览器的"可信手势"定义不同：
 * 桌面多为 click / keydown，移动端可能是 touchstart。
 * once + 手动清理，确保只解锁一次。
 */
function armAudioUnlock() {
  const unlock = () => {
    const r = audio.init();
    if (r && r.ok) {
      console.info('[main] 音频已解锁', { sampleRate: r.sampleRate, state: r.state });

      // 把 AudioContext 交给台词模块复用。
      // 不能让它自己再建一个：浏览器限制同时存在的 context 数量，
      // 且多个 context 的声音无法统一混合。
      voice.attachContext(audio.getContext());
      preloadVoice();

      if (pendingAmbience.length > 0) {
        const amb = audio.playAmbience(pendingAmbience);
        console.info(`[main] 已建立环境声源 ${amb.created} 个` +
                     (amb.missing.length ? `（缺失素材：${amb.missing.join(', ')}）` : ''));
        pendingAmbience = [];
      }
    } else {
      console.warn('[main] 音频解锁失败：', r && r.reason);
    }
    cleanup();
  };

  const cleanup = () => {
    for (const evt of EVENTS_TO_UNLOCK) window.removeEventListener(evt, unlock);
  };

  for (const evt of EVENTS_TO_UNLOCK) {
    window.addEventListener(evt, unlock, { once: false, passive: true });
  }
}

const EVENTS_TO_UNLOCK = ['pointerdown', 'keydown', 'touchstart'];

/**
 * 预加载本次要用到的台词。
 *
 * id 来源有两处，都必须覆盖：
 *   1. 场景数据里引用的（signs[].line、tasks[].line）
 *   2. 系统提示（偏离、碰撞、敲杖反馈、降级提示）
 *
 * 只加载用得到的，而不是把 assets/voice 全部拉下来 ——
 * 场景变多后全量加载会拖慢启动。
 */
async function preloadVoice() {
  const ids = new Set([
    // 系统提示（代码里直接引用的固定 id）
    'S_DEVIATION', 'S_BLOCKED', 'S_CANE_CLEAR',
    'S_CANE_HIT_NEAR', 'S_CANE_HIT_MID', 'S_CANE_HIT_FAR',
    'S_ASK_AGAIN', 'S_NO_UNDERSTAND', 'S_TOO_NOISY',
    'S_NO_SIGN', 'S_WHERE_AM_I', 'S_STOP', 'S_FASTER', 'S_SLOWER',
    'S_END'
  ]);

  const s = scene.getCurrent();
  if (s) {
    for (const sign of s.signs) if (sign.line) ids.add(sign.line);
    for (const task of s.tasks) if (task.line) ids.add(task.line);
  }

  const r = await voice.preload(Array.from(ids));
  console.info(`[main] 台词已加载 ${r.loaded.length} 条` +
               (r.missing.length ? `，缺失 ${r.missing.length} 条：${r.missing.join(', ')}` : ''));
  ctx.voiceReady = r.missing.length === 0;
}

/**
 * 载入 content/scene1.json。
 *
 * 用 fetch 而不是 import：场景是【数据】不是代码，
 * 这样 T3 改 JSON 不需要碰任何 .js 文件（符合文件归属约定）。
 */
async function loadScene() {
  try {
    const res = await fetch('./content/scene1.json', { cache: 'no-cache' });
    if (!res.ok) return false;
    const json = await res.json();
    const parsed = scene.load(json);
    if (!parsed) return false;
    ctx.scene = parsed;
    emit(EVENTS.SCENE_LOADED, { sceneId: parsed.id, title: parsed.title });
    return true;
  } catch (err) {
    console.warn('[main] 载入场景失败：', err.message);
    return false;
  }
}

function startLoop() {
  // 循环：把「移动」「音频听者」「脚步节拍」绑在同一个 tick 上。
  //
  // 为什么必须同一个 tick：听者位置落后于玩家位置哪怕一帧，
  // 声像就会偏；而脚步声如果用自己的计时器，会与移动速度脱节，
  // 玩家就会听到"没在走却有脚步声"。
  // 上一帧位置：用来由位移推算速度。缺这一步，脚步永远不响。
  let lastX = null, lastZ = null;

  ctx.loop = createLoop({
    fps: 60,
    onTick: (dt) => {
      player.update(dt);

      const p = player.getState();
      audio.setListener({ x: p.x, z: p.z, heading: p.heading });

      // 脚步节拍需要知道"走多快"：engine.js 的 updateFootsteps 在
      // speed < 0.05 时直接返回，所以不喂速度就等于永远没有脚步声。
      // 用位移推算而不是让 player.js 调 audio，是为了保住 T2 的
      // player.js 不依赖音频模块（纯逻辑可测）。
      if (lastX !== null && dt > 0) {
        audio.setSpeed(Math.hypot(p.x - lastX, p.z - lastZ) / dt);
      }
      lastX = p.x;
      lastZ = p.z;

      audio.updateFootsteps(dt);
    }
  });
  ctx.loop.start();

  ctx.ready = true;
  console.info('[main] ready', {
    意图数: Object.values(INTENTS).length,
    路面类型: Object.values(SURFACES).length,
    置信阈值: CONFIDENCE
  });

  // 启动确认：循环是否真的在推进。
  // 只看 loop.running 不够 —— 它只表示"已请求启动"，
  // 而 rAF 在后台标签页、无头模式、或用户切走窗口时都不触发。
  setTimeout(() => {
    const stepped = ctx.loop.ticks;
    const expected = 60;
    if (stepped === 0) {
      console.warn('[main] 循环未推进：rAF 可能被挂起（后台标签页、无头模式，或窗口不可见）。' +
                   '逻辑本身没问题，可用 loop.tick(dt) 手动驱动来测试。');
    } else if (stepped < expected * 0.5) {
      // 无头模式与 virtual-time 下会走到这里：虚拟时钟推进但 rAF 只触发很少几次。
      console.info(`[main] 循环步进 ${stepped} 次（1 秒内预期约 ${expected} 次）。` +
                   '若在无头/虚拟时间环境下运行，这是正常的；' +
                   '若在真实浏览器里出现，说明有长任务阻塞了主线程。');
    } else {
      console.info(`[main] 循环正常：1 秒内步进 ${stepped} 次（预期约 ${expected}）`);
    }
  }, 1000);
}

// 事件契约的自检：把关键事件打出来，方便各模块接入时确认是否收到。
// 这是 T0 的验收要求之一 —— 控制台要能看到循环在跑。
if (typeof window !== 'undefined') {
  window.__ctx = ctx;
  window.__bus = bus;

  // 调试用：把几个关键事件镜像到控制台（正式版可以关掉）
  const TRACE = [
    EVENTS.SCENE_LOADED,
    EVENTS.SURFACE_CHANGED,
    EVENTS.CANE_PROBE,
    EVENTS.INTENT,
    EVENTS.TASK_DONE,
    EVENTS.DEGRADE_ON
  ];
  for (const evt of TRACE) {
    bus.on(evt, (payload) => console.debug(`[event] ${evt}`, payload));
  }
}

// DOM 就绪后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
