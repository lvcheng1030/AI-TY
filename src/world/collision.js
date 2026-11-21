/**
 * T2 · 碰撞 —— 【桩文件，待实现】
 *
 * 负责人：T2
 * 必须是纯函数：输入位置与障碍列表，输出修正后的位置与是否撞击。
 * 不读写 DOM，不播声音——撞击音由 engine.js 通过 player:blocked 事件处理。
 */

export function loadObstacles() {}

/**
 * @param {{x:number,z:number}} pos
 * @param {number} radius
 * @param {Array<{id:string, rect:number[]}>} obstacles
 * @returns {{x:number, z:number, hit:boolean, obstacleId:string|null}}
 */
export function resolve(pos, radius, obstacles) {
  return { x: pos.x, z: pos.z, hit: false, obstacleId: null };
}

export default { loadObstacles, resolve };
