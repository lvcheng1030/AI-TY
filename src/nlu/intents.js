/**
 * T4 · 意图解析 —— 【桩文件，待实现】
 *
 * 负责人：T4
 *
 * 本文件必须是【纯函数】：给定一句话，返回意图与置信度。
 * 不碰 window / document / 网络 —— 这样 60 条测试用例可以一键跑完。
 *
 * 打分规则（自行实现编辑距离，不要复制 audiogame-utils 的代码）：
 *   同义词精确命中         → 1.0
 *   与某同义词编辑距离 ≤2  → 0.85
 *   包含关键词             → 0.65
 *   否则                   → 0
 *
 * 三态行为由调用方按 contracts.js 的 CONFIDENCE 决定：
 *   ≥0.85 执行 / 0.55~0.85 回述确认 / <0.55 拒答
 */

import { INTENTS } from '../core/contracts.js';

/**
 * @param {string} utterance 玩家说的话（或打的字）
 * @returns {{name:string|null, confidence:number, matched:string|null}}
 */
export function parse(utterance) {
  return { name: null, confidence: 0, matched: null };
}

/**
 * 编辑距离（Levenshtein 的带相邻交换变体，即最优字符串对齐距离）。
 * T4 需要实现它。这里先给出会抛错的占位，
 * 避免有人以为它已经能用。
 */
export function stringDistance(a, b) {
  throw new Error('[T4] stringDistance 尚未实现');
}

export function allIntentNames() {
  return Object.values(INTENTS);
}

export default { parse, stringDistance, allIntentNames };
