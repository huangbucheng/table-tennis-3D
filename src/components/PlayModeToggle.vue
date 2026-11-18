<script setup>
import { computed } from 'vue'
import { PLAY_MODES, normalizePlayMode } from '../game/playMode.js'

const props = defineProps({
  mode: { type: String, default: 'manual' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['change'])

const modes = PLAY_MODES
const selected = computed(() => normalizePlayMode(props.mode))
const detail = computed(
  () => modes.find((item) => item.key === selected.value)?.detail ?? '',
)
</script>

<template>
  <div class="mode-toggle">
    <div class="mode-buttons" role="group" aria-label="选择玩法模式">
      <button
        v-for="item in modes"
        :key="item.key"
        type="button"
        class="mode-btn"
        :class="{ 'is-selected': selected === item.key }"
        :disabled="props.disabled"
        :aria-pressed="selected === item.key"
        @click="emit('change', item.key)"
      >
        {{ item.label }}
      </button>
    </div>
    <span class="sr-only" aria-live="polite">{{ detail }}</span>
  </div>
</template>

<style scoped>
.mode-toggle {
  display: flex;
  align-items: center;
}

.mode-buttons {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}

.mode-btn {
  min-height: 36px;
  min-width: 88px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font-size: 16px;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.mode-btn:hover {
  background: #38434f;
}

.mode-btn:active {
  transform: translateY(1px);
}

.mode-btn:focus-visible {
  outline: 3px solid var(--accent-bright);
  outline-offset: 2px;
}

.mode-btn:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.7;
}

.mode-btn.is-selected {
  border-color: var(--accent-bright);
  background: var(--accent);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .mode-btn {
    min-width: 0;
    padding: 8px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .mode-btn {
    transition: none;
  }
}
</style>
