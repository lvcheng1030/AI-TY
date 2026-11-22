/**
 * T5 · 台词播放
 *
 * 负责人：T5（见 docs/tasks.md）
 *
 * 设计：台词在构建期全部合成为 mp3（见 tools/tts_build.py），运行时只播放。
 * 换来零延迟、断网可用、音色统一。
 *
 * 本模块负责三件事：
 *   1. 播放队列与【优先级打断】—— 紧急提示不能被旁白堵住
 *   2. 缺文件时回退到浏览器 TTS，并明确报告缺哪个
 *   3. 播放状态广播（供 UI 显示"正在播报"）
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS } from '../core/contracts.js';

/** 优先级：数字越大越优先 */
export const PRIORITY = Object.freeze({
  NARRATION: 0,   // 旁白
  HINT: 1,        // 提示
  URGENT: 2       // 紧急（碰撞、偏离）
});

/** 同一句连续播报的最小间隔（秒）——防止被事件风暴瞬间重复触发 */
const REPEAT_GUARD = 0.8;

const BASE = './assets/voice';
const EXT = '.mp3';

/* ------------------------- 状态 ------------------------- */

let ctx = null;
let master = null;
const buffers = new Map();   // lineId -> AudioBuffer
const missing = new Set();

/** 当前正在播放：{ lineId, priority, source, startedAt } */
let current = null;

/** 等待播放的队列 */
let queue = [];

let lastSpokenAt = 0;
let lastSpokenId = null;
let inited = false;

/* ------------------------- 初始化 ------------------------- */

/**
 * 初始化。可传入已有的 AudioContext 复用 ——
 * 浏览器对同时存在的 AudioContext 数量有限制（通常 6 个），
 * 所以必须复用 T1 创建的那个，而不是自己再建一个。
 *
 * @param {AudioContext} [audioContext]
 */
export function init(audioContext = null) {
  if (inited) {
    if (audioContext) attachContext(audioContext);
    return { ok: true, reused: true };
  }

  if (audioContext) {
    attachContext(audioContext);
  } else if (typeof window !== 'undefined') {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
    }
  }

  bus.on(EVENTS.SPEAK, (p) => {
    if (p && p.lineId) speak(p.lineId, { priority: p.priority });
  });

  inited = true;

  if (!ctx) {
    console.warn('[T5] 没有 AudioContext，台词将回退到浏览器 TTS');
    return { ok: false, reason: 'no-context' };
  }
  return { ok: true };
}

/** 注入 AudioContext。T1 解锁音频后调用，避免创建第二个 context。 */
export function attachContext(audioContext) {
  if (!audioContext || ctx === audioContext) return;
  ctx = audioContext;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
  }
}

/* ------------------------- 加载 ------------------------- */

/**
 * 预加载指定台词。
 * @param {string[]} ids
 * @returns {Promise<{loaded:string[], missing:string[]}>}
 */
export async function preload(ids) {
  if (!ctx) return { loaded: [], missing: [] };

  const loaded = [];
  const failed = [];
  const list = Array.from(new Set(ids || []));

  // 串行加载，不并发。
  //
  // 为什么不用 Promise.all：decodeAudioData 在不同浏览器里对同一份
  // ArrayBuffer 的消费时机不一致，并发解码时会出现"解码完成但 Promise 不落定"
  // 的情况（实测踩到：buffers 里已有数据，await 却永远不返回）。
  // 27 条串行约 1.5 秒，换来的是确定性 —— 这个代价值得。
  for (const id of list) {
    if (buffers.has(id)) { loaded.push(id); continue; }

    try {
      const res = await fetch(`${BASE}/${id}${EXT}`, { cache: 'force-cache' });
      if (!res.ok) {
        missing.add(id);
        failed.push(id);
        continue;
      }
      const arr = await res.arrayBuffer();
      const buf = await decode(ctx, arr);
      if (buf) {
        buffers.set(id, buf);
        loaded.push(id);
      } else {
        missing.add(id);
        failed.push(id);
      }
    } catch (_) {
      missing.add(id);
      failed.push(id);
    }
  }

  if (failed.length > 0) {
    console.warn(`[T5] ${failed.length} 条台词文件缺失，将回退到浏览器 TTS：${failed.join(', ')}`);
  }
  return { loaded, missing: failed };
}

/**
 * 解码音频，只走一条路径。
 *
 * 关键：不能同时挂回调与 Promise。两者都会触发，
 * 而 Promise 形式的 decodeAudioData 在回调被调用后可能不再落定，
 * 导致 await 永久挂起。先探测是否返回 Promise，再二选一。
 */
function decode(audioCtx, arrayBuffer) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (buf) => { if (!settled) { settled = true; resolve(buf || null); } };

    try {
      const maybePromise = audioCtx.decodeAudioData(
        arrayBuffer,
        (buf) => done(buf),                    // 回调形式（旧版 Safari）
        () => done(null)
      );

      // 只有确认返回了 Promise 才用 then 形式
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(done, () => done(null));
      }
    } catch (_) {
      done(null);
    }
  });
}

/* ------------------------- 播放 ------------------------- */

/**
 * 播放一句台词。
 *
 * @param {string} lineId 对应 content/lines.csv 的 id
 * @param {Object} [opts]
 * @param {number} [opts.priority] 见 PRIORITY，默认旁白
 * @param {boolean} [opts.interrupt] 同级是否允许打断
 * @returns {boolean} 是否立即开始播放
 */
export function speak(lineId, { priority = PRIORITY.NARRATION, interrupt = false } = {}) {
  if (!lineId) return false;

  const now = performance.now() / 1000;

  // 去重：同一句被极短时间内重复触发（事件风暴），忽略后一次
  if (lineId === lastSpokenId && now - lastSpokenAt < REPEAT_GUARD) return false;

  if (current) {
    // 低优先级不能打断高优先级，排队等待
    if (priority < current.priority) {
      enqueue(lineId, priority);
      return false;
    }
    // 同级且未声明可打断 → 排队
    if (priority === current.priority && !interrupt) {
      enqueue(lineId, priority);
      return false;
    }
    // 更高优先级，或同级且允许打断 → 掐掉当前
    stopCurrent();
  }

  lastSpokenId = lineId;
  lastSpokenAt = now;

  return playNow(lineId, priority);
}

function enqueue(lineId, priority) {
  queue.push({ lineId, priority });
  queue.sort((a, b) => b.priority - a.priority);   // 高优先级先出队
}

function playNow(lineId, priority) {
  const buf = buffers.get(lineId);

  if (!buf) {
    // 缺文件：回退到浏览器 TTS。
    // 这不是"优雅降级"，而是保证玩家至少能听到内容 ——
    // 纯音频游戏里没有声音等于没有信息。
    fallbackTts(lineId);
    current = null;
    drainQueue();
    return false;
  }

  if (!ctx) { fallbackTts(lineId); return false; }

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(master);

  current = { lineId, priority, source: src, startedAt: performance.now() };

  src.onended = () => {
    if (current && current.source === src) {
      current = null;
      emit(EVENTS.SPEAK_ENDED, { lineId });
      drainQueue();
    }
  };

  try {
    src.start();
  } catch (err) {
    console.warn('[T5] 播放失败：', err);
    current = null;
    return false;
  }

  emit(EVENTS.SPEAK_STARTED, { lineId, priority });
  return true;
}

/** 队列里还有就接着播 */
function drainQueue() {
  if (current || queue.length === 0) return;
  const next = queue.shift();
  playNow(next.lineId, next.priority);
}

/**
 * 缺 mp3 时的兜底。
 *
 * 局限：mp3 里没有文本，所以浏览器 TTS 只能播一句通用提示。
 * 正因如此，台词必须预渲染 —— 也让 missingLines() 成为现场排查的入口。
 */
function fallbackTts(lineId) {
  console.warn(`[T5] 台词文件缺失：${lineId}.mp3 —— 已回退到浏览器 TTS（内容可能不准确）`);

  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  const u = new SpeechSynthesisUtterance('语音资源缺失，请检查素材文件。');
  u.lang = 'zh-CN';
  u.rate = 1.0;
  try { window.speechSynthesis.speak(u); } catch (_) {}
}

/** 停掉当前播报 */
export function stopCurrent() {
  if (!current) return;
  try { current.source.stop(); } catch (_) {}
  try { current.source.disconnect(); } catch (_) {}
  current = null;
}

/** 停止一切（含队列）。重开一局必须调用，否则会有上一局残留的播报。 */
export function stopAll() {
  stopCurrent();
  queue = [];
  lastSpokenId = null;
  lastSpokenAt = 0;
}

export function isSpeaking() {
  return current !== null;
}

export function currentLine() {
  return current ? current.lineId : null;
}

export function queueLength() {
  return queue.length;
}

/** 还缺哪些台词文件（现场排查用） */
export function missingLines() {
  return Array.from(missing);
}

/** 已加载的台词 id */
export function loadedLines() {
  return Array.from(buffers.keys());
}

/** 调试快照 */
export function debugState() {
  return {
    ready: ctx !== null,
    loaded: buffers.size,
    missing: missing.size,
    speaking: current ? current.lineId : null,
    queued: queue.length,
    missingIds: Array.from(missing)
  };
}

if (typeof window !== 'undefined') {
  window.__voiceDebug = debugState;
}

export default {
  init, attachContext, preload, speak,
  stopCurrent, stopAll, isSpeaking, currentLine, queueLength,
  missingLines, loadedLines, debugState, PRIORITY
};
