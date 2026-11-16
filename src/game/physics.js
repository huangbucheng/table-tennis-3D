import { CONFIG, FOUL_REASONS, INTENT_NONE } from './config.js'
import { spinAcceleration, spinBounceVelocity, decaySpin, applyIntent } from './spin.js'
import { paddleContact } from './contact.js'

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

export const otherSide = (side) => (side === 'player' ? 'ai' : 'player')

export function createBall(server = 'player', rng = Math.random) {
  // 球从发球方半台出发飞向对方半台，因此位置与速度的 z 符号必须相反。
  const dir = server === 'player' ? 1 : -1
  return {
    position: { x: (rng() - 0.5) * 0.3, y: CONFIG.ball.serveY, z: dir * CONFIG.ball.serveZ },
    velocity: {
      x: (rng() - 0.5) * 0.45,
      y: CONFIG.ball.serveVy,
      z: -dir * CONFIG.ball.serveVz,
    },
    spin: 0,
  }
}

export function createRally(server = 'player') {
  return { active: true, lastHitter: server, crossedNet: false, bounceCount: 0 }
}

export function createPaddle(side = 'player') {
  return {
    x: 0,
    y: 0.98,
    z: side === 'player' ? CONFIG.paddle.playerZ : CONFIG.paddle.aiZ,
    vx: 0,
    vy: 0,
  }
}

export function clampVelocity(velocity, maxSpeed = CONFIG.ball.maxSpeed) {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
  if (speed <= maxSpeed || speed === 0) return { ...velocity }
  const ratio = maxSpeed / speed
  return { x: velocity.x * ratio, y: velocity.y * ratio, z: velocity.z * ratio }
}

// 积分一步，产生本步发生的事件；不修改入参。
export function stepBall(state, dt, config = CONFIG) {
  const { ball, rally } = state
  const prev = ball.position
  const p = { ...prev }
  const v = { ...ball.velocity }
  // 旧测试夹具可能不含 spin，按无旋处理，逐帧数值与迭代 2 完全一致。
  const spin = ball.spin ?? 0

  v.y += config.ball.gravity * dt
  v.y += spinAcceleration(spin, v.z, config).y * dt
  p.x += v.x * dt
  p.y += v.y * dt
  p.z += v.z * dt

  const events = []
  const tableTop = config.table.height + config.ball.radius
  const halfW = config.table.width / 2
  const halfL = config.table.length / 2

  if (v.y < 0 && prev.y > tableTop && p.y <= tableTop) {
    p.y = tableTop + (tableTop - p.y)
    v.y = -v.y * config.ball.restitution
    v.z = spinBounceVelocity(v.z, spin, config)
    events.push({
      type: 'tableBounce',
      side: p.z >= 0 ? 'player' : 'ai',
      outside: Math.abs(p.x) > halfW || Math.abs(p.z) > halfL,
      x: p.x,
      z: p.z,
    })
  }

  const crossing = (prev.z > 0 && p.z <= 0) || (prev.z < 0 && p.z >= 0)
  if (crossing && p.z !== prev.z) {
    const t = (0 - prev.z) / (p.z - prev.z)
    events.push({
      type: 'netCross',
      y: prev.y + (p.y - prev.y) * t,
      from: prev.z > 0 ? 'player' : 'ai',
    })
  }

  const nextRally = { ...rally }
  const netTop = config.table.height + config.table.netHeight + config.ball.radius
  if (rally.active) {
    for (const event of events) {
      if (event.type === 'netCross' && event.y >= netTop) {
        nextRally.crossedNet = true
      } else if (event.type === 'tableBounce' && !event.outside && event.side !== rally.lastHitter) {
        nextRally.bounceCount += 1
      }
    }
  }

  return {
    ball: { position: p, velocity: v, spin: decaySpin(spin, dt, config) },
    rally: nextRally,
    events,
  }
}

// 只判定是否失分，不改比分。prevState 用于识别「本步刚发生第二次落地」。
export function judgeRally(state, prevState, config = CONFIG) {
  const rally = state.rally
  if (!rally.active) return null

  const hitter = rally.lastHitter
  const opponent = otherSide(hitter)
  const netTop = config.table.height + config.table.netHeight + config.ball.radius
  const halfW = config.table.width / 2
  const halfL = config.table.length / 2

  for (const event of state.events) {
    if (event.type === 'netCross' && event.y < netTop) {
      return { winner: opponent, reason: FOUL_REASONS.NET }
    }
    if (event.type === 'tableBounce') {
      if (event.outside) return { winner: opponent, reason: FOUL_REASONS.OUT }
      if (event.side === hitter) return { winner: opponent, reason: FOUL_REASONS.OWN_HALF }
    }
  }

  if (rally.bounceCount >= 2 && prevState.rally.bounceCount < 2) {
    return { winner: hitter, reason: FOUL_REASONS.DOUBLE_BOUNCE }
  }

  const p = state.ball.position
  if (Math.abs(p.x) > halfW + config.rules.outMarginX || p.y < config.rules.minBallY) {
    return { winner: opponent, reason: FOUL_REASONS.OUT }
  }
  if (Math.abs(p.z) > halfL + config.rules.outMarginZ) {
    return { winner: hitter, reason: FOUL_REASONS.MISS }
  }
  return null
}

// dt > 0 时按本步 z 线段的拍面接触点判定；dt = 0 退化为点判定，供既有断言使用。
export function checkPaddleHit(ball, paddle, side, rally, config = CONFIG, dt = 0) {
  if (!rally.active || rally.lastHitter === side) return false
  const toward = side === 'player' ? ball.velocity.z > 0 : ball.velocity.z < 0
  if (!toward) return false

  const plane = side === 'player' ? config.paddle.playerZ : config.paddle.aiZ
  const point = paddleContact(ball, plane, dt)
  if (Math.abs(point.z - plane) > config.paddle.contactDepth) return false

  // 拍面是圆，判定也用圆；半径 = 拍面宽容 + 球半径。
  const radius = config.paddle.hitRadius + config.ball.radius
  const dx = point.x - paddle.x
  const dy = point.y - paddle.y
  return dx * dx + dy * dy <= radius * radius
}

export function returnBall(ball, paddle, side, rng = Math.random, config = CONFIG, intent = INTENT_NONE) {
  const b = config.ball
  const dir = side === 'player' ? -1 : 1
  const vx = clamp(
    ball.velocity.x * b.returnVxInherit +
      paddle.vx * b.returnVxPaddle +
      (rng() - 0.5) * b.returnVxRandom,
    -b.returnVxClamp,
    b.returnVxClamp,
  )
  const vy =
    b.returnVy +
    clamp(paddle.vy * b.returnVyPaddle, -b.returnVyPaddleClamp, b.returnVyPaddleClamp) +
    (rng() - 0.5) * b.returnVyRandom
  const vz = dir * (b.returnVzBase + rng() * b.returnVzRange)
  // 先由意图写出 spin 与速度分量，再统一截断一次；none 时数值与迭代 2 相同。
  const shaped = applyIntent({ position: { ...ball.position }, velocity: { x: vx, y: vy, z: vz } }, intent, config)
  return { ...shaped, velocity: clampVelocity(shaped.velocity, b.maxSpeed) }
}

export function predictXAt(ball, z, config = CONFIG) {
  const vz = ball.velocity.z
  if (Math.abs(vz) < 0.001) return ball.position.x
  const t = (z - ball.position.z) / vz
  if (t < 0 || t > 2) return ball.position.x
  return clamp(ball.position.x + ball.velocity.x * t, config.paddle.minX, config.paddle.maxX)
}

export function movePaddle(paddle, axisX, axisY, dt, speed, config = CONFIG) {
  const x = clamp(paddle.x + axisX * speed * dt, config.paddle.minX, config.paddle.maxX)
  const y = clamp(paddle.y + axisY * speed * 0.75 * dt, config.paddle.minY, config.paddle.maxY)
  return {
    ...paddle,
    x,
    y,
    vx: dt > 0 ? (x - paddle.x) / dt : 0,
    vy: dt > 0 ? (y - paddle.y) / dt : 0,
  }
}
