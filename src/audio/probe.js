/**
 * T1 · 前向锥形探测（把世界几何适配成音频需要的探测结果）
 *
 * 负责人：T1
 *
 * 为什么这个文件放在 src/audio/ 而不是 src/world/：
 * 探测是「世界几何 + 敲杖语义」的结合体。engine.js 需要它，但音频模块
 * 不应该知道世界数据结构。放在这里形成单向依赖 audio → world，
 * 同时不必去改 T2 的文件（遵守 docs/CONVENTIONS.md 的文件归属约定）。
 *
 * 探测范围是【前向 ±45° 锥形】，依据 docs/test-log.md T-001：
 *   - 人耳分不出正前与正后，所以机制上就只问"前方有没有"
 *   - 这也与真实盲杖的用法一致：杖尖只探身前一片扇形
 */

import { bearingTo, dist, pointInRect } from '../core/vec.js';
import * as scene from '../world/scene.js';

/**
 * 探测 from 前方锥形范围内最近的障碍物。
 *
 * @param {{x:number,z:number,heading:number}} from 敲杖位置与朝向
 * @param {number} halfAngle 锥形半角（度），engine.js 传 45
 * @param {number} range 最大距离（米），engine.js 传 8
 * @returns {{hit:boolean, distance:number, bearingDeg:number,
 *            surface:string|null, obstacleId:string|null}}
 */
export function probeCone(from, halfAngle = 45, range = 8) {
  const empty = { hit: false, distance: Infinity, bearingDeg: 0, surface: null, obstacleId: null };
  if (!from) return empty;

  const current = scene.getCurrent();
  if (!current) return empty;

  let best = null;

  for (const o of current.obstacles) {
    // 矩形到点的最近距离：先夹到矩形范围，再算欧氏距离
    const [rx, rz, rw, rh] = o.rect;
    const nx = Math.max(rx, Math.min(from.x, rx + rw));
    const nz = Math.max(rz, Math.min(from.z, rz + rh));
    const d = dist(from, { x: nx, z: nz });

    if (d > range) continue;

    // 方位必须在锥形内。用矩形的最近点而不是中心点来算方位 ——
    // 长条形障碍物（例如一排自行车）的中心可能偏出锥形，
    // 但它的近端明明就在正前方。
    const bearing = bearingTo(from, from.heading, { x: nx, z: nz });
    if (Math.abs(bearing) > halfAngle) continue;

    if (!best || d < best.distance) {
      best = { distance: d, bearingDeg: bearing, obstacleId: o.id, at: { x: nx, z: nz } };
    }
  }

  if (!best) {
    // 没撞到障碍物：仍然报告前方地面的材质。
    // 这很有用 —— 玩家敲一下能知道"前面是盲道还是水泥"。
    const ahead = pointAhead(from, Math.min(range, 3));
    return {
      hit: false,
      distance: Infinity,
      bearingDeg: 0,
      surface: scene.surfaceAt(ahead),
      obstacleId: null
    };
  }

  return {
    hit: true,
    distance: best.distance,
    bearingDeg: best.bearingDeg,
    surface: scene.surfaceAt(best.at),
    obstacleId: best.obstacleId
  };
}

/** 沿朝向取前方 distance 米处的点 */
function pointAhead(from, distance) {
  const rad = (from.heading * Math.PI) / 180;
  return {
    x: from.x + Math.sin(rad) * distance,
    z: from.z - Math.cos(rad) * distance
  };
}

export default { probeCone };
