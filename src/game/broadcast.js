// 转播式记分条的展示派生，纯逻辑；不参与判罚与计分。
import { CONFIG } from './config.js'
import { isGameOver } from './scoring.js'

export const ROUND_LABEL = '第 1 局 · 11 分制'

const validScores = (scores) =>
  !!scores &&
  Number.isInteger(scores.player) &&
  Number.isInteger(scores.ai) &&
  scores.player >= 0 &&
  scores.ai >= 0

// 10-9 → 你方赛点；9-10 → 对方；10-10 平分与 11-9 已结束均不显示。
export function matchPointSide(scores) {
  if (!validScores(scores)) return null
  const max = Math.max(scores.player, scores.ai)
  const min = Math.min(scores.player, scores.ai)
  if (max < CONFIG.rules.winScore - 1 || max - min < 1 || isGameOver(scores)) return null
  return scores.player > scores.ai ? 'player' : 'ai'
}

// 固定文案枚举，不拼接用户输入。
export function matchPointLabel(side) {
  return side === 'player' || side === 'ai' ? '赛点' : ''
}
