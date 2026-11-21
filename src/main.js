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

  // 3) 音频与台词（此时还没有用户手势，只做准备工作，不要在这里创建 AudioContext）
  audio.init();
  voice.init();

  // 4) 语音识别：不支持也不影响启动，只是走降级通道
  const asrState = asr.init();
  if (!asrState || asrState.ok !== true) {
    emit(EVENTS.DEGRADE_ON, { reason: asrState?.reason || 'unsupported' });
  }

  // 5) 循环：把「移动」和「音频听者位置」绑在同一个 tick 上。
  //    这是刻意设计 —— 两者不同步会导致声音位置与玩家位置错位。
  ctx.loop = createLoop({
    fps: 60,
    onTick: (dt) => {
      player.update(dt);

      const p = player.getState();
      audio.setListener({ x: p.x, z: p.z, heading: p.heading });
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
  // 一秒后回看实际步进数，才能确认循环真的活着。
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
