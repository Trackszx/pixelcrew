export type PcStatus = 'pending' | 'in_progress' | 'completed'

export type PcTask = {
  id: string
  subject: string
  status: PcStatus
  activeForm?: string
}

export type PcRole =
  | 'developer'
  | 'artist'
  | 'researcher'
  | 'worker'
  | 'boss'
  | 'tester'
  | 'codex'

export type PcAgent = {
  id: string
  description: string
  type: string
  role: PcRole
  model: string
  effort?: string
  status: 'running' | 'done' | 'failed'
  startedAt: number
  endedAt?: number
  tokens: number
  costUsd: number
  ctxTokens: number
  steps: number
  tools: number
  phase?: string
  tasks: PcTask[]
}

/** O que o agent principal (o Claude da conversa) está fazendo no turno atual. */
export type PcMain = {
  activity: string
  steps: number
  tools: number
  working: boolean
  done: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-crew': {
      tasks: PcTask[]
      agents: PcAgent[]
      now: number
      frame: number
      showDone: boolean
      main: PcMain
      batchStart: number
    }
  }
}
