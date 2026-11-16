import { CONFIG, INTENT_NONE } from './config.js'
import { createAiController, updateAiPaddle } from './ai.js'
import { paddleContact } from './contact.js'
import {
  checkPaddleHit,
  createBall,
  createPaddle,
  createRally,
  judgeRally,
  movePaddle,
  returnBall,
  stepBall,
} from './physics.js'

export function createSimulation() {
  return resetSimulation({})
}

// 发球前瞬时归位：两只球拍、球、rally 与 AI 控制器全部回到默认值。
export function prepareServe(sim, server = 'player') {
  sim.ball = createBall(server, () => 0.5)
  sim.rally = { ...createRally(server), active: false }
  sim.playerPaddle = createPaddle('player')
  sim.aiPaddle = createPaddle('ai')
  // 回置时继承当前档位；未知 / 缺失值由 createAiController 与 updateAiPaddle 兜底。
  sim.ai = createAiController(Math.random, sim.ai?.profile)
  return sim
}

export function resetSimulation(sim) {
  return prepareServe(sim, 'player')
}

export function serveSimulation(sim, server) {
  sim.ball = createBall(server)
  sim.rally = createRally(server)
}

// 回球严格从拍面上的接触点出发，避免球在离拍平面一截的地方被弹回。
function strikeFrom(ball, side, paddle, rng, config, intent, dt) {
  const plane = side === 'player' ? config.paddle.playerZ : config.paddle.aiZ
  const point = paddleContact(ball, plane, dt)
  const contact = { ...ball, position: { x: point.x, y: point.y, z: plane } }
  return returnBall(contact, paddle, side, rng, config, intent)
}

// 推进一个固定物理子步，返回失分信息或 null。hooks 用于触发音效与拖尾等副作用。
export function advanceSimulation(sim, dt, axes, hooks = {}, intent = INTENT_NONE) {
  sim.playerPaddle = movePaddle(sim.playerPaddle, axes.x, axes.y, dt, CONFIG.paddle.playerSpeed)
  sim.aiPaddle = updateAiPaddle(sim.aiPaddle, sim.ball, dt, sim.ai)

  if (checkPaddleHit(sim.ball, sim.playerPaddle, 'player', sim.rally, CONFIG, dt)) {
    sim.ball = strikeFrom(sim.ball, 'player', sim.playerPaddle, Math.random, CONFIG, intent, dt)
    sim.rally = createRally('player')
    hooks.onHit?.('player', intent)
  } else if (checkPaddleHit(sim.ball, sim.aiPaddle, 'ai', sim.rally, CONFIG, dt)) {
    sim.ball = strikeFrom(sim.ball, 'ai', sim.aiPaddle, Math.random, CONFIG, INTENT_NONE, dt)
    sim.rally = createRally('ai')
    hooks.onHit?.('ai', INTENT_NONE)
  }

  const previous = { ball: sim.ball, rally: sim.rally }
  const next = stepBall(previous, dt)
  for (const event of next.events) {
    if (event.type === 'tableBounce') hooks.onBounce?.()
  }

  const foul = judgeRally(next, previous)
  if (foul) return { foul, position: next.ball.position }

  sim.ball = next.ball
  sim.rally = next.rally
  hooks.onTrail?.(next.ball.position)
  return null
}
