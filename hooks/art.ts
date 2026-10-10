import type { PcRole } from '../types'

// Paleta "Argila Claude" da barra principal
export const CLAY = '#D97757'
export const CLAY_LIGHT = '#E8957A'

export type RoleInfo = { label: string; color: string; light: string }

export const ROLES: Record<PcRole, RoleInfo> = {
  developer: { label: "developer", color: "#378ADD", light: "#85B7EB" },
  artist: { label: "artist", color: "#D4537E", light: "#ED93B1" },
  researcher: { label: "researcher", color: "#B8864E", light: "#DDB98A" },
  worker: { label: "worker", color: "#639922", light: "#97C459" },
  boss: { label: "boss", color: "#6A4BE0", light: "#A28CF2" },
  tester: { label: "tester", color: "#F07A1E", light: "#F8B27A" },
  codex: { label: "codex", color: "#10A37F", light: "#6FD3B5" },
}

const PAL: Record<string, string> = {
  X: CLAY, E: "#1F1410",
  Y: "#F2C230", y: "#C99A1E", J: "#F08A24", L: "#FFF6C8",
  Q: "#F5C542", q: "#B8861A", R: "#E24B4A", I: "#534AB7",
  W: "#F4F4F4", K: "#2A2E36", k: "#4A505C", G: "#C9CCD1", g: "#9A9EA6",
  P: "#D93A3A", p: "#A32626", C: "#3B8FE0", H: "#8A5A2B",
  F: "#9A6A3A", f: "#7A4F28", M: "#FFE9A8",
  V: "#F07A1E", v: "#B85A12", N: "#E8D7B5", n: "#888780",
  O: "#E6E8EB", S: "#111418", A: "#10A37F", Z: "#8A8F98", D: "#2C2F33",
  U: "#6A4BE0", u: "#4A32B0",
}

const W = 18
const H = 15

type Grid = string[][]

function box(g: Grid, ch: string, x0: number, x1: number, y0: number, y1: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (y >= 0 && y < H && x >= 0 && x < W) g[y]![x] = ch
}

function dot(g: Grid, ch: string, ...cells: Array<[number, number]>) {
  for (const [x, y] of cells) box(g, ch, x, x, y, y)
}

// Clawd, o mascote do Claude Code: tronco largo, bracinhos no meio,
// olhos de 1x2 e quatro perninhas
function eyes(g: Grid) {
  box(g, "E", 6, 6, 8, 9)
  box(g, "E", 11, 11, 8, 9)
}

function clawd(g: Grid) {
  box(g, "X", 4, 13, 6, 12)
  box(g, "X", 2, 3, 9, 10)
  box(g, "X", 14, 15, 9, 10)
  for (const x of [4, 6, 11, 13]) box(g, "X", x, x, 13, 14)
  eyes(g)
}

// Acessórios de cada papel, desenhados por cima do Clawd
const GEAR: Record<Exclude<PcRole, "codex">, (g: Grid) => void> = {
  // capacete de obra com lanterna + chave inglesa
  worker: g => {
    box(g, "Y", 7, 10, 2, 2)
    box(g, "Y", 6, 11, 3, 4)
    box(g, "J", 8, 9, 3, 3)
    dot(g, "L", [7, 3])
    box(g, "y", 3, 14, 5, 5)
    dot(g, "Z", [0, 5], [2, 5], [0, 6], [1, 6], [2, 6], [1, 7], [1, 8])
  },
  // rei: coroa com rubi, capa roxa com gola de arminho e cetro
  boss: g => {
    box(g, "U", 3, 3, 6, 12)
    box(g, "U", 14, 14, 6, 12)
    box(g, "u", 2, 2, 11, 13)
    box(g, "u", 15, 15, 11, 13)
    box(g, "W", 4, 13, 6, 6)
    dot(g, "K", [5, 6], [8, 6], [11, 6])
    dot(g, "Q", [5, 3], [8, 3], [9, 3], [12, 3])
    box(g, "Q", 5, 12, 4, 5)
    box(g, "R", 8, 9, 4, 4)
    box(g, "Q", 16, 16, 4, 10)
    box(g, "R", 16, 16, 3, 3)
  },
  // fone de ouvido + notebook
  developer: g => {
    box(g, "K", 5, 12, 5, 5)
    dot(g, "K", [4, 5], [13, 5])
    box(g, "K", 3, 4, 6, 9)
    box(g, "K", 13, 14, 6, 9)
    box(g, "k", 3, 3, 7, 8)
    box(g, "k", 14, 14, 7, 8)
    box(g, "g", 5, 12, 10, 10)
    box(g, "G", 5, 12, 11, 12)
    box(g, "I", 8, 9, 11, 11)
  },
  // boina vermelha + pincel erguido + paleta
  artist: g => {
    box(g, "p", 8, 9, 3, 3)
    box(g, "P", 6, 11, 4, 4)
    box(g, "p", 5, 12, 5, 5)
    box(g, "X", 16, 16, 8, 10)
    box(g, "H", 16, 16, 3, 7)
    box(g, "C", 16, 16, 1, 2)
    dot(g, "W", [16, 0])
    box(g, "N", 0, 1, 8, 10)
    dot(g, "R", [0, 9])
    dot(g, "C", [1, 8])
    dot(g, "Y", [1, 10])
  },
  // chapéu de explorador trançado + lampião
  researcher: g => {
    box(g, "F", 6, 11, 3, 4)
    for (let x = 6; x <= 11; x++) dot(g, "f", [x, (x % 2) + 3])
    box(g, "f", 3, 14, 5, 5)
    box(g, "X", 16, 16, 9, 10)
    box(g, "H", 16, 16, 4, 8)
    box(g, "Z", 15, 17, 1, 3)
    dot(g, "M", [16, 2])
  },
  // óculos de proteção laranja + lanterna de cabeça + prancheta
  tester: g => {
    box(g, "v", 4, 13, 6, 6)
    box(g, "M", 8, 9, 5, 5)
    box(g, "V", 5, 7, 7, 10)
    box(g, "V", 10, 12, 7, 10)
    box(g, "V", 8, 9, 8, 8)
    box(g, "N", 0, 1, 8, 11)
    box(g, "Z", 0, 1, 7, 7)
    dot(g, "n", [0, 9], [1, 9], [0, 10])
    eyes(g)
  },
}

// Codex: um robozinho de tela, personagem próprio
function codex(g: Grid) {
  box(g, "A", 8, 9, 0, 0)
  box(g, "Z", 8, 9, 1, 2)
  box(g, "O", 4, 13, 3, 8)
  box(g, "S", 5, 12, 4, 7)
  box(g, "A", 7, 7, 5, 5)
  box(g, "A", 10, 10, 5, 5)
  box(g, "A", 8, 9, 6, 6)
  box(g, "A", 5, 12, 9, 11)
  box(g, "Z", 2, 4, 9, 10)
  box(g, "Z", 13, 15, 9, 10)
  box(g, "D", 6, 7, 12, 13)
  box(g, "D", 10, 11, 12, 13)
}

function grid(role: PcRole | "clawd"): Grid {
  const g: Grid = Array.from({ length: H }, () => Array<string>(W).fill("."))
  if (role === "codex") codex(g)
  else {
    clawd(g)
    if (role !== "clawd") GEAR[role](g)
  }
  return g
}

export type Sprite = { source: string; width: number; height: number }

/**
 * Sprite do personagem em SVG, desenhado como imagem (fundo transparente) e
 * recortado no próprio desenho, para centralizar ao lado de uma barra. Com
 * `bob`, o quadro ímpar sobe 1 pixel: o mod troca o quadro enquanto ele
 * trabalha, então o personagem pula.
 */
export function spriteSvg(role: PcRole | "clawd", px = 2, bob = false, frame = 0): Sprite {
  const g = grid(role)
  let top = H
  let bottom = 0
  let left = W
  let right = 0
  g.forEach((row, r) =>
    row.forEach((ch, c) => {
      if (!PAL[ch]) return
      top = Math.min(top, r)
      bottom = Math.max(bottom, r)
      left = Math.min(left, c)
      right = Math.max(right, c)
    }),
  )
  const dy = bob && frame % 2 === 1 ? -1 : 0
  let rects = ""
  g.forEach((row, r) =>
    row.forEach((ch, c) => {
      const fill = PAL[ch]
      if (fill) rects += `<rect x="${c}" y="${r + dy}" width="1.02" height="1.02" fill="${fill}"/>`
    }),
  )
  // uma linha a mais em cima para o pulo
  const vw = right - left + 1
  const vh = bottom - top + 2
  const width = vw * px
  const height = vh * px
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top - 1} ${vw} ${vh}" shape-rendering="crispEdges">${rects}</svg>`,
    width,
    height,
  }
}

/**
 * O que o mascote da faixa está fazendo: andando na ponta da barra enquanto
 * trabalha, pulando entre confetes no 100%, dormindo quando nada acontece, de
 * braço erguido quando espera por você, tremendo quando algo falhou.
 */
export type Pose = 'walk' | 'jump' | 'sleep' | 'alert' | 'shake'

const CONFETTI = ['#F5C542', '#D4537E', '#378ADD', '#639922', '#FFF6C8', '#F07A1E']
const Z_GLYPH = ['XXXXX', '...X.', '..X..', '.X...', 'XXXXX']
// colunas do confete e onde cada pedaço começa a cair, espalhados à mão
const CONFETTI_X = [0, 3, 5, 8, 10, 13, 15, 17, 1, 6, 11, 16]
const CONFETTI_Y = [3, 0, 5, 2, 6, 1, 4, 0, 6, 3, 2, 5]

/**
 * O mascote da faixa (o Clawd, ou o boss enquanto delega) numa pose, num
 * quadro fixo de 18x16 pixels: o tamanho não muda entre poses e quadros, então
 * ele anda pela barra sem tremer o layout. Confete, "zz" e "!" ocupam o espaço
 * acima da cabeça.
 */
export function mascotSvg(role: 'clawd' | 'boss', pose: Pose, frame = 0, px = 2): Sprite {
  const g = grid(role)
  // o relógio anda a 30 quadros por segundo: passos e pulo trocam a cada 6
  // quadros (5x por segundo) e o confete cai a cada 3, para o Clawd não sair
  // correndo
  const step = Math.floor(frame / 6)
  const fall = Math.floor(frame / 3)
  // passos: um par de pernas levanta a cada passo
  if (pose === 'walk') for (const x of step % 2 ? [6, 11] : [4, 13]) box(g, '.', x, x, 14, 14)
  if (pose === 'sleep') {
    box(g, 'X', 6, 6, 8, 8)
    box(g, 'X', 11, 11, 8, 8)
  }
  if (role === 'clawd' && pose === 'alert') {
    box(g, '.', 14, 15, 9, 10)
    box(g, 'X', 14, 15, 7, 8)
    box(g, 'X', 15, 15, 5, 6)
  }
  if (role === 'clawd' && pose === 'jump') {
    box(g, '.', 2, 3, 9, 10)
    box(g, '.', 14, 15, 9, 10)
    box(g, 'X', 2, 3, 7, 8)
    box(g, 'X', 14, 15, 7, 8)
    box(g, 'X', 2, 2, 5, 6)
    box(g, 'X', 15, 15, 5, 6)
  }
  const dy = pose === 'walk' ? -(step % 2) : pose === 'jump' ? -[0, 1, 2, 1][step % 4]! : 0
  const dx = pose === 'shake' ? (Math.floor(frame / 2) % 2 ? 1 : -1) : 0

  let rects = ''
  const put = (x: number, y: number, fill: string) =>
    (rects += `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${fill}"/>`)
  g.forEach((row, r) =>
    row.forEach((ch, c) => {
      const fill = PAL[ch]
      if (fill) put(c + dx, r + dy, fill)
    }),
  )
  // o que o personagem ocupa neste quadro, para o confete passar por trás
  const body = (x: number, y: number) => {
    const ch = g[y - dy]?.[x - dx]
    return ch !== undefined && ch !== '.'
  }
  if (pose === 'jump') {
    CONFETTI_X.forEach((x, i) => {
      const y = ((fall + CONFETTI_Y[i]!) % 7) - 1
      if (!body(x, y)) put(x, y, CONFETTI[i % CONFETTI.length]!)
    })
  }
  if (pose === 'sleep') {
    const z = (x0: number, y0: number) =>
      Z_GLYPH.forEach((row, j) => [...row].forEach((ch, i) => ch === 'X' && put(x0 + i, y0 + j, PAL.G!)))
    // o Z sobe e volta, como quem ronca
    if (frame % 2) z(13, -1)
    else z(12, 1)
  }
  if (pose === 'alert') {
    for (const y of [0, 1, 2, 4]) put(17, y, PAL.Q!)
  }
  const vh = H + 1
  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${W * px}" height="${vh * px}" viewBox="0 -1 ${W} ${vh}" shape-rendering="crispEdges">${rects}</svg>`,
    width: W * px,
    height: vh * px,
  }
}

export type BarOpts = {
  ratio: number | null
  color: string
  frame?: number
}

const COLS = 60
const ROWS = 3
const TRACK = "#2A2725"

function mix(hex: string, to: string, t: number): string {
  const a = parseInt(hex.slice(1), 16)
  const b = parseInt(to.slice(1), 16)
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t)
  return "#" + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")
}

/**
 * Barra de carregamento "brilho que passa": preenchimento sólido com uma linha
 * de brilho em cima e um reflexo diagonal de pixels que varre a parte cheia a
 * cada quadro; o trilho vazio é liso. `ratio` null é uma barra indeterminada
 * (um bloco que vai e volta). Desenhada larga e sem proporção fixa, ela estica
 * até a largura do espaço, na altura que o elemento pedir.
 */
export function barSvg({ ratio, color, frame = 0 }: BarOpts): string {
  const hi = mix(color, "#FFFFFF", 0.45)
  const glint = mix(color, "#FFFFFF", 0.8)
  const rect = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

  let from = 0
  let to = 0
  if (ratio === null) {
    const chunk = 12
    const span = COLS - chunk
    const t = frame % (span * 2)
    from = t <= span ? t : span * 2 - t
    to = from + chunk
  } else {
    to = Math.round(COLS * Math.max(0, Math.min(1, ratio)))
  }

  let body = rect(0, 0, COLS, ROWS, TRACK)
  if (to > from) {
    body += rect(from, 0, to - from, ROWS, color) + rect(from, 0, to - from, 1, hi)
    const period = to - from + ROWS + 8
    const x0 = from + (frame % period) - ROWS
    for (let r = 0; r < ROWS; r++) {
      const a = x0 + ROWS - 1 - r
      const b = a + 1
      if (a >= from && a < to) body += rect(a, r, 1, 1, glint)
      if (b >= from && b < to) body += rect(b, r, 1, 1, hi)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="${ROWS * 4}" viewBox="0 0 ${COLS} ${ROWS}" preserveAspectRatio="none" shape-rendering="crispEdges">${body}</svg>`
}

/** Versão de terminal da barra: bloco sólido, a parte vazia em cinza. */
export function barText(cols: number, ratio: number | null): { on: string; off: string } {
  const n = Math.max(8, cols)
  const on = ratio === null ? 0 : Math.round(n * Math.max(0, Math.min(1, ratio)))
  return { on: "█".repeat(on), off: "█".repeat(n - on) }
}

export const TERM_SPRITE: Record<PcRole, string> = {
  developer: '▐▛█▜▌⌨',
  artist: '▐▛█▜▌✎',
  researcher: '▐▛█▜▌⌕',
  worker: '▐▛█▜▌⚒',
  boss: '▐▛█▜▌♛',
  tester: '▐▛█▜▌✓',
  codex: '[▪▪]⚡',
}

