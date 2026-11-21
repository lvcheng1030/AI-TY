/**
 * T7 · 单局生命周期 —— 【桩文件，待实现】
 *
 * 负责人：T7
 *
 * 负责：start / end / reset，以及结算数据汇总。
 *
 * 最容易出的 bug：重开一局时残留上一局的定时器与事件监听，
 * 导致第二局出现重复播报。reset() 必须清干净。
 */

export function init() {
  console.warn('[T7] game/session.js 尚未实现');
}

export function start() {}
export function end() {}
export function reset() {}

export function getStats() {
  return {
    elapsed: 0, tasksDone: 0, tasksTotal: 0,
    caneProbes: 0, hints: 0, asrFailures: 0, completed: false
  };
}

export default { init, start, end, reset, getStats };
