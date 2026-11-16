import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { PongEngine } from './PongEngine.js'
import { ServeClock } from './serveClock.js'
import { createSimulation } from './rally.js'

// 「得分后定格」的引擎级行为断言。与 PongEngine.test.js 一样用 Object.create
// 绕过 WebGL / Audio / DOM，只驱动真实状态机；单独成文件以守住单文件 ≤200 行。
const dt = CONFIG.fixedDt
const PAUSE = Math.round(CONFIG.rules.pointPause / dt)
const COUNTDOWN = Math.round(CONFIG.rules.serveDelay / dt)
const POINT = { x: 0.2, y: 0.9, z: 0.4 }

const fakeEngine = (scores = { player: 0, ai: 0 }) => {
  const e = Object.create(PongEngine.prototype)
  e.state = {
    phase: 'playing', scores: { ...scores }, server: 'player', message: '',
    winner: null, muted: false, countdown: 0, tip: '', pending: 'none',
  }
  e.serveClock = new ServeClock()
  e.sim = createSimulation()
  e.view = undefined
  e.running = true
  e.accumulator = 0
  e.pauseRemaining = 0
  e.audio = { play() {} }
  e.trail = { reset() {}, push() {} }
  e.particles = { burst() {}, reset() {} }
  e.input = {
    tick() { e.ticks = (e.ticks || 0) + 1 },
    axes: () => ({ x: 0, y: 0 }),
    intent: () => ({ type: 'none', charge: 0 }),
    clear() {}, clearPending() {}, resetCharge() {}, setPendingIntent() {}, consumeIntent() {},
  }
  e.emitted = []
  e.emit = function emit() {
    this.emitted.push({ phase: this.state.phase, countdown: this.state.countdown })
  }
  return e
}

// 摆出明显的「结束姿态」后判一分；返回得分瞬间的坐标快照。
const scored = (scores) => {
  const e = fakeEngine(scores)
  e.sim.playerPaddle.x = 0.8
  e.sim.aiPaddle.x = -0.7
  e.sim.ball.position = { x: 0.33, y: 1.02, z: 0.66 }
  e.award('player', '没接到球', POINT)
  return {
    e,
    snapshot: {
      playerX: e.sim.playerPaddle.x,
      aiX: e.sim.aiPaddle.x,
      ball: { ...e.sim.ball.position },
    },
  }
}

const advance = (e, steps) => { for (let i = 0; i < steps; i += 1) e.update(dt) }
const toPlaying = (e) => {
  let steps = 0
  while (steps < 1000 && e.state.phase !== 'playing') { e.update(dt); steps += 1 }
  return steps
}
const counts = (e) => e.emitted.map((p) => p.countdown).filter((c, i, a) => c !== a[i - 1])

test('停留时长应落在用户要求的 1 到 2 秒之间', () => {
  assert.ok(CONFIG.rules.pointPause >= 1 && CONFIG.rules.pointPause <= 2,
    `期望 1~2 秒，实际 ${CONFIG.rules.pointPause} 秒`)
})

test('停留期内玩家球拍应一直保持得分瞬间坐标', () => {
  const { e, snapshot } = scored()
  advance(e, PAUSE - 1)
  assert.strictEqual(e.sim.playerPaddle.x, snapshot.playerX,
    `期望 ${snapshot.playerX}，实际 ${e.sim.playerPaddle.x}`)
})

test('停留期内 AI 球拍应一直保持得分瞬间坐标', () => {
  const { e, snapshot } = scored()
  advance(e, PAUSE - 1)
  assert.strictEqual(e.sim.aiPaddle.x, snapshot.aiX,
    `期望 ${snapshot.aiX}，实际 ${e.sim.aiPaddle.x}`)
})

test('停留期内球坐标应保持不变', () => {
  const { e, snapshot } = scored()
  advance(e, PAUSE - 1)
  assert.deepStrictEqual(e.sim.ball.position, snapshot.ball, '期望球定格不移动')
})

test('停留期内不应推进输入蓄力', () => {
  const { e } = scored()
  advance(e, PAUSE - 1)
  assert.strictEqual(e.ticks ?? 0, 0, `期望 0 次输入 tick，实际 ${e.ticks ?? 0}`)
})

test('停留期内下发的所有载荷倒计时都应为 0', () => {
  const { e } = scored()
  advance(e, PAUSE - 1)
  assert.deepStrictEqual(counts(e), [0], `期望无倒数，实际 ${JSON.stringify(counts(e))}`)
})

test('停留归零那一步玩家球拍才回中位', () => {
  const { e } = scored()
  advance(e, PAUSE)
  assert.strictEqual(e.sim.playerPaddle.x, 0, `期望回中位，实际 ${e.sim.playerPaddle.x}`)
})

test('停留归零那一步 AI 球拍才回中位', () => {
  const { e } = scored()
  advance(e, PAUSE)
  assert.strictEqual(e.sim.aiPaddle.x, 0, `期望回中位，实际 ${e.sim.aiPaddle.x}`)
})

test('停留归零后应从 3 开始倒数', () => {
  const { e } = scored()
  advance(e, PAUSE)
  assert.strictEqual(counts(e).at(-1), 3, `期望下发 3，实际 ${JSON.stringify(counts(e))}`)
})

test('回置只发生在到期那一步，不应重复回置', () => {
  const { e } = scored()
  advance(e, PAUSE)
  e.sim.playerPaddle.x = 0.55
  advance(e, 10)
  assert.strictEqual(e.sim.playerPaddle.x, 0.55,
    `期望倒数期不再重置球拍，实际 ${e.sim.playerPaddle.x}`)
})

test('停留结束后倒数仍应依次显示 3、2、1、0', () => {
  const { e } = scored()
  toPlaying(e)
  assert.deepStrictEqual(counts(e), [0, 3, 2, 1, 0],
    `期望定格 0 → 3→2→1→0，实际 ${JSON.stringify(counts(e))}`)
})

test('每球间隔应约为停留加倒数的合计步数', () => {
  const { e } = scored()
  const steps = toPlaying(e)
  const expected = PAUSE + COUNTDOWN
  assert.ok(Math.abs(steps - expected) <= 5,
    `期望 ${expected} ±5 步后开球，实际 ${steps} 步（phase=${e.state.phase}）`)
})

test('决出胜负时球拍仍应立即回置', () => {
  const { e } = scored({ player: 10, ai: 9 })
  assert.strictEqual(e.sim.playerPaddle.x, 0, '期望终局立即归位')
})

test('决出胜负时不应启动停留计时', () => {
  const { e } = scored({ player: 10, ai: 9 })
  assert.strictEqual(e.pauseRemaining, 0, '期望终局无停留')
})

test('restart 在停留中应清零停留计时', () => {
  const { e } = scored()
  e.restart()
  assert.strictEqual(e.pauseRemaining, 0, '期望停留计时清零')
})

test('restart 后应立刻从 3 开始倒数而不等停留', () => {
  const { e } = scored()
  e.restart()
  assert.strictEqual(e.state.countdown, 3, `期望倒数 3，实际 ${e.state.countdown}`)
})

test('非有限 dt 后仍应能走完倒数并自动发球', () => {
  const { e } = scored()
  e.update(Number.NaN)
  toPlaying(e)
  assert.strictEqual(e.state.phase, 'playing', '期望坏 dt 后未卡死')
})
