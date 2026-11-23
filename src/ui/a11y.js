/**
 * T6 · 无障碍支持
 *
 * 负责人：T6（见 docs/tasks.md）
 * 你拥有：src/ui/a11y.js（界面结构在 screens.js）
 *
 * 这个模块存在的理由：我们做的是无障碍主题的作品，
 * 如果页面自身不能被屏幕阅读器读、不能全键盘操作，就自相矛盾。
 * （依据 docs/references.md 中 gamesforblindgamers 一条）
 *
 * 负责四件事：
 *   1. aria-live 实时区域 —— 关键状态变化写进去，供屏幕阅读器播报
 *   2. 焦点陷阱 —— 游戏中 Tab 不得跑出页面主体
 *   3. prefers-reduced-motion —— 系统关了动画就一点动画都不给
 *   4. 焦点工具 —— 切屏后把焦点送到新屏幕的标题上
 *
 * 边界：本模块只管"读得到、够得着"，不知道任何游戏规则。
 */

const LIVE_ID = 'a11y-live';

/** 实时区域元素 */
let live = null;
/** 上一次播报的内容（用于避开屏幕阅读器的重复抑制） */
let lastSpoken = '';
let inited = false;

/* ------------------------------------------------------------
 * 初始化
 * ---------------------------------------------------------- */

/**
 * 初始化。
 *
 * 实时区域本来由 index.html 提供（T0 的 `#a11y-live`）。这里仍然做一次兜底：
 * 万一它被删了，本模块所有播报都会静默丢失 —— 而这类故障在屏幕上完全看不出来，
 * 只会表现为"视障同学说这游戏没反应"。
 */
export function init() {
  if (inited) return { ok: true, live: !!live };
  inited = true;

  if (typeof document === 'undefined') return { ok: false, reason: 'no-dom' };

  live = document.getElementById(LIVE_ID);
  if (!live) {
    live = document.createElement('div');
    live.id = LIVE_ID;
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.style.cssText =
      'position:absolute;width:1px;height:1px;overflow:hidden;' +
      'clip:rect(0 0 0 0);white-space:nowrap;';
    document.body.appendChild(live);
    console.warn('[T6] index.html 里没有 #a11y-live，已在运行时补建。');
  }

  injectReducedMotionSheet();
  return { ok: true, live: true };
}

/* ------------------------------------------------------------
 * 播报
 * ---------------------------------------------------------- */

/**
 * 把一段文字交给屏幕阅读器。
 *
 * @param {string} text 要播报的内容（口语化，避免符号与括号堆叠）
 * @param {{urgent?: boolean}} [opts] urgent=true 用 assertive，会打断当前朗读
 * @returns {boolean} 是否写入成功
 */
export function announce(text, { urgent = false } = {}) {
  if (!text) return false;
  if (!live) init();
  if (!live) return false;

  const msg = String(text).trim();
  if (!msg) return false;

  live.setAttribute('aria-live', urgent ? 'assertive' : 'polite');

  // 屏幕阅读器会忽略"内容没有变化"的更新（避免重复朗读）。
  // 但游戏里同一句状态确实会重复出现（"前方是空的"连敲三次），
  // 所以重复时补一个零宽空格 —— 内容变了，读起来一模一样。
  const changed = msg !== lastSpoken;
  live.textContent = changed ? msg : msg + '\u200B';
  lastSpoken = msg;

  return true;
}

/** 最近一次播报的内容（调试与测试用） */
export function lastAnnouncement() {
  return live ? live.textContent : '';
}

/* ------------------------------------------------------------
 * 系统偏好
 * ---------------------------------------------------------- */

/** 系统是否要求减少动效 */
export function prefersReducedMotion() {
  if (typeof matchMedia !== 'function') return false;
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

/**
 * 订阅"减少动效"偏好的变化（玩家可能在游戏中改系统设置）。
 * @param {(reduced:boolean) => void} fn
 * @returns {() => void} 取消订阅
 */
export function onReducedMotionChange(fn) {
  if (typeof matchMedia !== 'function' || typeof fn !== 'function') return () => {};
  let mq;
  try {
    mq = matchMedia('(prefers-reduced-motion: reduce)');
  } catch (_) {
    return () => {};
  }
  const handler = () => fn(mq.matches);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }
  return () => {};
}

/**
 * 注入"减少动效"样式表。
 *
 * 为什么不写 animation: none 而是 0.001ms：直接 none 会让 transitionend /
 * animationend 永远不触发，任何等这两个事件的逻辑都会卡死。
 * 保留一个极短的时长，等于"看不见但事件仍然发生"。
 */
function injectReducedMotionSheet() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('t6-a11y-style')) return;

  const style = document.createElement('style');
  style.id = 't6-a11y-style';
  style.textContent = `
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }
}
`;
  document.head.appendChild(style);
}

/* ------------------------------------------------------------
 * 焦点
 * ---------------------------------------------------------- */

/** 可按 Tab 到达的元素（跳过 hidden 与不可见） */
export function focusables(container) {
  if (!container) return [];
  const sel = [
    'a[href]', 'button', 'input', 'select', 'textarea', 'summary',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return Array.from(container.querySelectorAll(sel)).filter((el) => {
    if (el.disabled) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    if (el.closest('[hidden]')) return false;
    // offsetParent 为 null 表示元素或祖先 display:none（hidden 属性也是这种）
    return el.offsetParent !== null || el === document.activeElement;
  });
}

/**
 * 把焦点送到一个元素上（通常是新屏幕的标题）。
 * @param {HTMLElement|null} el
 * @param {boolean} [select] 是否同时选中文本（对标题没意义，保持默认 false）
 */
export function focusOn(el) {
  if (!el || typeof el.focus !== 'function') return false;
  try {
    el.focus({ preventScroll: false });
    return document.activeElement === el;
  } catch (_) {
    return false;
  }
}

/**
 * 焦点陷阱：Tab / Shift+Tab 只在 container 里循环。
 *
 * 依据 docs/tasks.md T6：「游戏中 Tab 不得跑出页面主体」。
 * 为什么游戏中要限制：屏幕全黑、只有一个面板，焦点跑到浏览器工具栏
 * 之后玩家完全不知道自己在哪 —— 而他没有视觉可以找回来。
 *
 * @param {HTMLElement} container
 * @returns {() => void} 解除陷阱
 */
export function trapFocus(container) {
  if (!container || typeof document === 'undefined') return () => {};

  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return;

    const list = focusables(container);
    if (list.length === 0) {
      // 没有任何可聚焦元素：把 Tab 吃掉，别让焦点跑到页面外
      e.preventDefault();
      return;
    }

    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;

    if (!container.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
      return;
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}

/** 调试快照 */
export function debugState() {
  return {
    hasLiveRegion: !!live,
    liveText: live ? live.textContent : '',
    reducedMotion: prefersReducedMotion(),
    activeElement: (() => {
      const el = document.activeElement;
      if (!el) return null;
      return { tag: el.tagName, id: el.id || null, label: (el.textContent || '').trim().slice(0, 24) };
    })()
  };
}

export default {
  init, announce, lastAnnouncement,
  prefersReducedMotion, onReducedMotionChange,
  focusables, focusOn, trapFocus, debugState
};
