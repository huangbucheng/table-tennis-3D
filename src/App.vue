<script setup>
import { computed, ref } from 'vue'
import AppHeader from './components/AppHeader.vue'
import GameOverOverlay from './components/GameOverOverlay.vue'
import ScoreBoard from './components/ScoreBoard.vue'
import ServeCountdown from './components/ServeCountdown.vue'
import StartOverlay from './components/StartOverlay.vue'
import TouchControls from './components/TouchControls.vue'
import { usePongGame } from './composables/usePongGame.js'

const stage = ref(null)
const guideOpen = ref(false)
const {
  state, aiLevel, playMode, start, restart, toggleMuted,
  selectIntent, setAiLevel, setPlayMode, retry,
} = usePongGame(stage)

const stageLabel = computed(() => playMode.value === 'action'
  ? '3D 乒乓球球桌，动作模式：球拍自动追球，用数字键 1 到 4 选出拍方式'
  : '3D 乒乓球球桌，用 WASD / 方向键或拖动移动球拍')
</script>

<template>
  <main class="app-shell">
    <AppHeader
      :guide-open="guideOpen"
      :ai-level="aiLevel"
      :mode="playMode"
      :muted="state.muted"
      :disabled="Boolean(state.error)"
      @toggle-guide="guideOpen = !guideOpen"
      @close-guide="guideOpen = false"
      @select-level="setAiLevel"
      @change-mode="setPlayMode"
      @toggle-muted="toggleMuted"
    />

    <section class="stage-wrap" aria-label="游戏区域">
      <div
        ref="stage"
        class="game-stage"
        tabindex="0"
        role="application"
        :aria-label="stageLabel"
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

    <TouchControls :selected="state.pending" :mode="playMode" @select="selectIntent" />

    <footer class="app-footer">
      <p v-if="playMode === 'action'">
        动作模式：球拍自动追球，按 <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd>
        或下方按钮选出拍方式 · 完整说明见右上角「玩法说明」
      </p>
      <p v-else>
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

.stage-wrap {
  position: relative;
  width: 100%;
  height: min(66vh, 620px);
  min-height: 360px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 16px;
  /* 迭代 14：仅 3D 舞台容器的兜底底色与新背景对齐，不是页面外壳配色。 */
  background: #45525f;
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
  color: var(--muted);
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

  .stage-wrap {
    height: 52vh;
    min-height: 280px;
  }
}
</style>
