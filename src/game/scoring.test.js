import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPoint, countdownFor, isDeuce, isGameOver, serverFor } from './scoring.js'

test('10:10 时比赛不应结束', () => {
  assert.strictEqual(isGameOver({ player: 10, ai: 10 }), false)
})

test('11:9 时比赛应结束', () => {
  assert.strictEqual(isGameOver({ player: 11, ai: 9 }), true)
})

test('12:10 时比赛应结束', () => {
  assert.strictEqual(isGameOver({ player: 12, ai: 10 }), true)
})

test('11:10 时因未净胜 2 分不应结束', () => {
  assert.strictEqual(isGameOver({ player: 11, ai: 10 }), false)
})

test('非法比分输入不应被判为比赛结束', () => {
  assert.strictEqual(isGameOver({ player: NaN, ai: 3 }), false)
})

test('常规阶段每累计 2 分换一次发球', () => {
  const schedule = [0, 1, 2, 3, 4, 5].map((n) => serverFor(n))
  assert.deepStrictEqual(schedule, ['player', 'player', 'ai', 'ai', 'player', 'player'])
})

test('双方均到 10 分后每得 1 分换一次发球', () => {
  const schedule = [20, 21, 22, 23].map((n) => serverFor(n, true))
  assert.deepStrictEqual(schedule, ['player', 'ai', 'player', 'ai'])
})

test('双方均到 10 分时应进入 deuce 换发球节奏', () => {
  assert.strictEqual(isDeuce({ player: 10, ai: 10 }), true)
})

test('同一方连续得 3 分应从 0:0 演进为 3:0', () => {
  const first = applyPoint({ player: 0, ai: 0 }, 'player')
  const second = applyPoint(first, 'player')
  const third = applyPoint(second, 'player')
  assert.deepStrictEqual(third, { player: 3, ai: 0 })
})

test('无效 winner 不应改变比分', () => {
  assert.deepStrictEqual(applyPoint({ player: 2, ai: 1 }, 'nobody'), { player: 2, ai: 1 })
})

test('非整数比分不应产生 NaN 状态', () => {
  assert.deepStrictEqual(applyPoint({ player: 1.5, ai: 0 }, 'player'), { player: 1.5, ai: 0 })
})

test('countdownFor 对 3.0 秒返回 3', () => {
  assert.strictEqual(countdownFor(3.0), 3, '期望剩余 3 秒显示 3')
})

test('countdownFor 对 2.4 秒向上取整返回 3', () => {
  assert.strictEqual(countdownFor(2.4), 3, '期望剩余 2.4 秒显示 3')
})

test('countdownFor 对 2.0 秒返回 2', () => {
  assert.strictEqual(countdownFor(2.0), 2, '期望剩余 2 秒显示 2')
})

test('countdownFor 对 0.4 秒返回 1', () => {
  assert.strictEqual(countdownFor(0.4), 1, '期望剩余 0.4 秒显示 1')
})

test('countdownFor 对 0 秒返回 0', () => {
  assert.strictEqual(countdownFor(0), 0, '期望剩余 0 秒显示 0')
})

test('countdownFor 对负数返回 0', () => {
  assert.strictEqual(countdownFor(-1), 0, '期望负数显示 0')
})

test('countdownFor 对超过 3 秒的值钳制为 3', () => {
  assert.strictEqual(countdownFor(99), 3, '期望上限为 3')
})

test('countdownFor 对 NaN 返回 0', () => {
  assert.strictEqual(countdownFor(NaN), 0, '期望 NaN 显示 0')
})

test('countdownFor 对 Infinity 返回 0', () => {
  assert.strictEqual(countdownFor(Infinity), 0, '期望 Infinity 显示 0')
})

test('countdownFor 对 -Infinity 返回 0', () => {
  assert.strictEqual(countdownFor(-Infinity), 0, '期望 -Infinity 显示 0')
})

test('countdownFor 对非数字字符串返回 0', () => {
  assert.strictEqual(countdownFor('3'), 0, '期望非数字输入显示 0')
})
