import { CONFIG } from './config.js'
import { createScene, syncMeshes } from './scene.js'
import { createTrail, createParticles } from './effects.js'
import { createAudio } from './audio.js'
import { createGameInput } from './gameInput.js'
import { advancePointPause } from './pointPause.js'
import { ServeClock } from './serveClock.js'
import { createSessionState, sessionPayload, pointResult, frameHooks } from './session.js'
import { advanceSimulation, createSimulation, prepareServe, serveSimulation } from './rally.js'
import { MESSAGES, applyAiLevel } from './matchSettings.js'
import { controlFor, normalizePlayMode } from './playMode.js'
import { normalizeStroke } from './strokes.js'
import { tickFrame } from './engineFrame.js'

export class PongEngine {
  constructor(container, callbacks = {}) {
    this.callbacks = callbacks
    this.container = container
    this.failed = false
    this.running = false
    this.raf = 0

    try {
      this.view = createScene(container)
    } catch {
      this.failed = true
      callbacks.onError?.(MESSAGES.webgl)
      return
    }

    this.trail = createTrail(this.view.scene)
    this.particles = createParticles(this.view.scene)
    this.audio = createAudio()
    this.input = createGameInput(window, container, { isActionMode: () => this.playMode === 'action', onStroke: (type) => this.selectIntent(type) })
    this.sim = createSimulation()
    this.state = createSessionState()
    this.playMode = 'manual'
    this.serveClock = new ServeClock()
    this.accumulator = this.pauseRemaining = this.lastTime = 0

    this.onResize = () => this.view.resize()
    window.addEventListener('resize', this.onResize)
    this.resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(this.onResize)
      : null
    this.resizeObserver?.observe(container)

    syncMeshes(this.view, this.sim)
    this.emit()
    this.running = true
    this.raf = requestAnimationFrame(this.frame)
  }

  frame = (now) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    try {
      const dt = this.lastTime ? Math.min((now - this.lastTime) / 1000, 0.1) : 0
      this.lastTime = now
      tickFrame(this, dt)
    } catch {
      this.fail(MESSAGES.runtime)
    }
  }

  update(dt) {
    if (this.state.phase === 'serving') {
      const pause = advancePointPause(this.pauseRemaining, dt)
      this.pauseRemaining = pause.remaining
      if (pause.expired) {
        prepareServe(this.sim, this.state.server)
        this.state.countdown = this.serveClock.reset()
        this.emit()
        return
      }
      if (this.pauseRemaining > 0) return
      const tick = this.serveClock.tick(dt)
      if (tick.expired) return this.serve()
      if (!tick.changed) return
      this.state.countdown = tick.count
      this.emit()
    }
    if (this.state.phase !== 'playing') return

    this.input.tick(dt)
    const control = controlFor(this.playMode, this.sim, this.input)
    const result = advanceSimulation(this.sim, dt, control.axes, frameHooks(this), control.intent, { speed: control.speed })
    if (result) this.award(result.foul.winner, result.foul.reason, result.position)
  }

  setTip(text) {
    if (this.state.tip === text) return
    this.state.tip = text
    this.emit()
  }

  selectIntent(type) {
    const stroke = this.failed ? null : normalizeStroke(type)
    if (!stroke) return
    this.state.pending = stroke
    this.input.setPendingIntent(stroke)
    this.emit()
  }

  setPlayMode(mode) {
    if (this.failed) return null
    this.playMode = normalizePlayMode(mode)
    this.selectIntent('none')
    return this.playMode
  }

  serve() {
    serveSimulation(this.sim, this.state.server)
    this.trail.reset()
    this.input.resetCharge()
    this.state.phase = 'playing'
    this.state.countdown = this.serveClock.clear()
    this.state.tip = ''
    this.state.message = `${this.state.server === 'player' ? '你' : '对手'}发球，准备接球`
    this.pauseRemaining = 0
    this.emit()
  }

  award(winner, reason, position) {
    const { over, ...fields } = pointResult(this.state, winner, reason)
    Object.assign(this.state, fields)
    this.input.clearPending()
    this.state.phase = over ? 'gameover' : 'serving'
    this.state.countdown = this.serveClock.clear()
    if (over) this.state.winner = winner
    this.audio.play('point')
    this.particles.burst(position.x, Math.max(position.y, 0.8), position.z)
    this.trail.reset()
    this.pauseRemaining = over ? 0 : CONFIG.rules.pointPause
    if (over) prepareServe(this.sim, this.state.server)
    this.emit()
  }

  emit() { const p = sessionPayload(this.state); this.view?.arena?.onState(p); this.callbacks.onState?.(p) }

  fail(message) {
    this.running = false
    cancelAnimationFrame(this.raf)
    this.callbacks.onError?.(message)
  }

  start() {
    if (this.failed) return
    this.audio.unlock()
    this.state.muted = this.audio.isMuted()
    this.restart()
  }

  restart() {
    if (this.failed) return
    this.state.scores = { player: 0, ai: 0 }
    this.state.server = 'player'
    this.state.winner = null
    this.state.phase = 'serving'
    this.state.message = '新的一局开始，准备发球'
    this.state.countdown = this.serveClock.reset()
    this.state.tip = ''
    this.state.pending = 'none'
    this.pauseRemaining = 0
    prepareServe(this.sim, 'player')
    this.accumulator = 0
    this.input.clear()
    this.trail.reset()
    this.particles.reset()
    syncMeshes(this.view, this.sim)
    this.emit()
    if (!this.running) {
      this.running = true
      this.lastTime = 0
      this.raf = requestAnimationFrame(this.frame)
    }
  }

  toggleMuted() {
    if (this.failed) return
    this.state.muted = this.audio.setMuted(!this.audio.isMuted())
    this.emit()
  }

  setAiLevel(level) {
    if (this.failed) return null
    return applyAiLevel(this.sim, level)
  }

  dispose() {
    this.running = false
    cancelAnimationFrame(this.raf)
    if (this.onResize) window.removeEventListener('resize', this.onResize)
    this.resizeObserver?.disconnect()
    const parts = [this.input, this.audio, this.trail, this.particles, this.view]
    for (const part of parts) part?.dispose()
  }
}
