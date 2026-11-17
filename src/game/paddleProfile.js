// 球拍近圆轮廓的纯数值真源：不 import three、不访问 DOM。
// 极角参数 φ 从正下方（拍柄方向，φ=0）逆时针递增；同一组点供 Shape /
// ExtrudeGeometry / TubeGeometry / 背面缩小片共用，视觉边缘与 bladeRadius 同源。
import { CONFIG } from './config.js'
import { VISUAL } from './visual.js'

const TWO_PI = Math.PI * 2
const R = CONFIG.paddle.bladeRadius
const P = VISUAL.paddle
const bottomDepth = Math.abs(P.neckBottomRatio) * R
const shoulderDepth = Math.abs(P.neckShoulderRatio) * R
const neckHalf = P.neckHalfRatio * R

// 三个关键角由「深度 + 半宽」反解：平底角 / 颈顶角 / 圆弧肩角，不写死角度。
const phiBottom = Math.atan2(neckHalf, bottomDepth)
const phiNeck = Math.atan2(neckHalf, shoulderDepth)
const shoulderX = Math.sqrt(R * R - shoulderDepth * shoulderDepth)
const phiShoulder = Math.atan2(shoulderX, shoulderDepth)
const neckRadius = neckHalf / Math.sin(phiNeck)

// 半径随离正下方方向的夹角变化：平底 → 直颈 → 圆角肩 → 正圆弧。
// 所有分支的 r ≤ R，因此轮廓最大可视半径恒等于 bladeRadius。
function radiusAt(d) {
  if (d <= phiBottom) return bottomDepth / Math.cos(d)
  if (d <= phiNeck) return neckHalf / Math.sin(d)
  if (d <= phiShoulder) {
    const u = (d - phiNeck) / (phiShoulder - phiNeck)
    const ease = u * u * (3 - 2 * u)
    return neckRadius + (R - neckRadius) * ease
  }
  return R
}

function pointAt(phi) {
  const d = Math.min(phi, TWO_PI - phi)
  const r = radiusAt(d)
  return [r * Math.sin(phi), -r * Math.cos(phi)]
}

// 关键角度必须落在整数采样点上，否则 ±R / +R 的极值会被均匀网格错过。
// 分母 47 = 默认 48 点闭合轮廓的区间数；其它采样数按比例取整。
const BASE_INTERVALS = 47
const ANCHORS = Object.freeze([
  [0, 0], [1, phiBottom], [2, phiNeck], [3, phiShoulder],
  [12, Math.PI / 2], [24, Math.PI], [36, Math.PI * 1.5],
  [44, TWO_PI - phiShoulder], [45, TWO_PI - phiNeck],
  [46, TWO_PI - phiBottom], [47, TWO_PI],
])

export function paddleOutline(steps = P.outlineSteps) {
  const n = Number.isFinite(steps)
    ? Math.max(16, Math.min(512, Math.floor(steps)))
    : P.outlineSteps
  const last = n - 1
  const controls = []
  for (const [index, angle] of ANCHORS) {
    const at = Math.min(last, Math.round(index / BASE_INTERVALS * last))
    if (controls.length && at <= controls[controls.length - 1][0]) continue
    controls.push([at, angle])
  }
  controls[controls.length - 1] = [last, TWO_PI]

  const points = []
  for (let i = 0; i <= last; i += 1) {
    let k = 0
    while (k < controls.length - 2 && controls[k + 1][0] < i) k += 1
    const [from, a0] = controls[k]
    const [to, a1] = controls[k + 1]
    const t = to === from ? 0 : (i - from) / (to - from)
    points.push(pointAt(a0 + (a1 - a0) * t))
  }
  // 显式复制首点：闭合且数值完全相等，Shape / CatmullRomCurve3 都不会留缝。
  points[last] = points[0]
  return points
}

// 平滑收腰木柄：半径单调不减、轴向单调增，没有忽粗忽细的波纹（不再像弹簧）。
export function handleProfile() {
  return [
    [0.010, 0], [0.011, 0.012], [0.012, 0.028], [0.0135, 0.048],
    [0.015, 0.070], [0.0165, 0.090], [0.018, 0.102],
  ]
}
