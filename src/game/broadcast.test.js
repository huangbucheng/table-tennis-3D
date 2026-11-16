import test from 'node:test'
import assert from 'node:assert/strict'
import { ROUND_LABEL, matchPointLabel, matchPointSide } from './broadcast.js'

const equal = (actual, expected, label) =>
  assert.strictEqual(actual, expected, `${label}：期望 ${String(expected)}，实际 ${String(actual)}`)

test('0-0 时不显示赛点', () => {
  equal(matchPointSide({ player: 0, ai: 0 }), null, '0-0 赛点归属')
})

test('10-9 时赛点属于玩家', () => {
  equal(matchPointSide({ player: 10, ai: 9 }), 'player', '10-9 赛点归属')
})

test('9-10 时赛点属于对手', () => {
  equal(matchPointSide({ player: 9, ai: 10 }), 'ai', '9-10 赛点归属')
})

test('10-10 平分不显示赛点', () => {
  equal(matchPointSide({ player: 10, ai: 10 }), null, '10-10 赛点归属')
})

test('11-9 已结束不显示赛点', () => {
  equal(matchPointSide({ player: 11, ai: 9 }), null, '11-9 赛点归属')
})

test('11-10 仍需净胜两分，赛点属于玩家', () => {
  equal(matchPointSide({ player: 11, ai: 10 }), 'player', '11-10 赛点归属')
})

test('12-10 已结束不显示赛点', () => {
  equal(matchPointSide({ player: 12, ai: 10 }), null, '12-10 赛点归属')
})

test('非法比分一律返回 null', () => {
  for (const invalid of [null, undefined, { player: NaN, ai: 1 }, { player: -1, ai: 2 }, { player: 1.5, ai: 2 }, {}]) {
    equal(matchPointSide(invalid), null, `非法比分 ${JSON.stringify(invalid)}`)
  }
})

test('赛点文案是固定枚举', () => {
  equal(matchPointLabel('player'), '赛点', 'player 文案')
  equal(matchPointLabel('ai'), '赛点', 'ai 文案')
})

test('非赛点不产生文案', () => {
  equal(matchPointLabel(null), '', 'null 文案')
  equal(matchPointLabel('bogus'), '', '未知 side 文案')
})

test('赛制标签是固定文案', () => {
  equal(ROUND_LABEL, '第 1 局 · 11 分制', '赛制标签')
})
