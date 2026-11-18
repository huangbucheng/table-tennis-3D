# 提案：three.js 乒乓球小游戏

## 背景与目标

工作区为全新项目（仅有 `init` 提交）。用户希望做一个使用 three.js 的乒乓球小游戏。
目标是交付一个 `npm run dev` 即可直接运行的、完整可玩的 3D 球桌对战游戏：玩家用键盘
操控近端球拍，与 AI 对手对打，按乒乓球规则计分，到 11 分决出胜负，并有音效与粒子反馈。

## 已确认的需求

| 项目 | 决定 |
| --- | --- |
| 游戏形态 | 斜俯视 3D 真实球桌，有球拍、球网、透视与光影 |
| 对战模式 | 单人人机对战（不含双人同屏） |
| 操作方式 | 键盘 WASD / 方向键（不做鼠标与触屏控制） |
| 附加功能 | 计分与先到 11 分胜负；Web Audio 音效；球拖尾与得分粒子 |
| 不含 | 难度选择、暂停、鼠标/触屏输入、后端、持久化最高分 |
| 物理程度 | 拟真但可控：自写简化公式，不引入物理引擎 |
| 技术架构 | Vite + Vue 3 + 原生 three.js，物理与计分抽成可单测纯函数 |
| 迭代 1 | 每球结束后双方球拍瞬时重置到默认位置，发球前显示 3→2→1 倒数（共 3 秒） |

## 架构

纯前端静态 SPA，无后端、无云函数、无平台存储（比分仅存在于当前页面会话，刷新即重置）。
Vue 负责界面层，three.js 场景封装为独立引擎，两者通过回调与响应式状态单向通信。

```
index.html
src/main.js
src/App.vue                    编排覆盖层、HUD 与游戏画布
src/style.css                  全局样式（配色、排版、四态、焦点）
src/composables/usePongGame.js 持有引擎实例与响应式状态、事件接线
src/components/ScoreBoard.vue  比分 / 发球方 / 局内提示
src/components/StartOverlay.vue    开始界面与操作说明
src/components/GameOverOverlay.vue 胜负界面与再来一局
src/components/SoundToggle.vue     音效开关
src/components/ServeCountdown.vue  发球倒计时大数字（迭代 1 新增）
src/game/config.js            全部尺寸、速度、重力、配色常量
src/game/physics.js           纯函数：积分、反弹、过网、球拍碰撞、出界、落点预测
src/game/scoring.js           纯函数：计分、换发球、胜负判定、倒计时数值
src/game/ai.js                AI 对手追踪逻辑
src/game/input.js             键盘输入轴状态
src/game/rally.js             对局状态：归位、待发球、发球、单步推进
src/game/models.js            球桌 / 球网 / 球拍模型构建
src/game/scene.js             three.js 场景构建（桌、网、地板、灯光、球拍、球）
src/game/effects.js           球拖尾线、得分粒子
src/game/audio.js             Web Audio 合成音效
src/game/PongEngine.js        编排：固定步长循环、输入、阶段状态、倒计时、回调、销毁
src/game/*.test.js            纯逻辑单测（physics / scoring / input / rally）
vite.config.js                base 取 PREVIEW_BASE、allowedHosts: true
start-preview.sh              0.0.0.0:$PORT 启动预览
package.json                  dev / build / test 脚本
```

`physics.js`、`scoring.js`、`rally.js` 不得 import three.js 或访问 DOM，输入输出均为普通对象；
`scene.js`、`models.js` 与 `effects.js` 只负责把状态映射为 mesh；`PongEngine.js` 是唯一同时了解
规则与场景的编排者。Vue 组件不直接触碰 three.js 对象。

### 纯函数接口约定

- `physics.js` 导出 `stepBall(state, dt, config)` → 返回新的球状态；
  `judgeRally(state, prevState, config)` → 返回 `null` 或
  `{ winner: 'player' | 'ai', reason: string }`。`reason` 是固定中文文案枚举，不拼接用户输入。
  `judgeRally` 只判定、不改比分；计分一律由 `scoring.js` 完成。
- `scoring.js` 导出 `applyPoint(scores, winner)` → 新比分对象；
  `isGameOver(scores)` → 布尔；`serverFor(totalPoints, deuce)` → `'player' | 'ai'`；
  `countdownFor(remaining)` → 0–3 的整数（迭代 1 新增）。定义为
  `Math.min(3, Math.max(0, Math.ceil(remaining)))`；`remaining` 为 NaN / ±Infinity /
  非数字时返回 0。例如 3.0→3、2.4→3、2.0→2、0.4→1、0→0、-1→0。
  其余函数对非整数、负数或无效 winner 的输入返回原值 / `false`，不抛异常、不产生 NaN 状态。
- `rally.js` 导出 `prepareServe(sim, server)` → 就地归位并返回 `sim`（迭代 1 新增），
  以及 `createSimulation` / `resetSimulation` / `serveSimulation` / `advanceSimulation`。
- 所有速度、位置在每步更新后按 `config` 上限截断，避免长帧或连续击球导致速度无界增长。

## 数据流

键盘事件 → 引擎输入轴状态 → 固定步长 1/120s 更新（球拍移动 → AI 追踪 → 球体积分 →
碰撞与规则裁决 → 计分事件）→ 引擎 `emit()` 回调 `onState` → `usePongGame` 写入响应式状态
→ Vue 渲染 HUD、倒数提示与覆盖层。`onState` 载荷包含 `phase / scores / server / message /
winner / muted / countdown`。
同一份状态每帧同步到 three.js mesh 位置，并触发音效与粒子。渲染帧率与物理解耦，
保证不同刷新率设备手感一致。`requestAnimationFrame` 在引擎 `dispose()` 时取消。
倒数值由引擎的 `serveTimer` 在固定步长循环里推导，不用 `setTimeout`，因此与物理共用
同一时钟；仅当整数秒数值变化时才 `emit()`，避免每个子步都触发 Vue 更新。

## 玩法规则

- 坐标系：1 单位 = 1 米。球桌长 2.74（z 轴）、宽 1.525（x 轴）、台面高 0.76（y 轴），
  网高 0.1525，网在 z=0。摄像机位于近端斜上方 (0, 1.52, 2.5)，透视看向 (0, 0.82, 0)。
- 玩家球拍位于 z=+1.5 平面，WASD / 方向键控制 x（±0.85）与 y（0.8–1.35）；
  球拍碰到来球自动回击，球拍移动速度附加到球的横向/纵向速度上，形成可变的回球角度。
- AI 球拍位于 z=-1.5，按预测落点以有限最大速度追踪并带少量误差，因此快速变线可得分。
- 球：半径 0.02，重力 -6.5（为手感略低于真实重力），台面反弹系数 0.8。一次合法回击
  必须过网并在对方半台落地一次。以下情形判对方得分，并显示中文原因：
  - 「球下网了」：球穿过 z=0 平面时高度低于 `台面高 + 网高 + 球半径`；
  - 「球落在自己半台」：来球未过网即在击球方半台落地；
  - 「球二次落地」：球在同一半台落地两次而对方未击中；
  - 「球出界了」：`|x| > 桌宽/2 + 0.1` 或 `|z| > 桌长/2 + 0.45`；
  - 「没接到球」：球越过球拍所在 z 平面且未被击中。
- 发球采用简化规则：球从发球方球拍位置直接朝对方半台发出，**不要求先在发球方半台
  弹一次**；发球同样必须过网并落在接发球方半台，否则按上述规则判分。这样避免与
  「落在自己半台」判定冲突。
- 计分：先到 11 分且净胜 2 分获胜（10:10 后需连胜 2 分）。常规阶段每累计 2 分换发球；
  双方均达 10 分后改为每 1 分换发球。HUD 显示当前发球方。
- 开局为 `ready` 阶段，点「开始游戏」进入 `serving`（同时解锁 Web Audio），先走 3 秒
  发球倒数再进入 `playing`；每分之间同样进入 `serving`，先归位再倒数 3 秒（见「迭代 1」）；
  分出胜负进入 `gameover`，「再来一局」重置状态回到 `serving`。没有单独的击球键，
  球拍碰到球即自动回击。
- 阶段是单一字符串 `ready | playing | serving | gameover`，不用多个互斥布尔值。
- 固定步长循环每帧最多消费 8 个子步，防止标签页切回后长时间补帧造成卡顿。

## 迭代 1：每球归位与开球倒数

**问题**：原实现里 `award()` 判分后直接进 `serving`，`serveDelay` 只有 1 秒且没有可见提示；
球拍只在整局 `restart()` 时归位，导致每球之间球拍停在上一次接球的位置，且上一球一结束
下一球马上开始，玩家来不及重新摆位。

**决定**

- `CONFIG.rules.serveDelay` 由 1 秒改为 3 秒。新增 `state.countdown`（取值 3 / 2 / 1 / 0，
  0 表示当前不在倒数），随 `onState` 下发；`usePongGame.js` 的响应式状态增加
  `countdown: 0`。`ready` / `playing` / `gameover` 三个阶段 `countdown` 恒为 0。
- 倒数时钟复用引擎的固定步长循环：`serving` 阶段每子步递减 `serveTimer`，
  `countdownFor(Math.max(0, serveTimer))` 得到 `Math.ceil` 后的整数秒；仅当数值与
  `state.countdown` 不同才赋值并 `emit()`，每秒最多一次 Vue 更新。`serveTimer <= 0`
  时调 `serve()`，把 `countdown` 归 0。不使用 `setTimeout`，避免与物理时钟漂移。
- `rally.js` 新增 `prepareServe(sim, server)`：两只球拍回到 `createPaddle()` 默认值
  （x=0、y=0.98）、球放到发球方待发位置（确定性 `createBall(server, () => 0.5)`）、
  `rally` 置为非活动、AI 控制器时间归零。`resetSimulation()` 复用该函数。
- `PongEngine.award()` 判分后立即调用 `prepareServe`（包括决出胜负的那一分），
  再进入 `serving` 或 `gameover`；`restart()` 走同一归位与 3 秒倒数路径。
  归位是**瞬时重置**，不做滑行动画。
- `serving` 阶段 `update()` 提前返回，玩家输入与 AI 追踪都不执行，因此倒数 3 秒内两只
  球拍静止在中位，玩家有明确的时间重新摆位。`serve()` 仍用 `serveSimulation()` 生成
  带随机横向偏移的发球，倒数期间显示的待发球位置不参与物理。
- 新增 `src/components/ServeCountdown.vue`（props `count: Number`，默认 0）：
  `count > 0` 时在球桌区中央显示大号数字（≥64px，同色系提亮色 `#7ee2c0`）与
  「准备发球」小字，`aria-live="polite"`、`pointer-events: none`、`scoped` 样式，
  层级在 HUD（z-index 2）之上、覆盖层（z-index 5）之下。数字变化用 `:key` 重放入场动画。
  `App.vue` 挂载 `<ServeCountdown :count="state.countdown" />`；
  `ScoreBoard` 的上一分原因提示保持不变，不被倒数覆盖。
- `countdown` 是纯展示字段，不参与判罚、计分或换发球；既有 WebGL / AudioContext /
  循环异常兜底路径不变。

**验收**：得分后能看到 3→2→1 逐秒变化；两只球拍在倒数期间位于中位且按键无法移动；
3 秒后自动开球并进入对打；胜负界面不显示倒数；「再来一局」也从 3 秒倒数开始。

**范围之外**：滑行归位动画、「开球！」闪字、倒数音效、暂停、可跳过倒数。

## 视觉与交互

- 单主色深青绿 `#1c6b5a`（台面、玩家球拍、按钮底色），中性灰阶背景 `#15181d`、
  灰色对手球拍 `#8b929c`、近白球与正文 `#f5f3ee`；白色细线勾出台面边界与中线。
  HUD 中的强调文字使用同色系提亮色 `#7ee2c0`，保证在深色背景上对比度 ≥4.5:1；
  错误提示只在 WebGL / 运行异常覆盖层出现，用独立的 error 色，不用于装饰。
- 环境光 + 方向光与阴影，抗锯齿，`devicePixelRatio` 上限 2。球拖尾为带顶点色的
  `THREE.Line`（记录最近 N 个位置），得分时生成约 24 个短生命周期粒子并自动回收。
- 音效由 Web Audio 实时合成（击球、落台、得分三种短音），无外部音频资源；
  HUD 提供静音开关。AudioContext 只在用户点击「开始游戏」后创建。
- HUD：比分、发球方、局内原因提示、静音按钮，以及 `serving` 阶段中央的
  3→2→1 发球倒数（`ServeCountdown.vue`）。按钮与覆盖层遵循对比度 ≥4.5:1、
  正文 ≥16px、行高 1.5、4px 倍数间距、hover/focus/active/disabled 四态、可见键盘焦点、
  点击目标 ≥24px。所有交互元素有可访问名称，装饰性图形不进入可访问树。
- 无网络请求、无用户输入拼接到 DOM 或 URL，故不引入 `innerHTML` 与富文本渲染。

## 错误处理

- 无后端，因此没有网络错误路径。
- WebGL 不可用或 renderer 创建失败：显示中文说明「浏览器不支持 WebGL 或硬件加速」及
  「重试」按钮，不白屏、不抛未捕获异常。
- AudioContext 创建或恢复失败：将 `muted` 置为 true，游戏照常可玩，不阻塞主流程。
- 渲染/更新循环顶层 `try/catch`：异常时取消 RAF、停止循环、通过 `onError` 显示
  「游戏遇到问题，请重新开始」并提供重开按钮；错误信息不暴露堆栈。
- 容器宽高为 0 时跳过 resize；`dispose()` 释放 geometry/material/renderer 并解绑监听。

## 测试

- 使用 Node 内置 `node --test`，脚本 `npm test`；不引入测试框架依赖。
- 只测纯逻辑，不测 Vue 渲染、three.js 场景或平台 API。
- `src/game/physics.test.js`：台面反弹后 vy 反向且按 0.8 衰减；球低于网高穿过 z=0 时
  `judgeRally` 返回 `winner` 为击球方对手且 reason 为「球下网了」；二次落地、出界、
  未接到球各返回对应判罚；球拍碰撞使 vz 反向；边界值（球恰好等于台面高度、恰好在
  边线上时不判出界）。
- `src/game/scoring.test.js`：`isGameOver` 对 10:10 返回 false、对 11:9 与 12:10 返回 true；
  `serverFor` 在总分为 0/1 时同一发球方、2/3 时换方，deuce 后逐分换方；`applyPoint`
  从 0:0 连续给同一方加分得到 1:0、2:0、3:0；无效 winner 与非整数比分返回原值不产生 NaN；
  `countdownFor` 对 3.0→3、2.4→3、2.0→2、0.4→1、0→0、负数/NaN→0。
- `src/game/rally.test.js`：`prepareServe` 后两只球拍回到默认位置、`rally.active` 为 false、
  球位于发球方待发 z 平面；`resetSimulation` 复用归位后结果一致。
- `src/game/input.test.js`：按键轴映射、松开归零、失焦清空、`dispose` 解绑。
- 每个测试只断言一件事，失败信息包含期望值与实际值；测试之间不共享可变状态。
- 浏览器验收覆盖迭代 1：得分后 3→2→1 可见、倒数期间球拍在中位且按键无效、3 秒后开球。

## 交付与运行

- `npm run dev` 零手动步骤启动；`npm run build` 产出静态资源；`npm test` 跑单测。
- 部署到 EdgeOne Makers：纯静态前端，不需要 `edge-functions/` 或 `cloud-functions/`，
  不需要 `edgeone.json` 重定向规则，不需要密钥或环境变量。
- `vite.config.js` 的 `base` 取自 `process.env.PREVIEW_BASE`，`server.allowedHosts: true`；
  `start-preview.sh` 以 `0.0.0.0:$PORT` 启动并透传 `--base "$PREVIEW_BASE"`。

## 范围之外

双人同屏、鼠标/触屏控制、难度选择、暂停、排行榜与最高分持久化、物理引擎、
外部模型与贴图资源、多人联网；迭代 1 还排除滑行归位动画、「开球！」闪字、倒数音效、
可跳过倒数。

---

## 迭代 2：修正发球方向与 AI 接发球

本章为对前文的**修订**：凡与本章冲突的发球几何、AI 控制器与相关测试描述，以本章为准。
架构、数据流、计分、倒数/归位、UI、错误处理与交付方式均不变。

**问题**：我方发球时对手每次都接不到球，发球之后无法形成对打。

**根因（已实测复现）**

1. `physics.js` 的 `createBall(server, rng)` 把 `position.z` 与 `velocity.z` 取成同号：
   `dir = server === 'player' ? -1 : 1`，`position.z = dir * serveZ`，
   `velocity.z = dir * serveVz`。我方发球时球生成在 `z = -1.45`（对手半台、距对手
   拍平面仅 0.05），却以 `vz = -3.35` 继续朝远离球台的方向飞，等价于「从对手身后
   直接飞出界」。对手拍在第 0 步即被判定碰到球，玩家看到的是球在远端瞬移而非一次发球。
2. `rally.js` 的 `prepareServe()`（迭代 1 新增）每球把 `ai` 控制器替换为
   `createAiController()`，使 `time` 归零；而 `ai.js` 的误差是
   `sin(time * 2.3) * aiErrorFast + sin(time * 0.7) * aiErrorSlow`。发球飞到对手拍前
   恒为 `time ≈ 0.88`，误差恒为 `+0.20`，大于命中半径
   `hitRadiusX + ball.radius = 0.19`。诊断显示球拍稳定停在 `x ≈ 0.20`、球在 `x = 0`，
   `dy ≈ 0`，因此是**横向系统偏差**而非 y 轴追踪问题。仅修正方向后，200 次模拟中
   AI 首接率仍为 `0/200`。

**决定**

- **发球几何**：`createBall(server, rng)` 改为「位置在发球方半台、速度指向对方半台」。
  令 `dir = server === 'player' ? 1 : -1`，`position.z = dir * serveZ`，
  `velocity.z = -dir * serveVz`；`x`、`y`、随机源与其余速度分量不变。
  沿用简化发球规则（球从发球方球拍位置直接朝对方半台发出，不要求己方半台先弹一次），
  仍须过网并落在接发球方半台，否则按既有判罚处理。解析校验：`t = 1.45 / 3.35 ≈ 0.433s`
  时过网高度约 `1.10`，高于网顶 `0.9325`；首落点约 `z = -0.63`（对方半台），合法。
- **AI 误差相位**：`createAiController(rng = Math.random)` 返回
  `{ time: 0, phase: rng() * Math.PI * 2 }`；`updateAiPaddle()` 用
  `controller.time + controller.phase` 计算正弦误差，误差幅度与 `aiSpeed`、
  `aiErrorFast` / `aiErrorSlow` / `aiYSpeedFactor` 常量均不变。
  `prepareServe()` 每球重建控制器即自然获得新相位，不再出现逐球复现的同一偏差；
  AI 仍会因较大相位偶尔漏球，玩家仍可靠快速变线得分，保持可赢性。
  随机源通过参数注入，单测传 `() => 0.5` 可得到确定性结果。
- **不改**：`judgeRally`、`stepBall`、`returnBall`、`checkPaddleHit`、`clampVelocity`、
  判罚文案枚举、计分与换发球、倒数与归位、Vue 组件、three.js 场景、
  WebGL / AudioContext / 循环异常兜底、构建与部署配置。不新增生产文件与依赖；
  新增断言写入既有 `physics.test.js` 与 `rally.test.js`。

**验收**

- 单测：`createBall('player')` 满足 `position.z > 0 && velocity.z < 0`；
  `createBall('ai')` 满足 `position.z < 0 && velocity.z > 0`；两侧互为镜像。
- 单测：由发球轨迹推进到首次落台，断言产生 `netCross` 且高度高于网顶、
  `tableBounce` 落在对方半台、不返回「球落在自己半台」判罚。
- 单测：`createAiController(() => 0.5)` 的 `phase` 为 `Math.PI`；
  `updateAiPaddle` 在两个不同 `phase` 下收敛到不同目标 x；
  `prepareServe` 后 `ai.time === 0` 且 `phase` 是 `[0, 2π)` 内的有限数。
- 统计验收（Node 脚本，200 次我方发球、玩家不移动球拍）：AI 首接率 ≥ 75% 且 < 100%，
  不出现 `0/200`；锁定相位的旧行为为 0%、随机相位实测 83%。
- 浏览器：开局我方发球，球从近端飞向远端并过网，对手球拍移动接球；
  得分不再每次白送；3→2→1 倒数与球拍归位仍正常；控制台无未捕获异常、无 404。
- 回归：`npm test` 全绿、`npm run build` 退出码 0；所有新增/修改单文件 ≤200 行。

**范围之外**：真实发球（己方半台先弹一次）、发球抛球动画、AI 必胜或难度选择、
调整判罚规则、双人对战、任何 UI 文案改动。

---

## 迭代 3：旋转与击球意图（最小切片）

本章为对前文的**修订**：凡与本章冲突的输入方式、AI 参数来源、范围之外条目、
`createBall` / `returnBall` / `advanceSimulation` / `createAiController` 签名描述，
以本章为准。固定步长 `1/120`、最多 8 子步、`ready | playing | serving | gameover`
状态机、11 分制与换发球、迭代 1 的归位与 3→2→1 倒数、迭代 2 的发球方向与
AI 随机相位、WebGL / AudioContext / 循环异常兜底、纯静态交付方式均不变。

### 背景与问题

初版球只有 `position` / `velocity`，回球由 `returnBall` 用球拍横移与随机量一次性
算出，发球只有一种，AI 只有一套固定误差。玩家无法主动选择搓、攻、拉等技术，
「乒乓球的丰富技术」没有被表达。本次以最小切片引入旋转与两种击球意图，
并叠加 AI 难度参数化与一句话技术提示。

### 已确认的需求（四轮澄清结论）

1. **输入**：键盘长按式。按住 `Space` = 蓄力攻（上旋），按住 `Shift` = 搓短（下旋），
   都不按 = 普通回击。击球瞬间读取当前按键状态决定意图。不引入鼠标 / 触屏。
2. **意图层**：`intent` 为设备无关的普通对象 `{ type, charge }`，`type` 取
   `'drive' | 'push' | 'none'`，`charge ∈ [0, 1]`。规格同时约定未来可附加
   `direction?`（二维挥拍方向），但本轮**不产生、不读取该字段**；触屏独立小迭代
   接入时再扩展，避免留下无人消费的死字段。
3. **触屏范围**：本轮不纳入。触屏更适合表达摩擦方向与挥拍速度，但会引入 3D 拾取、
   手势冲突与真机手感验证，超出最小切片；作为独立迭代接同一 `intent` 接口，
   旋转 / AI / 提示等纯逻辑零返工。
4. **AI 难度**：只做内部参数化，**不提供玩家选择 UI**。
5. **默认值**：技术提示在玩家命中后出现、发球与得分时清空、不覆盖原 message；
   旋转只影响 y 加速度与落台水平速度、不引入侧旋；`charge` 按固定步长累积与
   衰减、`Shift` 优先；发球与 AI 回球保持无旋。

### 对前文范围条目的修订

- 原「不含难度选择」→ **难度仅内部参数化，不提供玩家选择 UI**；迭代 2
  「范围之外：AI 必胜或难度选择」中的「难度选择」同义修订。
- 原「操作方式：键盘 WASD / 方向键（不做鼠标与触屏控制）」→ 增加 `Space` / `Shift`
  两个语义键；**仍不做鼠标与触屏控制**。
- 迭代 2「不新增生产文件与依赖」→ 本轮新增 `spin.js` / `tips.js` / `session.js`
  三个纯逻辑文件；**仍不新增依赖**，仍不新增 three.js / DOM 依赖到纯逻辑模块。
- 迭代 2「任何 UI 文案改动」的范围外声明 → 本轮新增技术提示与两条键位说明文案，
  其余 UI 文案不变。
- 原「`config.paddle` 持有 `aiSpeed` / `aiErrorFast` / `aiErrorSlow` /
  `aiYSpeedFactor`」→ 四项迁移到 `config.aiProfiles`，`config.paddle` 不再保留；
  `paddle` 段的 `minX` / `maxX` / `playerSpeed` / `hitRadius*` 等不变。

### 架构与模块边界

```
新增（均为纯逻辑，不 import three.js、不访问 DOM）
  src/game/spin.js      旋转计算 + 意图出球
  src/game/tips.js      固定中文提示文案枚举 + tipFor()
  src/game/session.js   createSessionState() / sessionPayload() / pointMessage()
修改
  config.js        spin 段、aiProfiles 三档、rules.chargeTime、INTENT_NONE
  physics.js       createBall 带 spin；stepBall 调 spin.js；returnBall 末尾接 intent
  rally.js         advanceSimulation 接 intent；玩家命中转发意图、AI 传 INTENT_NONE
  input.js         tick(dt) / intent() / charge 累积衰减 / GAME_KEYS 扩键
  ai.js            createAiController(rng, profile)；updateAiPaddle 读 aiProfiles
  PongEngine.js    state.tip / onHit 更新提示 / 传 intent；状态构造下沉 session.js
  usePongGame.js / App.vue / ScoreBoard.vue / StartOverlay.vue
不改
  scene.js / models.js / effects.js / audio.js / serveClock.js / scoring.js /
  judgeRally / checkPaddleHit / clampVelocity / 判罚文案枚举
```

`PongEngine.js` 当前恰好 200 行，新增字段必然越界，因此 `session.js` 是**必须**的
拆分而非可选优化。`src/` 下所有新增/修改单文件保持 ≤200 行；球的自转可视化不做，
three.js 场景与特效层不改。

### 数据流

- **意图链**：`PongEngine.update(dt)` 在 `playing` 分支依次调
  `input.tick(dt)` → `const intent = input.intent()` →
  `advanceSimulation(sim, dt, axes, hooks, intent)` → 玩家拍命中时传给
  `returnBall(..., intent)` → `applyIntent()` 写入出球 `spin` 与速度。
  `serving` 分支提前 return，不 tick、不消费意图，与迭代 1 一致；
  `serve()` 调 `input.resetCharge()`（**只**清零 charge，不清 `pressed`），
  保证新一拍从 `charge = 0` 开始，又不会把发球倒数期间一直按住的 WASD 抹掉
  ——否则浏览器不再重发 `keydown`，玩家必须松手再按才能移动球拍。
- **旋转链**：`spin` 随球对象在 `stepBall` 中透传并衰减；`spinAcceleration` 每步
  影响 `v.y`，`spinBounceVelocity` 在 `tableBounce` 时影响 `v.z`；
  `judgeRally` 不读 `spin`，判罚仍只看过网、落点与落地次数。
- **提示链**：玩家命中时 `hooks.onHit(side, intent)` →
  `tipFor(intent)` → `state.tip` → `emit()` 内 `sessionPayload()` 读取并下发 →
  `usePongGame` → `ScoreBoard` 的 `.tech-tip` 行。AI 命中不更新提示。
  本轮发球与 AI 回球的 `spin` 恒为 0，因此提示只由玩家意图驱动；
  `tipFor` 不接收来球旋转参数，后续 AI 加旋迭代再扩展签名，避免留下
  永远不触发的分支。
- **难度链**：`prepareServe()` 每球 `createAiController()` 默认 `standard` →
  `updateAiPaddle()` 从 `config.aiProfiles[controller.profile]` 取参数。

### 物理与数据

`spin` 为归一化标量 `[-1, 1]`：正数上旋、负数下旋、0 无旋；非有限数一律兜底为 0。

`spin.js` 导入 `CONFIG`，四个纯函数的参数与返回值均为普通对象 / 数值；
每个函数用 `const s = config?.spin ?? CONFIG.spin` 取参数组，因此既有测试传入的
自定义 `config` 即使没有 `spin` 段也不会报错。`clamp` 为 `spin.js` 内的局部辅助，
**不从 `physics.js` 导入 `clampVelocity`**，避免 `physics.js → spin.js → physics.js`
循环依赖。

- `spinAcceleration(spin, vz, config)` → `{ y }`，
  `y = -spin * s.magnusY * Math.abs(vz)`。上旋下压、下旋上浮；
  `spin = 0`、水平速率为 0 或非有限数时恒返回**正** `{ y: 0 }`
  （实现上显式短路，避免 `spin > 0` 且 `vz = 0` 时产生 `-0`）。
- `spinBounceVelocity(vz, spin, config)` →
  `vz * (1 + spin * s.bounceZ)`，上旋前冲、下旋回缩，方向不变。
- `decaySpin(spin, dt, config)` →
  `clamp(spin * (1 - s.decay * dt), -1, 1)`，非有限输入返回 0。
- `applyIntent(ball, intent, config)` → 返回带 `spin` 的球对象：
  · `drive`：`spin = clamp(charge, 0, 1)`，`vz *= 1 + charge * s.driveVzGain`，
    `vy -= charge * s.driveVyDrop`；
  · `push`：`spin = s.pushSpin`（-0.6），`vz *= s.pushVzScale`（<1），
    `vy += s.pushVyLift`；
  · `none` 或未知 `type`：**原样返回**并补 `spin: 0`，数值与迭代 2 逐帧一致。

速度截断仍由 `physics.js` 的 `returnBall` 负责：`applyIntent` 只改写速度分量，
不自行截断；`returnBall` 在拿到结果后沿用既有 `clampVelocity(velocity, b.maxSpeed)`
调用，因此 `spin.js` 与 `physics.js` 是单向依赖。

`config.spin` 默认值：`{ magnusY: 0.55, bounceZ: 0.18, decay: 0.35,
pushSpin: -0.6, driveVzGain: 0.55, driveVyDrop: 0.02, pushVzScale: 0.78,
pushVyLift: 0.14 }`；`config.rules.chargeTime = 0.8`（秒，按住 `Space` 从 0 到
满蓄力所需的固定步长累积时长）；`config.js` 另导出 `INTENT_NONE`。
强度上限以「不改变现有过网 / 落台 / 出界判定结论」为准：`none` 意图下
`stepBall` 的输出与迭代 2 数值相同；`drive` / `push` **必须**仍能过网且首落点
在对方半台，这是验收断言，具体常量可在实现时微调但不得新增判罚类型。

**实现期校准记录**：设计初值 `magnusY 0.9 / driveVzGain 0.22 / driveVyDrop 0.12`
在满蓄力 `drive` 下过网高度仅 0.895（低于网顶 0.9325）、判「球下网了」，
不满足上述验收断言。以真实对打中玩家击球高度实测分布（257 次采样，
`[0.926, 1.059]`）为基准，网格搜索把三项微调为 `0.55 / 0.55 / 0.02`：
上旋下坠仍可感知，但满蓄力攻球在留余量的高度带 `[0.9, 1.1]` 全区间过网且
首落点在对方半台，`drive` 与 `push` 过网高度差约 0.07（弧线差异可见）。
其余五项常量、公式与判罚类型均不变；发球 `spin = 0`，故发球首接率不受影响。

`createBall(server, rng)` 返回对象增加 `spin: 0`（发球无旋）；
`createRally` 不变；`prepareServe` 经 `createBall(server, () => 0.5)` 自然得到 0。
`stepBall` 开头取 `const spin = ball.spin ?? 0`（`state.ball` 可能来自不含
`spin` 的旧测试夹具）：在 `v.y += gravity * dt` 之后追加
`v.y += spinAcceleration(spin, v.z, config).y * dt`；`tableBounce` 分支在竖直
反弹之后追加 `v.z = spinBounceVelocity(v.z, spin, config)`；返回球对象携带
`spin: decaySpin(spin, dt, config)`。三处调用的 `config` 都是 `stepBall` 既有的
第三参数，不新增签名。
`returnBall(ball, paddle, side, rng, config, intent = INTENT_NONE)` 末尾改为
`const shaped = applyIntent({ position, velocity }, intent, config)`，再返回
`{ ...shaped, velocity: clampVelocity(shaped.velocity, b.maxSpeed) }`；
前五个参数与既有调用完全兼容，`INTENT_NONE` 时输出与迭代 2 数值一致。

### 输入

`input.js` 从 `config.js` 导入 `CONFIG` 与 `INTENT_NONE`；`GAME_KEYS` 增加
`' '`（空格）与 `'shift'`；现有 `onKeyDown` 已对所有游戏键调用
`preventDefault()`，因此空格自动阻止页面滚动。`pressed` 仍按
`event.key.toLowerCase()` 存储。

- `tick(dt)`：按住 `Space` 时
  `charge = Math.min(1, charge + dt / CONFIG.rules.chargeTime)`；否则
  `charge = Math.max(0, charge - 2 * dt / CONFIG.rules.chargeTime)`（松开衰减快一倍）。
- `intent()`：`Shift` 优先返回 `{ type: 'push', charge: 0 }`；否则 `Space` 返回
  `{ type: 'drive', charge }`；否则 `INTENT_NONE`。`Shift` 优先是因为同时按下属于
  误操作，搓短出球更慢、代价更小。
- `charge` 为 `createInput()` 闭包内的局部变量（每个输入实例各自一份，
  不是模块级共享状态，也不承载跨请求数据）。
  抽出两个内部动作：`resetAll()` 清空 `pressed` 且 `charge = 0`；
  `resetCharge()` **只**置 `charge = 0`。对外方法：
  `clear()` → `resetAll()`（`restart()` 用，整局重来时清空按键符合预期）；
  `resetCharge()` → 同名（每次 `serve()` 用）；`blur` → `resetAll()`；
  `dispose()` → `resetAll()` 后照旧移除三个监听器，行为不变。
  `axes()` 不变，仍只读 `pressed`，因此 `resetCharge()` 不影响移动手感。
- `INTENT_NONE` 由 `config.js` 导出为 `Object.freeze({ type: 'none', charge: 0 })`，
  供 `physics.js` / `rally.js` / `input.js` 作默认值与兜底。

`rally.js` 导入 `INTENT_NONE`，签名扩为
`advanceSimulation(sim, dt, axes, hooks = {}, intent = INTENT_NONE)`：
玩家拍命中调 `returnBall(sim.ball, sim.playerPaddle, 'player', Math.random,
CONFIG, intent)`，AI 拍命中末位传 `INTENT_NONE`（AI 回球无旋、不建模吃转）；
`hooks.onHit?.(side, intent)` 扩展为带参，既有不传 `hooks` 的调用与断言不受影响。
`sim.playerPaddle` 的 `vx` 仍由 `movePaddle` 提供，`returnBall` 的既有公式不变。

### AI 难度参数

```
config.aiProfiles = {
  practice: { speed: 1.3, errorFast: 0.22, errorSlow: 0.14, ySpeedFactor: 0.5 },
  standard: { speed: 1.8, errorFast: 0.16, errorSlow: 0.10, ySpeedFactor: 0.6 },
  sharp:    { speed: 2.3, errorFast: 0.09, errorSlow: 0.06, ySpeedFactor: 0.72 },
}
```
`standard` 与当前数值**完全相同**，保证默认行为零回归。
`createAiController(rng = Math.random, profile = 'standard')` 返回
`{ time: 0, phase: rng() * Math.PI * 2, profile }`；迭代 2 的随机相位与
`controller.phase ?? 0` 兜底保留。`updateAiPaddle` 用
`const profiles = config.aiProfiles ?? CONFIG.aiProfiles`、
`const p = profiles[controller.profile] ?? profiles.standard` 读取
`speed` / `errorFast` / `errorSlow` / `ySpeedFactor`；`ai.js` 导入 `CONFIG`，
因此既有测试传入的不含 `aiProfiles` 的自定义 `config` 仍走默认档、不报错。
`PongEngine` 不感知档位，本轮不提供任何切换入口。

### UI 与一句话技术提示

`tips.js` 导出 `tipFor(intent)`，返回**固定字符串枚举**、不拼接用户输入：

| 条件 | 文案 |
|---|---|
| `drive` 且 `charge ≥ 0.7` | `蓄力弧圈 · 上旋让球下坠更快` |
| `drive` | `上旋快攻 · 压低弧线` |
| `push` | `搓短下旋 · 落台后会回缩` |
| `none`、未知 `type` 或非对象输入 | `''`（不显示） |

`PongEngine` 的 `state` 增加 `tip: ''`；`emit()` 经 `sessionPayload()` 下发；
`onHit` 回调**先照旧**对双方命中调用 `this.audio.play('hit')`（音效不回归），
再在 `side === 'player'` 时计算 `tipFor(intent)`，仅当文案与当前值不同才赋值
并 `emit()`，避免每拍重复触发 Vue 更新；`onBounce` / `onTrail` 两个钩子不变。
`serve()` 与 `award()` 把 `tip` 置 `''`。`session.js` 承担
`createSessionState()` / `sessionPayload()` / `pointMessage(winner, reason, over)`，
`PongEngine` 只调用，以守住 200 行上限。

`ScoreBoard.vue` 新增 `tip: { type: String, default: '' }`，在 `.score-hint` 之下
增加 `<p v-if="props.tip" class="tech-tip" aria-live="polite">{{ props.tip }}</p>`，
scoped 样式用独立色号与 16px 字号；**不覆盖**原「理由 · 得分」与发球提示。
`App.vue` 透传 `:tip="state.tip"`；`usePongGame` 的响应式 state 增加 `tip: ''`。
`StartOverlay.vue` 的键位列表与 `App.vue` 页脚补充两条说明：`Space` 按住蓄力上旋、
`Shift` 按住搓短下旋、不按 = 普通回击。不加难度选择器。

### 错误处理

`spin` / `intent` / `charge` / `tip` 都是纯展示或输入字段，**不参与判罚、计分、
换发球**。兜底：非有限 `spin` → 0；未知 `intent.type` → `INTENT_NONE`；未知
`profile` → `standard`；`charge` 恒 clamp 到 `[0, 1]`；`direction?` 本轮被忽略。
WebGL 失败、AudioContext 失败、循环异常三条既有兜底路径与中文文案不变。
交付仍为纯静态 SPA：无 `edge-functions/` / `cloud-functions/` /
`edgeone.json`，无密钥、无环境变量、无平台存储、无网络请求。

### 测试

- 新增 `spin.test.js`：上旋 `y < 0` / 下旋 `y > 0` / `spin = 0` 恒为 0；
  落台前冲与回缩方向正确；衰减有界且非数兜底 0；`applyIntent` 三种分支的
  `spin` 与速度差异，`none` 原样返回；`spin = 0` 时 `stepBall` 对含 `spin`
  与不含 `spin` 的球夹具给出相同结果。
- 新增 `tips.test.js`：四条条件各返回对应固定文案；`none`、未知 `type`、
  `null` 与非对象输入均返回 `''`；文案不含用户输入拼接。
- 新增 `ai.test.js`：三档 `profile` 产生不同的 paddle 收敛速度；未知档回退
  `standard`；`phase` 缺失仍按 0 处理。
- 新增 `spinIntegration.test.js`：`physics.test.js` 已 198 行、无扩展余量，
  因此物理层集成断言放新文件——`createBall` 带 `spin: 0`；`none` 意图下
  `stepBall` / `returnBall` 与迭代 2 基线数值一致；`drive` / `push` 出球仍
  满足过网且首落点在对方半台；既有 `physics.test.js` **不改动**。
- 扩展 `input.test.js`：`Space` / `Shift` 意图、charge 累积与松开衰减、
  `Shift` 优先、`blur` 清空 charge、空格触发 `preventDefault`；
  `resetCharge()` 清零 charge 但 `axes()` 仍保留按住的方向键（回归发球倒数
  期间持续按键的场景），`clear()` 则两者都清。
- 扩展 `rally.test.js`：intent 透传到玩家回球；AI 命中回球 `spin = 0`；
  `prepareServe` 后 `ball.spin === 0` 且 `ai.profile === 'standard'`；
  `onHit` 收到 `side` / `intent`。
- 扩展 `PongEngine.test.js`：`emit()` 载荷含 `tip`；玩家命中后提示更新、
  AI 命中不更新；`serve()` / `award()` 清空提示；`serving` 分支不推进 charge。
- 每个测试只断言一件事，失败信息包含期望值与实际值；纯逻辑测试不触碰 DOM、
  three.js 与平台 API。

### 验收

- `npm test` 全绿、`npm run build` 退出码 0；`src/` 下所有新增/修改单文件 ≤200 行。
- 统计回归（200 次我方发球、玩家不移动球拍）：AI 首接率仍 ≥ 75% 且 < 100%，
  不出现 `0/200`；`standard` 档参数与迭代 2 数值逐项相同，默认行为零回归。
- 浏览器（480×360 SwiftShader + 1280×900 + 390×844）：按住 `Space` 与按住
  `Shift` 出球弧线有可见差异、技术提示出现在 HUD、不按键时手感与迭代 2 相同；
  3→2→1 倒数、球拍归位、我方发球方向与 AI 接发球、胜负界面无倒元素均不回归；
  控制台无未捕获异常、无 404。
- 清理：`git status --short` 无验证产物与临时依赖残留。

### 范围之外

侧旋与旋转向量、真实两跳发球、擦网重发、擦边、5 局 3 胜、暂停、训练 / 多球 /
闯关 / 双人同屏、鼠标 / 触屏 / 陀螺仪输入、球自转或旋转可视化、慢放回放、
AI 主动吃转建模、装备 / 熟练度 / 排行榜 / 联网 / 持久化、物理引擎、外部资源、
玩家可选的难度选择 UI。**触屏为紧随其后的独立小迭代**，本轮只预留
`intent.direction?` 字段，不实现、不消费。（该预留已由迭代 4 删除，见下文。）

---

## 迭代 4：触屏击球意图（独立小迭代）

本章为对前文的**修订**：凡与本章冲突的操作方式、范围之外条目、`intent` 字段约定、
`PongEngine` 输入来源、`session.js` 载荷描述，以本章为准。固定步长 `1/120`、最多 8
子步、`ready | playing | serving | gameover` 状态机、11 分制与换发球、迭代 1 的归位与
3→2→1 倒数、迭代 2 的发球方向与 AI 随机相位、迭代 3 的旋转 / 意图 / AI 档位 /
技术提示、WebGL / AudioContext / 循环异常兜底、纯静态交付方式均不变。

### 背景与问题

迭代 3 把「触屏」列为紧随其后的独立小迭代：触屏更适合表达摩擦方向与挥拍速度，
但会引入 3D 拾取、手势冲突与真机手感验证。本轮落地该迭代。

先做时序核算，它决定交互形态：AI 回球走 `INTENT_NONE`，`vz ≈ 3.3–3.6`；从 AI 拍平面
`z = -1.5` 到玩家拍平面 `z = +1.5` 为 3.0 米，来球窗口约 **0.83–0.91 秒**。
而 `config.rules.chargeTime = 0.8`，从 0 蓄到 1 几乎吃掉整个窗口，玩家还要同时判断
落点并移动球拍。因此**回合内不存在「切到意图按钮再按住蓄力」的操作预算**。

另一个观察：键盘的「长按 `Space`」实际是预设语义 —— `charge` 累积到 1 后一直保持，
只在 `serve()` 时 `resetCharge()`，玩家整局按住不松、每拍吃满。它借了「按住」这个
物理动作，表达的却是「这段时间都用上旋攻」。触屏若照搬按住，需一根手指常驻按钮、
另一根拖拍（双指），会撞上浏览器手势冲突。故触屏直接表达**预设**，不照搬按住动作。

### 已确认的需求（四轮澄清结论）

| 项目 | 决定 |
| --- | --- |
| 交互形态 | 球台区拖拽移拍（屏幕坐标线性映射到球拍 `x/y`，**不做 3D 拾取**）+ 底部三个意图按钮；按钮区与拖拍区物理隔离 |
| 意图语义 | **下一拍意图**：单槽 `pendingIntent`，点一次覆盖、玩家命中时读取一次并清空，之后回落普通回击 |
| 蓄力 | 触屏取消长按，点按给固定 `tapCharge`（拟 `0.65`，以实现期「过网 + 首落点在对方半台」断言微调）；键盘 `chargeTime` 逻辑不变 |
| `direction?` | **删除迭代 3 的预留**，`intent` 保持 `{ type, charge }`；`spin.js` / `physics.js` / `rally.js` / `tips.js` 零改动 |
| 设备范围 | 始终显示控件，Pointer Events 统一 touch / pen / mouse；**键盘完整保留**，触屏是并存而非替换 |
| 缩放 | viewport 不全局禁缩放，只在球台区域局部 `touch-action: none` |
| 选中可见性 | 下一拍意图是隐式的，必须有 `aria-pressed` + 高亮 + 「已备好：…（下一拍）」提示，否则玩家不知道点没生效 |

`config.pointer` 默认值：`{ followRadius: 0.12, followRadiusY: 0.10, tapCharge: 0.65 }`
（前两项单位米，第三项为归一化强度）。`followRadius*` 决定「距离多远开始全速追拍」，
越大越平滑、越小越跟手；`tapCharge` 决定触屏 `drive` 的固定上旋强度。三项可在实现期
按手感微调，但 `tapCharge` **必须**满足「`drive` / `push` 出球过网且首落点在对方
半台」的验收断言，`followRadius*` 不得让 `axes()` 越过 `[-1, 1]`；实测值记入
`tasks.md`。

`state.pending ∈ 'none' | 'drive' | 'push'`，是纯展示 / 输入字段；`pendingIntent`
是 `gameInput` 内的单槽，值为 `{ type, charge }` 或 `null`。`selectIntent(type)` /
`setPendingIntent(type)` 接收 `type` 字符串，由 `gameInput` 内部构造意图对象：
`'drive'` → `{ type: 'drive', charge: tapCharge }`；
`'push'` → `{ type: 'push', charge: 0 }`；
`'none'`（「普通」按钮）→ 清空队列，等价于取消预设。
三个按钮的 `aria-pressed` 由 `state.pending === type` 决定，因此
`pending === 'none'` 时「普通」按钮为按下态。

**删除 `direction?` 的依据**：`movePaddle` 每步算出
`paddle.vx = (x - 旧x) / dt`，`returnBall` 用 `returnVxPaddle: 0.2` 把它继承进出球
`v.x`（上限 `returnVxClamp: 1.4`）。触屏用绝对坐标拖拍，手指拖多快、往哪拖，
本来就会产生变线；若 `direction` 再改 `v.x` 是**双重计速**，会打满 clamp 并把
迭代 3 标定好的弧线拉变形。而「摩擦方向」已由三个 `type` 按钮承担，该字段无剩余
职责。迭代 3 的原则是「避免留下无人消费的死字段」，接入后判定用不上，删除比硬塞
更忠实；这也兑现了「旋转 / AI / 提示等纯逻辑零返工」。

### 对前文范围条目的修订

1. 顶部「已确认的需求」表「操作方式：键盘 WASD / 方向键（不做鼠标与触屏控制）」
   → 增加触屏拖拍与意图按钮；因 Pointer Events 统一，鼠标顺带可用。键盘仍完整保留。
2. 同表「不含：…鼠标/触屏输入…」→ 移除「鼠标/触屏输入」一项；难度选择、暂停、
   后端、持久化最高分仍不含。
3. 顶部「范围之外」的「鼠标/触屏控制」→ 移除；其余（双人同屏、难度选择、暂停、
   排行榜与最高分持久化、物理引擎、外部模型贴图、多人联网）不变。
4. 架构图中「`src/game/input.js` 键盘输入轴状态」一行 → 该文件**不改动**，仍为键盘
   输入源，但由新增的 `gameInput.js` 组合器包住；`PongEngine` 不再直接构造它。
   该架构图是初版结构快照，迭代 3 / 4 的新增文件以各章「架构与模块边界」清单为准，
   不回填到图中。
5. 迭代 3「已确认的需求」第 1 条「不引入鼠标 / 触屏」、第 2 条「未来可附加
   `direction?`…触屏独立小迭代接入时再扩展」、第 3 条「触屏范围：本轮不纳入」
   → 本轮落地触屏，并**删除** `direction?` 预留；`intent` 结构保持不变。
6. 迭代 3「对前文范围条目的修订」中「原操作方式…**仍不做鼠标与触屏控制**」
   与「迭代 2 不新增生产文件与依赖」→ 本轮新增 `pointerInput.js` / `gameInput.js` /
   `TouchControls.vue` 三个生产文件；**仍不新增依赖**，纯逻辑模块仍不 import three.js、
   不访问 DOM。
7. 迭代 3「范围之外」的「鼠标 / 触屏 / 陀螺仪输入」与「触屏为紧随其后的独立小
   迭代，本轮只预留 `intent.direction?`」→ 触屏已落地；`direction?` 预留删除；
   **陀螺仪输入仍在范围之外**。
8. 迭代 3「数据流」中「`serving` 分支提前 return，不 tick、不消费意图」→ 该行为
   不变；本轮的预设通过独立方法 `selectIntent()` 进入，不占 `update()` 路径，
   因此倒数期间可以预设、但倒数期间仍不推进 charge、不消费队列。
9. 迭代 3「`session.js` 承担 `createSessionState` / `sessionPayload` /
   `pointMessage`」→ 本轮 `createSessionState()` 增加 `pending: 'none'`，
   `sessionPayload()` 下发该字段，并新增固定文案枚举 `pendingLabel(type)`。

### 架构与模块边界

```
新增
  src/game/pointerInput.js   Pointer Events 输入源：拖拍目标 + pendingIntent 单槽
  src/game/gameInput.js      组合器：对外伪装成 createInput，合并键盘与指针
  src/components/TouchControls.vue  三个意图按钮 + 选中态 + 已备好提示
修改
  config.js         新增 config.pointer = { followRadius, followRadiusY, tapCharge }
  PongEngine.js     构造换 createGameInput(window, container)；axes 传 paddle；
                    新增 selectIntent()；onHit 消费；award / restart 清 pending
  session.js        state.pending / payload / pendingLabel()
  usePongGame.js    state 加 pending；暴露 selectIntent(type)
  App.vue           挂 TouchControls、透传、stage 的 touch-action、文案
  StartOverlay.vue  补一条触屏说明
不动
  spin.js / physics.js / rally.js / tips.js / ai.js / scoring.js / input.js /
  scene.js / models.js / effects.js / audio.js / serveClock.js / index.html /
  构建与部署配置
```

采用「输入源组合器」而非「触屏状态直接接进 `rally.js` / `spin.js`」或「Vue 侧全权
管理触屏状态」：前者会双重计速并破坏弧线标定，后者需要把消费时机绕 `onState` 回传、
形成两套状态同步。`gameInput.js` 对外暴露与现有 `createInput` **完全相同**的接口
（`axes` / `tick` / `intent` / `clear` / `resetCharge` / `dispose`），另加
`setPendingIntent` / `consumeIntent`；`PongEngine` 不感知有几套输入源。

按钮**不走 DOM 绑定**：`TouchControls` emit → `App.vue` →
`usePongGame.selectIntent()` → `engine.selectIntent()` →
`input.setPendingIntent()`，引擎 `state.pending` 是唯一真源，Vue 只渲染 `:selected`。
拖拍直接绑 `container`（引擎构造时已持有），无需 `App.vue` 传 ref。

`PongEngine.js` 当前恰好 200 行，新增 `selectIntent()` 与消费调用会顶破上限。
实现时把 `WEBGL_MESSAGE` / `RUNTIME_MESSAGE` 两个常量合并为 `MESSAGES` 对象、
并把 `update()` 里的 hooks 构造下沉到 `session.js` 腾出空间；`tasks.md` 用
`wc -l` 断言 ≤200 行。这是实现手法，不改变上述模块边界。

### 数据流与时序

- **拖拍**：`pointerdown/move/up` → 用 `getBoundingClientRect()` 归一化到 `[0,1]`
  → `target.x = minX + u * (maxX - minX)`、
  `target.y = minY + (1 - v) * (maxY - minY)`
  （直接复用 `config.paddle` 的 min/max，屏幕上方对应球拍更高）。
  `setPointerCapture` 防拖出，`pointercancel` / `lostpointercapture` 清 target。
  **不做 3D 拾取**。
- **axes**：`update()` 调 `input.axes(this.sim.playerPaddle)`；指针活动时返回
  `clamp((target.x - paddle.x) / followRadius, -1, 1)`（y 用 `followRadiusY`），
  否则退回 `keyboard.axes()`。速度上限仍由 `movePaddle` 的 `playerSpeed: 3.2`
  决定，`paddle.vx` 因此真实反映拖动速度，并由 `returnBall` 自然变线。
  `axes(paddle)` 的 `paddle` 参数可选：不传时退回键盘 axes，既有调用不回归。
- **intent**：`pendingIntent` 非空 → 该对象（`drive` 带 `tapCharge`、`push` 带
  `charge: 0`）；否则 `keyboard.intent()`。触屏预设优先于键盘，键盘原逻辑与
  迭代 3 单测零回归。消费后队列为空，`intent()` 退回 `keyboard.intent()`；
  仅当键盘也未按 `Space` / `Shift` 时才得到 `INTENT_NONE`。
- **消费**：玩家拍命中 → `hooks.onHit('player', intent)` →
  `consumeIntent()` 清队列 + `state.pending = 'none'` + `emit()`；AI 命中不动
  pending。`serve()` **不清** pending（倒数期预设要留到开球后第一板，
  发球不经 `checkPaddleHit`，`rally.lastHitter = server` 会挡住己方拍），
  `award()` / `restart()` 清，避免上一分没打完的预设漏到下一分。
- **提示**：`tipFor()` 不变。触屏 `drive` 得「上旋快攻 · 压低弧线」、
  `push` 得「搓短下旋 · 落台后会回缩」；消费后若键盘未按意图键，`intent()`
  为 `INTENT_NONE`，提示随之清空。
  固定步长与 8 子步上限不变，指针输入不自带循环、不引入 `setTimeout`。

### UI 与可访问性

`TouchControls.vue` 放在 `stage-wrap` **之外**、页脚之上（`stage-wrap` 有
`overflow: hidden`，放内部会被裁；放外部也与拖拍区物理隔离，不需 `stopPropagation`）。
三个 `<button type="button">`（普通 / 上旋攻 / 搓短）；「普通」用于取消预设
（`selectIntent('none')`），另外两个用于设置下一拍技术。`aria-pressed` 由
`state.pending === type` 决定并配高亮选中态，点击目标 ≥44×44px（严于原规格 24px）。
一行 `aria-live="polite"` 显示当前预设，文案来自 `pendingLabel()` 固定枚举：
`none` → 「下一拍：普通回击」、`drive` → 「已备好：上旋快攻（下一拍）」、
`push` → 「已备好：搓短下旋（下一拍）」；`none` 不留白，避免玩家分不清「没选」
与「控件没渲染」。
按钮区 `touch-action: manipulation`；`.game-stage` 与其内部 `canvas` 都加
`touch-action: none`（该属性不继承，只写父元素挡不住浏览器滚动）。
**viewport 不加 `user-scalable=no`**，保留全局缩放能力。
`ready` / `gameover` 期间覆盖层 `z-index: 5` 在球台之上，接管点击，不会误触拖拍。
桌面始终显示控件；小屏需保证按钮条在首屏可见，必要时下调 `stage-wrap` 高度。
`StartOverlay.vue` 与 `App.vue` 页脚各补一条触屏说明；`stage` 的 `aria-label`
补充「或拖动移动球拍」。无 `v-html`，所有文案为固定字符串。

### 错误处理

`pending` 是纯输入字段，**不参与判罚、计分、换发球**。兜底：未知 / 非法 `type`
→ 忽略该次选择、保持原有 `pending` 不变；容器宽或高为 0 → 不更新 target；
非主指针（`isPrimary === false`）与缺 `pointerId` 的事件忽略；`pointercancel`
清 target；**`setPointerCapture` 抛异常时（合成 / 竞态指针）不认领该指针并立即
`release()`**，避免残留 `pointerId` 令后续真实拖拽被全部忽略；`dispose()`
解绑全部监听并清队列。WebGL 失败、AudioContext 失败、
循环异常三条既有兜底路径与中文文案不变；`createGameInput` 在 `createScene`
失败时不会构造（现有构造函数提前 return），且 `PongEngine.selectIntent()` 首行
`if (this.failed) return`，与 `start()` / `restart()` 一致，避免 WebGL 失败时
点击按钮访问未初始化的 `this.input`。
交付仍为纯静态 SPA：无新增依赖、无网络请求、无密钥 / 环境变量 / 平台存储，
无 `edge-functions/` / `cloud-functions/` / `edgeone.json`。

### 测试

- 新增 `pointerInput.test.js`：fake target 提供 `getBoundingClientRect` /
  `setPointerCapture` / `releasePointerCapture`；断言坐标映射与 clamp、
  宽高 0 兜底、`pointercancel` 清 target、非主指针忽略、队列覆盖与单次消费、
  `dispose` 解绑。
- 新增 `gameInput.test.js`：`axes(paddle)` 追向与键盘回退、不传 paddle 时的兼容、
  预设优先、消费后回落键盘意图（未按意图键时为 `INTENT_NONE`）、
  `clear()` / `resetCharge()` 与迭代 3 行为一致
  （守住「倒数期间按住方向键仍能移动」回归）。
- 扩展 `session.test.js` / `PongEngine.test.js`：`pending` 载荷与
  `pendingLabel()` 固定文案、选中 / 消费 / 清空状态迁移、`serve()` 不清而
  `award()` / `restart()` 清、AI 命中不清。
- 受 200 行约束与验收期发现的捕获异常缺陷影响，实际另拆出
  `pending.test.js`（真实 `PongEngine.prototype` 迁移断言）与
  `pointerCapture.test.js`（抛错不外溢、不留幻影 target、后续真实指针仍被认领、
  已排队意图不被清掉）；`pointerInput.test.js` 三条释放事件用例改为参数化。
- 每个测试只断言一件事，失败信息包含期望值与实际值；纯逻辑测试不触碰 DOM、
  three.js 与平台 API；**既有 `physics.test.js`（198 行）等文件不改动**。

### 验收

- `npm test` 全绿、`npm run build` 退出码 0；`src/` 下所有新增 / 修改单文件
  ≤200 行（含 `PongEngine.js`）。
- 浏览器：`page.mouse` 在 480×360 SwiftShader / 1280×900 / 390×844 三视口跑，
  `hasTouch: true` 在 390×844 追加一组。断言拖拍能移动球拍；点「搓短」后下一拍
  `spin < 0` 且 HUD 出现对应 `.tech-tip`；**不按键盘意图键**时下一拍自动回落
  `spin = 0` 且选中态清空；倒数期间预设可保留到开球；键盘 `Space` / `Shift`
  仍生效；3→2→1 倒数、球拍归位、我方发球方向与 AI 接发球、胜负界面均不回归；
  控制台无未捕获异常、无 404。
- 统计回归（200 次我方发球、玩家不移动球拍）：AI 首接率仍 ≥75% 且 <100%。
- 清理：`git status --short` 无验证产物与临时依赖残留；`config.pointer` 默认值
  与实现期实测一并记入 `tasks.md` 的「实现期偏差与实测记录」。

### 范围之外

3D 拾取 / 屏幕→台面射线、滑动手势识别、双指手势、陀螺仪输入、虚拟摇杆、
触屏长按蓄力、`direction?` 与侧旋、AI 主动吃转建模、难度选择 UI、振动反馈、
真机专项手感调参（以 Playwright emulation 近似）、球自转可视化、慢放回放、
联网 / 持久化 / 排行榜、物理引擎与外部资源。

---

## 迭代 5：赛场氛围与灯光联动（独立小迭代）

本章为对前文的**修订**：凡与本章冲突的「视觉与交互」灯光 / 背景描述、`ScoreBoard.vue`
职责描述、`scene.js` 场景构成、测试范围约定、`PongEngine.emit()` 形态，以本章为准。
固定步长 `1/120`、最多 8 子步、`ready | playing | serving | gameover` 状态机、11 分制
与换发球、迭代 1 的归位与 3→2→1 倒数、迭代 2 的发球方向与 AI 随机相位、迭代 3 的
旋转 / 意图 / AI 档位 / 技术提示、迭代 4 的触屏预设与指针捕获兜底、`sessionPayload()`
字段、WebGL / AudioContext / 循环异常兜底、纯静态交付方式**均不变**。

### 背景与问题

前四轮的 `scene.js` 是「均匀明亮的棚拍感」：`AmbientLight 0.65` + 主平行光 `2.1`
+ 补光 `0.4`，背景与 fog 同为 `0x15181d`，一块 30×30 纯色地板；`models.js` 只有
球台、网、球拍，没有任何场馆几何；`ScoreBoard.vue` 是悬浮在球台上方的一张卡片。
玩家看到的是「一张桌子」，而不是「一场比赛」。

参考 WTT 赛事的**视觉语言**（抽象借鉴，不使用其商标 / 标识 / 真实选手名）：整体暗场、
顶光把球台打成唯一亮区、四周深色围挡配青绿 LED 光带、观众席隐入暗处、得分时灯光
脉动；HUD 则采用转播记分条的「名牌 + 大比分 + 发球指示」信息层级。

本轮最大的可玩性风险是**动态亮度伤读球**：乒乓球靠球与背景的稳定对比度判断落点，
比赛中忽明忽暗最易让对拉变糊。因此灯光演出只放在**死球时间**，`playing` 期间
目标光参恒定。

### 已确认的需求（四轮澄清 + 一次路径选择）

| 项目 | 决定 |
| --- | --- |
| 范围 | **C**：3D 赛场氛围 + 灯光与赛事状态联动 + 播报风格 HUD 重做，一次做完整套赛事化视觉 |
| 联动克制度 | **A（回合间联动）**：球飞行中灯光恒定；只在倒数 / 开球 / 得分 / 赛点 / 胜负变光。**不做**逐帧闪烁、击球即闪、跟随球的追光 |
| HUD 落点 | **A（转播式记分条 · DOM 层）**：`ScoreBoard.vue` 重做，仍是 DOM；不引入 3D 虚拟 LED 屏 / `CanvasTexture` |
| 配色 | **A（保留品牌青绿，整体暗场化）**：不动 `--accent-bright: #7ee2c0` 与墨绿球台；背景 / 围挡 / 观众席压到近黑，冷白顶光 + 青绿 LED 点缀 |
| 实现路径 | **A**：纯逻辑灯光状态机 `arenaState.js` + three 适配层 `arena.js` + 独立场馆几何 `venue.js`；状态迁移用 `node --test` 覆盖，不 mock three |

三项范围判断：

1. C 的三个部分**不是独立子系统** —— 灯光与 HUD 消费同一份赛事状态，场馆几何与灯光
   共用同一批材质与配色；拆成多个 spec 反而割裂视觉语言。故按**一个 spec、三个隔离
   单元**处理，每个单元单一职责、接口明确、可独立测试。
2. `scoring.js` 是**单局 11 分制**，只有 `player` / `ai` 两个分数，没有「局数 / 几比几」
   数据。故「局分」只能当赛制标签展示（固定文案「第 1 局 · 11 分制」），**不引入多局制、
   不改任何计分判罚规则**；「赛点」只是从现有比分派生的展示标记。
3. 「参考」不等于「复刻」：全量换色会把本轮从「加氛围」放大成「换皮肤」，牵动
   `:root` 全套变量、`COLORS`、球台材质、拍子 / 尾迹 / 粒子 / 按钮焦点环。故配色取 A。

### 对前文范围条目的修订

1. 顶部「视觉与交互」第 1 条「中性灰阶背景 `#15181d`」→ **直接把
   `COLORS.background` 改为 `0x070a0e`、`COLORS.floor` 改为 `0x0c1117`**
   （不新增重复颜色常量）；`App.vue` 的 `.stage-wrap` 背景同步改为 `#070a0e`，
   让 canvas 与容器无接缝。`style.css` 的 `--bg` / `--surface` 不变（页面外壳
   保持原深灰，只有球台区域暗场化）。`config.arena` 只放阻尼 / 脉冲 / 光强表与
   围挡 / 光带 / 观众席配色，其中 `barrier: 0x0a0e13`、`audience: 0x0c1118`、
   `ledColor: 0x7ee2c0`（复用品牌提亮色）、`beamColor: 0xdfe9f2`（冷白）、
   `poolColor: 0x0e151c`（光池底色）。配色键一律带 `Color` 后缀，避免与
   `config.arena.light.*.cone / pool` 的数值字段混淆。
   `effects.js` 的 `createTrail()` 用 `COLORS.background` 作尾迹渐变尾色，会一并变暗，
   属预期副作用（暗场下尾迹更清晰）。**单主色深青绿 `#1c6b5a`、提亮色 `#7ee2c0`、
   近白球与正文 `#f5f3ee`、白色台面细线全部保留**，对比度 ≥4.5:1 要求不变。
2. 同节第 2 条「环境光 + 方向光与阴影」→ 仍是**现有 3 盏灯**（`AmbientLight`、
   唯一 `castShadow` 的 `DirectionalLight`、`DirectionalLight` 补光），shadow map 1024
   与 `devicePixelRatio` 上限 2 不变；但三者强度 / 颜色由 `arena.step(dt)` 按目标
   插值驱动，不再写死。LED 光带用 `emissive` 材质，**不新增真实光源、不新增投影灯**。
3. 同节第 4 条「HUD：比分、发球方、局内原因提示」→ 重做为转播式记分条；
   `ScoreBoard.vue` 的架构图说明「比分 / 发球方 / 局内提示」扩为「名牌 / 大比分 /
   发球权指示点 / 赛制标签 / 赛点徽标 / 原因提示 / 技术提示」。
4. 顶部「架构」图中 `scene.js` 一行（「three.js 场景构建（桌、网、地板、灯光、球拍、
   球）」）→ 增加场馆几何与灯光驱动；按迭代 4 第 4 条先例，该图是初版结构快照，
   本轮新增文件以本章「架构与模块边界」清单为准，**不回填到图中**。
5. 顶部「测试」第 2 条「只测纯逻辑，不测 Vue 渲染、three.js 场景或平台 API」→
   纯逻辑测试仍不触碰 three / DOM；本轮**新增一个适配层冒烟测试**
   `arena.test.js`，允许 `import * as THREE from 'three'`，但只构造 `Scene` / 假灯光
   对象，**不得创建 `WebGLRenderer`、不得访问 DOM**。两类测试分文件，不混在一起。
6. 顶部「范围之外」的「外部模型与贴图资源」与迭代 4「范围之外」的
   「物理引擎与外部资源」→ 仍不含任何外部资源；本轮场馆全部用 three 基础几何与
   纯色 / `emissive` 材质自建，「无外部资源」不等于「无新增几何」。
7. 前文各章的「不新增生产文件与依赖」约束 → 本轮新增 4 个生产文件
   `arenaState.js` / `arena.js` / `venue.js` / `broadcast.js`；
   **仍不新增 npm 依赖**，仍是纯静态 SPA，无后端函数目录 / 平台存储 / 环境变量 /
   网络请求。
8. 迭代 4「`session.js` 载荷描述」与「`PongEngine.emit()`」→
   `sessionPayload()` **字段一个不加**、不改结构；灯光靠 `emit()` 时的**状态差分**
   驱动，不往 payload 里塞灯光字段。这是本轮最重要的边界：引擎状态与渲染状态解耦。
9. 顶部「错误处理」第 4 条「渲染 / 更新循环顶层 `try/catch`」→
   `arena.step(dt)` 在该 `try` 内执行，异常仍落 `MESSAGES.runtime`；新增兜底见
   本章「错误处理」。

### 架构与模块边界

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `src/game/arenaState.js`（新，纯） | `CUES`、`lightTarget(cue, ctx)`、`cueFromTransition(prev, next)`、`damp(current, target, dt, tau)`、`decayPulse(pulse, dt)` | `config.js` + `broadcast.js`（纯）；**不 import three、不碰 DOM** |
| `src/game/broadcast.js`（新，纯） | 导出 `ROUND_LABEL = '第 1 局 · 11 分制'`、`matchPointSide(scores)` → `'player' \| 'ai' \| null`、`matchPointLabel(side)` → 固定「赛点」/ `''` | `config.js`（`rules.winScore`）+ 只读 `isGameOver` from `scoring.js`；**不改计分规则** |
| `src/game/venue.js`（新，three） | `createVenue(scene)` 建静态场馆，返回**材质引用**句柄 `{ led, cone, pool, tintMaterials, group, dispose }`；`dispose()` 只 `scene.remove(group)` + 清引用，**不 dispose 材质** | `three` + `config.js` |
| `src/game/arena.js`（新，three 适配层） | `createArena(scene, lights)` → `{ onState(payload), step(dt), dispose() }`；内部保存 `prevPayload` / `current` / `target` / `pulseValue`（均为普通数值对象，浏览器可直接读），做差分、阻尼插值、脉冲衰减，写灯光强度与材质 | `three` + `config.js` + `arenaState.js` + `venue.js` |
| `config.js` | 增 `arena` 段：`damping: 0.18`、`pulseDecay: 0.12`、`pulseKey: 1.4`、`pulseLed: 0.5`，配色 `barrier` / `audience` / `ledColor` / `beamColor` / `poolColor` / `tints`，以及 `light.READY` / `light.PLAYING` / `light.GAMEOVER` 三个目标向量；**不含 background / floor** | — |
| `scene.js` | 背景 / fog / 地板改近黑、三盏灯参数改由 arena 接管、`createArena(scene, { ambient, key, fill })` 挂到 `view`、`dispose()` 串联 | `arena.js` |
| `PongEngine.js` | `emit()` 保持单行压缩、`frame()` +1 行；`serve()` / `award()` / `restart()` **一行不改** | — |
| `ScoreBoard.vue` | 重做记分条，**props 签名不变** | `broadcast.js` |
| `style.css` | 仅增 2 个变量 `--broadcast-bg` / `--broadcast-line`；HUD 视觉全部落在 `ScoreBoard.vue` 的 `scoped` 样式 | — |

**不动**：`usePongGame.js`、`session.js`、`App.vue`、`StartOverlay.vue`、
`ServeCountdown.vue`、`GameOverOverlay.vue`、`TouchControls.vue`、`physics.js`、
`scoring.js`、`rally.js`、`input.js`、`spin.js`、`tips.js`、`models.js`、
`effects.js`、`audio.js`，以及全部既有 `*.test.js` 断言。

`PongEngine.js` 当前 199 行，行数解法明确：`emit()` 沿用迭代 4 的单行压缩风格扩为
一行（`const p = sessionPayload(this.state); this.view?.arena?.onState(p);
this.callbacks.onState?.(p)`），`frame()` 增加一行 `this.view.arena?.step(dt)`，
净增 1 行收于 200 行，仍满足 ≤200。若实现期因格式需要多出 1–2 行，**允许把
`MESSAGES` 常量或 `frame()` 内既有样板再下沉一行到 `session.js`**，不得放宽
200 行上限、不得改动 `serve()` / `award()` / `restart()` 的行为。
所有新增 / 修改单文件 ≤200 行；`style.css` 是全局样式汇总表，历次 `wc -l` 验收
从未纳入，本轮仅增 2 个变量。

**依赖方向单向**：`broadcast → scoring`、`arenaState → config + broadcast`、
`venue → config`、`arena → arenaState + venue + config`，无循环；`ScoreBoard.vue`
只 import `broadcast.js`，不触碰 three 对象。

**性能预算**：全场仍只有 3 盏灯、`castShadow` 仍只有 1 盏；观众席剪影用单个
`InstancedMesh`（约 120 个暗色小盒）；光锥 / 光池用半透明 `MeshBasicMaterial`、
`depthWrite: false`；不引入后处理 bloom、`CanvasTexture`、外部贴图、额外阴影、
`WebGLRenderer` 之外的 GL 资源。

### 数据流与时序

核心手法：**不新增状态字段、不在事件点手工调灯，让 `emit()` 的状态差分驱动灯光**。
`sessionPayload()` 每次都带 `phase / countdown / scores / winner`；
`cueFromTransition(prev, next)` 是纯函数，比较上一份与这一份 payload：

- **相关字段集合** = `phase`、`countdown`、`scores`、`winner`。四者都没变 → 返回
  `null`，arena 完全不动。`setTip()`（玩家命中）、`selectIntent()`、`toggleMuted()`
  的 `emit()` 因此天然是空操作 —— 这也是「不做击球即闪」的技术保证。
  `prev === null`（构造期首次 `emit()`）视为全部相关字段变化，直接返回 `ready` cue、
  `pulse = 0`。
- `cue` 由 `next.phase` 映射：`ready → ready`、`serving → countdown`、
  `playing → playing`、`gameover → gameover`；未知 phase → 回退 `playing` 基线。
- `pulse` **独立**由 `sum(next.scores) > sum(prev.scores)` 决定（为 1），
  `prev === null`、比分归零、非有限值一律为 0。`award()` 因此能同时拿到
  「得分闪光」与「下一分倒数收光」，不会互相覆盖。
- 输出 `{ cue, pulse, ctx }` 或 `null`；`ctx` 含 `countdown`、`winner`、
  `matchPoint`（由 `broadcast.matchPointSide(next.scores)` 派生）。`arenaState.js`
  内部 import `broadcast.js` 填该字段，`ScoreBoard.vue` 也 import 同一模块，
  两侧口径一致。

| 状态变化 | cue | pulse | ctx |
| --- | --- | --- | --- |
| 首次 `emit()`（`prev = null`）/ 进入 `ready` | `ready` | 0 | — |
| `start()` / `restart()`：进入 `serving` | `countdown` | 0 | countdown = 3 |
| `serving` 且 countdown 3→2→1 | `countdown` | 0 | countdown |
| 进入 `playing`（`serve()`） | `playing` | 0 | matchPoint |
| `award()` 且 `over = false`：`playing → serving` + 比分 +1 | `countdown` | **1** | countdown, matchPoint |
| `award()` 且 `over = true`：进入 `gameover` | `gameover` | **1** | winner |
| 仅 `tip` / `pending` / `muted` 变化 | `null` | 0 | — |

`cue` 与 `pulse` 两列**正交**：前者只由 `next.phase` 唯一决定，后者只由比分增量
决定。`over = true` 的 `award()` 同时命中「比分 +1」与「进入 gameover」，按上表
取 `gameover` 行，不会同时产生两个 cue。

`lightTarget(cue, ctx)` 返回 6 个数值 + 1 个 `tint` 字符串，全部可断言。端点向量
作为普通对象常量集中在 `config.arena.light`（`arenaState.js` 只做插值与枚举映射，
不自带魔法数字），三个向量为：

```
READY   = { ambient: 0.10, key: 1.2, fill: 0.06, led: 0.15, cone: 0.03, pool: 0.08 }
PLAYING = { ambient: 0.16, key: 3.4, fill: 0.12, led: 0.35, cone: 0.06, pool: 0.22 }
GAMEOVER= { ambient: 0.10, key: 2.0, fill: 0.08, led: 0.28, cone: 0.05, pool: 0.14 }
```

| cue | 目标向量 | tint |
| --- | --- | --- |
| `ready` | `READY` | `default` |
| `countdown` | `lerp(READY, PLAYING, (3 - clamp(c, 1, 3)) / 2)` | 赛点 → `match`，否则 `default` |
| `playing` | `PLAYING` | 赛点 → `match`，否则 `default` |
| `gameover` | `GAMEOVER` | 玩家胜 → `win`，否则 `lose` |
| 未知 cue | `PLAYING`（安全回退） | `default` |

`countdown` 逐项线性插值，三档 `c = 3 / 2 / 1` 对应 `t = 0 / 0.5 / 1`：

| c | ambient | key | fill | led | cone | pool |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 0.10 | 1.2 | 0.06 | 0.15 | 0.03 | 0.08 |
| 2 | 0.13 | 2.3 | 0.09 | 0.25 | 0.045 | 0.15 |
| 1 | **0.16** | **3.4** | **0.12** | **0.35** | **0.06** | **0.22** |

对照现状 `ambient 0.65 / key 2.1 / fill 0.4`：暗场化靠压环境光，聚光感靠提高主光
+ 光锥 + 地面光池。**关键一致性**：`c = 1` 时 `countdown` 的 6 个数值与 tint
**逐项等于 `playing`**，因此 `serve()` 时 `target` 完全不变 —— 球飞行中 `target`
与 `current` 都恒定，没有开球后的亮度收敛。倒数 3→2→1 的 key 单调上升
（1.2 → 2.3 → 3.4），即「倒数收光 → 开球聚焦」。`award()` 时 target 从
`PLAYING` 回到 `c = 3` 的 `READY` 并叠加 `pulse`，变化全部落在死球时间。

- `damp(current, target, dt, tau)` = `current + (target - current) * (1 - exp(-dt / tau))`，
  `tau = config.arena.damping = 0.18`；`dt <= 0` 返回 `current`，非有限输入不产生 NaN。
- `decayPulse(p, dt)` = `clamp(p * exp(-dt / 0.12), 0, 1)`；0.5s 后 < 2%，
  即「得分一次闪光 < 0.5s」。写灯光时用
  `key.intensity = current.key + pulseValue * 1.4`、
  `venue.led.emissiveIntensity = current.led + pulseValue * 0.5`，
  `pulseKey / pulseLed` 取 `config.arena`，**脉冲不写回 `target` / `current`**。
- `tint` 是固定枚举 `default | match | win | lose`，对应 LED `emissive` 目标色：
  `default → 0x7ee2c0`（品牌青绿）、`match → 0xffd479`（与 `.tech-tip` 同色系）、
  `win → 0x7ee2c0`、`lose → 0x8f9aa8`（冷灰）；四色作为 `config.arena.tints`
  常量表。`arena.js` 用 `THREE.Color.lerp()` 以**同一阻尼** `damp` 逐帧插值
  `venue.tintMaterials` 的 `emissive`，纯模块只给字符串、不持 `THREE.Color`。
- `arena.step(dt)` 在 `frame()` 中每帧调用（与 `particles.update(dt)` 同处一层），
  写 `ambient.intensity` / `key.intensity` / `fill.intensity` /
  `venue.led.emissiveIntensity` / `venue.cone.opacity` / `venue.pool.opacity`
  与 tint 颜色，随后仍由 `renderer.render()` 绘制；**不自带循环、不引入
  `setTimeout`、不引入新的 rAF**。
- `current` 初值取 `READY` 向量、`pulseValue` 初值 0；构造期首次 `emit()` 的
  `cue = ready` 与之一致，因此首帧无跳变。`venue` 句柄语义固定：`led` 是 LED 光带
  共用的**单个** `MeshStandardMaterial`，`cone` / `pool` 是对应 `MeshBasicMaterial`，
  `tintMaterials` 是需换色的材质数组（含 `led`）；`step()` 只改这些材质的数值属性，
  不重建几何、不增删 scene 节点。
- **差分与插值的分工**：`onState(payload)` 只同步更新 `target` / `pulseValue`
  （可在冻结 rAF、`update()` 单步驱动下直接断言）；`step(dt)` 才推进 `current`。
  因此浏览器验收需分别驱动两者，不能只跑 `update()` 就断言 `current` 收敛。

### UI 与可访问性

`ScoreBoard.vue` **props 签名完全不变**（`playerScore / aiScore / server / message /
tip`），因此 `App.vue` 无需改动：

- 横向记分条：左右两块**选手名牌**（「你」/「对手」）+ **发球权指示点** +
  大比分数字（32–36px、`font-variant-numeric: tabular-nums`），中间 `:` 与固定
  赛制标签「第 1 局 · 11 分制」。
- **赛点徽标**：`matchPointSide(scores)` 派生。定义为
  `max >= winScore - 1 && max - min >= 1 && !isGameOver(scores)`：
  10-9 → 你方、9-10 → 对方、10-10（平分）不显示、11-9（已结束）不显示。
  只是展示派生，不改任何判罚。
- 保留 `.score-hint`（`aria-live="polite"`）与 `.tech-tip`（`aria-live="polite"`）；
  `sr-only` 整句扩为「当前比分…发球方…赛点…」，不只靠视觉传达。
- 样式：深色玻璃 `rgba(10, 14, 18, .88)` + 顶部青绿细线，发球侧用
  `--accent-bright` 高亮与轻发光；`pointer-events: none` 与 `z-index: 2` 保持
  （覆盖层 `z-index: 5`、倒数 `z-index: 3`），拖拍与底部按钮不受影响；
  `@media (max-width: 640px)` 收紧。`prefers-reduced-motion: reduce` **只关
  `ScoreBoard.vue` 内的 CSS 过渡与记分条发光呼吸**，不关 3D 灯光联动 —— 灯光是
  离散状态反馈（倒数 / 得分 / 胜负），不是持续动画，且已保证球飞行中恒定；
  若要连灯光一起降级，属后续独立需求，本轮不提供开关。
- 无 `v-html`、无字符串拼接用户输入、无新增点击目标（纯展示），所有文案为固定
  字符串；装饰性图形 `aria-hidden="true"`。

**场馆几何**（`venue.js`，全部自建基础几何）：四面近黑围挡、四条青绿 LED 光带、
顶部灯架横梁与灯头、两道半透明光锥、桌面下方地面光池、三层弧形观众席剪影、
地面细线地贴。冷白顶光 + 青绿 LED，保留品牌色；**不使用 WTT 商标 / 标识 /
真实选手名**。

### 错误处理

- **WebGL 失败**：arena 在 `createScene()` 内构造，仍走原有 `try/catch` →
  `this.failed = true` + `MESSAGES.webgl`，中文文案不变；`createGameInput` 仍不构造。
- **AudioContext 失败**兜底不变；**循环异常**兜底不变，`arena.step(dt)` 在
  `frame()` 的 `try` 内，抛错仍落 `MESSAGES.runtime`，错误信息不暴露堆栈。
- **输入健壮性**：`cueFromTransition` 对 `prev = null`、缺字段、`NaN` / 非整数比分、
  未知 `cue` 一律返回安全值（未知 cue → `playing` 基线），不抛异常、不产生 `NaN`
  光参；`damp()` 对 `dt <= 0` 返回原值；`decayPulse()` 恒 clamp 到 `[0, 1]`；
  `lightTarget()` 的 `countdown` 先 clamp 到 `[1, 3]`。
- **资源回收**：`view.dispose()` 先 `disposeTree(scene)` 统一释放几何 / 材质，再
  `arena.dispose()` 摘除场馆 group 并清引用，顺序固定，既不漏释放也不重复 dispose。
- **降级**：`prefers-reduced-motion` 关 HUD 过渡；不新增 `user-scalable=no`；
  `devicePixelRatio` 上限 2 不变。灯光参数全部是普通数值，低配下无额外 GL 资源。

### 测试

新增 3 个测试文件，既有 238 用例**零回归**（不改 physics / scoring / session /
input 任何断言）：

- `arenaState.test.js`（纯，不 import three）：`lightTarget` 的四档 cue 与
  `config.arena.light` 三端点向量一致、`c = 1` 与 `playing` 逐项相等、未知 cue
  回退 `PLAYING`、countdown 单调上升与 clamp 到 `[1, 3]`、tint 四枚举映射；
  `cueFromTransition` 覆盖上表 7 行 + `tip / pending / muted` 变化返回 `null` +
  `prev = null` + 非法比分不抛；`damp` 收敛、`dt = 0` 恒等、不越界；
  `decayPulse` 0.5s 内 < 2%；断言不修改入参。
- `broadcast.test.js`（纯）：`matchPointSide` 的 0-0 / 10-9 / 9-10 / 10-10 /
  11-9 / 非法输入；`matchPointLabel` 固定文案。
- `arena.test.js`（适配层冒烟，允许 import three）：`createArena(new THREE.Scene(),
  fakeLights)` 后 `onState(payload)` → `step(1/60)` 使 key 单调逼近目标、`pulse`
  归零、`dispose()` 不抛；**不得创建 `WebGLRenderer`、不得访问 DOM**。
- 每个测试只断言一件事，失败信息包含期望值与实际值；测试之间不共享可变状态。

### 验收

- `npm test` 全绿、`npm run build` 退出码 0；`wc -l src/game/*.js
  src/components/*.vue src/composables/*.js src/App.vue` 期望所有新增 / 修改单文件
  ≤200 行（含 `PongEngine.js`）。
- 浏览器（Playwright + SwiftShader，临时依赖，验收后清理）：三视口 480×360 /
  1280×900 / 390×844 真实截图目视暗场聚光与记分条；canvas 非零、无 WebGL 失败
  覆盖层、无横向溢出、控制台无未捕获异常与 4xx。
- 沿用 CDP 闭包内窥暴露 `engine`（**产品源码不加测试钩子**）、冻结 rAF。
  因为 `arena.step()` 只在 `frame()` 内被调用，冻结 rAF 后须**显式驱动两条路径**：
  `engine.update(1/120)` 触发 `emit()` 差分 → 读 `arena.target` / `arena.pulseValue`
  断言倒数 3→2→1 的 key 单调上升、`c = 1` 与 `playing` 逐项相等、`award()` 后
  `pulseValue > 0`、`gameover` tint 切换、`tip / pending / muted` 变化不触发差分；
  再显式调用 `engine.view.arena.step(1/60)` 驱动插值 → 读 `arena.current` 断言
  `playing` 期间恒定（连跑 200 步，末期相邻帧差 < 1e-6）与 `pulse` 0.5s 内衰减。
  另断言场景 Light 数量仍为 3、`castShadow` 数量仍为 1、无新增 GL 资源。
- HUD：名牌 / 发球指示点随 `server` 变化 / 10-9 赛点徽标 / 「第 1 局 · 11 分制」 /
  `sr-only` 与 `aria-live` / `pointer-events: none` 下拖拍仍生效。
- 回归：3→2→1 倒数、球拍归位、我方发球方向与 AI 接发球、胜负界面、键盘
  `Space` / `Shift`、触屏预设与消费链路、200 次 AI 首接率 ≥75% 且 <100%。
- 清理：`git status --short` 无验证产物与临时依赖残留；`config.arena` 默认值与
  实现期实测一并记入 `tasks.md` 的「实现期偏差与实测记录」。

### 范围之外

多局制与真实局分数据、WTT 商标 / 真实选手名 / 队服、观众贴图或视频、后处理
bloom、`CanvasTexture` 虚拟 LED 屏、额外投影灯与实时阴影、跟随球的追光、逐帧
闪烁与击球即闪、音效改动、难度选择 UI、真机专项手感调参、联网 / 持久化 /
排行榜、物理引擎、任何外部资源。

---

## 迭代 6：击球判定贴合拍面

本章为对前文的**修订**：凡与本章冲突的 `checkPaddleHit`、`hitRadiusX` /
`hitRadiusY`、`reachZ` 及迭代 2「不改 `checkPaddleHit`」的描述，以本章为准。
架构、数据流、计分、倒数 / 归位、旋转与意图、触屏输入、赛场灯光、UI、错误处理
与交付方式均不变。

### 问题

用户反馈：「有时候感觉球在球拍外也能击到球」。实测复现后确认这不是偶发，
而是两处判定几何与视觉不一致，**每一次回击都受影响**。

### 根因（已实测复现）

| 项 | 实测值 | 说明 |
| --- | --- | --- |
| `models.js` 的 rim 半径 | `0.088` | 玩家看得见的拍面边界 |
| 视觉接触边界 | `0.088 + ball.radius 0.02 = 0.108` | 球心到拍心超过它就在拍外 |
| 判定椭圆 | `rx = 0.17 + 0.02 = 0.19`，`ry = 0.20 + 0.02 = 0.22` | `checkPaddleHit` 的 `dx² + dy² ≤ 1` |
| 判定面积 / 视觉接触面积 | `3.58 倍` | 拍面是圆，判定却是横向更窄、纵向更宽的椭圆 |
| 球在拍心正上方 `0.15` / 侧方 `0.18` | 判定**命中** | 视觉上明显在拍外 |
| 命中瞬间球与拍平面的 z 距离 | **恒定 `0.158`**（200 次采样 min/p25/p50/p75/max 全为 `0.158`，`> 0.05` 占 100%） | `reachZ = 0.17` 的窗口边缘 |
| `advanceSimulation` 判定顺序 | 在 `stepBall` **之前**用上一帧末的球位置 | 球一进入窗口边缘即命中，随后立刻反向 |

第二条是「看起来球还没到拍就弹回」的主因：`reachZ = 0.17` 远大于拍面半厚
`0.009` 与单步位移（典型 `vz 3.3 → 0.0275`），命中恒定发生在离拍 `0.158m` 处。
第一条让球在拍面轮廓外也能被击回。两者叠加即用户描述的手感。

### 约束：为什么不能只把半径调小

迭代 2 靠 `hitRadiusX + ball.radius = 0.19` 与 AI 误差相位（`+0.20`）的博弈校准接发球，
并把 `checkPaddleHit` 列入「不改」。只改半径会直接破坏可玩性：

| 判定半径（x/y） | 200 次我方发球、玩家不动拍的 AI 首接率 |
| --- | --- |
| 现状 `0.17 / 0.20` | `184/200 = 92%` |
| 完全贴视觉 `0.088 / 0.088` | `118/200 = 59%`（低于 ≥75% 验收线） |
| `0.105 / 0.105` | `142/200 = 71%` |
| `0.12 / 0.12` | `150/200 = 75%`（刚好达标、无余量） |

命中时刻从窗口边缘延后到拍平面，AI 会多出约 `0.158 / 3.35 ≈ 0.047s`
（约 6 个固定步）的追球时间，首接率可能自然回升；因此**先落几何修正、再实测校准**，
验收线 `≥75% 且 <100%` 保持不变，不通过改验收线或放大球拍模型来「修」这个 bug。

### 决定

1. **判定时刻**：`checkPaddleHit` 由「点距离」升级为「本步 z 轨迹上离拍平面最近的点」。
   新增纯函数 `paddleContact(ball, plane, dt)`：取 `z0 = ball.position.z`、
   `z1 = z0 + ball.velocity.z * dt`，把 `t = clamp((plane - z0) / (z1 - z0), 0, 1)`
   求最近点 `{ x, y, z, t }`；仅当 `|z - plane| <= contactDepth` 才继续。
   `contactDepth = 0.035`（球半径 `0.02` + 拍面半厚 `0.009` + `0.006` 容差）。
   `advanceSimulation` 两处调用传入 `CONFIG, dt`；命中后把球位置整体置为
   `contact`（`{ x, y, z: plane }`，其中 x/y 为插值到拍平面的坐标）再交给
   `returnBall`，回球严格从拍面上的接触点出发。
2. **判定形状**：椭圆改圆，接触半径 `hitRadius + ball.radius`，`hitRadius = 0.10`
   （总 `0.12`，比视觉接触边界 `0.108` 大 11% 作为手感宽容，面积比 `1.23`）。
   x/y 取插值到最近点的坐标。`config.paddle` 删除 `reachZ` / `hitRadiusX` /
   `hitRadiusY`，新增 `hitRadius: 0.10`、`contactDepth: 0.035`、
   `bladeRadius: 0.088`；`models.js` 的 rim / blade 半径改为从 `bladeRadius` 派生，
   消除「视觉尺寸」与「判定尺寸」两处各写一份魔法数字。
3. **AI 校准**：几何修正后重跑 200 次统计。若仍 `<75%`，唯一允许的调整是
   `aiProfiles.standard.errorFast` / `errorSlow` 的最小幅度下调；
   `speed`、`ySpeedFactor`、相位机制、`createBall` 发球几何与其余两档均不动。
   `ai.test.js` 中「standard 档参数与迭代 2 逐项相同」属于实现即断言，改为
   「三档 `speed` 单调递增、`standard` 取自 config、未知档回退 standard」的行为断言。
4. **出球参数**：`returnVy` / `returnVzBase` / `returnVzRange` 默认保持不变。
   回球起点前移 `0.158m` 后若真实链路出现落点出界，`returnVzBase` 是唯一允许
   调整的参数，且须同时满足 `spinIntegration.test.js` 全部过网 / 落台断言与
   「真实对打无异常判罚」；最终值写入 `tasks.md` 实测记录。

### 架构与模块边界

- 新增 `src/game/contact.js`：`paddleContact(ball, plane, dt)` 纯函数，
  只做插值与 clamp，不 import three、不访问 DOM、不改入参。
  抽出它是为了 `physics.js`（当前 193 行）不越 200 行上限。
- `src/game/physics.js`：`checkPaddleHit(ball, paddle, side, rally, config = CONFIG, dt = 0)`
  新增可选第 6 参；`dt = 0` 时退化为点判定，既有 3 条直接调用该函数的断言不回归。
  内部调用 `paddleContact`，删掉椭圆两行，净减行。
- `src/game/rally.js`：两处 `checkPaddleHit` 传 `CONFIG, dt`；命中分支重新调用
  `paddleContact` 取接触点，把 `sim.ball.position` 置为 `{ x, y, z: plane }` 后
  再 `returnBall`。其余顺序（`movePaddle` → 判定 → `stepBall` → `judgeRally`）
  不变，`hooks` 载荷与 `onTrail` 语义不变。
- `src/game/config.js` / `src/game/models.js`：按上文改参数与视觉半径派生。
- 依赖方向单向：`contact → 无依赖`、`physics → contact`、`rally → physics`。

### 错误处理与不回归

`paddleContact` 对 `dt <= 0`、`vz = 0`、`z1 = z0`、非有限坐标一律返回有限值，
不产生 NaN；`checkPaddleHit` 在 `rally.active = false`、`lastHitter === side`、
来球方向背离时仍提前返回 `false`。WebGL / AudioContext / 循环异常三条兜底与
中文文案不变；`sessionPayload()` 字段不加；无新增 npm 依赖、无后端函数、无存储。

### 验收标准

- 命中瞬间 `|ball.z - plane| <= 0.035`（200 次采样 100% 满足），不再是 `0.158`。
- 球在拍心正上方 `0.15` / 侧方 `0.18` 时**不命中**；在 `0.10` 时**命中**；
  判定区面积约为视觉接触区的 `1.23` 倍（现状 `3.58` 倍）。
- `npm test` 全绿；既有 281 条断言除上文明示的 `ai.test.js` 一条改写外零改动。
- 200 次我方发球、玩家不动拍的 AI 首接率 `≥75% 且 <100%`。
- 真实对打：球在拍面处被击回、过网、首落点在对方半台、无异常判罚；
  浏览器 480×360 / 1280×900 / 390×844 三视口无未捕获异常与 4xx；
  倒数、旋转意图、触屏预设、胜负界面、灯光联动均不回归。
- 所有新增 / 修改单文件 `≤200` 行；`git status --short` 无验证产物与临时依赖残留。

### 范围之外

球拍放大到匹配判定、物理引擎、swept-sphere 完整连续碰撞、甜区 / 拍面角度 /
真实旋转反馈、AI 难度档 UI、难度选择、录像回放、真机专项手感调参、
放大 z 容差来「保留手感」、任何外部资源。

---

## 迭代 7：可玩性回补（对迭代 6 的修订）

本章为对迭代 6 的**修订**：凡与本章冲突的 `hitRadius = 0.10`、
「球在拍心正上方 `0.15` 不命中」及「AI 首接率 ≥75%」验收线，以本章为准。
`contactDepth = 0.035`、圆形判定、`paddleContact` 扫掠接触点、
「回球严格从拍平面出发」、迭代 6 的 AI 误差校准值与其余架构**全部不变**。

### 问题

用户反馈：「现在人和 AI 都比较容易漏球」。迭代 6 把击球判定修到贴合拍面，
但只把「AI 首接率 ≥75% 且 <100%」写进验收线，**没有玩家侧与回合长度指标**，
属于规格盲点；AI 校准也只是压小误差相位来补偿收紧的几何，未修复根因。

### 根因（配对实测，400 球 / 同一批发球与 AI 相位）

| 指标 | 迭代 5 旧判定 | 迭代 6 | 说明 |
| --- | --- | --- | --- |
| AI 首接率 | 400/400 = 100% | 337/400 = 84.3% | 每 6 球多漏 1 球 |
| 玩家首接率（瞄准误差 ±0.08m / 延迟 33ms） | 100% | 71.5% | 漏球 +28.5 个百分点 |
| 玩家首接率（±0.12m） | 100% | 58.0% | 漏球 +42 个百分点 |
| 判定区面积 | 0.1313 m²（3.58x 视觉） | 0.0452 m²（1.23x） | 缩小 66% |
| 命中 z 窗口 | 6.2 个物理步 | 2.5 个物理步 | 缩短 60% |

两处收紧叠加，球拍必须在 1～2 个物理步内精确到位。玩家侧完全没有校准，
且玩家首接率被 AI 首接率封顶（AI 漏掉的球根本回不来），回合天然打不长。

**关键排错**：单独放宽 `contactDepth` 从 `0.035` 到 `0.10`（z 窗口 2.5 → 7.3 步）
几乎无效，玩家首接率仅 `0.623 → 0.673`、AI `0.837 → 0.843`。球拍是连续追踪的，
多给几步并不能修正固定的 xy 瞄准偏差。因此**决定性变量是 xy 判定面积，不是命中时刻**，
排除「放宽 z 容差」这条路径，迭代 6 排除它的理由在本轮以实测得到确认。

### 决定

1. **只调一个常量**：`config.paddle.hitRadius` `0.10 → 0.13`，
   接触半径 `0.15`，判定面积 `0.0707 m²`，为视觉接触区 `0.108` 的 **1.93 倍**
   （迭代 5 为 3.58 倍，迭代 6 为 1.23 倍）。仍是圆，不再有椭圆纵向过宽的问题。
2. **其余全部不动**：`bladeRadius = 0.088`、`contactDepth = 0.035`、
   `strikeFrom` 的拍面回球起点、`aiProfiles.standard.errorFast/errorSlow = 0.10/0.08`、
   `speed` / `ySpeedFactor` / 相位机制 / 全部出球参数 / 输入层 / 3D 模型 / UI 均不改。
   迭代 6 的 AI 校准值无需回滚。
3. **修订边界断言**：`0.15` 在新半径下位于边界（应命中），故
   `contact.test.js` 改为「正上方 `0.17`、侧方 `0.18` 不命中；`0.10` 与 `0.14` 命中」，
   并新增「判定/视觉面积比 ≤2」的回归护栏。`physics.test.js` 三条既有断言数值
   （`0` / `0.7` / 自己刚打出的球）在新半径下仍成立，**一个字不改**。
4. **补齐双侧验收线**：不再只用 AI 首接率衡量可玩性，同时约束玩家首接率、
   回合长度与判定面积上限（见下）。

### 架构与模块边界

无新增生产文件、无新增测试文件、无新增依赖。`contact.js` → `physics.js` → `rally.js`
的单向依赖、`sessionPayload()` 九个字段、`hooks` 载荷、`onTrail` 语义全部不变。
本轮改动仅涉及 `config.js` 一个常量与 `contact.test.js` 四条断言（含一条新增护栏）。

### 错误处理与不回归

`paddleContact` 的错误输入兜底、`checkPaddleHit` 三条提前返回、WebGL / AudioContext /
循环异常的中文兜底文案不变。无新增 npm 依赖、无后端函数、无存储、无网络请求、
无环境变量或凭据。仍为纯静态 SPA。

### 验收标准

- AI 首接率（200 次我方发球、玩家不动拍）**≥90% 且 <100%**。
- 玩家首接率（模拟 ±0.10m 瞄准误差 / 33ms 延迟、400 球）**≥85%**。
- 真实对打 200 场**场均 ≥5 拍**；过网高度 100% 合格、首落点 100% 在对方半台且界内、
  无 `OUT` / `OWN_HALF` 异常聚集。
- 判定区面积 / 视觉接触面积 **≤2.0x**；圆形判定保持。
- **不回退迭代 6 的视觉修复**：命中瞬间 `|ball.z - plane| ≤ 0.035` 100% 满足、
  回球起点严格位于拍平面、75/75 组出球轨迹过网且首落点合法。
- `npm test` 全绿且用例数 >298；`npm run build` 退出码 0；所有单文件 ≤200 行；
  浏览器 480×360 / 1280×900 / 390×844 三视口无未捕获异常与 4xx；
  `git status --short` 无验证产物与临时依赖残留。

### 范围之外

放大 3D 球拍模型、输入层磁吸 / 隐藏辅助、按 side 给玩家与 AI 不同判定半径、
放宽 `contactDepth`、恢复椭圆判定、改 AI 速度或相位机制、难度档 UI、真机手感调参。

---

## 迭代 8：得分后短暂定格再回置球拍

本章为对迭代 1「每分结束后瞬时归位」的**修订**：凡与本章冲突的
`award()` 立即 `prepareServe()` 与「倒数立刻从 3 开始」，以本章为准。
架构、物理、判定几何、计分、旋转与意图、触屏输入、赛场灯光、HUD、
错误处理与交付方式均不变。

### 问题

用户反馈：「一球结束后，稍微留 1-2 秒时间，不要马上回置球拍」。
现状 `PongEngine.award()`（第 140 行）在得分的同一固定步就调用
`prepareServe(this.sim, server)`，把两只球拍、球、rally 与 AI 控制器全部打回默认位；
`syncMeshes` 下一帧即渲染，玩家还没看清刚才那分，球拍已经「啪」地跳回中位。

### 现状状态流（已核对）

- `award()` → `phase = 'serving'`（终局为 `'gameover'`）、
  `countdown = serveClock.reset()` = 3、播得分音效与粒子、`trail.reset()`、
  **`prepareServe()` 立即回置**、`emit()`。
- `update()` 的 `'serving'` 分支直接 `serveClock.tick(dt)`，倒数 3→2→1 →
  `serve()` 发球；该分支不推进物理、不响应输入，球拍冻结。
- `arenaState.cueForPhase()` 把 `'serving'` 映射为 `COUNTDOWN` cue，
  对**未知 phase 回退 `PLAYING` 满亮度**；`ServeCountdown` 按 `count > 0` 显隐。
- 现有 4 条单测断言「每分结束后球拍瞬时归位」，另有 2 条断言
  award 后 `countdown = 3`。

### 决定

1. **停留 1.5 秒**：`config.rules.pointPause = 1.5`。得分后球与两只球拍
   **保持结束姿态定格**，`countdown = 0`（不显示倒数），不推进物理、不响应输入；
   得分文案、粒子与灯光得分闪光照常播完。
2. **停留结束后才回置并倒数**：`pauseRemaining` 归零的那个固定步执行
   `prepareServe(this.sim, this.state.server)`、`serveClock.reset()`、
   `state.countdown = 3`、`emit()`；下一步起照常 3→2→1 → 发球。
   因此每球间隔约 `1.5 + 3 = 4.5` 秒。
3. **不新增 phase**：`phase` 全程保持 `'serving'`（终局 `'gameover'`）。
   这是为了避免 `arenaState.cueForPhase` 把未知 phase 回退成满亮度 `PLAYING`，
   从而破坏迭代 5 的得分闪光与倒数灯光联动；`sessionPayload()` 九字段不变。
4. **不用 `setTimeout`**：停留与倒数共用引擎的固定步长 `dt`，与 `ServeClock`
   一致；无独立计时器、无泄漏风险、可被单测按步数精确驱动。
5. **终局与重开例外**：`isGameOver` 为真时仍**立即**回置（overlay 已覆盖，
   无观感问题，且不进入 serving 分支，计时器不会推进）；`restart()` 清零
   `pauseRemaining` 并立即回置，新一局不等待。

### 架构与模块边界

- `src/game/config.js`：`rules` 段新增 `pointPause: 1.5`，其余数值不变。
- `src/game/pointPause.js`（新增纯函数，无依赖）：导出
  `advancePointPause(remaining, dt)` → `{ remaining, expired }`。
  只做递减与 clamp：`remaining <= 0` 或 `dt` 非有限时原样返回且不产生 NaN；
  `expired` 仅在「本次调用前 `remaining > 0` 且本次归零」时为真，保证回置只触发一次。
  不 import three、不访问 DOM、不改入参。
- `src/game/session.js`：新增纯函数 `pointResult(state, winner, reason)`，
  返回 `{ scores, over, server, message, tip, pending }`。内部一次完成
  `applyPoint` / `isGameOver` / `serverFor` / `pointMessage`，多返回的 `over`
  让 `award()` 无需重复计算比分；`sessionPayload()` 九字段与既有导出不变。
- `src/game/PongEngine.js`（当前 200 行）：构造函数初始化 `pauseRemaining = 0`；
  `award()` 调 `pointResult()` 并按是否终局分支处理回置与停留；`update()` 的
  serving 分支调 `advancePointPause()`；`restart()` / `serve()` 清零。
  **上述两处下沉是硬性要求**：净增行数必须为 0 或为负，最终文件 ≤200 行；
  不得靠删除既有功能或压缩成难读的单行来达标。
- **零改动**：`arenaState.js` / `arena.js` / `scene.js` / `ServeCountdown.vue` /
  `App.vue` / `ScoreBoard.vue` / 全部物理与 AI 模块。
- `sessionPayload()` 字段一个不加；`hooks` 载荷与 `onTrail` 语义不变。

### 数据流（时序）

| 时刻 | `phase` | `countdown` | `sim` | emit |
| --- | --- | --- | --- | --- |
| 得分固定步 | `serving` | `0` | 定格（不回置） | 得分文案 / 分数 / 闪光 |
| 停留中 1.5s | `serving` | `0` | 定格 | 无 |
| 停留归零步 | `serving` | `3` | **回置** | 倒数 3 |
| 之后 3s | `serving` | `3→2→1` | 回置态 | 每次变化 |
| `serve()` | `playing` | `0` | 发球 | 发球文案 |
| 终局得分步 | `gameover` | `0` | **立即回置** | 胜负文案 |

### 错误处理与不回归

`pauseRemaining` 对 `undefined` / 非有限 `dt` 按 0 处理，不产生 NaN、不卡死；
`frame()` 的 `try/catch` 与 `MESSAGES.webgl` / `MESSAGES.runtime` 中文兜底不变；
`restart()` / `dispose()` 不留计时器。停留期间 `particles.update`、
`arena.step`、`syncMeshes` 仍逐帧执行，粒子与灯光阻尼正常衰减。
WebGL / AudioContext / 循环异常三条兜底不变。

### 测试

- 改写 `PongEngine.test.js` 中 2 条「瞬时归位」为行为断言：
  得分瞬间球拍**保持**结束姿态、停留结束才归零（玩家与 AI 各一条）。
- 改写 1 条「award 后 countdown = 3」为「停留期间 countdown = 0、
  停留结束后下发 3」。
- 新增 `pointPause.test.js`（与被测文件同目录）：`advancePointPause` 的
  归零 / 未到期 / `dt <= 0` / 非有限 `remaining` 与 `dt` / 幂等（重复调用不再
  `expired`）边界。
- 新增 `session.test.js` 用例：`pointResult` 的得分文案、发球方轮换、
  `tip` / `pending` 清空，与既有 `sessionPayload()` 断言互不干扰。
- 新增 `PongEngine.test.js` 边界：停留时长内不回置 / 恰好到期回置 /
  停留期间输入不推进且不跑物理 / 停留结束后约 3 秒开球 / 终局仍立即回置 /
  `restart` 清零停留 / 停留结束只回置一次（幂等）/ 非有限 `dt` 不卡死。
- `arenaState.test.js` / `physics.test.js` / `rally.test.js` /
  `spinIntegration.test.js` 既有断言零改动。

> 实现备注：因单文件 ≤200 行硬约束，`PongEngine.test.js` 基线已 198 行，
> 上述引擎边界用例落在同目录新文件 `PongEngine.pause.test.js`；
> 详见 `tasks.md`「迭代 8 · 实现期偏差与实测记录」。

### 验收标准

- 得分后 1.5 秒（`180 ± 2` 个固定步）内，玩家与 AI 球拍坐标保持得分瞬间的值，
  `countdown = 0`、倒数不显示、球不移动；第 180 步左右回置且 `countdown = 3`。
- 回置后倒数仍 3→2→1 并自动发球，总间隔约 4.5 秒（540 ± 5 步）。
- 终局与 `restart()` 行为不变；得分闪光、赛点徽标、灯光联动、胜负界面不回归。
- `npm test` 全绿且用例数 >299；`npm run build` 退出码 0；所有单文件 ≤200 行；
  浏览器 480×360 / 1280×900 / 390×844 三视口无未捕获异常与 4xx；
  `git status --short` 无验证产物与临时依赖残留。

### 范围之外

停留时长 UI 可调、得分回放 / 慢镜头、可跳过的停留（点击提前发球）、
停留期间允许移动球拍、停留期专属音效或文案、改发球倒数 `serveDelay`、
把停留做成独立 phase、任何外部资源。

---

## 迭代 10：玩法操作说明入口与对手强度设置

### 背景：现有功能覆盖度核对

用户先提出「击球力量调控球速（上限约 1.5 倍）、AI 速度可调、回球线路多变」，
随后把方向收窄为：现有功能基本能覆盖，**把这些玩法操作梳理出来，并在页面提供入口查看**。
为避免说明里写出做不到的操作，先逐项核对现有实现：

| 原始诉求 | 现有实现 | 是否覆盖 |
| --- | --- | --- |
| 击球力量 → 球速，上限约 1.5 倍 | `Space` 蓄力（`chargeTime = 0.8s`）→ `drive`，`spin.js` 的 `applyIntent` 把 `vz` 乘 `1 + charge × 0.55`，满蓄力 z 分量为 1.55 倍；整体球速因 `vx` / `vy` 不变而增幅更小。`Shift` → `push`，`vz × 0.78` 并加下旋。`returnBall` 末尾 `clampVelocity(..., maxSpeed = 9.5)` 统一截断。触屏「上旋快攻」预设固定 `charge = 0.65`。 | 基本覆盖；语义名为「上旋快攻」而非「力度」，且 z 分量 1.55 略高于 1.5 |
| AI 速度可调 | `CONFIG.aiProfiles` 已有 `practice / standard / sharp` 三档（`speed 1.3 / 1.8 / 2.3` 与递减误差），`createAiController(rng, profile)` 已支持传档。 | **迭代 10 前未覆盖**：`rally.js` 的 `prepareServe()` 固定 `createAiController()` → `standard`；当时 `config.js` 注释曾写明「本轮不提供玩家选择 UI」，页面无任何入口 |
| 回球线路多变 | `returnBall` 的 `vx = 来球 vx × 0.3 + 球拍横移 vx × 0.2 + 随机 ±0.3`，夹在 `±1.4`；`paddle.vy` 影响 `vy`；`drive` / `push` 改变弧线、旋转与落台后水平速度。 | 基本覆盖；横移可主动打角度、随机带来变化，但无显式「线路」选择按钮 |

结论：三项诉求里两项已有可操作玩法，说明文字却散落在
`StartOverlay.vue`（开局列表）、`App.vue`（页脚三行）、`TouchControls.vue`（两行提示）
与 `tips.js`（击球后短提示）四处，玩家无法集中查阅；AI 三档则是「有参数、无入口」。

### 目标

1. 页面常驻一个「玩法说明」入口，打开后能集中查阅全部玩法操作与计分规则。
2. 说明内容如实、无夸大：只写真实存在且可操作的行为，量化表述不写死倍数。
3. 让「AI 速度可调」真正可用：把既有三档做成面板内可选设置，默认仍为 `standard`。
4. 默认对局行为零变化：不改任何物理常量、不改 `sessionPayload()` 九字段、
   不改动迭代 6 / 7 校准出的 AI 首接率与回合长度基线。

### 设计

#### 1. 模块边界（一个模块一个职责）

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `src/game/guide.js`（新增） | `GUIDE_SECTIONS` 固定中文说明数据、`AI_LEVELS` 档位枚举与标签、`guideSections()` / `aiLevelOptions()` 纯读取函数 | 仅自身，不 import three、不访问 DOM |
| `src/game/matchSettings.js`（新增） | `MESSAGES`（webgl / runtime 兜底文案）、`AI_LEVEL_KEYS`、`normalizeAiLevel(value)` 白名单校验、`createMatchSettings()` | 仅自身，纯逻辑 |
| `src/components/GameGuide.vue` / `GuideSections.vue` / `AiLevelPicker.vue`（新增） | 触发按钮与对话框外壳、五组静态说明、三档选择器；按单文件 ≤200 行约束拆成三个组件 | `guide.js`、`matchSettings.js`、Vue |
| `src/App.vue` | 在 header 与 `SoundToggle` 并排放入 `GameGuide`；持有 `guideOpen` / `aiLevel` 两个 ref；页脚精简为一行，避免与面板重复 | 现有组件 |
| `src/composables/usePongGame.js` | 暴露 `setAiLevel(level)`；`aiLevel` 归 Vue 侧 ref 管理，**不进 `sessionPayload()`** | `PongEngine` |
| `src/game/PongEngine.js` | 新增 `setAiLevel(level)`；把 `MESSAGES` 与初始化样板下沉到 `matchSettings.js` | `rally.js`、`matchSettings.js` |
| `src/game/rally.js` | `prepareServe(sim, server)` 重建 `sim.ai` 时继承 `sim.ai?.profile`，不新增参数 | 现有 |

`PongEngine.js` 在迭代 8 完成态恰好 **200 行**（单文件 ≤200 行硬约束）。本轮新增 `setAiLevel`
同时把 `MESSAGES` 常量与初始化样板下沉到 `matchSettings.js`，保证
**净增 ≤0 行、最终 ≤200 行**；不删既有功能、不压成难读单行。
实测最终 199 行；说明面板按同一上限拆成三个组件，详见 `tasks.md` 偏差记录。

#### 2. 数据流

- 打开：点 header「玩法说明」→ `guideOpen = true` → 面板渲染 `guideSections()`。
- 关闭：关闭按钮 / 点遮罩 / `Esc` 三者都置 `guideOpen = false`，关闭后焦点回到触发按钮。
- 切档：面板选档 → emit `selectLevel` → `usePongGame.setAiLevel` →
  `PongEngine.setAiLevel` → `normalizeAiLevel` 白名单校验 → 写 `sim.ai.profile`；
  `rally.js` 的 `prepareServe` 用 `createAiController(Math.random, sim.ai?.profile)`
  继承该档，`createAiController` / `updateAiPaddle` 既有兜底保证未知档回退 `standard`。
- 切档**立即生效**（AI 下一物理步就用新 speed），并在后续每球与 `restart()` 后保持。
- 面板**不读取**运行时物理状态，只渲染静态文案与当前档位高亮；
  打开 / 关闭 / 切档都不推进或中断对局。
- 档位不持久化、不写入 `sessionPayload()`；刷新后回到 `standard`。

#### 3. 说明内容（五组：第 2 / 3 / 4 组分别对应三项诉求，第 1 组为基础操作、第 5 组为规则）

1. **移动球拍**：`W` / `A` / `S` / `D` 或方向键；触屏 / 鼠标在球台上拖动。
2. **出球力度与节奏**（对应「球速可通过击球力量调控」）：按住 `Space` 蓄力，
   蓄得越久出球越快、弧线越低；按住 `Shift` 搓短，球速更慢、落台后回缩；
   都不按 = 普通回击；触屏用下方按钮预设下一拍，命中后自动复原。
   明确写出「所有出球速度都有统一上限截断，不会无限加速」——
   只做定性描述，**不写死倍数**，避免与现有 z 分量 1.55 倍的表述冲突。
3. **回球线路**（对应「线路多变」）：回球横向由来球角度、击球瞬间的球拍横移
   与随机扰动共同决定；横移能主动打出角度；上下移动影响弧线高度；
   上旋 / 下旋改变弧线与落台后的前冲 / 回缩。
4. **对手强度**（对应「AI 速度可调控」）：`practice / standard / sharp` 三档，
   分别描述为「移动较慢、失误较多」「标准」「移动更快、失误更少」，
   默认 `standard`，切换后立即生效。
5. **计分规则**：11 分制、净胜 2 分；下网 / 出界 / 落在自己半台 /
   二次落地 / 没接到丢分；得分后短暂定格再开始倒数。

全部为固定中文常量，用 Vue 插值渲染；禁止 `v-html` / `innerHTML` /
`dangerouslySetInnerHTML`；无占位符、TODO、lorem ipsum 或未定义键位。

#### 4. 交互与可访问性

- 触发按钮与关闭按钮都具备 hover / focus / active / disabled 四态样式，
  点击目标 ≥24×24 CSS px，键盘焦点可见（`focus-visible` 补描边，不 `outline: none`）。
- 面板 `aria-modal="true"` + `aria-labelledby` 指向标题；`aria-live` 用于档位切换反馈。
- 面板 `max-height` + `overflow-y: auto`，三视口（480×360 / 1280×900 / 390×844）
  不产生页面级横向溢出；`prefers-reduced-motion` 下关闭过渡动画。
- 配色沿用单主色 + 中性灰阶变量；正文 ≥16px、行高 1.6、行宽受 `max-width` 约束；
  间距只用 4px 倍数。
- WebGL 初始化失败时说明面板仍可打开（不依赖 engine 实例），
  但档位按钮置 `disabled` 并显示「游戏未就绪，暂时无法调整对手强度」，
  避免界面显示与实际行为不一致。

#### 5. 错误处理

- `normalizeAiLevel` 对 `undefined` / `null` / 非字符串 / 未知字符串 / 原型键
  一律回退 `standard`；不抛异常、不拼进日志。
- `PongEngine.setAiLevel` 在 `failed` 引擎上不写 `sim` 并返回 `null`；
  `usePongGame.setAiLevel` 只在返回非 `null` 时更新 `aiLevel` ref；
  `App.vue` 依据 `state.error` 把 `disabled` 传给档位按钮，
  错误态保持既有 `MESSAGES` 中文兜底。
- 无新增网络请求、平台存储、环境变量、密钥或第三方依赖。

### 验收标准

- 页面常驻「玩法说明」入口可见可点；点击 / `Esc` / 点遮罩都能开合，
  关闭后焦点回到触发按钮；面板内五组说明齐全且文案与真实操作一致。
- 三档对手强度可在面板内切换，切换后 `sim.ai.profile` 随之变化，
  `restart()` 后档位保持不回退；默认仍为 `standard`。
- `sessionPayload()` 九字段与既有导出不变；`CONFIG` 物理常量零改动；
  迭代 6 / 7 的 AI 首接率（200 次发球 ≥75% 且 <100%）与平均回合长度不回归。
- `npm test` 全绿且用例数 >330；`npm run build` 退出码 0；
  所有 `src/game/*.js` / `src/components/*.vue` / `src/composables/*.js`
  单文件 ≤200 行，`PongEngine.js` ≤200 行（实测 199 行）。
- 浏览器 480×360 / 1280×900 / 390×844 三视口无未捕获异常、无 4xx、
  无横向溢出；对局进行中打开面板不会中断或加速物理。
- 验证产物与临时依赖清理干净；`git status --short` 仅剩基线未跟踪项目文件。

### 范围之外

全局球速倍率滑杆、把 `Space` 改造成纯力度倍率、显式「线路」选择按钮、
修改 `driveVzGain` / `maxSpeed` / `returnVx*` / AI profile 数值、
设置持久化、独立帮助路由、多语言、键位自定义、任何物理常量或判罚规则改动。

---

## 迭代 11：WTT 式高级赛场（建模 + 生成贴图）

### 背景：升级前实测基线

用户诉求是「使用最新 skill 继续优化**游戏场景与建模**，要有 WTT 转播那种高级感」，
此前已在三条路线里选定 **B：建模 + 生成贴图**（不是「只调灯光 / 后期」，也不是「纯程序建模无贴图」）。
本轮已加载 `threejs-game-director`（最新入口）、`brainstorming`、`threejs-aaa-graphics-builder`、
`threejs-image-generator` 的指导；后两者在本轮早些时候用于现状诊断。

升级前用 `.verify-browser/capture.mjs` 取三视口截图与渲染器诊断，
`.verify-browser/score.mjs` 做 16×16 分块像素统计（`ViewImage` 视觉模型本环境不可用，
故以可复现的数值代替肉眼判读）：

| 指标 | 桌面 1280×900 playing | 桌面 canvas |
| --- | --- | --- |
| 颜色分箱 `colorBins` | 198 | 174 |
| 平均亮度 `meanLum` | 32.60 | 38.88 |
| 亮部占比 `brightRatio` | 0.0365 | 0.0659 |
| 边缘密度 `edgeDensity` | 0.0201 | 0.0161 |
| **平坦块占比 `flatBlockRatio`** | **0.7228** | **0.6456** |
| 中心 / 外围亮度 | 73.67 / 24.83 | 74.95 / 32.00 |

渲染器：42–60 draw calls、2974–4358 三角形、39–42 几何体、约 1 张贴图、
3 盏灯 / 1 盏投影、66 个 mesh、120 个实例化观众盒；
背景 `#070a0e`、雾 `8/18`、相机 `(0, 1.52, 2.5)` FOV 50、
`ACESFilmicToneMapping` 曝光 1.15。

**诊断**：约 72% 的桌面画面是「16×16 像素内亮度差 <10」的平坦块，边缘密度仅 2%，
说明不是「光不够」而是**没有可看的东西**——`models.js` 的台面 / 白线 / 球网 / 桌腿 / 球拍
全是 Box / Cylinder / Plane，`venue.js` 的观众是 120 个同色小盒，材质几乎全是纯色，
无 `map` / `roughnessMap` / 环境反射。按 AAA 构建指导的原则：
**先把形态做出来，再上材质，然后才是灯光与效果；发光掩盖不了 primitive。**

### 目标

1. 把「原型感」换成 WTT 转播式高级感：有轮廓的球台与球拍、环形 LED 广告带、
   有纵深的观众席、低调的镜面反射、戏剧性顶部聚光仍在暗场里。
2. **只改 3D 表现层 + 一层不参与交互的暗角 CSS**：物理 / AI / 判定 / 计分 / 输入 /
   状态机 / 灯光 cue 状态机一行不改；`npm test` 348 用例与既有断言零改动，
   `sessionPayload()` 九字段不变。
3. 不引入任何新 npm 依赖、不新增真实光源、不新增 phase、不用 `setTimeout`、
   **运行期不发起任何网络请求**（贴图一律为本地资产；制作期的一次性下载只发生在
   生成资产时，不进游戏运行链路）、不写环境变量 / 密钥、不把临时目录当持久化。
4. 迭代 9 的 relay 前缀预览、迭代 5/8 的灯光联动与得分定格、迭代 10 的说明面板全部不回归。

### 已定决策与本轮默认决策

- **路线**：B（建模 + 生成贴图）——用户已选。
- **2D 生图工具**：**默认 `mcp__media__generate_image`，`ImageGen` 仅作 fallback**。
  这是 `threejs-image-generator` 与 `threejs-game-director` 平台资产策略的一致要求：
  平台工具走 tool-gateway 的签名凭据路径，**凭据由平台持有，agent 不读取任何 key**；
  仅当它「不可用 / 不支持 / 配额受限 / 沙箱连不上 gateway」时才回退 CLI 内置 `ImageGen`，
  两者都不可用才退回程序化 `CanvasTexture` 并如实声明限制。
  上一版规格把优先级写反（误把 `ImageGen` 当默认），按用户指正改回 skill 建议的方式。
- **工具可用性与实际选路（实现期校准）**：规格初版曾按当时探测记录「media MCP
  未配置、需回退 `ImageGen`」；实现期按 `threejs-game-director` /
  `threejs-image-generator` 的要求重新用
  `WaitForMcpServers({ servers: ['media'] })` 探测，返回 **`ready: true`**，
  且 `mcp__media__generate_image` 是**对话层直连工具**（不在 deferred registry，
  所以 `ToolSearch` 查不到它，属于登记机制差异，不是不可用）。实际**只走首选链路**
  生成 3 张贴图，经 writer 脚本各下载一次落盘，**未调用 `ImageGen`、0 积分**；
  远程临时 URL 未进任何交付物。优先级仍固定为平台 → `ImageGen` → 程序化，
  后两条保留为降级设计；`ImageEdit` 仍是图生图，不当文生图替代品。
- **计费披露**：仅当实现期实际回退到 `ImageGen` 才产生计费，其工具定义标注单张约
  5–10 积分，3 张共约 **15–30 积分**；平台工具未标注积分，程序化分支 0 积分。
  按 skill 要求，**首次生成前再次明确告知用户将用哪个工具、是否计费**，
  且在用户批准规格之前不调用任何生图工具、不生成任何图片。
- **`ImageEdit` 不是文生图替代品**：它是图生图（必填 `image`），只在已有底图需
  重绘 / 改风格时才用；本轮三张贴图都要从零得到（生成或程序化），
  没有可用底图，故不纳入它的适用范围。
- **贴图数量**：按本轮早先未获答复的范围问题取推荐值 **3 张**（见下表）。
  评审时可改为 2 张或 5 张；这属于实现期可调整项，不影响下面的模块边界与验收口径。
- **不另建 `artifacts/`**：本项目既有 `proposal.md` + `tasks.md` 是唯一事实源，
  进度与证据统一写回这两处，避免双份真相。
- **保持单主色**：项目规范限定「一个主色 + 中性灰阶」。WTT 的洋红品牌色不引入，
  高级感由**深黑场 + 青绿单主色（沿用 `--accent-bright #7ee2c0`）+ 冷白高光 +
  材质层次**构成；生成的贴图一律抽象、**无文字、无 logo、无真实赛事标识**，避免商标问题。

### 设计

#### 1. 模块边界（一个文件一个职责，全部 ≤200 行）

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `src/game/visual.js`（新增） | **全部新增视觉常量**：材质 roughness / metalness / `envMapIntensity`、贴图重复次数、光束与散景强度、暗角参数。纯数据，不 import three、不访问 DOM；**`config.js` 一字不改** | 无 |
| `src/assets/textures/*.png`（新增 3 张） | 生图工具产物：平台工具走临时 URL **下载一次**，或 `ImageGen` 用 `output_dir` 直落盘；均为本地文件，由 Vite 指纹化 | — |
| `src/game/generatedMaps.js`（新增，本轮**仅生成路径编译**） | 用 `new URL('../assets/textures/x.png', import.meta.url).href` 取得 URL（Vite dev 自动带 base 前缀、build 自动指纹化，Node 单测也可安全 import）；`TextureLoader` 加载并设 `colorSpace = SRGBColorSpace` / `RepeatWrapping` / 有上限的 anisotropy；返回 `{ maps, bind(scene), dispose() }`。材质先由 `tagMaps()` 保留深色纯色，贴图就绪后按 `userData.pendingMaps` 绑定 | three、`visual.js` |
| `src/game/proceduralMaps.js`（新增） | CanvasTexture：球网细网格（alpha）、球面旋转细纹、光晕 sprite、桌面微纹、胶合板层纹、equirect 渐变、接触阴影 sprite；`createProceduralMaps()` 返回 `{ maps, dispose() }`，`createEnvironment(renderer, source)` 返回 `{ texture, dispose() }`。本轮平台生图可用，**程序化模块只产出细节贴图与环境源，不产出 led / crowd / floor 兜底**；纯色降级由 `tagMaps()` + `TextureLoader` onError 覆盖 | three、`visual.js` |
| `src/game/tableModel.js`（新增） | `buildTable(maps)`：圆角 `ExtrudeGeometry` 台面 + 双层侧带 + `LatheGeometry` 收锥桌腿 + 横撑 + 独立白线 + 网格球网 + 车削网柱 | three、`config.js`、maps |
| `src/game/paddleModel.js`（新增） | `buildPaddle(bladeColor, rimColor, maps)`：经典水滴形 `ExtrudeGeometry` 拍面、五层胶合板侧边、双面胶皮、`LatheGeometry` 收腰手柄 + 缠把带 | three、`config.js`、maps |
| `src/game/models.js` | 改为薄门面，`export { buildTable }` / `export { buildPaddle }` 转发到上面两个模块；`scene.js` 的 import 路径不变 | 上述两个 |
| `src/game/venue.js` | 重写，签名 `createVenue(scene, maps = null)`：环形 LED 广告带（贴图）、三层观众缎带（贴图 + 散景 sprite）、车削灯头与桁架、光锥 / 光池、带微纹的地面、背景视频墙。 **handle 形状严格保持 `{ led, cone, pool, tintMaterials, group, dispose }`**，否则 `arena.js` 的 tint 与 cue 联动会断；`maps === null` 时全走纯色 fallback（程序化兜底路径同样传有效 maps，只是来源为 CanvasTexture） | three、`config.js`、maps |
| `src/game/arena.js` | **唯一一处最小改动**：`createArena(scene, lights = {}, maps = null)` 增加第三参并转发给 `createVenue(scene, maps)`。`arena.test.js` 仍以 `createArena(scene, fakeLights)` 调用，`maps` 走默认值 `null` → 纯色分支，断言零改动 | `arenaState.js`、`venue.js` |
| `src/game/scene.js` | 接线：建纹理套件 → 把 `maps` 传给 `buildTable(maps)` / `buildPaddle(color, rim, maps)` / `createArena(scene, lights, maps)`；**`scene.environment` 恒为 `null`**，`applyEnvironment()` 只给 `metalness ≥0.5` 的金属材质赋 PMREM `envMap`，并统一设 `envMapIntensity = 0.24`；球体细分 / 条纹 / 接触阴影 sprite；`dispose()` 追加贴图与 env 释放；**返回对象形状不变**。本轮只编译「生成贴图 + 程序化细节」这一条实际存在的链路，未写条件动态 import；纯色分支用 `createVenue(scene, null)` 与单张 PNG 失败态覆盖。`syncMeshes(view, sim)` **签名不变**、内部追加接触阴影 sprite 的跟随定位 | 上述模块 |
| `src/stage-overlay.css`（新增） | `.stage-wrap::before/::after` 极轻暗角与顶部冷光渐变，`pointer-events: none`、`z-index: 1`（低于记分栏 2 / 倒数 3 / 遮罩 5）、不影响 canvas 命中、`prefers-reduced-motion` 无动画；**不改任何 `.vue` 文件**（`App.vue` 198 / `ScoreBoard.vue` 199 顶格） | — |
| `src/main.js` | 增 1 行 `import './stage-overlay.css'` | — |

贴图模块的**顶层不得创建 canvas / TextureLoader / WebGLRenderer**，全部在函数内惰性创建：
`arena.test.js` 在 Node 里 import `arena.js` → `venue.js` → 贴图模块时不能因 `document` 未定义而挂。

不变文件：`config.js`、`arenaState.js`、`effects.js`、`physics.js`、`rally.js`、
`ai.js`、`spin.js`、`contact.js`、`session.js`、`pointPause.js`、`broadcast.js`、
`guide.js`、`matchSettings.js`、`PongEngine.js`、`usePongGame.js` 及全部 `*.test.js`、
全部 `components/*.vue`、`src/App.vue`、`src/style.css`、`index.html`、
`vite.config.js`、`start-preview.sh`。

按 director 指导，场景相关的 sibling skills 属于按需加载；本轮**实际加载**的是
`brainstorming` / `threejs-game-director` / `threejs-aaa-graphics-builder` /
`threejs-image-generator` / `plan-writing` / `verification`，没有单独加载
`threejs-3d-generator` / `threejs-textures` / `threejs-materials` /
`threejs-lighting` / `threejs-qa-release` 的 SKILL。形态、贴图、材质、灯光与验收
由已加载技能 + 项目既有测试口径覆盖；受保护根目录锚点表读取被拦截与
`ViewImage` 不可用这两项限制，统一记入 `tasks.md` 偏差 D6 / D11。

#### 2. 三张生成贴图（平台工具优先 → `ImageGen` 回退 → 程序化兜底）

| 文件 | 提示方向 | 用途 | 尺寸 |
| --- | --- | --- | --- |
| `led-board.png` | 横向可平铺的抽象深黑底 + 青绿细光带 / 几何流线，低对比、无文字无 logo | 四面环形 LED 广告带 + 背景视频墙的 `map` / `emissiveMap` | 1536×1024 |
| `crowd-bokeh.png` | 暗色阶梯观众席，柔和失焦光点，几乎不可辨人脸，低亮度 | 三层观众缎带的 `map` | 1024×1024 |
| `court-floor.png` | 近黑的深灰绿地面细颗粒 + 极淡放射状光晕，可平铺、无文字 | 30×30 地面 `map`，给出低调镜面质感 | 1024×1024 |

尺寸取生图工具 schema 明确列出的 `1024x1024` / `1536x1024`，不臆造参数；
实现期以实际选中工具的 schema 为准复核一次。横向铺满靠
`RepeatWrapping` + `texture.repeat`，不靠非标准出图比例。

- **实现期实测选路**：`WaitForMcpServers({ servers: ['media'] })` 返回 `ready: true`，
  平台工具为对话层直连；按下列优先级判断后**实际只走路径 1**，writer 脚本一次性下载成功，
  **路径 2 / 3 未触发、`ImageGen` 0 次 / 0 积分**。后两条仅作为降级设计保留：
  1. **平台工具**：`mcp__media__generate_image({ prompt, size })` → 返回临时 URL →
     结果 JSON 管道给 skill 的 `scripts/generate_image_asset.mjs --out <本地路径>`，
     由它**下载一次**并写入字节；脚本不回显 URL / 载荷。若该脚本在沙箱不可直接执行，
     用等价的一次性 `curl` 下载，结果仍是本地文件、URL 不落到任何交付物。
  2. **`ImageGen` 回退**（平台工具不可用 / 不支持 / 配额受限 / 连不上 gateway）：
     `ImageGen({ prompt, size, output_dir })` 用相对 `output_dir` 直接落盘到
     `src/assets/textures/`，**不经临时 URL、不需要 writer 脚本**；生成前先完成计费披露。
  3. **程序化兜底**（前两者都不可用）：不生成 PNG，三张贴图改由
     `proceduralMaps.js` 的 `CanvasTexture` 产出，在 `tasks.md` 如实记录限制，
     **绝不静默把「没生成」伪装成成功**。
  URL 绝不进代码、规格、报告或 manifest；不读 provider key、不探测 shell profile、
  不直连外部图片端点；凭据由平台 tool-gateway 持有。
- **（路径 1 / 2 适用）**产物写入 `src/assets/textures/`（相对路径，落在 `/workspace` 内）；
  预览与发布都由 Vite 指纹化，**绝不在代码里写死 `/textures/...` 根绝对路径**——
  否则会复现迭代 9 的 relay 404 空白页。
- 颜色贴图 `colorSpace = THREE.SRGBColorSpace`；`roughnessMap` / 数据贴图保持线性
  （两条路径都适用）。
- **（路径 1 / 2 适用）**单张生成后**先检查**：出现文字、logo、可辨人脸或过亮色块则
  重生成或裁剪后再用。三张源文件合计 ≤8 MB；若单张过大，用本地一次性 canvas
  重编码脚本降采样后**替换源文件**（运行时降采样只省显存、不省下载体积，不能算达标）。
- **（路径 1 / 2 适用）**生成一次即固定为本地资产；后续若需求变化，只改材质参数 / 几何，
  **不重新生成整套贴图**（避免重复消耗积分）。

#### 3. 程序化细节（0 积分，全部本地 CanvasTexture）

球网细网格（透明 alpha）、球面细旋转纹（让旋转可见、仍保持白球高对比）、
灯头光晕 sprite、桌面微纹（作低强度 `roughnessMap`，不压白线与球的对比）、
球下方柔和接触阴影 sprite（不增加 shadow map 成本）、
equirect 渐变 → `PMREMGenerator` 生成仅给金属件的 `envMap`；
`scene.environment` 恒为 `null`，各材质 `envMapIntensity` 限制在 `0.15–0.35`
以免把暗场洗亮，也避免软件渲染下每个 PBR 片元都采样环境贴图。

#### 4. 建模清单（authored form 取代 primitive）

- **球台**：圆角倒角台面（`Shape` + `ExtrudeGeometry`，倒角让边缘吃到高光）；
  深色侧带 + 台面双层结构；`LatheGeometry` 收锥桌腿与脚环；中央横撑；
  白线仍是独立薄几何以保证锐利；台角小铭牌用程序纹理，不含文字。
- **球网**：`PlaneGeometry` + 细网格 alpha 贴图，白色顶带保留，网柱改车削轮廓 + 夹具。
- **球拍**：经典水滴 / 椭圆拍面（非圆盘）、五层胶合板侧边、深浅双面胶皮、
  收腰木柄与缠把带。**外轮廓半径恒等于 `CONFIG.paddle.bladeRadius = 0.088`**，
  与迭代 6/7 的判定半径同源；`hitRadius 0.13` / `contactDepth 0.035` 一个不动，
  视觉与判定的耦合关系不变。
- **球**：略高细分 + 细旋转纹 + 保留 emissive 以便暗场读球；接触阴影 sprite 跟随。
- **赛场**：环形 LED 广告带取代四条纯色发光条；120 个同色盒观众改为三层观众缎带
  （贴图 + 少量散景 sprite，控制 draw call）；桁架 / 灯头改车削件；
  光锥与光池保留但加柔和衰减；地面与背景视频墙给纵深。
- **`effects.js` 拖尾与粒子不改**（迭代 5 已验证，避免牵动引擎帧循环）。

#### 5. 材质、灯光与约束

- 仍是 `MeshStandardMaterial` 体系：按部位分化 roughness / metalness，
  LED 用 `emissiveMap` + `emissive`（`arena.js` 的 `venue.led.emissive.copy(ledColor)`
  与 `emissiveIntensity` cue 继续生效）；金属件给低强度环境反射。
- **真实光源恒为 3 盏、开阴影恒为 1 盏**，`shadow.mapSize` 保持 1024；
  `CONFIG.arena.light.READY / PLAYING / GAMEOVER` 六项端点向量与 `tints` 一个不改
  （`arenaState.test.js` / `arena.test.js` 断言依赖）。所有额外亮度来自 emissive / 贴图 /
  环境反射，**不新增 Light 对象**，从而不破坏迭代 5/8 的灯光联动与得分闪光。
- `scene.background` 仍为 `#070a0e`，雾 `8/18`、相机与 FOV 不变；
  曝光保持 1.15（若像素验收显示暗部死黑，允许 ±0.05 微调并记入偏差）。
- `scene.environment` **始终为 `null`**；`PMREMGenerator` 包 `try/catch`，成功时只把
  `envMap` 赋给 `metalness ≥0.5` 的金属材质，失败则中文 `console.warn` 并返回
  `texture: null`，游戏照常可玩；该降级只影响反射，
  **不新增错误状态、不改既有中文兜底策略**。

#### 6. 数据流与生命周期

- `createScene(container)` **同步**返回原形状对象；纹理加载是异步的，
  加载完成前用纯色材质占位，完成后赋值 `material.map = tex; material.needsUpdate = true`
  （不重建 mesh、不触碰 engine）。
- `TextureLoader` 的 onError 走「保留纯色 + 中文 `console.warn`」，
  **不抛异常、不进入 `MESSAGES.webgl` / `runtime` 覆盖层**，也不静默无痕。
- 销毁顺序固定：`disposeTree(scene)` → 贴图套件 `dispose()`（含 env render target 与
  PMREM）→ `arena.dispose()` → `renderer.dispose()` → 摘 canvas；
  新增的 CanvasTexture / RenderTarget / geometry 全部纳入释放，避免 `restart()` 泄漏。
- 运行期无 `fetch` 外部地址、无远程 URL 写进代码或文档、无环境变量 / 密钥；
  生成期的临时 URL 只经 writer 脚本下载一次，不落入任何交付物。

#### 7. 界面与可访问性

- 记分栏、玩法说明、开始 / 胜负 / 倒数 / 触屏控件**一行不改**，避免 198/199 行顶格组件越界。
- 唯一 UI 层变化是新增 `stage-overlay.css` 的暗角：`pointer-events: none`、
  不覆盖 HUD、不影响 canvas 拖动 / 键盘焦点、`prefers-reduced-motion` 下不加动画；
  暗角强度上限由 `visual.js` 约束，不得把边缘的球压到不可读。
- 三视口 480×360 / 1280×900 / 390×844 无横向溢出、无 4xx、无未捕获异常；
  WebGL 不可用时仍显示既有中文错误覆盖层与「重试 / 重新开始」。

#### 8. 性能预算

- draw calls ≤120、三角形 ≤25000、真实光源 =3、投影灯 =1；
  新增表面尽量复用材质与几何。
- 贴图预算 `renderer.info.memory.textures` **≤16**，本轮实际构成为：
  3 张生成 PNG（led / crowd / floor）+ 7 张程序化 CanvasTexture
  （网纹 / 球纹 / 光晕 / 接触阴影 / 桌面微纹 / 胶合板层纹 / equirect 渐变）
  + 1 张 PMREM 环境结果 + 1 张既有阴影贴图 = **12**，
  与浏览器实测 `renderer.info.memory.textures = 12` 一致。升级前实测约 1 张，
  故 16 是「加了细节但没失控」的可核上限；程序化兜底路径若启用也不得超过 16。
- 生成路径：3 张 PNG 源文件合计 ≤8 MB（实测 3.89 MB）；程序化兜底路径：0 个 PNG 文件。
  `RepeatWrapping` 贴图设 mipmap 与有上限的 anisotropy；
  本轮源图体积和显存计数均已达标，**未引入运行时 canvas 降采样**，
  `visual.js` 也不保留未使用的分辨率常量。
- 480×360 SwiftShader 下仍需能进入 `playing` 并正常推进固定步物理。

### 验收标准

- 页面在 relay 前缀 `/preview/<id>/` 下：生成路径的 3 张 PNG 全部加载成功（无 404）；
  程序化兜底路径无 PNG 请求、CanvasTexture 全部就绪。
  `tasks.md` 记录实际选中的生图工具 / 是否计费 / 是否走了兜底，与实测一致；
  构建产物 `dist/index.html` 仍为根绝对 `/assets/...`，迭代 9 不回归。
- 同一 `score.mjs` 口径对比升级前后：桌面 playing
  `flatBlockRatio 0.7228 → ≤0.60`、`edgeDensity 0.0201 → ≥0.026`、
  `colorBins 198 → ≥240`；同时 `centerLum > outerLum`（聚光保留）、
  `brightRatio ≤0.12`、`meanLum` 落在 25–60（暗场基调与读球对比不被破坏）。
- 渲染器诊断：draw calls ≤120、triangles ≤25000、textures ≤16、
  lights =3、castShadowLights =1。
- 玩法零回归：`npm test` **348 用例 / 0 失败且既有断言零改动**；
  13 项 `CONFIG` 物理 / AI 常量逐项一致；AI 首接率 ≥75% 且 <100%；
  场均回合 ≥6.9 拍；倒数 3→2→1、得分定格 180 步、赛点徽标、
  玩法说明三档切档、`Space` / `Shift`、触屏预设均不回归。
- `npm run build` 退出码 0；`wc -l` 全部 `src/game/*.js` / `src/components/*.vue` /
  `src/composables/*.js` / `src/App.vue` / `src/main.js` ≤200 行。
- 失败态：WebGL 不可用 → 中文覆盖层正常；单张贴图加载失败 → 保留纯色仍可开局。
- 清理：`.verify-browser/`（含升级前 / 后截图与脚本）整体删除，
  无新增 npm 依赖，`package-lock.json` 中 `"playwright` 引用数 0，
  `git status --short` 仅剩基线交付项。

### 范围之外

后期处理栈（EffectComposer / bloom / DOF / SSAO）、新增 npm 依赖、
外部 3D 模型服务或下载模型、新增真实光源 / 阴影贴图分辨率翻倍、
WTT 商标与真实赛事标识 / 可读文字 / 真实人脸、
视频背景板、TTS 与音频重做、HUD 重排版、任何物理 / AI / 判定 / 计分 /
输入 / phase / 灯光 cue 数值改动、预览 base 配置改动、
平台存储 / 函数 / 环境变量 / 密钥、**运行期**网络请求
（制作期生图工具的一次性下载不在此列）。

### 验证方案（写入 `tasks.md` 后按项执行）

1. `npm test` + `npm run build` + `wc -l` 全量复核。
2. Node 侧脚本核对 13 项 `CONFIG` 常量、AI 首接率 200 球、完整对打 200 场回合长度。
3. 临时 Playwright + `/opt/ms-playwright` headless shell，三视口 + relay 前缀：
   截图 `wtt-after-*`，用参数化的 `score.mjs` 与 `wtt-before-*` 同口径对比；
   读取 `renderer.info` / `scene.traverse` 诊断；断言贴图数、灯数、投影数、
   `sessionPayload()` 九字段、定格时序、倒数、赛点、说明面板、贴图 404 计数。
4. 失败态注入：屏蔽 WebGL 上下文；生成路径拦截一张 PNG 请求验证纯色降级，
   程序化兜底路径改为强制 `createVenue(scene, null)` 验证纯色分支仍可开局。
5. director 的门槛是「10 类评分无类 <2、均值 ≥2.3」，但锚点表
   `threejs-aaa-graphics-builder/references/visual-scorecard.md` 在本沙箱被
   受保护根目录读取拦截，且 `ViewImage` 视觉模型本轮实测不可用（截图无法送入判读），
   因此**不产出分类分数、不自称达到该门槛**：改以
   **可复现像素统计 + 渲染器诊断 + 10 个维度的文字复核**作证据，
   并在交付时如实说明「未按官方锚点表打分、未完成肉眼判读」。
6. 证据与偏差写回 `tasks.md`「实现期偏差与实测记录」，清理全部临时产物。

### 实现期校准与验收结论

本节写回**最终代码形态**；前述设计段中与此不一致之处，以本节与
`tasks.md` 的「实测数据 / 偏差记录」为准。

1. **D1 贴图 URL**：`generatedMaps.js` 用
   `new URL('../assets/textures/x.png', import.meta.url).href`，不是静态
   `import '*.png'`；Node 单测可 import，Vite dev 带 relay 前缀、build 指纹化。
2. **D2 模块返回形状**：`createProceduralMaps()` → `{ maps, dispose() }`；
   `createEnvironment(renderer, source)` → `{ texture, dispose() }`；
   `createGeneratedMaps(renderer)` → `{ maps, bind(scene), dispose() }`。
3. **D3 环境反射**：`scene.environment` 恒为 `null`，PMREM 结果只赋给
   `metalness ≥0.5` 的 16 个金属材质；这是软件渲染实测 1.1 → 1.7 fps 后的有界调整，
   仍符合「金属件给低强度环境反射」，`envMapIntensity = 0.24`。
4. **D4 验收驱动**：headless SwiftShader 桌面真实 rAF 约 1.1–1.7 fps，
   故状态机用固定步确定性驱动、视觉截图冻结一帧已知 `playing` 画面；
   最终三视口复核 draw calls 71–73 / triangles 8084–8164 远低于预算，
   早期全量范围 70–82 / 7116–8420，属沙箱软件渲染限制而非产品回归。
5. **D5 像素阈值**：保持本节 6 项阈值原样，不改写标准、不补噪点凑数。
   最终复核 `colorBins 198 → 258`、`flatBlockRatio 0.7228 → 0.6161`、
   `edgeDensity 0.0201 → 0.0212`、`brightRatio 0.0269`、`meanLum 33.01`、
   `centerLum 66.33 > outerLum 26.70`；其中整页
   `flatBlockRatio ≤0.60` 与 `edgeDensity ≥0.026` **未达标**
   （canvas 区域 `flatBlockRatio 0.5398` 达标，边缘指标对暗场竖向结构低估）。
   **结论：6 项中 4 项达标、2 项未达标，功能验收不因此被伪装成全绿。**
6. **D6 主观判读缺失**：最终复核再次对桌面 / 手机截图调用 `ViewImage`
   仍返回 `vision model unavailable`；官方 `visual-scorecard.md`
   锚点表受保护根目录读取被拦截。未产出官方 10 类评分，不自称达到
   director 的「均值 ≥2.3」门槛。证据改为可复现像素统计、渲染器诊断、
   R43–R47 文字复核；`artifacts/` 未另建，维持本项目两份事实源。
7. **D7 / D8 材质与结构微调**：近黑生成贴图在 `MeshBasicMaterial` 上过暗，
   仅观众层加受限 `mapBoost = 1.7`；LED 屏追加 52 实例的单个
   `InstancedMesh` 竖拼缝，不靠后期噪点；两者都不重新生成资产。
8. **D9 兜底路径**：平台生图工具本轮可用，故只编译「生成 PNG + 程序化细节」
   链路；程序化兜底未编译，但「单张 PNG 失败保留深色纯色」与
   `createVenue(scene, null)` 两个降级分支已由失败态脚本覆盖。
9. **D10 回合统计口径**：`gameplay.mjs` 用固定种子 + 预测落点有界追拍，
   场均 7.23 拍；迭代 10 `rally.mjs` 为 7.46 拍，均高于 6.9 基线，
   13 项物理 / AI 常量逐项一致，差异来自控制器口径而非玩法回归。
10. **D11 技能与证据**：实际加载的技能见本节模块边界后的记录；
    `threejs-3d-generator` / `threejs-textures` / `threejs-materials` /
    `threejs-lighting` / `threejs-qa-release` 未单独加载，
    官方分类评分也因 D6 未完成，不把「按 director 路由」写成「已完成官方打分」。
    `verification` skill 的最终重跑命令、输出与清理结论见 `tasks.md` D12。

**最终实测（以 `tasks.md` 同表为准）**：`npm test` 348/348、
`npm run build` 退出码 0 / 63 modules、源文件全部 ≤200 行、relay 三视口 78/78、
失败态 11/11、UI 回归 10/10、玩法常量 13/13、AI 首接率 0.945、
场均 7.23 拍、`renderer.info` 为 `draw calls 71–73 / triangles 8084–8164 /
textures 12 / lights 3 / castShadowLights 1`；
桌面 playing 像素 `colorBins 258 / flatBlockRatio 0.6161 / edgeDensity 0.0212 /
meanLum 33.01 / centerLum 66.33 > outerLum 26.70`，像素阈值 4/6 达标。
`sessionPayload()` 九字段、物理 / AI / 判定 / 计分 / 输入 / phase /
灯光 cue 数值、迭代 9 预览 base 配置均零改动。

---

## 迭代 12：球拍近圆化与专用材质

### 背景与现状诊断

用户反馈「球拍柄为什么有弹簧？球拍的形状是上宽下窄，是否做成圆形好些？总之希望球拍漂亮些」。

当前 `src/game/paddleModel.js` 实测：

- 手柄的“弹簧感”来自两层叠加：`handleGeometry()` 的 `LatheGeometry` 轮廓半径在
  `0.013 → 0.017 → 0.014 → 0.012 → 0.016 → 0.020 → 0.019` 之间来回变化；
  外面又叠了 4 个等距 `TorusGeometry` 深色环作为缠把带。远景下这组环就是线圈。
- `bladeShape()` 是水滴形：底部收成 `(0, -R)` 尖点，最宽处偏上，因此看起来「上宽下窄」。
  真实乒乓拍更接近**近圆形 / 短椭圆 + 短颈 + 平滑木柄**。
- 迭代 6/7 的判定是圆形：`CONFIG.paddle.bladeRadius = 0.088`、
  `hitRadius = 0.13`、`contactDepth = 0.035`。近圆拍面比水滴形更贴合玩家对
  「视觉边缘接近可击球范围」的直觉；完全数学正圆加直柄又容易像棒棒糖，故采用
  **近圆形 + 短颈**而非无颈正圆。
- 当前球拍 bounding box 为 `0.1762 × 0.2812 × 0.0413 m`，每只 8 个 mesh / 1620
  三角形；两只共 16 个 mesh，其中 8 个是环状线圈。

### 目标

1. 把球拍改成近圆真实竞技拍：圆润拍面、短颈、平滑收腰木柄、沿轮廓闭合的细边圈；
   **彻底去掉 4 个弹簧状圆环**。
2. 保持玩家青绿 / AI 冷灰的单主色体系，靠 2 张专用贴图与材质层次提升精致度，
   不引入红黑传统胶皮、文字、logo 或真实品牌。
3. 只改 3D 表现层 + 本地贴图资产：`CONFIG` 物理 / AI / 判定 / 计分 / 输入 / phase /
   灯光 cue 数值、`sessionPayload()` 九字段、既有导出与 `models.js` 门面全部不动。
4. 不新增 npm 依赖、真实光源、阴影贴图、后期处理、平台函数、环境变量、密钥、
   运行期外部网络请求；不把 `/tmp` 或模块级内存当持久化。

### 已确认决策

| 决策项 | 用户选择 / 本轮默认 |
| --- | --- |
| 拍型方向 | **近圆真实竞技拍**：略椭圆拍面 + 短颈 + 平滑木柄，不用数学正圆，不保留水滴尖底 |
| 配色材质 | **保留青绿单主色**：玩家 `0x2f9d80`、AI `0xaab3bd` 不变，只靠胶皮 / 木纹 / 边圈提升层次 |
| 实现路径 | **C：专用贴图材质方案**，不是只改几何，也不是纯程序化无新资产 |
| 贴图范围 | **平台生成 2 张 + 程序化细节**：`paddle-rubber.png` 与 `paddle-wood.png` 各 1 张；边圈、柄端盖、五层胶合板侧边仍用程序几何 / 既有 `ply` CanvasTexture |
| 生成工具 | 按 `threejs-image-generator` 优先级：平台 `mcp__media__generate_image` → CLI 内置 `ImageGen` → 程序化兜底。上一轮实测 `WaitForMcpServers({ servers: ['media'] })` 返回 `ready: true`，平台工具为对话层直连；预计 **0 积分** |
| 计费披露 | 仅当实际回退到 `ImageGen` 才产生计费，2 张合计 **10–20 积分**；首次生成前再次明确告知实际工具与是否计费，规格批准前不生成任何图片 |
| 物理边界 | `bladeRadius / hitRadius / contactDepth` 一个不动；新拍面最大可视半径仍等于 `bladeRadius` |

### 设计

#### 1. 文件边界（全部 ≤200 行）

| 文件 | 职责 |
| --- | --- |
| `src/game/paddleProfile.js`（新增） | 纯数值形状真源：`paddleOutline(steps = 48)` 返回近圆 + 短颈闭合点集，`handleProfile()` 返回单调平滑的车削半径 / 轴向点集；不 import three、不访问 DOM |
| `src/game/paddleProfile.test.js`（新增） | 纯逻辑单测：返回 48 个有限点、首尾闭合、相邻点不重复、极角序列单调；`abs(maxX - minX - 2R) ≤ 1e-6`、所有点 `hypot(x,y) ≤ R + 1e-6`、颈宽 = `0.40R`、柄形半径单调非负且最后轴向值 = `0.102` |
| `src/game/paddleModel.js` | 用 `paddleOutline()` 生成 `Shape` + `ExtrudeGeometry` 拍面、同轮廓缩小的背面、`TubeGeometry` 闭合边圈；用 `handleProfile()` 生成平滑 `LatheGeometry` 木柄；删除 4 个 `TorusGeometry` 环，只保留 1 个扁柄端盖 |
| `src/game/visual.js` | 新增 `VISUAL.paddle`（颈宽比、颈底比、边圈半径、柄端盖尺寸、胶皮 emissive、贴图 repeat）与 `VISUAL.texture.rubberRepeatX / rubberRepeatY / woodRepeatX / woodRepeatY`；`tagMaps()` 扩展第 5 个可选参数 `baseColor = 0xffffff`，旧调用行为不变 |
| `src/game/generatedMaps.js` | 首选 / `ImageGen` 路径把 `SOURCES` 从 3 项扩到 5 项；程序化兜底路径保持 3 项。仍用 `new URL('../assets/textures/x.png', import.meta.url).href`，`SRGBColorSpace` / `RepeatWrapping` / 有上限 anisotropy；`bind(scene)` / `dispose()` 逻辑不变 |
| `src/assets/textures/paddle-rubber.png`（新增） | 中性深灰绿胶皮细颗粒，可平铺，无文字 / logo / 人脸 / 高对比色块，`1024×1024` |
| `src/assets/textures/paddle-wood.png`（新增） | 深色胡桃木 / 炭化木纹与握把细纹，可平铺，无文字 / logo / 人脸，`1024×1024` |
| `openspec/changes/threejs-pong/proposal.md` / `tasks.md` | 本规格、任务、实测与偏差的唯一事实源 |

**首选 / `ImageGen` 路径不改**：`config.js`、`models.js`、`scene.js`、
`proceduralMaps.js`、`tableModel.js`、`venue.js`、`arena.js`、`PongEngine.js`、
`usePongGame.js`、`session.js`、`physics.js`、`rally.js`、全部既有 `*.test.js`、
全部 `components/*.vue`、`App.vue`、`style.css`、`stage-overlay.css`、
`index.html`、`vite.config.js`、`start-preview.sh`。
**仅程序化兜底路径例外**：允许 `proceduralMaps.js` 新增 `rubber` / `wood`
两张 CanvasTexture，且 `generatedMaps.js` 不注册对应 `SOURCES`；其余文件仍不改。

#### 2. 纯形状参数与几何

- `R = CONFIG.paddle.bladeRadius = 0.088`。
- `paddleOutline()` 生成 48 点闭合近圆轮廓，关键约束：
  - `maxX = R`、`minX = -R`、`maxY = R`、`minY = -0.96R`；
  - 短颈半宽 `0.20R = 0.0176`，颈肩 `-0.82R`，颈底 `-0.96R`；
  - 底部是圆角短颈，不是尖点；所有点满足 `hypot(x, y) ≤ R + 1e-6`；
  - 点集顺序固定、首尾闭合，供 `Shape` / `TubeGeometry` / 背面缩小片共用。
- `handleProfile()` 返回 7 组 `[radius, axial]` 点：
  `[[0.010,0],[0.011,0.012],[0.012,0.028],[0.0135,0.048],
  [0.015,0.070],[0.0165,0.090],[0.018,0.102]]`；半径单调不减、轴向单调增，
  没有忽粗忽细的波纹。木柄从颈底向下延伸 `0.102 m`。
- 新球拍总高度为 `R + 0.96R + 0.102 = 0.27448 m`，小于当前 `0.2812 m`；
  最大宽度仍为 `0.176 m`。
- 每只球拍 mesh 数从 8 降到 5：拍面、背面、闭合边圈、木柄、柄端盖。
  边圈半径 `0.0025 m`，沿 `paddleOutline()` 的 `CatmullRomCurve3` 闭合生成；
  不再出现任何 `TorusGeometry` 环。

#### 3. 材质与两张生成贴图

| 部位 | 材质 |
| --- | --- |
| 正面胶皮 | `MeshStandardMaterial`，roughness / metalness 取 `VISUAL.material.rubber`，`tagMaps(material, { map: 'rubber' }, VISUAL.paddle.rubberFallback, 1, bladeColor)`；贴图就绪后恢复玩家 / AI 原有颜色；emissive 仍用 `bladeColor`，强度 `0.42 → 0.28`，避免像灯板 |
| 背面胶皮 | 同轮廓按 `VISUAL.paddle.backScale` 缩放的深色近圆片，颜色 / roughness 取 `VISUAL.paddle.backColor` / `backRoughness`，不再用与轮廓不符的 `CircleGeometry` |
| 拍面侧边 | 继续用 `maps.ply` CanvasTexture 表现五层胶合板，颜色取 `VISUAL.paddle.plyColor`，roughness / metalness 取 `VISUAL.material.wood` |
| 边圈 | 1 条闭合 `TubeGeometry`，`rimColor` + emissive `VISUAL.paddle.rimEmissive`，roughness `VISUAL.paddle.rimRoughness` |
| 木柄 | `tagMaps(material, { map: 'wood' }, VISUAL.paddle.woodFallback)`；roughness / metalness 取 `VISUAL.material.wood`；`paddle-wood.png` 提供低调木纹，不再靠 4 个环表现缠把 |
| 柄端盖 | 1 个扁 `CylinderGeometry`，颜色 / roughness 取 `VISUAL.paddle.capColor` / `capRoughness`，半径 `capRadius`、厚 `capThickness` |

- `paddle-rubber.png`：中性灰绿细颗粒，作为 `map` 被 `bladeColor` 着色；`SRGBColorSpace`。
- `paddle-wood.png`：深色木纹，作为木柄 `map`；`SRGBColorSpace`。
- 两张贴图都用 `RepeatWrapping`；`VISUAL.texture.rubberRepeatX = 3` /
  `rubberRepeatY = 3`，`woodRepeatX = 1` / `woodRepeatY = 3`。
- `VISUAL.paddle` 固定以下值：`outlineSteps = 48`、`neckHalfRatio = 0.20`、
  `neckShoulderRatio = -0.82`、`neckBottomRatio = -0.96`、`backScale = 0.96`、
  `rimRadius = 0.0025`、`capRadius = 0.018`、`capThickness = 0.004`、
  `rubberEmissive = 0.28`、`rimEmissive = 0.35`、
  `rubberFallback = 0x182820`、`woodFallback = 0x4b3a2b`、
  `plyColor = 0xcbb08a`、`backColor = 0x20262c`、`backRoughness = 0.88`、
  `rimRoughness = 0.5`、`capColor = 0x171d23`、`capRoughness = 0.6`；
  胶皮 / 木材的 roughness 与 metalness 继续取 `VISUAL.material`，
  `visual.js` 仍是唯一视觉常量源。
- 首选 / `ImageGen` 路径的 5 张生成 PNG 源文件合计 ≤8 MB；程序化兜底路径只有既有
  3 张 PNG，同样 ≤8 MB。若单张过大，制作期一次性本地重编码后替换源文件，
  **不做运行时降采样**。颜色贴图 `SRGBColorSpace`，数据贴图保持线性。
- 贴图预算：首选 / `ImageGen` 路径为 `5 生成 + 7 程序化 + 1 PMREM + 1 阴影 = 14`；
  程序化兜底路径为 `3 生成 + 9 程序化 + 1 PMREM + 1 阴影 = 14`；
  两条路径均 `≤16`。不新增 `scene.environment`，不新增 Light，不新增 shadow map。

#### 4. 数据流、生命周期与失败处理

```text
paddleProfile.js（纯数值）
  → paddleModel.js（Shape / Extrude / Tube / Lathe）
  → scene.js 既有 buildPaddle(color, rim, maps)
  → generatedMaps.bind(scene) 按 userData.pendingMaps 异步绑定生成贴图
  → createScene.dispose() 统一释放 geometry / material / texture / PMREM
```

- `tagMaps(material, slots, fallback, boost = 1, baseColor = 0xffffff)`：
  加载前把 `material.color` 设为 `fallback`；就绪后设为 `baseColor` 并乘 `boost`。
  旧调用只传 2–4 个参数时 `baseColor` 仍为白色，行为不变。
- `generatedMaps.js` 仍顶层零 DOM 副作用；`TextureLoader.load()` 立即返回占位 Texture，
  `bind(scene)` 在加载完成后遍历材质赋值；`dispose()` 遍历 `Object.values(maps)`
  释放当前 `SOURCES` 中的贴图：首选 / `ImageGen` 路径为 5 张，程序化兜底路径为 3 张。
- 单张 PNG 加载失败：`onError` 保留深色纯色 + 中文 `console.warn`，游戏仍可开局；
  不抛异常、不进入既有 `MESSAGES.webgl` / `runtime` 覆盖层、不出现白色空板。
- 生图工具链：规格批准后才探测并调用；临时 URL 只经 writer 脚本下载一次，
  不进代码 / 规格 / 报告 / manifest；不读取 provider key。
- 程序化兜底：仅当平台工具与 `ImageGen` 都不可用时启用；不产出 2 张 PNG，
  `generatedMaps.js` 不注册对应 `SOURCES`，`proceduralMaps.js` 产出 `rubber` / `wood`
  两张同步就绪的 CanvasTexture 补齐 `maps` 键集合，并在 `tasks.md` 显式记录限制，
  **绝不静默把「没生成」伪装成成功**。
- WebGL 不可用、`PMREMGenerator` 失败、引擎错误态沿用迭代 11 的既有中文兜底，
  不新增第二套策略；`restart()` 时新 geometry 由 `disposeTree(scene)` 释放，
  当前路径的生成 PNG 由 `generated.dispose()` 释放，兜底路径的 CanvasTexture
  由 `procedural.dispose()` 释放。

#### 5. 界面、可访问性与性能

- 不改任何 `.vue` / HUD / 暗角 CSS；球拍仍由 `scene.js` 放在既有 `playerZ / aiZ`，
  触屏拖动、键盘、说明面板、AI 三档、赛点徽标、倒数与胜负界面全部不受影响。
- 仍是 3 盏真实光源 / 1 盏投影灯，背景 `#070a0e`、雾 `8/18`、相机、FOV、曝光不变。
- draw calls 目标 ≤73、triangles ≤9000、textures ≤16；删掉 8 个环后 draw calls 应下降。
- 运行期无外部网络请求；生成期临时 URL 不落入交付物；无环境变量 / 密钥 / 平台存储。

### 验收标准

- `paddleProfile.test.js` 全绿；`npm test` 全绿且用例数 >348；
  `npm run build` 退出码 0；全部 `src/game/*.js` / `*.vue` / `*.css` ≤200 行。
- `dist/index.html` 仍是根绝对 `/assets/...`；`dist/assets/` 含当前路径的指纹化 PNG
  （首选 / `ImageGen` 路径 5 张，程序化兜底路径 3 张）；
  `package-lock.json` 中 `"playwright` 引用数 0、无新增 npm 依赖。
- relay 前缀下 480×360 / 1280×900 / 390×844 三视口：当前路径的全部 PNG 均 200、无 4xx、
  无未捕获异常、无横向溢出；`renderer.info` 为 `textures ≤16 / lights 3 /
  castShadowLights 1 / draw calls ≤73 / triangles ≤9000`。
- 浏览器内两只球拍：`abs(width - 0.176) ≤ 1e-6`、无 `TorusGeometry` 环、有闭合边圈与平滑木柄；
  改前 / 改后同相机近景截图可复现；若 `ViewImage` 可用则做一次肉眼判读，
  不可用则如实记录限制，只用像素统计 + 几何断言 + 渲染器诊断。
- 失败态：首选 / `ImageGen` 路径拦截 1 张新 PNG、程序化兜底路径拦截 1 张既有 PNG
  → 深色纯色 + 中文 warn + 仍可开局；屏蔽 WebGL → 既有中文覆盖层。
- 玩法零回归：13 项 `CONFIG` 常量一致；`sessionPayload()` 九字段不变；
  AI 首接率 200 球 ≥75% 且 <100%；200 场完整对打场均 ≥6.9 拍；
  倒数 3→2→1、得分定格 180 步 / 合计 541 步、玩法说明三档、`Space` / `Shift`、
  触屏预设、迭代 5/8 灯光 cue 均不回归。
- 清理 `.verify-browser/` 全部临时产物；`git status --short` 仅剩基线交付项；
  实测数据与偏差写回 `tasks.md`，规格与实现不一致处同步回本文件。

### 范围之外

传统红黑双面胶皮、数学正圆无颈拍、保留水滴形、只删环不改拍面、
生成 3 张以上贴图、新增后期处理 / bloom / SSAO、新增真实光源或阴影贴图、
外部 3D 模型、真实品牌 / 可读文字 / 真实人脸、HUD 重排版、
任何物理 / AI / 判定 / 计分 / 输入 / phase / 灯光 cue 数值改动、
预览 base 配置改动、平台存储 / 函数 / 环境变量 / 密钥、运行期网络请求。

### 验证方案

1. 写入 `tasks.md` 后按项执行：`npm test` + `npm run build` + `wc -l` +
   生成 PNG 体积 / 指纹化核对。
2. Node 侧跑 13 项 `CONFIG` 常量、200 球 AI 首接率、200 场完整对打回合长度。
3. 临时 Playwright + `/opt/ms-playwright` headless shell，relay 前缀三视口：
   同相机近景截图、当前路径全部 PNG 的 200 计数、`renderer.info` / `scene.traverse`
   诊断、两只球拍 bounding box 与 `TorusGeometry` 数量、倒数 / 定格 / 赛点 /
   说明面板 / 触屏预设回归、控制台异常与 4xx 收集。
4. 失败态注入：屏蔽 WebGL；首选 / `ImageGen` 路径拦截 1 张新 PNG，
   程序化兜底路径拦截 1 张既有 PNG，验证纯色降级。
5. 像素统计与近景截图判读；`ViewImage` 不可用时明确记录「未完成主观视觉判读」，
   不自称达到官方视觉评分门槛。
6. 证据与偏差写回 `tasks.md`，清理全部临时产物，刷新预览并复核 relay 200。

### 实现期校准与验收结论

- **实现路径**：`WaitForMcpServers({ servers: ['media'] })` 返回 `ready: true`，
  实际使用平台 `mcp__media__generate_image` 生成 2 张 `1024×1024` PNG，
  **未回退 `ImageGen`、0 积分**，未启用程序化兜底；`proceduralMaps.js` 零改动。
  5 张生成 PNG 合计 `7,766,432 B ≈ 7.41 MB ≤ 8 MB`，远程临时 URL 未落入任何交付物。
- **几何实测**（与规格 §2 对齐）：单拍 5 mesh、`TorusGeometry 0`、
  `TubeGeometry 1`、`LatheGeometry 1`、939 三角形、宽度 `0.1760000`
  （`abs(w−0.176) = 9.5e-10`）、**高度 `0.27648 m`**、深度 `0.036 m`。
  §2 写的 `0.27448 m` 只算到木柄末端；柄端盖再向下多出半个厚度 `0.002 m`，
  故实际为 `0.27648 m`，仍小于改前 `0.28118 m`。此处的规格数字以本结论为准。
- **边圈内缩**：闭合 `CatmullRomCurve3` 在圆弧段会外鼓约 0.1–0.4 mm。
  为了让「最大可视半径仍等于 `bladeRadius`」这条硬约束成立，实现把曲线点按
  `(R − 2·rimRadius)/R` 内缩后再建 `TubeGeometry`，并把边圈放在正面
  `z = 0.006`（一道细窄压边）；整拍宽度因此严格由拍面决定。§2 / §3 的
  「沿 `paddleOutline()` 闭合生成」按此内缩版本理解。
- **签名**：`buildPaddle` 保留三参数 `(bladeColor, rimColor, maps)`，去掉冗余的
  `maps = null` 默认值，使 `buildPaddle.length === 3` 达标；`maps?.ply` 兼容
  `undefined`，行为与改前一致。§3「签名不变」按三参数不变理解。
- **渲染预算**：`textures 14 / draw calls 64 / triangles 6722 / lights 3 /
  castShadowLights 1`（改前 `12 / 70 / 8084 / 3 / 1`），全部在 §5 上限内。
- **验收**：`npm test 355/355`、`npm run build` 退出码 0、全部源文件 ≤200 行、
  三视口 + UI + 失败态浏览器 **101 PASS / 0 FAIL**；玩法回归
  **13/13 常量、AI 首接 189/200 = 0.945、场均 7.23 拍**，与迭代 11 逐位相同。
  完整数据、前后像素统计与偏差 D1–D5 见 `tasks.md`「实现期偏差与实测记录」。
- **未完成项**：`ViewImage` 对前后近景截图均不可用，**未完成主观视觉判读**；
  本轮不声称达到官方视觉评分门槛，结论只基于几何断言、渲染器诊断、像素统计与 DOM 断言。
  程序化兜底分支本轮未触发、未实现、未验证，不宣称已覆盖。

---

## 迭代 13：环境提亮与低饱和辅助色（独立小迭代）

> 本轮不复杂（无持久化 / 多页面 / 外部接口 / 多用户权限），按 `plan-writing`
> 规则**不另建 `design.md`**；继续以 `proposal.md` + `tasks.md` 为唯一事实源。
> 任务清单批准前不改产品代码、不调用生图工具、不生成图片。

### 1. 问题与量化目标

用户反馈：「环境整体背景有点太暗了，能否让环境稍微明亮多彩一点，但又不会对游戏造成干扰」。
原句「但又只会对游戏造成干扰」按笔误理解为「但**不**会对游戏造成干扰」，已在澄清中确认。

暗的来源共 6 处叠加：`scene.background` 与雾、地面、围挡 / 观众席 / 光池、
极低的 `ambient 0.16` / `fill 0.12`、5 张近黑底生成贴图、`stage-overlay.css` 暗角。

| 指标 | 当前（迭代 11/12 实测或本次核算） | 目标 |
| --- | --- | --- |
| `COLORS.background` | `0x070a0e`，sRGB 均值 10.3，相对亮度 0.00294 | sRGB 均值 30~40 |
| `COLORS.floor` | `0x0c1117`，17.3 | 28~36 |
| 围挡 / 观众席 / 光池 | `0x0a0e13` / `0x0c1118` / `0x0e151c`，14~21 | 28~44 |
| 全页 `meanLum`（桌面 1280×900） | 33.01（迭代 11 口径）/ 32.6205（本轮同脚本重测） | 初稿目标 **42~50（+30~50%）** |
| `brightRatio` | 0.0365（迭代 11 口径）/ 0.04149（本轮重测） | 初稿目标 **0.06~0.09** |
| 球 / 背景对比 | 17.89:1 | **≥ 12:1** |
| CSS 暗角边缘 alpha | 0.42 | 0.22 |

> 实现期校准：初稿的「全页」两条绝对阈值建立在一个错误假设上 —— 页面外壳
> （`style.css` / HUD / 记分条）按 §2 明确不改，而 1280×900 下 3D 舞台只占整页
> **58.37%** 面积，未改的页面外壳会稀释全页统计。本轮**不改写阈值、也不靠继续抬亮
> 画面去凑数**，而是把 3D 舞台矩形 ROI 作为本轮范围的验收口径，并把全页未达标如实记为
> 偏差 D1。背景目标区间、暗角目标值与 §5 数值以文末「实现期校准与验收结论」为准。

### 2. 已确认边界

| 项 | 决定 |
| --- | --- |
| 范围 | **只改 3D 赛场环境**：背景 / 雾、地面、围挡、观众席、光池、LED 广告带、散景、灯光配色层。页面外壳（`style.css` 的 `--bg` / `--surface`）、HUD、记分条、说明面板、按钮、页脚保持原样 |
| CSS 暗角 | 视为「3D 画面呈现层」：`stage-overlay.css` 只覆盖 canvas、`pointer-events: none`、不盖 HUD，故纳入本轮；不改任何页面外壳规则 |
| 色彩 | **青绿 `0x7ee2c0` 仍是唯一主色**；蓝紫 / 暖金只作为远景低饱和辅助层，球台中央保持中性深灰。遵守「单主色 + 中性灰阶」规范，不启用第二主色 |
| 提亮幅度 | **温和 +30~50%**（推荐档）；不做 +70~100% 的明显提亮 |
| 「不干扰」 | 指读球：球与球台的可辨识度不下降，且 playing 期间不能有动态亮度变化 |

### 3. 三条硬约束

1. **playing 期间灯光目标向量恒定**：`CONFIG.arena.light.{READY,PLAYING,GAMEOVER}` 的六个数值字段一字不改；`arenaState.js` / `arena.js` / `PongEngine.js` 不改；`toneMappingExposure = 1.15` 不改；**不新增任何真实光源**（`arena.test.js` 的「0 盏新增光源」断言必须继续通过）。不靠提高 `ambient` / `fill` / 曝光来凑亮度。
2. **球台中央不新增高亮或高对比彩色元素**：球、球台、球拍、网、白色边线的材质与颜色一律不改；提亮只发生在外围与远景（围挡、观众席、地面边缘、远端视频墙、散景、暗角）。冻结同一 `playing` 帧对比时，中央 ROI 平均亮度相对迭代 12 变化 **≤ 10%**。
3. **`ledColor` 与 cue 通路不变**：`CONFIG.arena.ledColor` 保持 `0x7ee2c0`（`arena.test.js` 依此定位 LED 材质）；`tints` 四色不改；新增远景层**完全不接入** `createArena` 的 cue / tint 驱动，因此不会随时间或比分波动。

### 4. 方案选择

| 方案 | 做法 | 优点 | 代价 / 风险 | 结论 |
| --- | --- | --- | --- | --- |
| **A 常量 + 程序化远景层（推荐）** | 改 5 个颜色常量与雾距；新增 1 张程序化冷→暖渐变 `CanvasTexture`；散景改双色逐点着色；减轻暗角；`crowd` 贴图亮度增益 1.7→**2.2**、`floor` 增益 **1.5** | 0 新生成 PNG、0 新依赖、0 新光源；全部可纯逻辑单测；预算仅 +2 draw calls / +1 texture | 「多彩」靠层次而非大色块，需要手工调色值 | **采用** |
| B 重做生成贴图 | 用平台 `mcp__media__generate_image` 重做 `led-board` / `crowd-bokeh` / `court-floor` 三张更亮更多彩的 PNG | 表面层次最丰富 | +3~4 MB、5→8 张 PNG 逼近 8 MB 预算；需生图调用；近黑底约束被打破后要重新校验读球 | 不采用 |
| C 调灯光 / 曝光 | 提高 `ambient` / `fill` 或 `toneMappingExposure`，加彩色补光 | 改动最小 | 会同时抬亮球台与球，与「playing 目标恒定」冲突，压低网 / 球对比，可玩性风险最高 | 不采用 |

### 5. 配色与数据流

`config.js` **只改下表 5 个颜色字段**，物理 / AI / 判定 / 计分 / 灯光 cue 数值零改动：

| 字段 | 改前 | 改后 | 用途 |
| --- | --- | --- | --- |
| `COLORS.background` | `0x070a0e` | `0x1a2735` | `scene.background` + `Fog` 颜色 |
| `COLORS.floor` | `0x0c1117` | `0x17202b` | 地面材质 |
| `arena.barrierColor` | `0x0a0e13` | `0x17212c` | 四面围挡 |
| `arena.audienceColor` | `0x0c1118` | `0x222a33` | 近景座席剪影 |
| `arena.poolColor` | `0x0e151c` | `0x222c34` | 地面光池 |

雾改为 `new THREE.Fog(COLORS.background, 8, 22)`（`far 18→22`，让远景不更早塌进背景色）。

辅助色全部进 `visual.js` 的 `VISUAL.atmosphere`（纯数据，不 import three、不碰 DOM）：

| 键 | 值 | 说明 |
| --- | --- | --- |
| `coolWash` / `warmWash` | `0x445260` / `0x6a5a48` | 远景洗墙渐变两端，低饱和蓝灰 / 暖褐 |
| `washAlpha` | `0.34` | 洗墙平面不透明度 |
| `bokehCool` / `bokehWarm` | `0xa9c2d6` / `0xdcc19e` | 散景逐点双色 |
| `bokehWarmRatio` | `0.38` | 暖色点占比，按索引确定性交错，不用 `Math.random` |
| `floorLineColor` / `floorLineAlpha` | `0xcbb893` / `0.12` | 地面暖金细线（替换原青绿细线） |
| `crowdBoost` | `2.2` | `crowd` 贴图亮度增益（旧 1.7，单测上限 2.2） |
| `floorBoost` | `1.5` | 地面生成贴图的亮度增益；让 `COLORS.floor` 真正接线（见下） |
| `equirectCool` / `equirectWarm` | `0x2c3741` / `0x3b352d` | 环境反射渐变两端，只作用于 `metalness ≥ 0.5` 金属件 |
| `crowdFallback` | `0x232c34` | `crowd` 贴图未就绪时的纯色占位（旧 `0x10171d`） |
| `fogNear` / `fogFar` | `8` / `22` | 雾距单一真源 |

颜色统一以数值 hex 存储；`proceduralMaps.js` 需要 CSS 颜色字符串时用
`cssHex(hex)` 转换，避免同一色值在 JS 与 CSS 里各写一份。
「低饱和」的可测定义：sRGB 三通道满足 `(max−min)/max ≤ 0.35`。上表全部辅助色满足。

`VISUAL.vignette` 更新为 `{ edgeAlpha: 0.22, topAlpha: 0.12 }`（旧 `0.42 / 0.1`）；
`stage-overlay.css` 与之保持同值，边缘 tint 由 `rgba(4,7,11,…)` 放宽为 `rgba(8,13,20,…)`。

模块职责与数据流：

```
config.js / visual.js（纯数据）
  → scene.js（背景 / 雾 / 地面 / 灯光 / 球台 / 球拍 / 球）
  → createVenue() → createAtmosphere(maps)（远景洗墙 + 双色散景）
  → createArena()（cue 驱动 LED / 光锥 / 光池，handle 形状不变）
  → generatedMaps.bind(scene)（异步贴图）
```

- **`src/game/palette.js`（新增，纯逻辑，≤200 行）**：`relativeLuminance(hex)`、
  `contrastRatio(a, b)`、`chromaRatio(hex)`、`cssHex(hex)`。不 import three、不访问 DOM。
- **`src/game/palette.test.js`（新增）**：只断言**设计不变量**，不写「等于当前常量」的
  实现式断言 —— 新背景相对亮度 ≥ 旧背景 `0x070a0e` 的 1.8 倍且 ≤ 0.02；
  `contrastRatio(COLORS.ball, COLORS.background) ≥ 12`；5 个环境色均亮于改前；
  `VISUAL.atmosphere` 中全部色值（含 `crowdFallback` 与两处 equirect 停靠点）
  `chromaRatio ≤ 0.35`；`crowdBoost ∈ [1.7, 2.2]`；
  `vignette.edgeAlpha < 0.42`；`fogNear === 8` 且 `fogFar > 18`。
  改暗背景、调高彩度或恢复暗角都会失败。
- **`src/game/venueAtmosphere.js`（新增，three 适配，≤200 行）**：
  `createAtmosphere(maps)` 返回 `{ group, dispose }`。把 `bokehPoints()` 从 `venue.js`
  迁入并加逐点 `color` 属性（`PointsMaterial.vertexColors = true`，仍为单个
  `Points`、单个 draw call）；构建 1 张 `PlaneGeometry(11.5, 3.4)` 远端洗墙平面，
  用 `maps.wash`，`position (0, 2.15, -6.1)`（在既有 LED 视频墙 `z = -6.2` **之前**
  0.1 m —— 墙是不透明的，放在后面会被完全遮住，规格初稿的 `z = -6.35` 实测不可见），
  `MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false })`。
  **`createAtmosphere(null)` 必须合法**：`arena.test.js` 调用 `createArena(scene, lights)`
  不传 `maps`，所有贴图槽一律 `maps?.xxx ?? null` 兜底，不抛异常、不新增光源。
- **`src/game/proceduralMaps.js`**：新增 `colorWash()` `CanvasTexture`（256×128，
  `cool → neutral → warm` 线性渐变，`srgb: true`）并注册进 `maps`；
  `equirectGradient()` 的两个暗色停靠点换成 `equirectCool` / `equirectWarm`。
  仍不设全局 `scene.environment`。
- **`src/game/venue.js`**：删除 `bokehPoints()`（约 14 行），改为
  `const atmosphere = createAtmosphere(maps)` + `group.add(atmosphere.group)`，
  在 `handle.dispose()` 内调用 `atmosphere.dispose()`；`crowd` 的 `tagMaps` fallback
  改用 `VISUAL.atmosphere.crowdFallback`（旧 `0x10171d`）、boost `1.7 → crowdBoost`；
  `floorLine` 改用 `floorLineColor / floorLineAlpha`。`handle` 仍严格是
  `{ led, cone, pool, tintMaterials, group, dispose }`，不新增字段。
  文件行数保持 ≤200（当前 186 行）。
- **`src/game/scene.js`**：改 `Fog` 一行（`fogNear / fogFar` 取 `VISUAL.atmosphere`），
  并给地面的 `tagMaps(...)` 显式传入 `COLORS.floor` 与 `floorBoost`。这修掉了迭代 11 起
  就存在的既有缺陷：`tagMaps()` 的默认 fallback `0x10171d` 会覆盖材质的 `color`，
  导致 `COLORS.floor` 此前**根本没有生效**；不接线的话单改地板色毫无效果。
- **`src/App.vue`**：`.stage-wrap` 的 CSS 底色同步为 `#1a2735`（仅 3D 舞台容器，
  属本轮范围；页面外壳 `style.css` 仍零改动）。
- **`src/game/visual.js`** / **`src/game/config.js`** / **`src/stage-overlay.css`**：
  按上表只改常量与暗角，不动任何运行时逻辑。

实现期还有两处与初稿不同的校准，均写入 §5 表格：`washAlpha 0.16 → 0.34`、
`crowdBoost 2.0 → 2.2`，以及洗墙平面由 `9.4×2.4 @ z=-6.35` 改为
`11.5×3.4 @ (0, 2.15, -6.1)`。原因见文末结论 D2 / D3。

### 6. 「不干扰」验收标准

| 保证 | 验证方式 | 阈值 |
| --- | --- | --- |
| 球仍读得清 | `contrastRatio(COLORS.ball, COLORS.background)` | ≥ 12:1 |
| 中央不被提亮冲掉 | 冻结同一 `playing` 帧，中央 ROI（画面中心 40%×40%）前后 `meanLum` | 变化 ≤ 10% |
| 外围确实变亮 | 同帧外围环形 ROI 前后 `meanLum` | 初稿目标提升 ≥ 30%；实测全页 +15.4% / 舞台 ROI +22.7%，见 D1 |
| playing 亮度恒定 | `arenaState.test.js` 既有断言 + `CONFIG.arena.light` 与迭代 12 值深度比对 | 全等（实测全等） |
| 3D 舞台提亮 | **舞台矩形 ROI** 像素统计（本轮实际验收口径） | `meanLum 36.051 → 42.468`、`brightRatio 0.0517 → 0.06928` |
| 全页提亮（初稿口径，未采纳） | 全页像素统计 | 初稿 `meanLum 42~50`、`brightRatio 0.06~0.09`；实测 `36.3661 / 0.05175`，记为 D1 |
| 多彩出现 | `colorBins` 统计 | 桌面全页 `239 → 250`、舞台 `207 → 219`、移动 `221 → 223` PASS；小视口 `179 → 177` 记为 D4 |
| 渲染预算 | `renderer.info` | draw calls ≤70、textures ≤16、triangles ≤7500、lights 3、shadowLights 1 |
| 无新增资源 | `dist/assets/*.png` 计数 | 仍为 5 张 |
| 源文件行数 | `wc -l src/**/*.{js,vue,css}` | 全部 ≤200 |

实现期确实按 `washAlpha` → `crowdBoost` → 背景 / 地面色值的顺序微调了三轮
（细节见文末结论）。第三轮后舞台 ROI `meanLum` 已达 42.468，但全页仍只有 36.3661；
继续抬亮会与「稍微明亮」「不干扰读球」冲突，故停止并如实记录偏差，**不改写阈值**。
全程**禁止**通过提高 `ambient` / `fill` / 曝光、修改球台或球材质、或补噪点来凑数，实现未违反。

### 7. 验证与交付

- `npm test` 实测 **365/365**（迭代 12 的 355 条 + 新 `palette.test.js` 10 条）、
  `npm run build` 退出码 0、`dist/assets/` 仍 **5 张 PNG**、全部源文件 ≤200 行
  （最长 `PongEngine.js` / `ScoreBoard.vue` / `App.vue` 均 199 行）。
- 浏览器三视口 `480×360` / `1280×900` / `390×844`：无 console error / 网络失败、
  canvas 非空白；玩法说明入口、AI 档位、得分定格、错误态 / 重试、relay 前缀 200 全回归。
  实测 UI / 状态机 **63 PASS / 0 FAIL**、失败态注入 **7 PASS / 0 FAIL**、最终验收闸
  **36 PASS / 0 FAIL**（三视口无横向溢出、canvas 非空白、连点 / 键盘焦点等异常、
  移动端 `prefers-reduced-motion: reduce`）。
- 冻结 `playing` 帧的前后像素统计（中心 / 外围 ROI）、渲染器诊断、玩法回归
  **13/13 常量、AI 首接 187/200 = 0.935、场均 7.07 拍**。这三个数来自本轮新建的
  `.verify-browser/gameplay.mjs`（固定种子 `20261117`），与迭代 12 记录用的旧脚本
  `189/200 = 0.945 / 7.23` **口径不同**；物理 / AI / 判定模块本轮零改动，13 项常量与
  迭代 12 逐位全等，故不视为玩法回归，详见 D5。
- `ViewImage` 实测仍不可用，已明确写「未完成主观视觉判读」，不自称达到视觉评分门槛。
- 证据与偏差写回 `tasks.md`，清理 `.verify-browser/`，刷新预览并复核 relay 200
  （`index.html`、`src/main.js`、5 张 PNG 全 200，入口资源 URL 带 relay 前缀）；
  刷新后又跑了无临时脚本的浏览器复核闸 **18 PASS / 0 FAIL**。

### 8. 明确不做

- 不改页面外壳 `style.css`、HUD、记分条、说明面板、按钮、页脚。
- 不改物理 / AI / 判定 / 计分 / UI / `sessionPayload()` 九字段。
- 不调用生图工具、不新增 PNG、不新增 npm 依赖、不新增后端 / 函数 / 存储 / 环境变量。
- 不新增真实光源、不改 `toneMappingExposure`、不设全局 `scene.environment`。
- 不新增 phase、不改 `pointPause`、不改 `arena.light` 任何数值。

### 实现期校准与验收结论

**实现路径**：严格采用方案 A，**0 次生图调用、0 张新 PNG、0 个新 npm 依赖、0 个环境变量**；
5 张生成贴图沿用迭代 11/12 产物，`dist/assets/*.png` 仍为 5 张。新增
`src/game/palette.js`（纯逻辑）与 `src/game/venueAtmosphere.js`（three 适配）两个模块，
`venue.js` 内迁入并删除原 `bokehPoints()`。`createAtmosphere(null)` 实测 2 个子节点
（`Points`、`Mesh`）、`vertexColors === true`、`wash` 贴图为 `null`、`dispose()` 幂等。

**三轮视觉校准**（都只动本轮允许的外围 / 远景常量）：

1. 首轮按 §5 写入后桌面全页 `meanLum 34.7361`，远低于初稿 42~50。
2. 次轮把 `COLORS.background` 由 `0x121b25` 提到 **`0x1a2735`**（最终值），
   新增 `floorBoost 1.5`、`washAlpha 0.16→0.26`、`crowdBoost 2.0→2.2`，
   并同步 `App.vue` 的 `.stage-wrap` 底色。
3. 三轮把 `washAlpha 0.26→0.34`、`vignette.edgeAlpha 0.30→0.22`，
   洗墙平面放大并前移。最终常量表以上文 §5 为准。

**最终实测**（`.verify-browser/env-capture.mjs` 冻结同一 `playing` 帧；桌面 1280×900）：

| 指标 | 改前 | 改后 | 判定 |
| --- | --- | --- | --- |
| 全页 `meanLum` | 32.6205 | 36.3661 | +11.5%，未达初稿 42~50（D1） |
| 全页 `brightRatio` | 0.04149 | 0.05175 | +24.7%，未达初稿 0.06~0.09（D1） |
| 全页 `darkRatio` | 0.19366 | 0.09255 | −52.2%，暗部明显减少 |
| 全页 `colorBins` | 239 | 250 | PASS |
| 全页中心 ROI `meanLum` | 63.9867 | 65.8146 | **+2.86% ≤10% PASS**（读球区未被冲掉） |
| 全页外围 ROI `meanLum` | 26.6460 | 30.7568 | +15.4%，未达初稿 +30%（D1） |
| **舞台 ROI `meanLum`** | 36.051 | **42.468** | **+17.8%，落在「温和提亮」档** |
| **舞台 ROI `brightRatio`** | 0.05170 | **0.06928** | **落在初稿 0.06~0.09 内 PASS** |
| 舞台 `darkRatio` | 0.33178 | 0.15856 | −52.2% |
| 舞台 `colorBins` | 207 | 219 | PASS |
| 舞台中心 / 外围 ROI | 57.993 / 31.850 | 60.098 / 39.092 | +3.6% / +22.7% |
| 小视口 `meanLum` / `brightRatio` | 38.308 / 0.05747 | 41.4113 / 0.06606 | 亮度 PASS，`colorBins 179→177`（D4） |
| 移动视口 `meanLum` / `brightRatio` | 42.0997 / 0.07992 | 43.4951 / 0.08128 | 亮度与 `colorBins 221→223` PASS |

舞台 ROI 为 1280×900 下实测的 `rect(74, 109, 1132, 594)`，占整页 **58.37%**；
其余 41.63% 是按 §2 明确不改的页面外壳，这是全页统计被稀释的原因。

**常量与渲染诊断**：`COLORS.background = 0x1a2735`（sRGB 均值 39.33，
相对亮度 `0.01928`，为旧 `0x070a0e` 的 **6.56 倍**，仍满足单测「≤0.02 暗场」）；
球 / 背景对比实测 **13.67:1 ≥ 12:1 PASS**；8 个辅助色彩度 `0.210~0.327 ≤ 0.35` 全部 PASS。
渲染器 `draw calls 66→68`、`textures 14→15`、`triangles 6802→6806`、
`lights 3`、`shadowLights 1`、`fogFar 18→22`、`exposure 1.15` 不变，全在 §6 预算内；
`console.error 0`、failed requests `0`。

**硬约束复核**：`CONFIG.arena.light`（READY / PLAYING / GAMEOVER 各 6 字段）、
`ledColor === 0x7ee2c0`、`tints` 四色、`toneMappingExposure === 1.15` 与迭代 12 深度比对全等；
`ambient ≈ 0.16` / `key ≈ 3.4` 在冻结帧里与改前一致。三个新增 / 改动模块
（`venueAtmosphere.js` / `venue.js` / `proceduralMaps.js`）内
`Math.random(`、`new THREE.*Light`、`scene.environment =` 扫描 **0 命中**；
`scene.js` 保留的 3 盏灯是迭代 5 起就有的既有光源，本轮未新增。

**验证汇总**：`npm test 365/365`；`npm run build` 退出码 0（three.js 分块 >500 kB 为既有
非阻断警告）；`palette.test.js 10/10`、`arena.test.js 9/9`；负向断言（旧背景代入亮度不变量、
纯红代入彩度不变量、同色代入对比度）均按预期判 FAIL，证明不是「实现即断言」；
浏览器 UI / 状态机 **63 PASS / 0 FAIL**，失败态注入 **7 PASS / 0 FAIL**
（`crowd-bokeh.png` 被拦截时保留 `232c34` 纯色占位、无错误覆盖层、无未捕获异常），
最终验收闸 **36 PASS / 0 FAIL**（三视口布局无横向溢出、canvas 非空白、
连点说明 / 连点开始无副作用、键盘焦点可见、移动端 reduced-motion）；
relay 前缀下 `index.html`、`src/main.js` 与 5 张 PNG 均 200；全部源文件 ≤200 行；
`grep` 硬编码凭据 / 远程 URL 扫描 0 命中。

**偏差记录**：

- **D1（全页亮度阈值未达）**：初稿 `meanLum 42~50` / `brightRatio 0.06~0.09` /
  外围 +30% 三条绝对阈值在桌面全页口径下未达。按范围边界，页面外壳不许改，
  而它稀释了 41.63% 的像素；继续抬亮 3D 舞台会违背「稍微明亮」与「不干扰读球」。
  故保留阈值原样、不改写、不凑数，改用舞台 ROI 作为本轮实际验收口径并在此显式记录。
- **D2（洗墙平面位置）**：初稿 `9.4×2.4 @ z=-6.35` 位于不透明 LED 视频墙
  `z=-6.2` **之后**，实测完全不可见。最终改为 `11.5×3.4 @ (0, 2.15, -6.1)`，
  置于墙前 0.1 m；同时把 `washAlpha` 提到 `0.34` 才有可见的冷暖层次。
- **D3（地面色此前未生效）**：`tagMaps()` 的默认 fallback `0x10171d` 会覆盖材质 `color`，
  使迭代 11 以来的 `COLORS.floor` 形同虚设。本轮在 `scene.js` 显式传入
  `COLORS.floor` 与 `floorBoost` 才真正接线；这是修既有缺陷，不是引入新行为。
- **D4（小视口 `colorBins` 微降）**：`480×360` 下 `179 → 177`，比迭代 12 近景基线 178
  少 1 格（−1.1%）。原因是远景散景在该视口下几乎不可见、低饱和色被量化合并；
  桌面 / 移动 / 舞台 ROI 的 `colorBins` 均上升，故不视为「多彩」目标失败，如实记录。
- **D5（玩法回归数值口径不同）**：本轮重写了 `.verify-browser/gameplay.mjs`
  （固定种子 `20261117`），实测 `13/13 常量、AI 首接 187/200 = 0.935、
  186/200 场有回击、总 1414 拍、场均 7.07 拍`，与旧脚本 `189/200 = 0.945 / 7.23`
  不同。物理 / AI / 判定 / 计分模块本轮**零改动**，13 项常量逐位全等，
  差异只来自脚本种子与控制器口径，不视为玩法回归。
- **D6（主观判读未完成）**：`ViewImage` 对 `env-after-desktop.png` 仍返回
  `vision model unavailable`，**未完成主观视觉判读**，本轮不声称达到任何视觉评分门槛；
  结论只基于常量断言、渲染器诊断、像素统计与 DOM 断言。

---

## 迭代 14：环境色与球台色错开 + 整体轻快化（独立小迭代）

> 本轮不复杂（无持久化 / 多页面 / 外部接口 / 多用户权限），按 `plan-writing`
> 规则**不另建 `design.md`**；继续以 `proposal.md` + `tasks.md` 为唯一事实源。
> 任务清单批准前不改产品代码、不调用生图工具、不生成图片。
> 设计分节已于对话中获用户「通过」确认，本文件是其书面化版本。

### 1. 问题与量化目标

用户反馈：「感觉环境色与球台色错开会不会好点？现在整体感觉背景暗，压抑，
希望整个环境更轻快些」。

量化诊断（迭代 13 收尾态，sRGB 数值计算）：

| 现象 | 实测 | 说明 |
| --- | --- | --- |
| 球台 / 背景对比 | **2.38:1** | 明暗几乎贴在一起，视觉上糊成一团深色 |
| 球台 / 背景色相差 | 44.0°（167° vs 211°） | 色相本就不同，但两者都是深冷色，差异被低明度吃掉 |
| 环境自身彩度 | `0.333~0.509` | 环境也是「带颜色的深蓝」，不是中性背景 |
| 球台彩度 | `0.738` | 唯一高彩度色块，但被同样深的环境淹没 |
| 页面外壳 `--bg` | `#15181d`，sRGB 均值 24.7，相对亮度 `0.00901` | 比 3D 背景 `0x1a2735`（`0.01928`）**还暗**，只有它的 47% |
| 桌面全页 `meanLum` | `36.3661` | 迭代 13 只抬亮 3D 舞台，外壳占 41.63% 像素，整体仍压抑 |

目标（全部按常量计算，不依赖主观判读）：

| 指标 | 改前 | 目标 |
| --- | --- | --- |
| `COLORS.background` 相对亮度 | `0.01928` | `0.0813`（**4.2×**） |
| 页面 `--bg` 相对亮度 | `0.00901` | `0.0421`（**4.7×**） |
| 环境最大彩度 | `0.509` | **≤ 0.29** |
| 球台彩度 − 环境最大彩度 | `0.229` | **≥ 0.35**（实测 `0.454`） |
| `srgbMean(background) − srgbMean(table)` | `-35.7` | **> +5**（环境略亮于球台） |
| 桌面全页 `meanLum` | `36.3661` | 期望 `55~70`，硬下限 **≥ 50** |
| 3D 舞台 ROI `meanLum` | `42.468` | **≥ 52** |
| 全页 `darkRatio` | `0.09255` | **≤ 0.05** |

### 2. 已确认边界

| 项 | 决定 |
| --- | --- |
| 「错开」的定义 | 环境（背景 / 雾 / 地面 / 围挡 / 观众席 / 光池 / 页面外壳）与球台在**彩度 + 明度 + 色相**三重拉开；球台保持 `0x1c6b5a` 深青绿**一字不改**，成为画面里唯一饱和且最深的色块。环境改为**中明度、低彩度的中性浅灰蓝** |
| 范围（重要变化） | **放开迭代 13 的「页面外壳不许改」**：`style.css` 根变量、`App.vue` 的 `.stage-wrap` 底色、`stage-overlay.css` 暗角均纳入本轮，因为外壳正是压抑感主因。HUD / 记分条 / 说明面板的**结构与文案**不改，只改配色变量 |
| 主色 | 青绿 `0x7ee2c0` 仍是**唯一主色**；`--accent` 继续等于球台色 `0x1c6b5a`（把 UI 与球台绑定）。环境只用中性灰阶 + 低饱和冷暖辅助层，不引入第二主色，遵守「单主色 + 中性灰阶」 |
| 球台与球 | 球、球台、球台边线、网、白线、球拍的材质与颜色**一律不动**；`COLORS.table` / `tableEdge` / `line` / `net` / `ball` / `playerBlade` 等零改动 |
| 不干扰 | 白球是 `0xf5f3ee`，环境越亮越不显眼。故 3D 背景有**硬上限** `relativeLuminance ≤ 0.09`；远端视频墙与观众席生成贴图保留较深基调，作为白球的暗背衬；「轻快」主要来自页面外壳、地面外围、围挡与减轻暗角 |

### 3. 硬约束

1. **playing 灯光向量恒定**：`CONFIG.arena.light` 三档 18 个数值、`ledColor === 0x7ee2c0`、
   `tints` 四色、`toneMappingExposure === 1.15` 与迭代 12/13 **深度全等**；
   `arenaState.js` / `arena.js` / `PongEngine.js` 零改动；不新增任何真实光源。
   不靠提高 `ambient` / `fill` / 曝光凑亮度。
2. **玩法零改动**：物理 / AI / 判定 / 计分 / UI 结构 / `sessionPayload()` 九字段 /
   `pointPause` / phase 一律不动；`createVenue()` 的 `handle` 仍是六字段；
   `createAtmosphere(null)` 必须继续合法。
3. **资源与预算**：0 生图调用、0 新 PNG、0 新 npm 依赖、0 后端 / 函数 / 存储 /
   环境变量；`dist/assets/*.png` 仍 5 张；渲染预算不劣于迭代 13
   （draw calls ≤70、textures ≤16、triangles ≤7500、lights 3、shadowLights 1）。
4. **全部源文件 ≤200 行**；纯逻辑模块不 import three、不碰 DOM。

### 4. 方案选择

| 方案 | 做法 | 优点 | 代价 / 风险 | 结论 |
| --- | --- | --- | --- | --- |
| **A 分层提亮 + 中性化（推荐）** | 改 5 个 3D 环境色 + 7 个页面 CSS 变量 + `VISUAL.atmosphere` 远景色 / 暗角；给远景洗墙换浅色；球台与球全不动 | 全是常量，可纯逻辑单测；0 新资源；不碰 cue / 灯光向量；渲染预算不变 | 提亮幅度受「白球可读」上限约束，3D 背景封顶在 `relLum ≤0.09`；远端视频墙仍偏深 | **采用** |
| B 重做生成贴图 | 用平台生图工具重做 5 张更亮的 PNG | 表面层次最丰富 | +3~4 MB、逼近 8 MB 预算；近黑底被打破后要重校验读球；需生图调用 | 不采用 |
| C 提灯光 / 曝光 | 抬 `ambient` / `fill` / `toneMappingExposure` | 改动最小 | 同时抬亮球台与球，破坏 playing 恒定、压低网 / 球对比，与 §3.1 直接冲突 | 不采用 |

### 5. 配色与数据流

**`config.js` 只改 5 个颜色字段**（球台 / 球 / 线 / 网 / 拍面 / 灯光 cue 零改动）：

| 字段 | 改前 | 改后 | sRGB 均值 | 彩度 |
| --- | --- | --- | --- | --- |
| `COLORS.background` | `0x1a2735` | `0x45525f` | 82.0 | 0.274 |
| `COLORS.floor` | `0x17202b` | `0x3e4a56` | 74.0 | 0.279 |
| `arena.barrierColor` | `0x17212c` | `0x3f4c58` | 75.7 | 0.284 |
| `arena.audienceColor` | `0x222a33` | `0x505c68` | 92.0 | 0.231 |
| `arena.poolColor` | `0x222c34` | `0x525e6a` | 94.0 | 0.226 |

`COLORS.table` 保持 `0x1c6b5a`（均值 75.0、彩度 `0.738`、色相 167°）。
背景色相 210° → 色相差 43°；环境最大彩度 `0.284` → 彩度差 `0.454`。

**`visual.js` 的 `VISUAL.atmosphere`**：

| 键 | 改前 | 改后 | 说明 |
| --- | --- | --- | --- |
| `coolWash` / `warmWash` | `0x445260` / `0x6a5a48` | `0x7c8b99` / `0x998b78` | 洗墙渐变两端改为浅中性冷 / 暖 |
| `washMid`（新增） | — | `0x6a7783` | `colorWash()` 的中点停靠色，替代复用 `crowdFallback`，让两者职责解耦 |
| `washAlpha` | `0.34` | `0.42` | 浅色洗墙需要更高不透明度才能真正提亮远端视频墙 |
| `crowdFallback` | `0x232c34` | `0x46525e` | 贴图失败时的中性占位（不再是近黑） |
| `equirectCool` / `equirectWarm` | `0x2c3741` / `0x3b352d` | `0x4a5662` / `0x554c40` | 金属件反射渐变 |
| `equirectTop` / `equirectMid` / `equirectBottom`（新增） | — | `0x36424e` / `0x4a5a62` / `0x303a44` | 替换 `equirectGradient()` 里三处硬编码深色，统一走 `cssHex()` 单一真源 |
| `bokehCool` / `bokehWarm` / `bokehWarmRatio` | 不变 | `0xa9c2d6` / `0xdcc19e` / `0.38` | 已足够亮，零改动 |
| `floorLineColor` / `floorLineAlpha` | 不变 | `0xcbb893` / `0.12` | 零改动 |
| `crowdBoost` / `floorBoost` | 不变 | `2.2` / `1.5` | **刻意不动**：保留近黑生成贴图当暗背衬，`palette.test.js` 的既有上限断言继续成立 |
| `fogNear` / `fogFar` | 不变 | `8` / `22` | 雾距零改动 |
| `VISUAL.vignette` | `{ 0.22, 0.12 }` | `{ edgeAlpha: 0.10, topAlpha: 0.12 }` | 暗角再减轻一半 |

**`style.css` 根变量**（页面外壳，`var(--xxx)` 引用点全部不变）：

| 变量 | 改前 | 改后 | 校验 |
| --- | --- | --- | --- |
| `--bg` | `#15181d` | `#303b47` | 白字 `--text` 对比 `10.28:1` |
| `--surface` | `#1d222a` | `#384552` | — |
| `--surface-2` | `#252b34` | `#414e5b` | `--muted` 对比 `5.19:1`、白字 `7.68:1` |
| `--border` | `#333b46` | `#5b6875` | 在更亮的 surface 上仍可辨 |
| `--text` | 不变 | `#f5f3ee` | ≥4.5:1 |
| `--muted` | `#aab2bd` | `#c2cbd4` | 外壳抬亮后原值在 `--surface-2` 上只剩 `3.98:1 < 4.5:1`，必须同步调亮；新值 `5.19:1` |
| `--error` | `#e0705f` | `#f7b0a0` | error 出现在 `.error-badge`，其底是 `--surface`（不是 `--bg`）；实测对 `--surface` `5.45:1`、对 `--bg` `6.34:1`、对 `--surface-2` `4.73:1`，均 ≥4.5:1；error 色仍只用于错误 |
| `--accent` / `--accent-hover` / `--accent-active` / `--accent-bright` | 不变 | 原值 | 主色与球台绑定，零改动 |
| `--broadcast-bg` | `rgba(10,14,18,0.88)` | `rgba(42,53,64,0.90)` | 转播记分条保留深色锚点但不压抑 |
| `--broadcast-line` | 不变 | `rgba(126,226,192,0.28)` | 零改动 |

**其余文件**：

- `src/App.vue`：`.stage-wrap` 兜底底色 `#1a2735 → #45525f`，边框
  `#333b46 → var(--border)`；仅舞台容器，不改布局。
- `src/stage-overlay.css`：边缘 tint `rgba(8,13,20,0.22) → rgba(28,38,48,0.10)`，
  中央 55% 仍完全透明；顶部青绿渐变 `0.12` 不变；两个 alpha 与 `VISUAL.vignette` 同值。
- `src/game/proceduralMaps.js`：`colorWash()` 中点改用 `cssHex(A.washMid)`；
  `equirectGradient()` **线性渐变的五处停靠点**改用
  `cssHex(A.equirect{Top,Cool,Mid,Warm,Bottom})`，去掉硬编码色串；
  径向灯具光斑 `rgba(190,225,215,0.42)` 本就是浅色，**保持不变**（不算五处停靠点）。
- `src/game/venueAtmosphere.js`：仅把过期注释「只作 16% 的低饱和冷→暖洗墙」
  改为「按 `VISUAL.atmosphere.washAlpha` 控制」，**不动几何 / 材质 / 位置**。
- `src/game/scene.js` / `venue.js` / `tableModel.js` / `paddleModel.js` / `models.js`：
  **零改动**（颜色由常量自动生效）。`venue.js` 里的桁架 `rig 0x222a32`、
  钢材 `0x4a555e`、LED 视频墙 `board` 与 `led` 材质刻意保留深色，作为「轻快环境里的
  暗锚点」，与 §2「远端视频墙保留较深基调」一致，不属于本轮要提亮的环境色。

**纯逻辑扩展**（`src/game/palette.js`，仍不 import three / 不碰 DOM，≤200 行）：
新增 `srgbMean(hex)`（三通道算术均值）与 `hueDegrees(hex)`（HSL 色相，0–360，
无彩度返回 0）。`palette.test.js` 相应调整与新增：

- **替换**：测试里的比较基线 `OLD` 从「迭代 12」整体换成**迭代 13 收尾态**
  （`background: 0x1a2735`、`floor: 0x17202b`、`barrier: 0x17212c`、
  `audience: 0x222a33`、`pool: 0x222c34`）。原「新背景相对亮度 ≤0.02 暗场」→
  「`relativeLuminance(background) ≤ 0.09` 且 ≥ 迭代 13 背景 `0.01928` 的 1.8 倍」；
  原「`ball/background ≥ 12:1`」→「`ball/background ≥ 7:1`（WCAG AAA）+
  `ball/table ≥ 5:1` + `background` 亮度 ≤0.09」。
  这不是为凑数改标准：迭代 13 的 `12:1` 是**暗场专属代理**，本轮环境主动提亮后不再适用；
  新口径同时加了**更严的新上限**，且 `ball/table` 是真正决定读球的那一对
  （实测 `5.74:1` 不变），基线换成迭代 13 后断言**更能发现回退变暗**。
- **新增「错开」断言**：彩度差 ≥0.35、色相差 ≥40°、
  `srgbMean(background) > srgbMean(table) + 5`、五处环境色均亮于**迭代 13** 旧值。
- **新增外壳可读性断言**：以 `readFileSync(new URL('../style.css', import.meta.url))`
  读 `src/style.css` 的 `:root` 块解析变量（纯文本数据，不碰 DOM / three），
  断言 `text/--bg ≥4.5:1`、`muted/--surface-2 ≥4.5:1`、
  `error/--surface ≥4.5:1`（error 徽标实际落在 `--surface` 卡片上）、
  `error/--bg ≥4.5:1`。`readFileSync` 只出现在测试文件，产品代码不受影响。
- **负向检查**：把过亮背景 `0x9aa7b4`、高彩度环境色 `0x1c6b5a`、
  旧 `--muted #aab2bd` 代入同一组断言，均应判 FAIL，证明阈值有区分度。

数据流保持不变：

```
config.js / visual.js / style.css（纯数据）
  → scene.js（背景 / 雾 / 地面 / 灯光 / 球台 / 球拍 / 球）
  → createVenue() → createAtmosphere(maps)（远景洗墙 + 双色散景）
  → createArena()（cue 驱动 LED / 光锥 / 光池，handle 形状不变）
  → generatedMaps.bind(scene)（异步贴图，5 张不变）
```

### 6. 「错开 / 轻快 / 不干扰」验收标准

| 保证 | 验证方式 | 阈值 |
| --- | --- | --- |
| 球仍读得清 | `contrastRatio(COLORS.ball, COLORS.background)` / `…, COLORS.table` | ≥7:1 / ≥5:1 |
| 背景不会过亮 | `relativeLuminance(COLORS.background)` | ≤0.09（新增硬上限） |
| 确实「错开」 | 彩度差 / 色相差 / `srgbMean` 差 | ≥0.35 / ≥40° / >+5 |
| 环境是中性灰阶 | 5 处环境色 + 新增 wash / equirect 色 `chromaRatio` | ≤0.35 |
| 页面文字可读 | 解析 `style.css` 变量算对比度 | `text/--bg`、`muted/--surface-2`、`error/--surface`、`error/--bg` 四对均 ≥4.5:1 |
| 整体更轻快 | 桌面全页冻结 `playing` 帧像素统计 | `meanLum` 期望 55~70、硬下限 ≥50；`darkRatio ≤0.05` |
| 3D 舞台更轻快 | 舞台矩形 ROI（`rect(74,109,1132,594)`） | `meanLum ≥52` |
| 中央不被冲掉 | 同帧中央 ROI 前后 `meanLum` | 变化 ≤15% |
| playing 亮度恒定 | `CONFIG.arena.light` / `ledColor` / `tints` / `exposure` 深度比对 | 与迭代 12/13 全等 |
| 渲染预算 | `renderer.info` | calls ≤70、textures ≤16、triangles ≤7500、lights 3、shadowLights 1 |
| 无新增资源 | `dist/assets/*.png` | 仍 5 张 |
| 源文件行数 | `wc -l src/**/*.{js,vue,css}` | 全部 ≤200 |

冻结帧统计按迭代 13 的**同一口径重建临时脚本** `.verify-browser/env-capture.mjs`
（亮度阈值 `≥80 / ≤12`；改前截图在迭代 13 清理时已删除，本轮需在改产品代码前
重新捕获一次基线）。前后对比必须用**同一相机、同一 `playing` 帧、同一脚本**，
避免迭代 13 里出现过的脚本口径漂移。若 `meanLum` 未达 50，按
`--bg / --surface` → 3D 背景 / 地面 → `washAlpha` 顺序微调；
**禁止**通过提高 `ambient` / `fill` / 曝光、修改球台或球材质、或补噪点凑数，
也**禁止**突破 `background` 相对亮度 0.09 的上限。

### 7. 验证与交付

- `npm test`（迭代 13 的 365 条 + 本轮新增/调整的 `palette.test.js` 断言全绿）、
  `npm run build` 退出码 0、`dist/assets/` 仍 5 张 PNG、全部源文件 ≤200 行。
- 常量深度比对：`arena.light` / `ledColor` / `tints` / `exposure` 与迭代 12/13 全等；
  球台 / 球 / 网 / 线 / 拍面颜色逐位全等；物理 13 项常量逐位全等。
- 浏览器三视口 `480×360` / `1280×900` / `390×844`：无 console error / 网络失败、
  canvas 非空白、无横向溢出；玩法说明入口、AI 三档、得分定格 1.5s / 倒数 / 重开 /
  静音 / 错误态注入与重试全回归；relay 前缀下 `index.html`、`src/main.js`、
  5 张 PNG 全部 200。
- 冻结 `playing` 帧前后像素统计、渲染器诊断、玩法回归（按固定种子 `20261117`
  **重建同口径临时脚本** `.verify-browser/gameplay.mjs`：
  `13/13 常量、AI 首接 187/200 = 0.935、场均 7.07 拍`，期望与迭代 13 **逐位相同**）。
- `ViewImage` 若仍不可用，明确写「未完成主观视觉判读」，不自称达到视觉评分门槛。
- 证据与偏差写回 `tasks.md`，清理 `.verify-browser/`，刷新预览并复核 relay 200。

### 8. 明确不做

- 不改 `COLORS.table` / `tableEdge` / `line` / `net` / `ball` / 球拍颜色与材质。
- 不改物理 / AI / 判定 / 计分 / UI 结构 / 文案 / `sessionPayload()` 九字段。
- 不调用生图工具、不新增 PNG、不新增 npm 依赖、不新增后端 / 函数 / 存储 / 环境变量。
- 不新增真实光源、不改 `toneMappingExposure`、不设全局 `scene.environment`、
  不改 `crowdBoost` / `floorBoost` / 雾距 / 散景配色。
- 不新增 phase、不改 `pointPause`、不改 `arena.light` 任何数值、不改 cue / tint 通路。

### 实现期校准与验收结论

> §1 / §6 的目标值与 §6 验收阈值**原样保留、不改写、不凑数**；下文如实记录实测与偏差。

**实现路径**：严格采用方案 A，**0 次生图调用、0 张新 PNG、0 个新 npm 依赖、
0 个环境变量、0 个新增产品模块**；`dist/assets/*.png` 仍 5 张。仅在既有模块内落地：
`palette.js` 新增 `srgbMean()` / `hueDegrees()` 两个纯函数，`palette.test.js` 把比较基线
整体换成迭代 13 收尾态（10 → 12 条）；`config.js` 只改 5 个颜色字段；
`visual.js` / `proceduralMaps.js` / `style.css` / `App.vue` / `stage-overlay.css` /
`venueAtmosphere.js`（仅注释）按 §5 落地；`scene.js` / `venue.js` / `tableModel.js` /
`paddleModel.js` / `models.js` / `arenaState.js` / `arena.js` / `PongEngine.js` **零改动**。

**视觉校准**：T127 的「最多三轮微调」**未触发**——按 §5 首轮写入后，桌面全页
`meanLum` 即达 `57.0063`（目标 55~70、硬下限 ≥50），无需按
`--bg/--surface → 3D 背景/地面 → washAlpha` 顺序调整；§5 常量表即最终值，零偏离。
冻结帧基线在迭代 13 清理时已删除，本轮按同一脚本口径重新捕获为
`36.4068` / 舞台 `42.4863`，与迭代 13 记录的 `36.3661` / `42.468` 一致（重跑级差）。

**最终实测**（`.verify-browser/env-capture.mjs` 冻结同一 `playing` 帧）：

| 指标 | 改前 | 改后 | 判定 |
| --- | --- | --- | --- |
| 桌面全页 `meanLum` | 36.4068 | **57.0063** | +56.6%，落在 55~70 **PASS** |
| 桌面全页 `brightRatio` | 0.05222 | 0.11787 | +125.7% **PASS** |
| 桌面全页 `darkRatio` | 0.09255 | 0.05412 | −41.5%，未达 ≤0.05（**D1**） |
| 桌面全页 `colorBins` | 249 | 242 | 未达「不低于改前」（**D2**） |
| 全页中心 ROI `meanLum` | 65.7954 | 71.9400 | **+9.34% ≤15% PASS** |
| **舞台 ROI `meanLum`** | 42.4863 | **54.6936** | **≥52 PASS** |
| 舞台 `darkRatio` | 0.15855 | 0.09271 | −41.5% |
| 舞台中心 ROI `meanLum` | 60.2125 | 68.9832 | **+14.57% ≤15% PASS** |
| 舞台 `colorBins` | 220 | 216 | 微降 −1.8%（D2） |
| 小视口 `meanLum` / `darkRatio` | 38.6561 / 0.05020 | 61.9560 / 0.03825 | +60.3% / −23.8% PASS，`colorBins 164→158`（D2） |
| 移动视口 `meanLum` / `darkRatio` | 43.4961 / 0.07865 | 64.6753 / 0.01179 | +48.7% / −85.0% PASS，`colorBins 227→215`（D2） |

**常量与渲染诊断**：`COLORS.background = 0x45525f`，相对亮度 `0.08126 ≤ 0.09`，
为迭代 13 `0.01928` 的 **4.22 倍**；页面 `--bg #303b47` 相对亮度 `0.04211`，
为旧 `0.00901` 的 **4.67 倍**。球 / 背景 **7.21:1 ≥7**、球 / 球台 **5.74:1 ≥5**；
环境最大彩度 `0.284 ≤ 0.29`、彩度差 `0.454 ≥ 0.35`、色相差 `42.9° ≥ 40°`、
`srgbMean` 背景 `82.0` > 球台 `75.0 + 5`，四组「错开」判据全部 PASS。
外壳四对文字对比 `10.28 / 5.19 / 5.45 / 6.34 :1` 全部 ≥4.5。
渲染器 `calls 68`、`textures 15`、`triangles 6806`、`lights 3`、`shadowLights 1`、
`fogFar 22`、`exposure 1.15`、`background 0x45525f`，`console.error 0`、
failed requests `0`，与迭代 13 预算一致。`arena.light` 18 值 / `ledColor` /
`tints` / 曝光 / 球台球网拍面 9 色 / 物理 13 项常量**逐位全等**。

**偏差记录**：

- **D1（全页 `darkRatio ≤ 0.05` 未达，实测 `0.05412`）**：超出 0.00412。
  用 `.verify-browser/dark-analysis.mjs` 定位：改后 62,342 个暗像素
  **全部**落在 3D 舞台外圈（舞台 `darkRatio 0.10997`），页面外壳 `darkRatio = 0`、
  舞台中央读球区 `darkRatio` 已降到 `0.00163`（改前 `0.24174`）。这些暗像素正是
  §2 明确保留的「远端视频墙 / 观众席生成贴图较深基调，作白球暗背衬」，
  §8 又禁止改 `crowdBoost` / `floorBoost` / 散景配色。要压到 0.05 只能提亮这批
  暗锚点，与「不干扰读球」直接冲突；且 §6 的微调轮次只在 `meanLum < 50` 时触发，
  本轮 57.0063 已达标。故保留阈值与常量，如实记为未达，**不改标准、不凑数**。
- **D2（`colorBins` 不低于改前未达）**：桌面 `249→242`、小 `164→158`、
  移动 `227→215`、舞台 `220→216`，降幅 1.8%~5.3%。根因是本轮设计**主动把环境
  中性化**（彩度 ≤0.29），低彩度灰蓝本身就压缩量化后的色格数；这与
  「环境色与球台色错开」是同一件事的两面。§6 明确禁止「补噪点凑数」，
  故不人为拉高色格数。该判据来自 T127v 的对比检查、不在 §6 验收阈值表内；
  亮度三项（全页 / 舞台 `meanLum`、`brightRatio`）与暗部三项全部大幅改善，
  不视为「轻快」目标失败，如实记录。
- **D3（主观判读未完成）**：`ViewImage` 对 `env14-after-desktop.png` 仍返回
  `vision model unavailable`，**未完成主观视觉判读**；本轮不声称达到任何视觉评分
  门槛，结论只基于常量断言、渲染器诊断、像素统计与 DOM 断言。
- **验证脚本说明**：迭代 13 清理时删除了 `.verify-browser/` 全部脚本，本轮从会话
  记录重建同口径 `regression.mjs` / `failure.mjs` / `gameplay.mjs` / `final-gate.mjs` /
  `env-capture.mjs`。重建后发现并修正两处**测试脚本自身**缺陷（非产品代码）：
  `regression.mjs` 的「重试」在 Vite HMR 长连接 + SwiftShader 下 `goto('load')` 超时，
  改 `domcontentloaded` + 显式等 canvas；`failure.mjs` 原「无纯白占位块」把成功加载
  的 board/floor/rubber/wood 也算成白块，收窄为只校验被拦截的 `crowd` 材质。
  玩法脚本固定种子 `20261117` 口径不变，实测 `13/13 常量、187/200 = 0.935、
  186/200 场、1414 拍、场均 7.07 拍`，与迭代 13 **逐位相同**。

**验证汇总**：`npm test 367/367`（365 既有 + `palette.test.js` 净增 2 条）、
`npm run build` 退出码 0、5 张 PNG、全部源文件 ≤200 行（最长 199）；
`invariants.mjs` 常量深度比对 + 数值不变量 + 负向检查 **65/65 PASS**；
`palette.test.js 12/12`、`arena.test.js 9/9`、`createAtmosphere(null)` 冒烟 9/9；
禁用模式扫描 `Math.random(` / `new THREE.*Light` / `scene.environment =` /
硬编码凭据与远程 URL **全 0 命中**；`regression.mjs 63/63`、
`failure.mjs 8/8`（`crowd` 占位 `46525e`）、`final-gate.mjs 36/36`、
`gameplay.mjs` 逐位一致；relay 前缀下 `index.html` / `src/main.js` / 5 张 PNG 全部 200。

---

## 迭代 15：动作模式（只选出拍方式，球拍自动追球）（独立小迭代）

### §1 问题、目标与已确认边界

用户诉求原话：「支持一种新的玩法，玩家不用移动拍子位置，只控制出拍方式：
正手 / 反手 / 搓等专业动作，需要代码自动将拍子移动到能击到目标球的位置」。

已通过逐一澄清确认的四条边界：

1. **模式形态 = 新增可切换模式**。保留现有 `manual`（手动移动）为默认，
   新增 `action`（动作模式）；两种玩法共用同一套物理、判罚、计分、AI 与 3D 场景。
   不替换、不按输入隐式切换。
2. **动作集合 = 三动作 + 新增反手意图**。复用既有意图管道，新增一种 `block`；
   只加新常量，不改任何既有物理数值；保留「普通回击」作为不选时的默认。
3. **命中保证 = 保证接到，难度在选动作**。玩家不再因漏球丢分；难度来自
   「动作选错导致下网 / 出界」与「必须在触球前选定动作」，不新增计时窗口。
4. **入口 = 可见开关 + 复用动作按钮**。右上角可见模式开关；`TouchControls`
   在动作模式下显示四个动作按钮；支持键盘 `1/2/3/4`；仍是「下一拍」单槽。

本轮是**玩法 / 输入层**改动，与迭代 11–14 的视觉工作无关。

### §2 三条硬约束

- **`sessionPayload()` 九个字段保持不变**：`phase / scores / server / message /
  winner / muted / countdown / tip / pending`。模式状态仿照迭代 10 的
  `aiLevel`，放在 Vue `ref` + 引擎 setter，**不进 payload、不持久化、不进 localStorage**。
- **既有常量与行为逐位不变**：`CONFIG.ball.*`、`CONFIG.paddle.*`（含
  `playerSpeed = 3.2`）、`CONFIG.spin` 既有键、`CONFIG.aiProfiles`、`CONFIG.rules`、
  `arena.light`、`ledColor`、`COLORS.*` 一律不动；`manual` 模式固定种子玩法回归必须与
  迭代 14 逐位一致（`13/13 常量 · AI 首接 187/200 = 0.935 · 186/200 场 · 1414 拍 ·
  场均 7.07 拍`，种子 `20261117`）。
- **所有源文件 ≤200 行**。`PongEngine.js`、`App.vue`、`ScoreBoard.vue` 当前均为
  199 行；本轮必须靠**拆分**而非放宽约束来腾出空间（见 §6）。

### §3 方案选择

| 方案 | 做法 | 取舍 |
| --- | --- | --- |
| **A（选用）** | 新增 3 个纯逻辑模块，引擎只多一个 `controlFor()` 调用；`spin.js` 加 `block` 分支；`rally.js` 加可选第 6 参 `options.speed` | 需要改动十余个文件（含 2 个新组件），但每处改动都很小、可单测；零手感重校准 |
| B | 模式分支全写在 `PongEngine.js` / `App.vue` 内联 | 文件少，但两文件必破 200 行，自动追球无法纯逻辑单测 |
| C | 为动作模式另写一套模拟与判罚 | 复制 physics / foul、与迭代 6/7 校准分叉、回归面翻倍 |

选 A：与项目既有「纯逻辑模块 + three 适配层 + Vue 只持有表现状态」的分层一致。

### §4 架构、模块与数据流

新增三个纯逻辑模块（不 import three、不访问 DOM、不改入参）：

| 文件 | 单一职责 | 对外接口 |
| --- | --- | --- |
| `src/game/autoPaddle.js` | 把来球换算成球拍目标与轴向量 | `autoTarget(ball, config)`、`autoAxes(paddle, ball, config)` |
| `src/game/strokes.js` | 四个动作的固定中文元数据与允许列表校验 | `STROKES`、`STROKE_KEYS`、`normalizeStroke(value)`、`strokeForDigit(digit)`、`optionsFor(mode)` |
| `src/game/playMode.js` | 模式归一化 + 把模式装配成引擎每帧所需控制量 | `PLAY_MODES`、`normalizePlayMode(value)`、`isActionMode(mode)`、`controlFor(mode, sim, input, config)` |

`autoAxes()` 复用 `physics.predictXAt(ball, config.paddle.playerZ)`（与 `ai.js` 同一预测
函数）：球朝玩家飞（`velocity.z > 0`）时 x 取预测落点并叠加由 `followRadius` 派生的
≤0.09 确定性缓慢瞄准偏置（实现期校准，见文末 D2），y 取来球当前高度并夹到
`[minY, maxY]`；球远离玩家时目标回中位 `(0, 0.98)`，避免追自己刚打出的球。
轴向量按 `followRadius` / `followRadiusY` 比例收敛，全部有界。

```
Vue: playMode ref ──> engine.setPlayMode()（不进 payload）
engine.update(dt):
  input.tick(dt) → controlFor(playMode, sim, input)
      manual → axes = input.axes(sim.playerPaddle), speed = CONFIG.paddle.playerSpeed
      action → axes = autoAxes(sim.playerPaddle, sim.ball), speed = CONFIG.autoPaddle.speed
  → advanceSimulation(sim, dt, axes, frameHooks, intent, { speed })
  → movePaddle(..., options.speed ?? CONFIG.paddle.playerSpeed)
```

`rally.advanceSimulation()` 增加第 6 个可选参数 `options = {}`；不传时 `speed` 取
`CONFIG.paddle.playerSpeed`，**既有 5 参调用与既有 367 条单测行为逐位不变**。

### §5 实现期干跑依据与「保证接到」验收

写入规格前用**一次性 Node 干跑脚本**验证过可行性（脚本不落产品代码、不入库）：
把 `CONFIG.paddle.playerSpeed` 在临时进程里改写成 3.2 / 6.0 以模拟 `options.speed`，
固定种子 `20261117`、200 发、每组最多 3000 固定步，分别让玩家只用
`none` / 满蓄力 `drive` / `push` / 三者混合，共 8 组。结果：

| 追球步速 | 玩家漏接（`MISS` 且 `winner='ai'`） | 命中时球高 | 球拍与球 y 偏差 | 命中时 `\|paddle.vx\|` |
| --- | --- | --- | --- | --- |
| 3.2（既有） | **0**（该步速 4 组全为 0） | 0.915–1.123 | ≤0.069 | 0（全部 8 组） |
| 6.0（拟用） | **0**（该步速 4 组全为 0） | 0.915–1.123 | ≤0.042 | 0（全部 8 组） |

结论：来球高度始终落在球拍可达区间 `[0.8, 1.35]` 内，y 偏差远小于接触半径
`hitRadius + ballRadius = 0.15`；且因 `predictXAt` 对直线球是精确预测（落台只改
`vz`、不改 `vx`），对齐后球拍横向静止，**不会通过 `paddle.vx * returnVxPaddle`
把回球线路带偏**。8 组实测 `|paddle.vx|` 全为 0；`|paddle.vy|` 最高 1.8908
（y 仍在追来球高度），但 `returnBall()` 已把 `paddle.vy * returnVyPaddle = 0.08`
夹到 `±returnVyPaddleClamp = 0.25`，故弧线不会失控。3.2 已能接到，但 6.0 给快球
与 y 跟踪留余量、把偏差压到 ≤0.042。以上为写入规格前的一次性干跑证据；
最终实现按文末 D2 加入缓慢瞄准偏置，实测数值以文末「实现期校准与验收结论」为准。

因此新增常量（**全部是新键，既有值不动**）：

```
新增 CONFIG.autoPaddle = { speed: 6.0, followRadius: 0.12, followRadiusY: 0.10,
                           neutralX: 0, neutralY: 0.98 }
在 CONFIG.spin 内新增三键：blockVxBias: 0.4、blockVxClamp: 1.4、
                           blockVyLift: 0.04
```

**验收（实现后以同口径正式脚本复测，不改写本节阈值）**：

- 固定种子 `20261117`、200 发、四种动作各跑一遍：动作模式**玩家漏接 = 0**；
  命中时球拍与球的 y 偏差 ≤0.10；命中时 `|paddle.vx| ≤ 0.5`、
  `|paddle.vy| ≤ 2.5`（既有 `returnVyPaddleClamp = 0.25` 兜住弧线）。
- 每种动作各 200 次回击：玩家**自身回球**造成的下网 / 出界率
  （`rally.lastHitter === 'player'` 时的 `NET` / `OUT`）不高于 `none` 基线
  **+5 个百分点**；四种动作在弧线、旋转或线路上至少有 3 种可测差异。
- 回合能在有界步数内结束，不出现无限相持（脚本单场硬上限 3000 固定步）。

### §6 动作集合、状态与 UI

**四个动作即四个意图键**（`strokes.js` 为单一真源）：

| key | 手动模式按钮 | 动作模式按钮 | 数字键 | 物理效果 |
| --- | --- | --- | --- | --- |
| `none` | 普通回击 | 普通回击 | `1` | 既有默认，无旋 |
| `drive` | 上旋快攻 | 正手攻球 | `2` | 既有 `applyIntent` drive 分支，不改 |
| `push` | 搓短下旋 | 搓短 | `3` | 既有 `applyIntent` push 分支，不改 |
| `block` | —（不显示） | 反手推挡 | `4` | **新增**：无旋、平击压线 |

`block` 定义：`spin.applyIntent()` 新增分支，按既有横向速度符号
（`velocity.x >= 0 ? 1 : -1`，为 0 时取 `+1`，保持确定性）沿该方向**叠加**
`blockVxBias` 的横向偏置（不是乘倍数），再夹到 `±blockVxClamp`
（`1.4` 与 `returnVxClamp` 同源），`vy` 抬 `blockVyLift`，`spin = 0`；
随后仍由 `returnBall()` 统一 `clampVelocity()` 截断。
与 `drive`（快、低弧、上旋）、`push`（慢、高弧、下旋）形成可区分的第三种手感。

**状态与接线**：

- `PongEngine`：`this.playMode = 'manual'`；`setPlayMode(mode)` 用
  `normalizePlayMode()` 校验、切模式时清空待发动作并 `emit()`；`selectIntent(type)`
  改用 `normalizeStroke()` 允许列表（未知键静默忽略）；`update()` 改用
  `controlFor()`。`restart()` 保留模式、把 `pending` 复位为 `none`。
- `input.js`：保持 `createInput(target = window, callbacks = {})` 的默认值；
  数字键分支**先经 `callbacks.isActionMode?.()` 判定**，仅在动作模式下命中
  `strokeForDigit()` 才回调并 `preventDefault()`。`createGameInput()` 把回调透传给
  `createInput()`。引擎侧 `isActionMode` 读 `this.playMode === 'action'`，
  `onStroke` 调 `selectIntent()`。**manual 模式连 `preventDefault()` 都不发生，
  键盘行为逐位不变**。
- `pointerInput.js`：`TYPES` 增加 `block`，`setPendingIntent('block')` 产出
  `{ type: 'block', charge: 0 }`。动作模式下 `input.axes()` 被忽略，
  **拖动 / WASD / 方向键不再移动球拍**；按住 `Space` / `Shift` 的既有蓄力 /
  下旋输入仍可作为等效动作，且数字键 / 按钮写入的单槽始终优先
  （沿用 `gameInput.intent()` 既有优先级，不改该函数）。
- `session.js`：`PENDING_LABELS` 增加 `block`，新增 `ACTION_LABELS`；
  显式 `import { normalizePlayMode } from './playMode.js'`（纯逻辑模块，
  与 `tips.js` / `scoring.js` 同层、无循环依赖）；
  `pendingLabel(type, mode = 'manual')` 按归一化模式取表，默认参数保证既有调用
  与既有 367 条单测行为不变。`tips.js` 增加 `BLOCK` 文案。
- `TouchControls.vue`：新增 `mode` 属性（String，默认 `'manual'`）；按钮列表由
  `optionsFor(mode)` 计算；提示文案 `pendingLabel(selected, mode)`。
- 新增 `PlayModeToggle.vue`（右上角可见双按钮，`aria-pressed`，hover / focus /
  active / disabled 四态，禁用态跟 `state.error`）。
- 新增 `AppHeader.vue`：承接品牌、`GameGuide`、`PlayModeToggle`、`SoundToggle`，
  props 带类型与默认值、子改父走 emit。**这一步是为把 `App.vue` 从 199 行降到
  ≤200 行**，不是顺手重构无关代码。
- 若 `PongEngine.js` 仍超限，把 `frame()` 的渲染段
  （`particles.update` / `arena.step` / `trail.update` / `syncMeshes` / `render`）
  下沉为 `engineView.renderFrame(engine, dt)` 适配函数，行为逐位一致。
- `usePongGame.js`：新增 `playMode = ref('manual')` 与 `setPlayMode()`，
  引擎失败时返回 `null` 则不更新 UI（与 `setAiLevel` 同构）。
  `App.vue` 把 `playMode` 作为属性传给 `AppHeader` 与 `TouchControls`，
  并按模式切换页脚文案与舞台 `aria-label`；`state` 的十个字段不变。
- `guide.js`：`GUIDE_SECTIONS` 新增「玩法模式」一节，写清两种模式、数字键、
  四个动作、自动追球与「动作只作用下一拍」；`GuideSections.vue` **不改**
  （现有 section 渲染 + `ai` slot 机制足够）。

### §7 「不干扰既有玩法」与验证交付

- **静态**：`npm test`（≥367 且新增用例全绿）、`npm run build` 退出码 0、
  5 张 PNG 不变、全部源文件 ≤200 行、禁用模式扫描（新依赖 / `/tmp` 持久化 /
  硬编码凭据 / 远程 URL）0 命中。
- **纯逻辑单测**：新增 `autoPaddle.test.js`、`strokes.test.js`、
  `playMode.test.js`；扩展 `spin.test.js` / `spinIntegration.test.js` /
  `pending.test.js` / `tips.test.js` / `rally.test.js`。断言写「应该怎样」而非
  「现在怎样」，含空值、未知键、原型键、边界数字、负向检查；外部随机注入，
  不打网络、不共享可变状态。
- **玩法回归**：`manual` 模式固定种子 `20261117` 与迭代 14 逐位一致；
  `action` 模式按 §5 验收；既有 AI 三档、计分、停留 1.5s、倒数 3s 不变。
- **浏览器三视口**（480×360 / 1280×900 / 390×844）：模式开关可见且四态齐全、
  manual 3 按钮 / action 4 按钮、数字键选中、命中后单槽自动复位、重开保持模式、
  动作模式拖动不移动球拍、键盘焦点可见、无横向溢出、canvas 非空白、
  `console.error 0` / failed requests `0`；relay 前缀下入口与资源全部 200。
- **失败态**：注入 WebGL / 运行时错误时覆盖层与「重试」仍可用，模式开关禁用。
- **交付**：`.verify-browser/` 仅作单次验证并清理；`proposal.md` / `tasks.md`
  如实记录实测与偏差（不改阈值凑数）；最后刷新预览。

### §8 明确不做

不新增 npm 依赖、后端 / 函数 / 存储 / 环境变量、生成图片、真实灯光、配色、
模型或贴图改动；不改既有物理 / AI / 规则常量，不改判罚与计分，不改
`sessionPayload()` 九字段，不做模式持久化，不新增时机倒数或第二套模拟，
不重做迭代 6/7 的手感校准。无视觉改动，故本轮不涉及主观视觉评分。

### 实现期校准与验收结论

> §1–§8 的边界、常量与验收阈值**原样保留、不改写、不凑数**；下文如实记录实测与偏差。

**实现路径**：严格采用方案 A，**0 次生图调用、0 张新 PNG、0 个新 npm 依赖、
0 个环境变量、0 个新增后端 / 函数 / 存储**；`dist/assets/*.png` 仍 5 张。
新增 6 个产品模块：`autoPaddle.js` / `strokes.js` / `playMode.js`（纯逻辑）、
`engineFrame.js`（引擎渲染适配）、`PlayModeToggle.vue` / `AppHeader.vue`（Vue）；
新增 4 个测试文件共 35 条、扩展 9 个既有测试文件。`config.js` 只**新增**
`CONFIG.autoPaddle` 5 键与 `CONFIG.spin` 3 键，既有全部键与值逐位不动；
`sessionPayload()` 仍 9 字段；`manual` 仍是默认模式。

**动作模式正式验收**（`playmode.mjs`，固定种子 `20261117`、200 发、每组最多 3000 固定步）：

| 动作 | 玩家漏接 | 命中 y 偏差 | `\|paddle.vx\|` | `\|paddle.vy\|` | 自身 NET/OUT | 最大步数 |
| --- | --- | --- | --- | --- | --- | --- |
| `none` | **0** | 0.0053 | 0.2455 | 0.2719 | 0.00% | 2434 |
| `drive` | **0** | 0.0053 | 0.2508 | 0.2719 | 0.00% | 2442 |
| `push` | **0** | 0.0053 | 0.2422 | 0.2719 | 0.00% | 2503 |
| `block` | **0** | 0.0053 | 0.2487 | 0.2719 | 0.50% | 2492 |

全部满足 §5 阈值（漏接 0、y 偏差 ≤0.10、`|vx| ≤ 0.5`、`|vy| ≤ 2.5`、
`block` 自身 NET/OUT ≤ `none` +5pp）。四种动作均值可测差异：`spin`
`0 / +0.650 / −0.600 / 0`、回球 `|vz|` `3.451 / 4.687 / 2.692 / 3.446`、
回球 `|vx|` `0.159 / 0.161 / 0.152 / 0.550` —— 弧线、旋转、线路三组差异
全部成立（≥3 种）；单场最大 2503 步，无无限相持。`playmode 49 PASS / 0 FAIL`。

**既有玩法逐位不变**：`gameplay.mjs` 固定种子 `20261117` 实测 `13/13 常量、
AI 首接 187/200 = 0.935、186/200 场有回击、总 1414 拍、场均 7.07 拍`，
与迭代 14 **逐位相同**；`invariants15.mjs` 对 `CONFIG.ball.*` / `paddle.*` /
`aiProfiles` / `rules` / `spin` 既有键 / `arena.light` / `ledColor` / `COLORS.*`
做深度比对，并验证 `sessionPayload` 九字段名不变、模式状态未写 localStorage、
`restart()` 保留模式、负向断言可捕获改动，**37 PASS / 0 FAIL**。

**偏差记录**：

- **D1（下沉模块名与规格措辞不同）**：§6 写「若超限则新增
  `engineView.renderFrame(engine, dt)`」；实现为 `src/game/engineFrame.js` 的
  `tickFrame(engine, dt)`。行为顺序（accumulator 固定步 → `particles.update` →
  `arena.step` → `trail.update` → `syncMeshes` → `render`）与改前逐位一致，
  `PongEngine.js` 198 行 ≤200。仅为拆分位置 / 命名差异，无行为差异。
- **D2（实现期瞄准偏置，对应 §4 / §5 的「见文末 D2」）**：写入规格时的干跑显示
  8 组 `|paddle.vx|` 全为 0，但正式脚本首轮出现 1 组 `none` 相持突破 3000 步
  硬上限 —— `predictXAt()` 精确对齐后拍面横向静止，无旋回球形成定周期循环。
  为在**不改任何既有物理常量、不改阈值、不加随机**的前提下打破对称，
  `autoTarget()` 叠加由 `followRadius × 0.75` 派生的 ≤0.09 确定性缓慢相位偏置。
  代价是 `|paddle.vx|` 由预期 0 变为 0.2422–0.2508，仍远低于 §5 的 0.5；
  `|paddle.vy| 0.2719` 远低于 2.5；y 偏差 0.0053 优于干跑的 ≤0.042；
  玩家漏接仍为 0。§5 阈值与 §8 边界原样保留，如实记录该实现差异，并新增
  `autoPaddle.test.js` 一条「任意有限球状态下偏置有界且不越界」断言。
- **D3（验证脚本自身缺陷，非产品代码）**：`playmode.mjs` 初版按「整场持续生效」
  断言所选动作，与 §6「下一拍单槽」语义不符，按规格改为消耗式单槽后 2 项
  失败消失；`regression.mjs` 沿用迭代 13 的 `.guide-group` 数量 5，迭代 15
  新增「玩法模式」一节后改为 6；`post-restart.mjs` 在 SwiftShader 持续 rAF 下
  `page.screenshot()` 30s 超时，按 `regression.mjs` 同法先冻结 rAF 并把截图超时
  提到 60s，重跑 39 PASS / 0 FAIL。迭代 14 清理时删除的浏览器脚本本轮按会话
  记录重建同口径。以上均为脚本修正，未改产品代码，也未放宽任何验收标准。
- **D4（不做主观视觉判读）**：§8 明确本轮无视觉改动、不涉及视觉评分，
  故未调用 `ViewImage`，不声称任何视觉效果结论。

**验证汇总**：`npm test 419/419`（367 既有 + 35 新文件 + 17 扩展用例）、
`npm run build` 退出码 0、5 张指纹 PNG（three.js 分块 >500kB 为既有非阻断警告）；
新增 4 个测试文件独立运行 35/35；`src/` 全部 `.js` / `.vue` ≤200 行（最长 200）；
禁用模式扫描 `Math.random(` / 新增真实灯光 / `scene.environment =` /
硬编码凭据与远程 URL / `/tmp` **全 0 命中**；依赖仍 `three, vue`，
devDependencies 仍 `@vitejs/plugin-vue, vite`。
浏览器三视口 `regression15 129 PASS / 0 FAIL`、`failure15 10 PASS / 0 FAIL`、
`final-gate 45 PASS / 0 FAIL`；relay 前缀下 `index.html` / `src/main.js` /
`src/game/playMode.js` / `src/game/autoPaddle.js` /
`src/components/PlayModeToggle.vue` 全部 200，5 张 PNG 全部 200，
`console.error 0` / failed requests `0`；预览刷新后新鲜
`post-restart.mjs 39 PASS / 0 FAIL`。`.verify-browser/` 已清理，
`git status --short` 无临时产物残留。

---
