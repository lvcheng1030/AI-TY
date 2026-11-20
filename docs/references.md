# 借鉴记录

> **工作约定**：每一步实施之前，先检索 GitHub 上的同类项目，记录"借鉴了什么、我们如何不同"，然后再动手。
>
> **为什么留档**：评审维度"创意与自主贡献"要问的就是"与直接套用已有方案有何区别"。有一份带链接的记录，能直接回答；同时也构成"赛前已有基础 / 外部帮助"的申报证据。

---

## 2026-11-20 · 本轮目标：空间音频引擎与游戏骨架

### 检索到的可用参考

| 项目 | 许可证 | 借鉴什么 | 我们如何不同 |
| --- | --- | --- | --- |
| [js13kGames/finding-echo](https://github.com/js13kGames/finding-echo) | MIT | **距离用"回声延迟 + 混响量"表达**，而不是只靠音量。源码用 `setTimeout(播放, 距离 × 10)` 模拟声速，并切换 `convolver` 增益区分远近 | 只借鉴机制，不复制代码。它的栈是 2017 年的（jsfxr + webpack + babel），我们保持零运行时依赖 |
| [nicross/syngen](https://github.com/nicross/syngen) | MIT | **音频参数在每帧循环里更新**，与移动逻辑同一 tick，而不是散落在事件回调里 | 不引入该库。其 README 自述为实验性、API 仍在剧烈变动，比赛不能押在一个不稳定依赖上 |
| [gamesforblindgamers/blind-accessible-game-engines](https://github.com/gamesforblindgamers/blind-accessible-game-engines) | 清单 | **无障碍不等于"游戏内可玩"**：还要让页面本身能被屏幕阅读器读（ARIA 实时区域 / AccessKit 思路） | 我们做的是无障碍主题，页面自身若不可读就自相矛盾。本项列入开发要求 |
| [nightblade9/themis-games-template](https://github.com/nightblade9/themis-games-template) | CC0 | `setupAudio()` **必须在首次用户手势中调用**（浏览器安全策略）；音效清单集中预加载 | 我们的验证页已经符合（开始时才创建 AudioContext）。CC0 意味着必要时可以直接取用其代码 |
| [@cartertemm/audiogame-utils](https://jsr.io/@cartertemm/audiogame-utils) | 待查 | 音频游戏工具库的 API 组织方式（方向、朝向等概念建模） | 仅作设计参考，不引入依赖 |

### 由此产生的三条技术决定

1. **引擎加入"敲杖探测"**：空格键敲击 → 返回延迟 + 混响量共同表达距离。这是把 finding-echo 的机制迁移到"盲道探测"上——玩家能听出"前面 1 米是墙、3 米是路"。
2. **音频更新进入固定步长循环**，与移动/碰撞同一个 tick。避免声音位置与画面逻辑不同步。
3. **页面加 ARIA 实时区域 + 全部按钮可键盘操作**。无障碍主题的作品，自身先要达标。

### 明确不采用

1. 不引入 `syngen`、`three.js` 等运行时依赖——保持零依赖，理由见上表。
2. 不复制 `finding-echo` 的任何代码，只借鉴机制。避免许可证义务与原创性争议。

### 待验证（下一步 spike）

- 回声延迟机制在 0.2–1.5 秒区间内，人耳能否稳定分辨距离差异。若可分辨，则"敲杖"成为核心玩法；若不可分辨，退化为纯混响量表达。

---

## 检索方法备忘

- GitHub 搜索对"audio game""blind accessible""echolocation"这类词命中率最高。
- 官方清单类仓库（如 gamesforblindgamers）比散装搜索结果质量高得多，优先从清单进入。
- 看仓库先看三样：许可证、README 的自述成熟度、源码是否可读。