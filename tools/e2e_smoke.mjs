/**
 * 本机试运行：用 CDP 驱动无头 Edge 走一遍完整流程，并截图。
 * 运行：先起 8000 端口的静态服务器，再 node tools/e2e_smoke.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:9333';
const URL_GAME = 'http://127.0.0.1:8000/';
const OUT = new URL('../materials/screenshots/', import.meta.url);
mkdirSync(OUT, { recursive: true });

const list = await (await fetch(`${BASE}/json/list`)).json();
const page = list.find(t => t.type === 'page');
if (!page) throw new Error('no page target');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
const logs = [];
const errors = [];

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[${m.params.type}] ${text}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push(m.params.entry.text);
  }
};

function send(method, params = {}) {
  return new Promise((res, rej) => {
    const i = ++seq;
    pending.set(i, (m) => (m.error ? rej(new Error(`${method}: ${JSON.stringify(m.error)}`)) : res(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function evalJs(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
}

async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = new URL(`./${name}.png`, OUT);
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('SHOT', name);
}

async function click(sel) {
  const ok = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  if (!ok) console.log('MISS click', sel);
  return ok;
}

const state = {};

await send('Page.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Log.enable');

await send('Page.navigate', { url: URL_GAME });
await wait(2000);
logs.length = 0;
errors.length = 0;

state.title = await evalJs('document.title');
state.hasApp = await evalJs("!!document.querySelector('.t6-root')");
await shot('run-01-start');

/* 开始页 → 耳机检查 → 开始 */
await click('#t6-ear-left');
await wait(300);
await click('[data-answer="both"]');
await wait(300);
await click('#t6-start-btn');
await wait(1200);
state.screenAfterStart = await evalJs("document.querySelector('.t6-screen:not([hidden])')?.id || document.querySelector('.t6-screen:not([hidden])')?.className || null");
await shot('run-02-calibrate');

/* 校准：三步 */
for (let i = 0; i < 3; i++) {
  const clicked = await click('#t6-cal-next');
  await wait(700);
  if (!clicked) break;
}
await click('#t6-cal-finish');
await wait(1500);
state.screenInGame = await evalJs("document.querySelector('.t6-screen:not([hidden])')?.id || null");
state.sessionRunning = await evalJs("import('/src/game/session.js').then(m => m.isRunning())", true);
state.playerBefore = await evalJs("import('/src/world/player.js').then(m => { const s = m.getState(); return {x: +s.x.toFixed(2), z: +s.z.toFixed(2)}; })", true);
await shot('run-03-game');

/* 事件采集 */
await evalJs(`window.__ev = []; ['cane:probe','task:done','speak','speak:started','speak:ended','session:end','surface:changed'].forEach(n => window.__bus.on(n, p => window.__ev.push([n, p]))); true`);

/* 键盘：按住 W 1.2 秒 */
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
await wait(1200);
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'KeyW', key: 'w', windowsVirtualKeyCode: 87 });
await wait(300);
state.playerAfterW = await evalJs("import('/src/world/player.js').then(m => { const s = m.getState(); return {x: +s.x.toFixed(2), z: +s.z.toFixed(2)}; })", true);

/* 敲杖 */
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });
await wait(800);
state.probe = await evalJs('window.__ev.filter(e => e[0] === "cane:probe").map(e => e[1])');

/* 读牌：走到 sign_bikes 旁边，点面板按钮 */
await evalJs("import('/src/world/player.js').then(m => m.teleport(1.1, -5.6, 0))", true);
await wait(300);
await click('#t6-panel-toggle');
await wait(300);
await click('button[data-cmd="帮我读一下前方告示牌"]');
await wait(1200);
state.afterRead = await evalJs("import('/src/game/tasks.js').then(m => m.getProgress())", true);
state.speakAfterRead = await evalJs('window.__ev.filter(e => e[0] === "speak").map(e => e[1].lineId)');

/* 绕行任务：靠近 → 离开盲道 → 回到盲道 */
await evalJs("import('/src/world/player.js').then(m => m.teleport(0, -6, 0))", true);
await wait(400);
await evalJs("import('/src/world/player.js').then(m => m.teleport(2, -6.5, 0))", true);
await wait(400);
await evalJs("import('/src/world/player.js').then(m => m.teleport(0, -9, 0))", true);
await wait(800);
state.afterAvoid = await evalJs("import('/src/game/tasks.js').then(m => m.getProgress())", true);

/* 到终点：等到达台词播完、结算页出现（最多 20 秒） */
await evalJs("import('/src/world/player.js').then(m => m.teleport(-15, -23, 0))", true);
for (let i = 0; i < 40; i++) {
  await wait(500);
  const done = await evalJs("document.body.innerText.includes('这一局结束了')", false);
  if (done) break;
}
await wait(600);
state.afterReach = await evalJs("import('/src/game/tasks.js').then(m => m.getProgress())", true);
state.endEvent = await evalJs('window.__ev.filter(e => e[0] === "session:end").map(e => e[1])');
state.screenAfterEnd = await evalJs("document.querySelector('.t6-screen:not([hidden])')?.id || null");
state.resultText = await evalJs("document.querySelector('.t6-screen:not([hidden])')?.innerText?.slice(0, 600) || ''");
await shot('run-04-result');

state.consoleErrors = errors;
state.consoleLogs = logs.filter(l => !l.startsWith('[warning]')).slice(0, 40);
state.speakStarted = await evalJs('window.__ev.filter(e => e[0] === "speak:started").map(e => e[1].lineId)');
state.speakEnded = await evalJs('window.__ev.filter(e => e[0] === "speak:ended").map(e => e[1].lineId)');

console.log(JSON.stringify(state, null, 2));
ws.close();




// 用法：
//   1) cd 仓库根目录 && python -m http.server 8000
//   2) 用 --remote-debugging-port=9333 启动 Edge/Chrome（headless 即可）
//   3) node tools/e2e_smoke.mjs
// 产出：materials/screenshots/run-0*.png 与一段 JSON 状态（任务进度、结算、控制台错误）
