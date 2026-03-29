# Claude Code Monitor (CCM)

VS Code extension that monitors Claude Code token usage by reading local JSONL session files.

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
  usageAnalyser.ts    - Session window detection, token aggregation
  usageReader.ts      - JSONL file parsing from ~/.claude/projects/
  pricing.ts          - Model pricing (kept but not shown in UI)
  types.ts            - Shared interfaces
test/
  *.test.ts           - Jest tests for analyser, reader, pricing
media/
  webview.css         - Dark theme styles
  icon.svg            - Activity bar icon
```

## Key Design Decisions

- **Session window**: 5-hour fixed window, detected by finding largest gap >1h in recent entries, rounded up to next clock hour
- **No cost display**: Removed because Anthropic's limits are opaque and don't correlate well with calculated API costs
- **Token limits**: Calibrated defaults (250M session, 710M weekly) but configurable via settings
- **Performance**: Only reads JSONL files modified in last 7 days (was 1400+ files / 386MB otherwise)
