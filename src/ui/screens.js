/**
 * T6 · 界面屏幕 —— 【桩文件，待实现】
 *
 * 负责人：见 docs/tasks.md 的 T6
 * 你拥有：src/ui/screens.js、src/ui/a11y.js
 *
 * 四个屏幕：开始页 → 校准页 → 游戏中 → 结算页
 * 用 hidden 属性切换，不引入路由库。
 *
 * 关键约定：
 *   - 游戏中【屏幕全黑】，这是作品的立意，不要加任何画面装饰
 *   - 点「开始」的那一下要同时负责解锁 AudioContext（浏览器策略）
 *   - 必须做 30 秒方位校准页：空间音频个体差异极大
 *     （依据 docs/test-log.md T-001）
 */

export function init() {
  console.warn('[T6] ui/screens.js 尚未实现');
}

export function show(name) {}
export function setStatus() {}
export function showResult() {}

export default { init, show, setStatus, showResult };
