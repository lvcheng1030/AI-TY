/**
 * T2「移动 · 碰撞 · 盲道判定」自测页
 *
 * 打开方式：起本地服务器后访问 http://localhost:8000/tests/world.test.html
 *
 * 不需要任何测试框架 —— 页面自己跑断言并列表显示。
 * 覆盖 docs/tasks.md 里 T2 的验收标准：
 *   - 点在线上的偏离为 0、点在 1.5 米外的偏离
 *   - 矩形碰撞的边界与墙角
 *   - 转角处的朝向换算
 *   - 行走速度与转身速度是否符合预期
 */

import * as vec from '../src/core/vec.js';
import * as scene from '../src/world/scene.js';
import * as collision from '../src/world/collision.js';
import * as player from '../src/world/player.js';

const results = [];
function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
}
function near(a, b, eps = 1e-6) { return Math.abs(a - b) <= eps; }

/* ---------------- 测试用场景 ---------------- */

const TEST_SCENE = {
  id: 'test',
  title: '测试场景',
  duration: [10, 20],
  start: { x: 0, z: 0, heading: 0 },
  tiles: [
    // 一条南北向的盲道，宽 1.2 米，从 z=0 到 z=40
    { type: 'tactile', points: [[0, 0], [0, 40]], width: 1.2 },
    // 大范围水泥地
    { type: 'concrete', rect: [-10, -5, 20, 50] },
    // 一片草地
    { type: 'grass', rect: [5, 10, 4, 10] }
  ],
  obstacles: [
    { id: 'bikes', rect: [-1.5, 14, 2.0, 1.0], sfx: 'blocked' }
  ],
  emitters: [],
  signs: [
    { id: 'sign1', pos: [0, 8], line: 'L_SIGN_01' },
    { id: 'sign2', pos: [0, 30], line: 'L_SIGN_02' }
  ],
  tasks: [
    { id: 'reach', type: 'reach', target: [0, 38], radius: 3 }
  ]
};

/* ---------------- 1. 几何工具 ---------------- */

{
  const d = vec.distToSegment({ x: 2, z: 5 }, { x: 0, z: 0 }, { x: 0, z: 10 });
  ok('distToSegment：点到线段距离', near(d.distance, 2), `得到 ${d.distance.toFixed(3)}，期望 2`);

  // 点在线段延长线外侧，应取到端点的距离
  const d2 = vec.distToSegment({ x: 0, z: 15 }, { x: 0, z: 0 }, { x: 0, z: 10 });
  ok('distToSegment：超出端点取端点距离', near(d2.distance, 5), `得到 ${d2.distance.toFixed(3)}，期望 5`);

  ok('headingToVec：0° 指向 -z（正北）',
     near(vec.headingToVec(0).x, 0) && near(vec.headingToVec(0).z, -1),
     JSON.stringify(vec.headingToVec(0)));

  ok('headingToVec：90° 指向 +x（正东）',
     near(vec.headingToVec(90).x, 1) && near(vec.headingToVec(90).z, 0),
     JSON.stringify(vec.headingToVec(90)));

  ok('vecToHeading：正东 -> 90', near(vec.vecToHeading({ x: 1, z: 0 }), 90),
     `得到 ${vec.vecToHeading({ x: 1, z: 0 })}`);

  ok('angleDiff：350° 与 10° 相差 20',
     near(Math.abs(vec.angleDiff(350, 10)), 20),
     `得到 ${vec.angleDiff(350, 10)}`);

  ok('normalize360：-90 -> 270', near(vec.normalize360(-90), 270),
     `得到 ${vec.normalize360(-90)}`);
}

/* ---------------- 2. 场景查询：路面与盲道偏离 ---------------- */

{
  scene.load(TEST_SCENE);

  ok('surfaceAt：盲道中心 -> tactile',
     scene.surfaceAt({ x: 0, z: 5 }) === 'tactile',
     scene.surfaceAt({ x: 0, z: 5 }));

  ok('surfaceAt：盲道边缘内（0.59m）-> tactile',
     scene.surfaceAt({ x: 0.59, z: 5 }) === 'tactile',
     scene.surfaceAt({ x: 0.59, z: 5 }));

  ok('surfaceAt：盲道外（0.61m）-> concrete',
     scene.surfaceAt({ x: 0.61, z: 5 }) === 'concrete',
     scene.surfaceAt({ x: 0.61, z: 5 }));

  ok('surfaceAt：草地区域 -> grass',
     scene.surfaceAt({ x: 6, z: 15 }) === 'grass',
     scene.surfaceAt({ x: 6, z: 15 }));

  ok('surfaceAt：区域外仍返回 concrete（不返回 null）',
     scene.surfaceAt({ x: 100, z: 100 }) === 'concrete',
     scene.surfaceAt({ x: 100, z: 100 }));

  const dev0 = scene.deviationFromPath({ x: 0, z: 5 });
  ok('deviationFromPath：中心线上为 0', near(dev0, 0, 1e-9), `得到 ${dev0}`);

  const dev2 = scene.deviationFromPath({ x: 2, z: 5 });
  ok('deviationFromPath：偏离 2 米', near(dev2, 2), `得到 ${dev2.toFixed(3)}`);

  const devAtEnd = scene.deviationFromPath({ x: 0, z: 45 });
  ok('deviationFromPath：超出盲道末端取端点距离',
     near(devAtEnd, 5), `得到 ${devAtEnd.toFixed(3)}，期望 5`);

  const s = scene.nearestSign({ x: 0, z: 7 }, 3);
  ok('nearestSign：3 米内能取到 sign1', s && s.id === 'sign1', JSON.stringify(s));

  const s2 = scene.nearestSign({ x: 0, z: 20 }, 3);
  ok('nearestSign：3 米内无牌子时返回 null', s2 === null, JSON.stringify(s2));
}

/* ---------------- 3. 碰撞 ---------------- */

{
  const obs = [{ id: 'bikes', rect: [-1.5, 14, 2.0, 1.0] }];   // x:-1.5~0.5, z:14~15
  const R = 0.35;

  // 从南侧撞上去：期望被挡在 z = 14 - 0.35 = 13.65
  const hitS = collision.resolve({ x: -0.5, z: 14.1 }, R, obs);
  ok('碰撞：从南侧进入被推出', hitS.hit && hitS.obstacleId === 'bikes',
     JSON.stringify(hitS));
  ok('碰撞：推出后不再相交',
     collision.intersects({ x: hitS.x, z: hitS.z }, R, obs) === null,
     `位置 (${hitS.x.toFixed(2)}, ${hitS.z.toFixed(2)})`);

  // 远离障碍物时不应有修正
  const far = collision.resolve({ x: 5, z: 5 }, R, obs);
  ok('碰撞：远离时不修正', !far.hit && near(far.x, 5) && near(far.z, 5), JSON.stringify(far));

  // 圆心恰在矩形内部：应被推到最近的边外
  const inside = collision.resolve({ x: -0.5, z: 14.5 }, R, obs);
  ok('碰撞：圆心在矩形内部也能推出',
     !collision.intersects({ x: inside.x, z: inside.z }, R, obs),
     `推出到 (${inside.x.toFixed(2)}, ${inside.z.toFixed(2)})`);

  // 墙角：两个矩形相邻，验证多次迭代不卡住
  const corner = [
    { id: 'a', rect: [-1, 0, 1, 1] },
    { id: 'b', rect: [0, 0, 1, 1] }
  ];
  const c2 = collision.resolve({ x: 0, z: 0.5 }, R, corner);
  ok('碰撞：矩形夹缝中多次迭代能脱出',
     collision.intersects({ x: c2.x, z: c2.z }, R, corner) === null,
     `推出到 (${c2.x.toFixed(2)}, ${c2.z.toFixed(2)})`);
}

/* ---------------- 4. 移动积分（纯函数，可脱离浏览器） ---------------- */

{
  const C = player.CONFIG;

  // 前进 1 秒，朝北（0°），应往 -z 走 WALK_SPEED 米
  const s1 = player.integrate({ x: 0, z: 0, heading: 0 }, { forward: true }, 1);
  ok('integrate：向北走 1 秒的距离',
     near(s1.z, -C.WALK_SPEED, 1e-6) && near(s1.x, 0, 1e-6),
     `到达 (${s1.x.toFixed(3)}, ${s1.z.toFixed(3)})，期望 z=${-C.WALK_SPEED}`);

  // 朝东（90°）前进 1 秒，应往 +x 走
  const s2 = player.integrate({ x: 0, z: 0, heading: 90 }, { forward: true }, 1);
  ok('integrate：向东走 1 秒',
     near(s2.x, C.WALK_SPEED, 1e-6) && near(s2.z, 0, 1e-6),
     `到达 (${s2.x.toFixed(3)}, ${s2.z.toFixed(3)})`);

  // 后退比前进慢
  const s3 = player.integrate({ x: 0, z: 0, heading: 0 }, { back: true }, 1);
  ok('integrate：后退速度慢于前进',
     near(s3.z, C.BACK_SPEED, 1e-6),
     `后退 ${s3.z.toFixed(3)}，前进 ${C.WALK_SPEED}，后退配置 ${C.BACK_SPEED}`);

  // 转身速度：左转 1 秒应转 90°，即 0 -> 270（逆时针减角度）
  const s4 = player.integrate({ x: 0, z: 0, heading: 0 }, { turnLeft: true }, 1);
  ok('integrate：左转 1 秒 = 90°（0 -> 270）',
     near(s4.heading, 270, 1e-6),
     `得到 ${s4.heading.toFixed(2)}°`);

  const s5 = player.integrate({ x: 0, z: 0, heading: 0 }, { turnRight: true }, 1);
  ok('integrate：右转 1 秒 = 90°（0 -> 90）',
     near(s5.heading, 90, 1e-6),
     `得到 ${s5.heading.toFixed(2)}°`);

  // 同时按前进与后退应抵消
  const s6 = player.integrate({ x: 0, z: 0, heading: 0 }, { forward: true, back: true }, 1);
  ok('integrate：同时按前后互相抵消',
     near(s6.z, 0) && near(s6.x, 0),
     `得到 (${s6.x.toFixed(3)}, ${s6.z.toFixed(3)})`);

  // 叠加多帧应与单帧大 dt 一致（固定步长的意义）
  let acc = { x: 0, z: 0, heading: 45 };
  for (let i = 0; i < 60; i++) acc = player.integrate(acc, { forward: true }, 1 / 60);
  const once = player.integrate({ x: 0, z: 0, heading: 45 }, { forward: true }, 1);
  ok('integrate：60×(1/60 秒) ≈ 1×1 秒（步长无关性）',
     Math.abs(acc.z - once.z) < 1e-9 && Math.abs(acc.x - once.x) < 1e-9,
     `分步 (${acc.x.toFixed(6)}, ${acc.z.toFixed(6)}) vs 一次 (${once.x.toFixed(6)}, ${once.z.toFixed(6)})`);
}

/* ---------------- 5. 纯逻辑边界 ---------------- */

{
  // 零向量与极端输入不应产生 NaN
  const z = vec.norm({ x: 0, z: 0 });
  ok('norm：零向量不返回 NaN', Number.isFinite(z.x) && Number.isFinite(z.z), JSON.stringify(z));

  const h = vec.headingToVec(720);
  ok('headingToVec：超范围角度仍有效', Number.isFinite(h.x) && Number.isFinite(h.z), JSON.stringify(h));

  // 未载入场景时的降级行为
  scene.reset();
  ok('未载入场景：surfaceAt 返回 concrete 而非崩溃',
     scene.surfaceAt({ x: 0, z: 0 }) === 'concrete');
  ok('未载入场景：deviationFromPath 返回 Infinity',
     scene.deviationFromPath({ x: 0, z: 0 }) === Infinity);
}

/* ---------------- 渲染结果 ---------------- */

const pass = results.filter(r => r.pass).length;
const fail = results.length - pass;

document.title = fail === 0 ? `全部通过 (${pass})` : `失败 ${fail} / ${results.length}`;

const el = document.getElementById('out');
el.innerHTML = `
  <div class="summary ${fail === 0 ? 'ok' : 'bad'}">
    ${fail === 0 ? '✓ 全部通过' : '✗ 有失败项'} — ${pass}/${results.length}
  </div>
  <table>
    <tr><th>结果</th><th>用例</th><th>详情</th></tr>
    ${results.map(r => `
      <tr class="${r.pass ? 'p' : 'f'}">
        <td>${r.pass ? '✓' : '✗'}</td>
        <td>${r.name}</td>
        <td class="d">${r.detail}</td>
      </tr>`).join('')}
  </table>
`;

console.log(`[world.test] ${pass}/${results.length} 通过`);
if (fail > 0) console.error('[world.test] 失败项：', results.filter(r => !r.pass));
