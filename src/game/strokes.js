// 四个出拍动作的固定中文元数据与允许列表校验，纯数据：不 import three、不访问 DOM。
export const STROKES = Object.freeze([
  Object.freeze({
    key: 'none', digit: '1',
    manualLabel: '普通回击', actionLabel: '普通回击',
    hint: '速度适中、不带旋转',
  }),
  Object.freeze({
    key: 'drive', digit: '2',
    manualLabel: '上旋快攻', actionLabel: '正手攻球',
    hint: '上旋快压，弧线更低',
  }),
  Object.freeze({
    key: 'push', digit: '3',
    manualLabel: '搓短下旋', actionLabel: '搓短',
    hint: '下旋慢短，落台后会回缩',
  }),
  Object.freeze({
    key: 'block', digit: '4',
    manualLabel: null, actionLabel: '反手推挡',
    hint: '无旋平击，线路更开',
  }),
])

export const STROKE_KEYS = Object.freeze(STROKES.map((stroke) => stroke.key))
const DIGITS = Object.freeze(Object.fromEntries(STROKES.map((s) => [s.digit, s.key])))

// 允许列表校验：非字符串、未知键、原型键一律返回 null，不抛异常。
export function normalizeStroke(value) {
  return typeof value === 'string' && STROKE_KEYS.includes(value) ? value : null
}

export function strokeForDigit(digit) {
  return typeof digit === 'string' && Object.hasOwn(DIGITS, digit) ? DIGITS[digit] : null
}

// 手动模式只暴露既有三个意图；动作模式暴露四个并带数字键提示。
export function optionsFor(mode) {
  const action = mode === 'action'
  return STROKES.filter((stroke) => action || stroke.manualLabel !== null)
    .map((stroke) => ({
      key: stroke.key,
      label: action ? stroke.actionLabel : stroke.manualLabel,
      digit: action ? stroke.digit : null,
    }))
}

export function strokeHint(key) {
  const stroke = STROKES.find((entry) => entry.key === key)
  return stroke ? stroke.hint : ''
}
