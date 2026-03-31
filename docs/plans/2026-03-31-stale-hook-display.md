# Stale Hook Display

**Date:** 31 March 2026

## Problem

When the Claude Code `statusLine` hook stops firing (session ends, idle period), `ccm-status.json` goes stale after 5 minutes. The extension drops back to JSONL-based estimates, which often show 0% during idle. The last known hook data — accurate percentages and reset times — is discarded.

## Goal

Preserve the last known hook reading in memory and display it with a visual "stale" indicator rather than silently falling back to JSONL zeros.

## Design

### `statusReader.ts`

Add `isStale: boolean` to `HookStatus`. Add a module-level `lastValidStatus` cache.

- File fresh (< 5 min): update cache, return with `isStale: false`
- File stale (> 5 min) but cache exists: return cached reading with `isStale: true`
- File missing/corrupt and no cache: return `null` (unchanged)

### `types.ts`

Add `hookIsStale: boolean` to both `currentSession` and `weekly` in `UsageSummary`.

### `usageAnalyser.ts`

Set `hookIsStale: hookStatus?.isStale ?? false` on both session and weekly blocks. The existing `fromHook` flag is unchanged — stale hook data still counts as "from hook" for percentage and reset time purposes. `hookIsStale` is purely for visual treatment.

### `webviewProvider.ts`

Three badge states:

| Condition | Badge |
|---|---|
| `fromHook && !hookIsStale` | green **Live** |
| `fromHook && hookIsStale` | grey **Stale** |
| `!fromHook` | grey **Estimated** |

Add a `bar-stale` CSS class applied when `hookIsStale` is true. Bar fills with light grey/white instead of the colour-coded gradient. Percentage and reset time display normally.

## Constraints

- In-memory cache only (lost on VS Code reload — acceptable)
- No changes to `ccm-bridge.js` or `ccm-status.json` format
- No new configuration options
