import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { paddleOutline, handleProfile } from './paddleProfile.js'

const R = CONFIG.paddle.bladeRadius

test('默认轮廓应给出 48 个有限坐标点，且首尾严格闭合', () => {
  const points = paddleOutline()
  assert.equal(points.length, 48)
  for (const [x, y] of points) {
    assert.ok(Number.isFinite(x) && Number.isFinite(y), `轮廓点必须是有限数：${x}, ${y}`)
  }
  assert.deepEqual(points[0], points[points.length - 1])
})

test('闭合轮廓中相邻采样点不应重复，避免零长度边', () => {
  const points = paddleOutline()
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1]
    const [bx, by] = points[i]
    assert.ok(Math.hypot(ax - bx, ay - by) > 1e-9, `第 ${i} 段应为非零长度`)
  }
})

test('轮廓应是简单不自交曲线：展开后的极角严格递增', () => {
  const points = paddleOutline().slice(0, -1)
  let previous = null
  for (const [x, y] of points) {
    let angle = Math.atan2(y, x)
    if (previous !== null) {
      while (angle < previous - Math.PI) angle += 2 * Math.PI
      while (angle > previous + Math.PI) angle -= 2 * Math.PI
      assert.ok(angle > previous, `极角应单调：${angle} 应大于 ${previous}`)
    }
    previous = angle
  }
})

test('拍面宽度应恰好等于 2R，且每一点都不越过 bladeRadius', () => {
  const points = paddleOutline()
  const xs = points.map(([x]) => x)
  const width = Math.max(...xs) - Math.min(...xs)
  assert.ok(Math.abs(width - 2 * R) <= 1e-6, `宽度 ${width} 应等于 ${2 * R}`)
  for (const [x, y] of points) {
    assert.ok(Math.hypot(x, y) <= R + 1e-6, `点 (${x}, ${y}) 不应超出 ${R}`)
  }
})

test('顶部应达到 R、底部应达到 -0.96R，底部是平底短颈而非水滴尖点', () => {
  const points = paddleOutline()
  const ys = points.map(([, y]) => y)
  assert.ok(Math.abs(Math.max(...ys) - R) <= 1e-9)
  assert.ok(Math.abs(Math.min(...ys) + 0.96 * R) <= 1e-9)
  const flat = points.filter(([, y]) => Math.abs(y + 0.96 * R) < 1e-9)
  assert.ok(flat.length >= 3, `平底至少需要 3 个点，实际 ${flat.length}`)
  const flatXs = flat.map(([x]) => x)
  const neckWidth = Math.max(...flatXs) - Math.min(...flatXs)
  assert.ok(Math.abs(neckWidth - 0.40 * R) <= 1e-6, `颈宽 ${neckWidth} 应等于 ${0.40 * R}`)
})

test('木柄半径应单调不减且非负，轴向严格递增并终于 0.102', () => {
  const handle = handleProfile()
  assert.equal(handle.length, 7)
  for (let i = 0; i < handle.length; i += 1) {
    const [radius, axial] = handle[i]
    assert.ok(radius >= 0 && axial >= 0, `第 ${i} 组不得为负数`)
    if (i === 0) continue
    assert.ok(radius >= handle[i - 1][0], `第 ${i} 组半径不得收细成波纹`)
    assert.ok(axial > handle[i - 1][1], `第 ${i} 组轴向必须递增`)
  }
  assert.equal(handle[handle.length - 1][1], 0.102)
})

test('减少采样数时仍应保持闭合与半径上界', () => {
  const points = paddleOutline(24)
  assert.equal(points.length, 24)
  assert.deepEqual(points[0], points[points.length - 1])
  for (const [x, y] of points) {
    assert.ok(Math.hypot(x, y) <= R + 1e-6, `点 (${x}, ${y}) 不应超出 ${R}`)
  }
})
