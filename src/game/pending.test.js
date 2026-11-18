import test from 'node:test'
import assert from 'node:assert/strict'
import { PongEngine } from './PongEngine.js'
import { createSimulation } from './rally.js'
import { ServeClock } from './serveClock.js'
import { createSessionState, pendingLabel } from './session.js'

// 状态迁移：驱动真实原型方法；syncMeshes(view) 在 view 为空时直接返回。
// session.test.js 已 168 行，这组引擎级用例拆到本文件以守住 200 行上限。
const migrationEngine = () => {
  const engine = Object.create(PongEngine.prototype)
  const calls = []
  engine.failed = false
  engine.state = createSessionState()
  engine.state.phase = 'playing'
  engine.state.pending = 'push'
  engine.sim = createSimulation()
  engine.serveClock = new ServeClock()
  engine.callbacks = { onState: (payload) => calls.push(payload) }
  engine.calls = calls
  engine.audio = { play() {} }
  engine.trail = { reset() {}, push() {} }
  engine.particles = { burst() {}, reset() {} }
  engine.input = {
    setPendingIntent: (type) => calls.push(['set', type]),
    consumeIntent() {}, clearPending: () => calls.push(['clear']),
    clear() {}, resetCharge() {}, axes: () => ({ x: 0, y: 0 }), tick() {},
    intent: () => ({ type: 'none', charge: 0 }),
  }
  engine.accumulator = 0
  engine.running = true
  engine.lastTime = 0
  engine.raf = 0
  engine.view = undefined
  return engine
}

test('selectIntent 应把合法预设写入状态与输入队列', () => {
  const e = migrationEngine()
  e.selectIntent('drive')
  assert.strictEqual(e.state.pending, 'drive', '期望状态为 drive')
  assert.deepStrictEqual(e.calls[0], ['set', 'drive'], '期望下发输入队列')
})

test('selectIntent 对未知类型应忽略并保持原预设', () => {
  const e = migrationEngine()
  e.selectIntent('bogus')
  assert.strictEqual(e.state.pending, 'push', '期望预设不变')
})

test('selectIntent 在 WebGL 失败时不应访问未初始化的 input', () => {
  const e = migrationEngine()
  e.failed = true
  e.input = undefined
  e.selectIntent('drive')
  assert.strictEqual(e.state.pending, 'push', '期望预设不变')
})

test('真实 emit 下发载荷应包含 pending', () => {
  const e = migrationEngine()
  e.emit()
  assert.strictEqual(e.calls[0].pending, 'push', '期望下发预设')
})

test('award 应清空预设与输入队列', () => {
  const e = migrationEngine()
  e.award('player', '没接到球', { x: 0, y: 0.9, z: 0.4 })
  assert.strictEqual(e.state.pending, 'none', '期望状态清空')
  assert.ok(e.calls.some((c) => Array.isArray(c) && c[0] === 'clear'), '期望清队列')
})

test('restart 应清空预设', () => {
  const e = migrationEngine()
  e.restart()
  assert.strictEqual(e.state.pending, 'none', '期望状态清空')
})

test('serve 不应清空倒数期间预设的意图', () => {
  const e = migrationEngine()
  e.state.phase = 'serving'
  e.serve()
  assert.strictEqual(e.state.pending, 'push', '期望预设保留到开球后第一板')
})

test('默认参数下 pendingLabel 应沿用既有手动模式文案', () => {
  assert.strictEqual(pendingLabel('drive'), '已备好：上旋快攻（下一拍）',
    `期望既有文案，实际 ${pendingLabel('drive')}`)
  assert.strictEqual(pendingLabel('push'), '已备好：搓短下旋（下一拍）',
    '期望既有搓短文案')
})

test('动作模式应使用专业动作名，含新增的反手推挡', () => {
  const expected = {
    none: '下一拍：普通回击',
    drive: '已备好：正手攻球（下一拍）',
    push: '已备好：搓短（下一拍）',
    block: '已备好：反手推挡（下一拍）',
  }
  for (const [key, label] of Object.entries(expected)) {
    assert.strictEqual(pendingLabel(key, 'action'), label,
      `期望 ${key} → ${label}，实际 ${pendingLabel(key, 'action')}`)
  }
})

test('pendingLabel 非法键与非法模式仍应返回空串或回退手动表', () => {
  for (const key of [undefined, null, 'bogus', 'constructor', '__proto__', 4]) {
    assert.strictEqual(pendingLabel(key, 'action'), '',
      `期望 ${String(key)} 返回空串`)
  }
  assert.strictEqual(pendingLabel('drive', 'unknown'), '已备好：上旋快攻（下一拍）',
    '期望非法模式回退手动文案')
})

test('selectIntent 应接受动作模式新增的 block', () => {
  const e = migrationEngine()
  e.selectIntent('block')
  assert.strictEqual(e.state.pending, 'block', '期望写入 block')
  assert.deepStrictEqual(e.calls[0], ['set', 'block'], '期望下发输入队列')
})
