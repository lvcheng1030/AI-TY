/**
 * 事件总线 —— 全局唯一的模块间通信通道。
 *
 * 为什么所有模块都走这里，而不直接互相 import 调用：
 * T1~T7 是七个人并行开发的。如果 A 模块直接调用 B 模块的函数，
 * B 一改签名 A 就编译不过，两个人立刻互相阻塞。
 * 改成双方只依赖「事件名 + 数据结构」（见 contracts.js），
 * 就可以各自独立开发、最后接线。
 *
 * 事件名一律从 contracts.js 的 EVENTS 里取，不要在这里硬编码字符串。
 */

const listeners = new Map();

/**
 * 订阅事件。
 * @param {string} evt 事件名，取自 EVENTS
 * @param {Function} fn 处理函数，参数为 payload
 * @returns {Function} 取消订阅的函数
 */
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, new Set());
  listeners.get(evt).add(fn);
  return () => off(evt, fn);
}

/**
 * 取消订阅。
 * @param {string} evt
 * @param {Function} fn 必须是当初传入的同一个函数引用
 */
export function off(evt, fn) {
  const set = listeners.get(evt);
  if (set) set.delete(fn);
}

/**
 * 触发事件。
 *
 * 关键行为：某个监听器抛错【不会】影响其它监听器。
 * 否则 T4 的语音模块一出错，T1 的音频更新就跟着停了 ——
 * 这种连锁故障在比赛现场最难查。
 *
 * @param {string} evt
 * @param {*} [payload]
 */
export function emit(evt, payload) {
  const set = listeners.get(evt);
  if (!set || set.size === 0) return;

  // 复制一份再遍历：允许监听器在回调里 on/off 而不影响本次派发
  for (const fn of Array.from(set)) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] 监听 ${evt} 时出错：`, err);
    }
  }
}

/**
 * 只订阅一次，触发后自动取消。
 * @param {string} evt
 * @param {Function} fn
 */
export function once(evt, fn) {
  const wrapper = (payload) => {
    off(evt, wrapper);
    try {
      fn(payload);
    } catch (err) {
      console.error(`[bus] 监听 ${evt}（once）时出错：`, err);
    }
  };
  return on(evt, wrapper);
}

/** 清空所有监听器。只给测试用，正常游戏流程不要调用。 */
export function clearAll() {
  listeners.clear();
}

/** 调试用：看看某个事件挂了几个监听器。 */
export function countListeners(evt) {
  return listeners.has(evt) ? listeners.get(evt).size : 0;
}

export const bus = { on, off, emit, once, clearAll, countListeners };
export default bus;
