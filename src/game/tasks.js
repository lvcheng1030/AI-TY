/**
 * T7 · 任务判定
 *
 * 负责人：T7（见 docs/tasks.md）
 * 你拥有：src/game/tasks.js、src/game/session.js
 *
 * 职责：把「玩家走到哪了」翻译成「哪个任务完成了」。
 * 不碰 DOM、不碰音频、不画界面 —— 这样判定能在 Node 里直接跑断言。
 *
 * 三类任务（字段定义见 content/schema.md）：
 *   reach  走进目标点半径
 *   read   读了指定告示牌
 *   avoid  绕过障碍后重新回到盲道（场景 1 的核心任务）
 *
 * 硬性要求：
 *   - 每个任务只允许完成一次。反复走进目标点不能重复发 task:done，
 *     否则台词会重复播报，玩家会以为游戏卡了。
 *   - 判定是纯函数（checkTask / nextAvoidPhase），状态机留在模块里。
 *   - 本模块不直接调用别人的模块发声：完成任务发 SPEAK 事件，
 *     由 T5 决定怎么播。
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS, INTENTS } from '../core/contracts.js';
import * as scene from '../world/scene.js';
import * as session from './session.js';

/** reach 未写 radius 时的默认半径（米） */
const DEFAULT_RADIUS = 3;

/** 离障碍物多近算「进入要绕行的语境」（米） */
const NEAR_OBSTACLE = 3;

/** 问「这附近有牌子吗」时，牌子离玩家多远以内算听得见（米） */
const READ_RADIUS = 4;

/** 当前场景的任务列表（原始 JSON 对象，字段见 content/schema.md） */
let taskList = [];

/** 已完成的任务 id */
const doneIds = new Set();

/** avoid 任务的状态机：taskId -> 'idle' | 'near' | 'off' | 'returned' */
const avoidPhase = new Map();

/** 最近一次位置。任务判定全用它，避免判定依赖 player 模块的内部状态 */
let lastPos = null;

let inited = false;
const offBus = [];

/* ------------------------- 纯函数 ------------------------- */

/**
 * 点到矩形的最短距离（米）。点在矩形内为 0。
 *
 * 碰撞求解用的是 T2 的 resolve()，这里只需要「离它多远」，
 * 所以自己算一份，避免为了一个距离把整个碰撞模块拖进判定里。
 *
 * @param {{x:number,z:number}} pos
 * @param {[number,number,number,number]} rect [x, z, 宽, 高]
 * @returns {number}
 */
export function distanceToRect(pos, rect) {
  const [x, z, w, h] = rect;
  const dx = Math.max(x - pos.x, 0, pos.x - (x + w));
  const dz = Math.max(z - pos.z, 0, pos.z - (z + h));
  return Math.hypot(dx, dz);
}

/**
 * 纯判定：这一帧是否满足完成条件。
 *
 * @param {Object} task 见 content/schema.md 的 tasks
 * @param {{x:number,z:number}} pos 玩家位置
 * @param {{readSignId?:string|null, avoidPhase?:string}} [world] 世界状态
 * @returns {boolean}
 */
export function checkTask(task, pos, world = {}) {
  if (!task || !pos) return false;

  switch (task.type) {
    case 'reach': {
      if (!Array.isArray(task.target) || task.target.length < 2) return false;
      const target = { x: task.target[0], z: task.target[1] };
      const r = typeof task.radius === 'number' ? task.radius : DEFAULT_RADIUS;
      return Math.hypot(pos.x - target.x, pos.z - target.z) <= r;
    }
    case 'read':
      return !!task.signId && world.readSignId === task.signId;
    case 'avoid':
      return world.avoidPhase === 'returned';
    default:
      return false;
  }
}

/**
 * avoid 任务的状态机：纯函数，输入上一帧的相位与本帧两个观测值。
 *
 *   idle → near      靠近了挡路的障碍物
 *   near → off       离开盲道（开始绕）
 *   off  → returned  重新回到盲道
 *
 * 「near → off」必须经过，是为了防止「一直站在盲道上没动」被判成完成；
 * 反过来，玩家没碰到障碍就提前绕出去再回来，也算他解决了这件事 ——
 * 判定该奖励正确行为，而不是奖励撞上去。
 *
 * @param {'idle'|'near'|'off'|'returned'} phase
 * @param {boolean} nearObstacle
 * @param {boolean} onTactile
 * @returns {'idle'|'near'|'off'|'returned'}
 */
export function nextAvoidPhase(phase, nearObstacle, onTactile) {
  if (phase === 'returned') return 'returned';
  if (phase === 'off') return onTactile ? 'returned' : 'off';
  if (phase === 'near') return onTactile ? 'near' : 'off';
  return nearObstacle ? 'near' : 'idle';
}

/* ------------------------- 内部 ------------------------- */

function currentTasks() {
  const cur = scene.getCurrent();
  return cur ? (cur.tasks || []) : [];
}

function obstacleById(id) {
  const cur = scene.getCurrent();
  if (!cur) return null;
  return (cur.obstacles || []).find(o => o.id === id) || null;
}

/** 场景换了或刚 init：重建任务表，并把状态机清干净 */
function rebuild() {
  taskList = currentTasks();

  const alive = new Set(taskList.map(t => t.id));
  for (const id of [...doneIds]) if (!alive.has(id)) doneIds.delete(id);
  for (const id of [...avoidPhase.keys()]) if (!alive.has(id)) avoidPhase.delete(id);
  for (const t of taskList) if (!avoidPhase.has(t.id)) avoidPhase.set(t.id, 'idle');

  const cur = scene.getCurrent();
  lastPos = cur ? { x: cur.start.x, z: cur.start.z } : null;
}

/** 任务完成：只发一次，然后按 schema 里的 line 请求播报 */
function complete(task) {
  if (doneIds.has(task.id)) return;
  doneIds.add(task.id);

  emit(EVENTS.TASK_DONE, { taskId: task.id, elapsed: session.getElapsed() });

  // line 是可选的。没有就静默完成 —— 不为了「有反馈」编一个不存在的台词 id。
  if (task.line) emit(EVENTS.SPEAK, { lineId: task.line, priority: 1 });
}

/** 每帧：玩家动了就重新看一遍未完成的任务 */
function onMove(payload) {
  if (!payload || typeof payload.x !== 'number') return;
  lastPos = { x: payload.x, z: payload.z };

  const onTactile = scene.onTactile(lastPos);

  for (const task of taskList) {
    if (doneIds.has(task.id)) continue;

    // 走路不构成「读牌」：readSignId 只在 onIntent 里给出
    let world = { readSignId: null, onTactile };

    if (task.type === 'avoid') {
      const obs = task.obstacleId ? obstacleById(task.obstacleId) : null;
      const near = obs ? distanceToRect(lastPos, obs.rect) <= NEAR_OBSTACLE : false;
      const phase = nextAvoidPhase(avoidPhase.get(task.id) || 'idle', near, onTactile);
      avoidPhase.set(task.id, phase);
      world = { readSignId: null, onTactile, avoidPhase: phase };
    }

    if (checkTask(task, lastPos, world)) complete(task);
  }
}

/**
 * 收到语音意图。
 *
 * 只有「读牌」会推进任务：其余指令都是移动/提问，
 * 不该凭空把 read 任务判完成。
 */
function onIntent(intent) {
  if (!intent || intent.name !== INTENTS.READ_SIGN || !lastPos) return;

  const sign = scene.nearestSign(lastPos, READ_RADIUS);
  if (!sign) return;

  for (const task of taskList) {
    if (doneIds.has(task.id) || task.type !== 'read') continue;
    const world = { readSignId: sign.id, onTactile: scene.onTactile(lastPos) };
    if (checkTask(task, lastPos, world)) complete(task);
  }
}

/* ------------------------- 对外接口 ------------------------- */

/** 绑定事件。重复调用安全（main.js 只调一次，测试会调很多次） */
export function init() {
  rebuild();
  if (inited) return getProgress();
  inited = true;

  // 场景是异步载入的（main.js 的 fetch 在 init 之后才回来），
  // 所以不能只在 init 里读一次任务表。
  offBus.push(bus.on(EVENTS.SCENE_LOADED, rebuild));

  // 单局开始 = 任务全部回到未完成。走事件而不是被 session 直接调用，
  // 是为了让两个模块只通过契约通信。
  offBus.push(bus.on(EVENTS.SESSION_START, () => reset()));

  offBus.push(bus.on(EVENTS.PLAYER_MOVED, onMove));
  offBus.push(bus.on(EVENTS.INTENT, onIntent));

  return getProgress();
}

/** 清空进度，用于重开一局或单测 */
export function reset() {
  doneIds.clear();
  avoidPhase.clear();

  // 保留玩家当前位置：重开一局时人还站在原地，
  // 把 lastPos 拽回起点会让「读牌」判定用错坐标。
  const keep = lastPos;
  rebuild();
  if (keep) lastPos = keep;
}

/** @returns {{done:number,total:number,ids:string[]}} */
export function getProgress() {
  return {
    done: doneIds.size,
    total: taskList.length,
    ids: taskList.map(t => t.id)
  };
}

/** 兼容桩文件里的统计接口（T6 结算页可能直接用） */
export function stats() {
  return { tasksDone: doneIds.size, tasksTotal: taskList.length };
}

/** 某个任务是否已完成（结算/调试用） */
export function isDone(taskId) {
  return doneIds.has(taskId);
}

/** 调试用：当前 avoid 状态机相位 */
export function getAvoidPhase(taskId) {
  return avoidPhase.get(taskId) || 'idle';
}

/** 取消订阅（测试与热重载用；正常一局结束不需要） */
export function dispose() {
  for (const off of offBus.splice(0)) off();
  inited = false;
}

export default {
  init, reset, getProgress, stats, isDone, getAvoidPhase, dispose,
  checkTask, nextAvoidPhase, distanceToRect
};
