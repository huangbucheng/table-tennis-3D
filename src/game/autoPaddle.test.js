import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { predictXAt } from './physics.js'
import { autoTarget, autoAxes } from './autoPaddle.js'

const incoming = (x = 0, y = 1, z = -0.6, vx = 0.4, vz = 3.4) => ({
  position: { x, y, z },
  velocity: { x: vx, y: 0, z: vz },
  spin: 0,
})

test('来球朝玩家飞时目标 x 应贴近预测落点，y 应为来球高度', () => {
  const ball = incoming(0.2, 1.05)
  const target = autoTarget(ball)
  const expectedX = predictXAt(ball, CONFIG.paddle.playerZ, CONFIG)
  const tolerance = CONFIG.autoPaddle.followRadius * 0.75
  assert.ok(Math.abs(target.x - expectedX) <= tolerance + 1e-9,
    `期望 x 在 ${expectedX}±${tolerance} 内，实际 ${target.x}`)
  assert.strictEqual(target.y, 1.05, `期望 y=1.05，实际 ${target.y}`)
  assert.deepStrictEqual(autoTarget(ball), target,
    '期望同一来球的瞄准偏置可重复，不引入随机')
})

test('任意有限球状态下瞄准偏置都应有界且不越出球拍范围', () => {
  const tolerance = CONFIG.autoPaddle.followRadius * 0.75
  const samples = [
    { position: { x: -10, y: 1, z: -0.8 }, velocity: { x: -100, y: 5, z: 3.4 } },
    { position: { x: 10, y: 1, z: -0.8 }, velocity: { x: 100, y: -5, z: 3.4 } },
    { position: { x: 0.42, y: 1.2, z: -0.8 }, velocity: { x: 1.4, y: 0, z: 9.5 } },
  ]
  for (const ball of samples) {
    const target = autoTarget(ball)
    const expectedX = predictXAt(ball, CONFIG.paddle.playerZ, CONFIG)
    assert.ok(Math.abs(target.x - expectedX) <= tolerance + 1e-9,
      `期望 x 在 ${expectedX}±${tolerance} 内，实际 ${target.x}`)
    assert.ok(target.x >= CONFIG.paddle.minX && target.x <= CONFIG.paddle.maxX,
      `期望 x 在球拍范围 [${CONFIG.paddle.minX}, ${CONFIG.paddle.maxX}]，实际 ${target.x}`)
  }
})

test('球远离玩家时应回中位，不追自己刚打出的球', () => {
  const ball = incoming(0.6, 1.2, 0.4, 0.4, -3.4)
  const target = autoTarget(ball)
  assert.strictEqual(target.x, CONFIG.autoPaddle.neutralX,
    `期望 x 回中位 ${CONFIG.autoPaddle.neutralX}，实际 ${target.x}`)
  assert.strictEqual(target.y, CONFIG.autoPaddle.neutralY,
    `期望 y 回中位 ${CONFIG.autoPaddle.neutralY}，实际 ${target.y}`)
  assert.notStrictEqual(target.x, 0.6, '期望不把球拍拉向球当前 x')
})

test('来球高度超出球拍可达区间时应被夹到边界', () => {
  const tooHigh = autoTarget(incoming(0, 2.4))
  const tooLow = autoTarget(incoming(0, 0.2))
  assert.strictEqual(tooHigh.y, CONFIG.paddle.maxY,
    `期望夹到 maxY=${CONFIG.paddle.maxY}，实际 ${tooHigh.y}`)
  assert.strictEqual(tooLow.y, CONFIG.paddle.minY,
    `期望夹到 minY=${CONFIG.paddle.minY}，实际 ${tooLow.y}`)
})

test('autoAxes 两分量应恒在 [-1,1] 且朝目标方向', () => {
  const ball = incoming(0.2, 1.05)
  const target = autoTarget(ball)
  const right = autoAxes({ x: target.x + 0.5, y: target.y }, ball)
  const left = autoAxes({ x: target.x - 0.5, y: target.y }, ball)
  for (const axes of [right, left]) {
    for (const key of ['x', 'y']) {
      assert.ok(axes[key] >= -1 && axes[key] <= 1,
        `期望 ${key} 在 [-1,1]，实际 ${axes[key]}`)
    }
  }
  assert.ok(right.x < 0, `期望球拍在目标右侧时向左修正，实际 ${right.x}`)
  assert.ok(left.x > 0, `期望球拍在目标左侧时向右修正，实际 ${left.x}`)
})

test('球拍已对齐目标时两轴应接近零', () => {
  const ball = incoming(0.2, 1.05)
  const target = autoTarget(ball)
  const axes = autoAxes({ x: target.x, y: target.y }, ball)
  assert.ok(Math.abs(axes.x) < 1e-9, `期望 x≈0，实际 ${axes.x}`)
  assert.ok(Math.abs(axes.y) < 1e-9, `期望 y≈0，实际 ${axes.y}`)
})

test('空值与非法输入不应抛异常，且轴向量仍是有界数值', () => {
  for (const ball of [undefined, null, {}, { position: null, velocity: null }]) {
    const axes = autoAxes(undefined, ball)
    for (const key of ['x', 'y']) {
      assert.ok(Number.isFinite(axes[key]) && axes[key] >= -1 && axes[key] <= 1,
        `期望 ${key} 为有界数值，实际 ${axes[key]}`)
    }
  }
})

test('静止或非法 z 速度不应把球拍拉向球当前位置', () => {
  for (const vz of [0, -0, NaN, undefined, null, 'fast', Infinity]) {
    // 直接构造，避免辅助函数的默认参数把 undefined 换成正常来球速度。
    const ball = {
      position: { x: 0.7, y: 1.1, z: -0.5 },
      velocity: { x: 0, y: 0, z: vz },
      spin: 0,
    }
    const target = autoTarget(ball)
    assert.strictEqual(target.x, CONFIG.autoPaddle.neutralX,
      `期望 vz=${String(vz)} 时回中位，实际 ${target.x}`)
  }
})

test('autoTarget 不应修改传入的球对象', () => {
  const ball = incoming(0.25, 1.02)
  const snapshot = JSON.stringify(ball)
  autoTarget(ball)
  autoAxes({ x: 0, y: 0.98 }, ball)
  assert.strictEqual(JSON.stringify(ball), snapshot, '期望入参保持原样')
})
