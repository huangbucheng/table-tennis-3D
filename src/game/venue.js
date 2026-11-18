// WTT 式赛场：环形 LED 广告带、三层观众缎带 + 散景、车削灯头桁架、光锥光池、背景墙。
// handle 形状严格保持 { led, cone, pool, tintMaterials, group, dispose }，不新增真实光源。
import * as THREE from 'three'
import { CONFIG } from './config.js'
import { VISUAL, tagMaps } from './visual.js'
import { createAtmosphere } from './venueAtmosphere.js'

const AT = VISUAL.atmosphere

function lampHeadGeometry() {
  const points = [
    new THREE.Vector2(0.02, 0), new THREE.Vector2(0.14, 0.01),
    new THREE.Vector2(0.17, 0.06), new THREE.Vector2(0.15, 0.13),
    new THREE.Vector2(0.09, 0.2), new THREE.Vector2(0.03, 0.24),
  ]
  return new THREE.LatheGeometry(points, VISUAL.beam.headSegments)
}

export function createVenue(scene, maps = null) {
  const A = CONFIG.arena
  const group = new THREE.Group()
  const L = A.light.READY

  const barrier = new THREE.MeshStandardMaterial({ color: A.barrierColor, roughness: 1 })
  // led 保持纯色，由 arena.js 的 cue 驱动 emissive / intensity；arena.test.js 按颜色定位它。
  const led = new THREE.MeshStandardMaterial({
    color: A.ledColor, emissive: A.ledColor, emissiveIntensity: L.led, roughness: 0.5,
  })
  // 生成贴图本身是低亮度近黑底，emissiveMap 会把它再乘暗一次；提高自发光强度
  // 才能让细光带真正读出来（仍远低于亮部阈值，不炸白）。
  const board = tagMaps(new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x7ee2c0, emissiveIntensity: 2.6, roughness: 0.62,
  }), { map: 'led', emissiveMap: 'led' })
  const crowd = tagMaps(new THREE.MeshBasicMaterial({
    color: 0xffffff, toneMapped: false, side: THREE.DoubleSide,
  }), { map: 'crowd' }, AT.crowdFallback, AT.crowdBoost)
  const rig = new THREE.MeshStandardMaterial({ color: 0x222a32, roughness: 0.85 })
  const steel = new THREE.MeshStandardMaterial({
    color: 0x4a555e, roughness: VISUAL.material.steel.roughness,
    metalness: VISUAL.material.steel.metalness,
  })
  const head = new THREE.MeshBasicMaterial({ color: A.beamColor, toneMapped: false })
  const cone = new THREE.MeshBasicMaterial({
    color: A.beamColor, transparent: true, opacity: L.cone,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  })
  const pool = new THREE.MeshBasicMaterial({
    color: A.poolColor, transparent: true, opacity: L.pool,
    depthWrite: false, toneMapped: false,
  })
  const audience = new THREE.MeshStandardMaterial({ color: A.audienceColor, roughness: 1 })
  const floorLine = new THREE.MeshBasicMaterial({
    color: AT.floorLineColor, transparent: true, opacity: AT.floorLineAlpha,
    depthWrite: false, toneMapped: false,
  })
  const atmosphere = createAtmosphere(maps)

  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }

  // 四面近黑围挡 + 顶部青绿 LED 光带（cue 用）+ 环形广告带（生成贴图）。
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, 1, 7.2), barrier, side * 2.7, 0.5, 0)
    add(new THREE.BoxGeometry(0.04, 0.03, 7.2), led, side * 2.7, 1.02, 0)
    add(new THREE.BoxGeometry(0.035, 0.38, 7.2), board, side * 2.69, 0.72, 0)
    add(new THREE.BoxGeometry(5.5, 1, 0.08), barrier, 0, 0.5, side * 3.6)
    add(new THREE.BoxGeometry(5.5, 0.03, 0.04), led, 0, 1.02, side * 3.6)
    add(new THREE.BoxGeometry(5.5, 0.38, 0.035), board, 0, 0.72, side * 3.59)
  }

  // 环形 LED 屏的竖向拼缝：单个 InstancedMesh，1 个 draw call，
  // 给近黑广告带补上真实的高频结构，而不是靠后期噪点凑细节。
  const seamGeo = new THREE.BoxGeometry(0.007, 0.36, 0.007)
  const seamMat = new THREE.MeshBasicMaterial({
    color: 0xc9e6dc, transparent: true, opacity: 0.52,
    depthWrite: false, toneMapped: false,
  })
  const seamCount = 52
  const seams = new THREE.InstancedMesh(seamGeo, seamMat, seamCount)
  const seamDummy = new THREE.Object3D()
  let seamIndex = 0
  for (const side of [-1, 1]) {
    for (let i = 0; i < 14; i += 1) {
      seamDummy.position.set(side * 2.668, 0.72, -3.45 + i * (6.9 / 13))
      seamDummy.updateMatrix()
      seams.setMatrixAt(seamIndex, seamDummy.matrix)
      seamIndex += 1
    }
    for (let i = 0; i < 12; i += 1) {
      seamDummy.position.set(-2.65 + i * (5.3 / 11), 0.72, side * 3.572)
      seamDummy.updateMatrix()
      seams.setMatrixAt(seamIndex, seamDummy.matrix)
      seamIndex += 1
    }
  }
  seams.instanceMatrix.needsUpdate = true
  group.add(seams)

  // 三层观众缎带 + 散景光点 + 远端视频墙，取代 120 个同色小盒。
  for (let row = 0; row < 3; row += 1) {
    add(new THREE.PlaneGeometry(9.4, 1.15), crowd,
      0, 0.85 + row * 0.34, -4.3 - row * 0.56)
  }
  group.add(atmosphere.group)
  add(new THREE.PlaneGeometry(9.4, 2.1), board, 0, 2.15, -6.2)

  // 桁架：横梁 + 立柱 + 斜撑 + 车削灯头 + 灯头光晕。
  add(new THREE.CylinderGeometry(0.035, 0.035, 6.2, 10), rig, 0, 3, 0)
    .rotation.z = Math.PI / 2
  const headGeo = lampHeadGeometry()
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 3, 10), rig, side * 3, 1.5, 0)
    const brace = add(new THREE.CylinderGeometry(0.018, 0.018, 1.15, 8), rig,
      side * 2.25, 2.72, 0)
    brace.rotation.z = side * 0.72
    const lamp = add(headGeo, steel, side * 1, 2.78, 0)
    lamp.rotation.x = Math.PI
    add(new THREE.SphereGeometry(0.085, 12, 8), head, side * 1, 2.82, 0)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      color: A.beamColor, map: maps?.glow ?? null, transparent: true,
      opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending,
      toneMapped: false,
    }))
    halo.position.set(side * 1, 2.82, 0)
    halo.scale.setScalar(VISUAL.glow.headSize)
    group.add(halo)
  }

  // 两道半透明光锥 + 地面光池 + 细线地贴。
  for (const side of [-1, 1]) {
    const beam = add(new THREE.ConeGeometry(1.5, 2.9, VISUAL.beam.coneSegments, 1, true),
      cone, side * 0.9, 2.2, 0)
    beam.rotation.x = Math.PI
  }
  const poolMesh = add(new THREE.CircleGeometry(2, 32), pool, 0, 0.008, 0)
  poolMesh.rotation.x = -Math.PI / 2
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(5.4, 0.002, 0.012), floorLine, 0, 0.006, side * 2)
  }

  // 保留少量暗色座席剪影做近景遮挡，仍为单个 InstancedMesh。
  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.22, 0.16), audience, 60,
  )
  const dummy = new THREE.Object3D()
  for (let i = 0; i < 60; i += 1) {
    dummy.position.set(-4.4 + i * (8.8 / 59), 0.62, -3.95 - 0.4 * Math.abs(i / 59 - 0.5))
    dummy.scale.setScalar(0.85 + (i % 5) * 0.06)
    dummy.updateMatrix()
    seats.setMatrixAt(i, dummy.matrix)
  }
  seats.instanceMatrix.needsUpdate = true
  group.add(seats)

  scene.add(group)
  const handle = {
    led, cone, pool, tintMaterials: [led, board], group,
    dispose() {
      scene.remove(group)
      atmosphere.dispose()
      handle.led = null
      handle.cone = null
      handle.pool = null
      handle.tintMaterials = []
    },
  }
  return handle
}
