import test from 'node:test'
import assert from 'node:assert/strict'
import { INTENT_NONE } from './config.js'
import { createGameInput } from './gameInput.js'

const listeners = () => {
  const handlers = new Map()
  return {
    addEventListener(type, handler) {
      handlers.set(type, [...(handlers.get(type) || []), handler])
    },
    removeEventListener(type, handler) {
      handlers.set(type, (handlers.get(type) || []).filter((item) => item !== handler))
    },
    emit(type, payload) {
      for (const handler of handlers.get(type) || []) handler(payload)
    },
    total() { return [...handlers.values()].reduce((n, list) => n + list.length, 0) },
  }
}

const fakeKeys = () => {
  const base = listeners()
  return {
    ...base,
    emit(type, key) { base.emit(type, { key, preventDefault() {} }) },
  }
}

const fakePointer = () => ({
  ...listeners(),
  getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 } },
  setPointerCapture() {},
})

const pe = (overrides = {}) => ({
  pointerId: 1, isPrimary: true, clientX: 100, clientY: 50, ...overrides,
})
const setup = () => {
  const keys = fakeKeys()
  const pointer = fakePointer()
  return { keys, pointer, input: createGameInput(keys, pointer) }
}

test('没有指针活动时应回退键盘输入轴', () => {
  const { keys, input } = setup()
  keys.emit('keydown', 'd')
  assert.strictEqual(input.axes({ x: 0, y: 0.98 }).x, 1, '期望键盘向右')
  input.dispose()
})

test('指针活动时应优先用追拍轴', () => {
  const { keys, pointer, input } = setup()
  keys.emit('keydown', 'a')
  pointer.emit('pointerdown', pe({ clientX: 200 }))
  assert.strictEqual(input.axes({ x: 0, y: 0.98 }).x, 1, '期望指针覆盖键盘向左')
  input.dispose()
})

test('不传 paddle 时应回退键盘输入轴', () => {
  const { keys, pointer, input } = setup()
  keys.emit('keydown', 'a')
  pointer.emit('pointerdown', pe({ clientX: 200 }))
  assert.strictEqual(input.axes().x, -1, '期望键盘向左')
  input.dispose()
})

test('无预设时应回退键盘意图', () => {
  const { keys, input } = setup()
  keys.emit('keydown', ' ')
  input.tick(0.4)
  assert.strictEqual(input.intent().type, 'drive', '期望键盘 drive')
  input.dispose()
})

test('有预设时应优先返回预设意图', () => {
  const { keys, input } = setup()
  keys.emit('keydown', ' ')
  input.setPendingIntent('push')
  assert.strictEqual(input.intent().type, 'push', '期望预设优先')
  input.dispose()
})

test('消费预设后应回落键盘意图', () => {
  const { keys, input } = setup()
  keys.emit('keydown', ' ')
  input.setPendingIntent('push')
  input.consumeIntent()
  assert.strictEqual(input.intent().type, 'drive', '期望回落键盘 drive')
  input.dispose()
})

test('消费后键盘未按意图键时应为 INTENT_NONE', () => {
  const { input } = setup()
  input.setPendingIntent('push')
  input.consumeIntent()
  assert.strictEqual(input.intent(), INTENT_NONE, '期望无意图')
  input.dispose()
})

test('none 预设应清空队列并回落键盘', () => {
  const { input } = setup()
  input.setPendingIntent('drive')
  input.setPendingIntent('none')
  assert.strictEqual(input.intent(), INTENT_NONE, '期望无意图')
  input.dispose()
})

test('clearPending 应只清队列而不动键盘', () => {
  const { keys, input } = setup()
  keys.emit('keydown', 'd')
  input.setPendingIntent('push')
  input.clearPending()
  assert.strictEqual(input.intent(), INTENT_NONE, '期望队列已清')
  assert.strictEqual(input.axes({ x: 0, y: 0.98 }).x, 1, '期望方向键仍生效')
  input.dispose()
})

test('resetCharge 应只清蓄力并保留按住的方向键', () => {
  const { keys, input } = setup()
  keys.emit('keydown', 'd')
  keys.emit('keydown', ' ')
  input.tick(0.4)
  input.resetCharge()
  assert.strictEqual(input.axes({ x: 0, y: 0.98 }).x, 1, '期望方向键仍生效')
  assert.strictEqual(input.intent().charge, 0, '期望蓄力归零')
  input.dispose()
})

test('tick 应透传到键盘使蓄力累积', () => {
  const { keys, input } = setup()
  keys.emit('keydown', ' ')
  input.tick(0.4)
  assert.ok(input.intent().charge > 0.4, `期望蓄力增长，实际 ${input.intent().charge}`)
  input.dispose()
})

test('clear 应清空键盘与指针两侧状态', () => {
  const { keys, pointer, input } = setup()
  keys.emit('keydown', 'd')
  pointer.emit('pointerdown', pe({ clientX: 200 }))
  input.setPendingIntent('push')
  input.clear()
  assert.strictEqual(input.axes({ x: 0, y: 0.98 }).x, 0, '期望键盘轴归零')
  assert.strictEqual(input.intent(), INTENT_NONE, '期望队列已清')
  input.dispose()
})

test('dispose 应解绑两套输入的全部监听', () => {
  const { keys, pointer, input } = setup()
  assert.strictEqual(keys.total(), 3, '期望键盘绑定 3 类事件')
  assert.strictEqual(pointer.total(), 5, '期望指针绑定 5 类事件')
  input.dispose()
  assert.strictEqual(keys.total(), 0, '期望键盘全部解绑')
  assert.strictEqual(pointer.total(), 0, '期望指针全部解绑')
})
