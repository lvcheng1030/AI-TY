# 任务分解与分派

> 这份文档的用途：**把下面每张任务卡整段复制给 AI（或直接作为同事的开工说明），就能独立开工。**
>
> 每张卡都自带：仓库地址、你的分支名、你能改的文件、硬性约束、要实现的细节功能、验收标准、自测方法、提交方式。
>
> - 仓库地址：**https://github.com/lvcheng1030/AI-TY**（公开）
> - 默认分支：`main`
> - 任务卡总览见下方表格；详细内容从 T0 开始

---

## 一、开始前（每人只做一次）

### 1. 拿到仓库权限

仓库归 `lvcheng1030`。其他人要能推送，必须先被加为协作者：

> 仓库 → Settings → Collaborators → **Add people** → 输入队友的 GitHub 用户名 → 发送邀请 → 对方在邮件/GitHub 通知里接受

**不做的后果**：推送时报 `403` 或 `Permission denied`。

### 2. 安装并配置 Git

```bash
git --version                                  # 确认已安装；没有则装 Git for Windows
git config --global user.name  "你的名字"
git config --global user.email "你的邮箱"      # 建议用 GitHub 账号邮箱
git config --global core.quotepath false       # 让中文文件名正常显示
```

### 3. 克隆仓库

```bash
git clone https://github.com/lvcheng1030/AI-TY.git
cd AI-TY
```

用 HTTPS 而不是 SSH，是因为 Windows 版 Git 自带凭据管理器（Git Credential Manager）：**第一次推送时会自动弹出浏览器让你登录 GitHub，之后就不用再管**。不需要生成密钥、不需要配 token。

> 只有 `lvcheng1030` 本人已配好 SSH，他可用 `git@github.com:lvcheng1030/AI-TY.git`。

### 4. 确认能打开项目

项目**没有构建步骤**，不需要 `npm install`。用任意静态服务器打开即可：

```bash
# 任选一种
python -m http.server 8000
npx --yes serve . -l 8000
```

然后浏览器访问 `http://localhost:8000`。

> 必须用 `localhost` 而不是双击 HTML 文件——因为麦克风权限只在安全上下文里可用，`localhost` 算安全上下文，`file://` 不算。

---

## 二、必须遵守的五条硬约束

这五条是为了保证**四个人并行开发最后能合到一起**，不是形式要求。

| # | 约束 | 为什么 |
| --- | --- | --- |
| 1 | **零运行时依赖**：不得引入任何 npm 包、不得用 CDN | 游园会现场网络不可靠，且这是已定的技术选型（见 `docs/references.md`） |
| 2 | **无构建步骤**：纯 ES 模块，浏览器直接跑 | 免去 `node_modules` 冲突与安装失败，这是四个人能并行的前提 |
| 3 | **只改自己任务卡里列出的文件** | 文件归属互不重叠，是避免合并冲突的唯一办法 |
| 4 | **不改 `src/core/` 与 `content/schema.md`** | 这是冻结的接口契约，改了会同时打断所有人 |
| 5 | **不做需要分辨“正后方”的设计** | `docs/test-log.md` 的 T-001 实测结论：人耳分不出前后 |

### 提交信息格式

```
<类型>: <一句话说明>
```

类型只允许：`feat` / `fix` / `docs` / `test` / `chore` / `spike`

例：
```
feat(audio): 完成 HRTF 声源池与听者朝向更新
fix(nlu): 修正“往左边”被误判为向右
docs: 补场景 1 的台词与素材来源
```

**提交要小步多次**。不要一天攒一个巨型提交——评审要从 `git log` 看出真实的开发过程。

### 分支命名

```
feat/t<编号>-<简短英文名>       例：feat/t1-audio-engine
```

### 绝对不要提交的东西

`.env`、任何密钥、`node_modules`、超过 5MB 的音频、系统生成的临时文件。
`.gitignore` 已覆盖大部分；**提交前跑一次 `git status` 确认**。

---

## 三、任务总览

| 编号 | 任务 | 分支 | 拥有这些文件 | 预估 | 依赖 |
| --- | --- | --- | --- | --- | --- |
| **T0** | 骨架与接口冻结 | `chore/t0-scaffold` | `index.html`、`src/main.js`、`src/core/*`、`content/schema.md`、`docs/CONVENTIONS.md` | 3–4h | 无（**必须先做**） |
| **T1** | 空间音频引擎 | `feat/t1-audio-engine` | `src/audio/*` | 5h | T0 |
| **T2** | 移动 · 碰撞 · 盲道判定 | `feat/t2-movement` | `src/world/*` | 5h | T0 |
| **T3** | 场景内容与关卡数据 | `feat/t3-scene-content` | `content/scene1.json`、`content/credits.md` | 4h | T0 |
| **T4** | 语音识别与意图解析 | `feat/t4-asr-intents` | `src/speech/asr.js`、`src/nlu/*`、`content/intents.cases.json` | 5h | T0 |
| **T5** | 台词预渲染管线 | `feat/t5-tts-pipeline` | `tools/tts_build.py`、`src/speech/voice.js`、`content/lines.csv`、`assets/voice/*` | 3h | T0 |
| **T6** | 页面外壳与无障碍 | `feat/t6-shell-a11y` | `src/ui/*` | 4h | T0 |
| **T7** | 任务判定与单局结算 | `feat/t7-tasks-session` | `src/game/*` | 4h | T0、T2 |
| **T8** | 真机测试与验证记录 | 无分支，直接追加 | `docs/test-log.md` | 持续 | 全部 |
| **T9** | 交付材料与现场准备 | 无分支 | `docs/`、`materials/` | 4h | 全部 |

### 按人数分配

| 人数 | 建议分配 |
| --- | --- |
| **4 人** | 甲：T0 → T1 → T8　乙：T2 → T7　丙：T3 → T5 → T9　丁：T4 → T6 → T8 |
| **3 人** | 甲：T0 → T1 → T8；乙：T2 → T7 → T9；丙：T3 → T5 → T4 → T6 |
| **5 人** | 4 人方案基础上，把 T8/T9 拆给第 5 人专职（现场运营、录屏、材料核验） |

**关键路径是 T0**。T0 不合入 `main`，其他人无法开工——所以 T0 必须第一个做完并先合。

---

## T0 · 骨架与接口冻结

**执行人**：队长（或第一个开工的人）
**分支**：`chore/t0-scaffold`
**拥有文件**：`index.html`、`src/main.js`、`src/core/bus.js`、`src/core/loop.js`、`src/core/vec.js`、`src/core/contracts.js`、`content/schema.md`、`docs/CONVENTIONS.md`，以及**所有模块的桩文件**（见下）
**依赖**：无。**这是唯一一个别人要等的任务。**

### 为什么要先做这个

四个人并行开发最容易死在“改同一个文件”上。解决办法是**先把文件归属切开，并为每个模块预置空壳**：
`index.html` 一次性把全部模块都 `import` 进来，每个模块是已经存在的空壳文件。于是每个人只填自己的空壳，**没有任何共享文件需要同时编辑**。

### 要完成的细节

1. **`index.html`**：只做三件事——引入 `./src/main.js`、提供 `#app` 挂载点、用 `prefers-reduced-motion` 等基础 meta。**不写业务逻辑，不写内联脚本。**
2. **`src/core/bus.js`**：事件总线，导出单例 `bus`，方法 `on(evt, fn)` / `off(evt, fn)` / `emit(evt, payload)`，外加 `once`。`emit` 时某个监听器抛错**不得**中断其它监听器（用 try/catch 包住并 `console.error`）。
3. **`src/core/loop.js`**：固定步长循环，导出 `createLoop({ fps = 60, onTick })`，返回 `{ start, stop, tick(dt), running }`。
   - **必须支持 `tick(dt)` 手动步进**：这让游戏逻辑可以脱离真实时间做测试（此设计借鉴自 `audiogame-utils`，见 `docs/references.md`）。
   - 用 `requestAnimationFrame`，并对 dt 做上限截断（防止切后台回来一次跳很大一步）。
4. **`src/core/vec.js`**：二维向量工具。世界坐标用 `{ x, z }`（不用 y，地面是平面）。导出 `dist`、`sub`、`len`、`norm`、`scale`、`angleDiff`（处理 ±180° 环绕）。
5. **`src/core/contracts.js`**：**冻结的契约**。用 JSDoc 定义所有事件名与数据结构，并导出事件名常量表。
   至少要定义这些事件（名字与字段一经确定不可再改）：
   - `scene:loaded` → `{ sceneId }`
   - `player:moved` → `{ x, z, heading }`
   - `player:blocked` → `{ obstacleId }`
   - `surface:changed` → `{ type }`（`tactile` / `concrete` / `grass`）
   - `cane:probe` → `{ hit, distance, surface }`
   - `sign:nearby` → `{ signId }`
   - `intent` → `{ name, confidence, utterance }`
   - `speak` → `{ lineId, priority }`
   - `task:done` → `{ taskId }`
   - `degrade:on` / `degrade:off` → `{ reason }`
   - `session:end` → `{ stats }`
6. **`content/schema.md`**：写清 `scene1.json` 的字段定义（照抄下面示例并解释每个字段），并声明**此文件冻结**。
7. **所有模块桩文件**，每个都必须能被 `import` 且导出 `main.js` 需要的函数（空实现或 `console.warn('未实现')`）：
   - `src/audio/engine.js`（T1）
   - `src/world/player.js`、`src/world/collision.js`、`src/world/scene.js`（T2）
   - `src/speech/asr.js`、`src/nlu/intents.js`（T4）
   - `src/speech/voice.js`（T5）
   - `src/ui/screens.js`、`src/ui/a11y.js`（T6）
   - `src/game/tasks.js`、`src/game/session.js`（T7）
8. **`src/main.js`**：装配入口。**把上面所有模块都 import 进来**，创建 loop，把各模块的 `init()` 串起来。业务逻辑留空，只保证「引用不报错、循环能跑起来、控制台能打印 ready」。
9. **`docs/CONVENTIONS.md`**：把本文档第二、三节的约定抄进去（硬约束、提交格式、分支命名、文件归属表）。
10. **更新 `README.md`** 两处：
    - 技术栈那一行把「Vite + TypeScript」改为「原生 ES 模块，无构建步骤」，并写明用 `localhost` 起静态服务器运行。**这是对既定决策的修正，要说明理由**：免去安装与合并冲突，符合零依赖选型。
    - 加一行链接到本文件：`开发任务分解见 [docs/tasks.md](docs/tasks.md)`，让拿到仓库的人一眼能找到分工。

### `content/scene1.json` 的骨架（T3 会填内容）

```json
{
  "id": "dorm_to_teach",
  "title": "宿舍 → 教学楼",
  "duration": [90, 110],
  "start": { "x": 0, "z": 0, "heading": 90 },
  "tiles": [
    { "type": "tactile",  "points": [[0,0],[0,40]], "width": 1.2 },
    { "type": "concrete", "rect": [-8, 0, 16, 40] }
  ],
  "obstacles": [
    { "id": "bikes", "rect": [-1.5, 14, 2.0, 1.0], "sfx": "blocked" }
  ],
  "emitters": [
    { "id": "traffic", "pos": [6, 30], "audio": "traffic_low", "loop": true, "gain": 0.6 }
  ],
  "signs": [
    { "id": "sign1", "pos": [0, 8], "line": "L_SIGN_01" }
  ],
  "tasks": [
    { "id": "reach", "type": "reach", "target": [0, 38], "radius": 3 }
  ]
}
```

### 验收标准

- [ ] `python -m http.server 8000` 后打开首页，控制台**无任何报错**
- [ ] 控制台能看到循环在跑（如打印 `ready` 与 tick 计数）
- [ ] 上述所有桩文件都存在且可被 import
- [ ] `docs/CONVENTIONS.md` 与实际约定一致
- [ ] `README.md` 技术栈已修正
- [ ] `git log` 至少有 3 个提交（骨架、契约、桩文件分开提交）

### 提交方式

```bash
git switch -c chore/t0-scaffold

# 分多次提交，例如：
git add index.html src/main.js src/core
git commit -m "chore: 建立骨架、事件总线与固定步长循环"
git add src/core/contracts.js content/schema.md
git commit -m "chore: 冻结事件契约与场景数据格式"
git add src/audio src/world src/speech src/nlu src/ui src/game
git commit -m "chore: 预置各模块桩文件（保证并行开发互不冲突）"
git add docs/CONVENTIONS.md README.md
git commit -m "docs: 补开发约定并修正技术栈说明"

git push -u origin chore/t0-scaffold
```

然后开 PR（**这是团队最快的合并方式**，不要直接推 main）：

```
https://github.com/lvcheng1030/AI-TY/compare/main...chore/t0-scaffold?expand=1
```

- PR 标题：`T0 骨架与接口冻结`
- PR 描述：把上面「验收标准」逐条勾选，贴一张控制台无报错的截图

**T0 合入 `main` 后，其他人才能开始。**

---

## T1 · 空间音频引擎

**分支**：`feat/t1-audio-engine`
**拥有文件**：`src/audio/engine.js`、`src/audio/materials.js`、`tests/audio.test.html`
**依赖**：T0

### 要完成的细节

1. **AudioContext 单例**：必须在**首次用户手势**里创建/恢复（浏览器安全策略，见 `docs/references.md` 的 themis 一条）。导出 `initAudio()`，重复调用安全。
2. **声源池**：封装 `PannerNode`，导出 `createSource({ audio, pos, loop, gain })`、`updateSource(id, { pos })`、`stopSource(id)`。
   - `panningModel: 'HRTF'`、`distanceModel: 'inverse'`
   - `refDistance: 1`、`rolloffFactor: 0.5`、`maxDistance: 30`
3. **听者更新**：`setListener({ x, z, heading })`，每帧由 T2 调用。要写入 `listener.positionX/Z`（带 `setPosition` 回退分支，兼容旧 Safari）与 `forwardX/Z`。
4. **⚠️ 前向半平面约束**：**不得把需要玩家分辨的声源放在正后方。**
   依据 `docs/test-log.md` T-001 的实测：正前与正后给的双耳线索几乎相同，人耳分不出来。实现上要有**代码级保护**：`createSource` 若收到位于听者正后方的定位声源，`console.warn` 并把它夹到前向半平面。
5. **脚步**：三种路面 `tactile` / `concrete` / `grass`，导出 `setSurface(type)` 与 `setSpeed(v)`。音色要有明显差异，步频随速度变化。**没有音频文件时必须能用振荡器合成兜底**，不得静音或崩溃。
6. **敲杖探测**：导出 `caneProbe()`。发 `cane:probe` 事件，返回 `{ hit, distance, surface }`。
   - 只探测**前向 ±45° 锥形**范围内最近的目标（这是把混淆锥从机制里移除的关键）
   - 距离的表达用**回声延迟 + 混响量**，不是只靠音量（机制来源见 `docs/references.md` 的 finding-echo）
   - 具体参数取值取决于 `spike/02-echo-distance.html` 的实测结论：**若该测试尚未完成，先用占位常数并在代码里写 `// TODO(依赖 spike 02 结论)`**，不要自己编最终数值
7. **环境音**：`playAmbience(emitters)` 按 `scene1.json` 的 `emitters` 建立循环声源。
8. **调试接口**：挂 `window.__audioDebug = { sources, listener, lastProbe }`，方便 T8 排查问题。

### 验收标准

- [ ] 页面加载后**不点击任何东西不发声**（符合浏览器策略），点击后能出声
- [ ] 三个方向（左 / 前 / 右）各播一次，人耳可分辨
- [ ] 把声源放到正后方时，控制台出现 warn 且实际声像被夹到前方
- [ ] 切三种路面，脚步声有明显差异
- [ ] 敲杖能返回距离，且近处与远处的回声**延迟不同**
- [ ] 断开网络（DevTools → Offline）后仍能运行
- [ ] 全程无 npm 依赖、无 CDN 引用

### 自测方法

`tests/audio.test.html`：一个页面，放几个按钮——“左 / 前 / 右 各播一次”“近处敲杖”“远处敲杖”“切换路面”，外加显示当前监听器坐标。**不需要任何测试框架**，点按钮听 + 看数值即可。

### 提交方式

```bash
git switch -c feat/t1-audio-engine
git add src/audio tests/audio.test.html
git commit -m "feat(audio): HRTF 声源池与听者朝向更新"
git commit -m "feat(audio): 三种路面脚步与速度联动"
git commit -m "feat(audio): 前向锥形敲杖探测与距离表达"
git push -u origin feat/t1-audio-engine
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t1-audio-engine?expand=1`

---

## T2 · 移动 · 碰撞 · 盲道判定

**分支**：`feat/t2-movement`
**拥有文件**：`src/world/player.js`、`src/world/collision.js`、`src/world/scene.js`、`tests/world.test.html`
**依赖**：T0

### 要完成的细节

1. **键盘操作**：`W/S` 前后移动，`A/D` 原地转身，`空格` 敲杖。
   - 移动速度约 **1.2 m/s**，转身约 **90°/s**
   - **必须支持按住连续移动**，不是按一次走一步
   - 键盘**永远可用**：语音是叠加层，不是唯一入口（现场噪音大，这是保命设计）
2. **移动积分**：在 loop 的每帧里用 `dt` 更新位置与朝向，发 `player:moved`。
3. **碰撞**：矩形障碍碰撞。撞上时**不进入**障碍区域，发 `player:blocked`，并触发碰撞音（交给 T1）。
4. **路面判定**：根据当前位置判断处于哪种路面（`tactile` / `concrete` / `grass`），状态**变化时**发 `surface:changed`（不要每帧都发）。
5. **盲道判定**：`tactile` 由折线 + 宽度描述。计算玩家到盲道中心线的**横向偏离距离**，导出纯函数 `pathDeviation(pos, path)`。
6. **偏离提示**：偏离超过 **1.5 米**才提示，且有**冷却时间**（建议 6 秒），避免频繁打扰把玩家逼疯。
7. **场景加载**：`loadScene(sceneJson)` 解析 T3 给的 `scene1.json`，建立内部数据结构，发 `scene:loaded`。
8. **纯函数可测**：几何、碰撞、盲道判定这些**必须与 DOM 和音频解耦**，导出可单独调用的函数。这是本节最重要的工程要求——逻辑能测，才敢改。

### 验收标准

- [ ] 按住 `W` 能持续前进，松开立即停
- [ ] 撞到障碍物停在边缘，并有提示音
- [ ] 走到盲道上路面类型切换，离开时切换回去
- [ ] 偏离盲道 1.5 米内**不提示**，超过才提示，且 6 秒内不重复提示
- [ ] `tests/world.test.html` 里几何与碰撞的用例全过
- [ ] 逻辑文件里**没有** `document`、`window.audio` 之类依赖（可在测试页里静态检查）

### 自测方法

`tests/world.test.html`：用一组坐标跑断言，页面上列出「用例 / 期望 / 实际 / 通过与否」。覆盖：点在线上的偏离为 0、点在 1.5 米外、矩形碰撞的边界、转角处的朝向换算。

### 提交方式

```bash
git switch -c feat/t2-movement
git add src/world tests/world.test.html
git commit -m "feat(world): 键盘移动与转身，固定步长积分"
git commit -m "feat(world): 矩形碰撞与阻挡反馈"
git commit -m "feat(world): 路面判定与盲道偏离计算"
git push -u origin feat/t2-movement
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t2-movement?expand=1`

## T3 · 场景内容与关卡数据

**分支**：`feat/t3-scene-content`
**拥有文件**：`content/scene1.json`、`content/credits.md`
**依赖**：T0
**重要**：这个任务**不需要写任何代码**。改 JSON 和写文案即可——这是刻意为不写代码的人设计的入口。

### 要完成的细节

1. **场景 1 路线**：宿舍门口 → 人行道（车流在**右侧**）→ 自行车占了盲道 → 告示牌 → 岔路口 → 教学楼门口。**总时长控制在 90–110 秒**。

2. **四个事件点的节奏表**（这是关卡设计，不是写文档）：

| 时间 | 事件 | 玩家要做的判断 |
| --- | --- | --- |
| 0–10s | 出门，脚踩上盲道 | 听出路面材质变化 |
| 10–40s | 人行道，车流在右 | 靠车流方位保持在盲道上 |
| 40–65s | 自行车挡住盲道 | 敲杖发现障碍 → 绕行 → 再回到盲道 |
| 65–90s | 告示牌 + 岔路 | 说“帮我读一下前方告示牌” → 说“向左走” |
| 90–110s | 到达教学楼门口 | 任务完成 |

3. **三块告示牌文案**：要**像真实校园标牌**，不要写成游戏提示。参考方向：无障碍通道指引、共享单车禁停区、教学楼方向指示。每块牌对应 `lines.csv` 里一个 `line` id。

4. **声景素材 8 条**：车流、人群、风声、自行车铃、脚步三种材质、环境底噪。
   - **只用 CC0 或明确允许商用的素材**（推荐 freesound.org 的 CC0 过滤）
   - **每一条都要登记进 `content/credits.md`**：素材名、来源链接、许可证、作者。**这项是评审会查的，漏了就是硬伤。**

5. **填 `content/scene1.json`**，字段定义见 T0 的 `content/schema.md`。填完必须能被 T2 的加载器直接读入。

### 验收标准

- [ ] JSON 语法合法（用 JSON 校验器过一遍）
- [ ] 能被 T2 的 `loadScene()` 加载且控制台无报错
- [ ] 路线走完耗时在 90–110 秒
- [ ] 三块告示牌文案齐全，且每块都有对应 `line` id
- [ ] 8 条声景素材全部在 `credits.md` 里有来源与许可证
- [ ] **（加分）**经 1 位视障同学或无障碍社团成员看过文案，并把意见记进 `docs/test-log.md`

### 提交方式

```bash
git switch -c feat/t3-scene-content
git add content/scene1.json
git commit -m "feat(content): 场景 1 路线与四段节奏"
git add content/credits.md
git commit -m "docs(content): 登记声景素材来源与许可"
git push -u origin feat/t3-scene-content
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t3-scene-content?expand=1`

---

## T4 · 语音识别与意图解析

**分支**：`feat/t4-asr-intents`
**拥有文件**：`src/speech/asr.js`、`src/nlu/intents.js`、`content/intents.cases.json`
**依赖**：T0

### 要完成的细节

1. **12 条指令表**（锁定，不得随意增删）：

| 意图 | 参考说法 |
| --- | --- |
| `move_forward` | 往前走、前进、直走 |
| `move_left` | 向左走、往左、左边 |
| `move_right` | 向右走、往右、右边 |
| `turn_left` | 左转、转左 |
| `turn_right` | 右转、转右 |
| `stop` | 停、停下、别走 |
| `read_sign` | 帮我读一下前方告示牌、读牌子、这是什么牌子 |
| `repeat` | 再说一遍、重复 |
| `where_am_i` | 我在哪、这是哪 |
| `look_ahead` | 帮我看看前面、前面有什么 |
| `faster` | 走快点、快一点 |
| `slower` | 走慢点、慢一点 |

2. **ASR 封装**（`asr.js`）：
   - 用 `window.SpeechRecognition || window.webkitSpeechRecognition`，`lang = 'zh-CN'`
   - **短按说话**（按下开始、松开结束），不用常听
   - 必须处理：不支持该 API、权限被拒、网络中断、3 秒无结果超时
   - **任何一种失败都不得让游戏崩溃**，一律发 `degrade:on` 并允许走按钮/打字

3. **三态置信**（本任务的技术核心，也是评审最看重的“AI 自主判断”）：

| 匹配得分 | 行为 | 玩家听到的 |
| --- | --- | --- |
| ≥ 0.85 | **直接执行** | 一声短提示音 |
| 0.55 – 0.85 | **回述确认** | “你是说，向左走吗？” 等「是 / 否」 |
| < 0.55 | **拒答** | “我没听清。可以说往前走、向左走、向右走，或者帮我读一下前方的牌子。” |

**连续 2 次低于 0.55** → 发 `degrade:on`，并提示可改用按键或打字。

4. **打分规则**（自己实现，**不要复制 `audiogame-utils` 的代码**）：
   - 同义词表**精确命中** → 1.0
   - 与某个同义词的**编辑距离 ≤ 2** → 0.85
   - **包含**关键词 → 0.65
   - 其余 → 0
   - 编辑距离用标准算法自行实现（约 40 行）。设计思路借鉴自 `audiogame-utils` 的 `text.stringDistance`，见 `docs/references.md`

5. **60 条测试用例**（`content/intents.cases.json`）：12 条指令 × 5 种说法，每个用例写清 `intent` 与 `say` 数组。**要故意混入容易混淆的句子**，例如“往左边”会被“往左”和“左边”两个同义词同时命中，检验打分是否稳定。

6. **纯函数**：`parse(utterance) → { intent, confidence, matched }` 必须是**纯函数**，不依赖浏览器 API。这样它才能被批量测试。ASR 只是把文本喂给它。

### 验收标准

- [ ] 60 条用例全部通过（在测试页里一键跑完并列出结果）
- [ ] 三态行为都能复现：高置信直接走、中置信会追问、低置信会拒答
- [ ] 语音到行动的端到端延迟 **≤ 1.5 秒**
- [ ] 在 DevTools 里切 Offline 后，功能降级但**页面不崩**
- [ ] 用不支持该 API 的浏览器打开，自动降级到按钮，无报错
- [ ] `intents.js` 里没有任何 `window` / `document` 引用
- [ ] 连续两次听不懂时，`degrade:on` 事件被发出

### 自测方法

在 `tests/` 下放一个测试页：读入 `content/intents.cases.json`，逐条调用 `parse()`，表格列出「输入 / 期望 / 实际 / 得分 / 通过」。**一眼就能看出哪条不稳定。**

### 提交方式

```bash
git switch -c feat/t4-asr-intents
git add src/speech/asr.js
git commit -m "feat(speech): 语音识别封装与失败降级"
git add src/nlu/intents.js content/intents.cases.json
git commit -m "feat(nlu): 12 条指令的同义词表与编辑距离打分"
git commit -m "feat(nlu): 三态置信（执行 / 回述确认 / 拒答）"
git push -u origin feat/t4-asr-intents
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t4-asr-intents?expand=1`

---

## T5 · 台词预渲染管线

**分支**：`feat/t5-tts-pipeline`
**拥有文件**：`tools/tts_build.py`、`src/speech/voice.js`、`content/lines.csv`、`assets/voice/*`
**依赖**：T0

### 为什么要预渲染

台词是固定的。**构建期一次性合成 mp3，运行时只播放**——换来三个好处：零延迟、断网可用、音色统一。运行时 TTS 只留给“回述确认”这类动态内容。这条已写进 `README.md`。

### 要完成的细节

1. **`content/lines.csv`**：字段固定为 `id,text,voice,scene`。示例：

```csv
id,text,voice,scene
L_INTRO_01,你正站在宿舍门口。前方是人行道，右侧有车流。,xiaoxiao,1
L_SIGN_01,此处为盲道，请勿占用。,xiaoxiao,1
L_LOWCONF_01,你是说，向左走吗？,xiaoxiao,-
```

2. **`tools/tts_build.py`**：
   - 用 `edge-tts` 合成，输出 `assets/voice/{id}.mp3`，**文件名即 id**
   - **增量构建**：已存在且文本未变则跳过（用文本哈希判断），重跑不重复消耗时间
   - 支持 `--only L_SIGN_01` 只重出某一条，`--force` 全量重出
   - 结束打印清单：新增 / 跳过 / 失败各多少条
   - 失败**不得静默**，要打印是哪条 id 失败
   - 安装依赖的方式写进文件头部注释：`python -m pip install edge-tts`

3. **`src/speech/voice.js`**：
   - `speak(lineId, { priority })`：播放队列，**高优先级可打断低优先级**（例如紧急提示打断旁白）
   - **找不到对应的 mp3 时**回退到 `speechSynthesis`，并 `console.warn` 说明缺哪个文件
   - `stopAll()`
   - 播放开始/结束各发一个事件，方便 UI 显示"正在播报"

4. **文件命名规范**：`L_` 前缀 = 台词，`S_` 前缀 = 系统提示（如"这里有点吵"）。**同一 id 不得在 CSV 里出现两次。**

5. **mp3 入库**：语音文件**要提交到仓库**（单条约 10–50KB，总量可控）。理由是现场必须离线可用——不能指望游园会的网络。

### 验收标准

- [ ] `python tools/tts_build.py` 能跑通，生成全部 mp3
- [ ] 改一句文本后重跑，**只有那一条**被重新合成
- [ ] `content/lines.csv` 里的每个 id 都有对应的 mp3
- [ ] 故意删掉一个 mp3，`speak()` 走回退分支且页面不报错
- [ ] 高优先级语音能打断正在播的低优先级语音
- [ ] `assets/voice/` 总体积记录在 PR 描述里（要控制住）

### 提交方式

```bash
git switch -c feat/t5-tts-pipeline
git add tools/tts_build.py content/lines.csv
git commit -m "feat(tools): 台词预渲染脚本，支持增量构建"
git add assets/voice
git commit -m "feat(assets): 生成全部预渲染台词"
git add src/speech/voice.js
git commit -m "feat(speech): 播放队列、优先级打断与 TTS 回退"
git push -u origin feat/t5-tts-pipeline
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t5-tts-pipeline?expand=1`

---

## T6 · 页面外壳与无障碍

**分支**：`feat/t6-shell-a11y`
**拥有文件**：`src/ui/screens.js`、`src/ui/a11y.js`
**依赖**：T0

### 要完成的细节

1. **四个屏幕**：开始页 → 校准页 → 游戏中 → 结算页。用 `hidden` 属性切换，不引入路由库。

2. **开始页**：说明玩法 + **耳机检查**（左耳、右耳各播一声，问"两边都听到了吗"）。
   点「开始」的那一下同时承担**解锁 AudioContext** 的职责（浏览器策略要求）。

3. **校准页（30 秒，必须有）**：左、前、右各播一次，逐次问"听清了吗"。
   **依据**：`docs/test-log.md` T-001 的实测结论——空间音频的个体差异极大，通用 HRTF 覆盖不了所有人，所以必须让玩家自己校准一次。

4. **游戏中**：
   - **屏幕全黑**（这是作品的立意，不要加任何画面装饰）
   - 但右下角保留一个**可折叠的按钮面板**：`1 前进 / 2 向左 / 3 向右 / 4 读牌`，外加一个**打字输入框**。这是嘈杂环境下的降级通道
   - 面板默认收起，只在收到 `degrade:on` 时自动展开
   - 顶部常驻一行极小的状态：当前场景名、已用时

5. **结算页**：用时、完成任务数、敲杖次数、提示次数、语音失败次数。由 T7 提供数据。

6. **无障碍（本任务的重点，也是作品的自我一致性）**：

| 要求 | 做法 |
| --- | --- |
| 屏幕阅读器能读 | 一个 `aria-live="polite"` 的隐藏区域，把关键状态变化写进去 |
| 全键盘可操作 | 所有按钮可 Tab 到、回车/空格可触发；**焦点样式必须可见** |
| 尊重系统偏好 | `prefers-reduced-motion` 时禁用所有动画 |
| 语义正确 | 用真实 `<button>`，不用 `<div onclick>`；图片有 `alt` |
| 键盘陷阱 | 游戏中 Tab 不得跑出页面主体 |

### 验收标准

- [ ] **全程不用鼠标**能完成：开始 → 校准 → 玩 → 结算
- [ ] 打开 Windows「讲述人」或 NVDA，关键状态变化能被读出来
- [ ] 键盘焦点始终可见
- [ ] 手机浏览器能正常打开（Chrome / Safari 各试一次）
- [ ] 屏幕确实全黑——不放任何装饰性图形
- [ ] `prefers-reduced-motion` 打开时无动画

### 提交方式

```bash
git switch -c feat/t6-shell-a11y
git add src/ui/screens.js
git commit -m "feat(ui): 开始页、30 秒方位校准与结算页"
git commit -m "feat(ui): 游戏中全黑界面与降级按钮面板"
git add src/ui/a11y.js
git commit -m "feat(ui): 无障碍实时区域与全键盘操作"
git push -u origin feat/t6-shell-a11y
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t6-shell-a11y?expand=1`

---

## T7 · 任务判定与单局结算

**分支**：`feat/t7-tasks-session`
**拥有文件**：`src/game/tasks.js`、`src/game/session.js`
**依赖**：T0、T2

### 要完成的细节

1. **三类任务**：
   - `reach`：进入目标点半径内（如到达教学楼门口）
   - `read`：读了指定告示牌（监听 `intent` 事件里 `read_sign` 且旁边有牌子）
   - `avoid`：绕过障碍后重新回到盲道上（这是场景 1 的核心任务）

2. **判定逻辑必须是纯函数**：`checkTask(task, playerState, worldState) → boolean`。
   在 loop 里每帧调用，但**每个任务只允许完成一次**（完成后置标志位，发 `task:done`）。

3. **`session.js` 单局生命周期**：`start()` / `end()` / `reset()`。
   中途退出要能干净重开，**不得残留上一局的定时器或事件监听**（否则第二局会出现重复播报——这是最容易出的 bug）。

4. **单局时长上限**：3 个场景时总长 5 分钟。场景 1 单独跑时上限 110 秒，超时给一次温和提示，不强制中断。

5. **结算数据**：用时、完成任务数 / 总数、敲杖次数、被提示次数、语音识别失败次数。发 `session:end` 并把数据交给 T6 的结算页。

6. **`docs/test-log.md` 追加一条自测记录**：写清你测了什么、发现什么。

### 验收标准

- [ ] 每个任务**只触发一次**（反复走进目标点不会重复发 `task:done`）
- [ ] 故意绕开任务直接走到终点，结算显示任务未完成
- [ ] 连打两局，第二局**没有**上一局残留的播报或音效
- [ ] 结算数字与实际操作一致（手动数一遍敲杖次数核对）
- [ ] 判定函数不依赖 DOM / 音频，可单独调用

### 提交方式

```bash
git switch -c feat/t7-tasks-session
git add src/game/tasks.js
git commit -m "feat(game): 三类任务的判定与一次性触发"
git add src/game/session.js
git commit -m "feat(game): 单局生命周期与结算数据"
git push -u origin feat/t7-tasks-session
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t7-tasks-session?expand=1`

---

## T8 · 真机测试与验证记录

**分支**：直接改 `main` 或随其它 PR 一起（**这是唯一允许直接推 main 的任务**）
**拥有文件**：`docs/test-log.md`
**依赖**：全部

### 要完成的细节

1. **测试矩阵**：每个浏览器 / 设备组合各跑一次完整流程，把结果写进 `docs/test-log.md`。

| 平台 | 浏览器 | 要测的点 |
| --- | --- | --- |
| Windows | Edge（首选） | 完整流程、空间音频、语音识别 |
| Windows | Chrome | 同上 |
| Android | Chrome | 移动端布局、麦克风权限、语音识别 |
| iOS | Safari | 能否打开、音频能否解锁（**语音识别预期不稳定，如实记录即可**） |

2. **每条记录必须包含五要素**：日期 / 设备与浏览器 / 测什么 / 结果（**带数字**）/ 据此改了什么。
   **只写"测了，还行"的记录没有价值**——评审看的是"发现 → 修改"这条链。

3. **专项测试**（这三项是游园会的成败关键）：

| 专项 | 怎么测 | 通过标准 |
| --- | --- | --- |
| **断网** | DevTools → Offline，跑完整局 | 全程可用，无报错 |
| **拔麦** | 不插麦克风 / 拒绝权限 | 自动降级到按钮，不崩 |
| **噪音** | 戴着耳机在嘈杂环境（食堂、户外）说指令 | 记录识别成功率；失败时降级是否顺畅 |

4. **每次发现 bug**：要么当场修（自己修就自己提交），要么写成一条待办并指派给人。**不要只在群里口头说。**

### 验收标准

- [ ] 测试矩阵里每个组合都有一条记录
- [ ] 三个专项（断网 / 拔麦 / 噪音）都有记录
- [ ] 每条记录都写明了"据此改了什么"（没有问题的写"未发现问题"）
- [ ] 至少有一条记录是"发现问题 → 修改 → 复测通过"的完整闭环

### 提交方式

```bash
git add docs/test-log.md
git commit -m "test: 补充真机测试矩阵与断网/拔麦/噪音专项记录"
git push
```

---

## T9 · 交付材料与现场准备

**分支**：`feat/t9-materials`
**拥有文件**：`materials/`、`docs/作品说明.md`、`docs/ai-usage.md`、`docs/venue-setup.md`
**不拥有**：`docs/test-log.md`（属 T8）、`docs/references.md`、`docs/tasks.md`
**依赖**：全部

### 要完成的细节

1. **作品说明**：目标、实际完成范围、关键自主设计、验证情况、主要局限。

2. **AI 使用说明**（按手册的六段结构）：使用的工具 / 参与的环节 / 关键判断与人工修改 / 成员分工 / 赛前已有基础 / 导师与外部帮助。
   **这份材料最有价值的一页是"为什么不用大模型做意图理解"**——理由已经在 `README.md` 和 `docs/references.md` 里，整理进去即可。

3. **原创承诺书**：按赛事模板签署后扫描入库。

4. **演示视频**（3 分钟）：必须包含**完整的语音交互过程**，不能只有画面。
   **关键**：视频要拍到"说'帮我读一下前方告示牌' → AI 朗读"这一整段。

5. **展板**（80×180 cm）：只写两句话——一句痛点、一句做法。设计图**提前 4 天**提交。

6. **现场清单**：

| 项 | 数量 | 备注 |
| --- | --- | --- |
| 封闭式耳罩耳机 | 2 | 草坪嘈杂，入耳式压不住环境音 |
| 备用手机 | 1 | 主设备故障时顶上 |
| 笔记本 | 1 | 现场用 `localhost` 起服务，不赌 wifi |
| 充电宝 | 1 | — |
| **离线包** | 1 | 整个仓库打包到 U 盘，含 `assets/voice/` |

7. **现场运行方式**（写进 `docs/venue-setup.md`）：

```bash
# 现场用笔记本起服务，不依赖网络
python -m http.server 8000
# 浏览器访问 http://localhost:8000
```

`localhost` 是安全上下文，麦克风可用；**这正是选择"零依赖 + 无构建"的原因**——现场没有任何东西可以失败。

### 验收标准

- [ ] 作品说明、AI 使用说明、原创承诺书齐全
- [ ] 视频 3 分钟内，含完整语音交互
- [ ] 展板按要求尺寸与提前量提交
- [ ] 现场清单逐项确认到位
- [ ] `docs/venue-setup.md` 写清断网时的启动步骤

### 提交方式

```bash
git switch -c feat/t9-materials
git add docs materials
git commit -m "docs: 作品说明与 AI 使用说明"
git commit -m "docs: 现场运行方式与设备清单"
git push -u origin feat/t9-materials
```

PR：`https://github.com/lvcheng1030/AI-TY/compare/main...feat/t9-materials?expand=1`

---

## 四、完全新手：命令对照

| 我想做什么 | 命令 |
| --- | --- |
| 看当前状态 | `git status` |
| 看改了什么 | `git diff` |
| 拉取别人的最新代码 | `git pull` |
| 新建并切换到我的分支 | `git switch -c feat/t1-audio-engine` |
| 切回主分支 | `git switch main` |
| 把改动标记为待提交 | `git add 文件名`（或 `git add .` 全部） |
| 提交 | `git commit -m "feat: 说明"` |
| 上传我的分支 | `git push -u origin 分支名` |
| 看提交历史 | `git log --oneline` |
| 撤销**未提交**的改动 | `git restore 文件名` |
| 撤销**已 add 未提交** | `git restore --staged 文件名` |

**如果 `git push` 被拒绝**（通常是远程有你没有的提交）：

```bash
git pull --rebase origin main
# 若有冲突：打开冲突文件，找 <<<<<<< 标记，改成你要的样子，然后
git add 冲突文件
git rebase --continue
git push
```

**冲突不要自己乱试。** 卡住了就在群里说，把 `git status` 的输出贴出来。

---

## 五、整合顺序（关键路径）

```
T0（骨架与契约，必须先合）
   │
   ├── T1 音频 ──┐
   ├── T2 移动 ──┤
   ├── T3 内容 ──┼──→ T7 任务与结算 ──→ T8 真机测试 ──→ T9 交付材料
   ├── T4 语音 ──┤
   ├── T5 台词 ──┤
   └── T6 外壳 ──┘
```

**合并顺序建议**：T0 → T2 → T1 → T3 → T4 → T5 → T6 → T7。
先把「能走」和「能听」合进去，这样任何人都能立刻跑起来看到效果，后续每个人都能自测。

**每次合并后**：所有人都要 `git switch main && git pull`，然后在自己的分支上 `git rebase main`，避免越积越难合。

---

## 六、沟通约定

1. **每天一条进度**：昨天做了什么 / 今天做什么 / 卡在哪。写在群里，一行就行。
2. **卡住超过 1 小时**就在群里说，不要自己硬扛一天。
3. **接口要改**必须先说。`src/core/contracts.js` 和 `content/schema.md` 的字段一旦改动，**改的人负责通知所有人**，因为这会打断其他三个人的代码。
4. **不要直接推 `main`**（除 T8 的测试记录）。一律走分支 + PR。
5. **提交信息写清"做了什么"**，不要写"更新""修改""fix bug"。评审会看 `git log`。

