/**
 * ============================================================
 *  冻结的接口契约
 * ============================================================
 *
 * 【本文件及其字段已被冻结。】
 *
 * T1~T7 是并行开发的。所有人只依赖这里定义的「事件名 + 数据结构」，
 * 不直接调用彼此的模块。因此在 T0 合并之后：
 *
 *   - 可以新增事件，但【不得】修改或删除已有的字段名与含义
 *   - 确实需要改，必须先在工作群说明，由改的人负责通知所有人并同步各分支
 *
 * 为什么这么严：T2 把 player:moved 的 z 改名成 y，T1 的空间音频就全错位；
 * 而这种错误在浏览器里只表现为"声音位置不对"，极难定位。
 */

/* ------------------------------------------------------------
 * 一、事件名
 * ---------------------------------------------------------- */

export const EVENTS = Object.freeze({
  /** 场景加载完成 @type {SceneLoaded} */
  SCENE_LOADED: 'scene:loaded',

  /** 玩家位置/朝向变化，每帧可能触发 @type {PlayerMoved} */
  PLAYER_MOVED: 'player:moved',

  /** 撞到障碍物 @type {PlayerBlocked} */
  PLAYER_BLOCKED: 'player:blocked',

  /** 路面材质变化（只在变化时触发，不是每帧） @type {SurfaceChanged} */
  SURFACE_CHANGED: 'surface:changed',

  /**
   * 敲杖【请求】。由 T2 的玩家模块发出（空格键或语音"看看前面"），
   * T1 的音频引擎响应它、做探测并发出 CANE_PROBE。
   * 拆成请求与结果两个事件，是为了让移动逻辑不必知道音频实现。
   * @type {CaneRequest}
   */
  CANE_REQUEST: 'cane:request',

  /** 敲杖探测【结果】 @type {CaneProbe} */
  CANE_PROBE: 'cane:probe',

  /** 附近出现可读告示牌（进入范围时触发一次） @type {SignNearby} */
  SIGN_NEARBY: 'sign:nearby',

  /** 离开告示牌范围 @type {{signId:string}} */
  SIGN_LEFT: 'sign:left',

  /** 语音识别解析出的意图 @type {Intent} */
  INTENT: 'intent',

  /** 请求播放某句台词 @type {Speak} */
  SPEAK: 'speak',

  /** 台词开始播放 @type {{lineId:string, priority:number}} */
  SPEAK_STARTED: 'speak:started',

  /** 台词播放结束 @type {{lineId:string}} */
  SPEAK_ENDED: 'speak:ended',

  /** 语音识别进入降级模式 @type {Degrade} */
  DEGRADE_ON: 'degrade:on',

  /** 语音识别恢复正常 @type {Degrade} */
  DEGRADE_OFF: 'degrade:off',

  /** 玩家用按钮/打字输入了指令（降级通道） @type {Intent} */
  MANUAL_COMMAND: 'manual:command',

  /** 某个任务完成 @type {TaskDone} */
  TASK_DONE: 'task:done',

  /** 单局结束 @type {SessionEnd} */
  SESSION_END: 'session:end',

  /** 单局开始 @type {{sceneId:string}} */
  SESSION_START: 'session:start',

  /** AI 助手的主动提醒（非玩家请求） @type {Assist} */
  ASSIST: 'assist'
});

/* ------------------------------------------------------------
 * 二、意图（12 条，锁定）
 * ---------------------------------------------------------- */

/**
 * 指令集。增删必须全队同意：
 * 每多一条，T4 的同义词表、测试用例、T6 的按钮面板都要同步改。
 */
export const INTENTS = Object.freeze({
  MOVE_FORWARD: 'move_forward',
  MOVE_LEFT: 'move_left',
  MOVE_RIGHT: 'move_right',
  TURN_LEFT: 'turn_left',
  TURN_RIGHT: 'turn_right',
  STOP: 'stop',
  READ_SIGN: 'read_sign',
  REPEAT: 'repeat',
  WHERE_AM_I: 'where_am_i',
  LOOK_AHEAD: 'look_ahead',
  FASTER: 'faster',
  SLOWER: 'slower'
});

/** 意图的中文显示名，给 UI 和结算页用 */
export const INTENT_LABELS = Object.freeze({
  move_forward: '向前走',
  move_left: '向左走',
  move_right: '向右走',
  turn_left: '左转',
  turn_right: '右转',
  stop: '停下',
  read_sign: '读告示牌',
  repeat: '再说一遍',
  where_am_i: '我在哪',
  look_ahead: '看看前面',
  faster: '走快点',
  slower: '走慢点'
});

/* ------------------------------------------------------------
 * 三、三态置信阈值
 * ---------------------------------------------------------- */

/**
 * T4 必须严格按这三个区间行事，T6 的提示文案也依赖它。
 * 这是本作品「AI 自主判断」的落点：不确定时明确说不知道，
 * 而不是硬猜一个动作执行。
 */
export const CONFIDENCE = Object.freeze({
  /** >= 此值：直接执行 */
  EXECUTE: 0.85,
  /** >= 此值且 < EXECUTE：回述确认（"你是说，向左走吗？"） */
  CONFIRM: 0.55,
  /** < CONFIRM：拒答 + 复述可用指令 */
  REJECT: 0.55
});

/** 连续拒答达到此次数 → 发 DEGRADE_ON */
export const CONSECUTIVE_REJECT_LIMIT = 2;

/* ------------------------------------------------------------
 * 四、路面材质
 * ---------------------------------------------------------- */

/** 三种材质，T1 需要为每种准备不同音色 */
export const SURFACES = Object.freeze({
  TACTILE: 'tactile',     // 盲道
  CONCRETE: 'concrete',   // 水泥/砖
  GRASS: 'grass'          // 草地/土
});

/* ------------------------------------------------------------
 * 五、数据结构（JSDoc 类型）
 * ---------------------------------------------------------- */

/**
 * @typedef {Object} SceneLoaded
 * @property {string} sceneId
 * @property {string} title
 */

/**
 * @typedef {Object} PlayerMoved
 * @property {number} x        世界坐标 x（米）
 * @property {number} z        世界坐标 z（米）
 * @property {number} heading  朝向角度（度，0=正北，顺时针）
 * @property {string} surface  当前路面，取自 SURFACES
 */

/**
 * @typedef {Object} PlayerBlocked
 * @property {string} obstacleId
 * @property {number} x  被阻挡后的实际位置
 * @property {number} z
 */

/**
 * @typedef {Object} SurfaceChanged
 * @property {string} type      新路面，取自 SURFACES
 * @property {string} previous  旧路面
 */

/**
 * @typedef {Object} CaneRequest
 * @property {number} x        敲杖时的玩家位置
 * @property {number} z
 * @property {number} heading  朝向，T1 用它决定前向锥形的方向
 * @property {string} [source] 'keyboard' | 'voice'
 */

/**
 * @typedef {Object} CaneProbe
 * @property {boolean} hit       前方锥形内是否探测到东西
 * @property {number} distance   距离（米）。未命中时为 Infinity
 * @property {string|null} surface 命中处的地面材质
 * @property {string|null} obstacleId 命中的障碍物 id
 * @property {string} [bearing]  粗略方位：'left' | 'ahead' | 'right'
 *                               （只给左右与正前，不含正后——见 docs/test-log.md T-001）
 * @property {string} [band]     粗略距离档位，取值见 CANE_BANDS。
 *                               声音层面用连续延迟，但【对外播报】只用档位：
 *                               T-002 只验证了 2 米 vs 8 米，未验证 1 米级细分辨，
 *                               因此不得宣称"能听出精确距离"。
 */

/**
 * 敲杖距离档位。
 *
 * 为什么分档而不是报精确米数：见 docs/test-log.md 的 T-002「限制一」。
 * 测试证明的是"能分辨远近"，不是"能分辨 3 米与 4 米"。
 * 说档位是诚实的，说"3.7 米"是过度承诺。
 */
export const CANE_BANDS = Object.freeze({
  NEAR: 'near',   // < 3 米
  MID: 'mid',     // 3 ~ 5 米
  FAR: 'far'      // > 5 米
});

/** 档位的中文说法，供 AI 助手播报用 */
export const CANE_BAND_LABELS = Object.freeze({
  near: '很近',
  mid: '有一段距离',
  far: '比较远'
});

/**
 * 把距离（米）换算成档位。
 * @param {number} distance
 * @returns {string|null}
 */
export function distanceToBand(distance) {
  if (!Number.isFinite(distance)) return null;
  if (distance < 3) return CANE_BANDS.NEAR;
  if (distance <= 5) return CANE_BANDS.MID;
  return CANE_BANDS.FAR;
}

/**
 * @typedef {Object} SignNearby
 * @property {string} signId
 * @property {string} line  朗读用的台词 id（对应 content/lines.csv）
 */

/**
 * @typedef {Object} Intent
 * @property {string} name         意图名，取自 INTENTS
 * @property {number} confidence   0~1
 * @property {string} utterance    原始文本（识别结果或玩家打的字）
 * @property {string} source       'voice' | 'button' | 'text'
 * @property {string} [matched]    命中的同义词（调试用）
 */

/**
 * @typedef {Object} Speak
 * @property {string} lineId      台词 id（对应 content/lines.csv）
 * @property {number} [priority]  0=旁白 1=提示 2=紧急。高优先级可打断低优先级
 */

/**
 * @typedef {Object} Degrade
 * @property {string} reason  'unsupported' | 'denied' | 'network' | 'timeout' | 'repeated_reject'
 */

/**
 * @typedef {Object} TaskDone
 * @property {string} taskId
 * @property {number} elapsed  完成时的单局用时（秒）
 */

/**
 * @typedef {Object} SessionEnd
 * @property {number} elapsed        总用时（秒）
 * @property {number} tasksDone
 * @property {number} tasksTotal
 * @property {number} caneProbes     敲杖次数
 * @property {number} hints          被提示次数
 * @property {number} asrFailures    语音识别失败次数
 * @property {boolean} completed     是否走到终点
 */

/**
 * @typedef {Object} Assist
 * @property {string} lineId   要播报的台词 id
 * @property {string} reason   'obstacle' | 'deviation' | 'task' | 'system'
 */

/* ------------------------------------------------------------
 * 六、场景数据格式（详见 content/schema.md）
 * ---------------------------------------------------------- */

/**
 * @typedef {Object} SceneJson
 * @property {string} id
 * @property {string} title
 * @property {[number, number]} duration   预期时长区间（秒）
 * @property {{x:number, z:number, heading:number}} start
 * @property {Tile[]} tiles
 * @property {Obstacle[]} obstacles
 * @property {Emitter[]} emitters
 * @property {Sign[]} signs
 * @property {Task[]} tasks
 */

/**
 * @typedef {Object} Tile
 * @property {string} type                取自 SURFACES
 * @property {[number,number][]} [points] 折线（用于盲道等带状区域）
 * @property {[number,number,number,number]} [rect] 矩形 [x, z, w, h]
 * @property {number} [width]             带状区域宽度（米），仅 points 时有效
 */

/**
 * @typedef {Object} Obstacle
 * @property {string} id
 * @property {[number,number,number,number]} rect
 * @property {string} [sfx]   碰撞音效名（T1 解析）
 */

/**
 * @typedef {Object} Emitter
 * @property {string} id
 * @property {[number,number]} pos
 * @property {string} audio   音效名（T1 解析，不含扩展名）
 * @property {boolean} [loop]
 * @property {number} [gain]
 */

/**
 * @typedef {Object} Sign
 * @property {string} id
 * @property {[number,number]} pos
 * @property {number} [facing]  牌面朝向（度），可省略
 * @property {string} line      台词 id
 */

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {'reach'|'read'|'avoid'} type
 * @property {[number,number]} [target]   reach 用
 * @property {number} [radius]            reach 用
 * @property {string} [signId]            read 用
 * @property {string} [obstacleId]        avoid 用：要绕过的障碍物 id
 * @property {string} [line]              完成时播报的台词 id
 *
 * 关于 obstacleId（T0 补记）：
 *   原 typedef 漏了这个字段，而 content/schema.md 早已把它列为 avoid 的必填项。
 *   由 T3 在实现场景数据时发现并报告（见 content/credits.md 第四节）。
 *   这是【补充】而非修改 —— 不违反契约冻结：原有字段名与含义都没动。
 */

export default {
  EVENTS, INTENTS, INTENT_LABELS, CONFIDENCE,
  CONSECUTIVE_REJECT_LIMIT, SURFACES
};
