/**
 * T1 · 空间音频引擎
 *
 * 负责人：T1（见 docs/tasks.md）
 *
 * 三条来自实测的硬性约束（详见 docs/test-log.md）：
 *
 * 1. 【前向半平面】不得把需要玩家分辨的声源放在正后方。
 *    T-001 实测：正前与正后给的双耳线索几乎相同，人耳分不出来。
 *    createSource() 里做了强制保护 —— 传正后方会被夹到前方并告警。
 *
 * 2. 【敲杖只探前向 ±45° 锥形】与真实盲杖一致，同时把混淆锥从机制里移除。
 *
 * 3. 【距离用延迟 + 混响表达，不只靠音量】
 *    T-002 实测：延迟 0.08 s/米、混响 0.25→0.90 s，两种线索各自 100% 可用。
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS, SURFACES, distanceToBand } from '../core/contracts.js';
import { bearingTo, dist, headingToVec } from '../core/vec.js';
import * as materials from './materials.js';

/* ------------------------- 参数（依据 T-002 实测） ------------------------- */

export const CONFIG = Object.freeze({
  REF_DISTANCE: 1.0,
  ROLLOFF: 0.5,
  MAX_DISTANCE: 30,

  // 敲杖：T-002 标定
  CANE_DELAY_PER_METER: 0.08,   // 每米 0.08 秒
  CANE_DELAY_MIN: 0.10,         // 下限，避免贴脸时没有回声
  CANE_REVERB_NEAR: 0.25,       // 2 米处的混响拖尾
  CANE_REVERB_FAR: 0.90,        // 8 米处的混响拖尾
  CANE_RANGE: 8.0,              // 最大探测距离
  CANE_HALF_ANGLE: 45,          // 前向锥形半角（度）

  STEP_INTERVAL_BASE: 0.62,     // 慢速时的步间隔（秒）
  STEP_INTERVAL_MIN: 0.34,      // 最快时的步间隔

  MASTER_GAIN: 0.34
});

let nextId = 1;

/* ------------------------- 内部状态 ------------------------- */

let ctx = null;
let master = null;
let clickBuf = null;
const irCache = new Map();
let started = false;

/** 活跃声源：id -> { src, panner, gain, meta } */
const sources = new Map();

/** 环境声源 id */
let ambienceIds = [];

/** 听者状态 */
const listener = { x: 0, z: 0, heading: 0 };

/** 脚步状态 */
const footsteps = { surface: SURFACES.CONCRETE, speed: 0, timer: 0 };

/** 最近一次探测结果（调试用） */
let lastProbe = null;

/** 几何探测函数，由 main.js 注入（避免音频模块依赖世界模块） */
let probeFn = null;

/* ------------------------- 初始化 ------------------------- */

/**
 * 创建（或恢复）AudioContext。
 *
 * 必须在【首次用户手势】里调用：浏览器安全策略禁止无交互出声。
 * 重复调用安全。
 */
export function init() {
  if (ctx) {
    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      ctx.resume().catch(() => {});
    }
    return { ok: true, reused: true, state: ctx.state };
  }

  const AC = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null;

  if (!AC) {
    console.warn('[T1] 此浏览器不支持 Web Audio，声音功能静音');
    return { ok: false, reason: 'unsupported' };
  }

  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = CONFIG.MASTER_GAIN;
  master.connect(ctx.destination);

  // 敲击声：宽带噪声 + 中心频率。
  // 宽带成分是人耳定位的关键，纯音会显著降低定位准确率。
  const len = Math.max(1, Math.floor(ctx.sampleRate * 0.07));
  clickBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = clickBuf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t * 80);
    d[i] = ((Math.random() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 1400 * t) * 0.5) * env;
  }

  subscribeEvents();
  started = true;

  // 素材异步预加载，不阻塞启动
  materials.preload(ctx).catch(() => {});

  return { ok: true, sampleRate: ctx.sampleRate, state: ctx.state };
}

export function isReady() {
  return started && ctx !== null;
}

function ensureReady() {
  if (!ctx) {
    console.warn('[T1] 音频尚未初始化：需在用户手势里调用 init()');
    return false;
  }
  return true;
}

/**
 * 取出内部的 AudioContext 供其它模块复用。
 *
 * 为什么必须复用而不是各建各的：浏览器对同时存在的 AudioContext
 * 数量有限制（通常 6 个），且多个 context 的声音无法统一混合。
 * T5 的台词播放需要它（见 src/speech/voice.js 的 attachContext）。
 */
export function getContext() {
  return ctx;
}

/* ------------------------- 前向半平面保护 ------------------------- */

/**
 * 把位置夹到听者的前向半平面（与朝向夹角 ≤ 90°）。
 *
 * 这是 T-001 实测结论的代码级落实。为什么要写成代码而不是写进文档：
 * 文档约束迟早会被忘记，而"声音位置不对"在浏览器里极难归因 ——
 * 玩家只会说"听起来怪"，没人能定位到是某个声源放到了正后方。
 *
 * @param {{x:number,z:number}} pos
 * @returns {{pos:{x:number,z:number}, clamped:boolean, bearing:number}}
 */
export function clampToFrontHalf(pos) {
  const d = dist(listener, pos);
  if (d < 1e-6) return { pos: { x: pos.x, z: pos.z }, clamped: false, bearing: 0 };

  const bearing = bearingTo(listener, listener.heading, pos);   // -180 ~ 180
  if (Math.abs(bearing) <= 90) {
    return { pos: { x: pos.x, z: pos.z }, clamped: false, bearing };
  }

  // 超出前向半平面：沿朝向投影到正前方等距处
  const fwd = headingToVec(listener.heading);
  return {
    pos: { x: listener.x + fwd.x * d, z: listener.z + fwd.z * d },
    clamped: true,
    bearing
  };
}

/* ------------------------- 空间声源 ------------------------- */

/**
 * 创建定位声源。
 *
 * @param {Object} opts
 * @param {{x:number,z:number}} opts.pos
 * @param {string} [opts.audio] 素材名
 * @param {boolean} [opts.loop]
 * @param {number} [opts.gain]
 * @param {boolean} [opts.allowBehind] 仅供调试：显式绕开前向约束
 * @returns {string|null} 声源 id
 */
export function createSource({ pos, audio = null, loop = false, gain = 1, allowBehind = false } = {}) {
  if (!ensureReady()) return null;
  if (!pos) return null;

  let target = { x: pos.x, z: pos.z };
  let clamped = false;

  if (!allowBehind) {
    const fixed = clampToFrontHalf(target);
    clamped = fixed.clamped;
    target = fixed.pos;
  }

  const id = 'src' + (nextId++);
  const buffer = audio ? materials.getBuffer(ctx, audio) : null;

  // 缺素材时用合成音兜底，而不是静默丢弃这个声源。
  // 理由：现场可能只带了部分素材，若直接不建声源，
  // 玩家只会觉得"这里什么都没有" —— 而实际上是他听不到。
  // 合成一个低频嗡鸣至少能提供方位信息，让机制仍然成立。
  const useSynthetic = !buffer;
  if (useSynthetic) {
    console.info(`[T1] 素材缺失（${audio || '未指定'}），改用合成音提供方位`);
  }

  const src = ctx.createBufferSource();
  if (buffer) {
    src.buffer = buffer;
    src.loop = loop;
  } else {
    src.buffer = makeFallbackBuffer(loop ? 1.2 : 0.25);
    src.loop = loop;
  }

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = CONFIG.REF_DISTANCE;
  panner.rolloffFactor = CONFIG.ROLLOFF;
  panner.maxDistance = CONFIG.MAX_DISTANCE;
  setPannerPosition(panner, target);

  const g = ctx.createGain();
  g.gain.value = useSynthetic ? gain * 0.35 : gain;

  src.connect(g);
  g.connect(panner);
  panner.connect(master);
  try { src.start(); } catch (_) {}

  sources.set(id, { src, panner, gain: g, meta: { audio, loop, clamped, target, synthetic: useSynthetic } });

  if (clamped) {
    console.warn('[T1] 声源位于听者正后方，已自动夹到前向半平面。' +
                 '依据 docs/test-log.md T-001：人耳分不出正前与正后。');
  }

  return id;
}

/** 兜底合成音：低频嗡鸣，只用来提供方位，不追求好听 */
function makeFallbackBuffer(seconds) {
  const key = '__fallback_' + seconds.toFixed(2);
  if (irCache.has(key)) return irCache.get(key);

  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    // 缓慢起伏，避免听起来像故障蜂鸣
    const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.8 * t);
    d[i] = Math.sin(2 * Math.PI * 220 * t) * 0.35 * env;
  }
  irCache.set(key, buf);
  return buf;
}

/** 更新声源位置 */
export function updateSource(id, pos) {
  const s = sources.get(id);
  if (!s || !pos) return;
  const fixed = clampToFrontHalf(pos);
  s.meta.target = fixed.pos;
  s.meta.clamped = fixed.clamped;
  setPannerPosition(s.panner, fixed.pos);
}

/** 停止并移除声源 */
export function stopSource(id) {
  const s = sources.get(id);
  if (!s) return;
  try { s.src.stop(); } catch (_) {}
  try { s.src.disconnect(); s.gain.disconnect(); s.panner.disconnect(); } catch (_) {}
  sources.delete(id);
}

/* ------------------------- 听者 ------------------------- */

/**
 * 更新听者位置与朝向。由 main.js 的循环每帧调用。
 * @param {{x:number,z:number,heading:number}} p
 */
export function setListener(p) {
  listener.x = p.x;
  listener.z = p.z;
  listener.heading = p.heading;

  if (!ctx) return;
  const l = ctx.listener;

  if (l.positionX) {
    l.positionX.value = p.x;
    l.positionY.value = 0;
    l.positionZ.value = p.z;
  } else if (typeof l.setPosition === 'function') {
    l.setPosition(p.x, 0, p.z);
  }

  const fwd = headingToVec(p.heading);
  if (l.forwardX) {
    l.forwardX.value = fwd.x;
    l.forwardY.value = 0;
    l.forwardZ.value = fwd.z;
    if (l.upX) { l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
  } else if (typeof l.setOrientation === 'function') {
    l.setOrientation(fwd.x, 0, fwd.z, 0, 1, 0);
  }

  // 转身后原本"在后方"的声源要重新夹取
  for (const s of sources.values()) {
    const fixed = clampToFrontHalf(s.meta.target);
    s.meta.clamped = fixed.clamped;
    setPannerPosition(s.panner, fixed.pos);
  }
}

function setPannerPosition(panner, pos) {
  if (panner.positionX) {
    panner.positionX.value = pos.x;
    panner.positionY.value = 0;
    panner.positionZ.value = pos.z;
  } else if (typeof panner.setPosition === 'function') {
    panner.setPosition(pos.x, 0, pos.z);
  }
}

/* ------------------------- 环境声 ------------------------- */

/**
 * 按场景数据建立环境声源。
 * @param {Array<{id:string,pos:number[],audio:string,loop?:boolean,gain?:number}>} emitters
 */
export function playAmbience(emitters) {
  if (!ensureReady()) return { created: 0, missing: [] };
  stopAmbience();

  const missing = [];
  for (const e of (emitters || [])) {
    const id = createSource({
      pos: { x: e.pos[0], z: e.pos[1] },
      audio: e.audio,
      loop: e.loop !== false,
      gain: typeof e.gain === 'number' ? e.gain : 0.6
    });
    if (id) ambienceIds.push(id);
    else missing.push(e.audio);
  }
  return { created: ambienceIds.length, missing };
}

export function stopAmbience() {
  for (const id of ambienceIds) stopSource(id);
  ambienceIds = [];
}

/* ------------------------- 脚步 ------------------------- */

/** 设置当前路面（由 surface:changed 驱动） */
export function setSurface(type) {
  if (footsteps.surface === type) return;
  footsteps.surface = type;
  materials.onSurfaceChanged(ctx, type);
}

/** 设置移动速度（米/秒）。步频随之变化——速度是玩家判断"我在不在走"的关键线索。 */
export function setSpeed(v) {
  footsteps.speed = Math.abs(v) || 0;
}

/** 每帧推进脚步节拍 */
export function updateFootsteps(dt) {
  if (!ctx) return;

  if (footsteps.speed < 0.05) {
    footsteps.timer = 0;
    return;
  }

  const t = Math.min(1, footsteps.speed / 1.2);
  const interval = CONFIG.STEP_INTERVAL_BASE -
                   (CONFIG.STEP_INTERVAL_BASE - CONFIG.STEP_INTERVAL_MIN) * t;

  footsteps.timer -= dt;
  if (footsteps.timer <= 0) {
    footsteps.timer = interval;
    playFootstep();
  }
}

function playFootstep() {
  const buf = materials.getFootstepBuffer(ctx, footsteps.surface);
  if (!buf) return;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.5;
  src.connect(g);
  g.connect(master);
  src.start();
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (_) {} };
}

/* ------------------------- 敲杖探测 ------------------------- */

/**
 * 响应敲杖请求：前向锥形探测 + 用延迟与混响表达距离。
 *
 * 探测几何由外部注入（T2 提供），本模块负责把结果翻译成声音。
 *
 * @param {{x:number,z:number,heading:number}} from
 * @returns {Object|null} 探测结果
 */
export function caneProbe(from) {
  if (!ensureReady()) return null;
  if (!from) return null;

  const raw = typeof probeFn === 'function'
    ? probeFn(from, CONFIG.CANE_HALF_ANGLE, CONFIG.CANE_RANGE)
    : null;

  const hit = !!(raw && raw.hit && Number.isFinite(raw.distance));
  const distance = hit ? raw.distance : Infinity;

  // 距离 → 延迟与混响（T-002 标定的线性关系）
  const delay = hit ? Math.max(CONFIG.CANE_DELAY_MIN, distance * CONFIG.CANE_DELAY_PER_METER) : 0;
  const reverb = hit
    ? CONFIG.CANE_REVERB_NEAR +
      (CONFIG.CANE_REVERB_FAR - CONFIG.CANE_REVERB_NEAR) *
      Math.min(1, Math.max(0, (distance - 2) / 6))
    : 0;

  playTap();                                   // 敲击本身（干声，居中）
  if (hit) {
    const bearing = Number.isFinite(raw.bearingDeg) ? raw.bearingDeg : 0;
    const echoPos = pointAlong(from, bearing, distance);
    setTimeout(() => playEcho(echoPos, reverb), Math.round(delay * 1000));
  }

  lastProbe = {
    hit,
    distance,
    surface: hit ? (raw.surface ?? null) : null,
    obstacleId: hit ? (raw.obstacleId ?? null) : null,
    bearing: hit ? bearingLabel(raw) : null,
    band: hit ? distanceToBand(distance) : null,
    delay,
    reverb
  };

  emit(EVENTS.CANE_PROBE, lastProbe);
  return lastProbe;
}

/** 方位标签：只给左/前/右，不含正后 */
function bearingLabel(raw) {
  const b = Number.isFinite(raw.bearingDeg) ? raw.bearingDeg : 0;
  if (b < -20) return 'left';
  if (b > 20) return 'right';
  return 'ahead';
}

/** 沿"相对朝向的方位角 + 距离"求出世界坐标 */
function pointAlong(from, bearingDeg, distance) {
  const abs = from.heading + bearingDeg;
  const fwd = headingToVec(abs);
  return { x: from.x + fwd.x * distance, z: from.z + fwd.z * distance };
}

function playTap() {
  const src = ctx.createBufferSource();
  src.buffer = clickBuf;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  src.connect(g); g.connect(master);
  src.start();
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (_) {} };
}

/** 在指定世界位置播放回声，带混响 */
function playEcho(pos, reverbSeconds) {
  if (!ctx) return;

  const src = ctx.createBufferSource();
  src.buffer = clickBuf;

  const panner = ctx.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = CONFIG.REF_DISTANCE;
  panner.rolloffFactor = CONFIG.ROLLOFF;
  const fixed = clampToFrontHalf(pos);
  setPannerPosition(panner, fixed.pos);

  const g = ctx.createGain();
  g.gain.value = 0.75;

  const conv = ctx.createConvolver();
  conv.buffer = getImpulse(reverbSeconds);
  const wet = ctx.createGain();
  wet.gain.value = 0.9;

  src.connect(g);
  g.connect(panner);
  panner.connect(master);        // 干声：给出方位
  g.connect(conv);
  conv.connect(wet);
  wet.connect(master);           // 湿声：给出距离感

  src.start();
  src.onended = () => {
    try {
      src.disconnect(); g.disconnect();
      conv.disconnect(); wet.disconnect(); panner.disconnect();
    } catch (_) {}
  };
}

/** 合成脉冲响应：拖尾越长，听感越远 */
function getImpulse(seconds) {
  const key = seconds.toFixed(2);
  if (irCache.has(key)) return irCache.get(key);

  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const k = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.6);
    }
  }
  irCache.set(key, buf);
  return buf;
}

/* ------------------------- 通用音效 ------------------------- */

/** 播放非空间化音效（提示音、碰撞音等） */
export function playSfx(name, { gain = 0.6 } = {}) {
  if (!ensureReady()) return;

  const buf = materials.getSfxBuffer(ctx, name);
  const src = ctx.createBufferSource();
  const g = ctx.createGain();

  if (buf) {
    src.buffer = buf;
    g.gain.value = gain;
  } else {
    // 缺素材：退化为短促合成音，保证反馈存在
    src.buffer = clickBuf;
    g.gain.value = gain * 0.5;
  }

  src.connect(g); g.connect(master);
  src.start();
  src.onended = () => { try { src.disconnect(); g.disconnect(); } catch (_) {} };
}

/* ------------------------- 事件接线 ------------------------- */

function subscribeEvents() {
  // 敲杖请求（来自 T2 的键盘或语音）
  bus.on(EVENTS.CANE_REQUEST, (p) => {
    if (p) caneProbe({ x: p.x, z: p.z, heading: p.heading });
  });

  // 路面变化 → 换脚步音色
  bus.on(EVENTS.SURFACE_CHANGED, (p) => {
    if (p && p.type) setSurface(p.type);
  });

  // 撞到东西 → 提示音
  bus.on(EVENTS.PLAYER_BLOCKED, () => playSfx('blocked', { gain: 0.5 }));
}

/** 注入几何探测函数 */
export function setProbeFunction(fn) {
  probeFn = fn;
}

/* ------------------------- 停止与调试 ------------------------- */

export function stop() {
  stopAmbience();
  for (const id of Array.from(sources.keys())) stopSource(id);
  footsteps.speed = 0;
  footsteps.timer = 0;
  lastProbe = null;
}

/** 调试快照 */
export function debugState() {
  return {
    ready: isReady(),
    contextState: ctx ? ctx.state : 'none',
    sampleRate: ctx ? ctx.sampleRate : null,
    listener: { ...listener },
    sourceCount: sources.size,
    ambienceCount: ambienceIds.length,
    surface: footsteps.surface,
    speed: footsteps.speed,
    loaded: materials.loadedList(),
    missing: materials.missingList(),
    lastProbe
  };
}

if (typeof window !== 'undefined') {
  window.__audioDebug = debugState;
}

export default {
  init, isReady, stop, getContext,
  createSource, updateSource, stopSource,
  setListener, playAmbience, stopAmbience,
  setSurface, setSpeed, updateFootsteps,
  caneProbe, setProbeFunction, playSfx,
  clampToFrontHalf, debugState, CONFIG
};
