/**
 * T4 · 意图解析
 *
 * 【纯函数模块】给定一句话，返回意图与置信度。
 * 不碰 window / document / 网络 / 定时器 —— 这样 60 条用例可以一键批量跑完。
 *
 * 打分规则（见 docs/tasks.md T4）：
 *   同义词精确命中        → 1.0
 *   与某同义词编辑距离 ≤2 → 0.85
 *   包含关键词            → 0.65
 *   否则                  → 0
 *
 * 三态行为不在这里决定，由调用方按 contracts.js 的 CONFIDENCE 判：
 *   ≥0.85 执行 / 0.55~0.85 回述确认 / <0.55 拒答
 */

import { INTENTS, CONFIDENCE } from '../core/contracts.js';

/**
 * 同义词表。12 条意图，锁定，不得随意增删（增删要全队同意）。
 *
 * 收录原则：
 *   - 只收「玩家真会这么说」的口语，不收书面语
 *   - 不写单字（如裸的「走」「左」）——单字会包含匹配到一大片句子
 *   - 容易互相混淆的说法故意留在表里，用最长匹配和精确优先来压住歧义
 */
const SYNONYMS = Object.freeze({
  [INTENTS.MOVE_FORWARD]: ['往前走', '向前走', '前进', '直走', '往前', '向前'],
  [INTENTS.MOVE_LEFT]: ['向左走', '往左', '左边', '向左', '靠左'],
  [INTENTS.MOVE_RIGHT]: ['向右走', '往右', '右边', '向右', '靠右'],
  [INTENTS.TURN_LEFT]: ['左转', '转左', '向左转'],
  [INTENTS.TURN_RIGHT]: ['右转', '转右', '向右转'],
  [INTENTS.STOP]: ['停', '停下', '别走', '停一下', '站住', '别动了'],
  [INTENTS.READ_SIGN]: ['帮我读一下前方告示牌', '读牌子', '这是什么牌子', '念牌子', '帮我读'],
  [INTENTS.REPEAT]: ['再说一遍', '重复', '再念一遍', '再说一次'],
  [INTENTS.WHERE_AM_I]: ['我在哪', '这是哪', '我在哪里', '这是什么地方'],
  [INTENTS.LOOK_AHEAD]: ['帮我看看前面', '前面有什么', '看看前面', '帮我看看'],
  [INTENTS.FASTER]: ['走快点', '快一点', '快点', '走快些'],
  [INTENTS.SLOWER]: ['走慢点', '慢一点', '慢点', '走慢些']
});

/** 允许「包含」匹配的最短同义词长度，防止两字词吃掉整句 */
const MIN_CONTAINS_LEN = 2;

/**
 * 归一化：去空白、去标点、转小写。
 * 语音识别结果常带句号或空格（"往 左 走。"），不归一化会白白丢掉精确命中。
 * @param {unknown} input
 * @returns {string}
 */
function normalize(input) {
  if (input === null || input === undefined) return '';
  return String(input)
    .toLowerCase()
    .replace(/[\s,，。.!！?？、;；:：'‘’"“”()（）\-—_]/g, '');
}

/**
 * 编辑距离（Damerau-Levenshtein 的受限变体，即「最优字符串对齐距离」）。
 *
 * 比经典 Levenshtein 多认一种操作：相邻两字互换算一次编辑。
 * 这对语音识别很关键 —— 识别器常把「前进」听成「进前」，
 * 经典编辑距离会算成 2 次替换，直接掉出 0.85 档。
 *
 * 按任务卡要求自行实现，未复制 audiogame-utils 的代码。
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 编辑次数
 */
export function stringDistance(a, b) {
  const s = String(a ?? '');
  const t = String(b ?? '');
  if (s === t) return 0;
  const m = s.length;
  const n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // d[i][j] = s 的前 i 个字符 变成 t 的前 j 个字符 的最少编辑次数
  const d = new Array(m + 1);
  for (let i = 0; i <= m; i += 1) {
    d[i] = new Array(n + 1);
    d[i][0] = i;
  }
  for (let j = 0; j <= n; j += 1) d[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      let best = Math.min(
        d[i - 1][j] + 1,      // 删
        d[i][j - 1] + 1,      // 插
        d[i - 1][j - 1] + cost // 改
      );
      // 相邻交换：s 的 i-2/i-1 与 t 的 j-2/j-1 交叉相等
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
        best = Math.min(best, d[i - 2][j - 2] + 1);
      }
      d[i][j] = best;
    }
  }
  return d[m][n];
}

/**
 * 一个归一化后的句子对一个同义词的打分。
 * @param {string} text 归一化后的输入
 * @param {string} syn 归一化后的同义词
 * @returns {number} 0 / 0.65 / 0.85 / 1
 */
function scoreOne(text, syn) {
  if (!text || !syn) return null;
  if (text === syn) return { score: 1, dist: 0 };

  // 距离匹配必须同时满足「绝对距离 ≤2」和「相对距离 ≤一半」。
  //
  // 为什么需要后一个条件：中文短句只有三四个字，绝对距离 2 就等于换了三分之二。
  // 实测踩到的坑——「往左边」对「往前走」的距离正好是 2（左→前、边→走），
  // 「再慢点」对「走快点」也是 2，两条都会被判成 0.85，直接指向相反的方向。
  // 加上相对阈值后，「往前走一点」对「往前走」(2/5) 仍然命中，
  // 「往左边」对「往前走」(2/3) 则被正确排除，交给「包含」那档。
  const dist = stringDistance(text, syn);
  const longest = Math.max(text.length, syn.length);
  if (dist <= 2 && dist / longest <= 0.5) return { score: 0.85, dist };

  if (syn.length >= MIN_CONTAINS_LEN && text.includes(syn)) return { score: 0.65, dist };
  return null;
}

/**
 * 解析一句话。
 *
 * 平手时的取舍顺序：
 *   1. 分数高者胜
 *   2. 分数相同看「编辑距离更小」——「向左转弯」对「向左转」距离 1、
 *      对「向左走」距离 2，都是 0.85，靠距离把方向类与移动类分开
 *   3. 仍相同看「最长同义词」，最后按意图表顺序，保证结果稳定可复现
 *
 * @param {string} utterance 玩家说的话（或打的字）
 * @returns {{name:(string|null), confidence:number, matched:(string|null)}}
 */
export function parse(utterance) {
  const text = normalize(utterance);
  if (!text) return { name: null, confidence: 0, matched: null };

  let best = { name: null, confidence: 0, matched: null, len: 0, dist: Infinity };

  for (const name of Object.keys(SYNONYMS)) {
    for (const raw of SYNONYMS[name]) {
      const syn = normalize(raw);
      const hit = scoreOne(text, syn);
      if (!hit) continue;

      const better =
        hit.score > best.confidence ||
        (hit.score === best.confidence && hit.dist < best.dist) ||
        (hit.score === best.confidence && hit.dist === best.dist && syn.length > best.len);

      if (better) best = { name, confidence: hit.score, matched: raw, len: syn.length, dist: hit.dist };
    }
  }

  return { name: best.name, confidence: best.confidence, matched: best.matched };
}

/**
 * 三态判定（纯函数，发给 UI / 测试用）。
 * 判定标准直接取 contracts.js 的 CONFIDENCE，不在这里另立阈值。
 *
 * @param {number} confidence
 * @returns {'execute'|'confirm'|'reject'}
 */
export function classify(confidence) {
  const c = Number(confidence) || 0;
  if (c >= CONFIDENCE.EXECUTE) return 'execute';
  if (c >= CONFIDENCE.CONFIRM) return 'confirm';
  return 'reject';
}

/** 全部意图名（测试页与 UI 用） */
export function allIntentNames() {
  return Object.values(INTENTS);
}

/** 同义词表的只读副本（测试页要按意图展开用例） */
export function synonymsOf(intentName) {
  const list = SYNONYMS[intentName];
  return list ? list.slice() : [];
}

export default { parse, stringDistance, classify, allIntentNames, synonymsOf };
