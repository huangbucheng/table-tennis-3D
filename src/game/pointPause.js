// 得分后定格计时，纯逻辑：不 import three、不访问 DOM、不修改入参。
// 与 ServeClock 一样由引擎的固定步长 dt 驱动，不使用 setTimeout。
const finite = (value) => (Number.isFinite(value) ? value : 0)

// 返回 { remaining, expired }；expired 仅在「本次调用前仍 >0 且本次归零」为真，
// 保证回置只触发一次。坏 dt 不产生 NaN，也不让状态机永远停在定格阶段。
export function advancePointPause(remaining, dt) {
  const left = Math.max(0, finite(remaining))
  if (left <= 0) return { remaining: 0, expired: false }
  if (!Number.isFinite(dt)) return { remaining: 0, expired: true }
  if (dt <= 0) return { remaining: left, expired: false }
  const next = Math.max(0, left - dt)
  // 固定步长累加会留下 ~1e-16 的尾差，不足半纳秒时直接归零，避免多停一帧。
  const settled = next <= 1e-9 ? 0 : next
  return { remaining: settled, expired: settled === 0 }
}
