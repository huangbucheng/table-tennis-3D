// 近圆真实竞技拍：圆润拍面 + 短颈 + 平滑收腰木柄 + 沿轮廓闭合的细边圈。
// 5 个 mesh，无 TorusGeometry 环；最大宽度恒等于 2 * CONFIG.paddle.bladeRadius。
import * as THREE from 'three'
import { CONFIG } from './config.js'
import { VISUAL, tagMaps } from './visual.js'
import { paddleOutline, handleProfile } from './paddleProfile.js'

const R = CONFIG.paddle.bladeRadius
const P = VISUAL.paddle
const M = VISUAL.material
const BOTTOM = Math.abs(P.neckBottomRatio) * R

function outlineShape(points, scale = 1) {
  const shape = new THREE.Shape()
  points.slice(0, -1).forEach(([x, y], i) => {
    if (i === 0) shape.moveTo(x * scale, y * scale)
    else shape.lineTo(x * scale, y * scale)
  })
  shape.closePath()
  return shape
}

function bladeGeometry(outline) {
  // 关掉 bevel：拍面外沿严格落在轮廓上，圆润感交给独立的闭合边圈。
  const geo = new THREE.ExtrudeGeometry(outlineShape(outline), {
    depth: 0.012, bevelEnabled: false, steps: 1, curveSegments: 1,
  })
  geo.translate(0, 0, -0.006)
  return geo
}

function rimGeometry(outline) {
  // 边圈中心内缩两个管半径：闭合 CatmullRom 的微小外扩也不会越过 bladeRadius，
  // 因此整拍宽度仍由拍面决定，且边圈在正面可见为一道细窄压边。
  const scale = (R - 2 * P.rimRadius) / R
  const points = outline.slice(0, -1).map(([x, y]) =>
    new THREE.Vector3(x * scale, y * scale, 0))
  const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal')
  return new THREE.TubeGeometry(curve, P.outlineSteps - 1, P.rimRadius, 5, true)
}

export function buildPaddle(bladeColor, rimColor, maps) {
  const group = new THREE.Group()
  const outline = paddleOutline(P.outlineSteps)
  const handle = handleProfile()

  const rubber = tagMaps(new THREE.MeshStandardMaterial({
    emissive: bladeColor, emissiveIntensity: P.rubberEmissive,
    roughness: M.rubber.roughness, metalness: M.rubber.metalness,
  }), { map: 'rubber' }, P.rubberFallback, 1, bladeColor)
  const ply = new THREE.MeshStandardMaterial({
    color: P.plyColor, map: maps?.ply ?? null,
    roughness: M.wood.roughness, metalness: M.wood.metalness,
  })
  const blade = new THREE.Mesh(bladeGeometry(outline), [rubber, ply])
  blade.castShadow = true
  group.add(blade)

  const back = new THREE.Mesh(
    new THREE.ShapeGeometry(outlineShape(outline, P.backScale)),
    new THREE.MeshStandardMaterial({
      color: P.backColor, side: THREE.DoubleSide, roughness: P.backRoughness,
    }),
  )
  back.position.z = -0.009
  group.add(back)

  const rim = new THREE.Mesh(rimGeometry(outline), new THREE.MeshStandardMaterial({
    color: rimColor, emissive: rimColor, emissiveIntensity: P.rimEmissive,
    roughness: P.rimRoughness,
  }))
  rim.position.z = 0.006
  group.add(rim)

  const wood = tagMaps(new THREE.MeshStandardMaterial({
    roughness: M.wood.roughness, metalness: M.wood.metalness,
  }), { map: 'wood' }, P.woodFallback)
  const grip = new THREE.Mesh(
    new THREE.LatheGeometry(handle.map(([r, y]) => new THREE.Vector2(r, y)), 16),
    wood,
  )
  grip.rotation.z = Math.PI
  grip.position.set(0, -BOTTOM, 0)
  grip.castShadow = true
  group.add(grip)

  const cap = new THREE.Mesh(
    new THREE.CylinderGeometry(P.capRadius, P.capRadius, P.capThickness, 12),
    new THREE.MeshStandardMaterial({ color: P.capColor, roughness: P.capRoughness }),
  )
  cap.position.set(0, -BOTTOM - handle[handle.length - 1][1], 0)
  group.add(cap)
  return group
}
