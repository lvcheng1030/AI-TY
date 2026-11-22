/**
 * T2 · 场景加载与空间查询
 *
 * 负责人：T2（见 docs/tasks.md）
 * 字段定义：content/schema.md 与 src/core/contracts.js 的 SceneJson
 *
 * 本模块是【纯逻辑】：不碰 DOM、不碰音频、不发事件。
 * 这样几何与判定能在 Node 或测试页里直接跑断言，不必启动浏览器。
 */

import { distToPolyline, pointInRect, vec } from '../core/vec.js';

/** 当前场景的内部结构 */
let current = null;

/**
 * 解析并载入场景。
 * @param {Object} sceneJson 见 content/schema.md
 * @returns {Object|null} 内部结构；失败返回 null
 */
export function load(sceneJson) {
  if (!sceneJson || typeof sceneJson !== 'object') {
    console.error('[T2] load() 收到空场景');
    return null;
  }

  // 盲道：折线 + 宽度。单独存是因为它要参与「偏离距离」计算，
  // 而矩形区域只需要判断点是否落在范围内。
  const tactilePaths = [];
  // 矩形区域按 JSON 原顺序保存，查询时逆序遍历（后定义的覆盖先定义的）
  const rects = [];

  for (const tile of (sceneJson.tiles || [])) {
    if (!tile || !tile.type) continue;

    if (tile.type === 'tactile' && Array.isArray(tile.points) && tile.points.length >= 2) {
      tactilePaths.push({
        points: tile.points.map(([x, z]) => vec(x, z)),
        width: typeof tile.width === 'number' ? tile.width : 1.2
      });
    } else if (Array.isArray(tile.rect) && tile.rect.length === 4) {
      rects.push({ type: tile.type, rect: tile.rect });
    }
  }

  current = {
    json: sceneJson,
    id: sceneJson.id || 'unknown',
    title: sceneJson.title || '',
    start: sceneJson.start || { x: 0, z: 0, heading: 0 },
    tactilePaths,
    rects,
    obstacles: (sceneJson.obstacles || []).filter(o => o && o.id && Array.isArray(o.rect)),
    emitters: (sceneJson.emitters || []).filter(e => e && Array.isArray(e.pos)),
    signs: (sceneJson.signs || []).filter(s => s && Array.isArray(s.pos)),
    tasks: (sceneJson.tasks || []).filter(t => t && t.id)
  };

  return current;
}

/** 当前场景内部结构；未载入时为 null */
export function getCurrent() {
  return current;
}

/**
 * 该点是什么路面。
 *
 * 优先级：盲道 > 矩形区域（后定义覆盖先定义）> 默认 concrete。
 *
 * 盲道优先是有意为之：物理上它就铺在路面之上；
 * 而且如果靠 JSON 顺序去保证优先级，迟早会有人填错顺序。
 *
 * @param {{x:number,z:number}} pos
 * @returns {string} 'tactile' | 'concrete' | 'grass'
 */
export function surfaceAt(pos) {
  if (!current) return 'concrete';

  for (const path of current.tactilePaths) {
    if (distToPolyline(pos, path.points) <= path.width / 2) return 'tactile';
  }

  for (let i = current.rects.length - 1; i >= 0; i--) {
    if (pointInRect(pos, current.rects[i].rect)) return current.rects[i].type;
  }

  return 'concrete';
}

/**
 * 该点偏离盲道【中心线】多远（米）。
 *
 * 注意是到中心线的距离，不是到边缘的距离：
 * 盲道宽 1.2 米，站在正中返回 0，站在边缘返回 0.6。
 * 提示阈值取 1.5 米，意味着玩家已经明显走出盲道。
 *
 * @param {{x:number,z:number}} pos
 * @returns {number} 距离；场景内没有盲道时返回 Infinity
 */
export function deviationFromPath(pos) {
  if (!current || current.tactilePaths.length === 0) return Infinity;

  let best = Infinity;
  for (const path of current.tactilePaths) {
    const d = distToPolyline(pos, path.points);
    if (d < best) best = d;
  }
  return best;
}

/** 是否站在盲道带内 */
export function onTactile(pos) {
  if (!current) return false;
  for (const path of current.tactilePaths) {
    if (distToPolyline(pos, path.points) <= path.width / 2) return true;
  }
  return false;
}

/**
 * 附近的告示牌。
 *
 * 用距离而不是朝向判断：玩家背对着牌子也应该能问"这附近有牌子吗"。
 * 真实场景里盲人也是先问有没有，再转身去听。
 *
 * @param {{x:number,z:number}} pos
 * @param {number} [radius=3] 米
 */
export function nearestSign(pos, radius = 3) {
  if (!current) return null;
  let best = null;
  let bestD = radius;
  for (const sign of current.signs) {
    const d = Math.hypot(pos.x - sign.pos[0], pos.z - sign.pos[1]);
    if (d <= bestD) { bestD = d; best = sign; }
  }
  return best;
}

/** 按 id 找告示牌 */
export function signById(id) {
  if (!current) return null;
  return current.signs.find(s => s.id === id) || null;
}

/** 复位（测试用） */
export function reset() {
  current = null;
}

export default {
  load, getCurrent, surfaceAt, deviationFromPath,
  onTactile, nearestSign, signById, reset
};
