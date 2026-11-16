import test from 'node:test'
import assert from 'node:assert/strict'
import { GUIDE_SECTIONS, AI_LEVELS, guideSections, aiLevelOptions } from './guide.js'
import { AI_LEVEL_KEYS } from './matchSettings.js'

test('说明应恰好覆盖五组且每组有非空标题与条目', () => {
  const sections = guideSections()
  assert.strictEqual(sections.length, 5,
    `期望五组说明，实际 ${sections.length} 组`)
  for (const group of sections) {
    assert.ok(group.id && group.title,
      `期望每组有 id 与标题，实际 ${JSON.stringify(group)}`)
    assert.ok(Array.isArray(group.items) && group.items.length > 0,
      `期望 ${group.id} 至少一条说明`)
    for (const line of group.items) {
      assert.ok(typeof line === 'string' && line.trim().length > 6,
        `期望 ${group.id} 的条目为有效中文，实际 ${JSON.stringify(line)}`)
    }
  }
})

test('说明分组顺序应为移动 / 力度 / 线路 / 对手 / 规则', () => {
  assert.deepStrictEqual(guideSections().map((s) => s.id),
    ['move', 'power', 'line', 'ai', 'rules'],
    `期望五组顺序固定，实际 ${guideSections().map((s) => s.id)}`)
})

test('说明不应含占位符或 HTML 标签，可安全用插值渲染', () => {
  const text = JSON.stringify(GUIDE_SECTIONS)
  assert.ok(!/TODO|TBD|lorem|ipsum|占位|待定|XXX/.test(text),
    `期望说明无占位符，实际含于 ${text.slice(0, 80)}`)
  assert.ok(!/<[a-z]/i.test(text),
    '期望说明不含 HTML 标签，避免误用 v-html')
})

test('出球力度说明应覆盖蓄力、搓短、普通回击与速度上限', () => {
  const text = guideSections().find((s) => s.id === 'power').items.join('')
  for (const key of ['Space', 'Shift', '普通回击', '上限']) {
    assert.ok(text.includes(key), `期望力度说明提到 ${key}`)
  }
})

test('回球线路说明应覆盖横移、随机与上旋下旋', () => {
  const text = guideSections().find((s) => s.id === 'line').items.join('')
  for (const key of ['横移', '随机', '上旋', '下旋']) {
    assert.ok(text.includes(key), `期望线路说明提到 ${key}`)
  }
})

test('计分说明应写清 11 分制与净胜 2 分', () => {
  const text = guideSections().find((s) => s.id === 'rules').items.join('')
  assert.ok(text.includes('11 分制'), `期望写清 11 分制，实际 ${text}`)
  assert.ok(text.includes('净胜 2 分'), `期望写清净胜 2 分，实际 ${text}`)
})

test('对手档位标签应与允许列表完全一致且各有说明', () => {
  assert.deepStrictEqual(aiLevelOptions().map((l) => l.key), [...AI_LEVEL_KEYS],
    `期望档位键与允许列表一致，实际 ${aiLevelOptions().map((l) => l.key)}`)
  for (const level of AI_LEVELS) {
    assert.ok(level.label && level.detail,
      `期望 ${level.key} 有标签与说明`)
  }
})

test('档位强度描述方向不得写反', () => {
  assert.ok(/较慢|失误较多/.test(AI_LEVELS[0].detail),
    `期望练习档描述为较慢 / 失误较多，实际 ${AI_LEVELS[0].detail}`)
  assert.ok(/更快|失误更少/.test(AI_LEVELS[2].detail),
    `期望凌厉档描述为更快 / 失误更少，实际 ${AI_LEVELS[2].detail}`)
})

test('对手强度说明应与三档标签用词一致', () => {
  const text = guideSections().find((s) => s.id === 'ai').items.join('')
  for (const label of AI_LEVELS.map((l) => l.label)) {
    assert.ok(text.includes(label), `期望对手说明提到「${label}」`)
  }
})
