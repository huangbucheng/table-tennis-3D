// 程序化贴图：全部在函数内惰性创建 CanvasTexture，顶层零 DOM 副作用。
// arena.test.js 在 Node 里会 import 到本模块的调用链，故不能出现顶层 document。
import * as THREE from 'three'
import { VISUAL } from './visual.js'
import { cssHex } from './palette.js'

const A = VISUAL.atmosphere

function makeTexture(size, draw, { srgb = false, repeat = null, height = size } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = height
  draw(canvas.getContext('2d'), size, height)
  const texture = new THREE.CanvasTexture(canvas)
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace
  if (repeat) {
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(repeat[0], repeat[1])
  }
  return texture
}

function netGrid() {
  return makeTexture(128, (ctx, s) => {
    ctx.clearRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(228,236,242,0.85)'
    ctx.lineWidth = 1.4
    for (let i = 0; i <= s; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke()
    }
    ctx.fillStyle = 'rgba(240,246,250,0.95)'
    for (let y = 0; y <= s; y += 8) for (let x = 0; x <= s; x += 8) {
      ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4)
    }
  }, { srgb: true, repeat: [VISUAL.texture.netRepeatX, 1] })
}

function ballStripe() {
  return makeTexture(256, (ctx, s) => {
    ctx.fillStyle = '#f2f4f3'
    ctx.fillRect(0, 0, s, s)
    ctx.strokeStyle = 'rgba(120,140,150,0.42)'
    ctx.lineWidth = 3
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath()
      ctx.ellipse(s / 2, s / 2, s * 0.44, s * (0.1 + i * 0.075), 0.35, 0, Math.PI * 2)
      ctx.stroke()
    }
  }, { srgb: true })
}

function glowSprite() {
  return makeTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.25, 'rgba(210,240,232,0.45)')
    g.addColorStop(1, 'rgba(180,220,210,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  }, { srgb: true })
}

function contactShadow() {
  return makeTexture(128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(0.55, 'rgba(0,0,0,0.22)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
  }, { srgb: true })
}

function fineGrain() {
  return makeTexture(256, (ctx, s) => {
    ctx.fillStyle = '#b8b8b8'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 5200; i += 1) {
      const x = (i * 73 + 17) % s
      const y = (i * 149 + 41) % s
      const v = 150 + ((i * 31) % 80)
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`
      ctx.fillRect(x, y, 1, 1)
    }
  }, { repeat: [VISUAL.texture.tableMicroRepeat, VISUAL.texture.tableMicroRepeat] })
}

function plyStripes() {
  return makeTexture(64, (ctx, s) => {
    const tones = ['#6b4b32', '#c8a374', '#7d583a', '#d2ae80', '#6b4b32']
    tones.forEach((tone, i) => {
      ctx.fillStyle = tone
      ctx.fillRect(0, Math.floor(i * s / 5), s, Math.ceil(s / 5) + 1)
    })
  }, { srgb: true })
}

// 迭代 14：远景浅中性冷→暖的横向渐变，按 VISUAL.atmosphere.washAlpha 洗墙，
// 不新增生成 PNG；中点用独立 washMid，不再复用 crowdFallback。
function colorWash() {
  return makeTexture(256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    g.addColorStop(0, cssHex(A.coolWash))
    g.addColorStop(0.5, cssHex(A.washMid))
    g.addColorStop(1, cssHex(A.warmWash))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }, { srgb: true, height: 128 })
}

function equirectGradient() {
  return makeTexture(256, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s)
    g.addColorStop(0, cssHex(A.equirectTop))
    g.addColorStop(0.4, cssHex(A.equirectCool))
    g.addColorStop(0.52, cssHex(A.equirectMid))
    g.addColorStop(0.68, cssHex(A.equirectWarm))
    g.addColorStop(1, cssHex(A.equirectBottom))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    const spot = ctx.createRadialGradient(s * 0.5, s * 0.46, 0, s * 0.5, s * 0.46, s * 0.3)
    spot.addColorStop(0, 'rgba(190,225,215,0.42)')
    spot.addColorStop(1, 'rgba(190,225,215,0)')
    ctx.fillStyle = spot
    ctx.fillRect(0, 0, s, s)
  }, { srgb: true })
}

export function createProceduralMaps() {
  const maps = {
    net: netGrid(), ballStripe: ballStripe(), glow: glowSprite(),
    contact: contactShadow(), micro: fineGrain(), ply: plyStripes(),
    equirect: equirectGradient(), wash: colorWash(),
  }
  return {
    maps,
    dispose() { for (const texture of Object.values(maps)) texture.dispose() },
  }
}

export function createEnvironment(renderer, source) {
  try {
    source.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const target = pmrem.fromEquirectangular(source)
    pmrem.dispose()
    return {
      texture: target.texture,
      dispose() { target.dispose() },
    }
  } catch {
    console.warn('环境反射生成失败，已改用纯材质照明，游戏仍可继续。')
    return { texture: null, dispose() {} }
  }
}
