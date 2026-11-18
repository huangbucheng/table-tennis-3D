import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { PongEngine } from './PongEngine.js'
import { ServeClock } from './serveClock.js'
import { createSimulation } from './rally.js'
import { sessionPayload } from './session.js'

// 动作模式的引擎级断言。与既有引擎测试一样用 Object.create 绕过 WebGL / Audio / DOM，
// 只驱动真实状态机；单独成文件以守住单文件 ≤200 行。
const dt = CONFIG.fixedDt

const incoming = () => ({
  position: { x: 0.8, y: 1, z: -0.6 },
  velocity: { x: 0, y: 0, z: 3.4 },
  spin: 0,
})

const fakeEngine = (mode = 'manual') => {
  const e = Object.create(PongEngine.prototype)
  e.state = {
    phase: 'playing', scores: { player: 0, ai: 0 }, server: 'player', message: '',
    winner: null, muted: false, countdown: 0, tip: '', pending: 'none',
  }
  e.serveClock = new ServeClock()
  e.sim = createSimulation()
  e.sim.ball = incoming()
  e.view = undefined
  e.callbacks = {}
  e.running = true
  e.failed = false
  e.playMode = mode
  e.accumulator = 0
  e.pauseRemaining = 0
  e.audio = { play() {} }
  e.trail = { reset() {}, push() {} }
  e.particles = { burst() {}, reset() {} }
  e.pendingCalls = []
  e.emitted = []
  e.input = {
    tick() {},
    axes: () => ({ x: 1, y: 0 }),
    intent: () => ({ type: 'none', charge: 0 }),
    clear() {}, clearPending() {}, resetCharge() {}, consumeIntent() {},
    setPendingIntent(type) { e.pendingCalls.push(type) },
  }
  e.emit = function emit() {
    this.emitted.push(sessionPayload(this.state))
  }
  return e
}

test('setPlayMode 应归一化模式并清空待发动作', () => {
  const e = fakeEngine()
  e.state.pending = 'drive'
  assert.strictEqual(e.setPlayMode('action'), 'action', '期望返回 action')
  assert.strictEqual(e.playMode, 'action', '期望引擎切到动作模式')
  assert.strictEqual(e.state.pending, 'none', '期望待发动作复位')
  assert.deepStrictEqual(e.pendingCalls, ['none'], '期望清空输入层单槽')
  assert.strictEqual(e.emitted.length, 1, '期望下发一次状态')
})

test('setPlayMode 遇非法值应回退 manual', () => {
  const e = fakeEngine('action')
  for (const value of [undefined, null, 'expert', 'Action', '__proto__']) {
    assert.strictEqual(e.setPlayMode(value), 'manual',
      `期望 ${String(value)} 回退 manual，实际 ${e.setPlayMode(value)}`)
  }
  assert.strictEqual(e.playMode, 'manual')
})

test('引擎失败时 setPlayMode 应返回 null 且不改模式', () => {
  const e = fakeEngine('action')
  e.failed = true
  assert.strictEqual(e.setPlayMode('manual'), null, '期望失败态返回 null')
  assert.strictEqual(e.playMode, 'action', '期望失败态不改模式')
  assert.strictEqual(e.emitted.length, 0, '期望失败态不下发状态')
})

test('selectIntent 应接受新增的 block 动作', () => {
  const e = fakeEngine()
  e.selectIntent('block')
  assert.strictEqual(e.state.pending, 'block', '期望写入 block')
  assert.deepStrictEqual(e.pendingCalls, ['block'], '期望写入输入层单槽')
})

test('selectIntent 遇非法键应静默忽略，不产生状态变化', () => {
  const e = fakeEngine()
  for (const value of [undefined, 'loop', 'Block', 'constructor', 4]) {
    e.selectIntent(value)
    assert.strictEqual(e.state.pending, 'none', `期望 ${String(value)} 被忽略`)
  }
  assert.strictEqual(e.emitted.length, 0, '期望非法键不触发下发')
})

test('restart 应保留动作模式并把待发动作复位', () => {
  const e = fakeEngine('action')
  e.state.pending = 'push'
  e.restart()
  assert.strictEqual(e.playMode, 'action', '期望重开后仍是动作模式')
  assert.strictEqual(e.state.pending, 'none', '期望待发动作复位')
  assert.strictEqual(e.state.phase, 'serving', '期望回到发球阶段')
})

test('sessionPayload 仍是九个字段且不含模式状态', () => {
  const e = fakeEngine('action')
  const payload = sessionPayload(e.state)
  assert.strictEqual(Object.keys(payload).length, 9,
    `期望九个字段，实际 ${Object.keys(payload)}`)
  assert.ok(!Object.hasOwn(payload, 'playMode'), '期望模式状态不进 payload')
})

test('手动模式应沿用 3.2 步速，动作模式应使用专用追球步速', () => {
  const manual = fakeEngine('manual')
  const action = fakeEngine('action')
  manual.update(dt)
  action.update(dt)
  assert.ok(Math.abs(manual.sim.playerPaddle.x - CONFIG.paddle.playerSpeed * dt) < 1e-9,
    `期望手动步速 ${CONFIG.paddle.playerSpeed}，实际 ${manual.sim.playerPaddle.x}`)
  assert.ok(Math.abs(action.sim.playerPaddle.x - CONFIG.autoPaddle.speed * dt) < 1e-9,
    `期望自动步速 ${CONFIG.autoPaddle.speed}，实际 ${action.sim.playerPaddle.x}`)
  assert.ok(action.sim.playerPaddle.x > manual.sim.playerPaddle.x,
    '期望动作模式球拍移动更快')
})

test('动作模式不应读取手动输入轴，球拍朝预测落点移动', () => {
  const e = fakeEngine('action')
  e.input.axes = () => ({ x: -1, y: 0 })
  e.update(dt)
  assert.ok(e.sim.playerPaddle.x > 0,
    `期望球拍向正 x 的预测落点移动，实际 ${e.sim.playerPaddle.x}`)
})
