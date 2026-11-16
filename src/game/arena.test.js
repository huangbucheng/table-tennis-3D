// 适配层冒烟测试：允许 import three，但只构造 Scene 与假灯光对象，
// 不创建 WebGLRenderer、不访问 DOM。
import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CONFIG } from './config.js'
import { createArena } from './arena.js'

const payload = (over = {}) => ({
  phase: 'playing', scores: { player: 0, ai: 0 }, countdown: 0,
  winner: null, tip: '', pending: 'none', muted: false, ...over,
})

const setup = () => {
  const scene = new THREE.Scene()
  const lights = { ambient: { intensity: 0 }, key: { intensity: 0 }, fill: { intensity: 0 } }
  return { scene, lights, arena: createArena(scene, lights) }
}

test('createArena 只往场景挂一个场馆 group，不新增光源', () => {
  const { scene, arena } = setup()
  assert.strictEqual(scene.children.length, 1, `期望 1 个子节点，实际 ${scene.children.length}`)
  assert.strictEqual(scene.children.filter((child) => child.isLight).length, 0,
    '期望 0 盏新增光源')
  arena.dispose()
})

test('onState 把 target 同步到 playing 端点向量', () => {
  const { arena } = setup()
  arena.onState(payload())
  assert.strictEqual(arena.target.key, CONFIG.arena.light.PLAYING.key,
    `期望 ${CONFIG.arena.light.PLAYING.key}，实际 ${arena.target.key}`)
  arena.dispose()
})

test('step 让主光强度单调逼近目标且不越过目标', () => {
  const { lights, arena } = setup()
  arena.onState(payload())
  const goal = CONFIG.arena.light.PLAYING.key
  let previous = 0
  for (let i = 0; i < 30; i += 1) {
    arena.step(1 / 60)
    assert.ok(lights.key.intensity >= previous - 1e-9,
      `第 ${i} 步期望不下降：${previous} → ${lights.key.intensity}`)
    assert.ok(lights.key.intensity <= goal + 1e-9,
      `第 ${i} 步期望 ≤ ${goal}，实际 ${lights.key.intensity}`)
    previous = lights.key.intensity
  }
  assert.ok(previous > 1.2 && previous < goal,
    `期望 1.2 < ${previous} < ${goal}`)
  arena.dispose()
})

test('playing 期间目标恒定，连跑 200 步后相邻帧差小于 1e-6', () => {
  const { arena } = setup()
  arena.onState(payload())
  for (let i = 0; i < 150; i += 1) arena.step(1 / 60)
  let last = arena.current.key
  for (let i = 0; i < 50; i += 1) {
    arena.step(1 / 60)
    assert.ok(Math.abs(arena.current.key - last) < 1e-6,
      `第 ${i} 步期望差 < 1e-6，实际 ${Math.abs(arena.current.key - last)}`)
    last = arena.current.key
  }
  arena.dispose()
})

test('得分脉冲在 0.5 秒内衰减到 2% 以下', () => {
  const { arena } = setup()
  arena.onState(payload({ phase: 'serving', countdown: 3 }))
  arena.onState(payload({ phase: 'serving', countdown: 3, scores: { player: 1, ai: 0 } }))
  assert.strictEqual(arena.pulseValue, 1, `期望脉冲 1，实际 ${arena.pulseValue}`)
  for (let i = 0; i < 30; i += 1) arena.step(1 / 60)
  assert.ok(arena.pulseValue < 0.02, `期望 < 0.02，实际 ${arena.pulseValue}`)
  arena.dispose()
})

test('仅 tip 变化的 emit 是空操作', () => {
  const { arena } = setup()
  arena.onState(payload())
  const before = arena.target.key
  arena.onState(payload({ tip: '上旋快攻' }))
  assert.strictEqual(arena.target.key, before, `期望 ${before}，实际 ${arena.target.key}`)
  assert.strictEqual(arena.pulseValue, 0, '期望无脉冲')
  arena.dispose()
})

test('step(0) 不推进 current，也不改动 pulseValue', () => {
  const { arena } = setup()
  arena.onState(payload())
  const before = arena.current.key
  arena.step(0)
  assert.strictEqual(arena.current.key, before, `期望 ${before}，实际 ${arena.current.key}`)
  assert.strictEqual(arena.pulseValue, 0, '期望脉冲保持 0')
  arena.dispose()
})

test('gameover 且对手获胜时 LED 自发光向 lose tint 收敛', () => {
  const { scene, arena } = setup()
  const led = scene.children[0].children.find(
    (child) => child.material?.color?.getHex?.() === CONFIG.arena.ledColor,
  )?.material
  assert.ok(led?.emissive, '应能取到 LED 材质')
  arena.onState(payload({ phase: 'gameover', winner: 'ai', scores: { player: 9, ai: 11 } }))
  for (let i = 0; i < 90; i += 1) arena.step(1 / 60)
  const goal = new THREE.Color(CONFIG.arena.tints.lose)
  assert.ok(Math.abs(led.emissive.r - goal.r) < 0.02,
    `期望 r≈${goal.r}，实际 ${led.emissive.r}`)
  arena.dispose()
})

test('dispose 移除场馆 group 且可重复调用不抛异常', () => {
  const { scene, arena } = setup()
  arena.dispose()
  assert.strictEqual(scene.children.length, 0, `期望 0 个子节点，实际 ${scene.children.length}`)
  assert.doesNotThrow(() => arena.dispose(), '重复 dispose 不应抛异常')
})
