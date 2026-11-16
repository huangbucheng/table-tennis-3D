import { CONFIG } from './config.js'

// 本模块只单向依赖 config.js；不导入 physics.js，避免循环依赖。
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback)
const params = (config) => config?.spin ?? CONFIG.spin
// 归一化读取：非有限数兜底 0，有限数夹到 [-1, 1]，保证落台变速不翻转方向。
const spinValue = (spin) => clamp(finite(spin), -1, 1)

// 上旋下压、下旋上浮；无旋、无水平速度或非有限数时恒返回正 0（不返回 -0）。
export function spinAcceleration(spin, vz, config) {
  const sp = spinValue(spin)
  const speed = Math.abs(finite(vz))
  if (sp === 0 || speed === 0) return { y: 0 }
  return { y: -sp * params(config).magnusY * speed }
}

// 落台后的水平速度：上旋前冲、下旋回缩，方向不变；spin 为 0 时原值返回。
export function spinBounceVelocity(vz, spin, config) {
  const sp = spinValue(spin)
  const z = finite(vz)
  if (sp === 0) return z
  return z * (1 + sp * params(config).bounceZ)
}

export function decaySpin(spin, dt, config) {
  const sp = spinValue(spin)
  if (sp === 0) return 0
  return clamp(sp * (1 - params(config).decay * finite(dt)), -1, 1)
}

// 把玩家意图写成出球的 spin 与速度分量；不自行截断速度，由 returnBall 统一负责。
export function applyIntent(ball, intent, config) {
  const s = params(config)
  const type = intent?.type
  const velocity = { ...ball.velocity }
  if (type === 'drive') {
    const charge = clamp(finite(intent.charge), 0, 1)
    velocity.z *= 1 + charge * s.driveVzGain
    velocity.y -= charge * s.driveVyDrop
    return { ...ball, velocity, spin: charge }
  }
  if (type === 'push') {
    velocity.z *= s.pushVzScale
    velocity.y += s.pushVyLift
    return { ...ball, velocity, spin: s.pushSpin }
  }
  // none、未知 type、null 或非对象输入：数值原样，仅补 spin: 0。
  return { ...ball, spin: 0 }
}
