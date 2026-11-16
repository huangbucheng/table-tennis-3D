import { CONFIG, INTENT_NONE } from './config.js'

const LEFT = ['arrowleft', 'a']
const RIGHT = ['arrowright', 'd']
const UP = ['arrowup', 'w']
const DOWN = ['arrowdown', 's']
const SPACE = ' '
const SHIFT = 'shift'
const GAME_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, SPACE, SHIFT])

export function createInput(target = window) {
  const pressed = new Set()
  let charge = 0

  const resetAll = () => {
    pressed.clear()
    charge = 0
  }
  const resetCharge = () => {
    charge = 0
  }

  const onKeyDown = (event) => {
    const key = event.key.toLowerCase()
    if (!GAME_KEYS.has(key)) return
    pressed.add(key)
    event.preventDefault()
  }
  const onKeyUp = (event) => pressed.delete(event.key.toLowerCase())
  const onBlur = () => resetAll()

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  const has = (keys) => keys.some((key) => pressed.has(key))

  return {
    axes() {
      return {
        x: Number(has(RIGHT)) - Number(has(LEFT)),
        y: Number(has(UP)) - Number(has(DOWN)),
      }
    },
    tick(dt) {
      const step = dt / CONFIG.rules.chargeTime
      charge = pressed.has(SPACE)
        ? Math.min(1, charge + step)
        : Math.max(0, charge - 2 * step)
    },
    intent() {
      if (pressed.has(SHIFT)) return { type: 'push', charge: 0 }
      if (pressed.has(SPACE)) return { type: 'drive', charge }
      return INTENT_NONE
    },
    clear() {
      resetAll()
    },
    // 发球倒数后只重置蓄力，保留玩家一直按住的方向键。
    resetCharge,
    dispose() {
      target.removeEventListener('keydown', onKeyDown)
      target.removeEventListener('keyup', onKeyUp)
      target.removeEventListener('blur', onBlur)
      resetAll()
    },
  }
}
