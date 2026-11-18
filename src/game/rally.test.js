import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG, INTENT_NONE } from './config.js'
import { createAiController, updateAiPaddle } from './ai.js'
import { createPaddle, createRally } from './physics.js'
import { advanceSimulation, createSimulation, prepareServe, resetSimulation } from './rally.js'

// 每个用例都从一份「上一球结束后的脏状态」出发，彼此不共享可变对象。
const dirtySim = () => {
  const sim = createSimulation()
  sim.playerPaddle.x = 0.7
  sim.playerPaddle.y = 1.3
  sim.aiPaddle.x = -0.6
  sim.aiPaddle.y = 0.8
  sim.rally.active = true
  sim.rally.bounceCount = 2
  sim.ball.position.x = 0.42
  sim.ai.time = 12
  return sim
}

test('prepareServe 应把玩家球拍 x 归位到 0', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.playerPaddle.x, 0, '期望玩家球拍 x 为 0')
})

test('prepareServe 应把玩家球拍 y 归位到 0.98', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.playerPaddle.y, 0.98, '期望玩家球拍 y 为 0.98')
})

test('prepareServe 应把 AI 球拍 x 归位到 0', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.aiPaddle.x, 0, '期望 AI 球拍 x 为 0')
})

test('prepareServe 应把球拍放回各自默认 z 平面', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.playerPaddle.z, CONFIG.paddle.playerZ, '期望玩家球拍在近端平面')
})

test('prepareServe 后 rally 应为非活动', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.rally.active, false, '期望倒数期间 rally 不参与判罚')
})

test('prepareServe 后球不应带随机横向偏移', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.ball.position.x, 0, '期望确定性待发球 x 为 0')
})

test('prepareServe 后球应停在待发 z 平面', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(
    Math.abs(sim.ball.position.z),
    CONFIG.ball.serveZ,
    '期望球停在 serveZ 平面',
  )
})

test('prepareServe 切换发球方时待发 z 应反向', () => {
  const byPlayer = prepareServe(createSimulation(), 'player').ball.position.z
  const byAi = prepareServe(createSimulation(), 'ai').ball.position.z
  assert.strictEqual(byAi, -byPlayer, '期望两侧待发位置互为相反数')
})

test('prepareServe 应把 AI 控制器时间归零', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.strictEqual(sim.ai.time, 0, '期望 AI 追踪误差从起点重新累积')
})

test('prepareServe 应就地返回同一个 sim 对象', () => {
  const sim = dirtySim()
  assert.strictEqual(prepareServe(sim, 'player'), sim, '期望返回原 sim 引用')
})

test('resetSimulation 应复用归位并把球拍放回中位', () => {
  const sim = dirtySim()
  resetSimulation(sim)
  assert.strictEqual(sim.playerPaddle.x, 0, '期望玩家球拍 x 为 0')
})

test('resetSimulation 应复用归位并把 rally 置为非活动', () => {
  const sim = dirtySim()
  resetSimulation(sim)
  assert.strictEqual(sim.rally.active, false, '期望 rally 非活动')
})

test('createSimulation 的初始状态应为归位后的非活动状态', () => {
  const sim = createSimulation()
  assert.strictEqual(sim.playerPaddle.y, 0.98, '期望初始球拍在默认高度')
})

test('createAiController 的时间应从 0 开始', () => {
  assert.strictEqual(createAiController(() => 0).time, 0, '期望 time 为 0')
})

test('createAiController 应把注入的随机源映射为 2π 相位', () => {
  assert.strictEqual(createAiController(() => 0.5).phase, Math.PI, '期望 phase 为 π')
})

test('prepareServe 后 AI 相位应在 [0, 2π) 内', () => {
  const sim = dirtySim()
  prepareServe(sim, 'player')
  assert.ok(
    sim.ai.phase >= 0 && sim.ai.phase < Math.PI * 2,
    `期望 phase 在 [0, 2π)，实际 ${sim.ai.phase}`,
  )
})

test('不同相位的 AI 应收敛到不同目标 x', () => {
  const ball = { position: { x: 0, y: 1, z: 1 }, velocity: { x: 0, y: 0, z: -3 } }
  const converge = (phase) => {
    const controller = { time: 0, phase }
    let paddle = createPaddle('ai')
    for (let i = 0; i < 120; i += 1) {
      paddle = updateAiPaddle(paddle, ball, CONFIG.fixedDt, controller)
    }
    return paddle.x
  }
  assert.ok(
    Math.abs(converge(0) - converge(Math.PI)) > 1e-4,
    '期望相位不同则追踪目标不同',
  )
})

test('updateAiPaddle 对缺失 phase 的控制器应回退到 0', () => {
  const controller = { time: 0 }
  const ball = { position: { x: 0, y: 1, z: 1 }, velocity: { x: 0, y: 0, z: -3 } }
  const paddle = updateAiPaddle(createPaddle('ai'), ball, CONFIG.fixedDt, controller)
  assert.ok(Number.isFinite(paddle.x), '期望缺失 phase 时不产生 NaN')
})

// 把 sim 摆成「本固定步必然被指定一侧球拍击中」的状态。
const armed = (side) => {
  const sim = createSimulation()
  const z = side === 'player' ? CONFIG.paddle.playerZ : CONFIG.paddle.aiZ
  sim.ball = { position: { x: 0, y: 0.98, z }, velocity: { x: 0, y: 0, z: side === 'player' ? 3.3 : -3.3 }, spin: 0 }
  sim.rally = createRally(side === 'player' ? 'ai' : 'player')
  sim.ai = { time: 0, phase: 0, profile: 'standard' }
  return sim
}

test('prepareServe 后待发球应无旋', () => {
  assert.strictEqual(prepareServe(createSimulation(), 'player').ball.spin, 0, '期望 spin 为 0')
})

test('prepareServe 后 AI 控制器应为 standard 档', () => {
  assert.strictEqual(prepareServe(createSimulation(), 'player').ai.profile, 'standard', '期望 standard')
})

test('玩家命中应把 drive 意图写入回球旋转', () => {
  const sim = armed('player')
  advanceSimulation(sim, CONFIG.fixedDt, { x: 0, y: 0 }, {}, { type: 'drive', charge: 1 })
  assert.ok(sim.ball.spin > 0.9, `期望回球带强上旋，实际 ${sim.ball.spin}`)
})

test('AI 命中回球应无旋', () => {
  const sim = armed('ai')
  advanceSimulation(sim, CONFIG.fixedDt, { x: 0, y: 0 }, {}, { type: 'drive', charge: 1 })
  assert.strictEqual(sim.ball.spin, 0, '期望 AI 回球 spin 为 0')
})

test('玩家命中时 onHit 应收到 side 与传入的 intent', () => {
  const calls = []
  const intent = { type: 'push', charge: 0 }
  advanceSimulation(armed('player'), CONFIG.fixedDt, { x: 0, y: 0 },
    { onHit: (side, hit) => calls.push({ side, intent: hit }) }, intent)
  assert.deepStrictEqual(calls, [{ side: 'player', intent }], '期望透传 player 与 push 意图')
})

test('AI 命中时 onHit 应收到 INTENT_NONE', () => {
  const calls = []
  advanceSimulation(armed('ai'), CONFIG.fixedDt, { x: 0, y: 0 },
    { onHit: (side, hit) => calls.push({ side, intent: hit }) }, { type: 'drive', charge: 1 })
  assert.deepStrictEqual(calls, [{ side: 'ai', intent: INTENT_NONE }], '期望 AI 侧为无意图')
})

test('不传 hooks 的 advanceSimulation 仍应正常推进', () => {
  assert.doesNotThrow(() => advanceSimulation(armed('player'), CONFIG.fixedDt, { x: 0, y: 0 }),
    '期望缺省 hooks 不抛错')
})

test('options.speed 应覆盖手动步速，缺省时与既有行为逐位一致', () => {
  const dt = 0.1, axes = { x: 1, y: 0 }
  const base = createSimulation(), plain = createSimulation(), fast = createSimulation()
  advanceSimulation(base, dt, axes)
  advanceSimulation(plain, dt, axes, {}, INTENT_NONE, {})
  advanceSimulation(fast, dt, axes, {}, INTENT_NONE, { speed: CONFIG.autoPaddle.speed })
  assert.strictEqual(plain.playerPaddle.x, base.playerPaddle.x, '期望缺省行为不变')
  assert.ok(Math.abs(fast.playerPaddle.x - CONFIG.autoPaddle.speed * dt) < 1e-9, '期望按传入步速移动')
})
