/**
 * T2 · 碰撞
 *
 * 负责人：T2
 *
 * 【纯函数模块】：输入位置与障碍列表，输出修正后的位置。
 * 不读写 DOM、不播声音 —— 撞击音由 player.js 发 player:blocked 事件，
 * 再由 T1 的音频引擎响应。
 *
 * ⚠️ 为什么不用「逐个矩形贪心推开」：
 * 相邻的两个矩形会把玩家往相反方向推，来回震荡，
 * 最终可能停在障碍物【内部】—— 表现就是卡进墙里。
 * 正确做法见 resolve()：生成候选 → 过滤 → 选最近。
 */

import { pushOutOfRect, dist } from '../core/vec.js';

/** 已载入的障碍物 */
let obstacles = [];

/** 位置容差：pushOutOfRect 会把人恰好推到「距离 = 半径」处，
 *  此时用严格小于判定会因浮点误差算作仍然相交，表现为贴墙抖动。 */
const EPS = 1e-9;

/**
 * 载入障碍物。
 * @param {Array<{id:string, rect:number[]}>} list
 */
export function loadObstacles(list) {
  obstacles = Array.isArray(list)
    ? list.filter(o => o && o.id && Array.isArray(o.rect) && o.rect.length === 4)
    : [];
  return obstacles;
}

export function getObstacles() {
  return obstacles;
}

/** 单个矩形是否与该位置相交 */
export function hitsRect(pos, radius, rect) {
  const [rx, rz, rw, rh] = rect;
  const nx = Math.max(rx, Math.min(pos.x, rx + rw));
  const nz = Math.max(rz, Math.min(pos.z, rz + rh));
  return dist(pos, { x: nx, z: nz }) < radius - EPS;
}

/**
 * 该位置是否与任一障碍物相交（不做修正）。
 * @returns {string|null} 相交的障碍物 id
 */
export function intersects(pos, radius, list) {
  const obs = list || obstacles;
  for (const o of obs) {
    if (hitsRect(pos, radius, o.rect)) return o.id;
  }
  return null;
}

/**
 * 围绕一个矩形生成四个「推到外面」的候选位置。
 * 每个候选只在一个轴上移动，因此都是最小的单轴修正。
 */
function candidatesAround(pos, radius, rect) {
  const [rx, rz, rw, rh] = rect;
  return [
    { x: pos.x, z: rz - radius },          // 北侧推出
    { x: pos.x, z: rz + rh + radius },     // 南侧推出
    { x: rx - radius, z: pos.z },          // 西侧推出
    { x: rx + rw + radius, z: pos.z }      // 东侧推出
  ];
}

/**
 * 把位置从障碍物中推出来。
 *
 * 算法：对每个被侵入的矩形生成 4 个候选位置，
 * 丢弃仍然与【任何】障碍物相交的候选，
 * 再从剩下的里选离原始目标最近的。
 *
 * 这样相邻矩形不再互相打架：夹在两块之间的玩家会被推到
 * 「离开整个障碍群最近的那一面」，而不是在两块之间来回弹。
 *
 * @param {{x:number,z:number}} pos 期望到达的位置
 * @param {number} radius 玩家半径（米）
 * @param {Array<{id:string,rect:number[]}>} [list] 不传则用已载入的
 * @returns {{x:number, z:number, hit:boolean, obstacleId:string|null}}
 */
export function resolve(pos, radius, list) {
  const obs = list || obstacles;
  if (obs.length === 0) return { x: pos.x, z: pos.z, hit: false, obstacleId: null };

  // 没碰到任何东西：原样放行
  if (!intersects(pos, radius, obs)) {
    return { x: pos.x, z: pos.z, hit: false, obstacleId: null };
  }

  // 收集候选，只保留「推出去之后完全自由」的那些
  const touched = obs.filter(o => hitsRect(pos, radius, o.rect));
  let best = null;
  let bestId = null;
  let bestDist = Infinity;

  for (const o of touched) {
    for (const c of candidatesAround(pos, radius, o.rect)) {
      if (intersects(c, radius, obs)) continue;      // 仍与别的障碍物相交，丢弃
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d < bestDist) { bestDist = d; best = c; bestId = o.id; }
    }
  }

  if (best) return { x: best.x, z: best.z, hit: true, obstacleId: bestId };

  // 兜底：所有单轴候选都不自由（例如被塞进很窄的缝隙）。
  // 退化为迭代推开，尽量让他出来；可能仍相交，但不会卡死不动。
  let x = pos.x;
  let z = pos.z;
  const firstId = touched[0] ? touched[0].id : null;

  for (let iter = 0; iter < 8; iter++) {
    let moved = false;
    for (const o of obs) {
      const r = pushOutOfRect({ x, z }, radius, o.rect);
      if (r.hit && (Math.abs(r.x - x) > 1e-9 || Math.abs(r.z - z) > 1e-9)) {
        x = r.x; z = r.z; moved = true;
      }
    }
    if (!moved) break;
  }

  return { x, z, hit: true, obstacleId: firstId };
}

/** 复位（测试用） */
export function reset() {
  obstacles = [];
}

export default { loadObstacles, getObstacles, resolve, intersects, reset };
