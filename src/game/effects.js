import * as THREE from 'three'
import { COLORS, CONFIG } from './config.js'

export function createTrail(scene, length = 18) {
  const positions = new Float32Array(length * 3)
  const colors = new Float32Array(length * 3)
  const head = new THREE.Color(COLORS.trail)
  const tail = new THREE.Color(COLORS.background)

  for (let i = 0; i < length; i += 1) {
    const color = tail.clone().lerp(head, 1 - i / (length - 1))
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    toneMapped: false,
  })
  const line = new THREE.Line(geometry, material)
  line.frustumCulled = false
  line.visible = false
  scene.add(line)

  const history = []

  return {
    push(point) {
      history.unshift({ x: point.x, y: point.y, z: point.z })
      if (history.length > length) history.pop()
    },
    reset() {
      history.length = 0
      positions.fill(0)
      geometry.attributes.position.needsUpdate = true
      line.visible = false
    },
    update() {
      if (history.length < 2) {
        line.visible = false
        return
      }
      line.visible = true
      for (let i = 0; i < length; i += 1) {
        const point = history[Math.min(i, history.length - 1)]
        positions[i * 3] = point.x
        positions[i * 3 + 1] = point.y
        positions[i * 3 + 2] = point.z
      }
      geometry.attributes.position.needsUpdate = true
    },
    dispose() {
      scene.remove(line)
      geometry.dispose()
      material.dispose()
    },
  }
}

export function createParticles(scene, count = 24) {
  const geometry = new THREE.SphereGeometry(0.012, 8, 6)
  const items = []

  for (let i = 0; i < count; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: COLORS.trail,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.visible = false
    scene.add(mesh)
    items.push({ mesh, material, velocity: { x: 0, y: 0, z: 0 }, life: 0, maxLife: 1 })
  }

  return {
    burst(x, y, z, rng = Math.random) {
      for (const item of items) {
        const angle = rng() * Math.PI * 2
        const speed = 0.6 + rng() * 1.2
        item.mesh.position.set(x, y, z)
        item.mesh.visible = true
        item.life = 0.6 + rng() * 0.3
        item.maxLife = item.life
        item.velocity = {
          x: Math.cos(angle) * speed,
          y: 0.8 + rng() * 1.6,
          z: Math.sin(angle) * speed,
        }
        item.material.opacity = 0.9
      }
    },
    update(dt) {
      for (const item of items) {
        if (item.life <= 0) continue
        item.life -= dt
        if (item.life <= 0) {
          item.mesh.visible = false
          item.material.opacity = 0
          continue
        }
        item.velocity.y += CONFIG.ball.gravity * dt * 0.6
        item.mesh.position.x += item.velocity.x * dt
        item.mesh.position.y += item.velocity.y * dt
        item.mesh.position.z += item.velocity.z * dt
        item.material.opacity = Math.max(0, item.life / item.maxLife) * 0.9
      }
    },
    reset() {
      for (const item of items) {
        item.life = 0
        item.mesh.visible = false
        item.material.opacity = 0
      }
    },
    dispose() {
      for (const item of items) {
        scene.remove(item.mesh)
        item.material.dispose()
      }
      geometry.dispose()
    },
  }
}
