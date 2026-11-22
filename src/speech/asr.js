/**
 * T4 · 语音识别封装
 *
 * 职责边界：
 *   - 只负责「把声音变成文本」，以及「把文本交给 parse()」
 *   - 不决定意图，不执行动作 —— 判断在 nlu/intents.js，执行在 T7
 *
 * 硬性要求（docs/tasks.md T4）：
 *   - 任何一种失败（不支持 / 权限被拒 / 断网 / 超时）都不得让游戏崩溃，
 *     一律发 degrade:on，并允许玩家改用按钮或打字
 *   - 短按说话：按下开始、松开结束，不做常听
 *   - 3 秒无结果算超时
 */

import { EVENTS, CONSECUTIVE_REJECT_LIMIT } from '../core/contracts.js';
import { emit } from '../core/bus.js';
import { parse, classify } from '../nlu/intents.js';

/** 一次「按住说话」最长等多久（毫秒）。超过即判超时。 */
export const RESULT_TIMEOUT_MS = 3000;

let recognition = null;
let supported = false;
let listening = false;
let degraded = false;
let consecutiveRejects = 0;
let timeoutTimer = null;
let lastReason = null;

/** 浏览器能力探测。在非浏览器环境（如 Node 跑测试）里安全返回 false。 */
export function isSupported() {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * 初始化。不抛异常，不能用就返回 ok:false 让 main.js 走降级。
 * @returns {{ok:boolean, supported:boolean, reason?:string}}
 */
export function init() {
  supported = isSupported();
  if (!supported) {
    lastReason = 'unsupported';
    return { ok: false, supported: false, reason: 'unsupported' };
  }
  try {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.continuous = false;   // 短按说话，不常听
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    wire(recognition);
    return { ok: true, supported: true };
  } catch (err) {
    // 构造失败也按不支持处理，绝不让异常冒出去
    console.warn('[asr] 初始化失败，转入降级通道：', err);
    lastReason = 'unsupported';
    recognition = null;
    return { ok: false, supported: false, reason: 'unsupported' };
  }
}

/** 挂事件。任何回调都整体包 try/catch —— 语音回调里抛错最难查。 */
function wire(rec) {
  rec.onresult = (event) => {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
    try {
      const text = event?.results?.[0]?.[0]?.transcript || '';
      listening = false;
      handleText(text, 'voice');
    } catch (err) {
      console.error('[asr] 处理识别结果出错：', err);
      degrade('network');
    }
  };

  rec.onerror = (event) => {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
    listening = false;
    degrade(mapError(event?.error));
  };

  rec.onend = () => {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
    listening = false;
  };
}

/**
 * 把浏览器的错误码翻成契约里 DEGRADE 的 reason 枚举。
 * @param {string} [code]
 * @returns {'denied'|'network'|'timeout'|'unsupported'}
 */
function mapError(code) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'network':
      return 'network';
    case 'no-speech':
    case 'aborted':
      return 'timeout';
    case 'audio-capture':
      return 'denied';
    default:
      return 'network';
  }
}

/**
 * 进入降级模式。幂等：已经降级就不重复发事件。
 * @param {string} reason
 */
export function degrade(reason) {
  lastReason = reason || 'unsupported';
  if (degraded) return;
  degraded = true;
  try {
    emit(EVENTS.DEGRADE_ON, { reason: lastReason });
  } catch (err) {
    console.error('[asr] 发 degrade:on 时出错：', err);
  }
}

/** 语音恢复正常（成功执行一次后调用）。 */
export function recover() {
  if (!degraded) return;
  degraded = false;
  consecutiveRejects = 0;
  lastReason = null;
  try {
    emit(EVENTS.DEGRADE_OFF, { reason: 'recovered' });
  } catch (err) {
    console.error('[asr] 发 degrade:off 时出错：', err);
  }
}

/**
 * 开始一次「按住说话」。
 * 不支持 / 已降级时静默返回 false，调用方据此显示按钮通道。
 * @returns {boolean} 是否真的开始监听
 */
export function listen() {
  if (!supported || !recognition) {
    degrade('unsupported');
    return false;
  }
  if (listening) return true;

  try {
    recognition.start();
    listening = true;
    clearTimeout(timeoutTimer);
    timeoutTimer = setTimeout(() => {
      // 3 秒没结果：停掉并降级，但不当作致命错误
      stop();
      degrade('timeout');
    }, RESULT_TIMEOUT_MS);
    return true;
  } catch (err) {
    // 连续 start() 会抛 InvalidStateError，这里当成一次失败吞掉
    console.warn('[asr] 启动识别失败：', err);
    listening = false;
    degrade('network');
    return false;
  }
}

/** 松开按钮：结束本次说话。 */
export function stopListening() {
  if (!recognition || !listening) return;
  try {
    recognition.stop();
  } catch (err) {
    console.warn('[asr] 停止识别失败：', err);
  }
  listening = false;
}

/** 彻底停止（切屏、结算时调用）。 */
export function stop() {
  clearTimeout(timeoutTimer);
  timeoutTimer = null;
  listening = false;
  if (!recognition) return;
  try {
    recognition.abort();
  } catch (err) {
    // abort 在未启动时也会抛，忽略
  }
}

/**
 * 处理一句文本 —— 语音结果、打字输入、按钮点击都走这里。
 *
 * 三态：
 *   execute（≥0.85）→ 发 intent 事件，玩家听到一声短提示音；
 *   confirm（0.55~0.85）→ 不发事件，把结果返回给调用方去追问「你是说…吗」；
 *   reject（<0.55）→ 不发事件；连续两次触发 degrade:on。
 *
 * @param {string} text
 * @param {'voice'|'text'|'button'} [source]
 * @returns {{state:'execute'|'confirm'|'reject', intent:object, reason?:string}}
 */
export function handleText(text, source = 'text') {
  const parsed = parse(text);
  const state = classify(parsed.confidence);

  if (state === 'reject') {
    consecutiveRejects += 1;
    if (consecutiveRejects >= CONSECUTIVE_REJECT_LIMIT) degrade('repeated_reject');
    return { state, intent: parsed, reason: 'below_threshold' };
  }

  consecutiveRejects = 0;

  if (state === 'execute') {
    if (degraded) recover();
    try {
      emit(EVENTS.INTENT, {
        name: parsed.name,
        confidence: parsed.confidence,
        utterance: String(text ?? ''),
        source,
        matched: parsed.matched
      });
    } catch (err) {
      console.error('[asr] 发 intent 事件时出错：', err);
    }
  }

  return { state, intent: parsed };
}

/**
 * 玩家对「回述确认」回答「是」时调用。
 * @param {{name:string, confidence:number}} intent
 * @param {'voice'|'text'|'button'} [source]
 */
export function confirm(intent, source = 'text') {
  if (!intent || !intent.name) return false;
  consecutiveRejects = 0;
  recover();
  try {
    emit(EVENTS.INTENT, {
      name: intent.name,
      confidence: intent.confidence,
      utterance: '',
      source,
      matched: intent.matched || null
    });
  } catch (err) {
    console.error('[asr] 确认后发 intent 事件时出错：', err);
  }
  return true;
}

/** 调试/测试用：当前内部状态只读快照。 */
export function state() {
  return { supported, listening, degraded, consecutiveRejects, lastReason };
}

/** 测试用：重置内部计数与降级标记。 */
export function reset() {
  clearTimeout(timeoutTimer);
  timeoutTimer = null;
  listening = false;
  degraded = false;
  consecutiveRejects = 0;
  lastReason = null;
}

export default {
  isSupported, init, listen, stopListening, stop,
  handleText, confirm, degrade, recover, state, reset, RESULT_TIMEOUT_MS
};
