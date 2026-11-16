import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { createAiController, updateAiPaddle } from './ai.js'
import { createPaddle } from './physics.js'

const incoming = () => ({ position: { x: 0.5, y: 1, z: 1 }, velocity: { x: 0, y: 0, z: -3 } })
const stepX = (controller, config = CONFIG) =>
  updateAiPaddle(createPaddle('ai'), incoming(), CONFIG.fixedDt, controller, config).x
const controller = (profile, phase = 0) => ({ time: 0, phase, profile })

test('createAiController 默认档位应为 standard', () => {
  assert.strictEqual(createAiController(() => 0.5).profile, 'standard', '期望默认 standard')
})

test('createAiController 应保留显式指定的档位', () => {
  assert.strictEqual(createAiController(() => 0.5, 'sharp').profile, 'sharp', '期望 sharp')
})

test('sharp 档单步追踪位移应大于 practice 档', () => {
  const sharp = stepX(controller('sharp'))
  const practice = stepX(controller('practice'))
  assert.ok(sharp > practice, `期望 sharp 更快，实际 sharp=${sharp} practice=${practice}`)
})

test('未知档位应回退到 standard 的追踪结果', () => {
  assert.strictEqual(stepX(controller('unknown')), stepX(controller('standard')),
    '期望未知档与 standard 一致')
})

test('控制器缺失 phase 时应按 0 处理', () => {
  const without = updateAiPaddle(createPaddle('ai'), incoming(), CONFIG.fixedDt,
    { time: 0, profile: 'standard' })
  const withZero = updateAiPaddle(createPaddle('ai'), incoming(), CONFIG.fixedDt,
    controller('standard', 0))
  assert.deepStrictEqual(without, withZero, '期望缺失 phase 与 phase=0 完全一致')
})

test('自定义 config 缺少 aiProfiles 时应回退默认档且不产生 NaN', () => {
  const x = stepX(controller('standard'), { ...CONFIG, aiProfiles: undefined })
  const expected = stepX(controller('standard'))
  assert.strictEqual(x, expected, `期望与默认档一致 ${expected}，实际 ${x}；NaN 也会在此失败`)
})

test('三档 speed 应严格单调递增，误差应严格单调递减', () => {
  const { practice, standard, sharp } = CONFIG.aiProfiles
  assert.ok(practice.speed < standard.speed && standard.speed < sharp.speed,
    `期望 speed 单调递增，实际 ${practice.speed} / ${standard.speed} / ${sharp.speed}`)
  assert.ok(practice.errorFast > standard.errorFast && standard.errorFast > sharp.errorFast,
    `期望 errorFast 单调递减，实际 ${practice.errorFast} / ${standard.errorFast} / ${sharp.errorFast}`)
  assert.ok(practice.errorSlow > standard.errorSlow && standard.errorSlow > sharp.errorSlow,
    `期望 errorSlow 单调递减，实际 ${practice.errorSlow} / ${standard.errorSlow} / ${sharp.errorSlow}`)
})

test('standard 档的追踪误差应来自 config 而非硬编码常量', () => {
  const ball = incoming()
  const zeroed = {
    ...CONFIG,
    aiProfiles: {
      ...CONFIG.aiProfiles,
      standard: { ...CONFIG.aiProfiles.standard, errorFast: 0, errorSlow: 0 },
    },
  }
  // dt = 1 让球拍一步走满追踪距离，误差差异才能体现在 x 上。
  const withError = updateAiPaddle(createPaddle('ai'), ball, 1, controller('standard', 0.6)).x
  const withoutError = updateAiPaddle(createPaddle('ai'), ball, 1,
    controller('standard', 0.6), zeroed).x
  assert.notStrictEqual(withError, withoutError,
    `期望改 config 的 standard 误差会改变追踪结果，实际均为 ${withError}`)
  assert.strictEqual(withoutError, ball.position.x,
    `期望误差归零后球拍指向预测落点 ${ball.position.x}，实际 ${withoutError}`)
})

test('未知档在自定义 config 下仍回退到该 config 的 standard', () => {
  const custom = {
    ...CONFIG,
    aiProfiles: { ...CONFIG.aiProfiles, standard: { ...CONFIG.aiProfiles.standard, speed: 0.4 } },
  }
  assert.strictEqual(stepX(controller('unknown'), custom), stepX(controller('standard'), custom),
    '期望未知档与自定义 standard 的追踪结果一致')
})
