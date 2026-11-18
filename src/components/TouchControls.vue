<script setup>
import { computed } from 'vue'
import { pendingLabel } from '../game/session.js'
import { optionsFor } from '../game/strokes.js'

const props = defineProps({
  selected: { type: String, default: 'none' },
  mode: { type: String, default: 'manual' },
})
const emit = defineEmits(['select'])

const options = computed(() => optionsFor(props.mode))
const label = computed(() => pendingLabel(props.selected, props.mode))
const hint = computed(() => props.mode === 'action'
  ? '按 1 / 2 / 3 / 4 或用按钮选下一拍，命中后自动回到普通回击'
  : '选一次只作用于下一拍，命中后自动回到普通回击')
</script>

<template>
  <div class="touch-controls">
    <div class="intent-buttons" role="group" aria-label="选择下一拍击球技术">
      <button
        v-for="option in options"
        :key="option.key"
        type="button"
        class="intent-btn"
        :class="{ 'is-selected': props.selected === option.key }"
        :aria-pressed="props.selected === option.key"
        @click="emit('select', option.key)"
      >
        <span v-if="option.digit" class="digit" aria-hidden="true">{{ option.digit }}</span>
        {{ option.label }}
      </button>
    </div>
    <p class="pending-hint" aria-live="polite">{{ label }}</p>
    <p class="controls-hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.touch-controls {
  text-align: center;
}

.intent-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.intent-btn {
  min-height: 44px;
  min-width: 104px;
  padding: 8px 16px;
  border: 1px solid #333b46;
  border-radius: 10px;
  background: #252b34;
  color: #f5f3ee;
  font-size: 16px;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.intent-btn:hover {
  background: #2f3741;
}

.intent-btn:active {
  transform: translateY(1px);
}

.intent-btn.is-selected {
  border-color: #7ee2c0;
  background: #1c6b5a;
}

.intent-btn:focus-visible {
  outline: 3px solid #7ee2c0;
  outline-offset: 2px;
}

.digit {
  display: inline-block;
  min-width: 20px;
  margin-right: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(245, 243, 238, 0.16);
  color: #ffd479;
  font-size: 14px;
  line-height: 20px;
}

.pending-hint {
  margin: 8px 0 0;
  min-height: 24px;
  color: #ffd479;
  font-size: 16px;
}

.controls-hint {
  margin: 0;
  color: #aab2bd;
  font-size: 14px;
}

@media (max-width: 640px) {
  .intent-btn {
    min-width: 0;
    padding: 8px 8px;
  }

  .digit {
    min-width: 18px;
    margin-right: 2px;
    padding: 0 2px;
  }
}
</style>
