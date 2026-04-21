# Claude Code Monitor

VS Code extension that monitors Claude Code token usage with live rate-limit data from Claude Code's statusLine hook.

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/cowinr/ccm/main/install.sh | bash
```

Then reload VS Code: `Cmd+Shift+P` → **Developer: Reload Window**

### Bridge setup (automatic)

On first activation, the extension will prompt you to install the bridge script. Click **Install** — this does two things:

1. Copies `ccm-bridge.js` to `~/.claude/ccm-bridge.js`
2. Adds the bridge call to `~/.claude/settings.json` under `statusLine`

Restart any running Claude Code sessions to start receiving live data.

### Bridge setup (manual fallback)

If you already have a custom `statusLine` command in `~/.claude/settings.json`, the extension can't safely patch it automatically. Instead, add this to your statusLine command:

```bash
input=$(cat); echo "$input" | node ~/.claude/ccm-bridge.js >/dev/null 2>&1
```

Make sure stdin is captured with `input=$(cat)` before the bridge call, and replace any bare `cat` elsewhere in your command with `echo "$input"`.

## What it shows

- **Session usage** — 5-hour fixed window (live percentage from Anthropic's servers when bridge is active)
- **Weekly usage** — 7-day fixed window
- **Active model** — Sonnet / Opus / Haiku with colour-coded badge
- **Burn rate** — tokens per minute
- **Histogram** — 15-minute buckets over the last 7 days
- **Reset countdown** — exact time until rate limit resets

The status bar shows a compact view; click it or open the CCM sidebar panel for the full breakdown.

## Data sources

| Indicator | Source | What it means |
|-----------|--------|---------------|
| green **live** badge | `ccm-status.json` via bridge | Accurate percentages from Anthropic |
| grey **est** badge | JSONL files in `~/.claude/projects/` | Estimated from local token counts |

## Configuration

Settings are under `ccm.*` in VS Code preferences:

| Setting | Default | Description |
|---------|---------|-------------|
| `ccm.refreshIntervalSec` | 60 | How often to poll for updates |
| `ccm.sessionDurationHours` | 5 | Session window length used for histogram |
| `ccm.dataPath` | (auto) | Override path to `~/.claude/projects/` |

## Building from source

```bash
npm install
npm run compile
npx vsce package --allow-missing-repository
```

Full cycle (compile + package + install):

```bash
npm run compile && npx vsce package --allow-missing-repository && code --install-extension claude-code-monitor-0.1.0.vsix --force
```
