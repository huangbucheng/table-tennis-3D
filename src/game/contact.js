// 拍面接触点，纯逻辑：不 import three、不访问 DOM、不修改入参。
// 求「本固定步内球的 z 轨迹线段」上离拍平面最近的点，并把 x/y 插值到该点。
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const finite = (value) => (Number.isFinite(value) ? value : 0)

export function paddleContact(ball, plane, dt = 0) {
  const position = ball && typeof ball === 'object' ? ball.position || {} : {}
  const velocity = ball && typeof ball === 'object' ? ball.velocity || {} : {}
  const x0 = finite(position.x)
  const y0 = finite(position.y)
  const z0 = finite(position.z)
  const vx = finite(velocity.x)
  const vy = finite(velocity.y)
  const vz = finite(velocity.z)
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0
  const target = finite(plane)

  const z1 = z0 + vz * step
  const delta = z1 - z0
  // 线段未跨过平面时 t 被 clamp 到端点，最近点即该端点，不做「隔空命中」。
  const t = Math.abs(delta) < 1e-9 ? 0 : clamp((target - z0) / delta, 0, 1)
  return {
    x: x0 + vx * step * t,
    y: y0 + vy * step * t,
    z: z0 + delta * t,
    t,
  }
}
