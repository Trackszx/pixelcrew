import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { PcAgent, PcFx, PcMain, PcRole, PcTask } from '../types'
import { barSvg, barText, CLAY, mascotSvg, ROLES, spriteSvg, TERM_SPRITE } from './art'
import type { Pose } from './art'
import { langOf, strings, systemLang } from './i18n'
import type { Lang, Strings } from './i18n'

const PANE = 'pixel-crew-agents'

// the texts in the language picked when the module loaded (see register)
let L: Strings = strings('en')
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
const CALM: PcFx = { celebrateUntil: 0, errorUntil: 0, asking: null }
const fx = atom({ plugin: 'pixel-crew', key: 'fx' } as const, CALM)

const CELEBRATE_MS = 2500
const SHAKE_MS = 1200
const ERROR = '#E24B4A'

// A barra da faixa desliza até o progresso novo em vez de pular: a cada
// desenho anda uma fração do que falta, pelo tempo passado (não pelo número de
// desenhos). Voltar (um turno novo) é na hora.
let shown = -1
let shownAt = 0
let settling = false

export function glide(target: number, t = Date.now()): number {
  if (shown < 0 || target < shown) shown = target
  else {
    const dt = Math.min(300, Math.max(0, t - shownAt))
    shown += (target - shown) * (1 - Math.exp(-dt / 450))
    if (target - shown < 0.005) shown = target
  }
  shownAt = t
  settling = shown !== target
  return shown
}

/** Esquece onde a barra estava: o próximo desenho vai direto ao progresso. */
export function resetGlide() {
  shown = -1
  settling = false
}

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
  ['tester', /(test|verif|\bqa\b|debug|\bbug|valid|review|revis|audit|prueb|probar|depur)/],
  ['artist', /(design|\bdraw|desenh|diseñ|disen|dibuj|\bart|graphic|gráfic|grafic|\bimag|\bicon|ícone|logo|visual|\bui\b|\bux\b|style|estilo|\bcss|ilustr|illustr|\banim)/],
  ['researcher', /(research|pesquis|explor|search|busca|investig|\bfind|encontr|\bdocs|analy|anális|analis|analiz|competi|concorr|\bread|\bler\b|\bplan|coorden|coordinat|architect|arquitet)/],
  ['developer', /(build|implement|\bcode|códig|codig|\bfix|corrig|correg|arregl|refactor|refator|feature|\bapi\b|endpoint|component|página|pagina|\bpage|landing|script|develop|desenvolv|\bcri[ae]r?\b|\bcrea|create|write|escrev|escrib|constru)/],
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
  return String(path ?? '').split(/[\\/]/).pop() || L.file
}

/** Uma frase curta do que uma ferramenta do agent principal está fazendo. */
export function activityOf(tool: string, input: any, s: Strings = L): string {
  switch (tool) {
    case 'Read':
      return s.reading(base(input?.file_path))
    case 'Edit':
    case 'MultiEdit':
      return s.editing(base(input?.file_path))
    case 'Write':
      return s.writing(base(input?.file_path))
    case 'Bash':
    case 'PowerShell':
      return String(input?.description || s.runningCommand)
    case 'Grep':
    case 'Glob':
      return s.searchingCode
    case 'Agent':
    case 'Task':
      return s.delegating(String(input?.description || 'subagent'))
    case 'WebSearch':
    case 'WebFetch':
      return s.searchingWeb
    case 'Skill':
      return s.usingSkill(String(input?.skill || '')).replace(/\s+/g, ' ').trim()
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return s.organizingTasks
    case 'AskUserQuestion':
      return s.waitingForYou
    default:
      return s.using(tool.startsWith('mcp__') ? String(tool.split('__').pop()) : tool)
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

export const register: Register = (on, options) => {
  // language: the option, or with "auto" (the default) the system's, refined
  // at session start by Claude Code's own "language" setting and LANG/LC_*
  const choice = String(options.language ?? 'auto')
  const fixed = choice === 'auto' ? undefined : langOf(choice)
  let lang: Lang = fixed ?? systemLang() ?? 'en'
  L = strings(lang)

  on('session.start', async ($, e, next) => {
    if (!fixed) {
      try {
        const settings: any = await $.settings.read()
        const found =
          langOf(settings?.language) ??
          langOf(await $.env.get('LC_ALL')) ??
          langOf(await $.env.get('LC_MESSAGES')) ??
          langOf(await $.env.get('LANG'))
        if (found && found !== lang) {
          lang = found
          L = strings(lang)
        }
      } catch {}
    }
    await $.command.register({ name: 'crew', description: L.cmdCrew })
    await $.command.register({ name: 'crew-clear', description: L.cmdClear })

    // Relógio da animação: troca o quadro ~3x por segundo enquanto há agent
    // rodando ou tarefa em andamento; parado, não escreve nada.
    let ticks = 0
    let idle = 0
    $.clock.every(300, () => {
      void (async () => {
        const list = await read($, agents)
        const busy = list.some(a => a.status === 'running')
        const list2 = await read($, tasks)
        const working = (await read($, main)).working || list2.some(t => t.status === 'in_progress')
        const effects = await read($, fx)
        const t0 = Date.now()
        // comemoração, tremida e a barra deslizando também animam; com um
        // quadro a mais no fim, para a faixa sumir quando a comemoração acaba
        const lively =
          settling || effects.asking !== null || t0 < effects.celebrateUntil + 400 || t0 < effects.errorUntil + 400
        if (!busy && !working && !lively) {
          // dormindo (tarefas na faixa, ninguém trabalhando): o "zz" respira devagar
          if (list2.length && ++idle % 3 === 0) await update($, frame, n => (n + 1) % 100000)
          return
        }
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
    return { text: L.paneOpened }
  })

  on('command.run', { command: 'crew-clear' }, async $ => {
    await update($, tasks, () => [])
    await update($, agents, () => [])
    return { text: L.cleared }
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
    await update($, main, () => ({ activity: L.thinking, steps: 0, tools: 0, working: true, done: false })).catch(
      () => {},
    )
    await update($, fx, () => CALM).catch(() => {})
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await update($, main, () => ({ activity: L.thinking, steps: 0, tools: 0, working: true, done: false })).catch(
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
      await update($, main, m => ({ ...m, activity: L.done, working: false, done: true })).catch(() => {})
      // fim do turno: confete, se terminou bem e ninguém da equipe ainda trabalha
      const ok = e.reason !== 'error' && e.reason !== 'aborted' && e.reason !== 'refusal'
      const crewBusy = (await read($, agents).catch(() => [] as PcAgent[])).some(a => a.status === 'running')
      await update($, fx, f => ({
        ...f,
        asking: null,
        celebrateUntil: ok && !crewBusy ? Date.now() + CELEBRATE_MS : 0,
      })).catch(() => {})
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
        description: String(input?.description ?? L.codexTask),
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

    const asks = tool === 'AskUserQuestion' || tool === 'ExitPlanMode'
    if (asks) await update($, fx, f => ({ ...f, asking: 'question' as const })).catch(() => {})

    const r = await next(e)

    // respondida (ou recusada) a pergunta ou a permissão, o "!" sai; uma
    // ferramenta do agent principal que falhou faz o mascote tremer
    const failed = !agentId && (r as any).isError === true
    await update($, fx, f =>
      f.asking || failed ? { ...f, asking: null, errorUntil: failed ? Date.now() + SHAKE_MS : f.errorUntil } : f,
    ).catch(() => {})
    if (!agentId) {
      await update($, main, m => (m.working ? { ...m, activity: L.thinking } : m)).catch(() => {})
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

  // um pedido de permissão: o Claude (ou um subagent) espera você aprovar
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision === 'ask' && e.tool_use_id) {
      await update($, fx, f => ({ ...f, asking: f.asking ?? ('permission' as const) })).catch(() => {})
    }
    return r
  })

  // ── Faixa acima do prompt ──────────────────────────────────────────────
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, tasks)
    const crew = await read($, agents)
    const stored = await read($, main)
    const effects = await read($, fx)
    // o app já diz "trabalhando" mas o estado ainda é do turno que acabou: é um turno novo
    const fresh = e.props.isWorking && !stored.working
    const m: PcMain = fresh ? { activity: L.thinking, steps: 0, tools: 0, working: true, done: false } : stored
    const since = await read($, batchStart)
    const running = crew.filter(a => a.status === 'running').length
    const isWorking = m.working || e.props.isWorking
    const t = Date.now()
    const celebrating = !fresh && !isWorking && t < effects.celebrateUntil
    const asking = effects.asking
    if (e.props.hasSurvey || (list.length === 0 && running === 0 && !isWorking && !celebrating && !asking)) {
      return next(e)
    }

    const f = await read($, frame)
    // o lote atual de subagents: os que começaram desde que nenhum rodava
    const batch = crew.filter(a => a.startedAt >= since)
    const delegating = running > 0
    const doneTasks = list.filter(x => x.status === 'completed').length

    // progresso: lista de tarefas > média dos subagents do lote > estimativa do turno
    const target = list.length
      ? doneTasks / list.length
      : delegating && batch.length
        ? batch.reduce((s, a) => s + agentRatio(a), 0) / batch.length
        : m.done || celebrating
          ? 1
          : estimate(m.steps + m.tools)
    const ratio = glide(target, t)
    const pct = `${Math.round(ratio * 100)}%`
    const count = delegating
      ? `${batch.filter(a => a.status !== 'running').length}/${batch.length}`
      : list.length
        ? `${doneTasks}/${list.length}`
        : ''

    // o que o mascote faz: esperar você > tremer > comemorar > andar > dormir
    const shaking = t < effects.errorUntil
    const pose: Pose = asking
      ? 'alert'
      : shaking
        ? 'shake'
        : celebrating
          ? 'jump'
          : isWorking || delegating
            ? 'walk'
            : 'sleep'

    const active = list.find(x => x.status === 'in_progress')
    const title = asking
      ? asking === 'permission'
        ? L.needsPermission
        : L.waitingForYou
      : celebrating
        ? L.done
        : isWorking
          ? m.activity && m.activity !== L.thinking
            ? m.activity
            : active?.activeForm || L.thinking
          : delegating
            ? L.waiting(running)
            : active?.activeForm || active?.subject || L.tasks

    const color = shaking ? ERROR : delegating ? ROLES.boss.color : CLAY
    const els: any = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const openPane = () => $.ui.open({ id: PANE, title: 'Agents' }).catch(() => {})

    if (e.surface === 'terminal') {
      const cols = Math.max(10, Math.min(40, e.props.bodyColumns - title.length - 24))
      const bar = barText(cols, ratio)
      const mood = { walk: '', jump: ' ✦', sleep: ' zz', alert: ' !', shake: ' ✗' }[pose]
      return (
        <Box flexDirection="row" gap={1}>
          <Text color={color}>{`${delegating ? '▐▛█▜▌♛' : '▐▛█▜▌'}${mood}`}</Text>
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
    // o mascote anda em cima da barra, na ponta do que já está pronto: dois
    // espaçadores dividem a sobra na proporção do progresso. Enquanto delega
    // ele é o boss, de coroa e capa.
    const sprite = delegating ? mascotSvg('boss', pose, f, 3) : mascotSvg('clawd', pose, f, 2)
    return (
      <Box flexDirection="row" alignItems="center" gap={1} paddingX={1}>
        <Box width="30%" flexShrink={0} overflow="hidden">
          <Text bold wrap="truncate">{title}</Text>
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
          <Box flexDirection="row" alignItems="flex-end">
            <Box flexGrow={ratio} flexShrink={1} />
            <Box flexShrink={0}>
              <Svg
                source={sprite.source}
                alt={delegating ? L.altBoss : L.altMascot}
                width={sprite.width}
                height={sprite.height}
              />
            </Box>
            <Box flexGrow={1 - ratio} flexShrink={1} />
          </Box>
          <Box overflow="hidden" justifyContent="center">
            <Svg source={barSvg({ ratio, color, frame: f })} alt={L.altProgress(pct)} height={12} />
          </Box>
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
    const kit = mainTasks.find(x => x.status === 'in_progress')?.subject ?? (crew.length ? L.team : L.noAgentsYet)

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
          ? L.actions(a.tools)
          : a.status === 'done'
            ? L.ready
            : L.failed
      const phase = a.status === 'running' ? (a.tasks.find(x => x.status === 'in_progress')?.activeForm ?? a.phase ?? L.starting) : ''
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
            <Svg source={sprite.source} alt={L.altCharacter(info.label)} width={sprite.width} height={sprite.height} />
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
              <Svg source={barSvg({ ratio, color: info.color, frame: f })} alt={L.altProgress(a.description)} height={6} />
            </Box>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{kit}</Text>
        <Box flexDirection="row" gap={1}>
          {metric(L.cost, fmtCost(cost), 'm-cost')}
          {metric(L.tokens, fmtTokens(tokensTotal), 'm-tok')}
          {metric(L.time, fmtTime(elapsed), 'm-time')}
        </Box>
        <Text dimColor>{L.running(running.length)}</Text>
        {running.length === 0 && <Text dimColor>{L.nobodyWorking}</Text>}
        {running.map(row)}
        {finished.length > 0 && (
          <Button
            key="toggle-done"
            plain
            label={`${expanded ? '▾' : '▸'} ${L.finished(finished.length)}`}
            onPress={() => update($, showDone, v => !v)}
          />
        )}
        {expanded && finished.slice().reverse().map(row)}
      </Box>
    )
  })
}
