import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STROKES, STROKE_KEYS, normalizeStroke, strokeForDigit, optionsFor, strokeHint,
} from './strokes.js'

test('四个动作键应齐全且互不重复', () => {
  assert.deepStrictEqual([...STROKE_KEYS], ['none', 'drive', 'push', 'block'],
    `期望四个动作键，实际 ${STROKE_KEYS}`)
  assert.strictEqual(new Set(STROKE_KEYS).size, STROKES.length,
    '期望动作键不重复')
})

test('合法动作键应原样返回', () => {
  for (const key of STROKE_KEYS) {
    assert.strictEqual(normalizeStroke(key), key,
      `期望 ${key} 原样返回，实际 ${normalizeStroke(key)}`)
  }
})

test('空值、非法类型、未知字符串与原型键应返回 null', () => {
  const bad = [undefined, null, 0, 1, {}, [], true, NaN, '', 'loop',
    'Block', 'constructor', 'toString', '__proto__', ' block ']
  for (const value of bad) {
    assert.strictEqual(normalizeStroke(value), null,
      `期望 ${JSON.stringify(value)} 返回 null，实际 ${normalizeStroke(value)}`)
  }
})

test('数字键 1/2/3/4 应分别映射到四个动作', () => {
  const expected = { 1: 'none', 2: 'drive', 3: 'push', 4: 'block' }
  for (const [digit, key] of Object.entries(expected)) {
    assert.strictEqual(strokeForDigit(digit), key,
      `期望 ${digit} → ${key}，实际 ${strokeForDigit(digit)}`)
  }
})

test('非数字键与非字符串输入不应被当成动作', () => {
  for (const value of ['5', '0', '', 'toString', '__proto__', null, undefined, 4, {}]) {
    assert.strictEqual(strokeForDigit(value), null,
      `期望 ${JSON.stringify(value)} 返回 null，实际 ${strokeForDigit(value)}`)
  }
})

test('手动模式应只有三个既有按钮且不含反手推挡', () => {
  const options = optionsFor('manual')
  assert.strictEqual(options.length, 3, `期望 3 个按钮，实际 ${options.length}`)
  assert.deepStrictEqual(options.map((o) => o.key), ['none', 'drive', 'push'],
    `期望既有三键，实际 ${options.map((o) => o.key)}`)
  assert.ok(options.every((o) => typeof o.label === 'string' && o.label.length > 0),
    '期望手动模式每个按钮都有可读中文标签')
  assert.ok(options.every((o) => o.digit === null), '期望手动模式不显示数字键提示')
})

test('动作模式应有四个按钮、中文技术名与数字键提示', () => {
  const options = optionsFor('action')
  assert.strictEqual(options.length, 4, `期望 4 个按钮，实际 ${options.length}`)
  const labels = options.map((o) => o.label)
  assert.deepStrictEqual(labels, ['普通回击', '正手攻球', '搓短', '反手推挡'],
    `期望专业动作名，实际 ${labels}`)
  assert.deepStrictEqual(options.map((o) => o.digit), ['1', '2', '3', '4'],
    '期望四个按钮各带一个数字键')
})

test('未知模式应回退到手动模式的三个按钮', () => {
  for (const mode of [undefined, null, 'expert', 'Action', '__proto__']) {
    assert.strictEqual(optionsFor(mode).length, 3,
      `期望 ${String(mode)} 回退 3 按钮，实际 ${optionsFor(mode).length}`)
  }
})

test('每个动作应有可读中文说明，未知键返回空串', () => {
  for (const key of STROKE_KEYS) {
    assert.ok(strokeHint(key).length >= 6,
      `期望 ${key} 有说明，实际 ${strokeHint(key)}`)
  }
  assert.strictEqual(strokeHint('unknown'), '', '期望未知键返回空串')
  assert.strictEqual(strokeHint('toString'), '', '期望原型键返回空串')
})
