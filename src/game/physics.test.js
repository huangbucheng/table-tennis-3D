import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import {
  checkPaddleHit,
  clampVelocity,
  createBall,
  createPaddle,
  createRally,
  judgeRally,
  movePaddle,
  predictXAt,
  returnBall,
  stepBall,
} from './physics.js'

const at = (x, y, z, vx = 0, vy = 0, vz = 0) => ({
  position: { x, y, z },
  velocity: { x: vx, y: vy, z: vz },
})

const NET_TOP = CONFIG.table.height + CONFIG.table.netHeight + CONFIG.ball.radius

// 把一次确定性发球推进到首次落台，收集过网事件与该步判罚。
const serveUntilFirstBounce = (server) => {
  let state = { ball: createBall(server, () => 0.5), rally: createRally(server) }
  let cross = null
  for (let i = 0; i < 400; i += 1) {
    const next = stepBall(state, CONFIG.fixedDt)
    const candidate = { ball: next.ball, rally: next.rally, events: next.events }
    if (!cross) cross = next.events.find((e) => e.type === 'netCross') || null
    const bounce = next.events.find((e) => e.type === 'tableBounce')
    if (bounce) {
      return { cross, bounce, foul: judgeRally(candidate, { rally: state.rally }) }
    }
    state = candidate
  }
  return { cross, bounce: null, foul: null }
}

test('球落到台面后应向上反弹，且竖直速度衰减为入射速度的 0.8 倍', () => {
  const flat = { ...CONFIG, ball: { ...CONFIG.ball, gravity: 0 } }
  const state = {
    ball: at(0, CONFIG.table.height + CONFIG.ball.radius + 0.001, 0.4, 0, -1, 0),
    rally: createRally('player'),
  }
  const result = stepBall(state, 0.01, flat)
  assert.ok(
    Math.abs(result.ball.velocity.y - 0.8) < 1e-9,
    `期望竖直速度 0.8，实际 ${result.ball.velocity.y}`,
  )
})

test('球低于网顶穿过 z=0 时应判击球方失分，理由为「球下网了」', () => {
  const rally = createRally('player')
  const state = {
    ball: at(0, 0.85, -0.01, 0, 0.4, -3.3),
    rally: { ...rally },
    events: [{ type: 'netCross', y: 0.85, from: 'player' }],
  }
  assert.deepStrictEqual(judgeRally(state, { rally }), {
    winner: 'ai',
    reason: '球下网了',
  })
})

test('对方半台第二次落地时应判击球方得分，理由为「球二次落地」', () => {
  const rally = { ...createRally('player'), bounceCount: 2 }
  const state = {
    ball: at(0, 0.9, -0.5, 0, 0.5, -3.3),
    rally,
    events: [{ type: 'tableBounce', side: 'ai', outside: false, x: 0, z: -0.5 }],
  }
  assert.deepStrictEqual(judgeRally(state, { rally: { ...rally, bounceCount: 1 } }), {
    winner: 'player',
    reason: '球二次落地',
  })
})

test('球横向飞出边界时应判击球方失分，理由为「球出界了」', () => {
  const rally = createRally('player')
  const state = { ball: at(1, 1, -0.3, 0, 0, -3.3), rally, events: [] }
  assert.deepStrictEqual(judgeRally(state, { rally }), {
    winner: 'ai',
    reason: '球出界了',
  })
})

test('球恰好落在允许边界线上时不应判出界', () => {
  const rally = createRally('player')
  const boundary = CONFIG.table.width / 2 + CONFIG.rules.outMarginX
  const state = { ball: at(boundary, 1, -0.3, 0, 0, -3.3), rally, events: [] }
  assert.strictEqual(judgeRally(state, { rally }), null, `期望 null，实际判罚了 ${JSON.stringify(judgeRally(state, { rally }))}`)
})

test('球越过接球方端线且未被击中时应判击球方得分，理由为「没接到球」', () => {
  const rally = createRally('player')
  const beyondEnd = -(CONFIG.table.length / 2 + CONFIG.rules.outMarginZ + 0.1)
  const state = { ball: at(0, 1, beyondEnd, 0, 0, -3.3), rally, events: [] }
  assert.deepStrictEqual(judgeRally(state, { rally }), {
    winner: 'player',
    reason: '没接到球',
  })
})

test('玩家球拍回击后球应朝对手方向（z 减小）飞出', () => {
  const next = returnBall(at(0, 1, 1.25, 0.2, -0.5, 3.3), createPaddle('player'), 'player', () => 0.5)
  assert.ok(next.velocity.z < 0, `期望 z 速度为负，实际 ${next.velocity.z}`)
})

test('AI 球拍回击后球应朝玩家方向（z 增大）飞出', () => {
  const next = returnBall(at(0, 1, -1.25, 0.2, -0.5, -3.3), createPaddle('ai'), 'ai', () => 0.5)
  assert.ok(next.velocity.z > 0, `期望 z 速度为正，实际 ${next.velocity.z}`)
})

test('来球落在球拍击球范围内时应判定为击中', () => {
  const rally = createRally('ai')
  const ball = at(0, 0.98, CONFIG.paddle.playerZ, 0, 0, 3.3)
  assert.strictEqual(checkPaddleHit(ball, createPaddle('player'), 'player', rally), true)
})

test('来球远离球拍时不应判定为击中', () => {
  const rally = createRally('ai')
  const ball = at(0.7, 0.98, CONFIG.paddle.playerZ, 0, 0, 3.3)
  assert.strictEqual(checkPaddleHit(ball, createPaddle('player'), 'player', rally), false)
})

test('球拍不应击中自己刚打出的球', () => {
  const rally = createRally('player')
  const ball = at(0, 0.98, CONFIG.paddle.playerZ, 0, 0, 3.3)
  assert.strictEqual(checkPaddleHit(ball, createPaddle('player'), 'player', rally), false)
})

test('速度超过上限时应被截断到上限以内', () => {
  const v = clampVelocity({ x: 20, y: 0, z: 0 }, 5)
  assert.ok(Math.hypot(v.x, v.y, v.z) <= 5 + 1e-9, `期望速度 ≤5，实际 ${Math.hypot(v.x, v.y, v.z)}`)
})

test('落点预测应按当前横向速度外推到目标 z 平面', () => {
  const ball = at(0, 1, 1, 0.2, 0, -2)
  const predicted = predictXAt(ball, -1)
  assert.ok(Math.abs(predicted - 0.2) < 1e-9, `期望 0.2，实际 ${predicted}`)
})

test('球拍移动不应越过左右边界', () => {
  const paddle = movePaddle(createPaddle('player'), 1, 0, 10, CONFIG.paddle.playerSpeed)
  assert.strictEqual(paddle.x, CONFIG.paddle.maxX, `期望 ${CONFIG.paddle.maxX}，实际 ${paddle.x}`)
})

test('我方发球应生成在近端半台', () => {
  const ball = createBall('player', () => 0.5)
  assert.ok(ball.position.z > 0, `期望 position.z 为正，实际 ${ball.position.z}`)
})

test('我方发球应朝远端飞行', () => {
  const ball = createBall('player', () => 0.5)
  assert.ok(ball.velocity.z < 0, `期望 velocity.z 为负，实际 ${ball.velocity.z}`)
})

test('对手发球应生成在远端半台并朝近端飞行', () => {
  const ball = createBall('ai', () => 0.5)
  assert.ok(
    ball.position.z < 0 && ball.velocity.z > 0,
    `期望 z<0 且 vz>0，实际 z=${ball.position.z} vz=${ball.velocity.z}`,
  )
})

test('双方发球状态应互为镜像', () => {
  const player = createBall('player', () => 0.5)
  const ai = createBall('ai', () => 0.5)
  assert.strictEqual(ai.position.z, -player.position.z, '期望待发位置互为相反数')
  assert.strictEqual(ai.velocity.z, -player.velocity.z, '期望发球速度互为相反数')
})

test('我方发球应过网且高度高于网顶', () => {
  const { cross } = serveUntilFirstBounce('player')
  assert.ok(cross && cross.y >= NET_TOP, `期望过网高度 ≥${NET_TOP}，实际 ${cross?.y}`)
})

test('我方发球首落点应在对方半台', () => {
  const { bounce } = serveUntilFirstBounce('player')
  assert.strictEqual(bounce?.side, 'ai', `期望落在 ai 半台，实际 ${bounce?.side}`)
})

test('我方发球首落点不应出界', () => {
  const { bounce } = serveUntilFirstBounce('player')
  assert.strictEqual(bounce?.outside, false, '期望首落点在台面内')
})

test('我方发球首落台不应判「球落在自己半台」', () => {
  const { foul } = serveUntilFirstBounce('player')
  assert.notStrictEqual(foul?.reason, '球落在自己半台', '期望发球合法')
})

test('对手发球首落点应在玩家半台', () => {
  const { bounce } = serveUntilFirstBounce('ai')
  assert.strictEqual(bounce?.side, 'player', `期望落在 player 半台，实际 ${bounce?.side}`)
})
