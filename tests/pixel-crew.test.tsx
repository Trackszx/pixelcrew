import { expect, test } from 'claude-code/testing'

import { bandRaster, barRaster, spriteRaster } from '../hooks/art'
import { langOf, strings } from '../hooks/i18n'
import { activityOf, estimate, glide, resetGlide, roleOf } from '../hooks/register'

const BAND: any = {
  isWorking: true,
  hasSurvey: false,
  maxRows: 10,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
}
const PANE: any = {
  title: 'Agents',
  isFocused: false,
  bodyColumns: 50,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}
const EN = { options: { language: 'en' } }
const PT = { options: { language: 'pt' } }
const ES = { options: { language: 'es' } }

test('gives each subagent a role from the first keyword', async () => {
  expect(roleOf('codex:codex-rescue', 'Fix the bug')).toBe('codex')
  expect(roleOf('general-purpose', 'Review the whole kit')).toBe('tester')
  expect(roleOf('Plan', 'Plan the architecture')).toBe('researcher')
  expect(roleOf('general-purpose', 'Pesquisar o fluxo dos testes do plugin')).toBe('researcher')
  expect(roleOf('general-purpose', 'Testar a cobertura dos testes')).toBe('tester')
  expect(roleOf('general-purpose', 'Build: mapear funções do register')).toBe('developer')
  expect(roleOf('general-purpose', 'Design: inventário da paleta dos sprites')).toBe('artist')
  expect(roleOf('Explore', 'Mapear o projeto')).toBe('researcher')
  expect(roleOf('general-purpose', 'Desenhar a tela inicial')).toBe('artist')
  expect(roleOf('general-purpose', 'Design the launch graphics')).toBe('artist')
  expect(roleOf('Explore', 'Research competitor launches')).toBe('researcher')
  expect(roleOf('general-purpose', 'Build the landing page')).toBe('developer')
  expect(roleOf('general-purpose', 'Run the tests')).toBe('tester')
  expect(roleOf('general-purpose', 'Organize things')).toBe('worker')
  // Spanish
  expect(roleOf('general-purpose', 'Draw the app icon')).toBe('artist')
  expect(roleOf('general-purpose', 'Diseñar el logo')).toBe('artist')
  expect(roleOf('general-purpose', 'Probar el login')).toBe('tester')
  expect(roleOf('general-purpose', 'Corregir el error del pago')).toBe('developer')
  expect(roleOf('general-purpose', 'Construir la página')).toBe('developer')
  expect(roleOf('general-purpose', 'Analizar la competencia')).toBe('researcher')
})

test('the boss is never a subagent', async () => {
  for (const d of ['Review the whole kit', 'Coordenar a equipe', 'Plan the release', 'Chefe do projeto', 'Audit the code'])
    expect(roleOf('general-purpose', d)).not.toBe('boss')
})

test('the estimate grows and stays under 90%', async () => {
  expect(estimate(0)).toBe(0)
  expect(estimate(4)).toBeGreaterThan(estimate(2))
  expect(estimate(1000)).toBeLessThanOrEqual(0.9)
})

test('reads a language out of settings and locales', async () => {
  expect(langOf('pt-BR')).toBe('pt')
  expect(langOf('Portuguese')).toBe('pt')
  expect(langOf('es_ES.UTF-8')).toBe('es')
  expect(langOf('Español')).toBe('es')
  expect(langOf('en-US')).toBe('en')
  expect(langOf('english')).toBe('en')
  expect(langOf('fr-FR')).toBeUndefined()
  expect(langOf('C')).toBeUndefined()
  expect(langOf(undefined)).toBeUndefined()
})

test('describes what the agent is doing, in each language', async () => {
  const en = strings('en')
  const pt = strings('pt')
  const es = strings('es')
  expect(activityOf('Read', { file_path: 'C:/x/hooks/art.ts' }, en)).toBe('Reading art.ts')
  expect(activityOf('Read', { file_path: 'C:/x/hooks/art.ts' }, pt)).toBe('Lendo art.ts')
  expect(activityOf('Read', { file_path: 'C:/x/hooks/art.ts' }, es)).toBe('Leyendo art.ts')
  expect(activityOf('Edit', { file_path: '/a/b/register.tsx' }, en)).toBe('Editing register.tsx')
  expect(activityOf('Bash', { description: 'Run the tests' }, en)).toBe('Run the tests')
  expect(activityOf('Bash', {}, es)).toBe('Ejecutando un comando')
  expect(activityOf('Agent', { description: 'Build the page' }, en)).toBe('Delegating: Build the page')
  expect(activityOf('mcp__github__create_issue', {}, pt)).toBe('Usando create_issue')
})

test('the bar glides up and drops at once', async () => {
  resetGlide()
  expect(glide(0.2, 1000)).toBe(0.2)
  const step = glide(0.8, 1300)
  expect(step).toBeGreaterThan(0.2)
  expect(step).toBeLessThan(0.8)
  expect(glide(0.8, 1600)).toBeGreaterThan(step)
  // a new turn starts over right away
  expect(glide(0, 1700)).toBe(0)
  resetGlide()
})

test('the band follows the task list', EN, async ($, on) => {
  resetGlide()
  ;(on as any)('tool.call', { tool: 'TodoWrite' }, async () => ({ result: { oldTodos: [], newTodos: [] } }))
  await ($.tool.call as any)({
    tool: 'TodoWrite',
    input: {
      todos: [
        { content: 'First', status: 'completed', activeForm: 'Doing the first' },
        { content: 'Second', status: 'in_progress', activeForm: 'Doing the second' },
      ],
    },
  } as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ text: /Doing the second/ })).toBeDefined()
    expect(await ui.find({ text: /50%/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the panel lists a subagent with its role and status', EN, async ($, on) => {
  on('agent.spawn', async () => ({ model: 'claude-opus-5-5', agentId: 'agent-1' }))
  on('turn.complete', async () => ({ text: '' }))
  await $.agent.spawn({ prompt: 'go', description: 'Build the landing page', subagentType: 'general-purpose' } as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface, component: 'Pane', props: PANE, requestId: 'pixel-crew-agents' })
    expect(await ui.find({ text: /Build the landing page/ })).toBeDefined()
    expect(await ui.find({ text: /developer/ })).toBeDefined()
    expect(await ui.find({ text: /Running · 1/ })).toBeDefined()
    await ui.unmount()
  }

  await $.turn.complete({ agentId: 'agent-1', answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as any)
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'pixel-crew-agents' })
  expect(await ui.find({ text: /Finished · 1/ })).toBeDefined()
  expect(await ui.find({ text: /Running · 0/ })).toBeDefined()
  expect(await ui.find({ text: /Cost/ })).toBeDefined()
  await ui.unmount()
})

// two subagents, one finished: Claude is the boss and counts 1/2
async function boss($: any, on: any) {
  let n = 0
  on('agent.spawn', async () => ({ model: 'claude-haiku-5-5', agentId: 'ag-' + ++n }))
  on('turn.complete', async () => ({ text: '' }))
  await $.agent.spawn({ prompt: 'a', description: 'Build the page', subagentType: 'general-purpose' } as any)
  await $.agent.spawn({ prompt: 'b', description: 'Design the logo', subagentType: 'general-purpose' } as any)
  await $.turn.complete({ agentId: 'ag-1', answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' } as any)
}

test('Claude becomes the boss and counts finished subagents', EN, async ($, on) => {
  await boss($, on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface, component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
    expect(await ui.find({ text: /1\/2/ })).toBeDefined()
    expect(await ui.find({ text: /Waiting for 1 agent/ })).toBeDefined()
    if (surface === 'desktop') {
      const svg = await ui.find({ type: 'Svg' })
      expect(svg?.props.alt).toBe('Claude as the boss')
    }
    await ui.unmount()
  }
})

test('the band speaks Portuguese', PT, async ($, on) => {
  await boss($, on)
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await ui.find({ text: /Esperando 1 agent/ })).toBeDefined()
  await ui.unmount()
  const pane = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'pixel-crew-agents' })
  expect(await pane.find({ text: /Rodando · 1/ })).toBeDefined()
  expect(await pane.find({ text: /Concluídos · 1/ })).toBeDefined()
  await pane.unmount()
})

test('the band speaks Spanish', ES, async ($, on) => {
  await boss($, on)
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await ui.find({ text: /Esperando 1 agente/ })).toBeDefined()
  await ui.unmount()
  const pane = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'Pane', props: PANE, requestId: 'pixel-crew-agents' })
  expect(await pane.find({ text: /En curso · 1/ })).toBeDefined()
  expect(await pane.find({ text: /Terminados · 1/ })).toBeDefined()
  await pane.unmount()
})

test('a new prompt does not inherit the last turn’s 100%', EN, async ($, on) => {
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't0', reason: 'answer' } as any)

  for (const surface of ['terminal', 'desktop'] as const) {
    // the app already says "working", but turn.start has not arrived yet
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface, component: 'AbovePrompt', props: BAND })
    expect(await ui.find({ text: /100%/ })).toBeUndefined()
    expect(await ui.find({ text: /^0%$/ })).toBeDefined()
    expect(await ui.find({ text: /Thinking/ })).toBeDefined()
    await ui.unmount()
  }
})

const CONFETTI = /#F5C542|#D4537E|#378ADD|#639922|#FFF6C8|#F07A1E/

test('a finished turn celebrates with confetti', EN, async ($, on) => {
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't0', reason: 'answer' } as any)

  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await ui.find({ text: /^Done$/ })).toBeDefined()
  const mascot = (await ui.findAll({ type: 'Svg' })).find(s => s.props.alt === 'Claude mascot')
  expect(String(mascot?.props.source)).toMatch(CONFETTI)
  await ui.unmount()
})

test('an aborted turn does not celebrate', EN, async ($, on) => {
  // the band hides itself: what is beneath it (here, an empty row) draws instead
  ;(on as any)('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  on('turn.complete', async () => ({ text: '' }))
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: true, turnId: 't0', reason: 'aborted' } as any)
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: { ...BAND, isWorking: false } })
  expect(await ui.find({ text: /^Done$/ })).toBeUndefined()
  await ui.unmount()
})

test('Claude raises a hand while a question waits for you', EN, async ($, on) => {
  let seen: unknown
  ;(on as any)('tool.call', { tool: 'AskUserQuestion' }, async () => {
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    seen = await ui.find({ text: /Waiting for your answer/ })
    await ui.unmount()
    return { result: { questions: [], answers: {} } }
  })
  await ($.tool.call as any)({ tool: 'AskUserQuestion', input: { questions: [] } })
  expect(seen).toBeDefined()

  // answered: the "!" is gone
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /Waiting for your answer/ })).toBeUndefined()
  await ui.unmount()
})

test('a permission prompt shows on the band', PT, async ($, on) => {
  ;(on as any)('tool.check', async () => ({ decision: 'ask' }))
  await ($.tool.check as any)({ tool: 'Bash', input: { command: 'rm -rf build' }, tool_use_id: 'tu-1' })
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  expect(await ui.find({ text: /Esperando sua permissão/ })).toBeDefined()
  await ui.unmount()
})

test('a failed tool turns the bar red for a moment', EN, async ($, on) => {
  ;(on as any)('tool.call', { tool: 'Bash' }, async () => ({ isError: true, result: 'boom', text: 'boom' }))
  await ($.tool.call as any)({ tool: 'Bash', input: { command: 'exit 1', description: 'Run the build' } })
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: BAND })
  const svgs = await ui.findAll({ type: 'Svg' })
  expect(svgs.some(s => String(s.props.source).includes('#E24B4A'))).toBe(true)
  await ui.unmount()
})

test('/crew-bar turns the band off and on', EN, async ($, on) => {
  // with the band off, what is beneath it (here, an empty row) draws instead
  ;(on as any)('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const run = (args: string) => ($.command.run as any)({ command: 'crew-bar', args })
  const thinking = async () => {
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'desktop', component: 'AbovePrompt', props: BAND })
    const found = await ui.find({ text: /Thinking/ })
    await ui.unmount()
    return found
  }

  expect((await run('off')).text).toMatch(/Progress band off/)
  expect(await thinking()).toBeUndefined()
  expect((await run('')).text).toBe('Progress band on')
  expect(await thinking()).toBeDefined()
  expect((await run('desligar')).text).toMatch(/off/)
  expect((await run('on')).text).toBe('Progress band on')
})

// ── Terminal pixel art ───────────────────────────────────────────────────
// A Raster's cells are base64 of little-endian u32 triplets [codePoint, fg, bg];
// this decoder reads them back so a test can look at single cells.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function decodeCells(cells: string): Array<[number, number, number]> {
  const bytes: number[] = []
  const clean = cells.replace(/=+$/, '')
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map(k => (i + k < clean.length ? B64.indexOf(clean[i + k]!) : 0))
    const v = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!
    bytes.push((v >> 16) & 255, (v >> 8) & 255, v & 255)
  }
  const out: Array<[number, number, number]> = []
  const u32 = (o: number) => (bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)) >>> 0
  for (let o = 0; o + 12 <= bytes.length; o += 12) out.push([u32(o), u32(o + 4), u32(o + 8)])
  return out
}
const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584

test('a role sprite becomes half-block pixel art in the terminal', async () => {
  const r = spriteRaster('worker', 'w1')
  const cells = decodeCells(r.cells)
  expect(cells).toHaveLength(r.columns * r.rows)
  // two pixel rows per cell row, one pixel per column
  expect(r.rows).toBeLessThanOrEqual(8)
  expect(r.columns).toBeLessThanOrEqual(18)
  for (const [cp] of cells) expect([UPPER, LOWER, 0x20]).toContain(cp)
  // the hard hat's yellow and the Clawd clay are both drawn
  const colors = new Set(cells.flatMap(([, fg, bg]) => [fg, bg]))
  expect(colors.has(0xf2c230)).toBe(true)
  expect(colors.has(0xd97757)).toBe(true)
  // where no pixel is drawn the terminal's own background shows through
  expect(cells.some(([cp, fg, bg]) => cp === 0x20 && bg === DEFAULT)).toBe(true)
})

test('the terminal bar fills from the left with a highlight on top', async () => {
  const r = barRaster({ key: 'b', columns: 20, ratio: 0.5, color: '#639922', frame: 0 })
  const cells = decodeCells(r.cells)
  expect(r.rows).toBe(1)
  expect(cells).toHaveLength(20)
  // filled half: the bottom pixel is the role colour (or the sweeping glint)
  const filledBg = cells.slice(0, 10).map(([, , bg]) => bg)
  expect(filledBg.filter(bg => bg === 0x639922).length).toBeGreaterThan(5)
  // empty half: the dark track, never the role colour
  for (const [, fg, bg] of cells.slice(10)) {
    expect(bg).not.toBe(0x639922)
    expect(fg).not.toBe(0x639922)
  }
  // an indeterminate bar still draws something
  const busy = decodeCells(barRaster({ key: 'b', columns: 20, ratio: null, color: '#639922', frame: 7 }).cells)
  expect(busy.some(([, , bg]) => bg === 0x639922)).toBe(true)
})

test('the terminal panel draws each subagent as pixel art, not glyphs', EN, async ($, on) => {
  on('agent.spawn', async () => ({ model: 'claude-opus-5-5', agentId: 'agent-1' }))
  on('turn.complete', async () => ({ text: '' }))
  await $.agent.spawn({ prompt: 'go', description: 'Organize the files', subagentType: 'general-purpose' } as any)
  const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'pixel-crew-agents' })
  const rasters = await ui.findAll({ type: 'Raster' })
  // the character and its progress bar
  expect(rasters.length).toBeGreaterThanOrEqual(2)
  for (const r of rasters) expect(r.props.columns).toBeLessThanOrEqual(PANE.bodyColumns)
  expect(await ui.find({ text: /▐▛█▜▌/ })).toBeUndefined()
  expect(await ui.find({ text: /Organize the files/ })).toBeDefined()
  await ui.unmount()
})

test('the terminal band draws the mascot on a pixel bar within its rows', EN, async ($, on) => {
  await boss($, on)
  for (const maxRows of [10, 4]) {
    const ui = await $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, maxRows } })
    const raster = await ui.find({ type: 'Raster' })
    expect(raster).toBeDefined()
    expect(raster!.props.rows).toBeLessThanOrEqual(maxRows)
    expect(raster!.props.columns).toBeLessThanOrEqual(BAND.bodyColumns)
    expect(await ui.find({ text: /▐▛█▜▌/ })).toBeUndefined()
    expect(await ui.find({ text: /1\/2/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the terminal bar puts a highlight on top of the fill and never passes 512 columns', async () => {
  // #639922 mixed 45% toward white, the fill's top pixel row
  const HI = 0xa9c785
  const cells = decodeCells(barRaster({ key: 'b', columns: 30, ratio: 1, color: '#639922', frame: 0 }).cells)
  expect(cells.filter(([, fg]) => fg === HI).length).toBeGreaterThan(20)
  expect(cells.filter(([, , bg]) => bg === 0x639922).length).toBeGreaterThan(20)
  for (const columns of [512, 513, 1000]) {
    const r = barRaster({ key: 'b', columns, ratio: 0.5, color: '#639922' })
    expect(r.columns).toBe(Math.min(512, columns))
    expect(decodeCells(r.cells)).toHaveLength(r.columns)
  }
})

test('the terminal band shows the mascot, fits narrow bands and draws nothing without rows', EN, async ($, on) => {
  // beneath the plugin, an empty row: what draws when the band steps aside
  ;(on as any)('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  await boss($, on)
  const mount = (props: any) =>
    $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'AbovePrompt', props: { ...BAND, ...props } })
  // the boss's crown gold and cape purple are drawn above the bar
  let ui = await mount({})
  const raster = await ui.find({ type: 'Raster' })
  const colors = new Set(decodeCells(String(raster!.props.cells)).flatMap(([, fg, bg]) => [fg, bg]))
  expect(colors.has(0xf5c542)).toBe(true)
  expect(colors.has(0x6a4be0)).toBe(true)
  await ui.unmount()
  // the whole row fits the band at any width: the title truncates, and what
  // follows it (art, percentage, count, crew button, one gap each) is counted
  for (const bodyColumns of [3, 8, 16, 30, 100]) {
    for (const maxRows of [1, 10]) {
      ui = await mount({ bodyColumns, maxRows })
      const pctText = await ui.find({ text: /^\d+%$/ })
      expect(pctText).toBeDefined()
      const rasters = await ui.findAll({ type: 'Raster' })
      for (const r of rasters) expect(Number(r.props.rows)).toBeLessThanOrEqual(maxRows)
      const extras = [
        ...(await ui.findAll({ text: /^\d+\/\d+$/ })).map(t => String(t.text).length),
        ...(await ui.findAll({ type: 'Button' })).map(b => String(b.props.label).length),
        ...rasters.map(r => Number(r.props.columns)),
      ]
      // the title, when drawn, costs at least its gap even when truncated to nothing
      const titleGap = (await ui.find({ text: /Waiting for/ })) ? 1 : 0
      const used = String(pctText!.text).length + extras.reduce((a, w) => a + w + 1, 0) + titleGap
      expect(used).toBeLessThanOrEqual(bodyColumns)
      // a band only as wide as the percentage draws nothing else
      if (bodyColumns === 3) expect(used).toBe(3)
      // the art only joins when a few title columns are still left beside it
      if (rasters.length) expect(bodyColumns - used).toBeGreaterThanOrEqual(9)
      await ui.unmount()
    }
  }
  // too narrow even for the percentage: the band steps aside
  ui = await mount({ bodyColumns: 0 })
  expect(await ui.find({ text: /%/ })).toBeUndefined()
  await ui.unmount()
  // no rows: the band is not drawn at all; what is beneath it answers instead
  ui = await mount({ maxRows: 0 })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ text: /1\/2/ })).toBeUndefined()
  await ui.unmount()
})

test('the terminal panel keeps every Raster inside the pane at any width, with unique keys', EN, async ($, on) => {
  let n = 0
  on('agent.spawn', async () => ({ model: 'claude-opus-5-5', agentId: 'ag-' + ++n }))
  on('turn.complete', async () => ({ text: '' }))
  await $.agent.spawn({ prompt: 'a', description: 'Organize the files', subagentType: 'general-purpose' } as any)
  await $.agent.spawn({ prompt: 'b', description: 'Run the tests', subagentType: 'general-purpose' } as any)
  for (const bodyColumns of [8, 30, 50, 531, 1000]) {
    const ui = await $.ui.mount({
      plugin: 'pixel-crew',
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE, bodyColumns },
      requestId: 'pixel-crew-agents',
    })
    const rasters = await ui.findAll({ type: 'Raster' })
    const names = rasters.map(r => String(r.props['key']))
    expect(new Set(names).size).toBe(names.length)
    for (const r of rasters) expect(r.props.columns).toBeLessThanOrEqual(Math.min(512, bodyColumns))
    // a sprite and its bar sit side by side with one column of gap
    const sprites = rasters.filter(r => String(r.props['key']).startsWith('s-'))
    for (const sp of sprites) {
      const id = String(sp.props['key']).slice(2)
      const bar = rasters.find(r => r.props['key'] === 'b-' + id)
      if (bar) expect(Number(sp.props.columns) + 1 + Number(bar.props.columns)).toBeLessThanOrEqual(bodyColumns)
    }
    if (bodyColumns >= 50) expect(sprites).toHaveLength(2)
    if (bodyColumns <= 8) expect(sprites).toHaveLength(0)
    await ui.unmount()
  }
})

// ── Small terminal art ───────────────────────────────────────────────────
const CLAY_RGB = 0xd97757

/** The pixel colours of a Raster, row by row: two pixel rows per cell row. */
function pixels(r: { columns: number; rows: number; cells: string }): Array<Array<number | null>> {
  const cells = decodeCells(r.cells)
  const out: Array<Array<number | null>> = []
  for (let row = 0; row < r.rows; row++) {
    const top: Array<number | null> = []
    const bottom: Array<number | null> = []
    for (let c = 0; c < r.columns; c++) {
      const [cp, fg, bg] = cells[row * r.columns + c]!
      const paint = (v: number) => (v === DEFAULT ? null : v)
      if (cp === UPPER) top.push(paint(fg)), bottom.push(paint(bg))
      else if (cp === LOWER) top.push(paint(bg)), bottom.push(paint(fg))
      else top.push(null), bottom.push(null)
    }
    out.push(top, bottom)
  }
  return out
}

test('small sprites are half the height and keep their faces and legs', async () => {
  for (const role of ['developer', 'artist', 'researcher', 'worker', 'tester', 'codex', 'boss'] as const) {
    const r = spriteRaster(role, role, false, 0, 'small')
    expect(r.rows).toBeLessThanOrEqual(4)
    expect(r.columns).toBeLessThanOrEqual(9)
    const px = pixels(r).filter(row => row.some(p => p !== null))
    const colors = new Set(px.flat())
    if (role === 'codex') {
      // the screen face: green eyes and mouth on the dark screen
      expect(colors.has(0x10a37f)).toBe(true)
      expect(colors.has(0x111418)).toBe(true)
      continue
    }
    // two dark eyes on the clay face
    expect(colors.has(0x1f1410)).toBe(true)
    // the legs: the lowest row is three separate clay pixels
    const legs = px[px.length - 1]!
    const clay = legs.map((p, x) => (p === CLAY_RGB ? x : -1)).filter(x => x >= 0)
    expect(clay).toHaveLength(3)
    expect(clay[1]! - clay[0]!).toBeGreaterThan(1)
    expect(clay[2]! - clay[1]!).toBeGreaterThan(1)
  }
  // the developer's headphones stay visible on a dark terminal: the lighter grey, not near-black
  const dev = new Set(pixels(spriteRaster('developer', 'd', false, 0, 'small')).flat())
  expect(dev.has(0x4a505c)).toBe(true)
  expect(dev.has(0x2a2e36)).toBe(false)
})

test('the small band is five rows with the boss still crowned', async () => {
  const r = bandRaster({ key: 'b', columns: 40, maxRows: 10, role: 'boss', pose: 'walk', frame: 8, ratio: 0.5, color: '#6A4BE0', size: 'small' })
  expect(r.rows).toBe(5)
  const colors = new Set(pixels(r).flat())
  expect(colors.has(0xf5c542)).toBe(true)
  expect(colors.has(0x6a4be0)).toBe(true)
  // with only three rows the band still fits
  expect(bandRaster({ key: 'b', columns: 40, maxRows: 3, role: 'clawd', pose: 'walk', ratio: 0.2, color: '#D97757', size: 'small' }).rows).toBeLessThanOrEqual(3)
})

test('the terminal draws small art by default and /crew-size switches to full', EN, async ($, on) => {
  on('agent.spawn', async () => ({ model: 'claude-opus-5-5', agentId: 'agent-1' }))
  on('turn.complete', async () => ({ text: '' }))
  await $.agent.spawn({ prompt: 'go', description: 'Organize the files', subagentType: 'general-purpose' } as any)
  const tallest = async () => {
    const pane = await $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'Pane', props: PANE, requestId: 'pixel-crew-agents' })
    const sprite = (await pane.findAll({ type: 'Raster' })).find(r => String(r.props['key']).startsWith('s-'))
    await pane.unmount()
    const band = await $.ui.mount({ plugin: 'pixel-crew', surface: 'terminal', component: 'AbovePrompt', props: BAND })
    const art = await band.find({ type: 'Raster' })
    await band.unmount()
    return { sprite: Number(sprite!.props.rows), band: Number(art!.props.rows) }
  }
  const run = (args: string) => ($.command.run as any)({ command: 'crew-size', args })

  expect(await tallest()).toEqual({ sprite: expect.any(Number), band: 5 })
  expect((await tallest()).sprite).toBeLessThanOrEqual(4)
  expect((await run('full')).text).toMatch(/full/i)
  const full = await tallest()
  expect(full.sprite).toBeGreaterThan(4)
  expect(full.band).toBe(9)
  expect((await run('')).text).toMatch(/small/i)
  expect((await tallest()).band).toBe(5)
})
