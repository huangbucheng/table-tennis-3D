import test from 'node:test'
import assert from 'node:assert/strict'
import { createInput } from './input.js'

function fakeTarget() {
  const handlers = new Map()
  let prevented = 0
  return {
    addEventListener(type, handler) {
      handlers.set(type, [...(handlers.get(type) || []), handler])
    },
    removeEventListener(type, handler) {
      handlers.set(type, (handlers.get(type) || []).filter((item) => item !== handler))
    },
    emit(type, key) {
      for (const handler of handlers.get(type) || []) {
        handler({ key, preventDefault() { prevented += 1 } })
      }
    },
    count(type) {
      return (handlers.get(type) || []).length
    },
    prevented() {
      return prevented
    },
  }
}

test('按住 A 键应产生向左的输入轴', () => {
  const target = fakeTarget()
  const input = createInput(target)
  target.emit('keydown', 'a')
  assert.strictEqual(input.axes().x, -1, '期望 x 轴为 -1')
  input.dispose()
})

test('动作模式数字键应回调选动作并阻止默认行为', () => {
  const target = fakeTarget()
  const picked = []
  const input = createInput(target, { isActionMode: () => true, onStroke: (key) => picked.push(key) })
  for (const key of ['1', '2', '3', '4']) target.emit('keydown', key)
  assert.deepStrictEqual(picked, ['none', 'drive', 'push', 'block'], `期望四个动作，实际 ${picked}`)
  assert.strictEqual(target.prevented(), 4, '期望四次 preventDefault')
  input.dispose()
})

test('手动模式数字键不应回调也不应阻止默认行为', () => {
  const target = fakeTarget()
  const picked = []
  const input = createInput(target, { isActionMode: () => false, onStroke: (key) => picked.push(key) })
  target.emit('keydown', '4')
  assert.deepStrictEqual(picked, [], '期望手动模式不触发动作')
  assert.strictEqual(target.prevented(), 0, '期望手动模式不阻止默认行为')
  input.dispose()
})

test('松开按键后输入轴应归零', () => {
  const target = fakeTarget()
  const input = createInput(target)
  target.emit('keydown', 'ArrowRight')
  target.emit('keyup', 'ArrowRight')
  assert.strictEqual(input.axes().x, 0, '期望 x 轴为 0')
  input.dispose()
})

test('W 键应产生向上的输入轴', () => {
  const target = fakeTarget()
  const input = createInput(target)
  target.emit('keydown', 'W')
  assert.strictEqual(input.axes().y, 1, '期望 y 轴为 1')
  input.dispose()
})

test('失焦时应清空所有按键状态', () => {
  const target = fakeTarget()
  const input = createInput(target)
  target.emit('keydown', 'd')
  target.emit('blur', '')
  assert.strictEqual(input.axes().x, 0, '期望 x 轴为 0')
  input.dispose()
})

test('dispose 后应解绑全部监听', () => {
  const target = fakeTarget()
  const input = createInput(target)
  input.dispose()
  assert.strictEqual(
    target.count('keydown') + target.count('keyup') + target.count('blur'),
    0,
    '期望监听数量为 0',
  )
})

test('按住 Space 应产生 drive 意图', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' ')
  assert.strictEqual(input.intent().type, 'drive', '期望 drive 意图')
  input.dispose()
})

test('按住 Shift 应产生 push 意图', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', 'Shift')
  assert.strictEqual(input.intent().type, 'push', '期望 push 意图')
  input.dispose()
})

test('不按语义键时应产生 none 意图', () => {
  const input = createInput(fakeTarget())
  assert.deepStrictEqual(input.intent(), { type: 'none', charge: 0 }, '期望无意图')
  input.dispose()
})

test('同时按住 Space 与 Shift 时 Shift 应优先', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); target.emit('keydown', 'Shift')
  assert.strictEqual(input.intent().type, 'push', '期望 push 覆盖 drive')
  input.dispose()
})

test('按住 Space 0.4 秒应把 charge 累积到 0.5', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); input.tick(0.4)
  assert.strictEqual(input.intent().charge, 0.5, '期望 charge 为 0.5')
  input.dispose()
})

test('长按超过 chargeTime 后 charge 应停在 1', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); input.tick(3)
  assert.strictEqual(input.intent().charge, 1, '期望 charge 上限为 1')
  input.dispose()
})

test('松开 Space 后 charge 应以两倍速衰减', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); input.tick(0.8)
  target.emit('keyup', ' '); input.tick(0.4)
  assert.strictEqual(input.intent().charge, 0, '期望 0.4 秒从 1 衰减到 0')
  input.dispose()
})

test('resetCharge 应清零 charge', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); input.tick(0.4); input.resetCharge()
  assert.strictEqual(input.intent().charge, 0, '期望 charge 为 0')
  input.dispose()
})

test('resetCharge 不应抹掉发球倒数期间按住的方向键', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', 'd'); target.emit('keydown', ' '); input.tick(0.4)
  input.resetCharge()
  assert.strictEqual(input.axes().x, 1, '期望方向键仍生效')
  input.dispose()
})

test('clear 应清空 charge', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); input.tick(0.4); input.clear(); target.emit('keydown', ' ')
  assert.strictEqual(input.intent().charge, 0, '期望 charge 为 0')
  input.dispose()
})

test('clear 应清空方向键', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', 'd'); input.clear()
  assert.strictEqual(input.axes().x, 0, '期望 x 轴为 0')
  input.dispose()
})

test('失焦应清空 charge', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' '); input.tick(0.4); target.emit('blur', '')
  target.emit('keydown', ' ')
  assert.strictEqual(input.intent().charge, 0, '期望失焦后 charge 为 0')
  input.dispose()
})

test('空格键应触发 preventDefault 以阻止页面滚动', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', ' ')
  assert.strictEqual(target.prevented(), 1, '期望恰好调用 1 次 preventDefault')
  input.dispose()
})

test('非游戏键不应触发 preventDefault', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', 'q')
  assert.strictEqual(target.prevented(), 0, '期望不拦截无关按键')
  input.dispose()
})

test('Shift 的大小写形式应被同等识别', () => {
  const target = fakeTarget(); const input = createInput(target)
  target.emit('keydown', 'SHIFT')
  assert.strictEqual(input.intent().type, 'push', '期望大写 SHIFT 也识别为 push')
  input.dispose()
})
