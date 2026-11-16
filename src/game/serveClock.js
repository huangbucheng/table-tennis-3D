import { CONFIG } from './config.js'
import { countdownFor } from './scoring.js'

// 发球倒数与物理共用引擎的固定步长时钟，不使用 setTimeout。
// 纯状态对象，不访问 DOM / 计时器 API，便于单独断言。
export class ServeClock {
  constructor() {
    this.remaining = 0
    this.count = 0
  }

  // 进入发球阶段，返回首个要显示的整数秒。
  reset() {
    this.remaining = CONFIG.rules.serveDelay
    this.count = countdownFor(this.remaining)
    return this.count
  }

  // 离开倒数阶段，返回 0 供引擎写入展示状态。
  clear() {
    this.remaining = 0
    this.count = 0
    return 0
  }

  // 推进一个固定子步，返回 { expired, count, changed }。
  tick(dt) {
    this.remaining -= dt
    if (this.remaining <= 0) {
      this.clear()
      return { expired: true, count: 0, changed: true }
    }
    const count = countdownFor(this.remaining)
    const changed = count !== this.count
    this.count = count
    return { expired: false, count, changed }
  }
}
