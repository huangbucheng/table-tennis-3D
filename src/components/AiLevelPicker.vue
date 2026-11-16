<script setup>
import { computed } from 'vue'
import { aiLevelOptions } from '../game/guide.js'
import { normalizeAiLevel } from '../game/matchSettings.js'

const props = defineProps({
  aiLevel: { type: String, default: 'standard' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['select'])

const levels = aiLevelOptions()
const selected = computed(() => normalizeAiLevel(props.aiLevel))
const detail = computed(
  () => levels.find((level) => level.key === selected.value)?.detail ?? '',
)
</script>

<template>
  <div class="picker">
    <p v-if="props.disabled" class="picker-disabled">
      游戏未就绪，暂时无法调整对手强度
    </p>
    <div class="level-buttons" role="group" aria-label="选择对手强度">
      <button
        v-for="level in levels"
        :key="level.key"
        type="button"
        class="level-btn"
        :class="{ 'is-selected': selected === level.key }"
        :disabled="props.disabled"
        :aria-pressed="selected === level.key"
        @click="emit('select', level.key)"
      >
        {{ level.label }}
      </button>
    </div>
    <p class="level-detail" aria-live="polite">{{ detail }}</p>
  </div>
</template>

<style scoped>
.picker {
  margin-top: 12px;
}

.level-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.level-btn {
  min-width: 96px;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}

.level-btn:hover {
  background: #2f3741;
}

.level-btn:active {
  background: #20262e;
}

.level-btn:focus-visible {
  outline: 3px solid var(--accent-bright);
  outline-offset: 2px;
}

.level-btn:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.7;
}

.level-btn.is-selected {
  border-color: var(--accent-bright);
  background: var(--accent);
}

.picker-disabled,
.level-detail {
  margin: 8px 0 0;
  min-height: 24px;
  color: var(--muted);
}

@media (prefers-reduced-motion: reduce) {
  .level-btn {
    transition: none;
  }
}
</style>
