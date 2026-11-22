/**
 * T4「语音识别与意图解析」自测页
 *
 * 打开方式：起本地服务器后访问 http://localhost:8000/tests/intents.test.html
 *
 * 三项检查：
 *   1. 60 条用例（12 意图 × 5 说法）逐条跑 parse()，表格列出输入/期望/实际/得分/通过
 *   2. 三态判定：高置信执行 / 中置信追问 / 低置信拒答
 *   3. 连续两次拒答 → degrade:on 事件真的被发出
 * 另加一项静态检查：intents.js 源码里不出现 window. / document.，保证可脱离浏览器测试
 */

import { parse, classify, stringDistance } from '../src/nlu/intents.js';
import * as asr from '../src/speech/asr.js';
import { on } from '../src/core/bus.js';
import { EVENTS } from '../src/core/contracts.js';

const $summary = document.getElementById('summary');
const $checks = document.getElementById('checks');
const $table = document.getElementById('table');

const results = [];
function ok(name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail });
  return !!cond;
}

/* ---------------- 1. 60 条用例 ---------------- */

let casesDoc = { cases: [] };
try {
  const res = await fetch('../content/intents.cases.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  casesDoc = await res.json();
} catch (err) {
  $summary.className = 'summary bad';
  $summary.textContent = `无法读取 content/intents.cases.json：${err.message}（是不是没起服务器？）`;
  throw err;
}

const rows = [];
for (const group of casesDoc.cases || []) {
  for (const say of group.say || []) {
    const got = parse(say);
    rows.push({
      intent: group.intent,
      say,
      expect: group.intent,
      actual: got.name,
      score: got.confidence,
      matched: got.matched,
      state: classify(got.confidence),
      pass: got.name === group.intent && got.confidence >= 0.65
    });
  }
}

const passed = rows.filter((r) => r.pass).length;
const total = rows.length;

/* ---------------- 2. 三态判定 ---------------- */

const triExec = parse('往前走');
const triConfirm = parse('往前走一点点呀');   // 与「往前走」距离 3-4，靠包含拿到 0.65 档附近
const triReject = parse('今天天气不错');

ok('三态：高置信判为执行', classify(triExec.confidence) === 'execute',
   `「${triExec.name}」得分 ${triExec.confidence}`);
ok('三态：拒答样本得分低于 0.55', triReject.confidence < 0.55,
   `「今天天气不错」得分 ${triReject.confidence}`);
ok('三态：中置信样本落在 0.55~0.85',
   triConfirm.confidence >= 0.55 && triConfirm.confidence < 0.85,
   `「往前走一点点呀」得分 ${triConfirm.confidence}`);

/* ---------------- 3. 连续两次拒答 → degrade:on ---------------- */

let degradeEvents = [];
const off = on(EVENTS.DEGRADE_ON, () => { degradeEvents.push(Date.now()); });
asr.reset();
asr.handleText('今天天气不错');
const afterOne = degradeEvents.length;
asr.handleText('随便说点什么');
const afterTwo = degradeEvents.length;
off();
asr.reset();

ok('第一次拒答不触发降级', afterOne === 0, `事件数 ${afterOne}`);
ok('连续两次拒答触发 degrade:on', afterTwo >= 1, `事件数 ${afterTwo}`);

/* ---------------- 4. 静态检查：纯粹性 ---------------- */

let pure = false;
let pureDetail = '未能读取源码';
try {
  const src = await (await fetch('../src/nlu/intents.js', { cache: 'no-store' })).text();
  const bad = src.match(/\b(window|document)\s*\./g);
  pure = !bad;
  pureDetail = bad ? `发现引用：${[...new Set(bad)].join(', ')}` : '未出现 window. / document.';
} catch (err) {
  pureDetail = err.message;
}
ok('intents.js 不依赖浏览器 API', pure, pureDetail);

/* ---------------- 5. 编辑距离自检 ---------------- */

ok('编辑距离：完全相同为 0', stringDistance('往前走', '往前走') === 0);
ok('编辑距离：一字之差为 1', stringDistance('往前走', '往前行') === 1);
ok('编辑距离：相邻交换算 1 次', stringDistance('前进', '进前') === 1,
   `实得 ${stringDistance('前进', '进前')}`);

/* ---------------- 渲染 ---------------- */

const allPass = passed === total && results.every((r) => r.pass);
$summary.className = 'summary ' + (allPass ? 'ok' : 'bad');
$summary.textContent = allPass
  ? `全部通过：${passed}/${total} 条用例 + ${results.length} 项检查`
  : `未全部通过：用例 ${passed}/${total}，检查 ${results.filter((r) => r.pass).length}/${results.length}`;

const stateLabel = { execute: '执行', confirm: '追问', reject: '拒答' };
const stateClass = { execute: 'exe', confirm: 'cfm', reject: 'rej' };

const failed = rows.filter((r) => !r.pass);
if (failed.length) {
  $checks.innerHTML =
    '<h2>未通过的用例</h2><table><tr><th>输入</th><th>期望</th><th>实际</th><th>得分</th><th>命中</th></tr>' +
    failed.map((r) =>
      `<tr class="f"><td>${r.say}</td><td>${r.expect}</td><td>${r.actual ?? '—'}</td>` +
      `<td>${r.score.toFixed(2)}</td><td class="d">${r.matched ?? '—'}</td></tr>`
    ).join('') + '</table>';
}

const checkHtml = '<h2>其他验收项</h2><ul class="checks">' + results.map((r) =>
  `<li>${r.pass ? '✅' : '❌'} ${r.name}<span class="d">　${r.detail}</span></li>`
).join('') + '</ul>';
$checks.innerHTML = ($checks.innerHTML || '') + checkHtml;

$table.innerHTML =
  '<h2>60 条用例明细</h2>' +
  '<table><tr><th>#</th><th>输入</th><th>期望意图</th><th>实际</th><th>得分</th><th>三态</th><th>命中同义词</th></tr>' +
  rows.map((r, i) =>
    `<tr class="${r.pass ? 'p' : 'f'}"><td>${i + 1}</td><td>${r.say}</td><td>${r.expect}</td>` +
    `<td>${r.actual ?? '—'}</td><td>${r.score.toFixed(2)}</td>` +
    `<td><span class="tag ${stateClass[r.state]}">${stateLabel[r.state]}</span></td>` +
    `<td class="d">${r.matched ?? '—'}</td></tr>`
  ).join('') + '</table>';

console.info('[T4] 自测完成', { 用例: `${passed}/${total}`, 检查: results.filter((r) => r.pass).length + '/' + results.length });
