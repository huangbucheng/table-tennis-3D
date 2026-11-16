import { CONFIG } from './config.js'
import { predictXAt } from './physics.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const approach = (current, target, maxStep) =>
  current + clamp(target - current, -maxStep, maxStep)

export function createAiController(rng = Math.random, profile = 'standard') {
  return { time: 0, phase: rng() * Math.PI * 2, profile }
}

export function updateAiPaddle(paddle, ball, dt, controller, config = CONFIG) {
  controller.time += dt
  const profiles = config.aiProfiles ?? CONFIG.aiProfiles
  const p = profiles[controller.profile] ?? profiles.standard

  // 每回合随机相位，避免发球飞行时间固定时误差也固定、导致 AI 逐球漏接。
  // 有界的正弦误差仍让 AI 偶尔漏球，但不会随时间发散。
  const t = controller.time + (controller.phase ?? 0)
  const error =
    Math.sin(t * 2.3) * p.errorFast +
    Math.sin(t * 0.7) * p.errorSlow
  const approaching = ball.velocity.z < 0
  const targetX = approaching
    ? clamp(predictXAt(ball, config.paddle.aiZ, config) + error, config.paddle.minX, config.paddle.maxX)
    : 0
  const targetY = approaching
    ? clamp(ball.position.y, config.paddle.minY, config.paddle.maxY)
    : 0.96

  const x = approach(paddle.x, targetX, p.speed * dt)
  const y = approach(paddle.y, targetY, p.speed * p.ySpeedFactor * dt)

  return {
    ...paddle,
    x,
    y,
    vx: dt > 0 ? (x - paddle.x) / dt : 0,
    vy: dt > 0 ? (y - paddle.y) / dt : 0,
  }
}
