<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AiLevelPicker from './AiLevelPicker.vue'
import GuideSections from './GuideSections.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  aiLevel: { type: String, default: 'standard' },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle', 'close', 'selectLevel'])

const trigger = ref(null)
const closeButton = ref(null)

const onKeydown = (event) => {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  emit('close')
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// flush: 'post' 保证 v-if 的面板已挂载，再把焦点移进去 / 还给触发按钮。
watch(() => props.open, (isOpen, wasOpen) => {
  if (isOpen) closeButton.value?.focus()
  else if (wasOpen) trigger.value?.focus()
}, { flush: 'post' })
</script>

<template>
  <div class="guide-root">
    <button
      ref="trigger"
      type="button"
      class="btn btn-secondary guide-trigger"
      :aria-expanded="props.open"
      aria-controls="game-guide-panel"
      @click="emit('toggle')"
    >
      玩法说明
    </button>

    <div
      v-if="props.open"
      id="game-guide-panel"
      class="guide-overlay"
      @click.self="emit('close')"
    >
      <section
        class="guide-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
      >
        <header class="guide-head">
          <h2 id="guide-title">玩法与操作</h2>
          <button
            ref="closeButton"
            type="button"
            class="guide-close"
            aria-label="关闭玩法说明"
            @click="emit('close')"
          >
            关闭
          </button>
        </header>

        <div class="guide-body">
          <GuideSections>
            <template #ai>
              <AiLevelPicker
                :ai-level="props.aiLevel"
                :disabled="props.disabled"
                @select="emit('selectLevel', $event)"
              />
            </template>
          </GuideSections>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.guide-trigger {
  min-height: 44px;
}

.guide-overlay {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(15, 18, 23, 0.8);
  backdrop-filter: blur(4px);
}

.guide-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 640px;
  max-height: min(86vh, 720px);
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.36);
}

.guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 8px;
}

.guide-head h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.4;
}

.guide-close {
  min-width: 72px;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  transition: background-color 120ms ease;
}

.guide-close:hover {
  background: #2f3741;
}

.guide-close:active {
  background: #20262e;
}

.guide-close:focus-visible {
  outline: 3px solid var(--accent-bright);
  outline-offset: 2px;
}

.guide-close:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.7;
}

.guide-body {
  overflow-y: auto;
  padding: 8px 24px 24px;
}

@media (max-width: 640px) {
  .guide-head,
  .guide-body {
    padding-left: 16px;
    padding-right: 16px;
  }

  .guide-head h2 {
    font-size: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .guide-close {
    transition: none;
  }
}
</style>
