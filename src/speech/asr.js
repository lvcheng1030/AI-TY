/**
 * T4 · 语音识别封装 —— 【桩文件，待实现】
 *
 * 负责人：见 docs/tasks.md 的 T4
 * 你拥有：src/speech/asr.js、src/nlu/intents.js、content/intents.cases.json
 *
 * 硬性要求：
 *   - 任何一种失败（不支持 / 权限被拒 / 断网 / 超时）都【不得让游戏崩溃】，
 *     一律发 degrade:on 并允许改用按钮或打字
 *   - 解析函数必须是纯函数，不依赖浏览器 API（这样能批量测试）
 *   - 三态置信阈值见 contracts.js 的 CONFIDENCE
 */

export function isSupported() {
  return false;
}

export function init() {
  console.warn('[T4] speech/asr.js 尚未实现');
  return { ok: false, supported: false };
}

/** 开始一次「按住说话」 */
export function listen() {}

export function stopListening() {}

export function stop() {}

export default { isSupported, init, listen, stopListening, stop };
