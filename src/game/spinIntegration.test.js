import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG, INTENT_NONE } from './config.js'
import { createBall, createPaddle, createRally, judgeRally, returnBall, stepBall } from './physics.js'

const NET_TOP = CONFIG.table.height + CONFIG.table.netHeight + CONFIG.ball.radius

// 用真实 returnBall + stepBall 走完一次出球到首次落台，收集过网与落点证据。
const flight = (intent, startY = 0.95) => {
  const incoming = {
    position: { x: 0, y: startY, z: CONFIG.ball.serveZ },
    velocity: { x: 0, y: CONFIG.ball.returnVy, z: -(CONFIG.ball.returnVzBase + 0.5 * CONFIG.ball.returnVzRange) },
  }
  const out = returnBall(incoming, createPaddle('player'), 'player', () => 0.5, CONFIG, intent)
  let state = { ball: out, rally: createRally('player') }
  let crossY = null
  let first = null
  let foul = null
  for (let i = 0; i < 600; i++) {
    const next = stepBall(state, CONFIG.fixedDt)
    for (const event of next.events) {
      if (event.type === 'netCross' && crossY === null) crossY = event.y
      if (event.type === 'tableBounce' && first === null) {
        first = { side: event.side, outside: event.outside }
      }
    }
    const judged = judgeRally(next, state)
    if (judged) { foul = judged.reason; break }
    state = { ball: next.ball, rally: next.rally }
    if (first) break
  }
  return { out, crossY, first, foul }
}

test('双方 createBall 都应带 spin: 0', () => {
  assert.deepStrictEqual(
    [createBall('player', () => 0.5).spin, createBall('ai', () => 0.5).spin],
    [0, 0], '期望发球无旋',
  )
})

test('spin = 0 时含 spin 与不含 spin 的球夹具应给出完全相同的 stepBall 结果', () => {
  const base = { position: { x: 0, y: 1, z: 0.5 }, velocity: { x: 0, y: 0, z: -3.45 } }
  const withSpin = stepBall({ ball: { ...base, spin: 0 }, rally: createRally('player') }, CONFIG.fixedDt)
  const withoutSpin = stepBall({ ball: base, rally: createRally('player') }, CONFIG.fixedDt)
  assert.deepStrictEqual(withSpin, withoutSpin, '期望无旋球不引入任何数值差异')
})

test('INTENT_NONE 的 returnBall 应与不传 intent 完全一致', () => {
  const incoming = { position: { x: 0, y: 1, z: 1.25 }, velocity: { x: 0.2, y: -0.5, z: 3.3 } }
  const paddle = createPaddle('player')
  assert.deepStrictEqual(
    returnBall(incoming, paddle, 'player', () => 0.5, CONFIG, INTENT_NONE),
    returnBall(incoming, paddle, 'player', () => 0.5, CONFIG),
    '期望默认参数与显式 none 一致',
  )
})

test('满蓄力 drive 出球应写入上旋 1', () => {
  assert.strictEqual(flight({ type: 'drive', charge: 1 }).out.spin, 1, '期望满蓄力上旋为 1')
})

test('满蓄力 drive 出球应比普通回击更快', () => {
  const drive = flight({ type: 'drive', charge: 1 }).out
  const plain = flight(INTENT_NONE).out
  assert.ok(Math.abs(drive.velocity.z) > Math.abs(plain.velocity.z),
    `期望攻球更快，实际 drive=${drive.velocity.z} none=${plain.velocity.z}`)
})

test('push 出球应写入负向下旋', () => {
  assert.ok(flight({ type: 'push', charge: 0 }).out.spin < 0, '期望下旋为负')
})

test('push 出球应比普通回击更慢', () => {
  const push = flight({ type: 'push', charge: 0 }).out
  const plain = flight(INTENT_NONE).out
  assert.ok(Math.abs(push.velocity.z) < Math.abs(plain.velocity.z),
    `期望搓短更慢，实际 push=${push.velocity.z} none=${plain.velocity.z}`)
})

test('满蓄力 drive 应过网且高度不低于网顶', () => {
  const { crossY, foul } = flight({ type: 'drive', charge: 1 })
  assert.ok(crossY !== null && crossY >= NET_TOP && foul === null,
    `期望过网且不判罚，实际 crossY=${crossY} foul=${foul} netTop=${NET_TOP}`)
})

test('满蓄力 drive 首落点应在对方半台且不出界', () => {
  const { first, foul } = flight({ type: 'drive', charge: 1 })
  assert.deepStrictEqual(
    { first, foul },
    { first: { side: 'ai', outside: false }, foul: null },
    '期望 drive 首落点在 ai 半台、台面内、无判罚',
  )
})

test('push 应过网且首落点在对方半台', () => {
  const { crossY, first, foul } = flight({ type: 'push', charge: 0 })
  assert.ok(crossY !== null && crossY >= NET_TOP && first?.side === 'ai' &&
    first?.outside === false && foul === null,
    `期望 push 合法过网，实际 crossY=${crossY} first=${JSON.stringify(first)} foul=${foul}`)
})

test('drive 与 push 的过网高度应有可见差异', () => {
  const drive = flight({ type: 'drive', charge: 1 }).crossY
  const push = flight({ type: 'push', charge: 0 }).crossY
  assert.ok(Math.abs(push - drive) > 0.03, `期望弧线差异 >0.03，实际 drive=${drive} push=${push}`)
})

test('在真实击球高度带内 drive 应始终过网', () => {
  for (const y of [0.9, 0.95, 1, 1.05, 1.1]) {
    const { crossY, foul } = flight({ type: 'drive', charge: 1 }, y)
    assert.ok(crossY !== null && crossY >= NET_TOP && foul === null,
      `期望 y=${y} 过网，实际 crossY=${crossY} foul=${foul}`)
  }
})

test('stepBall 每个子步都应让 spin 向 0 衰减', () => {
  const state = { ball: { position: { x: 0, y: 1.2, z: 0.5 }, velocity: { x: 0, y: 0, z: -3.45 }, spin: 1 },
    rally: createRally('player') }
  const next = stepBall(state, CONFIG.fixedDt)
  assert.ok(next.ball.spin < 1 && next.ball.spin > 0,
    `期望 spin 落在 (0,1)，实际 ${next.ball.spin}`)
})

test('上旋球落台后水平速度应前冲', () => {
  const state = { ball: { position: { x: 0, y: 0.781, z: -0.5 }, velocity: { x: 0, y: -1, z: -3 }, spin: 1 },
    rally: createRally('player') }
  assert.ok(stepBall(state, 0.01).ball.velocity.z < -3, '期望 |vz| 增大、方向不变')
})

test('下旋球落台后水平速度应回缩', () => {
  const state = { ball: { position: { x: 0, y: 0.781, z: -0.5 }, velocity: { x: 0, y: -1, z: -3 }, spin: -0.6 },
    rally: createRally('player') }
  const vz = stepBall(state, 0.01).ball.velocity.z
  assert.ok(vz > -3 && vz < 0, `期望 |vz| 减小且方向不变，实际 ${vz}`)
})
