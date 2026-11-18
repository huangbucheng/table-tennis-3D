// 迭代 13：环境配色的纯数值工具。不 import three、不访问 DOM，Node 单测可直接加载。
// 单一真源：config.js / visual.js 里的色值由这里换算成可断言的亮度、对比与彩度。
const channel = (hex, shift) => (hex >> shift) & 255

const normalize = (hex) => Number.isFinite(hex)
  ? Math.max(0, Math.min(0xffffff, Math.trunc(hex)))
  : 0

const linearize = (value) => {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

// WCAG 相对亮度，返回 [0, 1]；非法输入按纯黑处理，不产生 NaN。
export function relativeLuminance(hex) {
  const value = normalize(hex)
  return 0.2126 * linearize(channel(value, 16))
    + 0.7152 * linearize(channel(value, 8))
    + 0.0722 * linearize(channel(value, 0))
}

// WCAG 对比度，顺序无关；同色返回 1:1。
export function contrastRatio(a, b) {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// 低饱和判据：sRGB 三通道 (max-min)/max，纯黑返回 0。
export function chromaRatio(hex) {
  const value = normalize(hex)
  const rgb = [channel(value, 16), channel(value, 8), channel(value, 0)]
  const max = Math.max(...rgb)
  return max === 0 ? 0 : (max - Math.min(...rgb)) / max
}

// proceduralMaps 的 Canvas 渐变需要 CSS 字符串；避免同一色值写两份。
export function cssHex(hex) {
  return `#${normalize(hex).toString(16).padStart(6, '0')}`
}

// 迭代 14：sRGB 三通道算术均值，用来判断「环境是否比球台更亮」。
// 与 WCAG 相对亮度不同：这里刻意用感知上更直观的通道均值。
export function srgbMean(hex) {
  const value = normalize(hex)
  return (channel(value, 16) + channel(value, 8) + channel(value, 0)) / 3
}

// HSL 色相（0–360）。无彩度（三通道相等）返回 0，纯黑也返回 0。
export function hueDegrees(hex) {
  const value = normalize(hex)
  const r = channel(value, 16) / 255
  const g = channel(value, 8) / 255
  const b = channel(value, 0) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  let degrees
  if (max === r) degrees = 60 * (((g - b) / delta) % 6)
  else if (max === g) degrees = 60 * ((b - r) / delta + 2)
  else degrees = 60 * ((r - g) / delta + 4)
  return degrees < 0 ? degrees + 360 : degrees
}
