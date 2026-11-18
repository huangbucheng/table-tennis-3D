// PongEngine 每帧的固定步进与表现更新，three 适配层；行为与迭代 14 的 frame() 逐位一致。
// 迭代 15 为给模式接线腾出 ≤200 行空间而抽出，不改变任何调用顺序或数值。
import { CONFIG } from './config.js'
import { syncMeshes } from './scene.js'

export function tickFrame(engine, dt) {
  engine.accumulator += dt
  let steps = 0
  while (engine.accumulator >= CONFIG.fixedDt && steps < CONFIG.maxSubsteps) {
    engine.update(CONFIG.fixedDt)
    engine.accumulator -= CONFIG.fixedDt
    steps += 1
  }
  if (steps === CONFIG.maxSubsteps) engine.accumulator = 0

  engine.particles.update(dt)
  engine.view.arena?.step(dt)
  engine.trail.update()
  syncMeshes(engine.view, engine.sim)
  engine.view.renderer.render(engine.view.scene, engine.view.camera)
}
