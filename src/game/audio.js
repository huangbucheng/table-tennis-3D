const TONES = {
  hit: { frequency: 760, duration: 0.09, type: 'triangle', gain: 0.12 },
  bounce: { frequency: 380, duration: 0.06, type: 'sine', gain: 0.07 },
  point: { frequency: 520, duration: 0.24, type: 'sine', gain: 0.12 },
}

export function createAudio() {
  let context = null
  let muted = false
  let available = true

  const ensureContext = () => {
    if (!available) return null
    if (context) return context
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext
      if (!AudioContextClass) {
        available = false
        muted = true
        return null
      }
      context = new AudioContextClass()
    } catch {
      available = false
      muted = true
      context = null
    }
    return context
  }

  return {
    unlock() {
      const ctx = ensureContext()
      if (!ctx || ctx.state !== 'suspended') return
      ctx.resume().catch(() => {
        muted = true
      })
    },
    play(kind) {
      if (muted) return
      const tone = TONES[kind]
      if (!tone) return
      const ctx = ensureContext()
      if (!ctx) return
      try {
        const now = ctx.currentTime
        const oscillator = ctx.createOscillator()
        const envelope = ctx.createGain()
        oscillator.type = tone.type
        oscillator.frequency.setValueAtTime(tone.frequency, now)
        if (kind === 'point') {
          oscillator.frequency.exponentialRampToValueAtTime(tone.frequency * 1.5, now + tone.duration)
        }
        envelope.gain.setValueAtTime(tone.gain, now)
        envelope.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration)
        oscillator.connect(envelope)
        envelope.connect(ctx.destination)
        oscillator.start(now)
        oscillator.stop(now + tone.duration + 0.02)
      } catch {
        muted = true
      }
    },
    setMuted(value) {
      muted = Boolean(value)
      if (!muted) {
        this.unlock()
        if (!ensureContext()) muted = true
      }
      return muted
    },
    isMuted() {
      return muted
    },
    dispose() {
      if (context) context.close().catch(() => {})
      context = null
    },
  }
}
