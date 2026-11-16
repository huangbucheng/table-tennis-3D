<script setup>
import { computed } from 'vue'
import { ROUND_LABEL, matchPointLabel, matchPointSide } from '../game/broadcast.js'

const props = defineProps({
  playerScore: { type: Number, required: true },
  aiScore: { type: Number, required: true },
  server: { type: String, required: true },
  message: { type: String, default: '' },
  tip: { type: String, default: '' },
})

const serverLabel = computed(() => (props.server === 'player' ? '你' : '对手'))
const matchPoint = computed(() => matchPointSide({ player: props.playerScore, ai: props.aiScore }))
const matchLabel = computed(() => matchPointLabel(matchPoint.value))
</script>

<template>
  <div class="scoreboard">
    <span class="sr-only">
      当前比分：你 {{ props.playerScore }} 分，对手 {{ props.aiScore }} 分；发球方是
      {{ serverLabel }}；{{ matchPoint ? (matchPoint === 'player' ? '你拿到赛点' : '对手拿到赛点') : '暂无赛点' }}
    </span>

    <div class="scorebar" aria-hidden="true">
      <div class="score-side" :class="{ 'is-serving': props.server === 'player' }">
        <span class="serve-dot" :class="{ 'is-on': props.server === 'player' }"></span>
        <span class="side-name">你</span>
        <span v-if="matchPoint === 'player'" class="match-badge">{{ matchLabel }}</span>
        <span class="score-value">{{ props.playerScore }}</span>
      </div>

      <div class="score-mid">
        <span class="score-divider">:</span>
        <span class="round-label">{{ ROUND_LABEL }}</span>
      </div>

      <div class="score-side" :class="{ 'is-serving': props.server === 'ai' }">
        <span class="score-value">{{ props.aiScore }}</span>
        <span v-if="matchPoint === 'ai'" class="match-badge">{{ matchLabel }}</span>
        <span class="side-name">对手</span>
        <span class="serve-dot" :class="{ 'is-on': props.server === 'ai' }"></span>
      </div>
    </div>

    <p class="score-hint" aria-live="polite">{{ props.message }}</p>
    <p v-if="props.tip" class="tech-tip" aria-live="polite">{{ props.tip }}</p>
  </div>
</template>

<style scoped>
.scoreboard {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 8px 20px 12px;
  transform: translateX(-50%);
  border: 1px solid var(--broadcast-line);
  border-top: 2px solid var(--accent-bright);
  border-radius: 12px;
  background: var(--broadcast-bg);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.scorebar {
  display: flex;
  align-items: center;
  gap: 16px;
}

.score-side {
  display: flex;
  align-items: baseline;
  gap: 8px;
  color: #aab2bd;
  transition: color 160ms ease;
}

.score-side.is-serving {
  color: #7ee2c0;
  text-shadow: 0 0 12px rgba(126, 226, 192, 0.35);
}

.serve-dot {
  align-self: center;
  width: 8px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 50%;
  opacity: 0.45;
  transition: opacity 160ms ease, box-shadow 160ms ease;
}

.serve-dot.is-on {
  background: currentColor;
  opacity: 1;
  box-shadow: 0 0 10px rgba(126, 226, 192, 0.8);
  animation: serve-breathe 2s ease-in-out infinite;
}

@keyframes serve-breathe {
  50% { box-shadow: 0 0 4px rgba(126, 226, 192, 0.4); }
}

.side-name {
  font-size: 16px;
}

.match-badge {
  align-self: center;
  padding: 2px 8px;
  border: 1px solid #ffd479;
  border-radius: 999px;
  color: #ffd479;
  font-size: 14px;
  letter-spacing: 0.04em;
}

.score-value {
  font-size: 34px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.score-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}

.score-divider {
  color: #6d7783;
  font-size: 24px;
  line-height: 1.1;
}

.round-label {
  color: #aab2bd;
  font-size: 14px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.score-hint {
  min-height: 24px;
  margin: 0;
  font-size: 16px;
  color: #f5f3ee;
  text-align: center;
}

.tech-tip {
  margin: 0;
  font-size: 16px;
  color: #ffd479;
  letter-spacing: 0.02em;
  text-align: center;
}

@media (max-width: 640px) {
  .scoreboard {
    padding: 4px 12px 8px;
  }

  .scorebar {
    gap: 8px;
  }

  .score-value {
    font-size: 26px;
  }

  .match-badge,
  .round-label {
    font-size: 13px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .score-side,
  .serve-dot {
    transition: none;
  }

  .serve-dot.is-on {
    animation: none;
  }
}
</style>
