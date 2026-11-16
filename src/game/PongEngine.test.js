import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG } from './config.js'
import { PongEngine } from './PongEngine.js'
import { ServeClock } from './serveClock.js'
import { createSimulation } from './rally.js'
import { createRally } from './physics.js'

// 用 Object.create 绕过构造函数里的 WebGL / AudioContext / DOM 依赖，
// 只驱动真实的状态机方法，验证倒数、击球与得分后的定格行为。
const fakeEngine = (phase = 'serving', overrides = {}) => {
  const engine = Object.create(PongEngine.prototype)
  const emitted = []
  engine.state = {
    phase,
    scores: { player: 0, ai: 0 },
    server: 'player',
    message: '新的一局开始，准备发球',
    winner: null,
    muted: false, countdown: 0, tip: '', pending: 'none',
  }
  engine.serveClock = new ServeClock()
  engine.sim = createSimulation()
  engine.view = undefined
  engine.running = true
  engine.accumulator = 0
  engine.pauseRemaining = 0
  engine.audio = { play() {} }
  engine.trail = { reset() {}, push() {} }
  engine.particles = { burst() {}, reset() {} }
  engine.input = {
    axes: () => ({ x: 1, y: 1 }),
    tick() { engine.input.ticks = (engine.input.ticks || 0) + 1 },
    intent: () => overrides.intent ?? { type: 'none', charge: 0 },
    clear() {}, resetCharge() {},
    setPendingIntent() {}, consumeIntent() {}, clearPending() {},
  }
  engine.emitted = emitted
  engine.emit = function emit() {
    emitted.push({
      phase: this.state.phase,
      countdown: this.state.countdown,
      scores: { ...this.state.scores },
      tip: this.state.tip,
    })
  }
  return engine
}

const startCountdown = (e) => { e.state.countdown = e.serveClock.reset(); e.emit() }

// 把 sim 摆成「本固定步必然被指定一侧球拍击中」的状态。
const arm = (engine, side) => {
  const z = side === 'player' ? CONFIG.paddle.playerZ : CONFIG.paddle.aiZ
  engine.sim.ball = { position: { x: 0, y: 0.98, z }, velocity: { x: 0, y: 0, z: side === 'player' ? 3.3 : -3.3 }, spin: 0 }
  engine.sim.rally = createRally(side === 'player' ? 'ai' : 'player')
  engine.sim.ai = { time: 0, phase: 0, profile: 'standard' }
}

test('玩家命中后应按意图更新技术提示', () => {
  const e = fakeEngine('playing', { intent: { type: 'drive', charge: 0.9 } }); arm(e, 'player')
  e.update(CONFIG.fixedDt)
  assert.strictEqual(e.state.tip, '蓄力弧圈 · 上旋让球下坠更快', `期望弧圈提示，实际 ${e.state.tip}`)
})

test('AI 命中不应更新技术提示', () => {
  const e = fakeEngine('playing', { intent: { type: 'drive', charge: 1 } }); e.state.tip = '已有提示'
  arm(e, 'ai'); e.update(CONFIG.fixedDt)
  assert.strictEqual(e.state.tip, '已有提示', `期望提示保持不变，实际 ${e.state.tip}`)
})

test('玩家命中时仍应播放 hit 音效', () => {
  const e = fakeEngine('playing'); const played = []; e.audio = { play: (k) => played.push(k) }
  arm(e, 'player'); e.update(CONFIG.fixedDt)
  assert.deepStrictEqual(played, ['hit'], `期望只播放 hit，实际 ${JSON.stringify(played)}`)
})

test('serve 应清空技术提示', () => {
  const e = fakeEngine('serving'); e.state.tip = '旧提示'; e.serve()
  assert.strictEqual(e.state.tip, '', `期望空提示，实际 ${e.state.tip}`)
})

test('award 应清空技术提示', () => {
  const e = fakeEngine('playing'); e.state.tip = '旧提示'
  e.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(e.state.tip, '', `期望空提示，实际 ${e.state.tip}`)
})

test('serving 分支不应推进蓄力', () => {
  const e = fakeEngine('serving'); startCountdown(e)
  for (let i = 0; i < 10; i += 1) e.update(CONFIG.fixedDt)
  assert.strictEqual(e.input.ticks ?? 0, 0, `期望 0 次 tick，实际 ${e.input.ticks ?? 0}`)
})

test('emit 载荷应包含 countdown 字段', () => {
  const engine = fakeEngine()
  startCountdown(engine)
  assert.strictEqual(engine.emitted[0].countdown, 3, '期望下发倒计时数值')
})

test('开球倒数应依次下发 3、2、1、0', () => {
  const engine = fakeEngine()
  startCountdown(engine)
  for (let i = 0; i < 400 && engine.state.phase === 'serving'; i += 1) {
    engine.update(CONFIG.fixedDt)
  }
  assert.deepStrictEqual(
    engine.emitted.map((item) => item.countdown),
    [3, 2, 1, 0],
    '期望 3→2→1 后开球时归零',
  )
})

test('倒数应在约 3 秒后自动开球', () => {
  const engine = fakeEngine()
  startCountdown(engine)
  let steps = 0
  while (steps < 400 && engine.state.phase === 'serving') {
    engine.update(CONFIG.fixedDt)
    steps += 1
  }
  assert.strictEqual(engine.state.phase, 'playing', '期望进入对打阶段')
  assert.ok(steps >= 355 && steps <= 365, `期望约 360 个子步，实际 ${steps}`)
})

test('倒数期间玩家球拍应保持中位', () => {
  const engine = fakeEngine()
  startCountdown(engine)
  for (let i = 0; i < 100; i += 1) engine.update(CONFIG.fixedDt)
  assert.strictEqual(engine.sim.playerPaddle.x, 0, '期望按住方向键也无法移动球拍')
})

test('倒数期间 AI 球拍应保持中位', () => {
  const engine = fakeEngine()
  startCountdown(engine)
  for (let i = 0; i < 100; i += 1) engine.update(CONFIG.fixedDt)
  assert.strictEqual(engine.sim.aiPaddle.x, 0, '期望 AI 追踪在倒数期间不执行')
})

test('得分瞬间玩家球拍应保持结束姿态而非瞬时归位', () => {
  const engine = fakeEngine('playing')
  engine.sim.playerPaddle.x = 0.8
  engine.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(engine.sim.playerPaddle.x, 0.8, `期望定格在 0.8，实际 ${engine.sim.playerPaddle.x}`)
})

test('得分瞬间 AI 球拍应保持结束姿态而非瞬时归位', () => {
  const engine = fakeEngine('playing')
  engine.sim.aiPaddle.x = -0.7
  engine.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(engine.sim.aiPaddle.x, -0.7, `期望定格在 -0.7，实际 ${engine.sim.aiPaddle.x}`)
})

test('每分结束后应停留在发球阶段（先定格再倒数）', () => {
  const engine = fakeEngine('playing')
  engine.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(engine.state.phase, 'serving', '期望回到发球阶段')
})

test('得分后定格期间下发的倒计时应为 0', () => {
  const engine = fakeEngine('playing')
  engine.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(engine.state.countdown, 0, `期望定格期不显示倒数，实际 ${engine.state.countdown}`)
})

test('决出胜负时不应显示倒数', () => {
  const engine = fakeEngine('playing')
  engine.state.scores = { player: 10, ai: 9 }
  engine.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(engine.state.countdown, 0, '期望胜负界面倒数归零')
})

test('决出胜负后进入 gameover 且球拍仍归位', () => {
  const engine = fakeEngine('playing')
  engine.state.scores = { player: 10, ai: 9 }
  engine.sim.playerPaddle.x = 0.6
  engine.award('player', '没接到球', { x: 0.2, y: 0.9, z: 0.4 })
  assert.strictEqual(engine.sim.playerPaddle.x, 0, '期望最后一分也归位')
})

test('restart 应清空比分并从 3 秒倒数开始', () => {
  const engine = fakeEngine('gameover')
  engine.state.scores = { player: 11, ai: 9 }
  engine.restart()
  assert.strictEqual(engine.state.countdown, 3, '期望再来一局也显示倒数')
})

test('serve 应把倒计时归零', () => {
  const engine = fakeEngine()
  startCountdown(engine)
  let steps = 0
  while (steps < 400 && engine.state.phase === 'serving') {
    engine.update(CONFIG.fixedDt)
    steps += 1
  }
  assert.strictEqual(engine.state.countdown, 0, '期望开球后不再显示倒数')
})
