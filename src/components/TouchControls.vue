<script setup>
import { computed } from 'vue'
import { pendingLabel } from '../game/session.js'

const props = defineProps({
  selected: { type: String, default: 'none' },
})
const emit = defineEmits(['select'])

const options = [
  { type: 'none', label: '普通回击' },
  { type: 'drive', label: '上旋快攻' },
  { type: 'push', label: '搓短下旋' },
]
const label = computed(() => pendingLabel(props.selected))
</script>

<template>
  <div class="touch-controls">
    <div class="intent-buttons" role="group" aria-label="选择下一拍击球技术">
      <button
        v-for="option in options"
        :key="option.type"
        type="button"
        class="intent-btn"
        :class="{ 'is-selected': props.selected === option.type }"
        :aria-pressed="props.selected === option.type"
        @click="emit('select', option.type)"
      >
        {{ option.label }}
      </button>
    </div>
    <p class="pending-hint" aria-live="polite">{{ label }}</p>
    <p class="controls-hint">选一次只作用于下一拍，命中后自动回到普通回击</p>
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
    padding: 8px 12px;
  }
}
</style>
