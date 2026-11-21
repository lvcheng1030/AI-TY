# 开发约定

> 目的：让 T1~T7 七条线并行开发后能合并到一起，而不是互相踩脚。
> 这些约定不是形式要求，每一条都对应一个具体的失败场景。

---

## 一、五条硬约束

| # | 约束 | 不遵守会怎样 |
| --- | --- | --- |
| 1 | **零运行时依赖**：不引入 npm 包，不用 CDN | 游园会现场网络不可靠，加载失败就是作品打不开 |
| 2 | **无构建步骤**：纯 ES 模块，浏览器直接跑 | 引入构建后现场多一个失败点，新人也要先配环境 |
| 3 | **只改自己任务卡里列出的文件** | 两人同改一个文件 → 合并冲突 → 阻塞两条线 |
| 4 | **不改 `src/core/` 与 `content/schema.md`** | 这是冻结契约，改一次会同时打断所有人 |
| 5 | **不做需要分辨"正后方"的设计** | 实测人耳分不出前后（`docs/test-log.md` T-001） |

## 二、文件归属表

**只改属于你的文件。** 需要别人改，就在群里提，不要自己动手。

| 归属 | 文件 |
| --- | --- |
| T0（已完成，冻结） | `index.html`、`src/main.js`、`src/core/*`、`content/schema.md`、`docs/CONVENTIONS.md` |
| T1 | `src/audio/engine.js`、`src/audio/materials.js`、`tests/audio.test.html` |
| T2 | `src/world/player.js`、`src/world/collision.js`、`src/world/scene.js`、`tests/world.test.html` |
| T3 | `content/scene1.json`、`content/credits.md` |
| T4 | `src/speech/asr.js`、`src/nlu/intents.js`、`content/intents.cases.json` |
| T5 | `tools/tts_build.py`、`src/speech/voice.js`、`content/lines.csv`、`assets/voice/*` |
| T6 | `src/ui/screens.js`、`src/ui/a11y.js` |
| T7 | `src/game/tasks.js`、`src/game/session.js` |
| T8 | `docs/test-log.md` |
| T9 | `materials/`、`docs/作品说明.md`、`docs/ai-usage.md`、`docs/venue-setup.md` |

**为什么 `index.html` 只由 T0 拥有**：它一次性 import 了全部模块。若每人都去改它加自己的脚本标签，第一周就会冲突到无法合并。

## 三、分支与提交

### 分支命名

```
feat/t<编号>-<简短英文名>      例：feat/t1-audio-engine
chore/t0-scaffold              骨架类
docs/xxx                       纯文档
```

### 提交信息

```
<类型>: <一句话说明>
```

类型只允许：`feat` / `fix` / `docs` / `test` / `chore` / `spike`

好的例子：
```
feat(audio): 完成 HRTF 声源池与听者朝向更新
fix(nlu): 修正"往左边"被误判为向右
docs: 补场景 1 的台词与素材来源
```

**不要写**：`更新`、`修改`、`fix bug`、`.`。
评审会看 `git log` 判断开发过程是否真实，无意义的提交信息等于浪费证据。

### 提交粒度

**小步多次。** 一天攒一个巨型提交既难排查、也看不出开发过程。建议每完成一个可验证的小功能就提交一次。

## 四、绝对不要提交

- `.env`、任何密钥、token
- `node_modules/`
- 超过 5MB 的单个音频文件
- 系统生成的临时文件（`.DS_Store`、`Thumbs.db`、`Desktop.ini`）

提交前跑一次 `git status` 确认。

> 把密钥推到公开仓库等于当场泄露，而且**历史里删不干净**——即使后续提交删除，旧提交里仍然查得到。

## 五、接口改动的流程

`src/core/contracts.js` 定义的事件名与数据结构是**冻结**的：

- ✅ 可以**新增**事件（在文件末尾追加，并写清 JSDoc 类型）
- ❌ 不得**改名或删除**已有字段

确实需要改时：

1. 先在群里说明理由与影响范围
2. 由改的人负责通知所有人，并在同一轮同步各分支
3. 在提交信息里写明 `BREAKING:` 前缀

**为什么这么严**：T2 把 `player:moved` 的 `z` 改名成 `y`，T1 的空间音频就整体错位。
而这种错误在浏览器里只表现为"声音位置不太对"，极难定位到根因。

## 六、代码风格

不引入 lint 工具（那需要构建步骤）。人工遵守即可：

- 2 空格缩进，单引号，语句结尾带分号
- 变量与函数用 `camelCase`，模块文件用 `kebab-case`
- **注释写"为什么"，不写"做了什么"**——代码本身说明了做什么
- 每个模块文件顶部写清：负责人（T几）、职责边界、硬性要求
- 中文注释与中文标识符都可以用，本项目面向中文团队

### 纯逻辑与副作用分离

几何、判定、解析这类逻辑**必须与 DOM / 音频解耦**，导出可单独调用的函数：

```js
// ✅ 好：纯函数，能脱离浏览器测试
export function pathDeviation(pos, path) { /* ... */ }

// ❌ 差：内部直接读 DOM，无法测试
export function updateDeviation() { document.getElementById('x').textContent = ...; }
```

原因：`loop.tick(dt)` 支持手动步进（见 `src/core/loop.js`），只要逻辑是纯的，
就能在 Node 里跑断言，不必等真实秒表。这是本项目唯一可行的自动化测试路径。

## 七、本地开发流程

```bash
git switch main
git pull                          # 先同步
git switch -c feat/t1-audio-engine
# ...写代码...
git add src/audio tests
git commit -m "feat(audio): HRTF 声源池"
git push -u origin feat/t1-audio-engine
```

然后在 GitHub 开 PR 请求合并。**除 T8 的测试记录外，不要直接推 `main`。**

### 推送被拒（rejected）

通常是远程有你没有的提交：

```bash
git pull --rebase origin main
# 若提示冲突：编辑冲突文件，删掉 <<<<<<< ======= >>>>>>> 这些标记行，然后
git add 冲突文件
git rebase --continue
git push
```

**冲突不要自己硬试。** 把 `git status` 的输出贴到群里一起看。

## 八、每日同步

每天在群里发一条：**昨天做了什么 / 今天做什么 / 卡在哪**。一行即可。

卡住超过 1 小时就说，不要自己扛一天——这是最浪费时间的做法。
