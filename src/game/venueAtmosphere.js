// 迭代 13：静态远景氛围层。刻意不接 arena 的 cue / tint 通路，也不新增真实光源，
// 因此 playing 期间亮度恒定；createAtmosphere(null) 必须合法（arena.test.js 不传 maps）。
import * as THREE from 'three'
import { VISUAL } from './visual.js'

const A = VISUAL.atmosphere
const G = VISUAL.glow

// 与迭代 12 完全相同的散景点位公式，只多一组逐点冷暖色；按索引做低差异交错，
// 不用 Math.random，保证前后截图可复现。
function bokehGeometry() {
  const count = G.bokehCount
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  const cool = new THREE.Color(A.bokehCool)
  const warm = new THREE.Color(A.bokehWarm)
  for (let i = 0; i < count; i += 1) {
    const t = i / count
    const row = i % 3
    positions[i * 3] = -4.6 + ((i * 0.618033) % 1) * 9.2
    positions[i * 3 + 1] = 0.85 + row * 0.34 + ((i * 0.371) % 1) * 0.22
    positions[i * 3 + 2] = -4.35 - row * 0.56 - 0.5 * Math.abs(t - 0.5)
    const c = (i * 0.61803398875) % 1 < A.bokehWarmRatio ? warm : cool
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

export function createAtmosphere(maps = null) {
  const group = new THREE.Group()

  const bokeh = new THREE.Points(bokehGeometry(), new THREE.PointsMaterial({
    color: 0xffffff, map: maps?.glow ?? null, size: G.spriteSize,
    transparent: true, opacity: 0.68, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, vertexColors: true,
  }))
  group.add(bokeh)

  // 放在远端 LED 视频墙 z=-6.2 之前 0.1m：墙是不透明的，放到后面会被完全遮住。
  // 按 VISUAL.atmosphere.washAlpha 作浅中性冷→暖洗墙，落在球台之外的远景，不参与读球区域。
  const wash = new THREE.Mesh(
    new THREE.PlaneGeometry(11.5, 3.4),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, map: maps?.wash ?? null,
      transparent: true, opacity: A.washAlpha, depthWrite: false,
      toneMapped: false, side: THREE.DoubleSide,
    }),
  )
  wash.position.set(0, 2.15, -6.1)
  group.add(wash)

  return {
    group,
    dispose() {
      for (const child of group.children) {
        child.geometry?.dispose()
        child.material?.dispose()
      }
      group.clear()
    },
  }
}
