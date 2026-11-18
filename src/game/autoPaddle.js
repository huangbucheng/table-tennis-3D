// 动作模式的球拍追球，纯逻辑：不 import three、不访问 DOM、不改入参。
import { CONFIG } from './config.js'
import { predictXAt } from './physics.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback)

// 允许单测只注入部分常量；物理预测需要完整的 paddle 边界，故先与默认配置合并。
function merged(config) {
  const given = config && typeof config === 'object' ? config : {}
  return {
    ...CONFIG,
    ...given,
    paddle: { ...CONFIG.paddle, ...(given.paddle ?? {}) },
    autoPaddle: { ...CONFIG.autoPaddle, ...(given.autoPaddle ?? {}) },
  }
}

// 球朝玩家飞（vz > 0）时对齐预测落点；否则回中位，避免追自己刚打出的球。
// 由 followRadius 派生的缓慢确定性偏置避免「拍面完全静止 → 无旋相持」的定周期循环，
// 幅度 ≤0.09，仍小于接触半径 0.15，不改变「保证接到」。
export function autoTarget(ball, config = CONFIG) {
  const c = merged(config)
  const a = c.autoPaddle
  const p = c.paddle
  const velocity = ball && typeof ball === 'object' ? ball.velocity ?? {} : {}
  const position = ball && typeof ball === 'object' ? ball.position ?? {} : {}
  if (finite(velocity.z) <= 0) return { x: a.neutralX, y: a.neutralY }
  // 相位随球位置缓慢变化：同一段飞行内目标近似稳定，换球才明显变线。
  const phase = finite(position.x) * 5 + finite(position.z) * 0.5
    + finite(velocity.x) * 31 + finite(velocity.z) * 7
  const aimBias = Math.sin(phase) * a.followRadius * 0.75
  return {
    x: clamp(predictXAt(ball, p.playerZ, c) + aimBias, p.minX, p.maxX),
    y: clamp(finite(position.y, p.minY), p.minY, p.maxY),
  }
}

export function autoAxes(paddle, ball, config = CONFIG) {
  const a = merged(config).autoPaddle
  const target = autoTarget(ball, config)
  const current = paddle && typeof paddle === 'object' ? paddle : {}
  const radiusX = a.followRadius > 0 ? a.followRadius : CONFIG.autoPaddle.followRadius
  const radiusY = a.followRadiusY > 0 ? a.followRadiusY : CONFIG.autoPaddle.followRadiusY
  return {
    x: clamp((target.x - finite(current.x)) / radiusX, -1, 1),
    y: clamp((target.y - finite(current.y)) / radiusY, -1, 1),
  }
}
