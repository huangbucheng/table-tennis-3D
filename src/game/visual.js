// 迭代 11/12 视觉常量：纯数据，不 import three、不访问 DOM。
// config.js 一字不改；物理 / AI / 判定 / 计分 / 灯光 cue 数值全部留在这里之外。
export const VISUAL = Object.freeze({
  texture: Object.freeze({
    maxAnisotropy: 8,
    ledRepeatX: 4,
    ledRepeatY: 1,
    crowdRepeatX: 2,
    floorRepeat: 6,
    netRepeatX: 12,
    tableMicroRepeat: 4,
    rubberRepeatX: 3,
    rubberRepeatY: 3,
    woodRepeatX: 1,
    woodRepeatY: 3,
  }),
  material: Object.freeze({
    tableTop: Object.freeze({ roughness: 0.58, metalness: 0.06 }),
    tableApron: Object.freeze({ roughness: 0.7, metalness: 0.2 }),
    steel: Object.freeze({ roughness: 0.34, metalness: 0.78 }),
    wood: Object.freeze({ roughness: 0.66, metalness: 0.02 }),
    rubber: Object.freeze({ roughness: 0.82, metalness: 0 }),
    ball: Object.freeze({ roughness: 0.28, metalness: 0.04 }),
    floor: Object.freeze({ roughness: 0.46, metalness: 0.12 }),
  }),
  // 球拍外观的唯一常量源：近圆轮廓、短颈、边圈、木柄与专用贴图参数。
  paddle: Object.freeze({
    outlineSteps: 48,
    neckHalfRatio: 0.20,
    neckShoulderRatio: -0.82,
    neckBottomRatio: -0.96,
    backScale: 0.96,
    rimRadius: 0.0025,
    capRadius: 0.018,
    capThickness: 0.004,
    rubberEmissive: 0.28,
    rimEmissive: 0.35,
    rubberFallback: 0x182820,
    woodFallback: 0x4b3a2b,
    plyColor: 0xcbb08a,
    backColor: 0x20262c,
    backRoughness: 0.88,
    rimRoughness: 0.5,
    capColor: 0x171d23,
    capRoughness: 0.6,
  }),
  // 迭代 14：远景氛围的唯一常量源。青绿仍是唯一主色，这里只放低饱和中性色。
  // 彩度受 palette.test.js 的 (max-min)/max ≤ 0.35 约束；boost / 雾距 / 散景刻意不动。
  atmosphere: Object.freeze({
    coolWash: 0x7c8b99,
    warmWash: 0x998b78,
    washMid: 0x6a7783,
    washAlpha: 0.42,
    bokehCool: 0xa9c2d6,
    bokehWarm: 0xdcc19e,
    bokehWarmRatio: 0.38,
    floorLineColor: 0xcbb893,
    floorLineAlpha: 0.12,
    crowdBoost: 2.2,
    floorBoost: 1.5,
    equirectTop: 0x36424e,
    equirectCool: 0x4a5662,
    equirectMid: 0x4a5a62,
    equirectWarm: 0x554c40,
    equirectBottom: 0x303a44,
    crowdFallback: 0x46525e,
    fogNear: 8,
    fogFar: 22,
  }),
  env: Object.freeze({ intensity: 0.24 }),
  glow: Object.freeze({ spriteSize: 0.14, bokehCount: 132, headSize: 0.52 }),
  shadow: Object.freeze({ size: 0.18, opacity: 0.4 }),
  beam: Object.freeze({ coneSegments: 28, headSegments: 20, legSegments: 16 }),
  // CSS 无法 import JS；stage-overlay.css 中的两个 alpha 与此处保持同值。
  vignette: Object.freeze({ edgeAlpha: 0.10, topAlpha: 0.12 }),
})

// 标记「生成贴图加载完成后再赋值」的材质槽位；加载前用中性纯色占位，
// 加载失败就一直保持纯色，绝不出现白色空板。material.color 在贴图就绪后回到
// baseColor（默认白色，让贴图自身亮度成为唯一来源）；baseColor 用于球拍单主色。
// userData 是 three 官方保留字段，不触碰 DOM。
export function tagMaps(material, slots, fallback = 0x10171d, boost = 1, baseColor = 0xffffff) {
  material.color.setHex(fallback)
  material.userData.pendingMaps = slots
  material.userData.mapBaseColor = baseColor
  // 生成贴图整体是近黑底，Basic 材质不做 tone mapping 时几乎读不出层次；
  // 允许在贴图就绪后给 color 一个受限的亮度增益，避免重新生成整套图片。
  material.userData.mapBoost = boost
  return material
}
