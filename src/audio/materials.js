/**
 * T1 · 音频素材探查与兜底合成
 *
 * 负责人：T1
 *
 * 设计原则：【缺素材不能表现为"没声音"】。
 *
 * 游园会现场可能只带了部分素材，甚至完全没带音频文件。
 * 若缺文件就静音，玩家会以为设备坏了 —— 而现场无法排查。
 * 所以本模块在缺少素材时【合成】替代音：
 *
 *   - 三种路面的脚步声：全部现场合成，保证音色差异稳定可辨
 *   - 敲击声：由 engine.js 合成
 *   - 环境声与音效：优先用真实素材，缺失时报告缺哪些并合成兜底
 *
 * 于是"有没有素材"只影响音色丰富度，不影响游戏能否玩。
 */

import { SURFACES } from '../core/contracts.js';

/** 已加载的素材：name -> AudioBuffer */
const buffers = new Map();
/** 找不到的素材名 */
const missingSet = new Set();

/** 各路面脚步的合成参数：盲道最脆、水泥中等、草地最闷 */
const STEP_PROFILE = {
  [SURFACES.TACTILE]:  { freq: 2100, decay: 1100, noise: 0.30, body: 0.55, dur: 0.055 },
  [SURFACES.CONCRETE]: { freq: 900,  decay: 680,  noise: 0.45, body: 0.60, dur: 0.085 },
  [SURFACES.GRASS]:    { freq: 420,  decay: 360,  noise: 0.70, body: 0.25, dur: 0.130 }
};

/** 素材清单（相对 assets/）。有则用，无则合成兜底。 */
export const MANIFEST = Object.freeze({
  amb: ['traffic_low', 'crowd', 'wind', 'bike_bell'],
  sfx: ['blocked', 'success', 'hint']
});

const BASE = './assets';
const EXT = '.mp3';

/* ------------------------- 加载 ------------------------- */

/**
 * 预加载素材。缺失的记录下来，绝不抛错。
 * @param {AudioContext} ctx
 * @returns {Promise<{loaded:string[], missing:string[]}>}
 */
export async function preload(ctx) {
  if (!ctx) return { loaded: [], missing: [] };

  const tasks = [];
  for (const [dir, names] of Object.entries(MANIFEST)) {
    for (const name of names) tasks.push(loadOne(ctx, dir, name));
  }
  const results = await Promise.all(tasks);

  const loaded = results.filter(r => r.ok).map(r => r.name);
  const failed = results.filter(r => !r.ok).map(r => r.name);

  if (failed.length > 0) {
    console.info(`[T1] ${failed.length} 个素材缺失，使用合成音兜底：${failed.join(', ')}`);
  }
  return { loaded, missing: failed };
}

async function loadOne(ctx, dir, name) {
  const url = `${BASE}/${dir}/${name}${EXT}`;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) { missingSet.add(name); return { ok: false, name }; }
    const arr = await res.arrayBuffer();
    const buf = await decode(ctx, arr);
    if (!buf) { missingSet.add(name); return { ok: false, name }; }
    buffers.set(name, buf);
    return { ok: true, name };
  } catch (_) {
    missingSet.add(name);
    return { ok: false, name };
  }
}

/**
 * 解码音频，只走一条路径。
 *
 * 关键：不能同时挂回调与 Promise。两者都会触发，
 * 而 Promise 形式的 decodeAudioData 在回调被调用后可能不再落定，
 * 导致 await 永久挂起（实测踩到：缓冲已生成，Promise 却不返回）。
 * 所以先探测返回值是不是 Promise，再二选一。
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
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(done, () => done(null));
      }
    } catch (_) {
      done(null);
    }
  });
}

/* ------------------------- 查询 ------------------------- */

/** 取一个已加载的素材；没有则返回 null，调用方自行兜底 */
export function getBuffer(ctx, name) {
  return buffers.get(name) || null;
}

/** 是否已加载某素材 */
export function has(name) {
  return buffers.has(name);
}

/** 还缺哪些素材 */
export function missingList() {
  return Array.from(missingSet);
}

/** 已加载的素材名（不含内部合成缓冲） */
export function loadedList() {
  return Array.from(buffers.keys()).filter(k => !k.startsWith('__'));
}

/**
 * 素材总览。供调试与现场排查：一眼看出哪些有、哪些没有。
 */
export function scan() {
  const out = { amb: [], foot: {}, sfx: [] };
  for (const name of MANIFEST.amb) out.amb.push({ name, loaded: has(name) });
  for (const name of MANIFEST.sfx) out.sfx.push({ name, loaded: has(name) });
  for (const s of Object.values(SURFACES)) out.foot[s] = 'synthesized';
  return out;
}

/* ------------------------- 脚步（保证非 null） ------------------------- */

/**
 * 取脚步音频。**始终返回有效 AudioBuffer** —— 全部现场合成。
 *
 * 三种路面的差异是作品的核心信息之一（踩到盲道要能听出来），
 * 所以这一步不能依赖外部素材，否则一旦缺文件整个机制就失效。
 *
 * @param {AudioContext} ctx
 * @param {string} surface 取自 SURFACES
 */
export function getFootstepBuffer(ctx, surface) {
  if (!ctx) return null;

  const key = '__step_' + surface;
  if (buffers.has(key)) return buffers.get(key);

  const p = STEP_PROFILE[surface] || STEP_PROFILE[SURFACES.CONCRETE];
  const len = Math.max(1, Math.floor(ctx.sampleRate * p.dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);

  for (let i = 0; i < len; i++) {
    const t = i / ctx.sampleRate;
    const env = Math.exp(-t * p.decay);
    const noise = (Math.random() * 2 - 1) * p.noise;
    const body = Math.sin(2 * Math.PI * p.freq * t) * p.body;
    d[i] = (noise + body) * env;
  }

  buffers.set(key, buf);
  return buf;
}

/** 取音效；缺失返回 null，调用方退化为合成提示音 */
export function getSfxBuffer(ctx, name) {
  return buffers.get(name) || null;
}

/**
 * 路面变化钩子。
 * 目前无状态可维护（脚步缓冲按需合成并缓存）；保留此接口是为了
 * 以后接入真实素材时能在这里做交叉淡入。
 */
export function onSurfaceChanged(ctx, type) {
  if (!ctx) return;
  getFootstepBuffer(ctx, type);   // 预热，避免第一次踩上去时卡顿
}

export default {
  preload, getBuffer, getFootstepBuffer, getSfxBuffer,
  onSurfaceChanged, scan, has, missingList, loadedList, MANIFEST
};
