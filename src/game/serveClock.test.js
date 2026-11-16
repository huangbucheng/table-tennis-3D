import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { ServeClock } from './serveClock.js'

const DT = CONFIG.fixedDt

// 走完整个倒数周期，收集整数秒变化，模拟引擎的固定步长循环。
const runToEnd = (clock) => {
  const counts = []
  for (let i = 0; i < 1000; i += 1) {
    const tick = clock.tick(DT)
    if (tick.expired) return { counts, expired: true, steps: i + 1 }
    if (tick.changed) counts.push(tick.count)
  }
  return { counts, expired: false, steps: 1000 }
}

test('发球倒数总时长应为 3 秒', () => {
  assert.strictEqual(CONFIG.rules.serveDelay, 3, '期望 serveDelay 为 3 秒')
})

test('reset 应返回首个显示数字 3', () => {
  const clock = new ServeClock()
  assert.strictEqual(clock.reset(), 3, '期望开球倒数从 3 开始')
})

test('整个倒数周期应依次变化到 2 与 1', () => {
  const clock = new ServeClock()
  clock.reset()
  const { counts } = runToEnd(clock)
  assert.deepStrictEqual(counts, [2, 1], '期望 3 之后依次显示 2、1')
})

test('倒数应在约 3 秒后触发发球', () => {
  const clock = new ServeClock()
  clock.reset()
  const { expired, steps } = runToEnd(clock)
  assert.strictEqual(expired, true, '期望倒数最终结束')
  assert.ok(
    steps >= 355 && steps <= 365,
    `期望约 360 个固定子步，实际 ${steps}`,
  )
})

test('倒数期间只在整数秒变化时上报 changed', () => {
  const clock = new ServeClock()
  clock.reset()
  let changes = 0
  for (let i = 0; i < 100; i += 1) {
    if (clock.tick(DT).changed) changes += 1
  }
  assert.strictEqual(changes, 0, '期望首秒内不重复触发 Vue 更新')
})

test('clear 应返回 0 并清空剩余时间', () => {
  const clock = new ServeClock()
  clock.reset()
  assert.strictEqual(clock.clear(), 0, '期望 clear 返回 0')
  assert.strictEqual(clock.count, 0, '期望显示值归零')
})

test('clear 后再次 tick 应立即结束倒数', () => {
  const clock = new ServeClock()
  clock.reset()
  clock.clear()
  assert.strictEqual(clock.tick(DT).expired, true, '期望不再倒数')
})
