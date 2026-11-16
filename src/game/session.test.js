import test from 'node:test'
import assert from 'node:assert/strict'
import { PongEngine } from './PongEngine.js'
import {
  createSessionState, sessionPayload, pointMessage, pointResult, pendingLabel, frameHooks,
} from './session.js'

// 不覆写 emit，用真实 callbacks.onState 捕获 PongEngine 下发的状态载荷。
const capturingEngine = () => {
  const engine = Object.create(PongEngine.prototype)
  const payloads = []
  engine.callbacks = { onState: (payload) => payloads.push(payload) }
  engine.state = createSessionState()
  engine.payloads = payloads
  return engine
}

test('createSessionState 初始阶段应为 ready', () => {
  assert.strictEqual(createSessionState().phase, 'ready', '期望 ready')
})

test('createSessionState 初始技术提示应为空', () => {
  assert.strictEqual(createSessionState().tip, '', '期望空提示')
})

test('createSessionState 初始预设应为 none', () => {
  assert.strictEqual(createSessionState().pending, 'none', '期望默认普通回击')
})

test('createSessionState 每次应返回互不共享的独立对象', () => {
  const first = createSessionState()
  first.scores.player = 7
  assert.strictEqual(createSessionState().scores.player, 0, '期望新状态比分为 0')
})

test('sessionPayload 应包含会话展示所需的全部字段', () => {
  assert.deepStrictEqual(Object.keys(sessionPayload(createSessionState())).sort(),
    ['countdown', 'message', 'muted', 'pending', 'phase', 'scores', 'server', 'tip', 'winner'],
    '期望 9 个下发字段')
})

test('sessionPayload 应下发当前预设', () => {
  const state = createSessionState()
  state.pending = 'push'
  assert.strictEqual(sessionPayload(state).pending, 'push', '期望下发搓短预设')
})

test('sessionPayload 应拷贝比分而不是共享引用', () => {
  const state = createSessionState()
  const payload = sessionPayload(state)
  state.scores.player = 9
  assert.strictEqual(payload.scores.player, 0, '期望已下发载荷不受后续改动影响')
})

test('pointMessage 非决胜分应包含理由与得分方', () => {
  assert.strictEqual(pointMessage('ai', '球下网了', false), '球下网了 · 对手得分',
    '期望理由与对手得分文案')
})

test('pointMessage 玩家赢下整局应返回固定文案', () => {
  assert.strictEqual(pointMessage('player', '没接到球', true), '你赢下了这一局',
    '期望整局胜利文案覆盖得分理由')
})

test('pointMessage 对手赢下整局应返回固定文案', () => {
  assert.strictEqual(pointMessage('ai', '球出界了', true), '对手赢下了这一局',
    '期望整局失败文案覆盖得分理由')
})

test('pointResult 应给得分方加一分且不判终局', () => {
  const r = pointResult(createSessionState(), 'ai', '没接到球')
  assert.deepStrictEqual(r.scores, { player: 0, ai: 1 }, '期望对手 +1')
  assert.strictEqual(r.over, false, '期望 0-1 不是终局')
})

test('pointResult 非决胜分应包含理由与得分方', () => {
  const r = pointResult(createSessionState(), 'player', '球出界了')
  assert.strictEqual(r.message, '球出界了 · 你得分', `期望得分文案，实际 ${r.message}`)
})

test('pointResult 决胜分应返回整局文案与终局标记', () => {
  const state = createSessionState()
  state.scores = { player: 10, ai: 9 }
  const r = pointResult(state, 'player', '没接到球')
  assert.strictEqual(r.over, true, '期望 11-9 判终局')
  assert.strictEqual(r.message, '你赢下了这一局', `期望终局文案，实际 ${r.message}`)
})

test('pointResult 应清空技术提示与下一拍预设', () => {
  const state = createSessionState()
  state.tip = '蓄力弧圈 · 上旋让球下坠更快'
  state.pending = 'drive'
  const r = pointResult(state, 'ai', '球下网了')
  assert.strictEqual(r.tip, '', '期望提示清空')
  assert.strictEqual(r.pending, 'none', '期望预设回到普通回击')
})

test('pointResult 应按总分数轮换发球方', () => {
  const first = pointResult(createSessionState(), 'player', '没接到球')
  const second = pointResult({ scores: first.scores }, 'player', '没接到球')
  assert.strictEqual(first.server, 'player', '期望第 1 分后仍由玩家发球')
  assert.strictEqual(second.server, 'ai', '期望第 2 分后换对手发球')
})

test('pointResult 不应修改入参 state', () => {
  const state = createSessionState()
  const snapshot = structuredClone(state)
  pointResult(state, 'player', '没接到球')
  assert.deepStrictEqual(state, snapshot, '期望 state 逐字段不变')
})

test('pendingLabel 对 none 应给出非空文案', () => {
  assert.strictEqual(pendingLabel('none'), '下一拍：普通回击', '期望普通回击文案')
})

test('pendingLabel 对 drive 应给出上旋快攻文案', () => {
  assert.strictEqual(pendingLabel('drive'), '已备好：上旋快攻（下一拍）', '期望快攻文案')
})

test('pendingLabel 对 push 应给出搓短文案', () => {
  assert.strictEqual(pendingLabel('push'), '已备好：搓短下旋（下一拍）', '期望搓短文案')
})

test('pendingLabel 对未知类型应返回空串', () => {
  assert.strictEqual(pendingLabel('bogus'), '', '期望未知类型不显示')
})

test('pendingLabel 对原型键应返回空串', () => {
  assert.strictEqual(pendingLabel('__proto__'), '', '期望不泄漏原型属性')
})

test('真实 emit 下发载荷应包含 tip', () => {
  const engine = capturingEngine()
  engine.state.tip = '蓄力弧圈 · 上旋让球下坠更快'
  engine.emit()
  assert.strictEqual(engine.payloads[0].tip, '蓄力弧圈 · 上旋让球下坠更快',
    `期望下发技术提示，实际 ${JSON.stringify(engine.payloads[0])}`)
})

test('setTip 清空提示时应通过真实 emit 下发空文案', () => {
  const engine = capturingEngine()
  engine.state.tip = '搓短下旋 · 落台后会回缩'
  engine.setTip('')
  assert.strictEqual(engine.payloads.at(-1)?.tip, '',
    `期望清空后下发空提示，实际 ${JSON.stringify(engine.payloads)}`)
})

// frameHooks 是纯回调工厂，用极简替身即可，不需要 WebGL / DOM。
const hookEngine = () => ({
  state: { tip: '', pending: 'push' },
  audio: { played: [], play(kind) { this.played.push(kind) } },
  trail: { pushed: [], push(point) { this.pushed.push(point) } },
  input: { consumed: 0, consumeIntent() { this.consumed += 1 } },
  emits: 0,
  setTip(text) { this.state.tip = text },
  emit() { this.emits += 1 },
})

test('玩家命中应消费下一拍意图并清空展示状态', () => {
  const e = hookEngine()
  frameHooks(e).onHit('player', { type: 'push', charge: 0 })
  assert.strictEqual(e.input.consumed, 1, '期望消费一次')
  assert.strictEqual(e.state.pending, 'none', '期望预设回到普通回击')
})

test('玩家命中应更新技术提示并下发状态', () => {
  const e = hookEngine()
  frameHooks(e).onHit('player', { type: 'push', charge: 0 })
  assert.strictEqual(e.state.tip, '搓短下旋 · 落台后会回缩', '期望搓短提示')
  assert.ok(e.emits >= 1, '期望至少下发一次状态')
})

test('AI 命中不应消费玩家的下一拍意图', () => {
  const e = hookEngine()
  frameHooks(e).onHit('ai', { type: 'none', charge: 0 })
  assert.strictEqual(e.state.pending, 'push', '期望预设保留')
})

test('frameHooks 对双方命中都应播放 hit 音效', () => {
  const e = hookEngine()
  const hooks = frameHooks(e)
  hooks.onHit('ai', { type: 'none', charge: 0 })
  hooks.onHit('player', { type: 'none', charge: 0 })
  assert.deepStrictEqual(e.audio.played, ['hit', 'hit'], '期望两次 hit')
})

test('frameHooks 的落台与拖尾钩子应转发音效和轨迹点', () => {
  const e = hookEngine()
  const hooks = frameHooks(e)
  hooks.onBounce()
  hooks.onTrail({ x: 1, y: 2, z: 3 })
  assert.deepStrictEqual(e.audio.played, ['bounce'], '期望落台音效')
  assert.deepStrictEqual(e.trail.pushed, [{ x: 1, y: 2, z: 3 }], '期望轨迹点')
})

