/**
 * T6 · 无障碍支持 —— 【桩文件，待实现】
 *
 * 负责人：T6
 *
 * 这个模块存在的理由：我们做的是无障碍主题的作品，
 * 如果页面自身不能被屏幕阅读器读、不能全键盘操作，就自相矛盾。
 * （依据 docs/references.md 中 gamesforblindgamers 一条）
 *
 * 要做：
 *   - aria-live 区域：关键状态变化写进去，供屏幕阅读器播报
 *   - 全键盘可操作：所有按钮可 Tab 到、回车/空格可触发，焦点样式可见
 *   - 尊重 prefers-reduced-motion
 */

export function init() {
  console.warn('[T6] ui/a11y.js 尚未实现');
}

/** @param {string} text 要播报给屏幕阅读器的内容 */
export function announce(text) {}

export function prefersReducedMotion() {
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default { init, announce, prefersReducedMotion };
