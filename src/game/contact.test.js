import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { paddleContact } from './contact.js'
import { checkPaddleHit, createPaddle } from './physics.js'

const dt = CONFIG.fixedDt
const plane = CONFIG.paddle.aiZ
const ballAt = (x, y, z, vz = -3.3) => ({
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: vz },
  spin: 0,
})
const paddleAt = (x = 0, y = 1) => ({ ...createPaddle('ai'), x, y })
const liveRally = () => ({ active: true, lastHitter: 'player', crossedNet: true, bounceCount: 0 })
const hits = (ball, paddle, rally = liveRally(), step = dt) =>
  checkPaddleHit(ball, paddle, 'ai', rally, CONFIG, step)

test('线段跨过拍平面时最近点应精确落在平面上', () => {
  const contact = paddleContact(ballAt(0, 1, -1.49), plane, dt)
  assert.ok(Math.abs(contact.z - plane) < 1e-12,
    `期望 z=${plane}，实际 ${contact.z}`)
  assert.ok(contact.t > 0 && contact.t < 1, `期望 t 在 (0,1)，实际 ${contact.t}`)
})

test('线段未到达拍平面时应 clamp 到末端而非隔空命中', () => {
  const ball = ballAt(0, 1, -1.4)
  const contact = paddleContact(ball, plane, dt)
  assert.strictEqual(contact.t, 1, '期望 t 被 clamp 到 1')
  assert.ok(Math.abs(contact.z - plane) > CONFIG.paddle.contactDepth,
    `期望末端离拍平面超过 contactDepth，实际 ${Math.abs(contact.z - plane)}`)
})

test('x/y 应按与 z 相同的 t 插值，而不是取起点或终点', () => {
  const ball = {
    position: { x: 0.2, y: 1.2, z: -1.49 },
    velocity: { x: 2, y: -2, z: -3.3 },
  }
  const contact = paddleContact(ball, plane, dt)
  const expectedX = 0.2 + 2 * dt * contact.t
  const expectedY = 1.2 - 2 * dt * contact.t
  assert.ok(Math.abs(contact.x - expectedX) < 1e-12,
    `期望 x=${expectedX}，实际 ${contact.x}`)
  assert.ok(Math.abs(contact.y - expectedY) < 1e-12,
    `期望 y=${expectedY}，实际 ${contact.y}`)
})

test('dt 为 0 或负数时应退化为点判定', () => {
  for (const step of [0, -0.5, Number.NaN]) {
    const contact = paddleContact(ballAt(0.3, 1.1, -1.45), plane, step)
    assert.strictEqual(contact.t, 0, `dt=${step} 期望 t=0`)
    assert.deepStrictEqual(
      { x: contact.x, y: contact.y, z: contact.z },
      { x: 0.3, y: 1.1, z: -1.45 },
      `dt=${step} 期望返回原始点`,
    )
  }
})

test('vz 为 0 时应返回起点且不产生 NaN', () => {
  const contact = paddleContact(ballAt(0.2, 1, -1.5, 0), plane, dt)
  assert.deepStrictEqual(contact, { x: 0.2, y: 1, z: -1.5, t: 0 },
    '期望 vz=0 时返回起点')
})

test('非有限坐标与速度应全部返回有限值', () => {
  const bad = {
    position: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: Number.NEGATIVE_INFINITY },
    velocity: { x: Number.NaN, y: Number.POSITIVE_INFINITY, z: Number.NaN },
  }
  const contact = paddleContact(bad, plane, dt)
  for (const [key, value] of Object.entries(contact)) {
    assert.ok(Number.isFinite(value), `期望 ${key} 有限，实际 ${value}`)
  }
})

test('paddleContact 不应修改入参', () => {
  const ball = ballAt(0.1, 1.05, -1.49)
  const snapshot = structuredClone(ball)
  paddleContact(ball, plane, dt)
  assert.deepStrictEqual(ball, snapshot, '期望 ball 逐字段不变')
})

test('球在拍心正上方 0.17 时不应命中', () => {
  assert.strictEqual(hits(ballAt(0, 1.17, plane), paddleAt()), false,
    '期望 0.17 > 接触半径 0.15 时不命中')
})

test('球在拍心侧方 0.18 时不应命中', () => {
  assert.strictEqual(hits(ballAt(0.18, 1, plane), paddleAt()), false,
    '期望 0.18 > 接触半径 0.15 时不命中')
})

test('球偏离拍心 0.10 与 0.14 时都应命中，且水平/竖直一致', () => {
  for (const offset of [0.1, 0.14]) {
    assert.strictEqual(hits(ballAt(0, 1 + offset, plane), paddleAt()), true,
      `期望竖直 ${offset} <= 接触半径 0.15 时命中`)
    assert.strictEqual(hits(ballAt(offset, 1, plane), paddleAt()), true,
      `期望水平 ${offset} <= 接触半径 0.15 时命中`)
  }
})

test('判定区面积不应超过视觉接触区的 2 倍', () => {
  const judged = Math.PI * (CONFIG.paddle.hitRadius + CONFIG.ball.radius) ** 2
  const visual = Math.PI * (CONFIG.paddle.bladeRadius + CONFIG.ball.radius) ** 2
  assert.ok(judged / visual <= 2,
    `期望判定/视觉面积比 <=2，实际 ${(judged / visual).toFixed(3)}`)
})

test('dt = 0 的点判定仍与既有断言兼容', () => {
  assert.strictEqual(hits(ballAt(0, 1, plane), paddleAt(), liveRally(), 0), true,
    '期望拍面上的球在 dt=0 时命中')
  assert.strictEqual(hits(ballAt(0.2, 1, plane), paddleAt(), liveRally(), 0), false,
    '期望拍外的球在 dt=0 时不命中')
})

test('本步线段穿越拍平面时应命中，即使球起点还没到拍面', () => {
  assert.strictEqual(hits(ballAt(0, 1, -1.49), paddleAt()), true,
    '期望拍面处的最近点判定为命中')
})

test('球尚未接近拍平面时不应命中', () => {
  assert.strictEqual(hits(ballAt(0, 1, -1.4), paddleAt()), false,
    '期望距离超过 contactDepth 时不命中')
})

test('接触深度之外不应命中', () => {
  assert.strictEqual(hits(ballAt(0, 1, -1.44, -0.001), paddleAt(), liveRally(), 0), false,
    '期望 |z - plane| = 0.06 > 0.035 时不命中')
})

test('rally 未激活 / 自己刚击球 / 来球背离时都应提前返回 false', () => {
  const onPlane = ballAt(0, 1, plane)
  assert.strictEqual(hits(onPlane, paddleAt(), { ...liveRally(), active: false }), false,
    '期望死球不命中')
  assert.strictEqual(hits(onPlane, paddleAt(), { ...liveRally(), lastHitter: 'ai' }), false,
    '期望不能击中自己刚打出的球')
  assert.strictEqual(hits(ballAt(0, 1, plane, 3.3), paddleAt()), false,
    '期望来球背离时不命中')
})
