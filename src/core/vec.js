/**
 * 二维向量与角度工具。
 *
 * 坐标约定（全项目统一，不要另立一套）：
 *   x → 向东为正
 *   z → 向南为正
 *   heading → 朝向角度，单位「度」，0 = 正北（-z 方向），顺时针增大
 *
 * 为什么用 {x, z} 而不是 {x, y}：
 * 地面是平面，用 z 表示纵深，避免和屏幕坐标的 y 混淆，
 * 也让后续接 Web Audio 的 PannerNode（它用 x/y/z）时不容易搞错。
 */

/**
 * @typedef {{x:number, z:number}} Vec2
 */

/** @returns {Vec2} */
export function vec(x = 0, z = 0) {
  return { x, z };
}

/** 两点距离 */
export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** a - b */
export function sub(a, b) {
  return { x: a.x - b.x, z: a.z - b.z };
}

/** 向量长度 */
export function len(v) {
  return Math.hypot(v.x, v.z);
}

/** 单位化。零向量返回 {0,0}，不返回 NaN。 */
export function norm(v) {
  const l = len(v);
  if (l === 0) return { x: 0, z: 0 };
  return { x: v.x / l, z: v.z / l };
}

/** 数乘 */
export function scale(v, k) {
  return { x: v.x * k, z: v.z * k };
}

/** 点积 */
export function dot(a, b) {
  return a.x * b.x + a.z * b.z;
}

/** 按 heading（度）得到前方向量。0 度 = 正北 = (0, -1) */
export function headingToVec(headingDeg) {
  const r = (headingDeg * Math.PI) / 180;
  return { x: Math.sin(r), z: -Math.cos(r) };
}

/** 从位移方向求 heading（度，0~360） */
export function vecToHeading(v) {
  const deg = (Math.atan2(v.x, -v.z) * 180) / Math.PI;
  return normalize360(deg);
}

/** 把任意角度归一到 [0, 360) */
export function normalize360(deg) {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/**
 * 两个角度之间的最小夹角，结果范围 (-180, 180]。
 * 用于判断「声源是否在前方」「是否已经转身到位」。
 */
export function angleDiff(a, b) {
  let d = normalize360(a - b);
  if (d > 180) d -= 360;
  return d;
}

/**
 * 目标方向相对当前朝向的方位角差（度）。
 *   0    = 正前方
 *   +90  = 右手边（东）
 *   -90  = 左手边（西）
 *   ±180 = 正后方（**注意**：不要用它做需要玩家分辨的设计，见 docs/test-log.md T-001）
 */
export function bearingTo(from, fromHeading, to) {
  const targetHeading = vecToHeading(sub(to, from));
  return angleDiff(targetHeading, fromHeading);
}

/** 两点连线与 heading 方向的夹角（度），取绝对值 */
export function absBearingTo(from, fromHeading, to) {
  return Math.abs(bearingTo(from, fromHeading, to));
}

/** 点是否在以 origin 为顶点、朝向 heading、半角 halfAngleDeg 的扇形内 */
export function inCone(from, fromHeading, to, halfAngleDeg, maxDistance = Infinity) {
  if (dist(from, to) > maxDistance) return false;
  return absBearingTo(from, fromHeading, to) <= halfAngleDeg;
}

/**
 * 点到线段的最短距离，以及投影参数 t（0~1）。
 * 盲道是一条带子，判定「偏离中心线多远」要用这个。
 * @returns {{distance:number, t:number, proj:Vec2}}
 */
export function distToSegment(p, a, b) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const l2 = abx * abx + abz * abz;

  let t = 0;
  if (l2 > 0) {
    t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / l2;
    t = Math.max(0, Math.min(1, t));
  }
  const proj = { x: a.x + abx * t, z: a.z + abz * t };
  return { distance: dist(p, proj), t, proj };
}

/** 点到折线（多段线）的最短距离 */
export function distToPolyline(p, points) {
  if (!points || points.length === 0) return Infinity;
  if (points.length === 1) return dist(p, points[0]);

  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const r = distToSegment(p, points[i], points[i + 1]);
    if (r.distance < best) best = r.distance;
  }
  return best;
}

/** 点是否在矩形内。rect 格式：[x, z, w, h]，x/z 为左上角（最小坐标） */
export function pointInRect(p, rect) {
  const [rx, rz, rw, rh] = rect;
  return p.x >= rx && p.x <= rx + rw && p.z >= rz && p.z <= rz + rh;
}

/** 两个矩形是否相交 */
export function rectsOverlap(a, b) {
  return !(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] ||
           a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
}

/** 把圆推出矩形（碰撞回退）。返回修正后的位置。 */
export function pushOutOfRect(p, radius, rect) {
  const [rx, rz, rw, rh] = rect;
  const nearestX = Math.max(rx, Math.min(p.x, rx + rw));
  const nearestZ = Math.max(rz, Math.min(p.z, rz + rh));
  const dx = p.x - nearestX;
  const dz = p.z - nearestZ;
  const d = Math.hypot(dx, dz);

  if (d > radius) return { x: p.x, z: p.z, hit: false };

  if (d === 0) {
    // 圆心已在矩形内部：往最近的边推出去
    const left = p.x - rx, right = rx + rw - p.x;
    const top = p.z - rz, bottom = rz + rh - p.z;
    const min = Math.min(left, right, top, bottom);
    if (min === left)   return { x: rx - radius, z: p.z, hit: true };
    if (min === right)  return { x: rx + rw + radius, z: p.z, hit: true };
    if (min === top)    return { x: p.x, z: rz - radius, hit: true };
    return { x: p.x, z: rz + rh + radius, hit: true };
  }

  const k = radius / d;
  return { x: nearestX + dx * k, z: nearestZ + dz * k, hit: true };
}

export default {
  vec, dist, sub, len, norm, scale, dot,
  headingToVec, vecToHeading, normalize360, angleDiff,
  bearingTo, absBearingTo, inCone,
  distToSegment, distToPolyline,
  pointInRect, rectsOverlap, pushOutOfRect
};
