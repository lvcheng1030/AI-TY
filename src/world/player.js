/**
 * T2 · 玩家移动与朝向
 *
 * 负责人：T2（见 docs/tasks.md）
 *
 * 设计要点：
 *
 * 1. 【键盘永远可用】语音是叠加层，不是唯一入口。现场草坪噪音大，
 *    麦克风随时可能失效 —— 键盘是保命通道。
 *
 * 2. 【纯逻辑与副作用分离】integrate() 是纯函数，不碰 DOM、不发事件。
 *    这样"走 1.2 米需要多久""撞墙后停在哪"都能直接跑断言，
 *    不必启动浏览器、也不必等真实秒表。
 *
 * 3. 【键盘与语音汇入同一个输入状态】两条通道改的是同一组标志位，
 *    因此不会有"语音走一套逻辑、键盘走另一套"的偏差。
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS, SURFACES, INTENTS } from '../core/contracts.js';
import { headingToVec, normalize360, scale } from '../core/vec.js';
import * as scene from './scene.js';
import * as collision from './collision.js';

/* ------------------------- 可调参数 ------------------------- */

export const CONFIG = Object.freeze({
  WALK_SPEED: 1.2,      // 前进速度，米/秒（正常人步行约 1.2~1.4）
  BACK_SPEED: 0.6,      // 后退更慢，符合直觉，也让"走错要付代价"
  TURN_SPEED: 90,       // 转身速度，度/秒（转 90° 正好 1 秒）
  RADIUS: 0.35,         // 玩家碰撞半径，米
  DEVIATION_LIMIT: 1.5, // 偏离盲道多少米才提示
  DEVIATION_COOLDOWN: 6,// 两次偏离提示的最小间隔，秒
  BLOCKED_COOLDOWN: 1.2,// 两次碰撞提示的最小间隔，秒
  PULSE_MOVE: 1.5,      // 语音"往前走"持续多久
  PULSE_TURN: 1.0,      // 语音"左转"持续多久（90°/s × 1s = 90°）

  /**
   * 速度上限（米/秒）。超过它的一律当作传送，不算行走。
   * 正常步行 1.2、后退 0.6，所以 5 留了大量余量；
   * 而 teleport 会产生数十甚至上百的瞬时值，若不排除会让脚步声失控。
   */
  MAX_SPEED: 5
});

/* ------------------------- 内部状态 ------------------------- */

const state = {
  x: 0, z: 0, heading: 0,
  surface: SURFACES.CONCRETE
};

/** 输入标志位。键盘与语音都改这里。 */
const input = {
  forward: false, back: false,
  turnLeft: false, turnRight: false
};

/** 语音触发的限时输入：key -> 剩余秒数 */
const pulses = new Map();

let lastDeviationHint = -Infinity;
let lastBlockedHint = -Infinity;
let elapsed = 0;          // 单局累计秒数，用于冷却计时
let inited = false;
let detach = [];          // 键盘监听器的解绑函数

/* ------------------------- 纯函数核心 ------------------------- */

/**
 * 按输入推进一帧。**纯函数**：不读全局、不发事件、不碰 DOM。
 *
 * @param {{x:number,z:number,heading:number}} s 当前状态
 * @param {{forward:boolean,back:boolean,turnLeft:boolean,turnRight:boolean}} inp 输入
 * @param {number} dt 秒
 * @param {Object} [cfg] 覆盖 CONFIG
 * @returns {{x:number,z:number,heading:number}} 新状态
 */
export function integrate(s, inp, dt, cfg = CONFIG) {
  let heading = s.heading;

  // 转身：约定 0°=正北、顺时针为正，所以"向左转"是减小角度
  const turn = (inp.turnRight ? 1 : 0) - (inp.turnLeft ? 1 : 0);
  if (turn !== 0) heading = normalize360(heading + turn * cfg.TURN_SPEED * dt);

  // 位移：前后可同时按下时相互抵消（净位移为 0），符合直觉
  const fwd = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);
  let x = s.x;
  let z = s.z;
  if (fwd !== 0) {
    const speed = fwd > 0 ? cfg.WALK_SPEED : cfg.BACK_SPEED;
    const dir = headingToVec(heading);
    const step = scale(dir, fwd * speed * dt);
    x += step.x;
    z += step.z;
  }

  return { x, z, heading };
}

/* ------------------------- 每帧更新 ------------------------- */

/**
 * 由 main.js 的循环每帧调用。
 * @param {number} dt 秒
 */
export function update(dt) {
  elapsed += dt;

  // 1) 处理语音触发的限时输入
  for (const [key, remain] of pulses) {
    const left = remain - dt;
    if (left <= 0) {
      pulses.delete(key);
      input[key] = false;
    } else {
      pulses.set(key, left);
    }
  }

  // 2) 先算期望位置
  const prevX = state.x;
  const prevZ = state.z;
  const next = integrate(state, input, dt);

  // 3) 碰撞修正
  const fixed = collision.resolve(next, CONFIG.RADIUS);

  // 4) 只有实际发生了非期望的阻挡才提示（贴着墙走不该一直响）
  if (fixed.hit && blockedByMovement(next, fixed)) {
    if (elapsed - lastBlockedHint >= CONFIG.BLOCKED_COOLDOWN) {
      lastBlockedHint = elapsed;
      emit(EVENTS.PLAYER_BLOCKED, {
        obstacleId: fixed.obstacleId,
        x: fixed.x, z: fixed.z
      });
    }
  }

  state.x = fixed.x;
  state.z = fixed.z;
  state.heading = normalize360(next.heading);

  // 4.5) 计算真实速度，供脚步声定步频。
  //
  // 用【实际发生的位移】而不是输入意图：撞墙时输入仍是"前进"，
  // 但人没动，就不该有脚步声。这是"贴着墙走却没有脚步声"的正确表现。
  const moved = Math.hypot(state.x - prevX, state.z - prevZ);
  // 传送会算出巨大速度（上一帧还在原地），此时按静止处理
  const rawSpeed = dt > 0 ? moved / dt : 0;
  currentSpeed = rawSpeed > CONFIG.MAX_SPEED ? 0 : rawSpeed;

  // 5) 路面变化（只在变化时发，不是每帧）
  const s = scene.surfaceAt(state);
  if (s !== state.surface) {
    const previous = state.surface;
    state.surface = s;
    emit(EVENTS.SURFACE_CHANGED, { type: s, previous });
  }

  // 6) 偏离盲道提示
  checkDeviation();

  // 7) 位置广播（T1 的音频听者靠它同步）
  //
  // speed 由本模块自己算并带出去，而不是让调用方从位置反推：
  //   1. 这里知道确切的 dt 和位移，反推会引入噪声（dt 抖动）
  //   2. 传送（teleport）会造成巨大速度，只有本模块知道那是传送而非行走
  // T1 的脚步声依赖它决定步频 —— 之前漏了这个字段，导致脚步声一直不响。
  emit(EVENTS.PLAYER_MOVED, {
    x: state.x, z: state.z, heading: state.heading,
    surface: state.surface, speed: currentSpeed
  });
}

/** 当前实际移动速度（米/秒）。撞墙或静止时为 0。 */
let currentSpeed = 0;

/** 判定"是不是在走"的速度下限 —— 低于它不发出脚步声 */
export const WALK_SPEED_THRESHOLD = 0.05;

/** 判断这次阻挡是否由玩家主动移动造成（而不是被墙推着） */
function blockedByMovement(desired, fixed) {
  return Math.abs(desired.x - fixed.x) > 1e-6 || Math.abs(desired.z - fixed.z) > 1e-6;
}

function checkDeviation() {
  const dev = scene.deviationFromPath(state);
  if (!Number.isFinite(dev)) return;           // 场景里没有盲道，不提示
  if (dev <= CONFIG.DEVIATION_LIMIT) return;
  if (elapsed - lastDeviationHint < CONFIG.DEVIATION_COOLDOWN) return;

  lastDeviationHint = elapsed;
  emit(EVENTS.ASSIST, { lineId: 'S_DEVIATION', reason: 'deviation' });
}

/* ------------------------- 对外接口 ------------------------- */

/** 初始化：绑定键盘、订阅语音意图 */
export function init() {
  if (inited) return getState();
  inited = true;

  const current = scene.getCurrent();
  if (current) {
    state.x = current.start.x;
    state.z = current.start.z;
    state.heading = current.start.heading;
    state.surface = scene.surfaceAt(state);
    collision.loadObstacles(current.obstacles);
  }

  bindKeyboard();
  subscribeIntents();

  return getState();
}

/* 键盘映射。同时支持 WASD 与方向键：方向键对手小的玩家和部分键盘布局更友好。 */
const KEY_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'turnLeft', ArrowLeft: 'turnLeft',
  KeyD: 'turnRight', ArrowRight: 'turnRight'
};

function bindKeyboard() {
  if (typeof window === 'undefined') return;

  const onDown = (e) => {
    const key = KEY_MAP[e.code];
    if (key) {
      input[key] = true;
      pulses.delete(key);        // 手动按键优先，取消同方向的语音脉冲
      e.preventDefault();
      return;
    }
    // 空格 = 敲杖。这里只发"请求"，由 T1 的音频引擎负责发声与探测。
    if (e.code === 'Space') {
      e.preventDefault();
      emit(EVENTS.CANE_REQUEST, { x: state.x, z: state.z, heading: state.heading });
    }
  };

  const onUp = (e) => {
    const key = KEY_MAP[e.code];
    if (key) {
      input[key] = false;
      e.preventDefault();
    }
  };

  // 失焦时清空所有输入：否则切走窗口再回来，玩家会一直往前走
  const onBlur = () => {
    for (const k of Object.keys(input)) input[k] = false;
    pulses.clear();
  };

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  detach = [
    () => window.removeEventListener('keydown', onDown),
    () => window.removeEventListener('keyup', onUp),
    () => window.removeEventListener('blur', onBlur)
  ];
}

/** 把语音意图翻译成输入脉冲 */
function subscribeIntents() {
  bus.on(EVENTS.INTENT, (payload) => {
    if (!payload || typeof payload.name !== 'string') return;
    // 只在确定执行时响应。置信度不足的由 T4 负责追问，这里不动。
    if (typeof payload.confidence === 'number' &&
        payload.confidence < 0.85) return;

    switch (payload.name) {
      case INTENTS.MOVE_FORWARD:
        clearMovement(); pulse('forward', CONFIG.PULSE_MOVE); break;
      case INTENTS.MOVE_LEFT:
        clearTurn(); pulse('turnLeft', CONFIG.PULSE_TURN); break;
      case INTENTS.MOVE_RIGHT:
        clearTurn(); pulse('turnRight', CONFIG.PULSE_TURN); break;
      case INTENTS.TURN_LEFT:
        clearTurn(); pulse('turnLeft', CONFIG.PULSE_TURN); break;
      case INTENTS.TURN_RIGHT:
        clearTurn(); pulse('turnRight', CONFIG.PULSE_TURN); break;
      case INTENTS.STOP:
        clearMovement(); clearTurn(); pulses.clear(); break;
      default:
        break;   // read_sign / repeat / where_am_i 等不影响移动
    }
  });
}

function pulse(key, seconds) {
  input[key] = true;
  pulses.set(key, seconds);
}

function clearMovement() {
  input.forward = false; input.back = false;
  pulses.delete('forward'); pulses.delete('back');
}

function clearTurn() {
  input.turnLeft = false; input.turnRight = false;
  pulses.delete('turnLeft'); pulses.delete('turnRight');
}

/** 当前状态快照 */
export function getState() {
  return {
    x: state.x, z: state.z, heading: state.heading,
    surface: state.surface, speed: currentSpeed
  };
}

/** 直接设置位置（调试用，不改朝向） */
export function setPosition(x, z) {
  state.x = x;
  state.z = z;
  state.surface = scene.surfaceAt(state);
}

/** 传送到起点并复位所有计时 */
export function teleport(x, z, heading) {
  const c = scene.getCurrent();
  const start = c ? c.start : { x: 0, z: 0, heading: 0 };
  state.x = typeof x === 'number' ? x : start.x;
  state.z = typeof z === 'number' ? z : start.z;
  state.heading = normalize360(typeof heading === 'number' ? heading : start.heading);
  state.surface = scene.surfaceAt(state);
  elapsed = 0;
  lastDeviationHint = -Infinity;
  lastBlockedHint = -Infinity;
  clearMovement(); clearTurn(); pulses.clear();
}

/** 停止所有输入并解绑键盘（结算或重开时调用，防止残留监听器） */
export function stop() {
  clearMovement(); clearTurn(); pulses.clear();
  for (const fn of detach) { try { fn(); } catch (_) {} }
  detach = [];
  inited = false;
}

/** 当前输入快照（调试与测试用） */
export function getInput() {
  return { ...input, pulses: Object.fromEntries(pulses) };
}

export default { init, update, stop, getState, setPosition, teleport, integrate, getInput, CONFIG };
