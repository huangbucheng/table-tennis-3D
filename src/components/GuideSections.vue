<script setup>
import { guideSections } from '../game/guide.js'

const sections = guideSections()
</script>

<template>
  <section v-for="group in sections" :key="group.id" class="guide-group">
    <h3>{{ group.title }}</h3>
    <ul>
      <li v-for="line in group.items" :key="line">{{ line }}</li>
    </ul>
    <slot v-if="group.id === 'ai'" name="ai" />
  </section>
</template>

<style scoped>
.guide-group + .guide-group {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}

.guide-group h3 {
  margin: 0 0 8px;
  font-size: 18px;
  line-height: 1.5;
  color: var(--accent-bright);
}

.guide-group ul {
  margin: 0;
  padding-left: 20px;
  color: var(--muted);
}

.guide-group li {
  margin-bottom: 4px;
}
</style>
