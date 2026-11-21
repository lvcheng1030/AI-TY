/**
 * T2 · 场景加载 —— 【桩文件，待实现】
 *
 * 负责人：T2
 * 负责把 content/scene1.json 解析成内部结构，并提供两个查询：
 *   - surfaceAt(pos)      该点是什么路面
 *   - deviationFromPath() 该点偏离盲道中心线多远
 *
 * 数据格式见 src/core/contracts.js 的 SceneJson 与 content/schema.md。
 */

export function load(sceneJson) {
  console.warn('[T2] world/scene.js 尚未实现');
  return null;
}

export function surfaceAt() {
  return 'concrete';
}

/** @returns {number} 偏离盲道中心线的距离（米）；不在场景内返回 Infinity */
export function deviationFromPath() {
  return Infinity;
}

export function getCurrent() {
  return null;
}

export default { load, surfaceAt, deviationFromPath, getCurrent };
