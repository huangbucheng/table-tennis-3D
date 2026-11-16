import { CONFIG, INTENT_NONE } from './config.js'

// Pointer Events 输入源：拖拍目标 + 「下一拍意图」单槽。无循环、无 setTimeout。
// 只依赖 config.js；坐标是屏幕空间线性映射，不做 three.js 3D 拾取。
const TYPES = new Set(['drive', 'push'])
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const usable = (event) =>
  event.pointerId != null &&
  event.isPrimary !== false &&
  Number.isFinite(event.clientX) &&
  Number.isFinite(event.clientY)

export function createPointerInput(target) {
  let pointerId = null
  let goal = null
  let pending = null

  const updateGoal = (event) => {
    const rect = target.getBoundingClientRect?.()
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return false
    const p = CONFIG.paddle
    const u = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const v = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    goal = {
      x: p.minX + u * (p.maxX - p.minX),
      y: p.minY + (1 - v) * (p.maxY - p.minY),
    }
    return true
  }

  // 正常松手、系统取消、丢失捕获都清目标：球拍停在松手处，不跨球滑回旧位置。
  const release = () => {
    pointerId = null
    goal = null
  }

  const onDown = (event) => {
    if (!usable(event) || pointerId !== null) return
    // 合成事件或指针已释放时 setPointerCapture 会抛 DOMException；
    // 捕获失败就不认领这只指针，避免残留 pointerId 让后续真实拖拽全被忽略。
    pointerId = event.pointerId
    if (!updateGoal(event)) { release(); return }
    try {
      target.setPointerCapture?.(event.pointerId)
    } catch {
      release()
    }
  }
  const onMove = (event) => {
    if (pointerId === null || event.pointerId !== pointerId || !usable(event)) return
    updateGoal(event)
  }
  const matches = (event) => pointerId !== null && event.pointerId === pointerId
  const onUp = (event) => { if (matches(event)) release() }
  const onCancel = (event) => { if (matches(event)) release() }
  const onLost = (event) => { if (matches(event)) release() }

  const EVENTS = [
    ['pointerdown', onDown],
    ['pointermove', onMove],
    ['pointerup', onUp],
    ['pointercancel', onCancel],
    ['lostpointercapture', onLost],
  ]
  for (const [type, handler] of EVENTS) target.addEventListener(type, handler)

  return {
    // null 表示当前没有活动指针，由 gameInput 回退到键盘 axes。
    axes(paddle) {
      if (!goal || !paddle) return null
      const p = CONFIG.pointer
      return {
        x: clamp((goal.x - paddle.x) / p.followRadius, -1, 1),
        y: clamp((goal.y - paddle.y) / p.followRadiusY, -1, 1),
      }
    },
    intent() {
      return pending ?? INTENT_NONE
    },
    setPendingIntent(type) {
      if (type === 'none') {
        pending = null
        return
      }
      if (!TYPES.has(type)) return
      pending = type === 'drive'
        ? { type: 'drive', charge: CONFIG.pointer.tapCharge }
        : { type: 'push', charge: 0 }
    },
    consumeIntent() {
      pending = null
    },
    clear() {
      release()
      pending = null
    },
    dispose() {
      for (const [type, handler] of EVENTS) target.removeEventListener(type, handler)
      release()
      pending = null
    },
  }
}
