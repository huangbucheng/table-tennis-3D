// 生成贴图加载：Vite 用 new URL(..., import.meta.url) 指纹化并带上 base 前缀。
// 刻意不用 `import '*.png'`：Node 单测会 import 到 scene.js，静态 PNG import 会触发
// ERR_UNKNOWN_FILE_EXTENSION。顶层只声明函数，不碰 DOM / canvas / loader。
import * as THREE from 'three'
import { VISUAL } from './visual.js'

const SOURCES = [
  ['led', new URL('../assets/textures/led-board.png', import.meta.url).href,
    VISUAL.texture.ledRepeatX, VISUAL.texture.ledRepeatY],
  ['crowd', new URL('../assets/textures/crowd-bokeh.png', import.meta.url).href,
    VISUAL.texture.crowdRepeatX, 1],
  ['floor', new URL('../assets/textures/court-floor.png', import.meta.url).href,
    VISUAL.texture.floorRepeat, VISUAL.texture.floorRepeat],
  ['rubber', new URL('../assets/textures/paddle-rubber.png', import.meta.url).href,
    VISUAL.texture.rubberRepeatX, VISUAL.texture.rubberRepeatY],
  ['wood', new URL('../assets/textures/paddle-wood.png', import.meta.url).href,
    VISUAL.texture.woodRepeatX, VISUAL.texture.woodRepeatY],
]

export function createGeneratedMaps(renderer) {
  const loader = new THREE.TextureLoader()
  const maps = {}
  const ready = new Set()
  let boundScene = null
  const anisotropy = Math.min(
    VISUAL.texture.maxAnisotropy,
    renderer?.capabilities?.getMaxAnisotropy?.() ?? 1,
  )

  const apply = (key) => {
    if (!boundScene) return
    boundScene.traverse((obj) => {
      const list = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : []
      for (const material of list) {
        const pending = material.userData?.pendingMaps
        if (!pending) continue
        for (const [slot, wanted] of Object.entries(pending)) {
          if (wanted !== key) continue
          material[slot] = maps[key]
          if (material.userData.mapBaseColor !== undefined) {
            material.color.setHex(material.userData.mapBaseColor)
            if (material.userData.mapBoost > 1) {
              material.color.multiplyScalar(material.userData.mapBoost)
            }
          }
          material.needsUpdate = true
        }
      }
    })
  }

  for (const [key, url, rx, ry] of SOURCES) {
    const texture = loader.load(
      url,
      () => { ready.add(key); apply(key) },
      undefined,
      () => console.warn(`贴图 ${key} 加载失败，已保留纯色材质，游戏仍可继续。`),
    )
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(rx, ry)
    texture.anisotropy = anisotropy
    maps[key] = texture
  }

  return {
    maps,
    // 场景建完再绑定：加载完成前材质保持纯色占位，onError 也不产生静默白块。
    bind(scene) {
      boundScene = scene
      for (const key of ready) apply(key)
    },
    dispose() {
      boundScene = null
      ready.clear()
      for (const texture of Object.values(maps)) texture.dispose()
    },
  }
}
