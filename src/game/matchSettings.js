// 对局设置与通用兜底文案，纯逻辑；不 import three、不访问 DOM。
// 档位只在本模块校验一次，其余模块一律使用归一化后的值。
export const MESSAGES = Object.freeze({
  webgl: '浏览器不支持 WebGL 或硬件加速，请开启后点击「重试」。',
  runtime: '游戏遇到问题，请点击「重新开始」再试一次。',
})

export const AI_LEVEL_KEYS = Object.freeze(['practice', 'standard', 'sharp'])

export const DEFAULT_AI_LEVEL = 'standard'

// 允许列表校验：undefined / null / 非字符串 / 未知字符串 / 原型键 / 大小写不符
// 一律回退到默认档，不抛异常、不拼接输入。
export function normalizeAiLevel(value) {
  return typeof value === 'string' && AI_LEVEL_KEYS.includes(value)
    ? value
    : DEFAULT_AI_LEVEL
}

export function createMatchSettings() {
  return { aiLevel: DEFAULT_AI_LEVEL }
}

// 把归一化后的档位写进当前模拟；模拟未就绪时返回 null，不抛异常。
// 只改 controller.profile，updateAiPaddle 下一步就会读到新档，无需重建控制器。
export function applyAiLevel(sim, level) {
  if (!sim?.ai) return null
  sim.ai.profile = normalizeAiLevel(level)
  return sim.ai.profile
}
