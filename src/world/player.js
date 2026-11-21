/**
 * T2 · 玩家移动与朝向 —— 【桩文件，待实现】
 *
 * 负责人：见 docs/tasks.md 的 T2
 * 你拥有：src/world/player.js、src/world/collision.js、src/world/scene.js、tests/world.test.html
 *
 * 硬性要求：
 *   - 键盘【永远可用】。语音是叠加层，不是唯一入口（现场噪音大，这是保命设计）
 *   - 几何与碰撞逻辑必须与 DOM / 音频解耦，导出纯函数，可单独测试
 *   - 状态变化才发 surface:changed，不要每帧都发
 */

export function init() {
  console.warn('[T2] world/player.js 尚未实现');
  return { x: 0, z: 0, heading: 0, surface: 'concrete' };
}

export function update() {}
export function stop() {}
export function getState() {
  return { x: 0, z: 0, heading: 0, surface: 'concrete' };
}
export function setPosition() {}
export function teleport() {}

export default { init, update, stop, getState, setPosition, teleport };
