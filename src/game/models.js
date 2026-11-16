import * as THREE from 'three'
import { COLORS, CONFIG } from './config.js'

export function buildTable() {
  const group = new THREE.Group()
  const { width, length, height, thickness, netHeight } = CONFIG.table

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width, thickness, length),
    new THREE.MeshStandardMaterial({ color: COLORS.table, roughness: 0.78, metalness: 0.02 }),
  )
  top.position.y = height - thickness / 2
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  const apron = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.02, 0.035, length + 0.02),
    new THREE.MeshStandardMaterial({ color: COLORS.tableEdge, roughness: 0.9 }),
  )
  apron.position.y = height - thickness - 0.016
  apron.receiveShadow = true
  group.add(apron)

  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x303840, roughness: 0.85 })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.024, 0.03, height - thickness, 10),
        legMaterial,
      )
      leg.position.set(sx * (width / 2 - 0.14), (height - thickness) / 2, sz * (length / 2 - 0.18))
      leg.castShadow = true
      group.add(leg)
    }
  }

  const lineMaterial = new THREE.MeshBasicMaterial({ color: COLORS.line })
  const lineWidth = 0.012
  const lineY = height + 0.0015
  const addLine = (w, l, x, z) => {
    const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.002, l), lineMaterial)
    line.position.set(x, lineY, z)
    group.add(line)
  }
  addLine(width, lineWidth, 0, length / 2 - lineWidth / 2)
  addLine(width, lineWidth, 0, -length / 2 + lineWidth / 2)
  addLine(lineWidth, length, width / 2 - lineWidth / 2, 0)
  addLine(lineWidth, length, -width / 2 + lineWidth / 2, 0)
  addLine(0.006, length, 0, 0)

  const netWidth = width + 0.12
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(netWidth, netHeight),
    new THREE.MeshStandardMaterial({
      color: COLORS.net,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.95,
    }),
  )
  net.position.set(0, height + netHeight / 2, 0)
  group.add(net)

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(netWidth, 0.012, 0.012),
    new THREE.MeshStandardMaterial({ color: COLORS.line, roughness: 0.7 }),
  )
  tape.position.set(0, height + netHeight, 0)
  group.add(tape)

  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x464f58, roughness: 0.7 })
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, netHeight + 0.05, 10),
      postMaterial,
    )
    post.position.set(sx * netWidth / 2, height + (netHeight + 0.05) / 2, 0)
    group.add(post)
  }

  return group
}

export function buildPaddle(bladeColor, rimColor) {
  const group = new THREE.Group()
  // 视觉尺寸与判定尺寸共用 config 的单一真源。
  const rimRadius = CONFIG.paddle.bladeRadius
  const bladeRadius = rimRadius - 0.01

  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(rimRadius, rimRadius, 0.012, 32),
    new THREE.MeshStandardMaterial({
      color: rimColor,
      emissive: rimColor,
      emissiveIntensity: 0.3,
      roughness: 0.5,
    }),
  )
  rim.rotation.x = Math.PI / 2
  group.add(rim)

  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(bladeRadius, bladeRadius, 0.018, 32),
    new THREE.MeshStandardMaterial({
      color: bladeColor,
      emissive: bladeColor,
      emissiveIntensity: 0.45,
      roughness: 0.65,
    }),
  )
  blade.rotation.x = Math.PI / 2
  blade.castShadow = true
  group.add(blade)

  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.11, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x454f59, roughness: 0.85 }),
  )
  handle.position.y = -0.118
  handle.castShadow = true
  group.add(handle)

  return group
}
