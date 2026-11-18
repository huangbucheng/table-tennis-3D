import * as THREE from 'three'
import { COLORS, CONFIG } from './config.js'
import { buildPaddle, buildTable } from './models.js'
import { createArena } from './arena.js'
import { VISUAL, tagMaps } from './visual.js'
import { createGeneratedMaps } from './generatedMaps.js'
import { createEnvironment, createProceduralMaps } from './proceduralMaps.js'

function disposeTree(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose()
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}

// 环境反射只给金属件：全局 scene.environment 会让每个 PBR 片元都采样 PMREM，
// 在软件渲染下代价极高，而 WTT 质感只需要金属立柱 / 网柱 / 桌腿吃到冷光反射。
function applyEnvironment(scene, texture) {
  scene.traverse((child) => {
    const materials = Array.isArray(child.material)
      ? child.material
      : child.material ? [child.material] : []
    for (const material of materials) {
      if (!material.isMeshStandardMaterial) continue
      material.envMapIntensity = VISUAL.env.intensity
      if (texture && material.metalness >= 0.5) material.envMap = texture
    }
  })
}

export function createScene(container) {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(COLORS.background)
  // 迭代 13：远端雾距 18→22，让抬亮后的远景不被过早压回背景色。
  scene.fog = new THREE.Fog(COLORS.background, VISUAL.atmosphere.fogNear, VISUAL.atmosphere.fogFar)

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

  // 程序化贴图同步可用；三张生成图异步加载，未就绪前材质保持深色纯色占位。
  const procedural = createProceduralMaps()
  const generated = createGeneratedMaps(renderer)
  const maps = { ...procedural.maps, ...generated.maps }
  const environment = createEnvironment(renderer, maps.equirect)

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    tagMaps(new THREE.MeshStandardMaterial({
      color: COLORS.floor, roughness: VISUAL.material.floor.roughness,
      metalness: VISUAL.material.floor.metalness, roughnessMap: maps.micro,
    }), { map: 'floor' }, COLORS.floor, VISUAL.atmosphere.floorBoost),
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

  scene.add(buildTable(maps))

  const playerPaddle = buildPaddle(COLORS.playerBlade, COLORS.playerRim, maps)
  playerPaddle.position.set(0, 0.98, CONFIG.paddle.playerZ)
  scene.add(playerPaddle)

  const aiPaddle = buildPaddle(COLORS.aiBlade, COLORS.aiRim, maps)
  aiPaddle.position.set(0, 0.98, CONFIG.paddle.aiZ)
  aiPaddle.rotation.y = Math.PI
  scene.add(aiPaddle)

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.ball.radius, 28, 20),
    new THREE.MeshStandardMaterial({
      color: COLORS.ball, map: maps.ballStripe,
      roughness: VISUAL.material.ball.roughness,
      metalness: VISUAL.material.ball.metalness,
      emissive: 0x4a4a42, emissiveIntensity: 0.2,
    }),
  )
  ball.castShadow = true
  ball.position.set(0, CONFIG.ball.serveY, CONFIG.ball.serveZ)
  scene.add(ball)

  // 柔和接触阴影：不进 shadow map、不吃光源，只跟随球的 x/z 并随高度淡出。
  const contact = new THREE.Sprite(new THREE.SpriteMaterial({
    map: maps.contact, transparent: true, opacity: VISUAL.shadow.opacity,
    depthWrite: false, toneMapped: false,
  }))
  contact.scale.setScalar(VISUAL.shadow.size)
  contact.position.set(0, CONFIG.table.height + 0.003, CONFIG.ball.serveZ)
  ball.userData.contactShadow = contact
  scene.add(contact)

  const arena = createArena(scene, { ambient, key: keyLight, fill: fillLight }, maps)
  applyEnvironment(scene, environment.texture)
  generated.bind(scene)

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
      environment.dispose()
      generated.dispose()
      procedural.dispose()
      arena.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    },
  }
}

// 把纯状态映射到 mesh 位置，每帧由引擎调用；签名与返回形状保持不变。
export function syncMeshes(view, sim) {
  if (!view) return
  view.ball.position.set(sim.ball.position.x, sim.ball.position.y, sim.ball.position.z)
  view.playerPaddle.position.set(sim.playerPaddle.x, sim.playerPaddle.y, sim.playerPaddle.z)
  view.aiPaddle.position.set(sim.aiPaddle.x, sim.aiPaddle.y, sim.aiPaddle.z)
  const shadow = view.ball.userData?.contactShadow
  if (!shadow) return
  const height = Math.max(0, sim.ball.position.y - CONFIG.table.height)
  shadow.position.set(sim.ball.position.x, CONFIG.table.height + 0.003, sim.ball.position.z)
  shadow.scale.setScalar(VISUAL.shadow.size * (1 + Math.min(height, 1) * 0.7))
  shadow.material.opacity = VISUAL.shadow.opacity * Math.max(0.15, 1 - height)
}
