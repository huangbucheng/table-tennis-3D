<script setup>
import { computed } from 'vue'

const props = defineProps({
  winner: { type: String, required: true },
  playerScore: { type: Number, required: true },
  aiScore: { type: Number, required: true },
})
const emit = defineEmits(['restart'])

const title = computed(() => (props.winner === 'player' ? '这一局你赢了' : '这一局对手赢了'))
const detail = computed(() =>
  props.winner === 'player'
    ? '角度打得不错，再来一局看看能不能守住。'
    : '注意球拍的横向移动，提前站到落点上就能接住。',
)
</script>

<template>
  <div class="overlay">
    <div class="overlay-card">
      <h2>{{ title }}</h2>
      <p class="final-score" aria-label="最终比分">
        你 <strong>{{ props.playerScore }}</strong>
        <span aria-hidden="true"> — </span>
        <strong>{{ props.aiScore }}</strong> 对手
      </p>
      <p>{{ detail }}</p>
      <div class="overlay-actions">
        <button type="button" class="btn" @click="emit('restart')">再来一局</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.final-score {
  font-size: 20px;
  color: #f5f3ee;
}

.final-score strong {
  font-size: 32px;
  font-variant-numeric: tabular-nums;
}
</style>
