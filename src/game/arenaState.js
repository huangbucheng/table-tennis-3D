// 灯光状态机，纯逻辑：不 import three、不访问 DOM、不修改入参。
// 只输出可断言的普通数值对象与 tint 枚举，写灯光由 arena.js 适配层负责。
import { CONFIG } from './config.js'
import { matchPointSide } from './broadcast.js'

export const CUES = Object.freeze({
  READY: 'ready',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  GAMEOVER: 'gameover',
})

export const LIGHT_KEYS = Object.freeze(['ambient', 'key', 'fill', 'led', 'cone', 'pool'])

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))
const finite = (value) => (Number.isFinite(value) ? value : 0)

const copyVector = (source) => {
  const out = {}
  for (const key of LIGHT_KEYS) out[key] = finite(source?.[key])
  return out
}

const mixVector = (from, to, t) => {
  const out = {}
  for (const key of LIGHT_KEYS) out[key] = from[key] + (to[key] - from[key]) * t
  return out
}

// 四档 cue 的目标向量；未知 cue 一律回退 PLAYING 基线。
export function lightTarget(cue, ctx = {}) {
  const light = CONFIG.arena.light
  const c = ctx && typeof ctx === 'object' ? ctx : {}
  if (cue === CUES.READY) return { ...copyVector(light.READY), tint: 'default' }
  if (cue === CUES.COUNTDOWN) {
    const t = (3 - clamp(finite(c.countdown), 1, 3)) / 2
    return {
      ...mixVector(copyVector(light.READY), copyVector(light.PLAYING), t),
      tint: c.matchPoint ? 'match' : 'default',
    }
  }
  if (cue === CUES.GAMEOVER) {
    return { ...copyVector(light.GAMEOVER), tint: c.winner === 'player' ? 'win' : 'lose' }
  }
  if (cue === CUES.PLAYING) {
    return { ...copyVector(light.PLAYING), tint: c.matchPoint ? 'match' : 'default' }
  }
  return { ...copyVector(light.PLAYING), tint: 'default' }
}

const scoreOf = (payload) => ({
  player: finite(payload?.scores?.player),
  ai: finite(payload?.scores?.ai),
})

const signature = (payload) => {
  const scores = scoreOf(payload)
  return [
    payload?.phase ?? null,
    finite(payload?.countdown),
    scores.player,
    scores.ai,
    payload?.winner ?? null,
  ]
}

const cueForPhase = (phase) => {
  if (phase === 'ready') return CUES.READY
  if (phase === 'serving') return CUES.COUNTDOWN
  if (phase === 'gameover') return CUES.GAMEOVER
  return CUES.PLAYING
}

// 比较上一份与这一份 payload 的相关字段；都没变返回 null，arena 完全不动。
export function cueFromTransition(prev, next) {
  if (!next || typeof next !== 'object') return null
  const first = prev == null
  if (!first) {
    const before = signature(prev)
    const after = signature(next)
    if (before.every((value, index) => value === after[index])) return null
  }
  const scores = scoreOf(next)
  const beforeScores = scoreOf(prev)
  const pulse = !first &&
    scores.player + scores.ai > beforeScores.player + beforeScores.ai &&
    Number.isFinite(next.scores?.player) &&
    Number.isFinite(next.scores?.ai)
    ? 1
    : 0
  return {
    cue: cueForPhase(next.phase),
    pulse,
    ctx: {
      countdown: finite(next.countdown),
      winner: next.winner ?? null,
      matchPoint: matchPointSide(next.scores),
    },
  }
}

// 指数阻尼插值；dt <= 0 返回原值，非有限输入不产生 NaN。
export function damp(current, target, dt, tau = CONFIG.arena.damping) {
  const from = finite(current)
  if (!Number.isFinite(target) || !Number.isFinite(dt) || dt <= 0 ||
      !Number.isFinite(tau) || tau <= 0) return from
  return from + (target - from) * (1 - Math.exp(-dt / tau))
}

// 得分闪光脉冲，恒 clamp 到 [0, 1]。
export function decayPulse(pulse, dt) {
  const value = clamp(finite(pulse), 0, 1)
  if (!Number.isFinite(dt) || dt <= 0) return value
  return clamp(value * Math.exp(-dt / CONFIG.arena.pulseDecay), 0, 1)
}
