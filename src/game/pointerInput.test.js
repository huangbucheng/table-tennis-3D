import test from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG, INTENT_NONE } from './config.js'
import { createPointerInput } from './pointerInput.js'

const fakeTarget = (rect = { left: 0, top: 0, width: 200, height: 100 }) => {
  const handlers = new Map()
  let captured = null
  return {
    addEventListener(type, handler) {
      handlers.set(type, [...(handlers.get(type) || []), handler])
    },
    removeEventListener(type, handler) {
      handlers.set(type, (handlers.get(type) || []).filter((item) => item !== handler))
    },
    emit(type, event) {
      for (const handler of handlers.get(type) || []) handler(event)
    },
    total() { return [...handlers.values()].reduce((n, list) => n + list.length, 0) },
    getBoundingClientRect() { return rect },
    setPointerCapture(id) { captured = id },
    captured() { return captured },
  }
}

const event = (overrides = {}) => ({
  pointerId: 1, isPrimary: true, clientX: 100, clientY: 50, ...overrides,
})
const center = { x: 0, y: 0.98 }

test('拖到右上角应产生正向输入轴', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ clientX: 200, clientY: 0 }))
  assert.strictEqual(input.axes(center).x, 1, '期望 x 轴为 1')
  input.dispose()
})

test('拖到左下角应产生负向输入轴', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ clientX: 0, clientY: 100 }))
  assert.strictEqual(input.axes(center).y, -1, '期望 y 轴为 -1')
  input.dispose()
})

test('屏幕中心应映射到球拍 x 中位', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event())
  assert.strictEqual(input.axes(center).x, 0, '期望 x 轴为 0')
  input.dispose()
})

test('接近目标时应线性减速而不是全速', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ clientX: 200, clientY: 0 }))
  const axes = input.axes({ x: 0.84, y: 1.34 })
  assert.ok(axes.x > 0 && axes.x < 1, `期望 0 < x < 1，实际 ${axes.x}`)
  input.dispose()
})

test('容器宽高为 0 时不应产生拖拍目标', () => {
  const target = fakeTarget({ left: 0, top: 0, width: 0, height: 0 })
  const input = createPointerInput(target)
  target.emit('pointerdown', event())
  assert.strictEqual(input.axes(center), null, '期望回退到键盘')
  input.dispose()
})

test('非主指针应被忽略', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ isPrimary: false }))
  assert.strictEqual(input.axes(center), null, '期望回退到键盘')
  input.dispose()
})

test('缺少 pointerId 的事件应被忽略', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ pointerId: undefined }))
  assert.strictEqual(input.axes(center), null, '期望回退到键盘')
  input.dispose()
})

test('第二根手指不应抢占活动指针', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ pointerId: 1 }))
  target.emit('pointerdown', event({ pointerId: 2, clientX: 200 }))
  assert.strictEqual(target.captured(), 1, '期望只捕获第一根手指')
  input.dispose()
})

test('pointermove 应更新拖拍目标', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event())
  target.emit('pointermove', event({ clientX: 200 }))
  assert.strictEqual(input.axes(center).x, 1, '期望目标已更新')
  input.dispose()
})

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`${type} 应清掉拖拍目标`, () => {
    const target = fakeTarget()
    const input = createPointerInput(target)
    target.emit('pointerdown', event({ clientX: 200 }))
    target.emit(type, event())
    assert.strictEqual(input.axes(center), null, '期望回退到键盘')
    input.dispose()
  })
}

test('未传 paddle 时不应产生追拍轴', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ clientX: 200 }))
  assert.strictEqual(input.axes(), null, '期望回退到键盘')
  input.dispose()
})

test('drive 预设应带固定点按蓄力', () => {
  const input = createPointerInput(fakeTarget())
  input.setPendingIntent('drive')
  assert.strictEqual(input.intent().charge, CONFIG.pointer.tapCharge, '期望固定 charge')
  input.dispose()
})

test('push 预设的 charge 应为 0', () => {
  const input = createPointerInput(fakeTarget())
  input.setPendingIntent('push')
  assert.strictEqual(input.intent().charge, 0, '期望 charge 为 0')
  input.dispose()
})

test('后一次预设应覆盖前一次', () => {
  const input = createPointerInput(fakeTarget())
  input.setPendingIntent('drive')
  input.setPendingIntent('push')
  assert.strictEqual(input.intent().type, 'push', '期望单槽被覆盖')
  input.dispose()
})

test('未知类型应忽略并保持原预设', () => {
  const input = createPointerInput(fakeTarget())
  input.setPendingIntent('push')
  input.setPendingIntent('bogus')
  assert.strictEqual(input.intent().type, 'push', '期望预设不变')
  input.dispose()
})

test('none 应清空预设队列', () => {
  const input = createPointerInput(fakeTarget())
  input.setPendingIntent('drive')
  input.setPendingIntent('none')
  assert.strictEqual(input.intent(), INTENT_NONE, '期望回落无意图')
  input.dispose()
})

test('consumeIntent 应只清一次且可重复调用', () => {
  const input = createPointerInput(fakeTarget())
  input.setPendingIntent('drive')
  input.consumeIntent()
  input.consumeIntent()
  assert.strictEqual(input.intent(), INTENT_NONE, '期望回落无意图')
  input.dispose()
})

test('clear 应同时清掉拖拍目标与预设', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ clientX: 200 }))
  input.setPendingIntent('push')
  input.clear()
  assert.strictEqual(input.axes(center), null, '期望目标已清')
  assert.strictEqual(input.intent(), INTENT_NONE, '期望预设已清')
  input.dispose()
})

test('dispose 应解绑全部指针监听', () => {
  const target = fakeTarget()
  const input = createPointerInput(target)
  assert.strictEqual(target.total(), 5, '期望绑定 5 类事件')
  input.dispose()
  assert.strictEqual(target.total(), 0, '期望全部解绑')
})
