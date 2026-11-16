// 静态赛场几何：全部 three 基础几何 + 纯色 / emissive 材质，无外部资源、无新增光源。
import * as THREE from 'three'
import { CONFIG } from './config.js'

export function createVenue(scene) {
  const A = CONFIG.arena
  const group = new THREE.Group()

  const barrier = new THREE.MeshStandardMaterial({ color: A.barrierColor, roughness: 1 })
  const led = new THREE.MeshStandardMaterial({
    color: A.ledColor,
    emissive: A.ledColor,
    emissiveIntensity: A.light.READY.led,
    roughness: 0.5,
  })
  const rig = new THREE.MeshStandardMaterial({ color: 0x222a32, roughness: 0.85 })
  const head = new THREE.MeshBasicMaterial({ color: A.beamColor, toneMapped: false })
  const cone = new THREE.MeshBasicMaterial({
    color: A.beamColor, transparent: true, opacity: A.light.READY.cone,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  })
  const pool = new THREE.MeshBasicMaterial({
    color: A.poolColor, transparent: true, opacity: A.light.READY.pool,
    depthWrite: false, toneMapped: false,
  })
  const audience = new THREE.MeshStandardMaterial({ color: A.audienceColor, roughness: 1 })
  const floorLine = new THREE.MeshBasicMaterial({
    color: A.ledColor, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false,
  })

  const add = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    group.add(mesh)
    return mesh
  }

  // 四面近黑围挡 + 顶部四条青绿 LED 光带（共用同一个 led 材质）。
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.08, 1, 7.2), barrier, side * 2.7, 0.5, 0)
    add(new THREE.BoxGeometry(0.04, 0.03, 7.2), led, side * 2.7, 1.02, 0)
    add(new THREE.BoxGeometry(5.5, 1, 0.08), barrier, 0, 0.5, side * 3.6)
    add(new THREE.BoxGeometry(5.5, 0.03, 0.04), led, 0, 1.02, side * 3.6)
  }

  // 顶部灯架横梁、立柱与灯头：只是几何，不新增真实光源。
  add(new THREE.BoxGeometry(6.2, 0.08, 0.08), rig, 0, 3, 0)
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 3, 0.06), rig, side * 3, 1.5, 0)
    add(new THREE.BoxGeometry(0.5, 0.12, 0.3), head, side * 1, 2.92, 0)
  }

  // 两道半透明光锥：顶点朝下落在台面附近。
  for (const side of [-1, 1]) {
    const beam = add(new THREE.ConeGeometry(1.5, 2.9, 24, 1, true), cone, side * 0.9, 2.2, 0)
    beam.rotation.x = Math.PI
  }

  // 桌面下方的地面光池与细线地贴。
  const poolMesh = add(new THREE.CircleGeometry(2, 32), pool, 0, 0.008, 0)
  poolMesh.rotation.x = -Math.PI / 2
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(5.4, 0.002, 0.012), floorLine, 0, 0.006, side * 2)
  }

  // 三层弧形观众席剪影：单个 InstancedMesh，约 120 个暗色小盒。
  const seats = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.16, 0.22, 0.16), audience, 120,
  )
  const dummy = new THREE.Object3D()
  let index = 0
  for (let row = 0; row < 3; row += 1) {
    for (let seat = 0; seat < 40; seat += 1) {
      const x = -4.4 + seat * (8.8 / 39)
      dummy.position.set(x, 0.7 + row * 0.32, -4.2 - row * 0.55 - 0.6 * Math.abs(x) / 4.4)
      dummy.scale.setScalar(0.85 + ((seat + row) % 5) * 0.06)
      dummy.updateMatrix()
      seats.setMatrixAt(index, dummy.matrix)
      index += 1
    }
  }
  seats.instanceMatrix.needsUpdate = true
  group.add(seats)

  scene.add(group)

  const handle = {
    led,
    cone,
    pool,
    tintMaterials: [led],
    group,
    dispose() {
      scene.remove(group)
      handle.led = null
      handle.cone = null
      handle.pool = null
      handle.tintMaterials = []
    },
  }
  return handle
}
