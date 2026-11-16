import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { spinAcceleration, spinBounceVelocity, decaySpin, applyIntent } from './spin.js'

const near = (actual, expected, label) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label}：期望 ${expected}，实际 ${actual}`)

const ball = () => ({ position: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 1.75, z: -3.45 } })

// 只保留四位小数，避免二进制浮点尾差让「整个返回对象」断言失去意义。
const shape = (b) => ({
  position: b.position,
  spin: +b.spin.toFixed(4),
  velocity: {
    x: +b.velocity.x.toFixed(4),
    y: +b.velocity.y.toFixed(4),
    z: +b.velocity.z.toFixed(4),
  },
})

test('上旋应产生向下加速度，数值等于 magnusY 乘以水平速率', () => {
  near(spinAcceleration(1, 4).y, -0.55 * 4, '上旋加速度')
})

test('下旋应产生向上加速度', () => {
  near(spinAcceleration(-1, 4).y, 0.55 * 4, '下旋加速度')
})

test('无旋球不应受到旋转加速度', () => {
  assert.strictEqual(spinAcceleration(0, 4).y, 0, '期望 0，实际有加速度')
})

test('非有限 spin 应按 0 处理，不产生 NaN', () => {
  assert.strictEqual(spinAcceleration(NaN, 4).y, 0, '期望 0，实际非 0')
})

test('水平速度为 0 时不应产生旋转加速度', () => {
  assert.strictEqual(spinAcceleration(1, 0).y, 0, '期望 0，实际有加速度')
})

test('旋转加速度方向只由 spin 决定，与球飞向哪一侧无关', () => {
  near(spinAcceleration(1, -4).y, spinAcceleration(1, 4).y, '反向飞行加速度')
})

test('超出 [-1,1] 的 spin 应被夹到边界', () => {
  near(spinAcceleration(5, 4).y, spinAcceleration(1, 4).y, '超界 spin')
})

test('上旋落台后水平速度应前冲', () => {
  near(spinBounceVelocity(3, 1), 3 * (1 + 0.18), '上旋前冲')
})

test('下旋落台后水平速度应回缩', () => {
  near(spinBounceVelocity(3, -1), 3 * (1 - 0.18), '下旋回缩')
})

test('反向飞行的球落台后仍保持原方向', () => {
  near(spinBounceVelocity(-3, 1), -3 * (1 + 0.18), '反向球')
})

test('无旋球落台后水平速度应原样返回', () => {
  near(spinBounceVelocity(3, 0), 3, '无旋球')
})

test('非有限 spin 落台变速应原样返回', () => {
  near(spinBounceVelocity(3, NaN), 3, '非有限 spin')
})

test('合法步长下 spin 应按 decay 单调衰减', () => {
  near(decaySpin(1, 0.1), 1 - 0.35 * 0.1, '衰减后 spin')
})

test('dt 为 0 时 spin 不应衰减', () => {
  near(decaySpin(-0.6, 0), -0.6, 'dt=0 的 spin')
})

test('非有限 spin 衰减应返回 0', () => {
  assert.strictEqual(decaySpin(NaN, 0.1), 0, '期望 0，实际非 0')
})

test('满蓄力 drive 出球应写入上旋 1、提速并压低弧线', () => {
  assert.deepStrictEqual(shape(applyIntent(ball(), { type: 'drive', charge: 1 })), {
    position: { x: 0, y: 1, z: 0 },
    spin: 1,
    velocity: { x: 0, y: 1.73, z: -5.3475 },
  }, '期望 drive 出球为满上旋、vz×1.55、vy−0.02')
})

test('push 出球应写入下旋、减速并抬高弧线', () => {
  assert.deepStrictEqual(shape(applyIntent(ball(), { type: 'push', charge: 0 })), {
    position: { x: 0, y: 1, z: 0 },
    spin: -0.6,
    velocity: { x: 0, y: 1.89, z: -2.691 },
  }, '期望 push 出球为下旋 −0.6、vz×0.78、vy+0.14')
})

test('none 出球应只补 spin: 0，速度完全不变', () => {
  assert.deepStrictEqual(shape(applyIntent(ball(), { type: 'none', charge: 0 })), {
    position: { x: 0, y: 1, z: 0 },
    spin: 0,
    velocity: { x: 0, y: 1.75, z: -3.45 },
  }, '期望 none 出球与来球速度一致')
})

test('未知 intent.type 应按 none 处理', () => {
  assert.deepStrictEqual(applyIntent(ball(), { type: 'smash', charge: 1 }),
    applyIntent(ball(), { type: 'none', charge: 0 }), '期望未知类型与 none 一致')
})

test('非对象 intent 应按 none 处理且不抛错', () => {
  assert.deepStrictEqual(applyIntent(ball(), null),
    applyIntent(ball(), { type: 'none', charge: 0 }), '期望 null 与 none 一致')
})

test('超出 [0,1] 的 charge 应被夹到边界', () => {
  assert.strictEqual(applyIntent(ball(), { type: 'drive', charge: 8 }).spin, 1, '期望 spin 为 1')
})

test('applyIntent 不应修改传入的球对象', () => {
  const original = ball()
  applyIntent(original, { type: 'drive', charge: 1 })
  assert.strictEqual(original.spin, undefined, '期望原对象不含 spin 字段')
})

test('自定义 config 即使缺少 spin 段也应回退到默认参数', () => {
  const custom = { ball: { ...CONFIG.ball } }
  near(spinAcceleration(1, 4, custom).y, -0.55 * 4, '自定义 config 回退')
})
