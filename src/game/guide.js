// 玩法说明的固定中文文案，纯数据；不 import three、不访问 DOM。
// 文案只描述 config.js / spin.js / physics.js 里真实存在且可操作的行为，
// 不写死速度倍数（现有蓄力放大的是 z 分量，整体球速增幅更小）。
export const AI_LEVELS = Object.freeze([
  { key: 'practice', label: '练习', detail: '移动较慢、失误较多，适合先熟悉操作' },
  { key: 'standard', label: '标准', detail: '默认对手，速度与失误都适中' },
  { key: 'sharp', label: '凌厉', detail: '移动更快、失误更少，回球更难接' },
])

export const GUIDE_SECTIONS = Object.freeze([
  {
    id: 'move',
    title: '移动球拍',
    items: [
      '键盘：W / A / S / D 或 ↑ / ← / ↓ / → 四个方向键移动球拍。',
      '触屏 / 鼠标：在球台上拖动，球拍会跟随指针位置。',
    ],
  },
  {
    id: 'power',
    title: '出球力度与节奏',
    items: [
      '按住 Space 蓄力（约 0.8 秒蓄满）：蓄得越久出球越快、弧线越低，也就是上旋快攻。',
      '按住 Shift：搓短下旋，球速更慢、弧线更高，落台后会回缩。',
      '两个键都不按：普通回击，速度适中。',
      '触屏 / 鼠标：用下方的「上旋快攻 / 搓短下旋」按钮预设下一拍，命中后自动回到普通回击。',
      '所有出球速度都有统一上限截断，不会无限加速。',
    ],
  },
  {
    id: 'line',
    title: '回球线路',
    items: [
      '回球的横向角度由来球方向、击球瞬间的球拍横移和一点随机共同决定。',
      '击球瞬间横向移动球拍，能主动把球打到对方两侧。',
      '上下移动球拍会影响回球弧线的高度。',
      '上旋让球下坠更快、落台后前冲；下旋让球落台后回缩。',
    ],
  },
  {
    id: 'ai',
    title: '对手强度',
    items: [
      '在本面板下方选择对手档位，切换后立即生效；重新开始一局也会保持。',
      '练习：移动较慢、失误较多；标准：默认；凌厉：移动更快、失误更少。',
    ],
  },
  {
    id: 'rules',
    title: '计分规则',
    items: [
      '11 分制，先到 11 分且净胜 2 分获胜。',
      '下网、出界、落在自己半台、二次落地或没接到球，都会丢分。',
      '每得分后短暂定格，再倒数 3 秒发下一球。',
    ],
  },
])

export function guideSections() {
  return GUIDE_SECTIONS
}

export function aiLevelOptions() {
  return AI_LEVELS
}
