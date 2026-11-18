// 玩法模式归一化与每帧控制量装配，纯逻辑：不 import three、不访问 DOM、不改入参。
import { CONFIG } from './config.js'
import { autoAxes } from './autoPaddle.js'

export const PLAY_MODES = Object.freeze([
  Object.freeze({
    key: 'manual', label: '手动移动',
    detail: '用 WASD / 方向键或拖动自己移动球拍接球',
  }),
  Object.freeze({
    key: 'action', label: '动作模式',
    detail: '球拍自动追球，只需选正手 / 反手 / 搓等出拍方式',
  }),
])

const MODE_KEYS = Object.freeze(PLAY_MODES.map((mode) => mode.key))

export function normalizePlayMode(value) {
  return typeof value === 'string' && MODE_KEYS.includes(value) ? value : 'manual'
}

export function isActionMode(value) {
  return normalizePlayMode(value) === 'action'
}

// 装配引擎每帧所需控制量；manual 分支与迭代 14 的输入路径完全同构。
export function controlFor(mode, sim, input, config = CONFIG) {
  const paddle = sim?.playerPaddle
  const ball = sim?.ball
  const intent = input.intent()
  if (!isActionMode(mode)) {
    return {
      axes: input.axes(paddle),
      intent,
      speed: config?.paddle?.playerSpeed ?? CONFIG.paddle.playerSpeed,
    }
  }
  return {
    axes: autoAxes(paddle, ball, config),
    intent,
    speed: config?.autoPaddle?.speed ?? CONFIG.autoPaddle.speed,
  }
}
