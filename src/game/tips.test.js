import test from 'node:test'
import assert from 'node:assert/strict'
import { tipFor } from './tips.js'

test('满蓄力 drive 应返回蓄力弧圈文案', () => {
  assert.strictEqual(tipFor({ type: 'drive', charge: 1 }), '蓄力弧圈 · 上旋让球下坠更快',
    '期望满蓄力弧圈文案')
})

test('charge 恰为 0.7 时应返回蓄力弧圈文案', () => {
  assert.strictEqual(tipFor({ type: 'drive', charge: 0.7 }), '蓄力弧圈 · 上旋让球下坠更快',
    '期望阈值边界按满蓄力处理')
})

test('charge 为 0.69 时应返回上旋快攻文案', () => {
  assert.strictEqual(tipFor({ type: 'drive', charge: 0.69 }), '上旋快攻 · 压低弧线',
    '期望阈值下按普通快攻处理')
})

test('push 应返回搓短下旋文案', () => {
  assert.strictEqual(tipFor({ type: 'push', charge: 0 }), '搓短下旋 · 落台后会回缩',
    '期望搓短文案')
})

test('block 应返回反手推挡文案', () => {
  assert.strictEqual(tipFor({ type: 'block', charge: 0 }), '反手推挡 · 平击压线',
    '期望反手推挡文案')
})

test('none 意图不应显示提示', () => {
  assert.strictEqual(tipFor({ type: 'none', charge: 0 }), '', '期望空字符串')
})

test('未知 type 不应显示提示', () => {
  assert.strictEqual(tipFor({ type: 'smash', charge: 1 }), '', '期望空字符串')
})

test('null 输入不应显示提示', () => {
  assert.strictEqual(tipFor(null), '', '期望空字符串')
})

test('非对象输入不应显示提示', () => {
  assert.strictEqual(tipFor('drive'), '', '期望空字符串')
})

test('charge 为非有限数时仍应给出快攻文案而非弧圈文案', () => {
  assert.strictEqual(tipFor({ type: 'drive', charge: NaN }), '上旋快攻 · 压低弧线',
    '期望非有限 charge 不触发满蓄力分支')
})

test('提示文案不应拼接意图里的任意字符串', () => {
  const result = tipFor({ type: 'drive', charge: 1, payload: '<script>alert(1)</script>' })
  assert.strictEqual(result, '蓄力弧圈 · 上旋让球下坠更快', '期望只返回固定枚举文案')
})
