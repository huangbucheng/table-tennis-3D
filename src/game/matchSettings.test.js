import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MESSAGES, AI_LEVEL_KEYS, DEFAULT_AI_LEVEL,
  normalizeAiLevel, createMatchSettings, applyAiLevel,
} from './matchSettings.js'

test('默认档位应为 standard 且在允许列表内', () => {
  assert.strictEqual(DEFAULT_AI_LEVEL, 'standard',
    `期望默认档 standard，实际 ${DEFAULT_AI_LEVEL}`)
  assert.ok(AI_LEVEL_KEYS.includes(DEFAULT_AI_LEVEL),
    `期望默认档在允许列表 ${AI_LEVEL_KEYS} 内`)
})

test('三档合法值应原样返回', () => {
  for (const key of AI_LEVEL_KEYS) {
    assert.strictEqual(normalizeAiLevel(key), key,
      `期望 ${key} 原样返回，实际 ${normalizeAiLevel(key)}`)
  }
})

test('空值与非法类型应回退 standard', () => {
  for (const value of [undefined, null, 0, 1, {}, [], true, NaN]) {
    assert.strictEqual(normalizeAiLevel(value), 'standard',
      `期望 ${String(value)} 回退 standard，实际 ${normalizeAiLevel(value)}`)
  }
})

test('未知字符串、大小写不符与原型键应回退 standard', () => {
  const bad = ['', 'expert', 'Standard', 'STANDARD', 'constructor',
    'toString', '__proto__', ' standard ']
  for (const value of bad) {
    assert.strictEqual(normalizeAiLevel(value), 'standard',
      `期望 ${JSON.stringify(value)} 回退 standard，实际 ${normalizeAiLevel(value)}`)
  }
})

test('createMatchSettings 两次调用不应共享可变状态', () => {
  const a = createMatchSettings()
  const b = createMatchSettings()
  assert.strictEqual(a.aiLevel, 'standard',
    `期望初始档 standard，实际 ${a.aiLevel}`)
  a.aiLevel = 'sharp'
  assert.strictEqual(b.aiLevel, 'standard',
    `期望改 a 不影响 b，实际 b=${b.aiLevel}`)
})

test('applyAiLevel 应写入归一化档位并保留控制器原有状态', () => {
  const sim = { ai: { profile: 'standard', time: 3.5, phase: 1.2 } }
  const returned = applyAiLevel(sim, 'sharp')
  assert.strictEqual(returned, 'sharp',
    `期望返回 sharp，实际 ${returned}`)
  assert.strictEqual(sim.ai.profile, 'sharp',
    `期望写入 sharp，实际 ${sim.ai.profile}`)
  assert.strictEqual(sim.ai.time, 3.5, '期望不重建控制器，计时不被清零')
  assert.strictEqual(sim.ai.phase, 1.2, '期望不重建控制器，相位不被重置')
})

test('applyAiLevel 遇非法档位应写回 standard', () => {
  const sim = { ai: { profile: 'sharp' } }
  assert.strictEqual(applyAiLevel(sim, 'unknown'), 'standard',
    '期望非法档返回 standard')
  assert.strictEqual(sim.ai.profile, 'standard',
    `期望非法档写回 standard，实际 ${sim.ai.profile}`)
})

test('applyAiLevel 模拟未就绪时应返回 null 且不抛异常', () => {
  for (const sim of [undefined, null, {}, { ai: null }]) {
    const returned = applyAiLevel(sim, 'sharp')
    assert.strictEqual(returned, null,
      `期望未就绪的 sim 返回 null，实际 ${returned}`)
  }
})

test('MESSAGES 两种兜底应是可读中文且不含占位符', () => {
  for (const key of ['webgl', 'runtime']) {
    assert.ok(MESSAGES[key]?.length > 8,
      `期望 ${key} 有可读中文兜底，实际 ${MESSAGES[key]}`)
  }
  const text = Object.values(MESSAGES).join('')
  assert.ok(!/TODO|TBD|undefined|Error:|堆栈/.test(text),
    `期望兜底文案不含占位符或堆栈信息，实际 ${text}`)
})
