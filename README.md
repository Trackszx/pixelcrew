# pixel-crew

A pixel-art progress bar with the Claude mascot, and a side panel that turns your subagents into a little crew of characters, for [Claude Code](https://claude.com/claude-code).

![The crew](docs/crew.png)

## What it does

**A progress band above the prompt.** While Claude works, the band shows what it is doing right now ("Editando register.tsx", "Rodando os testes"), a pixel progress bar with a light sweeping across it, and the percentage. When Claude delegates to subagents it becomes the **boss**: it grows, puts on a crown and cape, the bar turns purple, and a counter shows how many subagents are done (`1/3`).

![The progress band](docs/band.png)

**An Agents panel.** Every subagent gets a row: its character, its role, the model and effort, what it is doing, context used, tokens, estimated cost, time, and its own progress bar. Totals for cost, tokens and time sit on top. The panel opens by itself when the first subagent starts.

<img src="docs/panel.png" alt="The Agents panel" width="420">

**The crew.** Each subagent gets a role from the first keyword in its description:

| Character | Role | Picked for |
| --- | --- | --- |
| Headphones and laptop | `developer` | build, implement, fix, refactor, create, write |
| Beret, brush and palette | `artist` | design, desenhar, icons, logo, UI, CSS, visuals |
| Explorer hat and lantern | `researcher` | research, explore, search, read, analyze, plan |
| Hard hat and wrench | `worker` | anything else |
| Safety goggles and clipboard | `tester` | test, verify, debug, review, audit |
| Screen robot | `codex` | anything delegated to Codex |
| Crown, cape and scepter | `boss` | Claude itself, while it delegates (never a subagent) |

**Progress.** If Claude or a subagent keeps a task list, the bar follows it exactly. Without one, the bar is an estimate that advances with each step and stays under 90% until the work is really done.

## Install

The plugin needs a Claude Code build with function-hook plugins (the plugin API is early access). It was built and tested on Claude Code **2.1.293**, in the desktop app's Code tab and in the terminal.

In a terminal session of Claude Code:

```
/plugin install pixel-crew --marketplace Trackszx/pixelcrew
```

Answer `y` to add the marketplace and pick the user scope. Or, from your shell:

```bash
claude plugin marketplace add Trackszx/pixelcrew
claude plugin install pixel-crew@pixelcrew
```

Once installed at the user scope it also loads in the desktop app's Code tab.

## Commands

| Command | What it does |
| --- | --- |
| `/crew` | Opens the Agents panel |
| `/crew-limpar` | Clears the task list and the agents |

## Good to know

- **It costs no tokens.** Everything is drawn locally. The plugin only listens to events that already happen (a subagent starts, a model step, a tool call, a turn ends) and passes them on unchanged: it adds nothing to the prompt and makes no model calls.
- **Costs are estimates.** They come from a price table at the top of [`hooks/register.tsx`](hooks/register.tsx); adjust it if your prices differ. The context percentage assumes a 200k window.
- **The interface text is in Portuguese** (Rodando, Concluídos, Custo, Tempo...). The strings live in `hooks/register.tsx` if you want to translate them.
- The animation is a frame counter that ticks about three times a second, and only while something is working.

## Development

```
hooks/art.ts        sprites, palette and the pixel bar (SVG)
hooks/register.tsx  the hooks: state, roles, progress, band and panel
types/index.d.ts    the plugin's state contract
tests/              tests run with `claude plugin test .`
```

```bash
claude plugin validate .
claude plugin test .
```

To try your changes, load the folder with `claude --plugin-dir <path to this folder>`.

## Português

Uma barra de progresso em pixel art com o mascote do Claude, mais um painel lateral que transforma os subagents numa equipe de personagens. Enquanto o Claude trabalha, a faixa acima do prompt mostra o que ele está fazendo, a barra e a porcentagem. Quando ele delega, vira o **boss** (coroa, capa e barra roxa) e conta quantos subagents já terminaram. O painel mostra cada agent com papel, modelo, progresso, tokens, custo estimado e tempo. O plugin não gasta tokens: tudo é desenhado localmente.

Para instalar, num terminal do Claude Code: `/plugin install pixel-crew --marketplace Trackszx/pixelcrew`.

## License

[MIT](LICENSE). Not affiliated with Anthropic or OpenAI; Claude and Codex are trademarks of their owners.
