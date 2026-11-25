# 场景 1 · 素材与文案登记

> 文件所有者：T3（见 `docs/tasks.md`）
> 对接：`content/scene1.json` 由 T2 的 `src/world/scene.js` 载入；台词 id 与 T5 的
> `content/lines.csv` 交叉核对（T5 的管线先落地，本文的牌子台词以它为准）。
> **评审会逐条核对本文件。素材没有来源和许可证 = 硬伤。**

---

## 一、告示牌文案（以 T5 已生成的台词为准）

原本 T3 写的是三块"真实校园标牌"（无障碍通道指引 / 共享单车禁停区 / 教学楼方向指示）。
但 T5 在 T3 之前就已经用 edge-tts 生成了 27 条台词并合入 main，**牌子能念什么由
`content/lines.csv` 决定**，其中牌子台词只有三条：

| 台词 id | 文本 |
| --- | --- |
| `L_SIGN_01` | 此处为盲道，请勿占用。 |
| `L_SIGN_02` | 无障碍通道，前方五十米。 |
| `L_SIGN_03` | 共享单车请停放在线内。 |

补第四条台词要重跑 TTS（`pip install edge-tts` 在当前环境装不上），所以这里
**让场景去适配已经生成的台词**，而不是反过来。三块牌与台词的对应关系：

| 牌子 id | 位置 | 台词 id | 玩家听到 | 作用 |
| --- | --- | --- | --- | --- |
| `sign_guide` | `(2.0, -12)` | `L_SIGN_02` | 无障碍通道，前方五十米。 | 刚出门，确认自己走在正确的路上 |
| `sign_bikes` | `(2.2, -31)` | `L_SIGN_03` | 共享单车请停放在线内。 | 在自行车堆前约 2 米解释这片障碍，也是 `read` 任务的目标 |
| `sign_corner` | `(-1.5, -44)` | `L_SIGN_01` | 此处为盲道，请勿占用。 | 路口那块牌——**不提供方向信息**，见下 |

### 差一条"路口左转"的台词，以及为什么还能玩

理想情况下路口那块牌应该说"教学楼在左手边"，但 `lines.csv` 里没有这句，
而重跑 TTS 在此环境做不到（没有 edge-tts）。

替代方案是让**环境本身提供方向**，这在纯音频游戏里是更常见的做法：

1. 盲道在路口**真的向左折**——玩家脚下的触感变化就是最直接的方向信息
2. 继续直走会离开盲道，1.5 米后触发 `S_DEVIATION`「你好像走出盲道了」
3. 西侧有 `crowd`（路口人群）和 `wind`（草地风声）两个声源，左转方向**本来就有声音**

所以缺这条台词不是断链，只是少了一次明确的告知。**如果有人能装好 edge-tts，
补一句 `L_SIGN_04` 并把 `sign_corner` 指过去，体验会更好**——这一步留给 T5 或队长决定。

---

## 二、台词 id 清单（已与 lines.csv 交叉核对）

`scene1.json` 里引用的 id 全部列在这里。`main.js` 的 `preloadVoice()` 会按
`signs[].line` 和 `tasks[].line` 预加载，**id 不存在就会在控制台报"缺失"，
玩家说"读一下牌子"时静默无声**——这种失败很难查，所以提交前必须核对。

| id | 引用位置 | 台词内容 | 在 lines.csv 中 |
| --- | --- | --- | --- |
| `L_SIGN_01` | `signs[sign_corner].line` | 此处为盲道，请勿占用。 | ✅ |
| `L_SIGN_02` | `signs[sign_guide].line` | 无障碍通道，前方五十米。 | ✅ |
| `L_SIGN_03` | `signs[sign_bikes].line` | 共享单车请停放在线内。 | ✅ |
| `L_TASK_AVOID` | `tasks[bypass_bikes].line` | 你绕过了自行车，又踩回了盲道。做得好。 | ✅ |
| `L_TASK_SIGN` | `tasks[read_bikes_sign].line` | 你把牌子读完了。 | ✅ |
| `L_TASK_01` | `tasks[reach_teach].line` | 你摸到了教学楼的门。这一段路，你走完了。 | ✅ |

6 条全部命中，无缺失。

---

## 三、声景素材登记

### 实际需要的文件

T1 的 `src/audio/materials.js` 里 `MANIFEST` 是**冻结的清单**，
只认下面这些名字，文件放在 `assets/amb/` 与 `assets/sfx/`，都是 `.mp3`。

| 素材名 | 目录 | 用途 | 来源链接 | 许可证 | 作者 | 大小 / 时长 |
| --- | --- | --- | --- | --- | --- | --- |
| `traffic_low` | `assets/amb/` | 右侧车流，玩家靠它判断有没有走偏 | https://freesound.org/people/thesfxcompany/sounds/612272/ | CC0 | thesfxcompany | 472 KB / 57 s |
| `crowd` | `assets/amb/` | 路口人群，给"快到教学楼了"的氛围 | https://freesound.org/people/anturium.studio/sounds/818064/ | CC0 | anturium.studio | 1.25 MB / 149 s |
| `wind` | `assets/amb/` | 西侧草地风声，区分"走错方向" | https://freesound.org/people/Garuda1982/sounds/852236/ | CC0 | Garuda1982 | 1.24 MB / 156 s |
| `bike_bell` | `assets/amb/` | 自行车铃（可选，场景里暂未放置） | https://freesound.org/people/newagesoup/sounds/383631/ | CC0 | newagesoup | 21 KB / 3.4 s |
| `blocked` | `assets/sfx/` | 撞到障碍物的碰撞音 | https://freesound.org/people/Osiruswaltz/sounds/457741/ | CC0 | Osiruswaltz | 10 KB / 1.3 s |
| `success` | `assets/sfx/` | 任务完成音 | https://freesound.org/people/1bob/sounds/717771/ | CC0 | 1bob | 8 KB / 0.8 s |
| `hint` | `assets/sfx/` | 偏离提示音 | https://freesound.org/people/chungus43A/sounds/580789/ | CC0 | chungus43A | 19 KB / 2.7 s |

**素材原始标题**（点链接核对时用，标题和文件名对不上是正常的）：

| 文件名 | freesound 上的原标题 |
| --- | --- |
| `traffic_low.mp3` | AMBTraf_Distant Traffic Ambience, Kids, Birds, 7 am, Morning, Mumbai, INDIA |
| `crowd.mp3` | 09. AMBIENCE Jarmark Jakubowy Return Walk Crowd Festival Market Cathedral Street Old Town |
| `wind.mp3` | Abandoned Railway Embankment: Urban Midday Ambience with Wind |
| `bike_bell.mp3` | bicycle-bell_19.wav |
| `blocked.mp3` | Wall Bump 1.wav |
| `success.mp3` | victory chime |
| `hint.mp3` | Notification 1 |

**许可证核实方式**：全部经 freesound 搜索页的 `license:"Creative Commons 0"` 过滤取得，
并且**逐个打开原始页面确认页面内标注为 CC0**（7/7 命中），不是只看过滤器。
CC0 不要求署名，但署名是更好的实践，所以照样登记。

> ⚠️ **两点如实说明**
>
> 1. 下载的是 freesound 的**预览版 mp3**（URL 里的 `-lq`，码率较低，64–128 kbps）。
>    现场够用；若想要高音质，用账号重新下原文件、覆盖同名文件即可，代码不用改。
> 2. **这 7 条音色没有人试听过**（做这件事的是 AI，听不了）。
>    `traffic_low` 里带着晨间的鸟叫和小孩声、`crowd` 是集市人群、
>    `wind` 是废弃铁路路基的午后风声——按标题是贴的，但**必须由人戴耳机过一遍**，
>    不合适的换掉，别等现场才发现车流听起来像瀑布。

### 脚步三种材质：不需要素材

任务卡里把"脚步三种材质"算进了 8 条素材，但 T1 已经决定**脚步全部现场合成**
（`materials.js` 的 `STEP_PROFILE`：盲道 2.1kHz 脆响、水泥 900Hz 中等、草地 420Hz 闷响）。
理由是缺文件时不能静音，否则核心机制直接失效。所以 `assets/foot/` 里放文件也不会被加载。

**结论**：实际需要的是 **4 条环境音 + 3 条音效 = 7 个文件，已全部到位**（共 3.01 MB，单个最大 1.25 MB）。
任务卡说的 8 条是按"每种材质一条"数出来的，跟当前实现已经对不上——以本文为准。

> 📌 **文件归属提醒**：任务卡给 T3 的文件清单只写了 `content/scene1.json` 和 `content/credits.md`，
> 但"声景素材 8 条"只能落在 `assets/amb/` 与 `assets/sfx/`。
> 这两个目录不在任何人的清单里，所以 T3 补上——**请在群里说一声**，
> 避免和 T1（`src/audio/*`）、T5（`assets/voice/*`）撞车。

---

## 四、两处接口不一致（需要团队确认，我没有改冻结文件）

### 1. `avoid` 任务缺 `obstacleId` 的定义

`content/schema.md` 写的是：

> `avoid`：绕过障碍后**重新回到盲道**，必填字段 `obstacleId`

但 `src/core/contracts.js` 的 `Task` typedef 只声明了
`id / type / target / radius / signId / line`，**没有 `obstacleId`**。

schema.md 自己规定"若发现不一致，以 contracts.js 为准并立即修正本文件"，
照这条字面执行，`avoid` 任务就没法知道要绕过哪个障碍——T7 的判定必然写不出来。

我在 `scene1.json` 里按 schema.md 写了 `"obstacleId": "bikes"`。
**这是我的判断，不是替 T0 改契约**：`contracts.js` 是冻结文件，我没动它。
建议 T0 负责人补一行 typedef，顺手在 schema.md 里标注一句。

### 2. 素材条数

见上一节。以 `materials.js` 的 `MANIFEST` 为准。

---

## 五、几何与节奏（给 T8 真机测试用）

| 项 | 数值 | 说明 |
| --- | --- | --- |
| 路线长度 | 38 米 | 北段 23 米 + 西段 15 米（11-25 按 0.5 等比缩短，见 test-log T-011） |
| 纯直走耗时 | 约 32 秒 | 1.2 m/s（T2 的 `WALK_SPEED`） |
| 含交互耗时 | 约 45–55 秒 | 读牌、敲杖、绕行、重新找盲道 |
| 起点朝向 | `heading: 0`（正北） | 填错就是一开局朝反方向走，见 schema 的警告 |
| 车流位置 | `x = +7`（右手边） | 朝北走时右手是东，这是"靠车流保方向"的依据 |
| 障碍覆盖 | `x ∈ [-0.8, 0.8]` | 盲道只有 `x ∈ [-0.6, 0.6]`，含玩家半径 0.35 后绕行至少要偏 1.15 米 |

> **绕行时是否听到偏离提示，取决于绕多远，这是预期行为。**
> T2 的偏离阈值 1.5 米、冷却 6 秒。缩短后的场景绕行只需偏 1.15 米，
> 实测点 `(1.40, -16.95)` 偏离 1.40 米，**不会**触发提示；
> 若绕到 2 米开外就会听到「你偏离了盲道。」——那也是对的，
> 它确实是在提醒你偏离了。记录时按这个理解写，别记成缺陷。

---

## 六、自测记录

| 日期 | 测什么 | 结果 | 据此改了什么 |
| --- | --- | --- | --- |
| 2026-11-22 | JSON 语法与字段完整性（46 项脚本校验） | 46 项全过 | 无需改动 |
| 2026-11-22 | 用 T2 的 `scene.js` 真加载器解析 | `load()` 返回 OK；1 盲道 / 3 矩形 / 1 障碍 / 4 声源 / 3 牌 / 3 任务全部解析 | 无需改动 |
| 2026-11-25 | 缩短后重新沿路线采样（北段 23 米 + 西段 15 米，每 0.5 米一点） | 78 个采样点**全部** `tactile`，最大偏离 0.0000 米 | 无需改动 |
| 2026-11-25 | 缩短后绕行点偏离是否触发提示 | `(1.40,-16.95)` 偏离 1.40 米 **低于** 1.5 米阈值，不触发；绕到 2 米开外则触发 | 判定符合预期，非缺陷 |
| 2026-11-22 | 三块牌的可达性（`nearestSign` 半径 3 米） | `(0,-12)`→sign_access、`(0,-31)`→sign_bikes、`(0,-44.5)`→sign_fork，全部命中 | 无需改动 |
| 2026-11-22 | 下载 7 条声景素材并核对许可证 | 7/7 到位，共 3.01 MB，单个最大 1.25 MB；逐个打开原始页面确认 CC0 | 无需改动 |
| 2026-11-22 | 文件名与 `materials.js` 的 `MANIFEST` 对齐 | 7 个名字全部命中，无遗漏无多余 | 无需改动 |
| 待办 | 起服务器后 `scene:loaded` 是否触发、按住 W 5 秒是否仍在盲道 | 未测 | 需要浏览器，留给 T8 |
