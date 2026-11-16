# 任务清单：three.js 乒乓球小游戏

规格见同目录 `proposal.md`。本项目无持久化、无多页面、无外部接口、无多用户，
按约定不额外写 `design.md`。

## 实现

- [x] T1 项目脚手架与运行配置：`package.json`（`dev` / `build` / `test` 脚本，依赖 `vue`、`three`，
      devDependencies `vite`、`@vitejs/plugin-vue`）、`index.html`、`src/main.js`、
      `vite.config.js`（`base` 取 `process.env.PREVIEW_BASE`、`server.allowedHosts: true`）、
      `start-preview.sh`（`0.0.0.0:$PORT`、透传 `--base "$PREVIEW_BASE"`）。
- [x] T2 纯逻辑模块：`src/game/config.js`（尺寸/速度/重力/配色常量）、`src/game/physics.js`
      （`stepBall`、`judgeRally`、落点预测、球拍碰撞、速度截断）、`src/game/scoring.js`
      （`applyPoint`、`isGameOver`、`serverFor`），不得 import three.js 或访问 DOM。
- [x] T3 纯逻辑单测：`src/game/physics.test.js`、`src/game/scoring.test.js`，覆盖 proposal
      中列出的断言，使用 Node 内置 `node --test`，不引入测试框架、不打网络。
- [x] T4 3D 场景与视觉反馈：`src/game/scene.js`（球桌、白线、球网、地板、灯光阴影、
      两只球拍、球、摄像机）、`src/game/effects.js`（带顶点色的球拖尾线、得分粒子池及回收）。
- [x] T5 引擎编排：`src/game/ai.js`（有限速度追踪 + 有界误差）、`src/game/audio.js`
      （Web Audio 合成三种音效、静音与失败降级）、`src/game/PongEngine.js`（键盘输入、
      固定 1/120s 步长且单帧最多 8 子步、四阶段状态机、判罚与计分回调、顶层 try/catch、
      resize 与 dispose 清理）。
- [x] T6 Vue 界面层：`src/style.css`、`src/composables/usePongGame.js`、
      `src/components/ScoreBoard.vue`、`StartOverlay.vue`、`GameOverOverlay.vue`、
      `SoundToggle.vue`、`src/App.vue`。组件名多词、props 声明类型、样式 scoped、
      按钮四态与可见焦点、中文错误覆盖层与重试/重开入口。

## 验证

- [x] T1v 运行 `npm install && npm run build`，期望退出码 0、无构建错误；运行
      `PORT=8080 sh start-preview.sh` 后
      `curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8080${PREVIEW_BASE}"`
      期望输出 `200`（根路径 `/` 在设置 base 后会 302 跳到 base，属预期行为）。
- [x] T2v 运行 `node --input-type=module -e "import('./src/game/physics.js').then(m=>console.log(Object.keys(m).sort().join(',')))"`，
      期望输出包含 `stepBall` 与 `judgeRally`；同样检查 `scoring.js` 输出包含
      `applyPoint`、`isGameOver`、`serverFor`。
- [x] T3v 运行 `npm test`，期望全部用例通过、退出码 0、失败数 0。
- [x] T4v 运行 `npm run build`，期望退出码 0 且产物中包含 three.js chunk；在浏览器中打开
      预览页，期望能看到完整球桌、球网、两只球拍与球，球有拖尾，得分时出现粒子。
- [x] T5v 在浏览器中开局对打，期望：WASD/方向键能移动球拍；球会过网、在台面反弹；
      球下网/出界/没接到时显示中文原因且对方加分；比分到 11:9 时进入胜负界面；
      切换标签页再切回不出现补帧卡顿。
- [x] T6v 在浏览器中检查：开始界面点「开始游戏」后进入对局，音效开关可切换，
      HUD 显示比分与发球方，胜负界面「再来一局」重置为 0:0；键盘 Tab 能聚焦所有按钮
      且焦点可见；浏览器控制台无未捕获异常。

## 评审

- [x] R1 错误处理一致：WebGL 失败、AudioContext 失败、循环异常三条路径都走
      「中文说明 + 可操作下一步」，不混用静默吞掉与抛出堆栈两种策略。
- [x] R2 无硬编码密钥、令牌、连接串或第三方地址；前端代码与 `VITE_*` 变量不含服务端凭据。
- [x] R3 未把 `/tmp`、模块级内存变量或实例私有临时空间当作持久化；比分只存在于当前会话。
- [x] R4 前端规范复核：单主色 + 中性灰阶、正文 ≥16px、4px 倍数间距、所有可点元素四态、
      键盘焦点可见、组件 `scoped`、props 有类型、`v-for` 有唯一 key、无 `v-html` / `innerHTML`。
- [x] R5 `vite.config.js` 与 `start-preview.sh` 的 base 来自环境变量而非常量，
      `allowedHosts` 已开启，`start-preview.sh` 绑定 `0.0.0.0`。

---

# 迭代 1：每球归位与开球倒数

初版 T1–T6 已全部完成并验证。以下为本次变更的增量清单，规格见 `proposal.md`
「迭代 1」章节。

## 实现

- [x] T7 计时与状态：`config.js` 的 `serveDelay` 由 1 改为 3；`scoring.js` 新增纯函数
      `countdownFor(remaining)`；`PongEngine.state`、`emit()` 载荷与 `usePongGame`
      响应式状态增加 `countdown`（3/2/1/0，默认 0）。
- [x] T8 归位：`rally.js` 新增 `prepareServe(sim, server)`，把两只球拍、球、`rally`、
      AI 控制器时间重置到默认值；`resetSimulation()` 复用它；`PongEngine.award()`
      与 `restart()` 调用它。
- [x] T9 倒数驱动：`update()` 的 `serving` 分支递减 `serveTimer`，用 `countdownFor`
      得到整数秒，仅数值变化时 `emit()`；归零调 `serve()` 并把 `countdown` 置 0；
      `gameover` 分支 `countdown` 恒为 0。不使用 `setTimeout`。
- [x] T10 倒数 UI：新增 `src/components/ServeCountdown.vue`（props `count: Number`、
      `scoped` 样式、`aria-live="polite"`、`pointer-events: none`、层级在 HUD 与覆盖层之间），
      `App.vue` 挂载；`ready` / `playing` / `gameover` 不显示。
- [x] T11 单测：`scoring.test.js` 增加 `countdownFor` 边界用例；新增 `rally.test.js`
      验证 `prepareServe` 与 `resetSimulation` 的归位结果。

## 验证

- [x] T7v 运行 `npm test`，期望退出码 0、失败数 0、用例数 ≥35（原 30 条 + 新增）。
- [x] T8v 运行
      `node --input-type=module -e "import('./src/game/rally.js').then(m=>console.log(Object.keys(m).sort().join(',')))"`，
      期望输出包含 `prepareServe`；再调用 `prepareServe(sim,'player')` 期望
      `playerPaddle.x===0`、`playerPaddle.y===0.98`、`aiPaddle.x===0`、`rally.active===false`。
- [x] T9v 运行 `npm run build`，期望退出码 0；浏览器开局后轮询 `.countdown-number`，
      期望依次读到 `3`、`2`、`1`，随后元素消失，各次间隔约 1 秒。
- [x] T10v 浏览器得分后 3 秒内：两只球拍位于中位、按住方向键球拍不移动；
      3 秒后提示变为「…发球，准备接球」且球开始运动；胜负界面无 `.countdown` 元素。
- [x] T11v 运行 `npm run build && npm test` 期望全部通过；浏览器控制台无未捕获异常、无 404。

## 评审

- [x] R6 错误处理一致：倒数路径不引入第二套异常策略，异常仍走既有 `fail()` 中文提示；
      `countdown` 是纯展示字段，不参与判罚、计分或换发球。
- [x] R7 无硬编码凭据、无 `/tmp` 或模块级内存变量当持久化；倒数组件样式 `scoped`、
      props 有类型、无 `v-html`；所有新增/修改的单文件行数 ≤200。

---

# 迭代 2：修正发球方向与 AI 接发球

规格见 `proposal.md`「迭代 2」章节。只改 `physics.js` 与 `ai.js` 两个生产文件，
断言写入既有 `physics.test.js` / `rally.test.js`。

## 实现

- [x] T12 发球几何：`physics.js` 的 `createBall(server, rng)` 改为
      `dir = server === 'player' ? 1 : -1`，`position.z = dir * serveZ`、
      `velocity.z = -dir * serveVz`；x / y 与其余速度分量不变。
- [x] T13 AI 相位：`ai.js` 的 `createAiController(rng = Math.random)` 返回
      `{ time: 0, phase: rng() * Math.PI * 2 }`；`updateAiPaddle` 用
      `controller.time + (controller.phase ?? 0)` 计算正弦误差，
      误差幅度、速度常量与其余逻辑不变。
- [x] T14 单测：`physics.test.js` 增加 `createBall` 双侧方向 / 镜像与「发球过网 +
      落在对方半台 + 不判己方半台」断言；`rally.test.js` 增加
      `createAiController` 确定性 phase、`updateAiPaddle` 不同 phase 收敛到不同
      目标 x、`prepareServe` 后 `ai.time === 0` 且 phase 在 `[0, 2π)` 内。

## 验证

- [x] T12v 运行 `npm test`，期望退出码 0、失败数 0、用例数 ≥80；运行
      `npm run build`，期望退出码 0。
- [x] T13v 运行 Node 统计脚本（200 次我方发球、玩家不移动球拍），期望 AI 首接率
      ≥75% 且 <100%，不出现 `0/200`。
- [x] T14v 浏览器（480×360 SwiftShader）：开局我方发球时球从近端飞向远端并过网、
      AI 球拍移动接球；得分后仍能读到 3→2→1、球拍归位；胜负界面无倒元素；
      控制台无未捕获异常、无 404。
- [x] T15v 运行 `npm run build && npm test` 全绿；`git status --short` 无
      `.verify-browser/`、无临时 Playwright 依赖残留。

## 评审

- [x] R8 发球与相位改动未引入第二套异常策略；`createAiController` 随机源参数注入、
      `updateAiPaddle` 对缺失 phase 有兜底；未新增生产文件与依赖。
- [x] R9 无硬编码凭据、无 `/tmp` 或模块级内存变量当持久化；
      `physics.js`、`ai.js`、`physics.test.js`、`rally.test.js` 行数均 ≤200。

---

# 迭代 3：旋转与击球意图（最小切片）

规格见 `proposal.md`「迭代 3」章节。新增 `spin.js` / `tips.js` / `session.js`
与 4 个测试文件；既有 `physics.test.js` 已 198 行、**不改动**。所有新增/修改单文件 ≤200 行。

## 实现

- [x] T16 配置层：`config.js` 增加 `spin` 段（8 项默认值）、`aiProfiles` 三档、
      `rules.chargeTime = 0.8`，导出 `INTENT_NONE`；把 `config.paddle` 的
      `aiSpeed` / `aiErrorFast` / `aiErrorSlow` / `aiYSpeedFactor` 迁到
      `aiProfiles.standard` 且数值逐项不变，`paddle` 段不再保留这四项。
- [x] T17 新增 `src/game/spin.js`：`spinAcceleration` / `spinBounceVelocity` /
      `decaySpin` / `applyIntent` 四个纯函数 + 局部 `clamp`；只导入 `CONFIG`，
      **不**从 `physics.js` 导入任何东西；每个函数用
      `const s = config?.spin ?? CONFIG.spin` 取参数组。
- [x] T18 `physics.js` 接旋转与意图：`createBall` 返回对象加 `spin: 0`；
      `stepBall` 取 `const spin = ball.spin ?? 0`，在重力之后加
      `spinAcceleration(...).y * dt`、`tableBounce` 竖直反弹后改 `v.z`、
      返回球带 `decaySpin(...)`；`returnBall` 加第 6 参 `intent = INTENT_NONE`，
      末尾 `applyIntent({position, velocity}, intent, config)` 后再 `clampVelocity`。
- [x] T19 `input.js` 接长按意图：`GAME_KEYS` 加 `' '` / `'shift'`；`charge` 为
      `createInput()` 闭包内局部变量；新增 `tick(dt)` / `intent()` / `resetCharge()`；
      抽出 `resetAll()`，`clear()` 与 `blur` / `dispose()` 走它，`serve()` 走
      `resetCharge()`；`axes()` 不变。
- [x] T20 `rally.js` 透传意图：`advanceSimulation` 加第 5 参
      `intent = INTENT_NONE`；玩家命中传 `intent`、AI 命中传 `INTENT_NONE`；
      `hooks.onHit?.(side, intent)` 带参，既有不带 `hooks` 的调用不回归。
- [x] T21 `ai.js` 难度参数：`createAiController(rng = Math.random, profile = 'standard')`
      返回带 `profile`；`updateAiPaddle` 用
      `config.aiProfiles ?? CONFIG.aiProfiles` 与 `profiles[profile] ?? profiles.standard`
      读四项参数，保留随机相位与 `phase ?? 0` 兜底。
- [x] T22 新增 `src/game/tips.js`：`tipFor(intent)` 返回固定中文文案枚举，
      `none` / 未知 `type` / `null` / 非对象输入均返回 `''`，不拼接用户输入。
- [x] T23 新增 `src/game/session.js`：`createSessionState()` / `sessionPayload()` /
      `pointMessage(winner, reason, over)`；纯逻辑，不 import three.js、不访问 DOM。
- [x] T24 `PongEngine.js` 编排：`playing` 分支依次 `input.tick(dt)` →
      `input.intent()` → `advanceSimulation(..., intent)`；`onHit` 先照旧播
      `hit` 音效、再仅玩家侧按 `tipFor(intent)` 更新 `state.tip` 且仅变化时 `emit()`；
      `serve()` 调 `resetCharge()` 并清 tip，`award()` 清 tip；
      状态构造 / `emit()` 载荷 / `pointText` 下沉 `session.js`，文件保持 ≤200 行。
- [x] T25 Vue 界面层：`usePongGame` state 加 `tip: ''`；`App.vue` 透传
      `:tip="state.tip"` 且页脚补键位说明；`ScoreBoard.vue` 加 `tip` prop 与
      `.tech-tip` 行（`aria-live="polite"`、scoped、16px）；`StartOverlay.vue`
      键位列表补 `Space` / `Shift` 两条。不加难度选择器。
- [x] T26 单测：新增 `spin.test.js` / `tips.test.js` / `ai.test.js` /
      `spinIntegration.test.js`；扩展 `input.test.js` / `rally.test.js` /
      `PongEngine.test.js`。每个用例只断言一件事，失败信息含期望值与实际值。

## 验证

- [x] T16v 运行
      `node --input-type=module -e "import('./src/game/config.js').then(m=>{const c=m.CONFIG;console.log(m.INTENT_NONE.type,Object.keys(c.spin).length,Object.keys(c.aiProfiles).join(','),c.rules.chargeTime,c.paddle.aiSpeed,JSON.stringify(c.aiProfiles.standard))})"`，
      期望输出 `none 8 practice,standard,sharp 0.8 undefined {"speed":1.8,"errorFast":0.16,"errorSlow":0.1,"ySpeedFactor":0.6}`。
- [x] T17v 运行
      `node --input-type=module -e "import('./src/game/spin.js').then(m=>console.log(m.spinAcceleration(1,3).y<0,m.spinAcceleration(-1,3).y>0,m.spinAcceleration(0,3).y===0,m.spinAcceleration(NaN,3).y===0,m.spinBounceVelocity(3,1)>3,m.spinBounceVelocity(3,-1)<3))"`，
      期望全部输出 `true`。
- [x] T18v 运行 `node --test src/game/spinIntegration.test.js`，期望 `none` 意图下
      `stepBall` / `returnBall` 与迭代 2 基线数值一致、`drive` 与 `push` 出球
      **过网且首落点在对方半台** 三条断言全部通过、失败数 0。
- [x] T19v 运行 `node --test src/game/input.test.js`，期望 `Space` / `Shift` 意图、
      charge 累积与松开衰减、`Shift` 优先、空格 `preventDefault`、
      `resetCharge()` 清零 charge 但 `axes()` 仍保留按住方向键 全部通过。
- [x] T20v 运行 `node --test src/game/rally.test.js`，期望 intent 透传到玩家回球、
      AI 命中回球 `spin === 0`、`prepareServe` 后 `ball.spin === 0` 且
      `ai.profile === 'standard'`、`onHit` 收到 `side` / `intent` 全部通过。
- [x] T21v 运行 `node --test src/game/ai.test.js`，期望三档 `profile` 产生不同
      paddle 收敛速度、未知档回退 `standard`、缺失 `phase` 按 0 处理 全部通过。
- [x] T22v 运行
      `node --input-type=module -e "import('./src/game/tips.js').then(m=>console.log([m.tipFor({type:'drive',charge:0.8}),m.tipFor({type:'drive',charge:0.2}),m.tipFor({type:'push'}),m.tipFor(null)].join('|')))"`，
      期望依次为 `蓄力弧圈 · 上旋让球下坠更快|上旋快攻 · 压低弧线|搓短下旋 · 落台后会回缩|`。
- [x] T23v 运行
      `node --input-type=module -e "import('./src/game/session.js').then(m=>console.log(Object.keys(m).sort().join(',')))"`，
      期望输出 `createSessionState,pointMessage,sessionPayload`；
      再运行 `node --test src/game/PongEngine.test.js`，期望 `emit()` 载荷含 `tip`、
      玩家命中更新提示 / AI 命中不更新、`serve()` 与 `award()` 清空提示、
      `serving` 分支不推进 charge 全部通过。
- [x] T24v 运行 `npm run build`，期望退出码 0、无构建错误；运行
      `wc -l src/game/PongEngine.js`，期望 ≤200。
- [x] T25v 浏览器按住 `Space` 与按住 `Shift` 各打一拍，期望两条出球弧线有可见
      差异、HUD 出现对应 `.tech-tip` 文案；不按键时提示不出现；开始界面与页脚
      能看到 `Space` / `Shift` 说明；无难度选择器。
- [x] T26v 运行 `npm test`，期望退出码 0、失败数 0、用例数 ≥130；
      运行 `npm run build`，期望退出码 0。
- [x] T27v 运行 Node 统计脚本（200 次我方发球、玩家不移动球拍），期望 AI 首接率
      ≥75% 且 <100%，不出现 `0/200`；`standard` 档参数与迭代 2 逐项相同。
- [x] T28v 浏览器（480×360 SwiftShader + 1280×900 + 390×844）：
      3→2→1 倒数、球拍归位、我方发球方向与 AI 接发球、胜负界面无倒元素均不回归；
      倒数期间按住 WASD 到开球后球拍**仍能移动**（`resetCharge` 回归）；
      控制台无未捕获异常、无 404。
- [x] T29v 运行 `git status --short`，期望无 `.verify-browser/`、无临时 Playwright
      依赖残留；`wc -l src/game/*.js src/components/*.vue src/composables/*.js`
      期望所有新增/修改单文件 ≤200 行。

## 评审

- [x] R10 错误处理一致：`spin` / `intent` / `charge` / `tip` 均为展示或输入字段，
      **不参与判罚、计分、换发球**；非有限 `spin` → 0、未知 `intent.type` →
      `INTENT_NONE`、未知 `profile` → `standard`、`charge` 恒 clamp 到 `[0,1]`；
      WebGL / AudioContext / 循环异常三条兜底路径与中文文案不变。
- [x] R11 无硬编码凭据、无密钥 / 环境变量 / 平台存储 / 网络请求；交付仍是纯静态
      SPA，无 `edge-functions/` / `cloud-functions/` / `edgeone.json`，无新增依赖。
- [x] R12 未把 `/tmp`、实例私有临时空间或模块级内存变量当持久化；`charge` 是
      `createInput()` 每实例私有的临时输入状态，比分 / 提示只存在于当前会话。
- [x] R13 前端规范复核：`.tech-tip` 样式 `scoped`、props 有类型、`aria-live` 就位、
      正文 ≥16px、无 `v-html`；纯逻辑模块不 import three.js、不访问 DOM。
- [x] R14 依赖方向复核：`spin.js` 只单向依赖 `config.js`，无
      `physics.js ↔ spin.js` 循环；`tips.js` / `session.js` 不 import three.js；
      `clamp` 为 `spin.js` 局部辅助，未跨模块搬用。

## 实现期偏差与实测记录

- `spin` 三项常量按 T18v 验收断言校准为 `magnusY 0.55 / driveVzGain 0.55 /
  driveVyDrop 0.02`（设计初值令满蓄力 `drive` 下网）；`spinAcceleration` 增加
  「水平速率为 0 返回正 0」短路。两处均已同步 `proposal.md`，其余常量、公式与
  判罚类型不变。
- `PongEngine.test.js` 已 157 行、扩展会越 200 行上限，故新增第 5 个测试文件
  `session.test.js` 承载 `session.js` 纯逻辑与真实 `emit()` 载荷断言；T23v 实际
  同时运行 `PongEngine.test.js` 与 `session.test.js`。
- 实测：`npm test` 181 用例 / 0 失败；`npm run build` 退出码 0；T27v 首接率
  179/200 = 0.895；浏览器 480×360 / 1280×900 / 390×844 共 37 项断言全通过，
  无控制台异常与 4xx，`Space` / `Shift` / 不按键出球 `vz` 分别为
  `-5.348` / `-2.691` / `-3.45`。临时 Playwright 与 headless shell 已清理。

---

# 迭代 4：触屏击球意图（独立小迭代）

规格见 `proposal.md`「迭代 4」章节。新增 `pointerInput.js` / `gameInput.js` /
`TouchControls.vue` 与 4 个测试文件（见下方「实现期偏差与实测记录」）；
**`spin.js` / `physics.js` / `rally.js` / `tips.js` / `input.js` 不改动**
（A''：删除 `direction?` 预留，纯逻辑零返工）。
所有新增/修改单文件 ≤200 行，`PongEngine.js` 收尾于 199 行。

## 实现

- [x] T30 配置层：`config.js` 新增 `pointer` 段
      `{ followRadius: 0.12, followRadiusY: 0.10, tapCharge: 0.65 }`；
      既有 `spin` / `aiProfiles` / `rules` / `INTENT_NONE` 不变。
- [x] T31 新增 `src/game/pointerInput.js`：导出 `createPointerInput(target)`，
      返回 `axes(paddle)` / `intent()` / `setPendingIntent(type)` /
      `consumeIntent()` / `clear()` / `dispose()`。绑
      `pointerdown/move/up/cancel/lostpointercapture`；`getBoundingClientRect()`
      归一化 → `target.x = (u-0.5)*2*maxX`、
      `target.y = minY + (1-v)*(maxY-minY)`；`setPointerCapture` 防拖出；
      宽高 0 / 非主指针 / 缺 `pointerId` 兜底；`pendingIntent` 为单槽，
      `'none'` 清空。只 import `config.js`，不碰 three.js 与纯逻辑模块。
- [x] T32 新增 `src/game/gameInput.js`：
      `createGameInput(keyboardTarget, pointerTarget)` 组合 `createInput` +
      `createPointerInput`；对外接口与 `createInput` 完全相同（`axes` / `tick` /
      `intent` / `clear` / `resetCharge` / `dispose`），另加
      `setPendingIntent` / `consumeIntent` / `clearPending`。
      `axes(paddle?)` 指针活动优先、否则键盘；`intent()` 预设优先、否则键盘；
      `resetCharge()` 仍**只**清 charge，保留按住的方向键。
- [x] T33 `session.js`：`createSessionState()` 加 `pending: 'none'`；
      `sessionPayload()` 下发该字段；新增 `pendingLabel(type)` 固定枚举
      （`none` → 「下一拍：普通回击」、`drive` → 「已备好：上旋快攻（下一拍）」、
      `push` → 「已备好：搓短下旋（下一拍）」、未知 → `''`）。
- [x] T34 `PongEngine.js`：构造换 `createGameInput(window, container)`；
      `update()` 的 `axes(this.sim.playerPaddle)`；`onHit` 玩家侧
      `consumeIntent()` + `state.pending='none'` + `emit()`；新增
      `selectIntent(type)`（首行 `if (this.failed) return`）；
      `award()` / `restart()` 清 pending、`serve()` **不清**。
      把 `WEBGL_MESSAGE` / `RUNTIME_MESSAGE` 合并为 `MESSAGES`、
      hooks 构造下沉 `session.js` 腾行，文件保持 ≤200 行。
- [x] T35 `usePongGame.js`：reactive state 加 `pending: 'none'`；
      暴露 `selectIntent(type)` → `engine?.selectIntent(type)`。
- [x] T36 新增 `src/components/TouchControls.vue`：props `selected: String`，
      emit `select(type)`；三个 `<button type="button">`（普通 / 上旋攻 / 搓短），
      `aria-pressed` 由 `selected === type` 决定、点击目标 ≥44×44px、
      `aria-live="polite"` 显示 `pendingLabel(selected)`、scoped 样式、
      按钮区 `touch-action: manipulation`；不拼接用户输入。
- [x] T37 `App.vue`：在 `stage-wrap` 之外、页脚之上挂 `<TouchControls>`，
      透传 `:selected="state.pending"` 与 `@select="selectIntent"`；
      `.game-stage` 及其内部 `canvas` 加 `touch-action: none`；
      `aria-label` 补「或拖动移动球拍」；页脚补触屏说明；
      小屏下保证按钮条首屏可见（必要时下调 `stage-wrap` 高度）。
- [x] T38 `StartOverlay.vue`：键位列表补一条触屏说明（拖拍移拍 + 三个意图按钮
      + 下一拍生效）。
- [x] T39 单测：新增 `pointerInput.test.js` / `gameInput.test.js`，扩展
      `session.test.js` / `PongEngine.test.js`；既有 `physics.test.js` 等不改动。
      每个用例只断言一件事，失败信息含期望值与实际值。

## 验证

- [x] T30v 运行
      `node --input-type=module -e "import('./src/game/config.js').then(m=>console.log(JSON.stringify(m.CONFIG.pointer),Object.keys(m.CONFIG.spin).length,m.INTENT_NONE.type))"`，
      期望输出 `{"followRadius":0.12,"followRadiusY":0.1,"tapCharge":0.65} 8 none`。
- [x] T31v 运行 `node --test src/game/pointerInput.test.js`，期望坐标映射与
      clamp、宽高 0 兜底、非主指针忽略、`pointercancel` 清 target、
      队列覆盖与单次消费、`dispose` 解绑 全部通过、失败数 0。
- [x] T32v 运行 `node --test src/game/gameInput.test.js`，期望 `axes(paddle)`
      追向与键盘回退、不传 paddle 兼容、预设优先、消费后回落键盘意图、
      `resetCharge()` 不清方向键 全部通过、失败数 0。
- [x] T33v 运行
      `node --input-type=module -e "import('./src/game/session.js').then(m=>console.log([m.pendingLabel('none'),m.pendingLabel('drive'),m.pendingLabel('push'),m.pendingLabel('bogus')].join('|')))"`，
      期望三条固定文案 + 末位空串；再运行 `node --test src/game/session.test.js`，
      期望 `sessionPayload` 含 `pending` 全部通过。
- [x] T34v 运行 `node --test src/game/PongEngine.test.js`，期望选中 / 消费 /
      清空迁移、`serve()` 不清而 `award()` / `restart()` 清、AI 命中不清、
      WebGL failed 兜底 全部通过；运行 `wc -l src/game/PongEngine.js`，
      期望 ≤200。
- [x] T35v 浏览器：点「搓短」按钮后 HUD 预设行显示
      「已备好：搓短下旋（下一拍）」且不立即改变出球；点「普通」后回到
      「下一拍：普通回击」。
- [x] T36v 浏览器：三个按钮 `aria-pressed` 与选中态一致、点击目标 ≥44×44、
      `aria-live` 行存在；`pending === 'none'` 时该行不留白。
- [x] T37v 浏览器：拖拍能移动球拍；`.game-stage` 与 canvas 的
      `touch-action` 计算值均为 `none`；开始界面与页脚可见触屏说明；
      390×844 下按钮条在首屏可见。
- [x] T38v 运行 `npm run build`，期望退出码 0、无 Vue 编译错误或警告。
- [x] T39v 运行 `npm test`，期望退出码 0、失败数 0、用例数 >181。
- [x] T40v 浏览器主链路：`page.mouse` 跑 480×360 SwiftShader / 1280×900 /
      390×844 三视口，`hasTouch: true` 在 390×844 追加一组；点「搓短」后
      玩家下一拍 `spin < 0` 且 `.tech-tip` 出现「搓短下旋」；**不按键盘意图键**
      时再下一拍 `spin = 0` 且选中态清空；倒数期间预设可保留到开球；
      键盘 `Space` / `Shift` 仍生效。
- [x] T41v 浏览器回归：3→2→1 倒数、球拍归位、我方发球方向与 AI 接发球、
      胜负界面无残留预设选中态、控制台无未捕获异常与 404。
- [x] T42v 运行 Node 统计脚本（200 次我方发球、玩家不移动球拍），期望 AI 首接率
      ≥75% 且 <100%，不出现 `0/200`。
- [x] T43v 运行 `git status --short`，期望无 `.verify-browser/` 与临时 Playwright
      依赖残留；`wc -l src/game/*.js src/components/*.vue src/composables/*.js`
      期望所有新增/修改单文件 ≤200 行。

## 评审

- [x] R15 错误处理一致：`pending` / `pendingIntent` / `target` 不参与判罚、计分、
      换发球；未知 type、宽高 0、非主指针、`pointercancel`、WebGL failed
      五条兜底齐备；WebGL / AudioContext / 循环异常三条既有兜底与中文文案不变。
- [x] R16 无硬编码凭据 / 密钥 / 环境变量 / 平台存储 / 网络请求；无新增依赖；
      仍是纯静态 SPA，无 `edge-functions/` / `cloud-functions/` / `edgeone.json`。
- [x] R17 未把 `/tmp`、实例私有临时空间或模块级内存变量当持久化；
      `pendingIntent` 与 `target` 是每实例私有的临时输入状态，刷新即失。
- [x] R18 前端规范复核：三按钮 `aria-pressed` / `aria-live` / ≥44px / scoped /
      无 `v-html`；`pendingLabel` 固定枚举不拼接输入；`session.js` 不 import
      three.js、不访问 DOM；依赖方向单向
      （`pointerInput → config`、`gameInput → input + pointerInput`）。
- [x] R19 A'' 复核：`spin.js` / `physics.js` / `rally.js` / `tips.js` /
      `input.js` 在迭代 4 未被修改；全仓无新增 `direction` 字段消费；
      `intent` 仍为 `{ type, charge }`。

## 实现期偏差与实测记录

- **新增测试文件由 2 个增至 4 个**：除计划内 `pointerInput.test.js` /
  `gameInput.test.js` 外，因 `session.test.js` 同时容纳 `frameHooks` 与真实
  `PongEngine.prototype` 迁移断言会越 200 行，拆出 `pending.test.js`；
  浏览器验收发现真实缺陷后追加 `pointerCapture.test.js`（4 条回归）。
  `pointerInput.test.js` 的三条释放事件用例改为参数化循环以守住行数上限。
- **坐标映射公式与 T31 字面描述不同**：实现用
  `p.minX + u * (p.maxX - p.minX)` / `p.minY + (1-v) * (p.maxY - p.minY)`，
  而非 `(u-0.5)*2*maxX`；两者在对称边界下等价，前者直接复用 `config.paddle`
  的 min/max，避免再引一份常量。
- **验证期发现并修复一处真实产品缺陷**：合成 / 竞态指针事件会让
  `setPointerCapture` 抛 `No active pointer with the given id is found.`，
  并残留 `pointerId` 使后续真实拖拽被全部忽略。修复落在 `pointerInput.js`：
  `updateGoal()` 对无效 rect 返回 `false`；`onDown()` 先认领指针、
  无效目标即 `release()`；`setPointerCapture` 包 `try/catch`，抛错同样
  `release()`。修复后 `edge.mjs` 24/24、`verify.mjs` 236/236 全部复跑通过。
- **浏览器内窥不改产品源码**：通过 CDP `Runtime.getProperties` 探测 Vue
  `setupState.selectIntent` 的闭包作用域取得 `engine`，注入
  `window.__pongEngine` / `__step` / `__snap` / `__hitPlayer`；冻结 rAF 并
  手动喂 `update(1/120)`，使实时循环可确定性断言。产品源码无测试钩子。
- **手机截图绿色描边的排查结论**：为 `focus-visible` 焦点环视觉残留，
  非选中态错乱；`focus2.mjs` 复现后 DOM 权威证据为
  `hint = 下一拍：普通回击`、`selected = 普通回击`、
  `document.activeElement = (none)`，三按钮 `aria-pressed` 与 `is-selected`
  一致，无残留状态。
- **实测汇总**：`npm test` 238 用例 / 0 失败；`npm run build` 退出码 0
  （`three` 470.14 kB、`vue` 65.42 kB、`index` 31.94 kB 分块）；
  主浏览器验收 `236/236`（480×360 / 1280×900 / 390×844 + `hasTouch` 组）；
  渲染与异常验收 `24/24`（桌面与手机真实截图、canvas 非零、无横向溢出、
  重复点击 / 快速切换 / 非法 type / 幻影指针）；T42v 统计
  `AI 首接 182/200 = 0.910`（≥75% 且 <100%）；`wc -l` 全量复核
  所有 `src/game/*.js` / `src/components/*.vue` / `src/composables/*.js` /
  `src/App.vue` 均 ≤200 行。
- **交付清理**：`.verify-browser/`（含 probe / verify / stats / edge / focus
  脚本、截图、headless shell 与 `shell.zip`）已整体删除；
  `npm prune` 移除临时 `playwright` / `playwright-core`，
  `package-lock.json` 中 `"playwright` 引用数为 0；`git status --short`
  仅剩 8 个正式交付项，无验证产物残留。
- **未改动项**：`index.html` 保持 `width=device-width, initial-scale=1.0`，
  未全局禁用缩放，仅 `.game-stage` 与 canvas 用 `touch-action: none`；
  无新增依赖、无后端函数目录、无平台存储 / 环境变量 / 网络请求。

---

# 迭代 5：赛场氛围与灯光联动（独立小迭代）

规格见 `proposal.md`「迭代 5」章节。基线：迭代 4 完成态，`npm test` 238 用例全绿、
`PongEngine.js` 199 行。新增 4 个生产文件 `broadcast.js` / `arenaState.js` /
`venue.js` / `arena.js` 与 3 个测试文件；**所有新增 / 修改单文件 ≤200 行**，
`sessionPayload()` 字段一个不加，纯静态交付方式不变。

## 实现

- [x] T44 `config.js`：`COLORS.background = 0x070a0e`、`COLORS.floor = 0x0c1117`；
      新增 `arena` 段（`damping: 0.18`、`pulseDecay: 0.12`、`pulseKey: 1.4`、
      `pulseLed: 0.5`、`barrierColor / audienceColor / ledColor / beamColor / poolColor`、
      `tints` 四枚举、`light.READY / PLAYING / GAMEOVER` 三个 6 项端点向量）。
      配色键统一带 `Color` 后缀，不含 background / floor。
- [x] T45 新增 `src/game/broadcast.js`（纯）：`ROUND_LABEL = '第 1 局 · 11 分制'`、
      `matchPointSide(scores)` → `'player' | 'ai' | null`
      （`max >= winScore-1 && max-min >= 1 && !isGameOver(scores)`）、
      `matchPointLabel(side)` → 固定「赛点」/ `''`；非法输入返回 `null` / `''`。
      只 import `config.js` 与 `scoring.js`，不改计分规则。
- [x] T46 新增 `src/game/arenaState.js`（纯，不 import three、不碰 DOM）：
      `CUES`、`lightTarget(cue, ctx)`（四档 cue、countdown 逐项 lerp、
      tint 四枚举、未知 cue 回退 PLAYING）、`cueFromTransition(prev, next)`
      （相关字段 `phase / countdown / scores / winner` 差分、pulse 由比分增量独立决定、
      `prev = null` 返回 ready）、`damp(current, target, dt, tau)`、
      `decayPulse(pulse, dt)`；所有非有限输入不产生 NaN、不修改入参。
- [x] T47 新增 `src/game/venue.js`（three）：`createVenue(scene)` 自建四面近黑围挡、
      四条 LED 光带、顶部灯架横梁与灯头、两道半透明光锥、地面光池、
      单个 `InstancedMesh` 约 120 个观众席剪影、地面细线；返回
      `{ led, cone, pool, tintMaterials, group, dispose }`，`dispose()` 只
      `scene.remove(group)` + 清引用，不 dispose 材质、不新增真实光源。
- [x] T48 新增 `src/game/arena.js`（three 适配层）：
      `createArena(scene, lights)` → `{ onState, step, dispose, current, target, pulseValue }`；
      `onState()` 只做差分并写 `target` / `pulseValue`，`step(dt)` 才用 `damp` 推进
      `current`、写 3 盏灯强度 / LED `emissiveIntensity` / 光锥与光池 opacity /
      `THREE.Color.lerp` tint；脉冲不写回 `target` / `current`。
- [x] T49 `scene.js`：三盏灯初始强度取 `arena.light.READY`、主光改冷白 `beamColor`；
      `createArena(scene, { ambient, key, fill })` 挂到 `view`；
      `dispose()` 先 `disposeTree(scene)` 再 `arena.dispose()`，顺序固定。
- [x] T50 `PongEngine.js`：`emit()` 单行扩为
      `const p = sessionPayload(this.state); this.view?.arena?.onState(p); this.callbacks.onState?.(p)`，
      `frame()` 增一行 `this.view.arena?.step(dt)`；`serve()` / `award()` /
      `restart()` 一行不改，文件收于 ≤200 行。
- [x] T51 `ScoreBoard.vue` 重做为转播式记分条（props 签名不变）：名牌 + 发球权指示点 +
      大比分 + 固定赛制标签 + 赛点徽标 + `.score-hint` / `.tech-tip` / `.serve-hint`，
      `sr-only` 整句含比分 / 发球方 / 赛点，`aria-live`、`pointer-events: none`、
      `z-index: 2`、深色玻璃 + 顶部青绿细线、`prefers-reduced-motion` 关过渡与呼吸；
      只 import `broadcast.js`。`style.css` 仅增 `--broadcast-bg` / `--broadcast-line`
      两个变量；`App.vue` 仅把 `.stage-wrap` 背景改为 `#070a0e`（模板结构不动）。
- [x] T52 单测：新增 `broadcast.test.js` / `arenaState.test.js` / `arena.test.js`。
      前两个纯逻辑不 import three；`arena.test.js` 允许 import `three` 但只构造
      `Scene` 与假灯光对象，**不得创建 `WebGLRenderer`、不得访问 DOM**。
      既有 238 用例断言一个不改。

## 验证

- [x] T44v 运行
      `node --input-type=module -e "import('./src/game/config.js').then(m=>console.log(m.COLORS.background.toString(16),m.COLORS.floor.toString(16),m.CONFIG.arena.light.PLAYING.key,m.CONFIG.arena.tints.match.toString(16)))"`，
      期望输出 `70a0e c1117 3.4 ffd479`。
- [x] T45v 运行
      `node --input-type=module -e "import('./src/game/broadcast.js').then(m=>console.log(JSON.stringify([m.matchPointSide({player:0,ai:0}),m.matchPointSide({player:10,ai:9}),m.matchPointSide({player:9,ai:10}),m.matchPointSide({player:10,ai:10}),m.matchPointSide({player:11,ai:9}),m.matchPointLabel('player'),m.matchPointLabel(null)])))"`，
      期望输出 `[null,"player","ai",null,null,"赛点",""]`（用 `JSON.stringify` 而非 `join`，后者会把
      `null` 渲染成空串）；再运行 `node --test src/game/broadcast.test.js`，失败数 0。
- [x] T46v 运行 `node --test src/game/arenaState.test.js`，期望四档 cue 与端点向量一致、
      `c = 1` 与 `playing` 六项逐项相等、countdown 单调上升与 clamp、7 行状态迁移表、
      `tip / pending / muted` 变化返回 `null`、`damp` 收敛与 `dt = 0` 恒等、
      `decayPulse` 0.5s 内 < 2%、不修改入参 全部通过、失败数 0。
- [x] T47v 运行
      `node --input-type=module -e "import('three').then(async T=>{const {createVenue}=await import('./src/game/venue.js');const s=new T.Scene();const v=createVenue(s);console.log(s.children.length,!!v.led,!!v.cone,!!v.pool,v.tintMaterials.length);v.dispose();console.log(s.children.length)})"`，
      期望 `1 true true true 1`（末位 `0`），且全程不创建 `WebGLRenderer`。
- [x] T48v 运行 `node --test src/game/arena.test.js`，期望 `onState` → `step(1/60)`
      后 key 单调逼近目标、`pulse` 0.5s 内衰减、`dispose()` 不抛、不访问 DOM。
- [x] T49v 运行 `npm run build`，期望退出码 0、无构建错误；运行
      `node --input-type=module -e "import('three').then(T=>{const s=new T.Scene();return s})"` 无异常。
- [x] T50v 运行 `wc -l src/game/PongEngine.js`，期望 ≤200；运行
      `node --test src/game/PongEngine.test.js src/game/session.test.js`，
      期望 `emit()` 载荷字段与迭代 4 完全一致（无灯光字段）、失败数 0。
- [x] T51v 运行 `npm run build`，期望退出码 0、无 Vue 编译警告；运行
      `wc -l src/components/ScoreBoard.vue src/style.css src/App.vue`，
      期望 ScoreBoard.vue 与 App.vue ≤200。
- [x] T52v 运行 `npm test`，期望退出码 0、失败数 0、用例数 >238；运行
      `npm run build`，期望退出码 0；运行
      `wc -l src/game/*.js src/components/*.vue src/composables/*.js src/App.vue`，
      期望所有新增 / 修改单文件 ≤200 行。
- [x] T53v 浏览器（若环境可用 Playwright + SwiftShader）：三视口 480×360 /
      1280×900 / 390×844 截图目视暗场聚光与记分条；canvas 非零、无 WebGL 失败
      覆盖层、无横向溢出、控制台无未捕获异常与 4xx。冻结 rAF 后显式驱动
      `engine.update(1/120)` 读 `arena.target` / `arena.pulseValue`、显式调用
      `engine.view.arena.step(1/60)` 读 `arena.current`；断言倒数 3→2→1 的 key
      单调上升、`c = 1` 与 `playing` 逐项相等、`award()` 后 `pulseValue > 0`、
      `gameover` tint 切换、`playing` 连跑 200 步末期相邻帧差 < 1e-6、
      场景 Light 数仍为 3 且 `castShadow` 数仍为 1。
      若环境无浏览器，改以 Node 侧等价脚本覆盖上述数值断言并记录于实测记录。
- [x] T54v 运行 `git status --short`，期望无验证产物与临时依赖残留。

## 评审

- [x] R20 错误处理一致：`cueFromTransition` 对 `prev = null` / 缺字段 / NaN /
      未知 cue 一律返回安全值；`arena.step(dt)` 在 `frame()` 的 `try` 内，异常仍落
      `MESSAGES.runtime`；WebGL / AudioContext 失败兜底与中文文案不变。
- [x] R21 无硬编码凭据 / 密钥 / 环境变量 / 平台存储 / 网络请求；无新增 npm 依赖；
      仍是纯静态 SPA，无 `edge-functions/` / `cloud-functions/` / `edgeone.json`。
- [x] R22 未把 `/tmp`、实例私有临时空间或模块级内存变量当持久化；
      `arena.current` / `target` / `pulseValue` 是每实例私有的渲染状态，刷新即失。
- [x] R23 前端规范复核：单主色 + 中性灰阶、正文 ≥16px、4px 倍数间距、
      `ScoreBoard.vue` 样式 `scoped`、props 有类型与默认值、无 `v-html`、
      `sr-only` 与 `aria-live` 就位、`prefers-reduced-motion` 降级就位。
- [x] R24 依赖方向单向（`broadcast → scoring`、`arenaState → config + broadcast`、
      `venue → config`、`arena → arenaState + venue + config`），无循环；
      纯逻辑模块不 import three、不访问 DOM；`sessionPayload()` 字段一个未加。

## 实现期偏差与实测记录

- **规格内部矛盾消解**：迭代 5 第 1 条修订要求「`App.vue` 的 `.stage-wrap` 背景同步改为
  `#070a0e`」，而「架构与模块边界 · 不动」清单又列出 `App.vue`。按具体修订执行：仅改
  `.stage-wrap` 的 `background` 一处 CSS，模板结构、组件与事件一个不动。
- **配色键统一后缀**：规格示例写 `barrier: 0x0a0e13` / `audience: 0x0c1118`，但同段要求
  「配色键一律带 `Color` 后缀」。按规则落地为 `barrierColor` / `audienceColor`，与
  `ledColor` / `beamColor` / `poolColor` 一致；数值不变。
- **记分条行数收口**：初版 `ScoreBoard.vue` 为 207 行。删除与发球指示点语义重复的
  `.serve-hint` 行及其样式（发球方信息仍由 `sr-only` 整句与 `.serve-dot` 承载），
  收于 199 行，守住 ≤200 上限。
- **`config.arena` 最终默认值**：`damping 0.18` / `pulseDecay 0.12` / `pulseKey 1.4` /
  `pulseLed 0.5`；`READY {0.10, 1.2, 0.06, 0.15, 0.03, 0.08}`、
  `PLAYING {0.16, 3.4, 0.12, 0.35, 0.06, 0.22}`、
  `GAMEOVER {0.10, 2.0, 0.08, 0.28, 0.05, 0.14}`（顺序 ambient/key/fill/led/cone/pool）。
- **单测**：`npm test` 281 用例 / 0 失败（迭代 4 基线 238，新增 43 条：
  `broadcast` 11、`arenaState` 23、`arena` 9）。既有 238 条断言一个未改。
  `node --test src/game/PongEngine.test.js src/game/session.test.js` 41 / 0 失败；
  `sessionPayload()` 字段仍为 9 个，未新增灯光字段。
- **构建与行数**：`npm run build` 退出码 0（`three` 474.59 kB、`vue` 65.42 kB、
  `index` 38.05 kB 分块）；`src/game/*.js` / `src/components/*.vue` /
  `src/composables/*.js` / `src/App.vue` 全部 ≤200 行，最大为
  `PongEngine.js` 200 行、`ScoreBoard.vue` 199 行。
- **浏览器验收 51/51 通过**：临时 Playwright 1.65.0 装在 gitignore 的
  `.verify-browser/`（`--prefix … --no-save --no-package-lock`，根 `package-lock.json`
  中 `"playwright` 引用数为 0），headless shell 用系统已有的
  `/opt/ms-playwright/chromium_headless_shell-1254/...`。480×360 / 1280×900 /
  390×844 三视口 + `hasTouch` 组 + `prefers-reduced-motion: reduce` 组：
  canvas 非零且有 WebGL 上下文、无 WebGL 失败覆盖层、无横向溢出、无控制台异常与 4xx；
  赛制标签、0-0 无赛点、`sr-only`、`pointer-events: none` / `z-index: 2` /
  `aria-live` / 发球指示点 / 名牌 / 降级态全部就位；例外组覆盖空 payload、
  `NaN` / 负数 / 超大 `dt`、50 次状态反复翻转、连续两次 `start()` / `restart()`、
  意图按钮连点两轮，均无异常、目标与当前值保持有限数、`pulseValue` 仍在 `[0,1]`。
  冻结 rAF 后经 CDP 闭包作用域暴露 engine（产品源码无测试钩子），显式驱动
  `engine.update(1/120)` 与 `arena.step(1/60)`：倒数 3→2→1 的 key 为
  `1.2 → 2.3 → 3.4`、`c=1` 与 playing 六项相等、`award()` 后 `pulseValue = 1`、
  gameover 目标切到 GAMEOVER、`tip` / `pending` 变化不触发差分、playing 连跑 200 步
  末期帧差 `0`；场景 Light 数仍为 3、开阴影的光源仍为 1；10-9 显示赛点徽标且色值
  `rgb(255, 212, 121)`（与 `--error` 区分）、11-9 后消失。
- **画面像素校验**：视觉模型本轮不可用，截图无法解析，故补 `gl.readPixels` 量化断言：
  `avg=17.5`、`max=227`、`coverage=0.559` —— 非黑屏、有亮部细节（白线/球/LED），
  同时整体维持暗场基调。真实截图另存于验证目录，清理时一并删除。
- **验证脚本自身的两处修正**（非产品缺陷）：固定步长 120 步恰好落在 `ceil` 的浮点
  边界上会少读一拍，改为 125 步/段；`emit()` 后 Vue 的 DOM 更新是异步的，需等一个
  `settle(60ms)` 再读徽标，否则读到上一帧的 11-9。
- **交付清理**：`.verify-browser/`（含临时 Playwright、验收脚本、截图）与 `_probe.txt`
  整体删除；无新增 npm 依赖、无后端函数目录、无平台存储 / 环境变量 / 网络请求。

---

# 迭代 6：击球判定贴合拍面（独立小迭代）

规格见 `proposal.md`「迭代 6」章节。基线：迭代 5 完成态，`npm test` 281 用例全绿、
`physics.js` 193 行 / `PongEngine.js` 200 行 / 所有单文件 ≤200 行。
新增 1 个生产文件 `contact.js` 与 1 个测试文件 `contact.test.js`；
**既有 281 条断言除 `ai.test.js` 明示的一条改写外零改动**。

## 实现

- [x] T55 `config.js`：`paddle` 段删除 `reachZ` / `hitRadiusX` / `hitRadiusY`，
      新增 `hitRadius: 0.10`、`contactDepth: 0.035`、`bladeRadius: 0.088`；
      其余段（含 `aiProfiles`、`spin`、`arena`）数值逐项不变。
- [x] T56 `models.js`：`buildPaddle` 的 rim 半径改读 `CONFIG.paddle.bladeRadius`、
      blade 半径为 `bladeRadius - 0.01`；视觉尺寸与判定尺寸共用单一真源，
      渲染结果数值与迭代 5 一致。
- [x] T57 新增 `src/game/contact.js`：导出 `paddleContact(ball, plane, dt)`，
      返回 `{ x, y, z, t }`；`z1 = z0 + vz*dt`、
      `t = clamp((plane - z0) / (z1 - z0), 0, 1)`，`z` 为线段上离 `plane` 最近点，
      x/y 按同一 t 插值；`dt <= 0` / `vz = 0` / 非有限输入一律返回有限值且不改入参。
      只做插值与 clamp，不 import three、不访问 DOM。
- [x] T58 `physics.js`：`checkPaddleHit(..., config = CONFIG, dt = 0)` 加可选第 6 参；
      内部调 `paddleContact`，`|contact.z - plane| > config.paddle.contactDepth`
      返回 `false`；椭圆改圆，接触半径 `config.paddle.hitRadius + config.ball.radius`，
      用 `contact.x / contact.y` 与拍心比较。`rally.active` / `lastHitter` /
      `toward` 三条提前返回保持原样；文件净减行、保持 ≤200。
- [x] T59 `rally.js`：两处 `checkPaddleHit` 传 `CONFIG, dt`；命中分支用
      `paddleContact(sim.ball, plane, dt)` 取接触点，把 `sim.ball.position` 置为
      `{ x, y, z: plane }` 后再 `returnBall`。`movePaddle` → 判定 → `stepBall` →
      `judgeRally` 顺序、`hooks` 载荷与 `onTrail` 语义不变。
- [x] T60 AI 校准：几何修正后重跑 200 次首接率统计；若 `<75%`，仅按最小幅度下调
      `aiProfiles.standard.errorFast` / `errorSlow`（`speed` / `ySpeedFactor` /
      相位机制 / `createBall` / 其余两档不动），直到落入 `[75%, 100%)`。
      把 `ai.test.js` 中「standard 档参数与迭代 2 逐项相同」改为行为断言：
      三档 `speed` 单调递增、`standard` 取自 config、未知档回退 `standard`。
- [x] T61 出球参数：`returnVy` / `returnVzBase` / `returnVzRange` 默认不变；
      真实链路若出现落点出界，只调 `returnVzBase`，且须同时满足
      `spinIntegration.test.js` 全部过网 / 落台断言与「真实对打无异常判罚」。
      最终值写入本文件「实现期偏差与实测记录」。
- [x] T62 新增 `src/game/contact.test.js`：`paddleContact` 边界用例 +
      `checkPaddleHit` 贴合拍面断言（正上方 `0.15` / 侧方 `0.18` 不命中、
      `0.10` 命中、`dt = 0` 兼容、线段穿越拍平面命中、球未到拍平面不命中）。
      `physics.test.js`（198 行）一个字不改。

## 验证

- [x] T55v 运行
      `node --input-type=module -e "import('./src/game/config.js').then(m=>console.log(JSON.stringify({h:m.CONFIG.paddle.hitRadius,d:m.CONFIG.paddle.contactDepth,b:m.CONFIG.paddle.bladeRadius,old:[m.CONFIG.paddle.reachZ,m.CONFIG.paddle.hitRadiusX,m.CONFIG.paddle.hitRadiusY]})))"`，
      期望输出 `{"h":0.1,"d":0.035,"b":0.088,"old":[null,null,null]}`。
- [x] T56v 运行
      `node --input-type=module -e "import('three').then(async T=>{const {buildPaddle}=await import('./src/game/models.js');const g=buildPaddle(0,0);console.log(g.children[0].geometry.parameters.radiusTop,g.children[1].geometry.parameters.radiusTop)})"`，
      期望输出 `0.088 0.078`，与迭代 5 渲染数值一致。
- [x] T57v 运行 `node --test src/game/contact.test.js`，期望失败数 0；再运行
      `node --input-type=module -e "import('./src/game/contact.js').then(m=>console.log(Object.keys(m).sort().join(',')))"`，
      期望输出 `paddleContact`。
- [x] T58v 运行 `node --test src/game/physics.test.js`，期望 3 条
      `checkPaddleHit` 既有断言仍全绿、失败数 0；运行 `wc -l src/game/physics.js`
      期望 ≤200。
- [x] T59v 运行
      `node --test src/game/rally.test.js src/game/PongEngine.test.js src/game/spinIntegration.test.js src/game/session.test.js`，
      期望失败数 0；`rally.test.js` 的 `armed()` 夹具仍能触发 `onHit`。
- [x] T60v 运行临时统计脚本 `.verify-browser/hitstats.mjs`（200 次我方发球、
      玩家不动拍、统计 AI 首接数与命中瞬间 `|ball.z - plane|` 分布），
      期望首接率 `≥75% 且 <100%`，且 `200/200` 次命中的 `|ball.z - plane| ≤ 0.035`
      （基线为恒定 `0.158`、100% > `0.05`）。
- [x] T61v 运行临时脚本模拟真实对打 200 球，期望无 `OUT` / `OWN_HALF` 异常聚集、
      球过网且首落点在对方半台；再运行
      `node --test src/game/spinIntegration.test.js`，期望过网 / 落台断言全绿。
- [x] T62v 运行 `npm test`，期望退出码 0、失败数 0、用例数 >281；运行
      `npm run build`，期望退出码 0；运行
      `wc -l src/game/*.js src/components/*.vue src/composables/*.js src/App.vue`，
      期望所有新增 / 修改单文件 ≤200 行。
- [x] T63v 浏览器（临时 Playwright + `/opt/ms-playwright` headless shell，验收后清理）：
      480×360 / 1280×900 / 390×844 三视口开局对打，冻结 rAF 后暴露 engine，
      断言回球瞬间 `Math.abs(sim.ball.position.z - CONFIG.paddle.playerZ) ≤ 0.035`；
      目视球在拍面处被击回而非半空中；倒数 3→2→1、`Space` / `Shift` 旋转意图、
      触屏预设、胜负界面、灯光联动、赛点徽标均不回归；控制台无未捕获异常与 4xx。
- [x] T64v 运行 `git status --short`，期望无验证产物与临时依赖残留；
      `package-lock.json` 中 `"playwright` 引用数为 0。

## 评审

- [x] R25 错误处理一致：`paddleContact` 对 `dt <= 0` / `vz = 0` / 非有限坐标
      返回有限值；`checkPaddleHit` 三条提前返回不变；异常仍落
      `MESSAGES.webgl` / `MESSAGES.runtime` 中文兜底，不新增第二套策略。
- [x] R26 无硬编码凭据 / 密钥 / 环境变量 / 平台存储 / 网络请求；无新增 npm 依赖；
      仍是纯静态 SPA，无 `edge-functions/` / `cloud-functions/` / `edgeone.json`。
- [x] R27 未把 `/tmp`、实例私有临时空间或模块级内存变量当持久化；
      命中点是每子步计算出的临时值，刷新即失。
- [x] R28 依赖方向单向（`contact` 无依赖 → `physics` → `rally`），无循环；
      `contact.js` 不 import three、不访问 DOM；`sessionPayload()` 字段一个未加；
      复核 `physics.test.js` / `rally.test.js` / `PongEngine.test.js` /
      `spinIntegration.test.js` 既有断言未被改写（`ai.test.js` 一条除外）。

## 实现期偏差与实测记录

- **AI 校准**：`aiProfiles.standard.errorFast/errorSlow` 由 `0.16/0.10` 下调为
  `0.10/0.08`（最小幅度中唯一同时保住三档参数严格单调、且 30 批独立 200 球
  min 首接率 `0.825` 的组合）；`speed` / `ySpeedFactor` / 相位机制 / 其余两档未动。
  `ai.test.js` 的「参数逐项相同」改写为 3 条行为断言。
- **出球参数**：`returnVy` / `returnVzBase` / `returnVzRange` **一个未改**，
  75/75 组真实回球轨迹过网且首落点在对方半台，无需调整 `returnVzBase`。
- **几何实测**：命中 `|z-plane| max = 0.0188`（≤ `contactDepth 0.035`）超限 0 次；
  回球起点偏离拍平面 0 次；判定半径 0.120 / 视觉接触 0.108。
- **偏差**：T60 首接率在几何修正后实测 `0.610`，低于 ≥75%，故按规格下调 AI 误差到
  `0.930~0.955`（迭代 6 验收线 ≥75%）。但迭代 6 未约束玩家侧与回合长度，
  上线后用户反馈「人和 AI 都容易漏球」，由**迭代 7** 修订（见下）。
- **验证**：`npm test` 298 用例 / 0 失败；`npm run build` 退出码 0；单文件 ≤200 行；
  浏览器三视口 33/33；`.verify-browser/` 与临时 Playwright 已整体删除。

---

# 迭代 7：可玩性回补（对迭代 6 的修订）

规格见 `proposal.md`「迭代 7」章节。用户反馈「现在人和 AI 都比较容易漏球」。
诊断确认迭代 6 的规格盲点：只有 AI 首接率一条验收线，缺玩家侧与回合长度指标；
且单独放宽 `contactDepth` 无效（`0.035→0.10`，玩家首接率仅 `0.623→0.673`），
决定性变量是 **xy 判定面积**。

## 实现

- [x] T65 `config.js`：`paddle.hitRadius` `0.10 → 0.13`，补注释说明面积比与校准依据；
      `bladeRadius` / `contactDepth` / `aiProfiles` / 出球参数 / 输入层 / 3D 模型 / UI 全不动。
- [x] T66 `contact.test.js`：边界断言改为「正上方 `0.17`、侧方 `0.18` 不命中；
      `0.10` 与 `0.14` 水平/竖直均命中」，新增「判定/视觉面积比 ≤2」护栏；
      `physics.test.js` 一个字未改。
- [x] T67 `proposal.md` 写入迭代 7 规格并自检；`tasks.md` 补齐本段。

## 验证

- [x] T65v `node .verify-browser/missrate.mjs`：400 球配对对比，AI 首接
      `337/400 = 0.843 → 383/400 = 0.958`；玩家首接（±0.08m 误差）
      `0.715 → 0.943`、（±0.12m）`0.580 → 0.815`；判定面积
      `0.0452 → 0.0707 m²`（1.93x 视觉，迭代 5 为 3.58x）。
- [x] T66v `node .verify-browser/hitstats.mjs` 连跑 3 次：AI 首接率
      `0.955 / 0.930 / 0.945`（要求 ≥0.90 且 <1）；命中样本 `|z-plane| max = 0.0188`
      超限 0 次；回球起点偏离拍平面 0 次；回球合法 75/75。
- [x] T67v `node .verify-browser/rallycheck.mjs`：200 场真实对打，有回击 195 场，
      总回击 1385 / **场均 6.9 拍**（迭代 6 为 3.2）；过网高度合格 1371/1371、
      首落点对方半台且界内 1227/1227；判罚仅「没接到球 135 / 球出界了 65」，
      轨迹类判罚占比 4.7%，无异常聚集。
- [x] T68v `npm test` **299 用例 / 0 失败**；`npm run build` 退出码 0；
      `wc -l` 最大单文件 `PongEngine.js` 200 行，全部 ≤200。
- [x] T69v 浏览器三视口 480×360 / 1280×900 / 390×844（临时 Playwright +
      `/opt/ms-playwright` headless shell）：**33/33 通过**。含 WebGL `gl.readPixels`
      实际绘制（max 227 / coverage 0.559~0.751）、倒数 3→2→1、
      `Space`/`Shift`、触屏预设选中态、赛点徽标不回归、控制台无异常与 4xx；
      浏览器内动态 import 生产模块确认 `hitRadius=0.13` / `contactDepth=0.035`，
      三视口共 248 次击球的回球起点偏离拍平面均为 0。
- [x] T70v `.verify-browser/`（含临时 Playwright、诊断与验收脚本）整体删除；
      `package-lock.json` 中 `"playwright` 引用数 0；`git status --short` 无验证产物残留。

## 评审

- [x] R29 未回退迭代 6 的视觉修复：`contactDepth = 0.035`、圆形判定、
      `paddleContact` 扫掠接触点、`strikeFrom` 拍面回球起点全部保留。
- [x] R30 无新增生产 / 测试文件、无新增 npm 依赖、无后端函数 / 存储 / 网络请求 /
      环境变量 / 凭据；仍是纯静态 SPA。
- [x] R31 依赖方向单向、`sessionPayload()` 九字段不变、`hooks` 与 `onTrail` 语义不变；
      未引入按 side 区分判定半径、输入层磁吸或放大 z 容差等隐藏辅助。
- [x] R32 `physics.test.js` / `rally.test.js` / `PongEngine.test.js` /
      `spinIntegration.test.js` 既有断言零改动；`ai.test.js` 仅迭代 6 明示的一条改写。

## 实现期偏差与实测记录

（无偏差：本轮只改 `config.js` 一个常量与 `contact.test.js` 四条断言，
最终数值与实测数据已逐项记录于上方 T65v–T70v。）

---

# 迭代 8：得分后短暂定格再回置球拍

规格见 `proposal.md`「迭代 8」章节，用户已批准「先停 1.5 秒，再开始倒数」。
基线：迭代 7 完成态，`npm test` 299 用例全绿、`PongEngine.js` 200 行顶格、
所有单文件 ≤200 行。**不新增 phase、不用 `setTimeout`、不动灯光与 UI**。

## 实现

- [x] T71 `config.js`：`rules` 段新增 `pointPause: 1.5`；其余段数值逐项不变。
- [x] T72 新增 `src/game/pointPause.js`：导出 `advancePointPause(remaining, dt)`
      → `{ remaining, expired }`。纯函数、无依赖、不改入参；`remaining <= 0` /
      `dt` 非有限时原样返回且不产生 NaN；`expired` 仅在「调用前 >0 且本次归零」
      为真，重复调用不再触发。同目录新增 `pointPause.test.js`。
- [x] T73 `session.js`：新增纯函数 `pointResult(state, winner, reason)`
      → `{ scores, over, server, message, tip, pending }`；`over` 由内部
      `isGameOver` 一次算出并随结果返回，`award()` 无需重复计算比分；
      `sessionPayload()` 九字段与既有导出不变。同目录 `session.test.js`
      追加 `pointResult` 用例。
- [x] T74 `PongEngine.js`：构造函数初始化 `pauseRemaining = 0`；`award()` 调
      `pointResult()`，非终局不回置且 `countdown = 0`、设 `pauseRemaining`，
      终局仍立即回置；`update()` 的 serving 分支调 `advancePointPause()`，
      `expired` 那一步 `prepareServe` + `serveClock.reset()` + `countdown = 3` + `emit()`；
      `restart()` / `serve()` 清零。**净增行数 ≤0，文件最终 ≤200 行**，
      不删既有功能、不压成难读单行。
- [x] T75 `PongEngine.test.js`：改写 2 条「瞬时归位」为「得分瞬间保持结束姿态、
      停留结束才归零」（玩家 / AI 各一条），改写 1 条「award 后 countdown = 3」
      为「停留期间 0、结束后 3」；新增停留期内不回置、恰好到期回置、
      输入不推进且不跑物理、停留后约 3 秒开球、终局立即回置、`restart` 清零、
      回置幂等、非有限 `dt` 不卡死等边界用例。

## 验证

- [x] T71v 运行
      `node --input-type=module -e "import('./src/game/config.js').then(m=>console.log(m.CONFIG.rules.pointPause))"`，
      期望输出 `1.5`。
- [x] T72v 运行 `node --test src/game/pointPause.test.js`，期望失败数 0；运行
      `node --input-type=module -e "import('./src/game/pointPause.js').then(m=>console.log(Object.keys(m).sort().join(',')))"`，
      期望输出 `advancePointPause`。
- [x] T73v 运行 `node --test src/game/session.test.js`，期望失败数 0；运行
      `node --input-type=module -e "import('./src/game/session.js').then(m=>console.log(Object.keys(m.sessionPayload(m.createSessionState())).sort().join(',')))"`，
      期望输出
      `countdown,message,muted,pending,phase,scores,server,tip,winner`。
- [x] T74v 运行 `node --test src/game/PongEngine.test.js`，期望失败数 0；运行
      `wc -l src/game/PongEngine.js`，期望 ≤200；运行
      `node --test src/game/arenaState.test.js src/game/arena.test.js`，期望失败数 0。
- [x] T75v 运行 `npm test`，期望退出码 0、失败数 0、用例数 >299；运行
      `npm run build`，期望退出码 0；运行
      `wc -l src/game/*.js src/components/*.vue src/composables/*.js src/App.vue`，
      期望所有单文件 ≤200 行。
- [x] T76v 浏览器（临时 Playwright + `/opt/ms-playwright` headless shell，验收后清理）：
      480×360 / 1280×900 / 390×844 三视口，冻结 rAF 后按固定步驱动引擎，断言
      得分后 180 ± 2 步内 `playerPaddle.x` / `aiPaddle.x` 保持得分瞬间的值、
      `.countdown` 不存在、球坐标不变；第 180 步左右回置且倒数显示 3→2→1，
      约 540 ± 5 步后进入 `playing`；得分闪光 / 赛点徽标 / 灯光联动 / 胜负界面 /
      `Space`·`Shift` / 触屏预设不回归；控制台无未捕获异常与 4xx。
      另用 `node` 脚本按步数复算上述时序，期望与浏览器一致。
- [x] T77v 运行 `git status --short`，期望无验证产物与临时依赖残留；
      `package-lock.json` 中 `"playwright` 引用数为 0。

## 评审

- [x] R33 错误处理一致：`advancePointPause` 对 `dt <= 0` / 非有限 `remaining`
      与 `dt` 返回有限值且不产生 NaN；`frame()` 的 `try/catch` 与
      `MESSAGES.webgl` / `MESSAGES.runtime` 中文兜底不变，不新增第二套策略。
- [x] R34 无硬编码凭据 / 密钥 / 环境变量 / 平台存储 / 网络请求；无新增 npm 依赖；
      仍是纯静态 SPA，无 `edge-functions/` / `cloud-functions/` / `edgeone.json`。
- [x] R35 未把 `/tmp`、实例私有临时空间或模块级内存变量当持久化；
      `pauseRemaining` 只是单局内的临时状态，刷新即失。
- [x] R36 依赖方向单向（`pointPause` 无依赖 → `PongEngine`）、无循环；
      `pointPause.js` / `session.js` 不 import three、不访问 DOM；
      `sessionPayload()` 字段一个未加；`arenaState.js` / `physics.js` /
      `rally.js` / `spinIntegration.test.js` 既有断言零改动。

## 实现期偏差与实测记录

**实测（迭代 8 完成态）**

- `CONFIG.rules.pointPause = 1.5` 秒；固定步 `1/120`，停留 **180 步**。
  浏览器实测第 178 / 179 步球拍与球仍保持得分瞬间坐标，第 **180 步**回置
  且 `countdown = 3`；`countdown` 依次 3→2→1，第 **541 步**进入 `playing`。
  Node 侧用真实 `PongEngine` 原型按步复算同为 `180 / 541`，与三视口浏览器完全一致。
- 总间隔 541 步而非名义 540：`ServeClock` 原有固定步累加留下 ~1e-16 尾差，
  3 秒倒数实际需 361 步归零（不是 360）。规格验收为 `540 ± 5`，541 合格；
  `ServeClock` 属范围外，本轮零改动。
- `PongEngine.js` 最终 **200 行**，净增 **0 行**（硬约束达成）：把
  `rally.js` 的 6 行多行 import 收成一行可读 import，`update()` 改用卫语句，
  `award()` 下沉到 `pointResult()`；未删功能、未压成难读单行。
- `npm test` **330 用例 / 0 失败**（基线 299，>299）；`npm run build` 退出码 0；
  `wc -l src/game/*.js src/components/*.vue src/composables/*.js src/App.vue`
  全部 ≤200，最大值为 `PongEngine.js` 200。
- 浏览器临时 Playwright + `/opt/ms-playwright` headless shell，三视口
  480×360 / 1280×900 / 390×844，**78/78 通过**：定格时序、倒数 DOM 序列、
  得分闪光（`arena.pulseValue = 1` / 粒子 `burst`）、赛点徽标、灯光目标随阶段
  切换、胜负界面与「再来一局」、`Space`·`Shift`、触屏预设、渲染帧均无回归；
  控制台无未捕获异常与 4xx。
- 末次复核：`award()` 终局分支改为显式清零 `pauseRemaining` 后，重跑
  `npm test` 330/0、`npm run build` 退出码 0，并在**最终代码**上重跑浏览器
  三视口复验 **52/52 通过**（时序仍 180 / 541）；`PongEngine.js` 仍为 200 行。
- 清理：`.verify-browser/`、`verify.mjs`（更早迭代遗留的 gitignore 脚本）、
  `_probe.txt`、`.verify-*.png` 全部删除；无残留 vite 进程；
  `package-lock.json` 中 `"playwright` 引用数 **0**（复用全局安装，未装依赖）；
  `git status --short` 仅剩基线未跟踪项目文件。

**偏差**

1. **`pointResult` 签名与计划不同**：计划为
   `pointResult(state, winner, reason, over)` → `{ scores, server, message, tip, pending }`；
   实际为 `pointResult(state, winner, reason)` →
   `{ scores, over, server, message, tip, pending }`。`over` 改由函数内部
   `isGameOver(scores)` 一次算出并随结果返回，使 `award()` 不必重复
   `applyPoint` / `isGameOver` / `serverFor`，这是 `PongEngine.js` 净增 0 行的前提。
   `proposal.md` 与本 T73 均已同步；`sessionPayload()` 九字段未变。
2. **引擎边界用例拆到新文件**：`PongEngine.test.js` 基线已 198 行，追加 8 类
   边界用例必然超 200 行上限，故新增同目录 `PongEngine.pause.test.js`
   （174 行 / 17 用例）承载停留期与时序断言；`PongEngine.test.js`（197 行）
   保留 3 条改写的「得分瞬间保持姿态 / 定格期不显示倒数」断言。
3. **`rally.js` import 由多行改单行**：为守住 200 行上限所做的排版调整，
   仅 4 个具名导入、88 字符，不改变依赖与可读性。
4. 无新增 phase、无 `setTimeout`、无 UI / 灯光 / 物理 / AI 改动，
   `arenaState.test.js` / `physics.test.js` / `rally.test.js` /
   `spinIntegration.test.js` 断言零改动。

---

## 迭代 9：预览页面空白修复（仅预览/构建配置）

**问题**：用户反馈预览面板整页空白。产品代码正常——本地直连 dev server
渲染出 `#app`（3779 字符）与 1 个 canvas；经 relay 前缀 `/preview/<id>/`
访问时空白。

**根因（浏览器实测 A/B/C 对照）**：dev server 以 `base='/'` 启动，
`index.html` 返回根绝对路径 `/@vite/client` 与 `/src/main.js`。浏览器在
`/preview/<id>/` 下按源解析这两个 URL，请求不带前缀 → relay 404 →
模块加载失败 → Vue 未挂载。Vite dev 下 `--base ./` 仍归一化为 `/`，
无法规避；`base` 必须等于 relay 前缀（转换后的 JS import 同样是绝对路径）。
另查明本环境未向启动命令注入 `PREVIEW_BASE`，且已在运行的预览服务不可被
重启替换，因此靠编辑 `vite.config.js` 触发 Vite 配置热重启来生效。

- [x] T78 `vite.config.js`：`base` 按 `command` 区分——`build` 恒为 `/`，
      dev 取 `PREVIEW_BASE`，未注入时回落到生成的 `.preview-base`；
      `allowedHosts: true` 不变。
- [x] T79 `start-preview.sh`：`PREVIEW_BASE` 未注入时读 `.preview-base`，
      保证 UI「预览」按钮重放启动命令也带正确 `--base`；
      `.gitignore` 忽略 `.preview-base`（本地预览缓存，不进发布产物）。
- [x] T80 `src/` 业务代码一行未动；仍是纯静态 SPA，无新增依赖、
      无平台存储、无函数、无硬编码密钥。

**验收（实测）**

- 模拟 relay 的真实 Chromium 加载 `/preview/<id>/`：`#app` 已挂载、
  canvas 1、计分栏渲染、入口脚本全部带前缀、无 4xx、无控制台/运行时异常、
  「开始」按钮可点击且点击后无错误占位页，**9/9 通过**。
- `npm test` **330 / 0**（与迭代 8 一致）；`npm run build` 退出码 0，
  `dist/index.html` 资源仍为 `/assets/...`，预览前缀未污染发布产物。
- 直连 `npm run dev` 的根路径 302 到带前缀地址并可正常渲染（跟随重定向 200）。
- 清理：`.verify-browser/`、两个临时 Vite 服务（8244 / 8245）与
  `/tmp` 下临时探针全部删除；`git status --short` 仅剩基线未跟踪项目文件。

**范围之外**：不引入客户端路由（本项目本来没有）、不改任何玩法/物理/AI、
不改 `PREVIEW_BASE` 注入机制、不新增 npm 依赖。

---

# 迭代 10：玩法操作说明入口与对手强度设置

规格见 `proposal.md`「迭代 10」。核心：梳理散落四处的操作说明并给页面常驻入口；
把已有 `practice / standard / sharp` 三档做成面板内可选，让「AI 速度可调」真正落地；
默认行为、物理常量、`sessionPayload()` 九字段全部不变。

## 实现

- [x] T81 新增 `src/game/matchSettings.js`：`MESSAGES`（从 `PongEngine.js` 下沉）、
      `AI_LEVEL_KEYS`、`normalizeAiLevel(value)` 白名单校验、`createMatchSettings()`。
      纯逻辑、不 import three、不访问 DOM，30 行。
- [x] T82 新增 `src/game/guide.js`：`GUIDE_SECTIONS` 五组固定中文说明、
      `AI_LEVELS` 三档标签、`guideSections()` / `aiLevelOptions()` 纯读取函数。
      纯数据、65 行、无占位符 / TODO / lorem ipsum、无未定义键位。
- [x] T83 新增 `GameGuide.vue` / `GuideSections.vue` / `AiLevelPicker.vue`：触发按钮 +
      `role="dialog" aria-modal="true"` 面板。props `open` / `aiLevel` / `disabled`
      均声明类型与默认值；emits `toggle` / `close` / `selectLevel` / `select`；
      点击 / `Esc` / 点遮罩关闭并把焦点还给触发按钮；四态样式、点击目标 ≥24px、
      `focus-visible` 描边、`aria-live` 切档反馈、`prefers-reduced-motion`、
      面板 `max-height` + `overflow-y: auto`；三者样式均 `scoped`，
      行数 180 / 40 / 101，全部 ≤200。
- [x] T84 `src/App.vue`：header 与 `SoundToggle` 并排放 `GameGuide`；
      持有 `guideOpen` / `aiLevel` 两个 ref；页脚精简为一行避免与面板重复。
- [x] T85 `src/composables/usePongGame.js`：暴露 `setAiLevel(level)`，
      只在 engine 返回非 `null` 时更新 `aiLevel` ref；`aiLevel` **不进** `sessionPayload()`。
- [x] T86 `src/game/PongEngine.js`：新增 `setAiLevel(level)`——`failed` 时不写 `sim`
      并返回 `null`，正常时经 `normalizeAiLevel` 写 `sim.ai.profile` 并返回归一化档位；
      `MESSAGES` 与初始化样板下沉到 `matchSettings.js`，最终 199 行（净减 1 行），
      不删功能、不压成难读单行。
- [x] T87 `src/game/rally.js`：`prepareServe(sim, server)` 改用
      `createAiController(Math.random, sim.ai?.profile)` 继承当前档位；
      不新增参数、不改默认 `standard`、不改既有物理与判罚。
- [x] T88 新增同目录纯逻辑测试 `matchSettings.test.js`（`undefined` / `null` / 数字 /
      对象 / 未知字符串 / 原型键 / 三档合法 / 大小写边界、`createMatchSettings` 默认值）
      与 `guide.test.js`（五组结构、每组标题与条目非空、无占位符、
      `AI_LEVELS` 与 `AI_LEVEL_KEYS` 一致、关键键位出现在文案中）；合计 18 用例。
- [x] T89 实现期偏差与实测记录：已写回本文件，并与 `proposal.md`「迭代 10」保持一致。

## 验证

- [x] T81v `node --test src/game/matchSettings.test.js src/game/guide.test.js`
      → 18/18 全绿、0 失败。
- [x] T82v `npm test` → **348 用例 / 0 失败**；既有 330 用例断言零改动，
      日志中 `^not ok` / `Error` / `FAIL` 均无命中。
- [x] T83v `npm run build` → 退出码 0；57 modules transformed，
      `dist/index.html` 资源仍为 `/assets/...` 根绝对路径，未写入预览前缀。
- [x] T84v `wc -l src/game/*.js src/components/*.vue src/composables/*.js src/App.vue`
      → 全部 ≤200；最大 `PongEngine.js` **199 行**、`App.vue` 198 行。
- [x] T85v `stats.mjs`：200 次我方发球（玩家球拍不动）→ 默认 `standard`
      AI 首接 **196/200 = 0.980**（≥0.75 且 <1）；`rally.mjs`：200 场完整对打，
      192 场有回击、总回击 1492 / **场均 7.46 拍**（迭代 7 基线 6.9，未回归），
      判罚仅「没接到球 143 / 球出界了 57」；另跑 13 项物理 / AI 常量断言全部一致。
- [x] T86v 浏览器临时 Playwright + `/opt/ms-playwright` headless shell：
      三视口 480×360 / 1280×900 / 390×844 **70/70 通过**；入口常驻可见可点，
      点击 / `Esc` / 遮罩三种开合，关闭后焦点回到触发按钮，五组说明齐全，
      三档切换写入 `sim.ai.profile` 且 `restart()` 后保持，对局中开面板不中断 /
      不加速物理，无 4xx、无未捕获异常、无横向溢出。
- [x] T87v 失败态（WebGL 不可用）6/6：说明面板仍可打开，三个档位按钮均
      `disabled` 且显示「游戏未就绪，暂时无法调整对手强度」，`aiLevel` 高亮仍为「标准」。
- [x] T88v 清理：`.verify-browser/`、临时 Vite 服务、截图与日志全部删除；
      `git status --short` 仅剩基线未跟踪项目文件；
      `package-lock.json` 中 `"playwright` 引用数 **0**。

## 评审

- [x] R37 错误处理一致：档位校验只有 `normalizeAiLevel` 一套白名单；
      `failed` 态返回 `null` 与既有 `MESSAGES` 中文兜底同一套策略，无第二套。
- [x] R38 无硬编码凭据 / 密钥 / 环境变量 / 平台存储 / 网络请求；
      无新增 npm 依赖；仍是纯静态 SPA，无 `edge-functions/` / `cloud-functions/`
      / `agents/` / `edgeone.json`。
- [x] R39 未把 `/tmp`、实例私有临时空间或模块级内存变量当持久化；
      `aiLevel` 明确不持久化，刷新回 `standard`。
- [x] R40 `sessionPayload()` 九字段与既有导出不变；13 项 `CONFIG` 物理 / AI 常量
      与迭代 7 / 8 一致；依赖方向单向（`guide` / `matchSettings` 无依赖 → 组件与引擎）、
      无循环；`guide.js` / `matchSettings.js` 不 import three、不访问 DOM。
- [x] R41 XSS：说明全部走 Vue 插值；全量搜索 `v-html` / `innerHTML` /
      `dangerouslySetInnerHTML` / `eval` 仅命中 `guide.test.js` 的断言字符串，
      产品代码 0 命中；文案是固定常量，不拼接用户输入，
      不把用户数据拼进 `href` / `src`。
- [x] R42 文案真实：只写实际存在且可操作的行为，不写死倍数；
      AI 三档标签与 `CONFIG.aiProfiles` 的 speed / 误差方向一致；
      说明与 `StartOverlay.vue` / `App.vue` / `TouchControls.vue` / `tips.js`
      现有行为无矛盾；`config.js` 过时注释已同步为「面板可选、默认 standard、不持久化」。

## 实现期偏差与实测记录

1. **组件拆分**：单一 `GameGuide.vue` 初版 282 行，超过单文件 ≤200 行硬约束，
   遂拆为 `GameGuide.vue`（对话框外壳 / 焦点 / 开合）、`GuideSections.vue`（五组文案）、
   `AiLevelPicker.vue`（三档选择）。最终 180 / 40 / 101 行，职责与规格一致。
2. **`PongEngine.js` 行数**：规格原写「仍为 200 行」；实现为 199 行，
   仍满足「净增 ≤0、最终 ≤200」。`proposal.md` 验收标准已改为 ≤200（实测 199）。
3. **`stats.mjs` 统计口径**：它的 `avgHits = 0.98` 只统计到 AI 首次接球，
   **不是**迭代 7 的完整回合长度；因此另写 `rally.mjs` 跑 200 场完整对打，
   得到 7.46 拍 / 场，与 6.9 基线相比未回归。
4. **实际页面截图**：relay 前缀下桌面 / 手机各三张截图已生成，
   DOM / 几何断言 17/17 通过；`ViewImage` 视觉模型本轮不可用，未做肉眼判读，
   改用「纯深色空白对照 + PNG 像素统计」7/7 通过（空白对照 1 色 / max 14，
   实际页面 71–195 色 / max 245–255），证明不是空白页。
5. **一次并发抖动**：浏览器脚本与 `npm test` 并行执行时，桌面视口等待
   `phase === 'playing'` 12 秒超时；单独重跑同一脚本 **70/70 通过**，
   产品代码与验收标准均未改动，判为临时验收脚本的并发资源竞争。
