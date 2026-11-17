// WTT 式球台：圆角倒角台面、双层侧带、车削桌腿、横撑、独立白线、网格球网与网柱。
// 台面顶严格落在 CONFIG.table.height，物理 / 判定零改动。
import * as THREE from 'three'
import { COLORS, CONFIG } from './config.js'
import { VISUAL } from './visual.js'

function roundedShape(width, length, radius) {
  const s = new THREE.Shape()
  const x = width / 2
  const y = length / 2
  s.moveTo(-x + radius, -y)
  s.lineTo(x - radius, -y)
  s.quadraticCurveTo(x, -y, x, -y + radius)
  s.lineTo(x, y - radius)
  s.quadraticCurveTo(x, y, x - radius, y)
  s.lineTo(-x + radius, y)
  s.quadraticCurveTo(-x, y, -x, y - radius)
  s.lineTo(-x, -y + radius)
  s.quadraticCurveTo(-x, -y, -x + radius, -y)
  return s
}

function slab(width, length, depth, radius) {
  const geo = new THREE.ExtrudeGeometry(roundedShape(width, length, radius), {
    depth, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004,
    bevelSegments: 1, steps: 1, curveSegments: 4,
  })
  geo.rotateX(-Math.PI / 2)
  geo.computeBoundingBox()
  geo.translate(0, -geo.boundingBox.max.y, 0)
  return geo
}

function legGeometry(height) {
  const points = []
  const steps = 7
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const r = 0.032 - 0.012 * Math.sin(Math.PI * t * 0.85) + 0.006 * t * t
    points.push(new THREE.Vector2(r, t * height))
  }
  return new THREE.LatheGeometry(points, VISUAL.beam.legSegments)
}

function postGeometry(height) {
  const points = [
    new THREE.Vector2(0.026, 0), new THREE.Vector2(0.028, 0.02),
    new THREE.Vector2(0.017, 0.035), new THREE.Vector2(0.014, height * 0.7),
    new THREE.Vector2(0.022, height * 0.92), new THREE.Vector2(0.024, height),
  ]
  return new THREE.LatheGeometry(points, 12)
}

export function buildTable(maps = null) {
  const group = new THREE.Group()
  const { width, length, height, thickness, netHeight } = CONFIG.table
  const M = VISUAL.material

  const top = new THREE.Mesh(
    slab(width, length, thickness, 0.055),
    new THREE.MeshStandardMaterial({
      color: COLORS.table, roughness: M.tableTop.roughness,
      metalness: M.tableTop.metalness,
      roughnessMap: maps?.micro ?? null,
    }),
  )
  top.position.y = height
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)

  const apron = new THREE.Mesh(
    slab(width + 0.018, length + 0.018, 0.032, 0.05),
    new THREE.MeshStandardMaterial({
      color: COLORS.tableEdge, roughness: M.tableApron.roughness,
      metalness: M.tableApron.metalness,
    }),
  )
  apron.position.y = height - thickness - 0.012
  apron.receiveShadow = true
  group.add(apron)

  const trim = new THREE.Mesh(
    slab(width + 0.026, length + 0.026, 0.006, 0.05),
    new THREE.MeshStandardMaterial({
      color: 0x3d524c, roughness: 0.4, metalness: 0.55,
    }),
  )
  trim.position.y = height - thickness - 0.03
  group.add(trim)

  const legMaterial = new THREE.MeshStandardMaterial({
    color: 0x2b343c, roughness: M.steel.roughness, metalness: M.steel.metalness,
  })
  const legGeo = legGeometry(height - thickness)
  const footGeo = new THREE.TorusGeometry(0.034, 0.006, 6, 14)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, legMaterial)
    leg.position.set(sx * (width / 2 - 0.16), 0, sz * (length / 2 - 0.2))
    leg.castShadow = true
    group.add(leg)
    const foot = new THREE.Mesh(footGeo, legMaterial)
    foot.rotation.x = Math.PI / 2
    foot.position.set(leg.position.x, 0.012, leg.position.z)
    group.add(foot)
  }

  const brace = new THREE.Mesh(
    new THREE.CylinderGeometry(0.013, 0.013, width - 0.3, 8), legMaterial,
  )
  brace.rotation.z = Math.PI / 2
  brace.position.set(0, 0.2, 0)
  group.add(brace)

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
      color: COLORS.net, map: maps?.net ?? null, transparent: true,
      opacity: maps?.net ? 0.78 : 0.42, depthWrite: false,
      side: THREE.DoubleSide, roughness: 0.95,
    }),
  )
  net.position.set(0, height + netHeight / 2, 0)
  group.add(net)

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(netWidth, 0.014, 0.014),
    new THREE.MeshStandardMaterial({ color: COLORS.line, roughness: 0.7 }),
  )
  tape.position.set(0, height + netHeight, 0)
  group.add(tape)

  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x57636d, roughness: M.steel.roughness, metalness: M.steel.metalness,
  })
  const postGeo = postGeometry(netHeight + 0.05)
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(postGeo, postMaterial)
    post.position.set(sx * netWidth / 2, height, 0)
    group.add(post)
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.03, 0.05), postMaterial,
    )
    clamp.position.set(sx * netWidth / 2, height + netHeight, 0)
    group.add(clamp)
  }
  return group
}
