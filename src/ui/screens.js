/**
 * T6 · 页面外壳与无障碍
 *
 * 负责人：T6（见 docs/tasks.md）
 * 你拥有：src/ui/screens.js、src/ui/a11y.js
 *
 * 四个屏幕：开始 → 校准 → 游戏中 → 结算。用 hidden 属性切换，不引入路由库。
 *
 * 三条不可退让的设计（每条都有依据，不是风格偏好）：
 *
 * 1. 【游戏中屏幕全黑】这是作品的立意：玩家只能靠耳朵。
 *    所以游戏屏上只留两样东西 —— 顶部极小的状态行，和右下角可折叠的指令面板。
 *    面板是降级通道：现场草坪噪音大，麦克风随时可能失效，按钮和打字必须一直在。
 *
 * 2. 【点「开始」同时解锁 AudioContext】浏览器不许无手势出声。
 *    而这个点击是玩家在整局里唯一必然发生的手势 —— 把解锁挂在这里最可靠。
 *
 * 3. 【30 秒方位校准不可省】依据 docs/test-log.md T-001：
 *    双耳定位依赖耳廓的频谱特征（pinna notch），个体差异极大，
 *    一套通用 HRTF 覆盖不了所有人。播放器给不了"你的耳朵"，
 *    只能让玩家自己听一遍左、前、右，确认他确实听得出差别。
 *
 * 与其它模块的关系：本模块【只接线，不改别人】。
 * 移动交给 world/player，台词的播放交给 speech/voice，
 * 三态输入（执行 / 回述确认 / 拒答）交给 ui/input —— 这里只提供入口与反馈。
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS, INTENT_LABELS, SURFACES, CANE_BAND_LABELS } from '../core/contracts.js';
import { headingToVec } from '../core/vec.js';

import * as a11y from './a11y.js';
import * as input from './input.js';
import * as audio from '../audio/engine.js';
import * as voice from '../speech/voice.js';
import * as player from '../world/player.js';
import * as scene from '../world/scene.js';
import * as session from '../game/session.js';

/* ------------------------------------------------------------
 * 常量
 * ---------------------------------------------------------- */

const SCREENS = ['start', 'calibrate', 'game', 'result'];

/** 校准的预算时长（秒）。到时不禁用，只是不再倒计时 —— 玩家随时可以继续。 */
const CAL_SECONDS = 30;

/** 校准声源距离（米）。太近会贴耳，太远被环境声淹没。 */
const CAL_DISTANCE = 2.0;

/** 耳机检查的横向角度。±75° 稳稳落在 T-001 划定的前向半平面内。 */
const EAR_BEARING = 75;

/**
 * 校准三步。
 *
 * 为什么用 ±60° 而不是 ±90°：90° 正好是前向半平面的边界，
 * 落在边界上的声像在个别耳机上会翻到另一侧；60° 仍在"明显的一侧"，
 * 但离边界有余量。依据 docs/test-log.md T-001 的第 1 条设计修改。
 */
const CAL_STEPS = [
  { id: 'left', label: '左侧', bearing: -60 },
  { id: 'front', label: '正前方', bearing: 0 },
  { id: 'right', label: '右侧', bearing: 60 }
];

/** 路面材质的中文说法（播报用，不是游戏数据） */
const SURFACE_LABELS = {
  [SURFACES.TACTILE]: '盲道',
  [SURFACES.CONCRETE]: '水泥地',
  [SURFACES.GRASS]: '草地'
};

/**
 * 降级面板的四个指令。
 *
 * text 用的是 T4 同义词表里的标准说法 —— 按钮不该依赖"猜一猜哪句能被听懂"，
 * 所以这里不写「走」这种含糊的词，直接给能精确命中（得分 1.0）的整句。
 */
const PANEL_COMMANDS = [
  { key: '1', label: '前进', text: '往前走' },
  { key: '2', label: '向左', text: '向左走' },
  { key: '3', label: '向右', text: '向右走' },
  { key: '4', label: '读牌', text: '帮我读一下前方告示牌' }
];

/**
 * 非游戏屏幕上必须拦下的键。
 *
 * 为什么需要这道闸门：T2 的 player.js 在 init() 时把键盘挂到了 window 上
 * （"键盘永远可用"是它的硬性要求），而 main.js 在场景载入后就会调用它 ——
 * 也就是说开始页和校准页上按 W，玩家其实在走，只是看不见。
 * 校准页尤其致命：听者位置一动，"左/前/右"就全偏了。
 *
 * 我们不改 player.js（那是 T2 的文件），而是在 window 的捕获阶段把按键拦下来。
 * stopPropagation 而不是 preventDefault：键本身还能用（Tab、回车、
 * 空格激活按钮都正常），只是 T2/T4 收不到。
 */
const GATED_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'KeyT', 'KeyY', 'KeyN'
]);

/* ------------------------------------------------------------
 * 状态
 * ---------------------------------------------------------- */

const S = {
  inited: false,
  screen: null,

  /** @type {Record<string, HTMLElement>} */
  els: {},
  /** @type {Record<string, HTMLElement>} */
  sections: {},

  sceneTitle: '',
  audioReady: false,

  // —— 本局统计 ——
  // 为什么自己算一份：T7 的 session.js 目前还是桩文件，结算页不能等它。
  // showResult() 会优先用 T7 的数据，缺了才用这里的兜底值。
  stats: emptyStats(),
  startedAt: 0,
  ended: false,
  result: null,

  // —— 校准 ——
  cal: { index: 0, remain: CAL_SECONDS, finished: false },

  // —— 面板 ——
  panelOpen: false,

  // —— 清理 ——
  timers: new Set(),
  tempSources: new Set(),
  gate: null,
  releaseTrap: null,
  lastStatusAt: 0
};

function emptyStats() {
  return { tasksDone: 0, tasksTotal: 0, caneProbes: 0, hints: 0, asrFailures: 0 };
}

/* ------------------------------------------------------------
 * 对外接口
 * ---------------------------------------------------------- */

/** 初始化：建四个屏幕、接线事件、停在开始页。 */
export function init() {
  if (S.inited) return { ok: true };
  S.inited = true;

  if (typeof document === 'undefined') return { ok: false, reason: 'no-dom' };

  buildUi();
  wireEvents();
  show('start');

  return { ok: true, screen: S.screen };
}

/**
 * 切换屏幕。
 * @param {'start'|'calibrate'|'game'|'result'} name
 */
export function show(name) {
  if (!SCREENS.includes(name) || !S.sections[name]) return;
  if (S.screen === name) return;

  const previous = S.screen;
  S.screen = name;

  for (const [key, section] of Object.entries(S.sections)) {
    section.hidden = key !== name;
  }
  document.documentElement.dataset.t6Screen = name;

  // 切屏通清：上一屏的定时器、一次性声源、焦点陷阱、按键闸门
  clearTimers();
  stopTempSources();
  releaseTrap();
  installKeyGate(name !== 'game');

  if (name === 'start') enterStart(previous);
  if (name === 'calibrate') enterCalibrate();
  if (name === 'game') enterGame();
  if (name === 'result') enterResult();

  focusScreen(name);
}

/**
 * 更新顶部状态行（场景名 + 已用时）。
 * 公开出来是为了让测试页能不跑完整局就检查这一行。
 */
export function setStatus(text) {
  const el = S.els.gameStatus;
  if (!el) return;
  el.textContent = String(text || '');
  S.lastStatusAt = now();
}

/**
 * 显示结算页。
 * @param {Partial<{elapsed:number, tasksDone:number, tasksTotal:number,
 *   caneProbes:number, hints:number, asrFailures:number, completed:boolean}>} payload
 */
export function showResult(payload = {}) {
  if (S.screen === 'result' && S.ended) return;
  S.ended = true;
  S.result = mergeStats(payload || {});
  show('result');
}

/** 调试快照：现场出问题时 `__screens.debug()` 一眼看出卡在哪一屏。 */
export function debugState() {
  return {
    screen: S.screen,
    sceneTitle: S.sceneTitle,
    audioReady: S.audioReady,
    panelOpen: S.panelOpen,
    calibration: { ...S.cal },
    stats: { ...S.stats },
    result: S.result,
    countedTimers: S.timers.size,
    liveTempSources: S.tempSources.size,
    a11y: a11y.debugState()
  };
}

/* ------------------------------------------------------------
 * 结构
 * ---------------------------------------------------------- */

/**
 * 建 DOM。
 *
 * 用 innerHTML 铺静态骨架（没有任何变量插进去，所以不存在注入问题），
 * 之后所有会变的内容一律走 textContent —— 台词、场景名来自数据文件，
 * 不该有"某天场景标题里带个标签就把页面搞坏"的可能。
 */
function buildUi() {
  const app = document.getElementById('app') || document.body;

  const style = document.createElement('style');
  style.id = 't6-style';
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 't6-root';
  root.innerHTML = TEMPLATE;
  app.appendChild(root);

  for (const section of root.querySelectorAll('.t6-screen')) {
    S.sections[section.dataset.screen] = section;
  }

  const byId = (id) => root.querySelector('#' + id);
  S.els = {
    // 开始页
    earLeft: byId('t6-ear-left'),
    earRight: byId('t6-ear-right'),
    earAnswer: byId('t6-ear-answer'),
    earMsg: byId('t6-ear-msg'),
    startBtn: byId('t6-start-btn'),

    // 校准页
    calProgress: byId('t6-cal-progress'),
    calTime: byId('t6-cal-time'),
    calPlay: byId('t6-cal-play'),
    calNext: byId('t6-cal-next'),
    calFinish: byId('t6-cal-finish'),
    calMsg: byId('t6-cal-msg'),

    // 游戏中
    gameStatus: byId('t6-game-status'),
    panelToggle: byId('t6-panel-toggle'),
    panelBody: byId('t6-panel-body'),
    panelCmds: byId('t6-cmds'),
    talkBtn: byId('t6-talk'),
    typeForm: byId('t6-type-form'),
    typeInput: byId('t6-type'),
    endBtn: byId('t6-end'),

    // 结算页
    resLine: byId('t6-res-line'),
    resStats: byId('t6-res-stats'),
    againBtn: byId('t6-again'),
    homeBtn: byId('t6-home')
  };
}

/* ------------------------------------------------------------
 * 事件接线
 * ---------------------------------------------------------- */

function wireEvents() {
  const E = S.els;

  /* —— 开始页 —— */
  E.earLeft.addEventListener('click', () => playEar('left'));
  E.earRight.addEventListener('click', () => playEar('right'));
  E.earAnswer.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-answer]');
    if (btn) onEarAnswer(btn.dataset.answer);
  });
  E.startBtn.addEventListener('click', () => {
    // 这一下同时承担解锁 AudioContext 的职责（浏览器策略要求真实手势）
    if (!ensureAudio()) {
      announce('这台设备放不出声音，将进入无声模式。');
    }
    show('calibrate');
  });

  /* —— 校准页 —— */
  E.calPlay.addEventListener('click', () => playCalStep());
  E.calNext.addEventListener('click', () => onCalNext());
  E.calFinish.addEventListener('click', () => show('game'));

  /* —— 游戏中 —— */
  E.panelToggle.addEventListener('click', () => setPanelOpen(!S.panelOpen));
  E.panelCmds.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cmd]');
    if (btn) sendCommand(btn.dataset.cmd, 'button');
  });
  E.typeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = E.typeInput.value.trim();
    if (!text) return;
    sendCommand(text, 'text');
    E.typeInput.value = '';
    // 提交后立刻把焦点还给游戏屏。
    // 不还的话焦点留在输入框里，之后按 W 只会往框里打字、人不走 ——
    // 而屏幕全黑，玩家完全看不出为什么"按 W 没反应"。
    E.typeInput.blur();
    focusScreen('game');
    announce('已发送。可以继续用 W 行走。');
  });

  // ---- 输入框的按键处理 ----
  //
  // 背景：player.js 把 keydown 挂在 window 上，所以焦点在输入框里时，
  // 打字用的 W/A/S/D 会让玩家真的走起来（"往前走"的拼音里含 w）。
  // 因此在输入框上截断传播是必要的。
  //
  // 但只截不断会造成死锁：焦点一旦落进输入框，W 就只会往框里打字，
  // 人站着不动 —— 而屏幕全黑，玩家完全看不出为什么"按 W 没反应"。
  //
  // 所以这里是【一个】处理器，同时负责填充与放行：
  //   · Esc            → 退出输入，不结束本局
  //   · 空框 + 方向键/空格 → 直接退出输入并放行（这些键永远不用于拼音）
  //   · 空框 + 字母键   → 给一声提示音，告诉玩家"你在输入模式"
  //   · 其余情况        → 照常拦下，不影响打字
  //
  // 注意必须写在同一个监听器里：如果分成两个，先注册的那个
  // 会先把事件截断，"放行"就永远不生效。
  const MOVEMENT_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'
  ]);
  let lastTrappedHintAt = 0;

  E.typeInput.addEventListener('keydown', (e) => {
    // Esc：退出输入
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      E.typeInput.blur();
      focusScreen('game');
      announce('已退出输入。可以继续用 W 行走。');
      return;
    }

    const empty = E.typeInput.value.trim() === '';

    if (empty && MOVEMENT_KEYS.has(e.code)) {
      // 方向键与空格不参与拼音输入，可以直接当行走键
      if (!e.code.startsWith('Key')) {
        E.typeInput.blur();
        focusScreen('game');
        return;                     // 放行，player.js 能收到
      }
      // 字母键：不抢走拼音首字母，但要告诉玩家发生了什么
      const now = Date.now();
      if (now - lastTrappedHintAt > 2500) {
        lastTrappedHintAt = now;
        try { audio.playSfx('hint', { gain: 0.35 }); } catch (_) {}
        announce('正在输入文字。按 Esc 退出输入，就可以继续行走。');
      }
    }

    // 其余一律拦下，避免打字时人物乱走
    e.stopPropagation();
  });

  // keyup 不需要判断，一律拦下：keydown 已经决定过要不要放行了，
  // 若这里放行会造成"按下没走、松开却清了输入"的半状态。
  E.typeInput.addEventListener('keyup', (e) => e.stopPropagation());

  // 3) 点黑屏任意处（面板之外）也退出输入
  S.sections.game?.addEventListener('pointerdown', (e) => {
    if (e.target === E.typeInput) return;
    if (E.typeInput === document.activeElement) {
      E.typeInput.blur();
      focusScreen('game');
    }
  });

  // 按住说话：手机上不可能按 T 键，语音入口必须有一个可以按住的按钮
  E.talkBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    E.talkBtn.dataset.pressed = '1';
    const ok = input.startListening();
    if (ok) announce('正在听。');
  });
  for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
    E.talkBtn.addEventListener(evt, () => {
      if (E.talkBtn.dataset.pressed !== '1') return;
      delete E.talkBtn.dataset.pressed;
      input.stopListening();
    });
  }

  E.endBtn.addEventListener('click', () => finishSession());

  /* —— 结算页 —— */
  E.againBtn.addEventListener('click', () => show('game'));
  E.homeBtn.addEventListener('click', () => show('start'));

  /* —— 键盘（游戏内数字键与 Esc） —— */
  window.addEventListener('keydown', onGlobalKeyDown);

  /* —— 总线 —— */
  bus.on(EVENTS.SCENE_LOADED, (p) => {
    S.sceneTitle = (p && p.title) || '';
    updateStatus();
  });

  bus.on(EVENTS.TASK_DONE, () => {
    S.stats.tasksDone += 1;
    const total = S.stats.tasksTotal ? ` / ${S.stats.tasksTotal}` : '';
    announce(`任务完成 ${S.stats.tasksDone}${total}`);
    updateStatus();
  });

  bus.on(EVENTS.ASSIST, () => {
    S.stats.hints += 1;
  });

  bus.on(EVENTS.CANE_PROBE, (p) => {
    S.stats.caneProbes += 1;
    if (S.screen === 'game') announceProbe(p);
  });

  bus.on(EVENTS.SURFACE_CHANGED, (p) => {
    if (S.screen !== 'game' || !p) return;
    const label = SURFACE_LABELS[p.type] || p.type;
    announce(`路面：${label}。`);
  });

  bus.on(EVENTS.DEGRADE_ON, () => {
    S.stats.asrFailures += 1;
    // 语音不可用就等于失去主通道：面板必须自己出来，
    // 不能让玩家在黑屏上摸索"该怎么操作"。
    if (S.screen === 'game') {
      setPanelOpen(true);
      announce('语音识别已降级。可以使用指令面板或打字。', { urgent: true });
    }
  });

  bus.on(EVENTS.SESSION_END, (p) => {
    if (S.screen === 'game' || S.screen === 'result') showResult(p || {});
  });

  bus.on(EVENTS.PLAYER_MOVED, () => {
    if (S.screen === 'game') updateStatus();
  });
}

/* ------------------------------------------------------------
 * 开始页
 * ---------------------------------------------------------- */

function enterStart(previous) {
  safeStopAll();
  S.stats = emptyStats();
  S.ended = false;
  S.result = null;
  S.cal.index = 0;
  S.cal.finished = false;

  if (S.els.earMsg) S.els.earMsg.textContent = '';
  if (S.els.earAnswer) S.els.earAnswer.hidden = true;

  // 从结算页回来时说明一下"进度不会保留"，否则玩家会以为点错了
  if (previous === 'result') {
    announce('回到开始页。已经结束的这一局不会保留。');
  } else {
    announce(
      '开始页。屏幕全黑是设计的一部分。' +
      'W 前进，S 后退，A 左转，D 右转，空格敲杖，按住 T 说话。' +
      '先做耳机检查。'
    );
  }
}

function playEar(side) {
  const left = side === 'left';
  const ok = playAtBearing(left ? -EAR_BEARING : EAR_BEARING, 1.6, 1.2);

  if (!ok) {
    setText(S.els.earMsg, '放不出声音。检查系统音量、标签页是否被静音、以及耳机是否插好。');
    announce('放不出声音。请检查音量与耳机。');
    return;
  }

  S.els.earAnswer.hidden = false;
  setText(S.els.earMsg, left ? '刚才那一声来自左侧。' : '刚才那一声来自右侧。');
  announce(left ? '左侧，一声。' : '右侧，一声。');
}

function onEarAnswer(answer) {
  if (answer === 'both') {
    setText(S.els.earMsg, '好，两只耳朵都有声音。可以开始了。');
    announce('两只耳朵都有声音，可以开始了。');
    return;
  }

  if (answer === 'one') {
    setText(
      S.els.earMsg,
      '只听到一边：先检查耳机是否插到底、系统声道的左右平衡有没有被拉到一端。' +
      '只靠单声道也能玩，但方向判断会明显变差。'
    );
    announce('只听到一边。请检查耳机与左右声道平衡。');
    return;
  }

  setText(
    S.els.earMsg,
    '没有听到声音：检查系统音量、浏览器标签是否静音、以及输出设备有没有切到别的耳机。' +
    '可以先继续，但这一局会没有声音。'
  );
  announce('没有听到声音。请检查音量与输出设备。');
}

/* ------------------------------------------------------------
 * 校准页
 * ---------------------------------------------------------- */

function enterCalibrate() {
  safeStopAll();
  S.cal.index = 0;
  S.cal.remain = CAL_SECONDS;
  S.cal.finished = false;

  S.els.calPlay.hidden = false;
  S.els.calNext.hidden = false;
  S.els.calFinish.hidden = true;
  S.els.calTime.hidden = true;

  if (!ensureAudio()) {
    // 没有声音就没有"方位"可校准。不假装能校准，直接放行并说明后果。
    S.els.calPlay.hidden = true;
    S.els.calNext.hidden = true;
    S.els.calFinish.hidden = false;
    setText(S.els.calProgress, '这台设备放不出声音。');
    setText(
      S.els.calMsg,
      '浏览器不支持 Web Audio，或者音频被系统静音了。' +
      '校准要先能听见声音，所以这一步跳过；这一局将没有声音。'
    );
    announce('这台设备放不出声音，校准已跳过。');
    return;
  }

  renderCalStep();
  startCountdown();
  playCalStep();   // 进来就播第一声，省掉一次"还要再点一下"的困惑

  announce('方位校准。左、前、右各响一次，每次听清之后点下一步。');
}

function renderCalStep() {
  const step = CAL_STEPS[S.cal.index];
  if (!step) return;

  const last = S.cal.index === CAL_STEPS.length - 1;
  setText(S.els.calProgress, `第 ${S.cal.index + 1} / ${CAL_STEPS.length} 步 · ${step.label}`);
  setText(S.els.calNext, last ? '听清了，完成校准' : '听清了，下一步');
}

function startCountdown() {
  S.els.calTime.hidden = false;
  tickCountdown();
}

function tickCountdown() {
  const left = Math.max(0, S.cal.remain);
  if (left > 0) {
    setText(S.els.calTime, `校准大约还需要 ${left} 秒`);
    after(1000, () => {
      S.cal.remain -= 1;
      tickCountdown();
    });
    return;
  }
  setText(S.els.calTime, '校准时间已到，可以继续；想多听几遍也随时可以。');
}

function playCalStep() {
  const step = CAL_STEPS[S.cal.index];
  if (!step) return;

  const ok = playAtBearing(step.bearing, CAL_DISTANCE, 1.2);
  if (!ok) {
    setText(S.els.calMsg, '放不出声音。检查音量，或直接进入校园（这一局会没有声音）。');
    announce('放不出声音。');
    return;
  }

  setText(S.els.calMsg, `现在应该从${step.label}传来一声。听不清就点「再听一次」。`);
  announce(`${step.label}，一声。`);
}

function onCalNext() {
  const finished = CAL_STEPS[S.cal.index];
  announce(finished ? `已确认${finished.label}。` : '已确认。');

  S.cal.index += 1;

  if (S.cal.index >= CAL_STEPS.length) {
    S.cal.finished = true;
    stopTempSources();
    S.els.calPlay.hidden = true;
    S.els.calNext.hidden = true;
    S.els.calTime.hidden = true;
    S.els.calFinish.hidden = false;
    S.els.calFinish.focus();

    setText(S.els.calProgress, '三步都听完了。');
    setText(S.els.calMsg, '记住这个感觉：左、前、右的差别就是你在校园里唯一的方位信息。');
    announce('校准完成。按「进入校园」开始这一局。');
    return;
  }

  renderCalStep();
  playCalStep();
}

/* ------------------------------------------------------------
 * 游戏中
 * ---------------------------------------------------------- */

function enterGame() {
  S.stats = emptyStats();
  S.ended = false;
  S.result = null;
  S.startedAt = now();
  S.lastStatusAt = 0;

  const current = scene.getCurrent();
  S.stats.tasksTotal = current && Array.isArray(current.tasks) ? current.tasks.length : 0;
  S.sceneTitle = (current && current.title) || S.sceneTitle;

  safeStopAll();

  // 回到起点。init() 是幂等的（T2 内部有 inited 守卫），
  // 所以这里重复调用是安全的：它只保证"键盘绑好了"。
  player.init();
  player.teleport();
  audio.setListener(player.getState());

  setPanelOpen(false);
  updateStatus();

  emit(EVENTS.SESSION_START, { sceneId: (current && current.id) || null });
  speakIntro();

  // 焦点陷阱要在这一屏生效：屏幕全黑，焦点一旦跑到浏览器工具栏，
  // 玩家没有视觉可以把它找回来。
  const section = S.sections.game;
  if (section) S.releaseTrap = a11y.trapFocus(section);

  announce(
    `游戏开始。场景：${S.sceneTitle || '未载入'}。` +
    '屏幕是黑的。用 W 前进，空格敲杖，按住 T 说话。'
  );
}

/**
 * 开场旁白。
 *
 * 台词已经在构建期合成好了（T5），这里只负责按顺序播。
 * 先 preload 再播：没加载过的 id 会走进"缺文件"回退分支，
 * 对着一个其实存在的文件播"语音资源缺失"，比不播更糟。
 */
async function speakIntro() {
  if (!S.audioReady) return;
  const ids = ['L_INTRO_01', 'L_INTRO_02', 'L_INTRO_03'];

  let r;
  try {
    r = await voice.preload(ids);
  } catch (err) {
    console.warn('[T6] 开场旁白预加载失败：', err);
    return;
  }

  if (S.screen !== 'game') return;   // 加载期间玩家可能已经退出去了
  for (const id of ids) {
    if (r.loaded.includes(id)) safeSpeak(id, { priority: voice.PRIORITY.NARRATION });
  }
}

function updateStatus() {
  if (S.screen !== 'game') {
    // 不在游戏屏也允许更新（场景刚载入时会走到这里），只是别启动节流计时
    writeStatus();
    return;
  }
  if (now() - S.lastStatusAt < 1000) return;   // 每帧都写 DOM 没必要，1 Hz 够了
  S.lastStatusAt = now();
  writeStatus();
}

function writeStatus() {
  const el = S.els.gameStatus;
  if (!el) return;

  const elapsed = S.startedAt ? Math.max(0, (now() - S.startedAt) / 1000) : 0;
  const title = S.sceneTitle || '未载入场景';
  el.textContent = `${title} · 已用时 ${formatTime(elapsed)}`;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/* —— 指令面板 —— */

function setPanelOpen(open) {
  const next = !!open;
  const changed = next !== S.panelOpen;
  S.panelOpen = next;

  const body = S.els.panelBody;
  const toggle = S.els.panelToggle;
  if (!body || !toggle) return;

  body.hidden = !next;
  toggle.setAttribute('aria-expanded', String(next));
  toggle.textContent = next ? '收起指令面板' : '指令面板';

  // 只在"真的展开了"时播报：进入游戏时的复位不该念一遍。
  if (next && changed) {
    announce(
      '指令面板已展开。数字键：1 前进，2 向左，3 向右，4 读牌。' +
      '也可以按住说话，或者直接打字。'
    );
  }
}

function sendCommand(text, source) {
  if (S.screen !== 'game') return null;
  if (!text) return null;

  const result = input.submit(String(text), source || 'button');
  const intent = result && result.intent;
  const label = intent && INTENT_LABELS[intent.name];

  if (result && result.state === 'execute' && label) {
    announce(label);
  } else if (result && result.state === 'confirm') {
    // 播放层已经在问「你是说…吗」，这里只补一句给屏幕阅读器
    announce(`${label || '这句话'}，需要确认。`);
  } else if (result && result.state === 'reject') {
    announce('没听清。');
  }

  return result;
}

/* —— 键盘 —— */

function onGlobalKeyDown(e) {
  if (e.defaultPrevented) return;
  if (isEditable(e.target)) return;      // 正在输入框里打字，不抢键
  if (S.screen !== 'game') return;

  // Esc 结束本局：现场调试与"不想玩了"都需要一个不依赖鼠标的出口
  if (e.key === 'Escape') {
    e.preventDefault();
    finishSession();
    return;
  }

  const cmd = PANEL_COMMANDS.find((c) => c.key === e.key);
  if (cmd) {
    e.preventDefault();
    sendCommand(cmd.text, 'button');
  }
}

/* ------------------------------------------------------------
 * 结算页
 * ---------------------------------------------------------- */

function enterResult() {
  const r = S.result || mergeStats({});

  fillResult(r);

  // 顺序是有意的：先把界面做完（播报 + 焦点），最后才去播台词。
  // 播不出声音最多少一句话；但界面没收尾，玩家会卡在结算页上出不去 ——
  // 一个坏掉的 AudioNode 不该让键盘用户无法开始下一局。
  announce(summaryText(r), { urgent: true });
  if (S.els.againBtn) S.els.againBtn.focus();

  // 收尾提示：这一句已经在 assets/voice 里（S_END），不必新增台词
  safeSpeak('S_END', { priority: voice.PRIORITY.NARRATION });
}

function fillResult(r) {
  const done = r.tasksTotal > 0 ? `${r.tasksDone} / ${r.tasksTotal}` : `${r.tasksDone}`;

  setText(
    S.els.resLine,
    r.completed
      ? '你走到了教学楼门口。这一局，走完了。'
      : '这一局在这里结束。没走完也没关系 —— 换一局再来。'
  );

  const rows = [
    ['用时', formatTime(r.elapsed)],
    ['完成任务', done],
    ['敲杖次数', String(r.caneProbes)],
    ['被提示次数', String(r.hints)],
    ['语音识别失败', String(r.asrFailures)]
  ];

  const dl = S.els.resStats;
  dl.textContent = '';
  for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
}

function summaryText(r) {
  const done = r.tasksTotal > 0 ? `完成任务 ${r.tasksDone} 个，共 ${r.tasksTotal} 个` : `完成任务 ${r.tasksDone} 个`;
  return `本局结束。用时 ${formatTime(r.elapsed)}，${done}，` +
         `敲杖 ${r.caneProbes} 次，被提示 ${r.hints} 次，语音识别失败 ${r.asrFailures} 次。`;
}

/**
 * 结束本局。
 *
 * 交给 T7 的 session.end() 收尾；它目前是空桩，所以这里再做一次兜底 emit。
 * 两条路径都由 S.ended 合并 —— 不会结算两次，也不会因为 T7 还没实现就卡在游戏屏。
 */
function finishSession() {
  if (S.screen !== 'game' || S.ended) return;

  try {
    session.end();
  } catch (err) {
    console.warn('[T6] session.end() 出错：', err);
  }

  if (S.ended) return;
  emit(EVENTS.SESSION_END, { ...collectLocalStats(), completed: false });
}

function collectLocalStats() {
  return {
    elapsed: S.startedAt ? (now() - S.startedAt) / 1000 : 0,
    tasksDone: S.stats.tasksDone,
    tasksTotal: S.stats.tasksTotal,
    caneProbes: S.stats.caneProbes,
    hints: S.stats.hints,
    asrFailures: S.stats.asrFailures
  };
}

/**
 * 合并结算数据。
 *
 * 优先级：本次事件的载荷 > T7 的 session.getStats() > 本模块自算的兜底值。
 * 之所以要"大于 0 才采用"，是因为 session.js 现在是桩文件，
 * 它返回的 0 是"没数据"而不是"真的是 0 次"。
 */
function mergeStats(payload) {
  let t7 = {};
  try {
    t7 = session.getStats() || {};
  } catch (_) {
    t7 = {};
  }

  const positive = (...candidates) => {
    for (const v of candidates) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return 0;
  };

  const elapsed = positive(payload.elapsed, t7.elapsed) || collectLocalStats().elapsed;

  return {
    elapsed,
    tasksDone: positive(payload.tasksDone, t7.tasksDone, S.stats.tasksDone),
    tasksTotal: positive(payload.tasksTotal, t7.tasksTotal, S.stats.tasksTotal),
    caneProbes: positive(payload.caneProbes, t7.caneProbes, S.stats.caneProbes),
    hints: positive(payload.hints, t7.hints, S.stats.hints),
    asrFailures: positive(payload.asrFailures, t7.asrFailures, S.stats.asrFailures),
    completed: Boolean(payload.completed || t7.completed)
  };
}

/* ------------------------------------------------------------
 * 声音
 * ---------------------------------------------------------- */

/**
 * 确保音频就绪，并把 AudioContext 交给台词模块复用。
 *
 * 多建一个 AudioContext 会让声音无法统一混合，而且浏览器对同时存在的数量
 * 有限制（通常 6 个）—— 这件事 T1/T5 的文件里各写过一次，这里再复用一次。
 */
function ensureAudio() {
  if (S.audioReady) return true;

  const r = audio.init();
  if (!r || !r.ok) {
    S.audioReady = false;
    console.warn('[T6] 音频不可用：', r && r.reason);
    return false;
  }

  S.audioReady = true;
  const ctx = audio.getContext();
  if (ctx) voice.attachContext(ctx);
  return true;
}

/**
 * 在"相对玩家朝向的某个方位"上播一声。
 *
 * 为什么每次都要先 setListener：听者状态由 main.js 的循环每帧更新，
 * 但校准页可能在循环还没跑起来时就用（比如场景没载入）。
 * 听者朝向差一次，"左"就变成了"斜后方"。
 *
 * @param {number} bearingDeg 相对朝向的角度，负=左，正=右
 * @param {number} distance 米
 * @param {number} gain
 * @returns {boolean} 是否真的放出了声
 */
function playAtBearing(bearingDeg, distance, gain = 1) {
  if (!ensureAudio()) return false;

  const p = player.getState();
  const fwd = headingToVec(p.heading + bearingDeg);
  const pos = { x: p.x + fwd.x * distance, z: p.z + fwd.z * distance };

  audio.setListener({ x: p.x, z: p.z, heading: p.heading });

  const id = audio.createSource({ pos, audio: 'hint', gain });
  if (!id) return false;

  // 素材只有几百毫秒，但声源会一直挂在 engine 的 sources 里
  // （stopSource 是唯一的出口）。不主动收就会越攒越多。
  S.tempSources.add(id);
  after(1600, () => stopTemp(id));
  return true;
}

function stopTemp(id) {
  S.tempSources.delete(id);
  try {
    audio.stopSource(id);
  } catch (_) {}
}

function stopTempSources() {
  for (const id of Array.from(S.tempSources)) stopTemp(id);
  S.tempSources.clear();
}

/* ------------------------------------------------------------
 * 工具
 * ---------------------------------------------------------- */

function now() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function setText(el, text) {
  if (el) el.textContent = String(text == null ? '' : text);
}

/** 登记一个到点就清掉的定时器（切屏时统一清空） */
function after(ms, fn) {
  const id = setTimeout(() => {
    S.timers.delete(id);
    try {
      fn();
    } catch (err) {
      console.warn('[T6] 定时任务出错：', err);
    }
  }, ms);
  S.timers.add(id);
  return id;
}

function clearTimers() {
  for (const id of Array.from(S.timers)) clearTimeout(id);
  S.timers.clear();
}

function releaseTrap() {
  if (typeof S.releaseTrap === 'function') S.releaseTrap();
  S.releaseTrap = null;
}

function isEditable(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

function isInteractive(el) {
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('button, a[href], summary, input, select, textarea, [role="button"], [tabindex]');
}

/**
 * 装/拆非游戏屏的按键闸门（见 GATED_CODES 的说明）。
 * @param {boolean} on
 */
function installKeyGate(on) {
  if (on && !S.gate) {
    const gate = (e) => {
      if (!GATED_CODES.has(e.code)) return;
      if (isEditable(e.target)) return;
      // 空格要留给"激活焦点按钮"。截在捕获阶段会让按钮收不到 keydown，
      // 键盘用户就点不动开始按钮了 —— 所以焦点在可交互元素上时不拦空格。
      if (e.code === 'Space' && isInteractive(e.target)) return;
      e.stopPropagation();
    };
    window.addEventListener('keydown', gate, true);
    window.addEventListener('keyup', gate, true);
    S.gate = gate;
    return;
  }

  if (!on && S.gate) {
    window.removeEventListener('keydown', S.gate, true);
    window.removeEventListener('keyup', S.gate, true);
    S.gate = null;
  }
}

/** 切屏后把焦点送到新屏幕的标题上（屏幕阅读器从第一句读起） */
function focusScreen(name) {
  const section = S.sections[name];
  if (!section) return;

  // 焦点已经落在本屏内就别抢：屏幕自己安排了更好的落点
  // （结算页故意把焦点放在「再来一局」上 —— 那是玩家下一步要按的键）。
  if (section.contains(document.activeElement)) return;

  // 游戏屏没有标题（全黑，只有状态行与面板），退回到屏本身：
  // 它带 aria-label，屏幕阅读器会读出"游戏中"。
  const heading = section.querySelector('h1, h2');
  a11y.focusOn(heading || section);
}

function announce(text, opts) {
  try {
    a11y.announce(text, opts);
  } catch (err) {
    console.warn('[T6] 播报失败：', err);
  }
}

/* —— 台词的"防守式"调用 ——
 *
 * 为什么每一步都要包 try/catch：T5 的 voice.js 目前有一个真实缺陷（已报给队长）——
 * attachContext() 换掉 AudioContext 之后没有重建 master 增益节点，
 * 于是 speak() 里 source.connect(master) 会抛
 *   InvalidAccessError: cannot connect to an AudioNode belonging to a different audio context
 *
 * 一处播报失败不该连累界面：这几句台词是锦上添花，键盘流程与结算页才是主线。
 * 所以这里吞掉异常并只告警一次，等 T5 修好后无需改动本文件。
 */
let voiceWarned = false;

function warnVoiceOnce(err) {
  if (voiceWarned) return;
  voiceWarned = true;
  console.warn('[T6] 台词播放失败（疑似 T5 的 AudioContext 复用问题，已跳过本句）：', err && err.message);
}

function safeSpeak(lineId, opts) {
  try {
    return voice.speak(lineId, opts);
  } catch (err) {
    warnVoiceOnce(err);
    return false;
  }
}

function safeStopAll() {
  try {
    voice.stopAll();
  } catch (err) {
    warnVoiceOnce(err);
  }
}

function announceProbe(p) {
  if (!p) return;
  if (!p.hit) {
    announce('前方是空的。');
    return;
  }
  const dir = p.bearing === 'left' ? '左前方' : p.bearing === 'right' ? '右前方' : '正前方';
  const band = CANE_BAND_LABELS[p.band] || '';
  announce(band ? `${dir}${band}有东西。` : `${dir}有东西。`);
}

/* ------------------------------------------------------------
 * 模板与样式
 * ---------------------------------------------------------- */

const TEMPLATE = `
<section class="t6-screen" data-screen="start" aria-labelledby="t6-title-start">
  <h1 id="t6-title-start" tabindex="-1">盲盒校园：暗夜探险</h1>
  <p class="t6-lead">屏幕一直是黑的。这不是故障 —— 你只有耳朵，和一张嘴。</p>

  <h2>怎么玩</h2>
  <ul class="t6-list">
    <li>戴上耳机。外放听不出方向，这一局等于白玩。</li>
    <li>走路：<kbd>W</kbd> 前进，<kbd>S</kbd> 后退，<kbd>A</kbd> 左转，<kbd>D</kbd> 右转。按住不放是连续走。</li>
    <li>敲杖：<kbd>空格</kbd>。回声里带着距离 —— 越远，回得越晚、拖得越长。</li>
    <li>说话：按住 <kbd>T</kbd>，说「往前走」「向左走」「帮我读一下前方告示牌」。听不清它会追问，不确定它会说不懂。</li>
    <li>听不准方向就<strong>原地转身再听</strong>。人耳分不出正前与正后（我们实测过），转身是唯一可靠的消歧办法。</li>
  </ul>

  <section class="t6-card" aria-labelledby="t6-title-ear">
    <h2 id="t6-title-ear">耳机检查</h2>
    <p>先确认两只耳朵都有声音：点「左耳」会从左边传来一声，点「右耳」会从右边传来一声。</p>
    <div class="t6-row">
      <button type="button" id="t6-ear-left">左耳</button>
      <button type="button" id="t6-ear-right">右耳</button>
    </div>
    <div class="t6-row" id="t6-ear-answer" hidden>
      <span class="t6-ask">两边都听到了吗？</span>
      <button type="button" data-answer="both">都听到了</button>
      <button type="button" data-answer="one">只有一边</button>
      <button type="button" data-answer="none">都没听到</button>
    </div>
    <p class="t6-note" id="t6-ear-msg"></p>
  </section>

  <div class="t6-row t6-actions">
    <button type="button" id="t6-start-btn" class="t6-primary">开始（会打开声音）</button>
  </div>
</section>

<section class="t6-screen" data-screen="calibrate" aria-labelledby="t6-title-cal" hidden>
  <h1 id="t6-title-cal" tabindex="-1">方位校准</h1>
  <p>接下来左、前、右各响一次。每次听清之后再点下一步；听不清就再来一次。</p>
  <p class="t6-note">这一步不能省：空间音频的个体差异很大（每只耳朵的形状都不一样），
    通用 HRTF 覆盖不了所有人，只能让玩家自己听一遍。</p>

  <p class="t6-progress" id="t6-cal-progress">第 1 / 3 步</p>
  <p class="t6-countdown" id="t6-cal-time"></p>

  <div class="t6-row">
    <button type="button" id="t6-cal-play">再听一次</button>
    <button type="button" id="t6-cal-next" class="t6-primary">听清了，下一步</button>
  </div>

  <p class="t6-note" id="t6-cal-msg"></p>
  <div class="t6-row t6-actions">
    <button type="button" id="t6-cal-finish" class="t6-primary" hidden>进入校园</button>
  </div>
</section>

<section class="t6-screen t6-game" data-screen="game" aria-label="游戏中" tabindex="-1" hidden>
  <p class="t6-status" id="t6-game-status"></p>

  <div class="t6-panel">
    <button type="button" id="t6-panel-toggle" aria-expanded="false" aria-controls="t6-panel-body">指令面板</button>

    <div class="t6-panel-body" id="t6-panel-body" hidden>
      <div class="t6-cmds" id="t6-cmds">
        <button type="button" data-cmd="往前走"><span class="t6-num">1</span>前进</button>
        <button type="button" data-cmd="向左走"><span class="t6-num">2</span>向左</button>
        <button type="button" data-cmd="向右走"><span class="t6-num">3</span>向右</button>
        <button type="button" data-cmd="帮我读一下前方告示牌"><span class="t6-num">4</span>读牌</button>
      </div>

      <button type="button" id="t6-talk" class="t6-talk">按住说话</button>

      <form class="t6-type" id="t6-type-form">
        <label for="t6-type">打字说一句</label>
        <input id="t6-type" name="t6-type" type="text" autocomplete="off"
               enterkeyhint="send" placeholder="例如：向左走" />
        <button type="submit">说</button>
      </form>

      <button type="button" id="t6-end" class="t6-quiet">结束本局（Esc）</button>
    </div>
  </div>
</section>

<section class="t6-screen" data-screen="result" aria-labelledby="t6-title-res" hidden>
  <h1 id="t6-title-res" tabindex="-1">这一局结束了</h1>
  <p id="t6-res-line"></p>
  <dl class="t6-stats" id="t6-res-stats"></dl>

  <div class="t6-row t6-actions">
    <button type="button" id="t6-again" class="t6-primary">再来一局</button>
    <button type="button" id="t6-home">回到开始页</button>
  </div>
</section>
`;

const CSS = `
.t6-root {
  --t6-fg: #e8e8ea;
  --t6-dim: #9a9aa2;
  --t6-line: #2a2a32;
  color: var(--t6-fg);
}
.t6-screen[hidden] { display: none; }
.t6-screen h1 { font-size: 26px; margin: 0 0 8px; line-height: 1.3; }
.t6-screen h2 { font-size: 18px; margin: 26px 0 8px; color: #cfcfd6; }
.t6-lead { color: #cfcfd6; margin: 0; }
.t6-list { margin: 8px 0 0; padding-left: 1.3em; }
.t6-list li { margin: 8px 0; }
.t6-card {
  margin-top: 26px; padding: 16px; border-radius: 12px;
  border: 1px solid var(--t6-line); background: #0c0c11;
}
.t6-card h2 { margin-top: 0; }
.t6-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin: 12px 0; }
.t6-actions { margin-top: 28px; }
.t6-ask { color: #cfcfd6; }
.t6-note { color: var(--t6-dim); font-size: 14px; margin: 10px 0 0; min-height: 1.2em; }
.t6-progress { font-size: 20px; margin: 24px 0 6px; }
.t6-countdown { color: var(--t6-dim); font-size: 14px; margin: 0; font-variant-numeric: tabular-nums; }

button {
  font: inherit; color: var(--t6-fg); background: #16161d;
  border: 1px solid #3a3a46; border-radius: 10px;
  padding: 10px 16px; min-height: 44px; cursor: pointer;
}
button:hover { background: #1d1d26; }
button:active { background: #23232e; }
.t6-primary { background: #1f4f8f; border-color: #2f6bc0; }
.t6-primary:hover { background: #245aa2; }
.t6-quiet { background: transparent; border-color: #33333d; color: var(--t6-dim); }

kbd {
  font: 13px/1 ui-monospace, "Cascadia Mono", Consolas, monospace;
  background: #1b1b22; border: 1px solid #33333d; border-bottom-width: 2px;
  border-radius: 5px; padding: 2px 6px; color: var(--t6-fg);
}

/* —— 游戏屏：除状态行与面板外不放任何东西 —— */
html[data-t6-screen="game"] #app { max-width: none; padding: 0; }
html[data-t6-screen="game"] body { overflow: hidden; }

.t6-status {
  position: fixed; top: 10px; left: 14px; margin: 0;
  font-size: 12px; line-height: 1.4; color: #8d8d96;
  font-variant-numeric: tabular-nums; pointer-events: none;
}
.t6-panel { position: fixed; right: 16px; bottom: 16px; text-align: right; }
.t6-panel > button {
  font-size: 14px; padding: 8px 12px;
  background: rgba(255, 255, 255, .06); border-color: #2f2f3a; color: #b9b9c2;
}
.t6-panel-body {
  margin-top: 8px; width: 268px; text-align: left;
  background: #08080c; border: 1px solid var(--t6-line);
  border-radius: 12px; padding: 12px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .6);
}
.t6-panel-body[hidden] { display: none; }
.t6-cmds { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.t6-cmds button { padding: 10px 8px; font-size: 14px; }
.t6-num { color: #7f7f8a; margin-right: 6px; font-variant-numeric: tabular-nums; }
.t6-talk { width: 100%; margin-top: 10px; font-size: 14px; border-color: #3d3d4a; }
.t6-type { display: grid; gap: 6px; margin: 10px 0 0; }
.t6-type label { font-size: 13px; color: var(--t6-dim); }
.t6-type input {
  font: inherit; color: var(--t6-fg); background: #14141b;
  border: 1px solid #33333d; border-radius: 8px; padding: 10px;
}
.t6-panel-body .t6-quiet { width: 100%; margin-top: 8px; font-size: 13px; }

/* —— 结算页 —— */
.t6-stats { display: grid; grid-template-columns: max-content 1fr; gap: 8px 20px; margin: 20px 0 0; }
.t6-stats dt { color: var(--t6-dim); }
.t6-stats dd { margin: 0; font-variant-numeric: tabular-nums; }
`;

/* ------------------------------------------------------------
 * 调试入口：现场排查时不必开 DevTools 也知道停在哪一屏
 * ---------------------------------------------------------- */

if (typeof window !== 'undefined') {
  window.__screens = { init, show, showResult, setStatus, debug: debugState };
}

export default { init, show, setStatus, showResult, debugState };
