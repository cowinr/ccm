# Claude Code Monitor (CCM)

VS Code extension that monitors Claude Code token usage with accurate live data from Claude Code's statusLine hook.

## Quick Reference

```bash
npm run compile        # TypeScript compile
npm test               # Jest tests (27 tests)
npm run watch          # Watch mode
npx vsce package --allow-missing-repository  # Build .vsix
code --install-extension claude-code-monitor-0.1.0.vsix --force  # Install
```

Full iteration cycle:
```bash
npm run compile && npx vsce package --allow-missing-repository && code --install-extension claude-code-monitor-0.1.0.vsix --force
```

Then reload VS Code: Cmd+Shift+P > Developer: Reload Window

## Architecture

```
src/
  extension.ts        - VS Code lifecycle, status bar, timer
  webviewProvider.ts  - Sidebar panel HTML/CSS rendering
  usageAnalyser.ts    - Token aggregation, window detection, hook data blending
  statusReader.ts     - Reads ~/.claude/ccm-status.json (live hook data)
  usageReader.ts      - JSONL file parsing from ~/.claude/projects/
  pricing.ts          - Model pricing (kept but not shown in UI)
  types.ts            - Shared interfaces
test/
  *.test.ts           - Jest tests for analyser, reader, pricing
media/
  webview.css         - Dark theme styles
  icon.svg            - Activity bar icon
~/.claude/
  ccm-bridge.js       - statusLine hook bridge: reads stdin JSON, writes ccm-status.json
  ccm-status.json     - Live rate limit data written by ccm-bridge.js
```

## Data Sources

**Primary (live):** Claude Code pipes a JSON blob to the `statusLine` command in `~/.claude/settings.json` every ~300ms. `ccm-bridge.js` intercepts this and writes `rate_limits` + `model.display_name` to `~/.claude/ccm-status.json`. The extension reads this for accurate percentages and exact reset timestamps from Anthropic's servers.

**Fallback (estimated):** JSONL files at `~/.claude/projects/`. Used for: token counts, burn rate, message count, histogram. When live data is present, JSONL-based percentages are ignored.

The UI shows a green **live** badge / grey **est** badge to indicate which source is driving each section.

## Key Design Decisions

- **Live hook data**: Accurate 5h and 7d percentages come from `rate_limits` in the statusLine JSON — no guessing needed
- **JSONL kept for histogram**: Per-model (Sonnet/Opus/Haiku) token breakdown in 15-min buckets
- **Time marker on usage bar**: Tick shows current position in the window so you can see if you're ahead/behind average burn
- **Model badge**: Active model shown as coloured pill — blue=Sonnet, red=Opus, green=Haiku
- **No cost display**: Removed because Anthropic's limits are opaque and don't correlate with API costs
- **Token limits**: Calibrated defaults (250M session, 710M weekly) but configurable; only used as fallback when hook data absent
- **Performance**: Only reads JSONL files modified in last 7 days
