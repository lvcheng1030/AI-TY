# 场景数据格式（冻结）

> **本文件定义的字段已被冻结。** T3 按此填写 `content/scene1.json`，T2 按此解析。
> 需要改字段时，先在工作群说明，见 `docs/CONVENTIONS.md` 第五节。
>
> 与代码的对应关系：本文件的定义与 `src/core/contracts.js` 里的 JSDoc 类型**必须一致**。
> 若发现不一致，以 `contracts.js` 为准并立即修正本文件。

---

## 坐标约定（全项目统一）

| 项 | 约定 |
| --- | --- |
| `x` | 向东为正，单位米 |
| `z` | 向南为正，单位米 |
| `heading` | 朝向角度，单位度。**0 = 正北（-z 方向）**，顺时针增大 |
| 原点 | 场景起点，由 `start` 指定 |

地面是平面，所以没有 `y`——用 `z` 表示纵深，避免与屏幕坐标的 `y` 混淆。

---

## 顶层结构

```json
{
  "id": "dorm_to_teach",
  "title": "宿舍 → 教学楼",
  "duration": [45, 60],
  "start": { "x": 0, "z": 0, "heading": 90 },
  "tiles": [],
  "obstacles": [],
  "emitters": [],
  "signs": [],
  "tasks": []
}
```

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | ✅ | 场景标识，英文，用下划线 |
| `title` | string | ✅ | 显示名与结算页用 |
| `duration` | [number, number] | ✅ | 预期时长的区间（秒）。T8 用它判断节奏是否失控 |
| `start` | object | ✅ | 起点位置与初始朝向 |
| `tiles` | Tile[] | ✅ | 地面区域，决定脚步声与盲道判定 |
| `obstacles` | Obstacle[] | ✅ | 障碍物，可省略为 `[]` |
| `emitters` | Emitter[] | ✅ | 环境声源，可省略为 `[]` |
| `signs` | Sign[] | ✅ | 可读告示牌，可省略为 `[]` |
| `tasks` | Task[] | ✅ | 任务，至少 1 个 |

> ⚠️ **`start.heading` 是最容易填错、后果最严重的字段。**
>
> 语义是 `0 = 正北（-z 方向）`，顺时针为正。所以：
>
> | 路线主要延伸方向 | `heading` 应填 |
> | --- | --- |
> | +z（南） | **180** |
> | -z（北） | **0** |
> | +x（东） | **90** |
> | -x（西） | **270** |
>
> **填错的后果是一开局就朝反方向走**，而玩家在纯音频环境里很难立刻察觉"我在倒退"。
>
> 验证方法：起服务器后按住 `W` 走 5 秒，确认仍在盲道上（`surface` 保持 `tactile`）。
> 这个坑在 `docs/test-log.md` 的 T-003 里真实发生过一次。

---

## tiles —— 地面区域

盲道用**折线 + 宽度**描述（它是一条带子），其它路面用矩形。

```json
"tiles": [
  { "type": "tactile",  "points": [[0,0],[0,20],[2,20],[2,40]], "width": 1.2 },
  { "type": "concrete", "rect": [-8, 0, 16, 45] },
  { "type": "grass",    "rect": [8, 20, 6, 10] }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | string | `tactile`（盲道）/ `concrete`（水泥砖）/ `grass`（草地土） |
| `points` | [x,z][] | 折线顶点。**盲道必须用这个**，判定偏离要用它 |
| `rect` | [x,z,w,h] | 矩形，`x`/`z` 为左上角（最小坐标），`w`/`h` 为宽高 |
| `width` | number | 带状宽度（米）。仅 `points` 时有意义，盲道建议 1.2 |

**判定优先级**：`tactile` 优先于其它。玩家站在盲道带内即算处于盲道，即使该处也被 `concrete` 的矩形覆盖。

---

## obstacles —— 障碍物

```json
"obstacles": [
  { "id": "bikes", "rect": [-1.5, 14, 2.0, 1.0], "sfx": "blocked" }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识，会出现在 `player:blocked` 与 `cane:probe` 事件里，也用于任务判定 |
| `rect` | [x,z,w,h] | 矩形范围 |
| `sfx` | string | 可选。碰撞音效名（不含扩展名），由 T1 解析 |

> **设计提醒**：场景 1 的核心任务是"绕过占道的自行车再回到盲道"。所以这个障碍物要
> 摆在盲道正上方，逼玩家离开盲道绕行——**离得太开就体验不到"失去盲道"的焦虑**。

---

## emitters —— 环境声源

```json
"emitters": [
  { "id": "traffic", "pos": [6, 30], "audio": "traffic_low", "loop": true, "gain": 0.6 }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识 |
| `pos` | [x,z] | 世界坐标位置 |
| `audio` | string | 音效名（不含扩展名），T1 在 `assets/amb/` 下找对应文件 |
| `loop` | boolean | 可选，默认 false |
| `gain` | number | 可选，0~1，默认由 T1 决定 |

> ⚠️ **不要设计需要玩家分辨"正后方"的声源。** 实测人耳分不出前后
> （见 `docs/test-log.md` T-001）。车流放在**右侧**（`x` 为正）是场景 1 的关键设计——
> 玩家靠车流方位判断自己有没有走偏。

---

## signs —— 告示牌

```json
"signs": [
  { "id": "sign1", "pos": [0, 8], "facing": 180, "line": "L_SIGN_01" }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识 |
| `pos` | [x,z] | 位置 |
| `facing` | number | 可选。牌面朝向（度） |
| `line` | string | **必填**。台词 id，对应 `content/lines.csv` 的 `id`。T5 用它找预渲染的 mp3 |

> `line` 指向的台词必须在 `lines.csv` 里存在，否则玩家说"读一下牌子"会没有声音。
> **提交前请交叉核对一遍。**

---

## tasks —— 任务

三种类型：

```json
"tasks": [
  { "id": "go_dorm",   "type": "reach", "target": [0, 38], "radius": 3, "line": "L_TASK_DONE" },
  { "id": "read_sign", "type": "read",  "signId": "sign1",  "line": "L_TASK_SIGN" },
  { "id": "back_path", "type": "avoid", "obstacleId": "bikes", "line": "L_TASK_AVOID" }
]
```

| 类型 | 含义 | 必填字段 |
| --- | --- | --- |
| `reach` | 到达目标点半径内 | `target`、`radius` |
| `read` | 读了指定告示牌 | `signId` |
| `avoid` | 绕过障碍后**重新回到盲道** | `obstacleId` |

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 唯一标识 |
| `obstacleId` | string | `avoid` 必填。要绕过的障碍物 id，须与 `obstacles[].id` 一致 |
| `line` | string | 可选。完成时播报的台词 id |

> `avoid` 是场景 1 最有价值的任务：它逼玩家先失去盲道、再找回来。
> 这是"共情不说教"的落点，**不要省略**。

> **修正记录（2026-11-22）**：`contracts.js` 的 `Task` typedef 原先漏了 `obstacleId`，
> 与本文档不一致。由 T3 在填场景数据时发现并报告，已在 `contracts.js` 中补上。
> 这是**补充**而非修改——原有字段名与含义均未变动。

---

## 完整示例

见仓库中的 `content/scene1.json`（由 T3 填写）。

## 校验方法

改完 JSON 后：

1. 用任意 JSON 校验器确认语法合法（尾随逗号是最常见的错误）
2. 起本地服务器打开 `http://localhost:8000`，看控制台有没有 `scene:loaded` 事件
3. 检查所有 `line` 字段在 `content/lines.csv` 里都存在
