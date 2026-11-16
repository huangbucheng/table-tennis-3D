<script setup>
const emit = defineEmits(['start'])
</script>

<template>
  <div class="overlay">
    <div class="overlay-card">
      <h2>桌上一局，开球吧</h2>
      <p>
        斜俯视 3D 球桌，你和 AI 隔网对打。球要过网、落在对方半台；
        下网、出界或没接到都会丢分。先到 11 分且净胜 2 分获胜。
      </p>
      <ul class="key-list">
        <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 或方向键移动球拍</li>
        <li>球拍碰到球会自动回击，横向移动能打出角度</li>
        <li>按住 <kbd>Space</kbd> 蓄力上旋快攻，按住 <kbd>Shift</kbd> 搓短下旋</li>
        <li>两个键都不按 = 普通回击</li>
        <li>触屏 / 鼠标：拖动球台移拍 · 下方按钮预设下一拍技术，命中后自动复原</li>
      </ul>
      <div class="overlay-actions">
        <button type="button" class="btn" @click="emit('start')">开始游戏</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.key-list {
  display: grid;
  gap: 8px;
  margin: 0 0 24px;
  padding: 0;
  list-style: none;
  color: #aab2bd;
  font-size: 16px;
  text-align: left;
}

.key-list li {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}
</style>
