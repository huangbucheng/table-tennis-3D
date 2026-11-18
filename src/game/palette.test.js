// 迭代 14：只断言「应该怎样」的设计不变量，不写「等于当前常量」的实现式断言。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { COLORS, CONFIG } from './config.js'
import { VISUAL } from './visual.js'
import {
  relativeLuminance, contrastRatio, chromaRatio, cssHex, srgbMean, hueDegrees,
} from './palette.js'

// 迭代 13 收尾态：作为「必须继续变亮 / 必须错开」的比较基线，不是期望值。
const OLD = Object.freeze({
  background: 0x1a2735,
  floor: 0x17202b,
  barrier: 0x17212c,
  audience: 0x222a33,
  pool: 0x222c34,
})

const environmentColors = () => [
  COLORS.background, COLORS.floor, CONFIG.arena.barrierColor,
  CONFIG.arena.audienceColor, CONFIG.arena.poolColor,
]
const hueGap = (a, b) => {
  const delta = Math.abs(hueDegrees(a) - hueDegrees(b))
  return Math.min(delta, 360 - delta)
}
const shellHex = () => {
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8')
  const root = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? ''
  const vars = new Map()
  for (const [, name, value] of root.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    vars.set(name, Number.parseInt(value.slice(1), 16))
  }
  return vars
}

test('相对亮度：纯黑为 0、纯白接近 1，且随通道值单调上升', () => {
  assert.strictEqual(relativeLuminance(0x000000), 0)
  assert.ok(Math.abs(relativeLuminance(0xffffff) - 1) < 1e-9,
    `纯白期望 ≈1，实际 ${relativeLuminance(0xffffff)}`)
  assert.ok(relativeLuminance(0x808080) > relativeLuminance(0x404040))
})

test('新背景应比迭代 13 背景亮至少 1.8 倍，且不超过白球可读上限 0.09', () => {
  const before = relativeLuminance(OLD.background)
  const after = relativeLuminance(COLORS.background)
  assert.ok(after >= before * 1.8,
    `期望 ≥${(before * 1.8).toFixed(5)}，实际 ${after.toFixed(5)}`)
  assert.ok(after <= 0.09, `期望 ≤0.09，实际 ${after.toFixed(5)}`)
})

test('球与背景 ≥7:1、球与球台 ≥5:1，背景不得过亮', () => {
  const onBackground = contrastRatio(COLORS.ball, COLORS.background)
  const onTable = contrastRatio(COLORS.ball, COLORS.table)
  assert.ok(onBackground >= 7, `球/背景期望 ≥7:1，实际 ${onBackground.toFixed(2)}:1`)
  assert.ok(onTable >= 5, `球/球台期望 ≥5:1，实际 ${onTable.toFixed(2)}:1`)
  assert.ok(relativeLuminance(COLORS.background) <= 0.09,
    `背景相对亮度期望 ≤0.09，实际 ${relativeLuminance(COLORS.background).toFixed(5)}`)
})

test('五处环境色都应比迭代 13 更亮', () => {
  const pairs = [
    ['background', COLORS.background, OLD.background],
    ['floor', COLORS.floor, OLD.floor],
    ['barrier', CONFIG.arena.barrierColor, OLD.barrier],
    ['audience', CONFIG.arena.audienceColor, OLD.audience],
    ['pool', CONFIG.arena.poolColor, OLD.pool],
  ]
  for (const [name, now, before] of pairs) {
    assert.ok(relativeLuminance(now) > relativeLuminance(before),
      `${name} 期望变亮：${relativeLuminance(before).toFixed(5)} → ${relativeLuminance(now).toFixed(5)}`)
  }
})

test('环境色与球台色必须错开：彩度差 ≥0.35、色相差 ≥40°、环境更亮', () => {
  const envMaxChroma = Math.max(...environmentColors().map(chromaRatio))
  const chromaGap = chromaRatio(COLORS.table) - envMaxChroma
  assert.ok(chromaGap >= 0.35,
    `彩度差期望 ≥0.35，实际 ${chromaGap.toFixed(3)}（环境最大 ${envMaxChroma.toFixed(3)}）`)
  assert.ok(hueGap(COLORS.table, COLORS.background) >= 40,
    `色相差期望 ≥40°，实际 ${hueGap(COLORS.table, COLORS.background).toFixed(1)}°`)
  assert.ok(srgbMean(COLORS.background) > srgbMean(COLORS.table) + 5,
    `环境 sRGB 均值期望 > 球台 +5，实际 ${srgbMean(COLORS.background).toFixed(1)} vs ${srgbMean(COLORS.table).toFixed(1)}`)
})

test('环境色必须是中性灰阶，五处彩度不得超过 0.29', () => {
  for (const color of environmentColors()) {
    assert.ok(chromaRatio(color) <= 0.29,
      `环境色彩度期望 ≤0.29，实际 ${chromaRatio(color).toFixed(3)}（0x${color.toString(16)}）`)
  }
})

test('远景辅助色必须低饱和（含迭代 14 新增的 washMid 与 equirect 三色）', () => {
  const A = VISUAL.atmosphere
  const keys = ['coolWash', 'warmWash', 'washMid', 'bokehCool', 'bokehWarm',
    'floorLineColor', 'equirectCool', 'equirectWarm', 'equirectTop',
    'equirectMid', 'equirectBottom', 'crowdFallback']
  for (const key of keys) {
    assert.ok(Number.isFinite(A[key]), `VISUAL.atmosphere 缺少数值色 ${key}`)
    const ratio = chromaRatio(A[key])
    assert.ok(ratio <= 0.35, `${key} 期望彩度 ≤0.35，实际 ${ratio.toFixed(3)}`)
  }
})

test('页面外壳四对文字对比度都应 ≥4.5:1', () => {
  const v = shellHex()
  for (const name of ['bg', 'surface', 'surface-2', 'text', 'muted', 'error']) {
    assert.ok(v.has(name), `style.css 缺少 --${name} 的十六进制色值`)
  }
  const pairs = [
    ['text/--bg', v.get('text'), v.get('bg')],
    ['muted/--surface-2', v.get('muted'), v.get('surface-2')],
    ['error/--surface', v.get('error'), v.get('surface')],
    ['error/--bg', v.get('error'), v.get('bg')],
  ]
  for (const [name, a, b] of pairs) {
    const ratio = contrastRatio(a, b)
    assert.ok(ratio >= 4.5, `${name} 期望 ≥4.5:1，实际 ${ratio.toFixed(2)}:1`)
  }
})

test('crowd / floor 亮度增益仍受迭代 13 上限约束', () => {
  assert.ok(VISUAL.atmosphere.crowdBoost >= 1.7 && VISUAL.atmosphere.crowdBoost <= 2.2,
    `crowdBoost 期望 ∈[1.7, 2.2]，实际 ${VISUAL.atmosphere.crowdBoost}`)
  assert.ok(VISUAL.atmosphere.floorBoost >= 1 && VISUAL.atmosphere.floorBoost <= 1.8,
    `floorBoost 期望 ∈[1, 1.8]，实际 ${VISUAL.atmosphere.floorBoost}`)
})

test('暗角须比迭代 13 更轻，雾距保持 8/22', () => {
  assert.ok(VISUAL.vignette.edgeAlpha < 0.22,
    `期望 <0.22，实际 ${VISUAL.vignette.edgeAlpha}`)
  assert.strictEqual(VISUAL.atmosphere.fogNear, 8)
  assert.ok(VISUAL.atmosphere.fogFar > 18,
    `期望 >18，实际 ${VISUAL.atmosphere.fogFar}`)
})

test('cssHex 补齐 6 位小写十六进制；srgbMean / hueDegrees 边界正确', () => {
  assert.strictEqual(cssHex(0x000000), '#000000')
  assert.strictEqual(cssHex(0x0a0e13), '#0a0e13')
  assert.strictEqual(cssHex(0xffffff), '#ffffff')
  assert.strictEqual(srgbMean(0x000000), 0)
  assert.strictEqual(srgbMean(0xffffff), 255)
  assert.strictEqual(srgbMean(0x45525f), 82)
  assert.strictEqual(hueDegrees(0x808080), 0)
  assert.strictEqual(hueDegrees(0xff0000), 0)
  assert.ok(Math.abs(hueDegrees(0x00ff00) - 120) < 1e-9)
})

test('过亮背景 / 球台绿当环境色 / 旧 muted / 纯红代入不变量应判失败', () => {
  const baseline = relativeLuminance(OLD.background)
  assert.ok(baseline < baseline * 1.8,
    `迭代 13 背景 ${baseline.toFixed(5)} 不应满足「≥1.8× 自身」的提亮判定`)
  assert.ok(relativeLuminance(0x9aa7b4) > 0.09,
    `过亮背景 0x9aa7b4 应违反 ≤0.09 上限，实际 ${relativeLuminance(0x9aa7b4).toFixed(4)}`)
  assert.ok(contrastRatio(COLORS.ball, 0x9aa7b4) < 7,
    `过亮背景应违反球/背景 ≥7:1，实际 ${contrastRatio(COLORS.ball, 0x9aa7b4).toFixed(2)}:1`)
  assert.ok(chromaRatio(COLORS.table) - chromaRatio(0x1c6b5a) < 0.35,
    '把球台绿当环境色应让彩度差归零、判失败')
  assert.ok(contrastRatio(0xaab2bd, shellHex().get('surface-2')) < 4.5,
    `旧 --muted 在抬亮后的 --surface-2 上应 <4.5:1，实际 ${contrastRatio(0xaab2bd, shellHex().get('surface-2')).toFixed(2)}:1`)
  assert.ok(chromaRatio(0xff0000) > 0.35, '纯红彩度应 >0.35')
  assert.ok(contrastRatio(0x808080, 0x808080) < 7, '同色对比应 <7:1')
})
