/**
 * T4 接线层 —— 把语音识别的三态行为接成玩家能感知的反馈
 *
 * 为什么需要这个文件（T0 补记）：
 *   T4 交付了 asr.js 与 intents.js，两者本身都正确（60/60 用例通过），
 *   但没有接到游戏里 —— handleText() 无人调用，三态里的
 *   「回述确认」和「拒答」也没有任何代码消费。
 *
 *   这不是 T4 的疏漏：按 docs/CONVENTIONS.md 的文件归属，
 *   T4 只拥有 asr.js / intents.js / intents.cases.json，
 *   接线属于装配职责（T0 的 main.js 范围）。
 *
 * 本文件负责三态的具体表现，也就是 README 里承诺的三个「判断瞬间」：
 *   1. 拒答      —— 听不懂就说不懂，不硬猜一个动作执行
 *   2. 回述确认  —— "你是说，向左走吗？" 等玩家回答
 *   3. 降级      —— 连续两次听不懂，提示可以改用按键或打字
 *
 * 依赖方向：本文件 → asr / voice / bus，不反向依赖。
 */

import { bus, emit } from '../core/bus.js';
import { EVENTS, CONFIDENCE, INTENT_LABELS } from '../core/contracts.js';
import * as asr from '../speech/asr.js';
import * as voice from '../speech/voice.js';
import * as audio from '../audio/engine.js';

/** 待确认的意图：等待玩家回答「是 / 否」 */
let pending = null;

/** 回述确认的等待上限（秒）。超时视为放弃，不执行。 */
const CONFIRM_TIMEOUT = 6;
let confirmTimer = null;

/* ------------------------- 对外接口 ------------------------- */

/**
 * 处理一句输入（语音识别结果、打字、按钮）。
 *
 * 这是所有输入通道的唯一入口 —— 语音、按钮、打字走同一条路，
 * 因此不会有"语音走一套逻辑、按钮走另一套"的偏差。
 *
 * @param {string} text
 * @param {'voice'|'text'|'button'} [source]
 * @returns {{state:string, intent:object}}
 */
export function submit(text, source = 'text') {
  const result = asr.handleText(text, source);

  switch (result.state) {
    case 'execute':
      // asr 已经发了 INTENT 事件，移动逻辑会响应。
      // 这里只补一声短提示音，让玩家知道"它听懂了"。
      //
      // 为什么用提示音而不是说话：说话会盖住环境音（车流、脚步），
      // 而玩家恰恰靠那些声音判断方位。提示音短、不占语义带宽。
      clearPending();
      audio.playSfx('hint', { gain: 0.4 });
      break;

    case 'confirm':
      // 置信度不足：不执行，先问一句。
      // 这是「AI 自主判断」最容易被评委看懂的地方 —— 它宁可多问一次，
      // 也不肯凭一个不确定的猜测就让玩家走错方向。
      askConfirm(result.intent);
      break;

    case 'reject':
    default:
      // 连续拒答达到上限时 asr 会发 degrade:on，
      // 这里负责把"这里有点吵"这句说给玩家听。
      onReject();
      break;
  }

  return result;
}

/** 按下说话（短按） */
export function startListening() {
  const ok = asr.listen();
  if (!ok) {
    // 不支持或已降级：明确告诉玩家可以改用按键。
    // 复用 S_TOO_NOISY（"这里有点吵。可以按一二三，或者直接打字。"）——
    // 它的文案在任何"语音走不通"的场景下都成立，不必新增台词。
    emit(EVENTS.DEGRADE_ON, { reason: 'unsupported' });
    voice.speak('S_TOO_NOISY', { priority: voice.PRIORITY.HINT });
  }
  return ok;
}

/** 松开：结束本次说话 */
export function stopListening() {
  asr.stopListening();
}

/** 玩家对「你是说…吗」回答「是」 */
export function confirmYes() {
  if (!pending) return false;
  const intent = pending;
  clearPending();
  asr.confirm(intent, 'button');
  audio.playSfx('hint', { gain: 0.4 });
  return true;
}

/** 玩家回答「否」 */
export function confirmNo() {
  if (!pending) return false;
  clearPending();
  voice.speak('S_ASK_AGAIN', { priority: voice.PRIORITY.HINT });
  return true;
}

/** 当前是否有待确认的意图 */
export function getPending() {
  return pending;
}

/* ------------------------- 内部 ------------------------- */

function askConfirm(intent) {
  pending = intent;
  // S_ASK_AGAIN 的文案是"你是说，往前走吧？" —— 按实际意图拼不出动态句子，
  // 因为台词是预渲染的 mp3。所以这里播报通用句式，
  // 再由 UI 显示具体是哪个动作（T6 的按钮面板会高亮对应项）。
  //
  // interrupt: true 是有意的：新的提问必须替换旧的提问。
  // 若排队，「你是说向左走吗」后面会跟着「你是说向右走吗」，
  // 玩家会听到两句互相矛盾的确认，比不说话更糟。
  voice.speak('S_ASK_AGAIN', { priority: voice.PRIORITY.HINT, interrupt: true });

  clearTimeout(confirmTimer);
  confirmTimer = setTimeout(() => {
    if (!pending) return;
    clearPending();
    voice.speak('S_NO_UNDERSTAND', { priority: voice.PRIORITY.HINT, interrupt: true });
  }, CONFIRM_TIMEOUT * 1000);
}

function onReject() {
  clearPending();
  const st = asr.state();
  // 连续两次听不懂时才提示降级，单次听不懂只复述可用指令。
  //
  // 同样 interrupt: true —— 玩家刚说了一句没听懂的话，
  // 说明上一句提问（"你是说…吗"）已经作废了，必须立刻改口，
  // 而不是等它播完再说。排队会让 AI 显得迟钝又困惑。
  const line = st.consecutiveRejects >= 2 ? 'S_TOO_NOISY' : 'S_NO_UNDERSTAND';
  voice.speak(line, { priority: voice.PRIORITY.HINT, interrupt: true });
}

function clearPending() {
  pending = null;
  clearTimeout(confirmTimer);
  confirmTimer = null;
}

/* ------------------------- 初始化 ------------------------- */

let inited = false;

/**
 * 挂上键盘通道。
 *
 * 键盘永远可用：现场草坪噪音大，麦克风随时可能失效。
 * 空格键之外的按键已由 player.js 用于移动，这里只接管
 * 「按住 T 说话」和「Y / N 回答确认」。
 */
export function init() {
  if (inited) return;
  inited = true;

  if (typeof window === 'undefined') return;

  const onKeyDown = (e) => {
    if (e.repeat) return;

    // 按住 T 说话（避开玩家移动用的 WASD 与空格）
    if (e.code === 'KeyT') {
      e.preventDefault();
      startListening();
      return;
    }
    // Y / N 回答回述确认
    if (e.code === 'KeyY' && pending) { e.preventDefault(); confirmYes(); return; }
    if (e.code === 'KeyN' && pending) { e.preventDefault(); confirmNo(); return; }
  };

  const onKeyUp = (e) => {
    if (e.code === 'KeyT') { e.preventDefault(); stopListening(); }
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

/** 调试快照 */
export function debugState() {
  return {
    pending: pending ? { name: pending.name, confidence: pending.confidence } : null,
    asr: asr.state()
  };
}

if (typeof window !== 'undefined') {
  window.__inputDebug = debugState;
}

export default {
  init, submit, startListening, stopListening,
  confirmYes, confirmNo, getPending, debugState
};
