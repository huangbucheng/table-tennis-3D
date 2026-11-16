import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { advancePointPause } from './pointPause.js'

const dt = CONFIG.fixedDt

test('未到期时应只递减 remaining，不触发回置', () => {
  const next = advancePointPause(1.5, dt)
  assert.ok(Math.abs(next.remaining - (1.5 - dt)) < 1e-12,
    `期望剩余 ${1.5 - dt}，实际 ${next.remaining}`)
  assert.strictEqual(next.expired, false, '期望未到期不回置')
})

test('恰好归零的那一步应触发一次回置', () => {
  const next = advancePointPause(dt, dt)
  assert.strictEqual(next.remaining, 0, '期望剩余归零')
  assert.strictEqual(next.expired, true, '期望归零步触发回置')
})

test('归零后重复调用不应再次触发回置', () => {
  const first = advancePointPause(dt, dt)
  const second = advancePointPause(first.remaining, dt)
  assert.deepStrictEqual(second, { remaining: 0, expired: false },
    '期望回置幂等，重复调用不再触发')
})

test('remaining 非正时应直接返回零且不触发', () => {
  for (const value of [0, -0.5]) {
    assert.deepStrictEqual(advancePointPause(value, dt),
      { remaining: 0, expired: false }, `remaining=${value} 期望零且不触发`)
  }
})

test('dt 为 0 或负数时应暂停推进但不误触发', () => {
  for (const step of [0, -0.5]) {
    const next = advancePointPause(1.5, step)
    assert.strictEqual(next.remaining, 1.5, `dt=${step} 期望剩余不变`)
    assert.strictEqual(next.expired, false, `dt=${step} 期望不触发`)
  }
})

test('非有限 dt 应安全结束定格且不产生 NaN', () => {
  for (const step of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const next = advancePointPause(1.5, step)
    assert.ok(Number.isFinite(next.remaining), `dt=${step} 期望 remaining 有限`)
    assert.strictEqual(next.remaining, 0, `dt=${step} 期望直接结束定格`)
    assert.strictEqual(next.expired, true, `dt=${step} 期望触发回置`)
  }
})

test('非有限 remaining 不应产生 NaN', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, null]) {
    const next = advancePointPause(value, dt)
    assert.ok(Number.isFinite(next.remaining), `remaining=${value} 期望有限`)
    assert.strictEqual(next.expired, false, `remaining=${value} 期望不误触发`)
  }
})

test('按固定步长累计应在配置的停留时长处恰好归零', () => {
  let remaining = CONFIG.rules.pointPause
  let steps = 0
  let expired = false
  while (!expired && steps < 1000) {
    const next = advancePointPause(remaining, dt)
    remaining = next.remaining
    expired = next.expired
    steps += 1
  }
  const expected = Math.round(CONFIG.rules.pointPause / dt)
  assert.strictEqual(steps, expected,
    `期望 ${expected} 步（${CONFIG.rules.pointPause}s），实际 ${steps} 步`)
})
