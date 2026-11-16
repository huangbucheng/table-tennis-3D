<script setup>
import { computed } from 'vue'

const props = defineProps({
  muted: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle'])

const label = computed(() => (props.muted ? '开启音效' : '关闭音效'))
</script>

<template>
  <button
    type="button"
    class="btn btn-secondary sound-btn"
    :aria-pressed="props.muted"
    :aria-label="label"
    @click="emit('toggle')"
  >
    <span class="sound-indicator" :class="{ 'is-off': props.muted }" aria-hidden="true"></span>
    音效 · {{ props.muted ? '关' : '开' }}
  </button>
</template>

<style scoped>
.sound-btn {
  gap: 8px;
}

.sound-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7ee2c0;
}

.sound-indicator.is-off {
  background: #6d7783;
}
</style>
