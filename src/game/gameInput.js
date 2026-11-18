import { INTENT_NONE } from './config.js'
import { createInput } from './input.js'
import { createPointerInput } from './pointerInput.js'

// 输入源组合器：对 PongEngine 伪装成原来的 createInput，让它不感知有几套输入。
// 键盘与指针并存，指针的拖拍目标和预设意图优先，键盘仍是完整的回退路径。
export function createGameInput(keyboardTarget, pointerTarget, callbacks = {}) {
  const keyboard = createInput(keyboardTarget, callbacks)
  const pointer = createPointerInput(pointerTarget)

  return {
    axes(paddle) {
      const fromPointer = pointer.axes(paddle)
      return fromPointer ?? keyboard.axes()
    },
    tick(dt) {
      keyboard.tick(dt)
    },
    intent() {
      const preset = pointer.intent()
      return preset === INTENT_NONE ? keyboard.intent() : preset
    },
    setPendingIntent(type) {
      pointer.setPendingIntent(type)
    },
    consumeIntent() {
      pointer.consumeIntent()
    },
    clearPending() {
      pointer.consumeIntent()
    },
    clear() {
      keyboard.clear()
      pointer.clear()
    },
    resetCharge() {
      keyboard.resetCharge()
    },
    dispose() {
      keyboard.dispose()
      pointer.dispose()
    },
  }
}
