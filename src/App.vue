<script setup>
import { ref } from 'vue'
import GameGuide from './components/GameGuide.vue'
import GameOverOverlay from './components/GameOverOverlay.vue'
import ScoreBoard from './components/ScoreBoard.vue'
import ServeCountdown from './components/ServeCountdown.vue'
import SoundToggle from './components/SoundToggle.vue'
import StartOverlay from './components/StartOverlay.vue'
import TouchControls from './components/TouchControls.vue'
import { usePongGame } from './composables/usePongGame.js'

const stage = ref(null)
const guideOpen = ref(false)
const {
  state, aiLevel, start, restart, toggleMuted, selectIntent, setAiLevel, retry,
} = usePongGame(stage)
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div class="brand">
        <h1><span class="brand-mark" aria-hidden="true"></span>桌上一局</h1>
        <p>3D 乒乓球 · 人机对战 · 11 分制</p>
      </div>
      <div class="header-actions">
        <GameGuide
          :open="guideOpen"
          :ai-level="aiLevel"
          :disabled="Boolean(state.error)"
          @toggle="guideOpen = !guideOpen"
          @close="guideOpen = false"
          @select-level="setAiLevel"
        />
        <SoundToggle :muted="state.muted" @toggle="toggleMuted" />
      </div>
    </header>

    <section class="stage-wrap" aria-label="游戏区域">
      <div
        ref="stage"
        class="game-stage"
        tabindex="0"
        role="application"
        aria-label="3D 乒乓球球桌，用 WASD / 方向键或拖动移动球拍"
      ></div>

      <ScoreBoard
        :player-score="state.scores.player"
        :ai-score="state.scores.ai"
        :server="state.server"
        :message="state.message"
        :tip="state.tip"
      />

      <ServeCountdown :count="state.countdown" />

      <StartOverlay v-if="state.phase === 'ready' && !state.error" @start="start" />

      <GameOverOverlay
        v-if="state.phase === 'gameover' && !state.error"
        :winner="state.winner"
        :player-score="state.scores.player"
        :ai-score="state.scores.ai"
        @restart="restart"
      />

      <div v-if="state.error" class="overlay error-overlay" role="alert">
        <div class="overlay-card">
          <span class="error-badge" aria-hidden="true">!</span>
          <h2>游戏暂时无法运行</h2>
          <p>{{ state.error }}</p>
          <div class="overlay-actions">
            <button type="button" class="btn" @click="retry">重试</button>
            <button type="button" class="btn btn-secondary" @click="restart">重新开始</button>
          </div>
        </div>
      </div>
    </section>

    <TouchControls :selected="state.pending" @select="selectIntent" />

    <footer class="app-footer">
      <p>
        球台上拖动或 <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / 方向键移动球拍 ·
        完整操作与对手强度设置见右上角「玩法说明」
      </p>
    </footer>
  </main>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 1180px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 24px;
}

.app-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.header-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.brand h1 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 28px;
  line-height: 1.4;
}

.brand p {
  margin: 4px 0 0;
  color: #aab2bd;
  font-size: 16px;
}

.brand-mark {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #7ee2c0;
}

.stage-wrap {
  position: relative;
  width: 100%;
  height: min(66vh, 620px);
  min-height: 360px;
  overflow: hidden;
  border: 1px solid #333b46;
  border-radius: 16px;
  background: #070a0e;
}

.game-stage {
  position: absolute;
  inset: 0;
  touch-action: none;
}

.game-stage :deep(canvas) {
  touch-action: none;
}

.game-stage:focus-visible {
  outline: 3px solid #7ee2c0;
  outline-offset: -3px;
}

.app-footer {
  color: #aab2bd;
  font-size: 16px;
}

.app-footer p {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
}

@media (max-width: 640px) {
  .app-shell {
    padding: 16px;
    gap: 12px;
  }

  .app-header {
    flex-wrap: wrap;
  }

  .brand h1 {
    font-size: 22px;
  }

  .stage-wrap {
    height: 52vh;
    min-height: 280px;
  }
}
</style>
