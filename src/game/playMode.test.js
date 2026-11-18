import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { PLAY_MODES, normalizePlayMode, isActionMode, controlFor } from './playMode.js'
import { autoAxes } from './autoPaddle.js'

const fakeInput = (calls) => ({
  axes() {
    calls.push('axes')
    return { x: 0.75, y: -0.5 }
  },
  intent() {
    calls.push('intent')
    return { type: 'push', charge: 0 }
  },
})

const sim = () => ({
  playerPaddle: { x: 0, y: 0.98, z: CONFIG.paddle.playerZ, vx: 0, vy: 0 },
  ball: {
    position: { x: 0.5, y: 1.05, z: -0.6 },
    velocity: { x: 0.3, y: 0, z: 3.4 },
    spin: 0,
  },
})

test('应恰好有两种玩法模式且默认 manual 在允许列表内', () => {
  assert.deepStrictEqual(PLAY_MODES.map((m) => m.key), ['manual', 'action'],
    `期望两种模式，实际 ${PLAY_MODES.map((m) => m.key)}`)
  assert.ok(PLAY_MODES.every((m) => m.label.length > 0 && m.detail.length > 8),
    '期望每种模式都有可读中文名称与说明')
})

test('合法模式应原样返回', () => {
  assert.strictEqual(normalizePlayMode('manual'), 'manual')
  assert.strictEqual(normalizePlayMode('action'), 'action')
  assert.strictEqual(isActionMode('action'), true)
  assert.strictEqual(isActionMode('manual'), false)
})

test('空值、非法类型、未知字符串与原型键应回退 manual', () => {
  const bad = [undefined, null, 0, 1, {}, [], true, NaN, '', 'expert',
    'Action', 'constructor', 'toString', '__proto__', ' action ']
  for (const value of bad) {
    assert.strictEqual(normalizePlayMode(value), 'manual',
      `期望 ${JSON.stringify(value)} 回退 manual，实际 ${normalizePlayMode(value)}`)
    assert.strictEqual(isActionMode(value), false,
      `期望 ${JSON.stringify(value)} 不是动作模式`)
  }
})

test('手动模式应沿用输入轴与既有球拍步速', () => {
  const calls = []
  const result = controlFor('manual', sim(), fakeInput(calls), CONFIG)
  assert.deepStrictEqual(result.axes, { x: 0.75, y: -0.5 },
    `期望 axes 来自输入层，实际 ${JSON.stringify(result.axes)}`)
  assert.strictEqual(result.speed, CONFIG.paddle.playerSpeed,
    `期望步速 ${CONFIG.paddle.playerSpeed}，实际 ${result.speed}`)
  assert.deepStrictEqual(result.intent, { type: 'push', charge: 0 },
    '期望意图来自输入层')
  assert.ok(calls.includes('axes'), '期望手动模式确实读取了输入轴')
})

test('动作模式应改用自动追球轴与专用步速，不再读取手动输入轴', () => {
  const calls = []
  const state = sim()
  const result = controlFor('action', state, fakeInput(calls), CONFIG)
  assert.deepStrictEqual(result.axes, autoAxes(state.playerPaddle, state.ball, CONFIG),
    `期望自动追球轴，实际 ${JSON.stringify(result.axes)}`)
  assert.notDeepStrictEqual(result.axes, { x: 0.75, y: -0.5 },
    '期望动作模式不返回手动输入轴')
  assert.strictEqual(result.speed, CONFIG.autoPaddle.speed,
    `期望步速 ${CONFIG.autoPaddle.speed}，实际 ${result.speed}`)
  assert.deepStrictEqual(result.intent, { type: 'push', charge: 0 },
    '期望意图仍来自输入层单槽')
  assert.ok(!calls.includes('axes'), '期望动作模式不调用 input.axes()')
})

test('两种模式的步速应不同，且手动模式仍为迭代 14 的 3.2', () => {
  assert.strictEqual(CONFIG.paddle.playerSpeed, 3.2,
    `期望既有步速 3.2 不变，实际 ${CONFIG.paddle.playerSpeed}`)
  assert.ok(CONFIG.autoPaddle.speed > CONFIG.paddle.playerSpeed,
    '期望自动追球步速高于手动步速，给快球留余量')
})

test('未知模式应按手动模式处理，不切换控制来源', () => {
  const calls = []
  const result = controlFor('unknown', sim(), fakeInput(calls), CONFIG)
  assert.deepStrictEqual(result.axes, { x: 0.75, y: -0.5 },
    `期望回退手动轴，实际 ${JSON.stringify(result.axes)}`)
  assert.strictEqual(result.speed, CONFIG.paddle.playerSpeed,
    '期望回退既有步速')
})

test('模拟未就绪时动作模式仍应返回有界轴向量', () => {
  const result = controlFor('action', {}, fakeInput([]), CONFIG)
  for (const key of ['x', 'y']) {
    assert.ok(Number.isFinite(result.axes[key]) && result.axes[key] >= -1 && result.axes[key] <= 1,
      `期望 ${key} 为有界数值，实际 ${result.axes[key]}`)
  }
})
