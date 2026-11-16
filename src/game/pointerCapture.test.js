// setPointerCapture 失败时的兜底：不抛未捕获异常、不残留 pointerId。
// 真实浏览器里只有「无活动指针」的那只指针会抛错，后续真实指针能正常捕获。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createPointerInput } from './pointerInput.js'

const PHANTOM = 8

const throwingTarget = () => {
  const handlers = new Map()
  const captured = []
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
    getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 100 } },
    setPointerCapture(id) {
      if (id === PHANTOM) throw new Error('No active pointer with the given id is found.')
      captured.push(id)
    },
    captured() { return captured },
  }
}

const event = (overrides = {}) => ({
  pointerId: 1, isPrimary: true, clientX: 150, clientY: 50, ...overrides,
})
const center = { x: 0, y: 0.98 }

test('捕获抛错时 pointerdown 不应向外冒泡异常', () => {
  const target = throwingTarget()
  const input = createPointerInput(target)
  assert.doesNotThrow(() => target.emit('pointerdown', event({ pointerId: PHANTOM })), '期望异常被内部消化')
  input.dispose()
})

test('捕获抛错后不应残留拖拍目标', () => {
  const target = throwingTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ pointerId: PHANTOM }))
  assert.strictEqual(input.axes(center), null, '期望回退到键盘而非追随幽灵目标')
  input.dispose()
})

test('捕获抛错后新的真实 pointerdown 仍应被认领', () => {
  const target = throwingTarget()
  const input = createPointerInput(target)
  target.emit('pointerdown', event({ pointerId: PHANTOM }))
  target.emit('pointerdown', event({ pointerId: 2, clientX: 200 }))
  assert.deepStrictEqual(target.captured(), [2], '期望只认领第二只指针')
  assert.strictEqual(input.axes(center).x, 1, '期望第二只指针可以正常拖拍')
  input.dispose()
})

test('捕获抛错不应清掉已排队的击球预设', () => {
  const target = throwingTarget()
  const input = createPointerInput(target)
  input.setPendingIntent('push')
  target.emit('pointerdown', event({ pointerId: PHANTOM }))
  assert.strictEqual(input.intent().type, 'push', '期望预设与指针状态互不干扰')
  input.dispose()
})
