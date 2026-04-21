# Claude Code Monitor (CCM)

VS Code extension that monitors Claude Code token usage with accurate live data from Claude Code's statusLine hook.

## Quick Reference

```bash
npm run compile        # TypeScript compile
npm test               # Jest tests (28 tests)
npm run watch          # Watch mode
npx vsce package --allow-missing-repository  # Build .vsix
code --install-extension claude-code-monitor-0.1.2.vsix --force  # Install (use code.cmd on Windows)
```

Full iteration cycle:
```bash
npm run compile && npx vsce package --allow-missing-repository && code --install-extension claude-code-monitor-0.1.2.vsix --force
```

Only one `.vsix` file should exist in the repo at any time. When building a new version, `git rm` the old one before committing.

Then reload VS Code: Cmd+Shift+P > Developer: Reload Window

## Releasing a New Version

1. Bump the version in `package.json` (e.g. `0.1.0` → `0.2.0`)
2. Build and package:
   ```bash
   npm run compile && npx vsce package --allow-missing-repository
   ```
3. Test locally:
   ```bash
   code --install-extension claude-code-monitor-X.Y.Z.vsix --force
   ```
4. Commit and push:
   ```bash
   git add package.json package-lock.json claude-code-monitor-X.Y.Z.vsix
   git commit -m "chore: release vX.Y.Z"
   git push
   ```
5. Create a GitHub release with the .vsix attached:
   ```bash
   gh release create vX.Y.Z claude-code-monitor-X.Y.Z.vsix \
     --title "vX.Y.Z" \
     --notes "What changed in this release."
   ```

The `install.sh` script always fetches the latest release, so colleagues just re-run the same one-liner to upgrade:
```bash
curl -fsSL https://raw.githubusercontent.com/cowinr/ccm/main/install.sh | bash
```

## Architecture

```
src/
  extension.ts        - VS Code lifecycle, status bar, timer, bridge install prompt
  webviewProvider.ts  - Sidebar panel HTML/CSS rendering
  usageAnalyser.ts    - Token aggregation, window detection, hook data blending
  bridgeInstaller.ts  - Detects/installs ccm-bridge.js and patches settings.json
  statusReader.ts     - Reads ~/.claude/ccm-status.json (live hook data)
  usageReader.ts      - JSONL file parsing from ~/.claude/projects/
  pricing.ts          - Model pricing (kept but not shown in UI)
  types.ts            - Shared interfaces
test/
  *.test.ts           - Jest tests for analyser, reader, pricing
media/
  webview.css         - Dark theme styles
  icon.svg            - Activity bar icon
resources/
  ccm-bridge.js       - Bundled bridge script, copied to ~/.claude/ on install
~/.claude/
  ccm-bridge.js       - statusLine hook bridge: reads stdin JSON, writes ccm-status.json
  ccm-status.json     - Live rate limit data written by ccm-bridge.js
```

## Data Sources

**Primary (live):** Claude Code pipes a JSON blob to the `statusLine` command in `~/.claude/settings.json` every ~300ms. `ccm-bridge.js` intercepts this and writes `rate_limits` + `model.display_name` to `~/.claude/ccm-status.json`. The extension reads this for accurate percentages and exact reset timestamps from Anthropic's servers.

**Fallback (estimated):** JSONL files at `~/.claude/projects/`. Used for: token counts, burn rate, message count, histogram. When live data is present, JSONL-based percentages are ignored.

The UI shows a green **live** badge / grey **est** badge to indicate which source is driving each section.

## Platform Notes

- Colleagues run Claude Code **natively on Windows** (not WSL) — any shell commands or file paths added to the codebase must be cross-platform
- Path construction: always use `path.join()` and `os.homedir()` — never hardcode `~` or `/`
- The statusLine hook command written to `settings.json` must not use bash syntax
- **Windows VS Code CLI**: In PowerShell, `code` resolves to `Code.exe` (the GUI), not `code.cmd` (the CLI). Always use `code.cmd` explicitly in PowerShell scripts — `code --install-extension` silently does nothing otherwise. Same issue in Git Bash (the `code` shell script is WSL-aware and opens the GUI).

## Key Design Decisions

- **Live hook data**: Accurate 5h and 7d percentages come from `rate_limits` in the statusLine JSON — no guessing needed
- **JSONL kept for histogram**: Per-model (Sonnet/Opus/Haiku) token breakdown in 15-min buckets
- **Time marker on usage bar**: Tick shows current position in the window so you can see if you're ahead/behind average burn
- **Model badge**: Active model shown as coloured pill — blue=Sonnet, red=Opus, green=Haiku
- **No cost display**: Removed because Anthropic's limits are opaque and don't correlate with API costs
- **No token limits**: Removed — Anthropic's limits are opaque and estimates were misleading. Percentages show 0% when bridge is absent rather than guessing
- **Performance**: Only reads JSONL files modified in last 7 days
