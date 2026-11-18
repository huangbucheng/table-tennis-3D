// 固定中文文案枚举；只由玩家意图驱动，不拼接任何用户输入。
const TIPS = {
  LOOP: '蓄力弧圈 · 上旋让球下坠更快',
  DRIVE: '上旋快攻 · 压低弧线',
  PUSH: '搓短下旋 · 落台后会回缩',
  BLOCK: '反手推挡 · 平击压线',
}

export function tipFor(intent) {
  if (!intent || typeof intent !== 'object') return ''
  if (intent.type === 'drive') {
    return Number.isFinite(intent.charge) && intent.charge >= 0.7 ? TIPS.LOOP : TIPS.DRIVE
  }
  if (intent.type === 'push') return TIPS.PUSH
  if (intent.type === 'block') return TIPS.BLOCK
  return ''
}
