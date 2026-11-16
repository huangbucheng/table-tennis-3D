// three 适配层：把 arenaState 的纯状态机结果写进灯光与材质。
// 差分与插值分工明确 —— onState 只更新目标，step 才推进当前值。
import * as THREE from 'three'
import { CONFIG } from './config.js'
import { LIGHT_KEYS, cueFromTransition, damp, decayPulse, lightTarget } from './arenaState.js'
import { createVenue } from './venue.js'

export function createArena(scene, lights = {}) {
  const A = CONFIG.arena
  const venue = createVenue(scene)
  const tints = {}
  for (const [key, value] of Object.entries(A.tints)) tints[key] = new THREE.Color(value)
  const ledColor = new THREE.Color(A.tints.default)
  let prevPayload = null
  let tint = 'default'

  const api = {
    current: { ...A.light.READY },
    target: { ...A.light.READY },
    pulseValue: 0,

    onState(payload) {
      const diff = cueFromTransition(prevPayload, payload)
      prevPayload = payload && typeof payload === 'object'
        ? { ...payload, scores: { ...(payload.scores || {}) } }
        : null
      if (!diff) return
      const next = lightTarget(diff.cue, diff.ctx)
      for (const key of LIGHT_KEYS) api.target[key] = next[key]
      tint = next.tint
      if (diff.pulse) api.pulseValue = 1
    },

    step(dt) {
      const stepDt = Number.isFinite(dt) && dt > 0 ? dt : 0
      const alpha = stepDt > 0 ? 1 - Math.exp(-stepDt / A.damping) : 0
      for (const key of LIGHT_KEYS) {
        api.current[key] = damp(api.current[key], api.target[key], stepDt, A.damping)
      }
      api.pulseValue = decayPulse(api.pulseValue, stepDt)
      const pulse = api.pulseValue
      ledColor.lerp(tints[tint] || tints.default, alpha)

      if (lights.ambient) lights.ambient.intensity = api.current.ambient
      if (lights.key) lights.key.intensity = api.current.key + pulse * A.pulseKey
      if (lights.fill) lights.fill.intensity = api.current.fill
      if (venue.led) {
        venue.led.emissiveIntensity = api.current.led + pulse * A.pulseLed
        venue.led.emissive.copy(ledColor)
      }
      if (venue.cone) venue.cone.opacity = api.current.cone
      if (venue.pool) venue.pool.opacity = api.current.pool
      for (const material of venue.tintMaterials) material.emissive?.copy(ledColor)
    },

    dispose() {
      prevPayload = null
      venue.dispose()
    },
  }
  return api
}
