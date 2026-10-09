import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PcAgent, PcMain, PcRole, PcTask } from '../types'
import { barSvg, barText, CLAY, ROLES, spriteSvg, TERM_SPRITE } from './art'

const PANE = 'pixel-crew-agents'
const CONTEXT_WINDOW = 200_000

// Preço aproximado em US$ por milhão de tokens: entrada, saída, leitura de cache, escrita de cache
const PRICES: Array<[RegExp, [number, number, number, number]]> = [
  [/haiku/i, [1, 5, 0.1, 1.25]],
  [/sonnet/i, [3, 15, 0.3, 3.75]],
  [/opus|fable/i, [5, 25, 0.5, 6.25]],
]

const tasks = atom({ plugin: 'pixel-crew', key: 'tasks' } as const, [])
const agents = atom({ plugin: 'pixel-crew', key: 'agents' } as const, [])
const now = atom({ plugin: 'pixel-crew', key: 'now' } as const, 0)
const frame = atom({ plugin: 'pixel-crew', key: 'frame' } as const, 0)
const showDone = atom({ plugin: 'pixel-crew', key: 'showDone' } as const, true)
const IDLE: PcMain = { activity: '', steps: 0, tools: 0, working: false, done: false }
const main = atom({ plugin: 'pixel-crew', key: 'main' } as const, IDLE)
// início do lote atual de subagents: os que começaram desde que nenhum rodava
const batchStart = atom({ plugin: 'pixel-crew', key: 'batchStart' } as const, 0)

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
  model: string
}

type SubRole = Exclude<PcRole, 'boss' | 'codex'>

// em empate, vale a ordem desta lista
const ROLE_WORDS: Array<[SubRole, RegExp]> = [
  ['tester', /(test|verif|\bqa\b|debug|\bbug|valid|review|revis|audit)/],
  ['artist', /(design|desenh|\bart|graphic|gráfic|grafic|\bimag|\bicon|ícone|logo|visual|\bui\b|\bux\b|style|estilo|\bcss|ilustr|illustr|\banim)/],
  ['researcher', /(research|pesquis|explor|search|busca|investig|\bfind|encontr|\bdocs|analy|anális|analis|competi|concorr|\bread|\bler\b|\bplan|coorden|coordinat|architect|arquitet)/],
  ['developer', /(build|implement|\bcode|códig|codig|\bfix|corrig|refactor|refator|feature|\bapi\b|endpoint|component|página|pagina|\bpage|landing|script|develop|desenvolv|\bcri[ae]r?\b|create|write|escrev)/],
]

function earliestRole(text: string): SubRole | undefined {
  let best: SubRole | undefined
  let at = Infinity
  for (const [role, re] of ROLE_WORDS) {
    const i = text.search(re)
    if (i >= 0 && i < at) {
      at = i
      best = role
    }
  }
  return best
}

/**
 * O papel de um subagent: o da palavra-chave que aparece primeiro na descrição
 * (normalmente o verbo principal), depois no tipo do agent. O boss nunca sai
 * daqui: ele é o agent principal, que delega; revisões vão para o tester e
 * planejamento para o researcher.
 */
export function roleOf(type: string, description: string): Exclude<PcRole, 'boss'> {
  const d = description.toLowerCase()
  const t = type.toLowerCase()
  if (/codex/.test(`${t} ${d}`)) return 'codex'
  return earliestRole(d) ?? earliestRole(t) ?? 'worker'
}

function priceOf(model: string): [number, number, number, number] {
  return PRICES.find(([re]) => re.test(model))?.[1] ?? PRICES[2]![1]
}

function shortModel(model: string): string {
  const m = model.replace(/^claude-/, '').replace(/\[.*\]$/, '')
  const match = /^(opus|sonnet|haiku|fable)-(\d+)-(\d+)/i.exec(m)
  if (match) return `${match[1]![0]!.toUpperCase()}${match[1]!.slice(1)} ${match[2]}.${match[3]}`
  return m
}

function effortLabel(effort: string | undefined): string {
  return effort ? ` · ${effort}` : ''
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function fmtTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function fmtCost(usd: number): string {
  return `≈$${usd.toFixed(2)}`
}

function ratioOf(list: readonly PcTask[]): number | null {
  if (list.length === 0) return null
  return list.filter(t => t.status === 'completed').length / list.length
}

/**
 * Progresso estimado quando não há lista de tarefas: cresce rápido no começo e
 * desacelera a cada passo do modelo ou ação, sem passar de 90% até terminar.
 */
export function estimate(work: number): number {
  return 0.9 * (1 - Math.exp(-work / 8))
}

export function agentRatio(a: PcAgent): number {
  if (a.status === 'done') return 1
  const real = ratioOf(a.tasks)
  if (real !== null) return real
  return estimate(a.steps + a.tools)
}

function base(path: unknown): string {
  return String(path ?? '').split(/[\\/]/).pop() || 'arquivo'
}

/** Uma frase curta do que uma ferramenta do agent principal está fazendo. */
export function activityOf(tool: string, input: any): string {
  switch (tool) {
    case 'Read':
      return `Lendo ${base(input?.file_path)}`
    case 'Edit':
    case 'MultiEdit':
      return `Editando ${base(input?.file_path)}`
    case 'Write':
      return `Escrevendo ${base(input?.file_path)}`
    case 'Bash':
    case 'PowerShell':
      return String(input?.description || 'Rodando um comando')
    case 'Grep':
    case 'Glob':
      return 'Procurando no código'
    case 'Agent':
    case 'Task':
      return `Delegando: ${String(input?.description || 'subagent')}`
    case 'WebSearch':
    case 'WebFetch':
      return 'Pesquisando na web'
    case 'Skill':
      return `Usando a skill ${String(input?.skill || '')}`.trim()
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Organizando as tarefas'
    case 'AskUserQuestion':
      return 'Esperando sua resposta'
    default:
      return tool.startsWith('mcp__') ? `Usando ${tool.split('__').pop()}` : `Usando ${tool}`
  }
}

function applyTaskTool(list: readonly PcTask[], tool: string, input: any, result: any): PcTask[] | null {
  if (tool === 'TodoWrite' && Array.isArray(input?.todos)) {
    return input.todos.map((t: any, i: number) => ({
      id: String(i),
      subject: String(t.content ?? ''),
      status: t.status,
      activeForm: t.activeForm,
    }))
  }
  if (tool === 'TaskCreate') {
    const id = result?.task?.id
    if (!id) return null
    return [...list, { id: String(id), subject: String(input?.subject ?? ''), status: 'pending', activeForm: input?.activeForm }]
  }
  if (tool === 'TaskUpdate' && input?.taskId) {
    const id = String(input.taskId)
    if (input.status === 'deleted') return list.filter(t => t.id !== id)
    return list.map(t =>
      t.id === id
        ? {
            ...t,
            status: input.status ?? t.status,
            subject: input.subject ?? t.subject,
            activeForm: input.activeForm ?? t.activeForm,
          }
        : t,
    )
  }
  return null
}

async function patchAgent($: EngineInterface, id: string, fn: (a: PcAgent) => PcAgent) {
  await update($, agents, list => list.map(a => (a.id === id ? fn(a) : a)))
}

async function addAgent($: EngineInterface, agent: PcAgent) {
  const before = await read($, agents)
  const wasIdle = !before.some(a => a.status === 'running')
  await update($, agents, list => [...list.filter(a => a.id !== agent.id), agent].slice(-40))
  await update($, now, () => agent.startedAt)
  if (wasIdle) {
    await update($, batchStart, () => agent.startedAt)
    $.ui.open({ id: PANE, title: 'Agents' }).catch(() => {})
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'crew', description: 'Abre o painel dos subagents (pixel-crew)' })
    await $.command.register({ name: 'crew-limpar', description: 'Limpa as tarefas e os agents do pixel-crew' })

    // Relógio da animação: troca o quadro ~3x por segundo enquanto há agent
    // rodando ou tarefa em andamento; parado, não escreve nada.
    let ticks = 0
    $.clock.every(300, () => {
      void (async () => {
        const list = await read($, agents)
        const busy = list.some(a => a.status === 'running')
        const working =
          (await read($, main)).working || (await read($, tasks)).some(t => t.status === 'in_progress')
        if (!busy && !working) return
        await update($, frame, n => (n + 1) % 100000)
        if (!busy) return
        ticks += 1
        if (ticks % 3 === 0) await update($, now, () => Date.now())
        // a cada ~5s confere com a lista do engine (agents interrompidos ou mortos)
        if (ticks % 15 !== 0) return
        const live = await $.agent.list()
        const ended = new Map(
          live
            .filter(a => a.status === 'completed' || a.status === 'failed' || a.status === 'killed')
            .map(a => [a.id, a.status]),
        )
        if (ended.size === 0) return
        const t = Date.now()
        await update($, agents, all =>
          all.map(a =>
            a.status === 'running' && ended.has(a.id)
              ? { ...a, status: ended.get(a.id) === 'completed' ? ('done' as const) : ('failed' as const), endedAt: t }
              : a,
          ),
        )
      })().catch(() => {})
    })

    return next(e)
  })

  on('command.run', { command: 'crew' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agents' })
    return { text: 'Painel dos agents aberto.' }
  })

  on('command.run', { command: 'crew-limpar' }, async $ => {
    await update($, tasks, () => [])
    await update($, agents, () => [])
    return { text: 'pixel-crew limpo.' }
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      if (r.agentId) {
        await addAgent($, {
          id: r.agentId,
          description: e.description || e.subagentType,
          type: e.subagentType,
          role: roleOf(e.subagentType, e.description),
          model: r.model,
          status: 'running',
          startedAt: Date.now(),
          tokens: 0,
          costUsd: 0,
          ctxTokens: 0,
          steps: 0,
          tools: 0,
          tasks: [],
        })
      }
    } catch {}
    return r
  })

  // ── O agent principal: um turno começa, dá passos e termina ─────────────
  // zera já no envio do prompt: o app marca "trabalhando" antes do turn.start,
  // e sem isso a faixa mostraria por um instante os 100% do turno anterior
  on('prompt.submit', async ($, e, next) => {
    await update($, main, () => ({ activity: 'Pensando', steps: 0, tools: 0, working: true, done: false })).catch(
      () => {},
    )
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, main, () => ({ activity: 'Pensando', steps: 0, tools: 0, working: true, done: false })).catch(
      () => {},
    )
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (!e.agentId) {
      await update($, main, m => ({ ...m, working: true, done: false })).catch(() => {})
    }
    const r = yield* next(e)
    if (!e.agentId) {
      await update($, main, m => ({ ...m, steps: m.steps + 1 })).catch(() => {})
    }
    if (e.agentId && r?.usage) {
      const u = r.usage as Usage
      const [pi, po, pr, pw] = priceOf(u.model || e.model)
      const cost =
        (u.input_tokens * pi + u.output_tokens * po + u.cache_read_input_tokens * pr + u.cache_creation_input_tokens * pw) /
        1_000_000
      const fresh = u.input_tokens + u.output_tokens + u.cache_creation_input_tokens
      const ctx = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      await patchAgent($, e.agentId, a => ({
        ...a,
        model: u.model || a.model,
        effort: e.effort === undefined ? a.effort : String(e.effort),
        tokens: a.tokens + fresh,
        costUsd: a.costUsd + cost,
        ctxTokens: ctx,
        steps: a.steps + 1,
      })).catch(() => {})
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const id = e.agentId
      const failed = e.reason === 'error' || e.reason === 'aborted' || e.reason === 'refusal'
      await patchAgent($, id, a => ({
        ...a,
        status: failed ? 'failed' : 'done',
        endedAt: Date.now(),
        tasks: failed ? a.tasks : a.tasks.map(t => ({ ...t, status: 'completed' as const })),
      })).catch(() => {})
    } else {
      await update($, main, m => ({ ...m, activity: 'Pronto', working: false, done: true })).catch(() => {})
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const input = (e as any).input
    const agentId = e.agentId
    const isCodexBash = !agentId && tool === 'Bash' && /codex/i.test(String(input?.command ?? ''))

    if (isCodexBash) {
      await addAgent($, {
        id: e.tool_use_id,
        description: String(input?.description ?? 'Tarefa delegada ao Codex'),
        type: 'codex',
        role: 'codex',
        model: 'codex',
        status: 'running',
        startedAt: Date.now(),
        tokens: 0,
        costUsd: 0,
        ctxTokens: 0,
        steps: 0,
        tools: 0,
        tasks: [],
      }).catch(() => {})
    }
    if (agentId) {
      await patchAgent($, agentId, a => ({ ...a, tools: a.tools + 1, phase: activityOf(tool, input) })).catch(() => {})
    } else {
      const activity = activityOf(tool, input)
      await update($, main, m => ({ ...m, activity, tools: m.tools + 1, working: true, done: false })).catch(() => {})
    }

    const r = await next(e)

    if (!agentId) {
      await update($, main, m => (m.working ? { ...m, activity: 'Pensando' } : m)).catch(() => {})
    }

    try {
      if (isCodexBash) {
        await patchAgent($, e.tool_use_id, a => ({
          ...a,
          status: (r as any).isError || (r as any).deny ? 'failed' : 'done',
          endedAt: Date.now(),
        }))
      }
      if (!(r as any).deny && /^(TodoWrite|TaskCreate|TaskUpdate)$/.test(tool)) {
        const result = (r as any).result
        if (agentId) {
          await patchAgent($, agentId, a => ({ ...a, tasks: applyTaskTool(a.tasks, tool, input, result) ?? a.tasks }))
        } else {
          await update($, tasks, list => applyTaskTool(list, tool, input, result) ?? list)
        }
      }
    } catch {}
    return r
  })

  // ── Faixa acima do prompt ──────────────────────────────────────────────
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, tasks)
    const crew = await read($, agents)
    const stored = await read($, main)
    // o app já diz "trabalhando" mas o estado ainda é do turno que acabou: é um turno novo
    const m: PcMain =
      e.props.isWorking && !stored.working
        ? { activity: 'Pensando', steps: 0, tools: 0, working: true, done: false }
        : stored
    const since = await read($, batchStart)
    const running = crew.filter(a => a.status === 'running').length
    const isWorking = m.working || e.props.isWorking
    if (e.props.hasSurvey || (list.length === 0 && running === 0 && !isWorking)) return next(e)

    const f = await read($, frame)
    // o lote atual de subagents: os que começaram desde que nenhum rodava
    const batch = crew.filter(a => a.startedAt >= since)
    const delegating = running > 0
    const doneTasks = list.filter(t => t.status === 'completed').length

    // progresso: lista de tarefas > média dos subagents do lote > estimativa do turno
    const ratio = list.length
      ? doneTasks / list.length
      : delegating && batch.length
        ? batch.reduce((s, a) => s + agentRatio(a), 0) / batch.length
        : m.done
          ? 1
          : estimate(m.steps + m.tools)
    const pct = `${Math.round(ratio * 100)}%`
    const count = delegating
      ? `${batch.filter(a => a.status !== 'running').length}/${batch.length}`
      : list.length
        ? `${doneTasks}/${list.length}`
        : ''

    const active = list.find(t => t.status === 'in_progress')
    const title = isWorking
      ? m.activity && m.activity !== 'Pensando'
        ? m.activity
        : active?.activeForm || 'Pensando'
      : delegating
        ? `Esperando ${running} ${running === 1 ? 'agent' : 'agents'}`
        : active?.activeForm || active?.subject || 'Tarefas'

    const color = delegating ? ROLES.boss.color : CLAY
    const els: any = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const openPane = () => $.ui.open({ id: PANE, title: 'Agents' }).catch(() => {})

    if (e.surface === 'terminal') {
      const cols = Math.max(10, Math.min(40, e.props.bodyColumns - title.length - 24))
      const bar = barText(cols, ratio)
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={color}>{delegating ? '▐▛█▜▌♛' : '▐▛█▜▌'}</Text>
          <Text bold wrap="truncate">{title}</Text>
          <Text color={color}>{bar.on}</Text>
          <Text dimColor>{bar.off}</Text>
          <Text bold>{pct}</Text>
          {count !== '' && <Text dimColor>{count}</Text>}
          {crew.length > 0 && <Button key="crew" plain label={`×${crew.length}`} onPress={openPane} />}
        </Box>
      )
    }

    const { Svg } = els
    // o Claude vira o boss (maior, de coroa e gravata) enquanto delega
    const sprite = delegating
      ? spriteSvg('boss', 3, true, f)
      : spriteSvg('clawd', 2, isWorking, f)
    return (
      <Box flexDirection="row" alignItems="center" gap={1} paddingX={1}>
        <Box flexShrink={0} alignItems="center" justifyContent="center">
          <Svg source={sprite.source} alt={delegating ? 'Claude como boss' : 'Mascote do Claude'} width={sprite.width} height={sprite.height} />
        </Box>
        <Box width="30%" flexShrink={0} overflow="hidden">
          <Text bold wrap="truncate">{title}</Text>
        </Box>
        <Box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden" justifyContent="center">
          <Svg source={barSvg({ ratio, color, frame: f })} alt={`Progresso: ${pct}`} height={12} />
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1} alignItems="center">
          <Text bold>{pct}</Text>
          {count !== '' && <Text dimColor>{count}</Text>}
          {crew.length > 0 && <Button key="crew" plain label={`×${crew.length}`} onPress={openPane} />}
        </Box>
      </Box>
    )
  })

  // ── Painel lateral dos agents ─────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const crew = await read($, agents)
    const t = await read($, now)
    const f = await read($, frame)
    const expanded = await read($, showDone)
    const els: any = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const isTerm = e.surface === 'terminal'
    const clock = Math.max(t, Date.now())

    const running = crew.filter(a => a.status === 'running')
    const finished = crew.filter(a => a.status !== 'running')
    const cost = crew.reduce((s, a) => s + a.costUsd, 0)
    const tokensTotal = crew.reduce((s, a) => s + a.tokens, 0)
    const first = crew.reduce((m, a) => Math.min(m, a.startedAt), Infinity)
    const last = running.length ? clock : crew.reduce((m, a) => Math.max(m, a.endedAt ?? a.startedAt), 0)
    const elapsed = crew.length ? last - first : 0
    const mainTasks = await read($, tasks)
    const kit = mainTasks.find(x => x.status === 'in_progress')?.subject ?? (crew.length ? 'Equipe' : 'Nenhum agent ainda')

    const metric = (label: string, value: string, key: string) => (
      <Box key={key} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} flexGrow={1}>
        <Text dimColor>{label}</Text>
        <Text bold>{value}</Text>
      </Box>
    )

    const row = (a: PcAgent) => {
      const info = ROLES[a.role]
      const doneN = a.tasks.filter(x => x.status === 'completed').length
      const ratio = a.status === 'failed' ? (ratioOf(a.tasks) ?? estimate(a.steps + a.tools)) : agentRatio(a)
      const progress = a.tasks.length
        ? `${doneN}/${a.tasks.length}`
        : a.status === 'running'
          ? `${a.tools} ${a.tools === 1 ? 'ação' : 'ações'}`
          : a.status === 'done'
            ? 'pronto'
            : 'falhou'
      const phase = a.status === 'running' ? (a.tasks.find(x => x.status === 'in_progress')?.activeForm ?? a.phase ?? 'Começando') : ''
      const ctxPct = Math.round((a.ctxTokens / CONTEXT_WINDOW) * 100)
      const took = fmtTime((a.endedAt ?? clock) - a.startedAt)
      const stats = a.role === 'codex' && a.steps === 0
        ? took
        : `ctx ${ctxPct}%  ${fmtTokens(a.tokens)} ${fmtCost(a.costUsd)} ${took}`
      const mark = a.status === 'running' ? '●' : a.status === 'done' ? '✓' : '✗'
      const markColor = a.status === 'running' ? CLAY : a.status === 'done' ? '#3FB27F' : '#E24B4A'
      const sub = `${a.role === 'codex' ? 'Codex' : shortModel(a.model)}${effortLabel(a.effort)}`

      if (isTerm) {
        const bar = barText(Math.max(10, e.props.bodyColumns - 4), ratio)
        return (
          <Box key={`a-${a.id}`} flexDirection="column" marginBottom={1}>
            <Box flexDirection="row" justifyContent="space-between">
              <Box flexDirection="row" gap={1}>
                <Text color={info.color}>{TERM_SPRITE[a.role]}</Text>
                <Text bold wrap="truncate">{a.description}</Text>
              </Box>
              <Text color={markColor}>{mark}</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text color={info.color}>{info.label}</Text>
              <Text dimColor>{sub}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor wrap="truncate">{progress}{phase ? ` · ${phase}` : ''}</Text>
              <Text dimColor>{stats}</Text>
            </Box>
            <Box flexDirection="row">
              <Text color={info.color}>{bar.on}</Text>
              <Text dimColor>{bar.off}</Text>
            </Box>
          </Box>
        )
      }

      const { Svg } = els
      const sprite = spriteSvg(a.role, 2, a.status === 'running', f)
      return (
        <Box key={`a-${a.id}`} flexDirection="row" gap={1} paddingY={1} alignItems="flex-start">
          <Box flexShrink={0} alignItems="center">
            <Svg source={sprite.source} alt={`Personagem ${info.label}`} width={sprite.width} height={sprite.height} />
          </Box>
          <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Text bold wrap="truncate">{a.description}</Text>
              <Text color={markColor}>{mark}</Text>
            </Box>
            <Box flexDirection="row" gap={1}>
              <Text color={info.color}>{info.label}</Text>
              <Text dimColor>{sub}</Text>
            </Box>
            <Box flexDirection="row" justifyContent="space-between" gap={1}>
              <Text dimColor wrap="truncate">{progress}{phase ? ` · ${phase}` : ''}</Text>
              <Text dimColor>{stats}</Text>
            </Box>
            <Box marginTop={1} overflow="hidden">
              <Svg source={barSvg({ ratio, color: info.color, frame: f })} alt={`Progresso de ${a.description}`} height={6} />
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{kit}</Text>
        <Box flexDirection="row" gap={1}>
          {metric('Custo', fmtCost(cost), 'm-cost')}
          {metric('Tokens', fmtTokens(tokensTotal), 'm-tok')}
          {metric('Tempo', fmtTime(elapsed), 'm-time')}
        </Box>
        <Text dimColor>Rodando · {running.length}</Text>
        {running.length === 0 && <Text dimColor>Nenhum agent trabalhando agora.</Text>}
        {running.map(row)}
        {finished.length > 0 && (
          <Button
            key="toggle-done"
            plain
            label={`${expanded ? '▾' : '▸'} Concluídos · ${finished.length}`}
            onPress={() => update($, showDone, v => !v)}
          />
        )}
        {expanded && finished.slice().reverse().map(row)}
      </Box>
    )
  })
}
