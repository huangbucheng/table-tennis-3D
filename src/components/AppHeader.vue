<script setup>
import GameGuide from './GameGuide.vue'
import PlayModeToggle from './PlayModeToggle.vue'
import SoundToggle from './SoundToggle.vue'

const props = defineProps({
  guideOpen: { type: Boolean, default: false },
  aiLevel: { type: String, default: 'standard' },
  mode: { type: String, default: 'manual' },
  muted: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits([
  'toggleGuide', 'closeGuide', 'selectLevel', 'changeMode', 'toggleMuted',
])
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <h1><span class="brand-mark" aria-hidden="true"></span>桌上一局</h1>
      <p>3D 乒乓球 · 人机对战 · 11 分制</p>
    </div>
    <div class="header-actions">
      <PlayModeToggle
        :mode="props.mode"
        :disabled="props.disabled"
        @change="emit('changeMode', $event)"
      />
      <GameGuide
        :open="props.guideOpen"
        :ai-level="props.aiLevel"
        :disabled="props.disabled"
        @toggle="emit('toggleGuide')"
        @close="emit('closeGuide')"
        @select-level="emit('selectLevel', $event)"
      />
      <SoundToggle :muted="props.muted" @toggle="emit('toggleMuted')" />
    </div>
  </header>
</template>

<style scoped>
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
  color: var(--muted);
  font-size: 16px;
}

.brand-mark {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #7ee2c0;
}

@media (max-width: 640px) {
  .app-header {
    flex-wrap: wrap;
  }

  .brand h1 {
    font-size: 22px;
  }
}
</style>
