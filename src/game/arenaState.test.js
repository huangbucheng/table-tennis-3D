import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { CUES, LIGHT_KEYS, cueFromTransition, damp, decayPulse, lightTarget } from './arenaState.js'

const equal = (actual, expected, label) =>
  assert.strictEqual(actual, expected, `${label}：期望 ${String(expected)}，实际 ${String(actual)}`)
const near = (actual, expected, eps, label) =>
  assert.ok(Math.abs(actual - expected) <= eps,
    `${label}：期望 ${expected} ± ${eps}，实际 ${actual}`)

const payload = (over = {}) => ({
  phase: 'ready', scores: { player: 0, ai: 0 }, message: '', winner: null,
  countdown: 0, tip: '', pending: 'none', muted: false, ...over,
})
const assertVector = (actual, expected, label) => {
  for (const key of LIGHT_KEYS) near(actual[key], expected[key], 1e-9, `${label}.${key}`)
}

test('ready 目标向量等于 config 的 READY', () => {
  const target = lightTarget(CUES.READY)
  assertVector(target, CONFIG.arena.light.READY, 'ready')
  equal(target.tint, 'default', 'ready tint')
})

test('playing 目标向量等于 config 的 PLAYING', () => {
  const target = lightTarget(CUES.PLAYING)
  assertVector(target, CONFIG.arena.light.PLAYING, 'playing')
  equal(target.tint, 'default', 'playing tint')
})

test('倒数 c=1 与 playing 六项逐项相等且 tint 一致', () => {
  const one = lightTarget(CUES.COUNTDOWN, { countdown: 1 })
  const playing = lightTarget(CUES.PLAYING)
  assertVector(one, playing, 'c=1 vs playing')
  equal(one.tint, playing.tint, 'c=1 tint')
})

test('倒数 c=3/2/1 的主光单调上升', () => {
  const keys = [3, 2, 1].map((c) => lightTarget(CUES.COUNTDOWN, { countdown: c }).key)
  assert.ok(keys[0] < keys[1] && keys[1] < keys[2],
    `期望 1.2 < 2.3 < 3.4，实际 ${keys.join(' / ')}`)
  near(keys[0], 1.2, 1e-9, 'c=3 key')
  near(keys[2], 3.4, 1e-9, 'c=1 key')
})

test('倒数超出 [1,3] 时 clamp 到端点', () => {
  assertVector(lightTarget(CUES.COUNTDOWN, { countdown: 99 }), CONFIG.arena.light.READY, 'c=99')
  assertVector(lightTarget(CUES.COUNTDOWN, { countdown: -5 }), CONFIG.arena.light.PLAYING, 'c=-5')
})

test('gameover 的 tint 由胜方决定', () => {
  equal(lightTarget(CUES.GAMEOVER, { winner: 'player' }).tint, 'win', '玩家胜 tint')
  equal(lightTarget(CUES.GAMEOVER, { winner: 'ai' }).tint, 'lose', '对手胜 tint')
})

test('赛点让 playing 与 countdown 的 tint 变为 match', () => {
  equal(lightTarget(CUES.PLAYING, { matchPoint: 'player' }).tint, 'match', 'playing 赛点')
  equal(lightTarget(CUES.COUNTDOWN, { countdown: 2, matchPoint: 'ai' }).tint, 'match', '倒数赛点')
})

test('未知 cue 回退 PLAYING 且 tint 为 default', () => {
  const target = lightTarget('bogus', { matchPoint: 'player', countdown: 3 })
  assertVector(target, CONFIG.arena.light.PLAYING, '未知 cue')
  equal(target.tint, 'default', '未知 cue tint')
})

test('构造期首次 emit 返回 ready 且无脉冲', () => {
  const diff = cueFromTransition(null, payload())
  equal(diff.cue, CUES.READY, '首次 cue')
  equal(diff.pulse, 0, '首次 pulse')
})

test('进入 serving 时下发 countdown 3 且无脉冲', () => {
  const diff = cueFromTransition(payload(), payload({ phase: 'serving', countdown: 3 }))
  equal(diff.cue, CUES.COUNTDOWN, 'start cue')
  equal(diff.pulse, 0, 'start pulse')
  equal(diff.ctx.countdown, 3, 'start countdown')
})

test('倒数 3→2 仍为 countdown 且无脉冲', () => {
  const diff = cueFromTransition(
    payload({ phase: 'serving', countdown: 3 }), payload({ phase: 'serving', countdown: 2 }))
  equal(diff.cue, CUES.COUNTDOWN, '3→2 cue')
  equal(diff.pulse, 0, '3→2 pulse')
})

test('开球进入 playing 不带脉冲', () => {
  const diff = cueFromTransition(
    payload({ phase: 'serving', countdown: 1 }), payload({ phase: 'playing' }))
  equal(diff.cue, CUES.PLAYING, '开球 cue')
  equal(diff.pulse, 0, '开球 pulse')
})

test('得一分时同时拿到 countdown cue 与 pulse', () => {
  const diff = cueFromTransition(
    payload({ phase: 'playing' }),
    payload({ phase: 'serving', countdown: 3, scores: { player: 1, ai: 0 } }))
  equal(diff.cue, CUES.COUNTDOWN, '得分 cue')
  equal(diff.pulse, 1, '得分 pulse')
})

test('决出胜负时拿到 gameover cue 且只有一个脉冲', () => {
  const diff = cueFromTransition(
    payload({ phase: 'playing', scores: { player: 10, ai: 9 } }),
    payload({ phase: 'gameover', scores: { player: 11, ai: 9 }, winner: 'player' }))
  equal(diff.cue, CUES.GAMEOVER, '终局 cue')
  equal(diff.pulse, 1, '终局 pulse')
  equal(diff.ctx.winner, 'player', '终局 winner')
})

test('比分归零不触发脉冲', () => {
  const diff = cueFromTransition(
    payload({ phase: 'gameover', scores: { player: 11, ai: 9 }, winner: 'player' }),
    payload({ phase: 'serving', countdown: 3 }))
  equal(diff.pulse, 0, '重开 pulse')
})

test('tip / pending / muted 变化一律返回 null', () => {
  const base = payload({ phase: 'playing' })
  for (const over of [{ tip: '上旋快攻' }, { pending: 'push' }, { muted: true }]) {
    equal(cueFromTransition(base, payload({ phase: 'playing', ...over })), null,
      `仅 ${Object.keys(over)[0]} 变化`)
  }
})

test('非法比分与非有限 countdown 不抛异常也不产生脉冲', () => {
  const diff = cueFromTransition(
    payload({ phase: 'playing' }),
    payload({ phase: 'serving', countdown: NaN, scores: { player: NaN, ai: 0 } }))
  equal(diff.pulse, 0, '非法比分 pulse')
  equal(diff.ctx.matchPoint, null, '非法比分赛点')
})

test('cueFromTransition 不修改入参', () => {
  const prev = Object.freeze(payload({ phase: 'playing' }))
  const next = Object.freeze(payload({ phase: 'serving', countdown: 3, scores: { player: 1, ai: 0 } }))
  cueFromTransition(prev, next)
  equal(next.scores.player, 1, 'next.scores 未被改写')
  equal(prev.phase, 'playing', 'prev.phase 未被改写')
})

test('damp 朝目标收敛且不越界', () => {
  const value = damp(0, 3.4, 1 / 60, 0.18)
  assert.ok(value > 0 && value < 3.4, `期望 0 < ${value} < 3.4`)
})

test('damp 在 dt=0 时恒等', () => {
  equal(damp(1.2, 3.4, 0), 1.2, 'dt=0')
  equal(damp(1.2, 3.4, -1), 1.2, 'dt<0')
})

test('damp 对非有限输入不产生 NaN 且结果有界', () => {
  const fromNaN = damp(NaN, 3.4, 1 / 60)
  assert.ok(Number.isFinite(fromNaN) && fromNaN >= 0 && fromNaN <= 3.4,
    `期望 [0, 3.4] 内的有限数，实际 ${fromNaN}`)
  equal(damp(1.2, NaN, 1 / 60), 1.2, 'target NaN')
})

test('decayPulse 在 0.5 秒内衰减到 2% 以下', () => {
  let value = 1
  for (let i = 0; i < 30; i += 1) value = decayPulse(value, 1 / 60)
  assert.ok(value < 0.02, `期望 < 0.02，实际 ${value}`)
})

test('decayPulse 恒 clamp 到 [0,1]', () => {
  equal(decayPulse(5, 0), 1, '上界')
  equal(decayPulse(-5, 0), 0, '下界')
})
