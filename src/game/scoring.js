import { CONFIG } from './config.js'

const isValidScores = (scores) =>
  !!scores &&
  Number.isInteger(scores.player) &&
  Number.isInteger(scores.ai) &&
  scores.player >= 0 &&
  scores.ai >= 0

export function applyPoint(scores, winner) {
  if (!isValidScores(scores)) return { ...(scores || { player: 0, ai: 0 }) }
  if (winner !== 'player' && winner !== 'ai') return { ...scores }
  return { ...scores, [winner]: scores[winner] + 1 }
}

export function isGameOver(scores) {
  if (!isValidScores(scores)) return false
  const top = Math.max(scores.player, scores.ai)
  const low = Math.min(scores.player, scores.ai)
  return top >= CONFIG.rules.winScore && top - low >= CONFIG.rules.winBy
}

// 常规阶段每 2 分换发球；双方都到 10 分后每 1 分换发球。
export function serverFor(totalPoints, deuce = false) {
  if (!Number.isInteger(totalPoints) || totalPoints < 0) return 'player'
  const block = deuce
    ? Math.max(0, totalPoints - 2 * (CONFIG.rules.winScore - 1))
    : Math.floor(totalPoints / 2)
  return block % 2 === 0 ? 'player' : 'ai'
}

export function isDeuce(scores) {
  return isValidScores(scores) &&
    scores.player >= CONFIG.rules.winScore - 1 &&
    scores.ai >= CONFIG.rules.winScore - 1
}

// 把发球剩余秒数映射为 3/2/1/0 的展示整数；非有限数值或非数字一律视为 0。
export function countdownFor(remaining) {
  if (!Number.isFinite(remaining)) return 0
  return Math.min(3, Math.max(0, Math.ceil(remaining)))
}
