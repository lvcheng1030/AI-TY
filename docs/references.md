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
| [nicross/syngen](https://github.com/nicross/syngen) | **Unlicense**（原写 MIT，已核实修正） | **音频参数在每帧循环里更新**，与移动逻辑同一 tick，而不是散落在事件回调里 | 不引入该库。包版本号为 `2.0.0-beta.5`，README 自述实验性、API 仍在剧烈变动，比赛不能押在一个不稳定依赖上 |
| [gamesforblindgamers/blind-accessible-game-engines](https://github.com/gamesforblindgamers/blind-accessible-game-engines) | 清单 | **无障碍不等于"游戏内可玩"**：还要让页面本身能被屏幕阅读器读（ARIA 实时区域 / AccessKit 思路） | 我们做的是无障碍主题，页面自身若不可读就自相矛盾。本项列入开发要求 |
| [nightblade9/themis-games-template](https://github.com/nightblade9/themis-games-template) | CC0 | `setupAudio()` **必须在首次用户手势中调用**（浏览器安全策略）；音效清单集中预加载 | 我们的验证页已经符合（开始时才创建 AudioContext）。CC0 意味着必要时可以直接取用其代码 |
| [@cartertemm/audiogame-utils](https://github.com/cartertemm/audiogame-utils) | **MIT**（已核实，v0.4.2） | 自述为"browser based audio games 的构建块"，覆盖无障碍语音、输入、空间音频、地图、UI、存储、网络；已读 `src/text.js`、`src/clock.js` 源码 | **不整体采用**，只借用 `clock.tick(manualDt)` 与编辑距离两处设计。完整理由见下节 |

### 本轮修正的记录错误

- `syngen` 的许可证原记为 MIT，**实为 Unlicense**（查 `package.json` 核实）。已订正。
- 早期曾判断"`audiogame-utils` 仅作设计参考"，属未核实即下的结论。已改为读完源码与包元数据后的正式决策。

### 由此产生的三条技术决定

1. **引擎加入"敲杖探测"**：空格键敲击 → 返回延迟 + 混响量共同表达距离。这是把 finding-echo 的机制迁移到"盲道探测"上——玩家能听出"前面 1 米是墙、3 米是路"。
2. **音频更新进入固定步长循环**，与移动/碰撞同一个 tick。避免声音位置与画面逻辑不同步。
3. **页面加 ARIA 实时区域 + 全部按钮可键盘操作**。无障碍主题的作品，自身先要达标。

### 明确不采用

1. 不引入 `syngen`、`three.js` 等运行时依赖，保持零依赖。`audiogame-utils` 已评估完毕，**决定不整体采用**，理由见下节。
2. 不复制 `finding-echo` 的任何代码，只借鉴机制。避免许可证义务与原创性争议。

---

## 评估：audiogame-utils（结论：不整体采用）

`@cartertemm/audiogame-utils`（**MIT**，v0.4.2，2026-09-23 发布，仍在活跃开发）的覆盖面与我们的计划高度重合：

| 我们计划要做的 | 它已经有的模块 |
| --- | --- |
| 固定步长游戏循环 | `clock`（60 FPS、delta time、倒计时） |
| `PannerNode` 封装 | `audio` + `audio/pool`（可复用空间声源 + 听者更新） |
| 世界坐标 → 听者相对坐标 | `audio/coords` |
| 音量 / 距离 / 声像换算 | `audio/units` |
| 场景数据与碰撞 | `map` + `physics`（3D 向量 + R-tree 空间索引） |
| **指令模糊匹配** | `text.closestMatch`（字符串距离） |
| 键盘焦点与虚拟光标 | `focus` |
| 无障碍输出（屏幕阅读器 / 实时区域） | `speech` |
| 存档 | `storage` |

技术特点：纯 ESM、源码无需构建步骤。

### 结论：**不整体采用，但借用两个模块的设计**

实测数据（`registry.npmjs.org/audiogame-utils/latest`，2026-11-20）：

| 项 | 实测值 | 备注 |
| --- | --- | --- |
| 许可证 | MIT | 已核实，可安全借用 |
| 版本 | 0.4.2 | 仍是 0.x，2026-08 首发，数月历史、单一作者 |
| 解包体积 | **7.74 MB / 109 个文件** | 远超 5 分钟小游戏的需要 |
| 运行时依赖 | `cacophony` + `standardized-audio-context` | **README 只提了前者**，实际是两个 |

**不采用的四条理由**

1. **`standardized-audio-context` 恰好垫在我们的核心机制上。** 它是一个 AudioContext 兼容层，而我们的作品完全建立在 Web Audio（`PannerNode` + HRTF）之上。在最关键的路径上引入一层 polyfill，意味着以后每一个空间音频的怪异行为都要先判断"是我的问题还是兼容层的问题"。6 天的窗口下，这个调试风险比省下来的时间更贵。
2. **体积与场景不匹配。** 7.74 MB / 109 文件是为了覆盖 Tauri 桌面应用、多人联机、地图加载十万对象等我们用不到的场景。
3. **成熟度不足。** 0.4.x、数月历史、单一维护者。比赛作品要交出去，不能押在一个 API 可能变动的库上。
4. **核心机制它并不覆盖。** 语音识别与意图解析仍需自研（见下），而那是本作品区别于通用工具库的地方。

**借用其两处设计（读源码后确认，均为通用做法，不存在抄袭问题）**

1. **`clock` 的 `tick(manualDt)` 手动步进**。这让游戏循环可以脱离真实时间做单元测试——对"任务判定""盲道偏离"这类逻辑是刚需。自研时保留这个接口形状。
2. **`text.js` 的 `stringDistance` 是标准的最优字符串对齐距离（约 40 行，零依赖）**。我们的 12 条指令匹配正需要它。**自研实现，不复制代码**；算法本身是公共知识。

### 两处必须注意的冲突

1. **语音的两种含义**：它的 `speech` 模块输出的是"辅助性"语音（屏幕阅读器 / 平台默认 TTS）；我们的旁白是"叙事性"语音（预渲染 mp3，是游戏内容本身）。混用会让玩家分不清"谁在说话"。因此即使采用，也只能用它做**页面级无障碍播报**，游戏旁白仍走自己的预渲染音频。
2. **语音识别它不管**：`input` 覆盖键盘 / 鼠标 / 触摸，`speech` 只管输出。核心机制"说'帮我读一下告示牌'"所需的 ASR 与意图解析，**仍然要自己写**。

### 调研完整度声明

`docs/audio.md` 与 `docs/speech.md` 两次抓取失败（网络问题），**因此对 `audio` / `speech` 两个模块的判断仅基于 README 模块表，未读源码**。
已读源码的是 `src/text.js` 与 `src/clock.js`（结论如上），以及 `registry.npmjs.org` 的包元数据。
由于结论是"不整体采用"，未读部分不影响该决策。

### 待验证（下一步 spike）

- 回声延迟机制在 0.2–1.5 秒区间内，人耳能否稳定分辨距离差异。若可分辨，则"敲杖"成为核心玩法；若不可分辨，退化为纯混响量表达。

---

## 检索方法备忘

- GitHub 搜索对"audio game""blind accessible""echolocation"这类词命中率最高。
- 官方清单类仓库（如 gamesforblindgamers）比散装搜索结果质量高得多，优先从清单进入。
- 看仓库先看三样：许可证、README 的自述成熟度、源码是否可读。