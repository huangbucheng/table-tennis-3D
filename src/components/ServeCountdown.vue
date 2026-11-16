<script setup>
const props = defineProps({
  count: { type: Number, default: 0 },
})
</script>

<template>
  <div v-if="props.count > 0" class="countdown" aria-live="polite" aria-atomic="true">
    <span :key="props.count" class="countdown-number">{{ props.count }}</span>
    <span class="countdown-label">准备发球</span>
  </div>
</template>

<style scoped>
.countdown {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  transform: translate(-50%, -50%);
  text-align: center;
  pointer-events: none;
}

.countdown-number {
  color: #7ee2c0;
  font-size: 88px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 4px 24px rgba(17, 21, 26, 0.9);
  animation: countdown-pop 240ms ease-out;
}

.countdown-label {
  color: #f5f3ee;
  font-size: 16px;
  letter-spacing: 0.08em;
  text-shadow: 0 2px 12px rgba(17, 21, 26, 0.9);
}

@keyframes countdown-pop {
  from {
    opacity: 0;
    transform: scale(0.72);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (max-width: 640px) {
  .countdown-number {
    font-size: 64px;
  }
}
</style>
