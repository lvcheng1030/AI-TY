/**
 * T1 · 空间音频引擎 —— 【桩文件，待实现】
 *
 * 负责人：见 docs/tasks.md 的 T1
 * 你拥有：src/audio/engine.js、src/audio/materials.js、tests/audio.test.html
 *
 * 本文件当前是空壳，只需保证 main.js 能 import 且调用 init() 不报错。
 * 实现要求（含三条硬性约束）见 docs/tasks.md，此处只列最容易做错的点：
 *
 *   1. AudioContext 必须在【首次用户手势】里创建/恢复，否则浏览器不给声音。
 *   2. 【禁止把需要分辨的声源放在正后方】——实测人耳分不出前后
 *      （混淆锥，见 docs/test-log.md T-001）。代码里要做保护。
 *   3. 敲杖只探测前向 ±45° 锥形。距离用「回声延迟 + 混响量」表达，
 *      不要只靠音量衰减。
 */

export function init() {
  console.warn('[T1] audio/engine.js 尚未实现');
  return { ok: false, reason: 'not-implemented' };
}

export function stop() {}
export function setListener() {}
export function setSurface() {}
export function setSpeed() {}
export function caneProbe() {
  return { hit: false, distance: Infinity, surface: null, obstacleId: null };
}
export function playAmbience() {}
export function playSfx() {}

export default { init, stop, setListener, setSurface, setSpeed, caneProbe, playAmbience, playSfx };
