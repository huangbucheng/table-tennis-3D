import * as THREE from 'three'
import { COLORS, CONFIG } from './config.js'
import { buildPaddle, buildTable } from './models.js'
import { createArena } from './arena.js'

function disposeTree(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

export function createScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)
  scene.fog = new THREE.Fog(COLORS.background, 8, 18)

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
  camera.position.set(0, 1.52, 2.5)
  camera.lookAt(0, 0.82, 0)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  container.appendChild(renderer.domElement)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const light = CONFIG.arena.light.READY
  const ambient = new THREE.AmbientLight(0xffffff, light.ambient)
  scene.add(ambient)

  const keyLight = new THREE.DirectionalLight(CONFIG.arena.beamColor, light.key)
  keyLight.position.set(2.2, 4.5, 2.2)
  keyLight.castShadow = true
  keyLight.shadow.mapSize.set(1024, 1024)
  keyLight.shadow.camera.left = -3
  keyLight.shadow.camera.right = 3
  keyLight.shadow.camera.top = 3
  keyLight.shadow.camera.bottom = -3
  keyLight.shadow.camera.near = 0.5
  keyLight.shadow.camera.far = 12
  keyLight.shadow.bias = -0.0005
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0xdfe6ea, light.fill)
  fillLight.position.set(-2.5, 2, -2)
  scene.add(fillLight)

  scene.add(buildTable())

  const playerPaddle = buildPaddle(COLORS.playerBlade, COLORS.playerRim)
  playerPaddle.position.set(0, 0.98, CONFIG.paddle.playerZ)
  scene.add(playerPaddle)

  const aiPaddle = buildPaddle(COLORS.aiBlade, COLORS.aiRim)
  aiPaddle.position.set(0, 0.98, CONFIG.paddle.aiZ)
  aiPaddle.rotation.y = Math.PI
  scene.add(aiPaddle)

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.ball.radius, 18, 12),
    new THREE.MeshStandardMaterial({
      color: COLORS.ball,
      roughness: 0.35,
      emissive: 0x4a4a42,
      emissiveIntensity: 0.2,
    }),
  )
  ball.castShadow = true
  ball.position.set(0, CONFIG.ball.serveY, CONFIG.ball.serveZ)
  scene.add(ball)

  const arena = createArena(scene, { ambient, key: keyLight, fill: fillLight })

  const resize = () => {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
  }
  resize()

  return {
    scene,
    camera,
    renderer,
    ball,
    playerPaddle,
    aiPaddle,
    arena,
    resize,
    dispose() {
      disposeTree(scene)
      arena.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}

// 把纯状态映射到 mesh 位置，每帧由引擎调用。
export function syncMeshes(view, sim) {
  if (!view) return
  view.ball.position.set(sim.ball.position.x, sim.ball.position.y, sim.ball.position.z)
  view.playerPaddle.position.set(sim.playerPaddle.x, sim.playerPaddle.y, sim.playerPaddle.z)
  view.aiPaddle.position.set(sim.aiPaddle.x, sim.aiPaddle.y, sim.aiPaddle.z)
}
