/**
 * T7 · 任务判定 —— 【桩文件，待实现】
 *
 * 负责人：见 docs/tasks.md 的 T7
 * 你拥有：src/game/tasks.js、src/game/session.js
 *
 * 三类任务：
 *   reach  到达目标点半径内
 *   read   读了指定告示牌
 *   avoid  绕过障碍后重新回到盲道上（场景 1 的核心任务）
 *
 * 硬性要求：判定必须是纯函数，且【每个任务只允许完成一次】。
 * 反复走进目标点不能重复触发 —— 那会导致台词重复播报。
 */

export function init() {
  console.warn('[T7] game/tasks.js 尚未实现');
}

/**
 * @param {Object} task 来自 scene1.json
 * @param {Object} playerState {x, z, heading, surface}
 * @param {Object} worldState  {deviation, nearbySignId, ...}
 * @returns {boolean}
 */
export function check(task, playerState, worldState) {
  return false;
}

export function reset() {}

export function stats() {
  return { tasksDone: 0, tasksTotal: 0 };
}

export default { init, check, reset, stats };
