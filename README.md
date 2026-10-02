<div align="center">

<img src="https://raw.githubusercontent.com/fanzirfan/omp-discord-presence/main/assets/banner.png" alt="omp-discord-presence" width="100%">

[![License](https://img.shields.io/badge/license-MIT-111111?style=flat-square)](./LICENSE)
[![OMP extension](https://img.shields.io/badge/omp-extension-111111?style=flat-square)](https://omp.sh)
[![npm](https://img.shields.io/npm/v/omp-discord-presence?style=flat-square&color=111111&logo=npm)](https://www.npmjs.com/package/omp-discord-presence)
[![GitHub](https://img.shields.io/badge/github-fanzirfan%2Fomp--discord--presence-111111?style=flat-square&logo=github)](https://github.com/fanzirfan/omp-discord-presence)

</div>

> **Discord Rich Presence for OMP (oh-my-pi).** It shows what OMP is doing on
> your behalf, live.

`Editing foo.tsx` · `Running: git` · `Searching the codebase` · `Thinking...` ·
`Idle in dotfiles` — with the project, the model, and a session-elapsed timer.

```
┌───────────────────────┐
│ [▣]  Playing OMP       │   ← Discord app name
│ [ts]  Editing foo.tsx  │   ← live agent activity
│       dotfiles · sonnet│   ← project · model
│       ⏱ 12:34           │   ← session elapsed
└───────────────────────┘
```

## Setup

This extension targets OMP only. Presence art and the "Playing **\<name\>**"
line come from **your own Discord application** — create one in two minutes
(see [docs/discord-app.md](docs/discord-app.md)), then point the extension at it
via config or `OMP_DISCORD_CLIENT_ID`. Without a client id the extension stays
silent, so it never errors when Discord is unavailable.

## Install

```bash
omp plugin install omp-discord-presence
# or
omp plugin install github:fanzirfan/omp-discord-presence
# or, local dev checkout (symlinked — edit files, restart OMP, done):
omp plugin install C:/path/to/omp-discord-presence
# or, try without installing anything:
omp -e C:/path/to/omp-discord-presence
```

Or drop the repo into `~/.omp/agent/extensions/` — OMP auto-discovers it.

The presence mirrors **what the agent is doing**:

| OMP activity                 | Shows as                  |
| ---------------------------- | ------------------------- |
| `edit` / `write` a file      | `Editing foo.tsx`         |
| `read` a file                | `Reading foo.tsx`         |
| `grep` / `glob` / search     | `Searching the codebase`  |
| `web_search` / `fetch`       | `Browsing the web`        |
| `bash`                       | `Running: <first token>`  |
| any other tool               | `Running <toolName>`      |
| generating a response        | `Thinking...`             |
| waiting for you              | `Idle in <project>`       |

The second line is `project · model`. The large image is the OMP logo; the
small badge is the file's language icon.

## Discord app

The "Playing **\<name\>**" line is your Discord application's name, and every
image key (`omp_logo`, `ts`, `python`, …) must be uploaded as its Rich Presence
art asset. Full walkthrough: [docs/discord-app.md](docs/discord-app.md).

## Config

Global `~/.omp/agent/discord-presence.json`:

```json
{ "enabled": true, "clientId": "<your application id>" }
```

Per-project `<repo>/.omp/discord-presence.json` — silence a sensitive repo
(OMP loads project-local config unconditionally, no trust prompt):

```json
{ "enabled": false }
```

Runtime: `/presence on`, `/presence off`, `/presence status`
(session-only). Precedence: **runtime > project > global**.

## Behavior

- **Active only in interactive TUI mode** (not `-p` / json one-shot runs), and
  only in the top-level agent — subagent sessions never steal the Discord slot.
- **Rate limit**: Discord caps presence at ~1 update / 15s. Updates are
  coalesced to the latest state with a trailing flush, on OMP-managed timers.
- **Privacy**: on by default; filenames + project name are broadcast. Disable
  globally, per-project, or at runtime. No filename ever leaks from `bash` args
  (only the first token is shown).
- **Multiple OMP sessions** share one Discord slot — last writer wins.

## Develop

```bash
npm install
npm run check   # tsc --noEmit
```

```
index.ts            re-exports the entry
src/result.ts       Result / ok / err
src/types.ts        branded types, Activity union, configs, errors, constructors
src/language.ts     extension → language-icon map
src/activity.ts     event reducer (reduce / toActivity / classifyTool)
src/render.ts       Activity → PresenceCard → wire payload
src/config.ts       parse + load config, resolveEnablement
src/scheduler.ts    Clock + coalesce/trailing-flush rate limiter
src/transport.ts    DiscordTransport seam + @xhayper adapter
src/link.ts         connection state machine + lazy reconnect
src/extension.ts    wires OMP events → reducer → scheduler
```

## License

MIT
