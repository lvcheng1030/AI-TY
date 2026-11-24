/**
 * T7 · 单局生命周期与结算数据
 *
 * 负责人：T7（见 docs/tasks.md）
 * 你拥有：src/game/tasks.js、src/game/session.js
 *
 * 职责：一局从开始到结束的时间线，以及结算页要的那几个数字
 * （用时 / 完成任务 / 敲杖次数 / 被提示次数 / 语音失败次数）。
 *
 * 最容易出的 bug：重开一局时残留上一局的定时器与事件监听，
 * 导致第二局出现重复播报。这里的做法是【订阅只在 init 里做一次】，
 * 每局开始只重置计数器与起点时间 —— 没有「每局新挂监听」这回事，
 * 也就没有「忘了摘监听」这件事。
 *
 * 本模块不碰 DOM、不碰音频。结算页由 T6 监听 session:end 来画。
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS } from '../core/contracts.js';
import * as scene from '../world/scene.js';

/** 场景没写 duration 时的兜底上限（秒）。场景 1 单独跑的验收上限是 110 秒 */
const DEFAULT_LIMIT_SEC = 110;

/**
 * 终点任务完成后再等一会儿才结算（毫秒）。
 *
 * 不留这段延迟，结算页会抢在「你到了」那句台词之前出现 ——
 * 玩家刚走到门口就被切走，观感上像是被掐断。
 *
 * 但固定 1.2 秒又不够：到达台词本身约 3~4 秒（本机试运行实测被切掉）。
 * 所以改成「等这句放完再结算，最多等 4 秒」。
 */
const AUTO_END_MAX_MS = 5000;

/** 终点台词播完后，再留一点余量进结算页 */
const AUTO_END_AFTER_LINE_MS = 400;

/** 正在等的终点台词 id（到达时由任务里的 line 给出） */
let pendingEndLine = null;

/** 超时只温和提醒一次，不强制中断（任务卡明确要求） */
const TIMEOUT_LINE = 'S_TIMEOUT';

function defaultNow() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

let now = defaultNow;

let running = false;
let startedAt = 0;
let timeoutHinted = false;
let autoEndAt = null;

/** 本局计数 */
const counters = {
  caneProbes: 0,
  hints: 0,
  asrFailures: 0,
  tasksDone: 0
};

/** 本局完成的任务 id（判断「终点任务是否都完成了」用） */
const doneTaskIds = new Set();

/** 上一局的结算快照，end() 之后 getStats() 仍能读到 */
let lastStats = null;

let inited = false;
const offBus = [];

/* ------------------------- 内部 ------------------------- */

function tasksOfScene() {
  const cur = scene.getCurrent();
  return cur ? (cur.tasks || []) : [];
}

function timeLimitSec() {
  const cur = scene.getCurrent();
  const duration = cur && cur.json ? cur.json.duration : null;
  if (Array.isArray(duration) && typeof duration[1] === 'number') return duration[1];
  return DEFAULT_LIMIT_SEC;
}

function resetCounters() {
  counters.caneProbes = 0;
  counters.hints = 0;
  counters.asrFailures = 0;
  counters.tasksDone = 0;
  doneTaskIds.clear();
  timeoutHinted = false;
  autoEndAt = null;
  pendingEndLine = null;
}

function round1(sec) {
  return Math.round(sec * 10) / 10;
}

function snapshot() {
  const tasksTotal = tasksOfScene().length;
  const elapsed = running ? (now() - startedAt) / 1000 : (lastStats ? lastStats.elapsed : 0);

  return {
    elapsed: round1(elapsed),
    tasksDone: counters.tasksDone,
    tasksTotal,
    caneProbes: counters.caneProbes,
    hints: counters.hints,
    asrFailures: counters.asrFailures,
    completed: tasksTotal > 0 && counters.tasksDone >= tasksTotal
  };
}

/** 到达终点：所有 reach 任务都完成了，就安排一次自动结算 */
function maybeScheduleEnd(taskId) {
  doneTaskIds.add(taskId);

  const reaches = tasksOfScene().filter(t => t.type === 'reach');
  if (reaches.length === 0) return;
  if (!reaches.every(t => doneTaskIds.has(t.id))) return;

  // 记住到达台词：等它播完再结算，播不完就等满上限
  const lastReach = reaches[reaches.length - 1];
  pendingEndLine = lastReach.line || null;
  autoEndAt = now() + AUTO_END_MAX_MS;
}

/** 每帧检查超时与延迟结算。挂在 player:moved 上而不是自建定时器 */
function onTick() {
  if (!running) return;

  const elapsed = (now() - startedAt) / 1000;

  if (!timeoutHinted && elapsed >= timeLimitSec()) {
    timeoutHinted = true;
    // 温和提示：不结束、不惩罚，只是让 AI 说一句"还没到，慢慢来"
    emit(EVENTS.ASSIST, { lineId: TIMEOUT_LINE, reason: 'system' });
  }

  if (autoEndAt !== null && now() >= autoEndAt) {
    autoEndAt = null;
    end();
  }
}

function bind() {
  // T6 的开始页会自己 emit SESSION_START（它不知道 session.start() 的存在）。
  // 那个信号本身就表示「这一局开始了」：这里接住它开始计时，但不重复 emit。
  // 将来 T6 改成直接调 session.start() 也成立 —— 那时 running 已为 true，不会二次触发。
  offBus.push(bus.on(EVENTS.SESSION_START, () => {
    if (!running) begin();
  }));

  offBus.push(bus.on(EVENTS.TASK_DONE, (p) => {
    if (!running || !p || !p.taskId) return;
    // 同一个任务重复上报不重复计数：计数错了，结算页就在撒谎
    if (doneTaskIds.has(p.taskId)) return;
    counters.tasksDone += 1;
    maybeScheduleEnd(p.taskId);
  }));

  // 敲杖按「请求」计，不按「探测结果」计：
  // 一次按键可能因为音频未解锁而没有结果，但玩家确实敲了。
  offBus.push(bus.on(EVENTS.CANE_REQUEST, () => {
    if (running) counters.caneProbes += 1;
  }));

  // 只有玩家相关的提示算「被提示次数」。
  // system 类（比如超时）是游戏自己的旁白，不是玩家被纠正，不该计入。
  offBus.push(bus.on(EVENTS.ASSIST, (p) => {
    if (!running || !p) return;
    if (p.reason === 'deviation' || p.reason === 'obstacle') counters.hints += 1;
  }));

  offBus.push(bus.on(EVENTS.DEGRADE_ON, () => {
    if (running) counters.asrFailures += 1;
  }));

  offBus.push(bus.on(EVENTS.PLAYER_MOVED, onTick));

  // 到达台词一播完就提前结算，不必干等上限。
  // 只认 pendingEndLine，避免玩家中途的提示语把结算提前触发。
  offBus.push(bus.on(EVENTS.SPEAK_STARTED, (p) => {
    if (!running || !pendingEndLine || !p || p.lineId !== pendingEndLine) return;
    // 台词开始播了，重新起算上限：排队等待的时间不该算在它头上
    autoEndAt = now() + AUTO_END_MAX_MS;
  }));

  offBus.push(bus.on(EVENTS.SPEAK_ENDED, (p) => {
    if (!running || !pendingEndLine || !p || p.lineId !== pendingEndLine) return;
    pendingEndLine = null;
    autoEndAt = now() + AUTO_END_AFTER_LINE_MS;
  }));
}

/* ------------------------- 对外接口 ------------------------- */

/** 绑定事件。重复调用安全 */
export function init() {
  if (inited) return getStats();
  inited = true;
  bind();
  return getStats();
}

/** 真正开始计时。不发事件 —— 事件由调用方（人）或 start() 负责发 */
function begin() {
  resetCounters();
  lastStats = null;
  startedAt = now();
  running = true;
}

/**
 * 开始一局。
 *
 * 如果上一局还没结束，先静默清场再开新的 —— 不抛错，也不发 session:end，
 * 因为「重开」不是「上一局打完」。
 */
export function start() {
  if (running) reset();

  begin();

  const cur = scene.getCurrent();
  emit(EVENTS.SESSION_START, { sceneId: cur ? cur.id : null });
  return getStats();
}

/**
 * 结束一局并发结算数据。
 * @returns {Object|null} 见 contracts.js 的 SessionEnd；没在跑就返回上一次快照
 */
export function end() {
  if (!running) return lastStats;

  // 先取快照再改 running：snapshot() 用 running 判断「算实时用时还是读上一局」，
  // 顺序反了会把用时算成 0。
  const stats = snapshot();

  running = false;
  autoEndAt = null;

  lastStats = stats;
  emit(EVENTS.SESSION_END, stats);
  return stats;
}

/**
 * 清场重来。不播报、不发结算 —— 用于中途退出后干净地再来一局。
 */
export function reset() {
  running = false;
  startedAt = 0;
  autoEndAt = null;
  resetCounters();
  lastStats = null;
}

/** 当前用时（秒）。任务完成事件里要带它 */
export function getElapsed() {
  return round1(running ? (now() - startedAt) / 1000 : (lastStats ? lastStats.elapsed : 0));
}

/** 实时结算数据（结算页在 end 之前也可以读） */
export function getStats() {
  if (!running && lastStats) return lastStats;
  return snapshot();
}

export function isRunning() {
  return running;
}

/**
 * 测试用：替换时钟。
 * 传 null 恢复真实时钟。生产代码不要调用。
 */
export function __setClock(fn) {
  now = typeof fn === 'function' ? fn : defaultNow;
}

/** 取消订阅（测试与热重载用） */
export function dispose() {
  for (const off of offBus.splice(0)) off();
  inited = false;
  running = false;
}

export default { init, start, end, reset, getStats, getElapsed, isRunning, dispose };
