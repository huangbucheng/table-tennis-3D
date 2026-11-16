import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { PongEngine } from '../game/PongEngine.js'

export function usePongGame(containerRef) {
  const state = reactive({
    phase: 'ready',
    scores: { player: 0, ai: 0 },
    server: 'player',
    message: '点击开始，发出第一球',
    winner: null,
    countdown: 0,
    muted: false,
    tip: '',
    pending: 'none',
    error: '',
  })

  let engine = null
  // 对手档位归 Vue 侧管理，刻意不进 sessionPayload()（九字段保持不变）。
  const aiLevel = ref('standard')

  const onState = (next) => {
    Object.assign(state, next)
    state.error = ''
  }
  const onError = (message) => {
    state.error = message
  }

  onMounted(() => {
    if (!containerRef.value) return
    try {
      engine = new PongEngine(containerRef.value, { onState, onError })
    } catch {
      onError('游戏初始化失败，请点击「重试」重新加载页面。')
    }
  })

  onBeforeUnmount(() => engine?.dispose())

  const start = () => {
    state.error = ''
    engine?.start()
  }
  const restart = () => {
    state.error = ''
    engine?.restart()
  }
  const toggleMuted = () => engine?.toggleMuted()
  const selectIntent = (type) => engine?.selectIntent(type)
  // 引擎失败 / 非法档位时返回 null，此时不更新 UI，避免显示与实际行为不一致。
  const setAiLevel = (level) => {
    const applied = engine?.setAiLevel(level)
    if (applied) aiLevel.value = applied
  }
  const retry = () => window.location.reload()

  return { state, aiLevel, start, restart, toggleMuted, selectIntent, setAiLevel, retry }
}
