// 会话状态的构造、下发与文案，纯逻辑；把 PongEngine 的样板代码下沉到这里。
import { tipFor } from './tips.js'
import { applyPoint, isDeuce, isGameOver, serverFor } from './scoring.js'
import { normalizePlayMode } from './playMode.js'

const PENDING_LABELS = {
  none: '下一拍：普通回击',
  drive: '已备好：上旋快攻（下一拍）',
  push: '已备好：搓短下旋（下一拍）',
  block: '已备好：反手推挡（下一拍）',
}

// 动作模式用专业动作名，手动模式沿用既有文案；两表都是固定枚举，不拼接输入。
const ACTION_LABELS = {
  none: '下一拍：普通回击',
  drive: '已备好：正手攻球（下一拍）',
  push: '已备好：搓短（下一拍）',
  block: '已备好：反手推挡（下一拍）',
}

export function createSessionState() {
  return {
    phase: 'ready',
    scores: { player: 0, ai: 0 },
    server: 'player',
    message: '点击开始，发出第一球',
    winner: null,
    muted: false,
    countdown: 0,
    tip: '',
    pending: 'none',
  }
}

export function sessionPayload(state) {
  return {
    phase: state.phase,
    scores: { ...state.scores },
    server: state.server,
    message: state.message,
    winner: state.winner,
    muted: state.muted,
    countdown: state.countdown,
    tip: state.tip,
    pending: state.pending,
  }
}

export function pointMessage(winner, reason, over) {
  if (over) return winner === 'player' ? '你赢下了这一局' : '对手赢下了这一局'
  return `${reason} · ${winner === 'player' ? '你' : '对手'}得分`
}

// 得分后一次算完比分、终局标记、发球方与展示文案，供 award 整体写回状态。
// 纯函数：不改入参、不依赖 three / DOM；多返回的 over 让调用方无需重复 applyPoint。
export function pointResult(state, winner, reason) {
  const scores = applyPoint(state.scores, winner)
  const over = isGameOver(scores)
  return {
    scores,
    over,
    server: serverFor(scores.player + scores.ai, isDeuce(scores)),
    message: pointMessage(winner, reason, over),
    tip: '',
    pending: 'none',
  }
}

// 固定文案枚举；未知 / 原型键等输入返回空串，不拼接用户输入。
// mode 缺省为手动模式，保证既有调用与既有断言逐位不变。
export function pendingLabel(type, mode = 'manual') {
  const table = normalizePlayMode(mode) === 'action' ? ACTION_LABELS : PENDING_LABELS
  return typeof type === 'string' && Object.hasOwn(table, type) ? table[type] : ''
}

// 每帧的模拟回调工厂。玩家命中时消费「下一拍意图」并清空展示状态；AI 命中不动它。
export function frameHooks(engine) {
  return {
    onHit(side, intent) {
      engine.audio.play('hit')
      if (side !== 'player') return
      engine.setTip(tipFor(intent))
      engine.state.pending = 'none'
      engine.input.consumeIntent()
      engine.emit()
    },
    onBounce: () => engine.audio.play('bounce'),
    onTrail: (point) => engine.trail.push(point),
  }
}
