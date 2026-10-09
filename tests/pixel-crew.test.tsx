import { expect, test } from 'claude-code/testing'

import { langOf, strings } from '../hooks/i18n'
import { activityOf, estimate, roleOf } from '../hooks/register'

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

test('the band follows the task list', EN, async ($, on) => {
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
