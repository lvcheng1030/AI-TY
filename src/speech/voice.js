/**
 * T5 · 台词播放 —— 【桩文件，待实现】
 *
 * 负责人：见 docs/tasks.md 的 T5
 * 你拥有：src/speech/voice.js、tools/tts_build.py、content/lines.csv、assets/voice/
 *
 * 设计：台词是固定的，构建期就合成好 mp3，运行时只播放。
 * 换来三个好处：零延迟、断网可用、音色统一。
 *
 * 硬性要求：
 *   - 找不到 mp3 时回退到 speechSynthesis 并 console.warn 说明缺哪个文件
 *   - 高优先级可打断低优先级（紧急提示不能被旁白堵住）
 */

export function init() {
  console.warn('[T5] speech/voice.js 尚未实现');
  return { ok: false, loaded: 0 };
}

/**
 * @param {string} lineId 对应 content/lines.csv 的 id
 * @param {{priority?:number}} [opts] 0=旁白 1=提示 2=紧急
 */
export function speak(lineId, opts = {}) {}

export function stopAll() {}

export function isSpeaking() {
  return false;
}

export function missingLines() {
  return [];
}

export default { init, speak, stopAll, isSpeaking, missingLines };
