// 所有可调参数集中在此，物理与计分模块只读取常量，不自行派生魔法数字。
export const CONFIG = {
  table: {
    length: 2.74,
    width: 1.525,
    height: 0.76,
    thickness: 0.05,
    netHeight: 0.1525,
  },
  ball: {
    radius: 0.02,
    gravity: -6.5,
    restitution: 0.8,
    maxSpeed: 9.5,
    serveY: 0.95,
    serveZ: 1.45,
    serveVy: 1.75,
    serveVz: 3.35,
    returnVy: 1.75,
    returnVzBase: 3.3,
    returnVzRange: 0.3,
    returnVxInherit: 0.3,
    returnVxPaddle: 0.2,
    returnVxRandom: 0.6,
    returnVxClamp: 1.4,
    returnVyPaddle: 0.08,
    returnVyPaddleClamp: 0.25,
    returnVyRandom: 0.1,
  },
  paddle: {
    playerZ: 1.5,
    aiZ: -1.5,
    // bladeRadius 与 models.js 的可见拍面同源；hitRadius + ball.radius 为接触半径。
    // 迭代 7 可玩性校准：0.13 → 接触半径 0.15，面积约为视觉接触区 0.108 的 1.93 倍
    // （迭代 5 椭圆为 3.58 倍，迭代 6 的 0.10 为 1.23 倍但两侧漏球严重）。
    // contactDepth 保持 0.035，回球仍严格从拍平面出发。
    bladeRadius: 0.088,
    hitRadius: 0.13,
    contactDepth: 0.035,
    minX: -0.85,
    maxX: 0.85,
    minY: 0.8,
    maxY: 1.35,
    playerSpeed: 3.2,
  },
  // 三档由「玩法说明」面板选择，默认 standard；档位不持久化。
  // standard 的两项误差在迭代 6 拍面判定收紧后按最小幅度下调（0.16/0.10 → 0.10/0.08），
  // 使 200 次我方发球的 AI 首接率回到 ≥75% 且 <100%；三档 speed 与误差仍严格单调。
  aiProfiles: {
    practice: { speed: 1.3, errorFast: 0.22, errorSlow: 0.14, ySpeedFactor: 0.5 },
    standard: { speed: 1.8, errorFast: 0.10, errorSlow: 0.08, ySpeedFactor: 0.6 },
    sharp: { speed: 2.3, errorFast: 0.09, errorSlow: 0.06, ySpeedFactor: 0.72 },
  },
  // 触屏输入：追拍半径（米）与点按上旋的固定强度。
  pointer: {
    followRadius: 0.12,
    followRadiusY: 0.1,
    tapCharge: 0.65,
  },
  // 迭代 15 动作模式：专用追球步速（高于手动 3.2，给快球与高度跟踪留余量）。
  // 全部是新键；手动模式仍读 paddle.playerSpeed，既有数值一律不动。
  autoPaddle: {
    speed: 6.0,
    followRadius: 0.12,
    followRadiusY: 0.10,
    neutralX: 0,
    neutralY: 0.98,
  },
  // 归一化旋转：正上旋、负下旋。只影响竖直加速度与落台后的水平速度。
  spin: {
    // 三项经「过网 + 首落点在对方半台」验收断言校准：0.55/0.55/0.02 让满蓄力
    // drive 在真实击球高度带 [0.9, 1.1] 稳定过网，且与 push 弧线差异明显。
    magnusY: 0.55,
    bounceZ: 0.18,
    decay: 0.35,
    pushSpin: -0.6,
    driveVzGain: 0.55,
    driveVyDrop: 0.02,
    pushVzScale: 0.78,
    pushVyLift: 0.14,
    // 迭代 15 反手推挡：无旋、沿既有横向速度方向叠加偏置（与 returnVxClamp 同源）。
    blockVxBias: 0.4,
    blockVxClamp: 1.4,
    blockVyLift: 0.04,
  },
  rules: {
    winScore: 11,
    winBy: 2,
    serveDelay: 3,
    outMarginX: 0.1,
    outMarginZ: 0.45,
    minBallY: 0.3,
    chargeTime: 0.8,
    // 得分后定格时长（秒）：球与球拍保持结束姿态，之后再回置并开始 3 秒倒数。
    pointPause: 1.5,
  },
  // 赛场氛围：灯光只在死球时间变，playing 期间目标向量恒定，避免动态亮度伤读球。
  // 配色键统一带 Color 后缀，避免与 light.*.cone / pool 的数值字段混淆。
  arena: {
    damping: 0.18,
    pulseDecay: 0.12,
    pulseKey: 1.4,
    pulseLed: 0.5,
    // 迭代 14：环境色抬到中明度中性浅灰蓝，与深青绿球台错开；ledColor 与 light 向量刻意不动。
    barrierColor: 0x3f4c58,
    audienceColor: 0x505c68,
    ledColor: 0x7ee2c0,
    beamColor: 0xdfe9f2,
    poolColor: 0x525e6a,
    tints: {
      default: 0x7ee2c0,
      match: 0xffd479,
      win: 0x7ee2c0,
      lose: 0x8f9aa8,
    },
    light: {
      READY: { ambient: 0.10, key: 1.2, fill: 0.06, led: 0.15, cone: 0.03, pool: 0.08 },
      PLAYING: { ambient: 0.16, key: 3.4, fill: 0.12, led: 0.35, cone: 0.06, pool: 0.22 },
      GAMEOVER: { ambient: 0.10, key: 2.0, fill: 0.08, led: 0.28, cone: 0.05, pool: 0.14 },
    },
  },
  fixedDt: 1 / 120,
  maxSubsteps: 8,
}

export const INTENT_NONE = Object.freeze({ type: 'none', charge: 0 })

export const COLORS = {
  // 迭代 14：背景 / 地面抬到 sRGB 均值 82 / 74 的中性浅灰蓝，与深青绿球台错开；
  // 球 / 背景仍有 ≥7:1 对比，且背景相对亮度 ≤0.09，避免吃掉白球。
  background: 0x45525f,
  floor: 0x3e4a56,
  table: 0x1c6b5a,
  tableEdge: 0x14202a,
  line: 0xf5f3ee,
  net: 0xd8dde2,
  ball: 0xf5f3ee,
  playerBlade: 0x2f9d80,
  playerRim: 0x7ee2c0,
  aiBlade: 0xaab3bd,
  aiRim: 0xe2e8ee,
  trail: 0x7ee2c0,
  particle: 0x7ee2c0,
}

export const FOUL_REASONS = {
  NET: '球下网了',
  OWN_HALF: '球落在自己半台',
  DOUBLE_BOUNCE: '球二次落地',
  OUT: '球出界了',
  MISS: '没接到球',
}
