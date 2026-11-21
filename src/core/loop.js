/**
 * 固定步长游戏循环。
 *
 * 核心设计：tick(dt) 可以手动步进。
 * 这让「移动 1.2 米需要多久」「偏离盲道是否触发提示」这类逻辑
 * 能脱离真实时间做自动化测试 —— 不用等真实秒表，也能保证结果可复现。
 * （此设计思路借鉴自 audiogame-utils 的 clock 模块，见 docs/references.md）
 *
 * 单位约定：所有 dt 都是【秒】，不是毫秒。
 */

/** 单帧最大步长。切后台再切回来时 dt 会很大，不截断会导致玩家瞬移穿墙。 */
const MAX_DT = 0.1;

/**
 * @param {Object} opts
 * @param {number} [opts.fps=60] 目标帧率
 * @param {(dt:number, elapsed:number)=>void} [opts.onTick] 每步回调
 */
export function createLoop({ fps = 60, onTick = null } = {}) {
  const frameInterval = 1000 / fps;
  const handlers = new Set();
  if (typeof onTick === 'function') handlers.add(onTick);

  let running = false;
  let rafId = null;
  let lastTime = 0;
  let accumulator = 0;   // 累积的毫秒
  let elapsed = 0;       // 已模拟的总秒数
  let ticks = 0;

  function step(dt) {
    const clamped = Math.min(Math.max(dt, 0), MAX_DT);
    elapsed += clamped;
    ticks += 1;
    for (const fn of Array.from(handlers)) {
      try {
        fn(clamped, elapsed);
      } catch (err) {
        console.error('[loop] onTick 出错：', err);
      }
    }
  }

  function frame(now) {
    if (!running) return;
    const deltaMs = lastTime > 0 ? now - lastTime : frameInterval;
    lastTime = now;
    accumulator += deltaMs;

    // 用 while 而不是 if：一帧里补跑多步，保证逻辑速度与帧率无关
    while (accumulator >= frameInterval) {
      step(frameInterval / 1000);
      accumulator -= frameInterval;
    }

    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    accumulator = 0;

    if (typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(frame);
    } else {
      // 没有 rAF 的环境（例如纯逻辑测试）退化为定时器
      rafId = setInterval(() => step(frameInterval / 1000), frameInterval);
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      clearInterval(rafId);
      rafId = null;
    }
  }

  return {
    get running() { return running; },
    get elapsed() { return elapsed; },
    get ticks() { return ticks; },

    start,
    stop,

    /** 手动步进一步。测试用；正常游戏由 rAF 驱动。 */
    tick(dt) { step(dt); },

    /** 重设计时（不清除监听器）。 */
    reset() {
      stop();
      elapsed = 0;
      ticks = 0;
      accumulator = 0;
      lastTime = 0;
    },

    on(fn) { if (typeof fn === 'function') handlers.add(fn); },
    off(fn) { handlers.delete(fn); }
  };
}

export default createLoop;
