/**
 * T1 · 音频素材探查 —— 【桩文件，待实现】
 *
 * 负责人：T1
 * 职责：找出 assets/ 下真实存在的音频文件；找不到时报告缺哪些，
 * 让引擎可以退化为合成音（而不是静音或崩溃）。
 *
 * 为什么单独一个文件：游园会现场可能只带了部分素材，
 * 「缺文件」必须是可诊断的状态，不能表现成"没声音但没人知道为什么"。
 */

export function scan() {
  return { amb: [], foot: {}, sfx: [] };
}

export function has(name) {
  return false;
}

export function missing() {
  return [];
}

export default { scan, has, missing };
