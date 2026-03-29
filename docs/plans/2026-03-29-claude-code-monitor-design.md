# Claude Code Monitor (CCM) - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A VS Code extension that monitors Claude Code usage by reading local JSONL session files, displaying plan usage limits (session + weekly) in a sidebar webview panel with progress bars, and a compact status bar summary.

**Architecture:** Three-layer design mirroring juiceAlertDev: UsageReader (parses JSONL files) -> UsageAnalyser (aggregates into session blocks, calculates costs/limits) -> Extension (VS Code integration with webview + status bar). The webview panel shows progress bars styled similarly to the Anthropic console. Data refreshes on a configurable interval.

**Tech Stack:** TypeScript, VS Code Extension API (webview + status bar), no external runtime dependencies. Build: tsc, test: Jest + ts-jest, package: vsce.

## Data Source

Claude Code writes JSONL files to `~/.claude/projects/<encoded-path>/<session-id>.jsonl` (plus `/subagents/` subdirectories). Each assistant-type entry contains:

```json
{
  "type": "assistant",
  "timestamp": "2026-03-29T15:37:56.423Z",
  "sessionId": "747d270d-...",
  "message": {
    "model": "claude-opus-4-6",
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 13747,
      "cache_read_input_tokens": 11890,
      "output_tokens": 38
    }
  }
}
```

No `costUsd` field exists - costs must be calculated from token counts using known pricing.

## Pricing (per million tokens)

| Model | Input | Output | Cache Create | Cache Read |
|-------|-------|--------|--------------|------------|
| Opus 4.6 | $15 | $75 | $18.75 | $1.50 |
| Sonnet 4.6 | $3 | $15 | $3.75 | $0.30 |
| Haiku 4.5 | $0.25 | $1.25 | $0.30 | $0.03 |

## Plan Limits (configurable, defaults for Max plan)

| Metric | Limit |
|--------|-------|
| Session duration | 5 hours |
| Weekly cost | $100 (adjustable) |

Note: Exact limits are not published by Anthropic and may change. The extension uses configurable defaults and the user can adjust them. Percentages are estimates.

## Display Design

### Status Bar (compact)
Left-aligned, shows: `$(pulse) 45% | W: 23%`
- First percentage = current session cost as % of estimated session limit
- W: = weekly usage as % of weekly limit
- Colour changes: green (<60%), yellow (60-85%), red (>85%)

### Webview Sidebar Panel
Styled to match the Anthropic console dark theme:

```
Plan Usage Limits

Current session
Resets in 3 hr 23 min
[========............] 65% used    $47.32 / $72.28

Weekly limits
Resets Fri 9:00 AM

All models
[===.................] 23% used    $23.00 / $100.00

---
Burn Rate: 221.6 tokens/min
Cost Rate: $0.57/min

Last updated: less than a minute ago  [refresh]
```

## File Structure

```
ccm/
  package.json
  tsconfig.json
  jest.config.js
  .vscodeignore
  icon.png
  src/
    extension.ts          - VS Code lifecycle, status bar, webview provider
    usageReader.ts        - Reads and parses JSONL files from ~/.claude/projects/
    usageAnalyser.ts      - Aggregates tokens, calculates costs, session blocks
    webviewProvider.ts    - Sidebar webview panel with HTML/CSS rendering
    pricing.ts            - Model pricing constants
    types.ts              - Shared interfaces
  test/
    usageReader.test.ts
    usageAnalyser.test.ts
    pricing.test.ts
  media/
    webview.css           - Dark theme styles for the webview
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.vscodeignore`
- Create: `.gitignore`

**Step 1: Initialise git repo**

```bash
cd /Users/richard/projects/ccm
git init
```

**Step 2: Create package.json**

```json
{
  "name": "claude-code-monitor",
  "displayName": "Claude Code Monitor",
  "description": "Monitor Claude Code usage limits with visual progress bars",
  "publisher": "cowinr",
  "version": "0.1.0",
  "engines": { "vscode": "^1.80.0" },
  "categories": ["Other"],
  "keywords": ["claude", "anthropic", "usage", "monitor", "limits"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [{
        "id": "ccm",
        "title": "Claude Code Monitor",
        "icon": "media/icon.svg"
      }]
    },
    "views": {
      "ccm": [{
        "type": "webview",
        "id": "ccm.usagePanel",
        "name": "Usage"
      }]
    },
    "configuration": {
      "title": "Claude Code Monitor",
      "properties": {
        "ccm.refreshIntervalSec": {
          "type": "number",
          "default": 60,
          "minimum": 10,
          "description": "How often to refresh usage data (seconds)"
        },
        "ccm.sessionDurationHours": {
          "type": "number",
          "default": 5,
          "minimum": 1,
          "description": "Estimated session duration for reset calculation (hours)"
        },
        "ccm.weeklyLimitUsd": {
          "type": "number",
          "default": 100,
          "minimum": 1,
          "description": "Estimated weekly spending limit (USD)"
        },
        "ccm.sessionLimitUsd": {
          "type": "number",
          "default": 72.28,
          "minimum": 1,
          "description": "Estimated session spending limit (USD)"
        },
        "ccm.plan": {
          "type": "string",
          "default": "max5",
          "enum": ["pro", "max5", "max20"],
          "description": "Your Anthropic plan (affects default limits)"
        },
        "ccm.dataPath": {
          "type": "string",
          "default": "",
          "description": "Custom path to Claude projects data (defaults to ~/.claude/projects)"
        }
      }
    },
    "commands": [
      { "command": "ccm.refresh", "title": "Claude Code Monitor: Refresh" },
      { "command": "ccm.openSettings", "title": "Claude Code Monitor: Open Settings" }
    ]
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "test": "jest",
    "lint": "eslint src --ext ts",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^18.0.0",
    "@types/vscode": "^1.80.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.40.0",
    "jest": "^29.5.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.0.0",
    "@vscode/test-electron": "^2.3.0",
    "@vscode/vsce": "^2.19.0"
  },
  "dependencies": {}
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "out", "test"]
}
```

**Step 4: Create jest.config.js**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
```

**Step 5: Create .vscodeignore and .gitignore**

`.vscodeignore`:
```
.vscode/**
.vscode-test/**
src/**
test/**
out/test/**
**/*.map
.gitignore
tsconfig.json
jest.config.js
node_modules/**
coverage/**
docs/**
```

`.gitignore`:
```
out/
node_modules/
coverage/
*.vsix
.vscode-test/
```

**Step 6: Install dependencies**

```bash
cd /Users/richard/projects/ccm && npm install
```

**Step 7: Commit**

```bash
git add -A && git commit -m "feat: scaffold CCM extension project"
```

---

### Task 2: Types and Pricing

**Files:**
- Create: `src/types.ts`
- Create: `src/pricing.ts`
- Create: `test/pricing.test.ts`

**Step 1: Write types.ts**

```typescript
export interface UsageEntry {
  timestamp: Date;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface SessionBlock {
  sessionId: string;
  startTime: Date;
  endTime: Date;        // startTime + sessionDurationHours
  entries: UsageEntry[];
  totalCostUsd: number;
  totalTokens: number;
  messageCount: number;
  modelBreakdown: Record<string, { tokens: number; costUsd: number }>;
}

export interface UsageSummary {
  currentSession: {
    costUsd: number;
    limitUsd: number;
    percentage: number;
    resetTime: Date;
    tokenCount: number;
    messageCount: number;
  };
  weekly: {
    costUsd: number;
    limitUsd: number;
    percentage: number;
    resetTime: Date;
  };
  burnRate: {
    tokensPerMin: number;
    costPerMin: number;
  };
  lastUpdated: Date;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}
```

**Step 2: Write the failing test for pricing**

```typescript
// test/pricing.test.ts
import { calculateEntryCost, normaliseModelName } from '../src/pricing';
import { UsageEntry } from '../src/types';

describe('normaliseModelName', () => {
  it('normalises opus variants', () => {
    expect(normaliseModelName('claude-opus-4-6')).toBe('opus');
    expect(normaliseModelName('claude-opus-4-20250514')).toBe('opus');
  });

  it('normalises sonnet variants', () => {
    expect(normaliseModelName('claude-sonnet-4-6')).toBe('sonnet');
    expect(normaliseModelName('claude-sonnet-4-5-20250514')).toBe('sonnet');
  });

  it('normalises haiku variants', () => {
    expect(normaliseModelName('claude-haiku-4-5-20251001')).toBe('haiku');
  });

  it('returns unknown for unrecognised models', () => {
    expect(normaliseModelName('gpt-4')).toBe('unknown');
  });
});

describe('calculateEntryCost', () => {
  it('calculates opus cost correctly', () => {
    const entry: UsageEntry = {
      timestamp: new Date(),
      sessionId: 'test',
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 2000,
      cacheReadTokens: 3000,
    };
    // (1000 * 15 + 500 * 75 + 2000 * 18.75 + 3000 * 1.50) / 1_000_000
    // = (15000 + 37500 + 37500 + 4500) / 1000000 = 94500 / 1000000 = 0.0945
    const cost = calculateEntryCost(entry);
    expect(cost).toBeCloseTo(0.0945, 4);
  });

  it('calculates sonnet cost correctly', () => {
    const entry: UsageEntry = {
      timestamp: new Date(),
      sessionId: 'test',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    // (1000 * 3 + 500 * 15) / 1_000_000 = 10500 / 1000000 = 0.0105
    const cost = calculateEntryCost(entry);
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it('returns 0 for unknown models', () => {
    const entry: UsageEntry = {
      timestamp: new Date(),
      sessionId: 'test',
      model: 'unknown-model',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    expect(calculateEntryCost(entry)).toBe(0);
  });
});
```

**Step 3: Run tests to verify they fail**

```bash
npm test
```
Expected: FAIL (modules not found)

**Step 4: Implement pricing.ts**

```typescript
import { ModelPricing, UsageEntry } from './types';

const MODEL_PRICING: Record<string, ModelPricing> = {
  opus: {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.50,
  },
  sonnet: {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.30,
  },
  haiku: {
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
    cacheCreationPerMillion: 0.30,
    cacheReadPerMillion: 0.03,
  },
};

export function normaliseModelName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return 'unknown';
}

export function calculateEntryCost(entry: UsageEntry): number {
  const modelKey = normaliseModelName(entry.model);
  const pricing = MODEL_PRICING[modelKey];
  if (!pricing) return 0;

  return (
    (entry.inputTokens * pricing.inputPerMillion +
      entry.outputTokens * pricing.outputPerMillion +
      entry.cacheCreationTokens * pricing.cacheCreationPerMillion +
      entry.cacheReadTokens * pricing.cacheReadPerMillion) /
    1_000_000
  );
}
```

**Step 5: Run tests to verify they pass**

```bash
npm test
```
Expected: PASS

**Step 6: Commit**

```bash
git add -A && git commit -m "feat: add types and pricing calculation with tests"
```

---

### Task 3: Usage Reader

**Files:**
- Create: `src/usageReader.ts`
- Create: `test/usageReader.test.ts`

**Step 1: Write failing tests**

```typescript
// test/usageReader.test.ts
import { parseJsonlLine, filterEntriesByTimeRange } from '../src/usageReader';
import { UsageEntry } from '../src/types';

describe('parseJsonlLine', () => {
  it('parses a valid assistant entry', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-03-29T15:37:56.423Z',
      sessionId: 'session-123',
      message: {
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 300,
        },
      },
    });

    const entry = parseJsonlLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.model).toBe('claude-opus-4-6');
    expect(entry!.inputTokens).toBe(100);
    expect(entry!.outputTokens).toBe(50);
    expect(entry!.cacheCreationTokens).toBe(200);
    expect(entry!.cacheReadTokens).toBe(300);
    expect(entry!.sessionId).toBe('session-123');
  });

  it('returns null for non-assistant entries', () => {
    const line = JSON.stringify({ type: 'user', timestamp: '2026-03-29T15:37:56.423Z' });
    expect(parseJsonlLine(line)).toBeNull();
  });

  it('returns null for entries without usage', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-03-29T15:37:56.423Z',
      sessionId: 'session-123',
      message: { model: 'claude-opus-4-6' },
    });
    expect(parseJsonlLine(line)).toBeNull();
  });

  it('handles missing optional token fields', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-03-29T15:37:56.423Z',
      sessionId: 'session-123',
      message: {
        model: 'claude-opus-4-6',
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    const entry = parseJsonlLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.cacheCreationTokens).toBe(0);
    expect(entry!.cacheReadTokens).toBe(0);
  });
});

describe('filterEntriesByTimeRange', () => {
  const entries: UsageEntry[] = [
    { timestamp: new Date('2026-03-29T10:00:00Z'), sessionId: 's1', model: 'opus', inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
    { timestamp: new Date('2026-03-29T12:00:00Z'), sessionId: 's1', model: 'opus', inputTokens: 200, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
    { timestamp: new Date('2026-03-29T14:00:00Z'), sessionId: 's2', model: 'opus', inputTokens: 300, outputTokens: 150, cacheCreationTokens: 0, cacheReadTokens: 0 },
  ];

  it('filters entries within time range', () => {
    const start = new Date('2026-03-29T11:00:00Z');
    const end = new Date('2026-03-29T13:00:00Z');
    const filtered = filterEntriesByTimeRange(entries, start, end);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].inputTokens).toBe(200);
  });

  it('returns empty array when no entries match', () => {
    const start = new Date('2026-03-30T00:00:00Z');
    const end = new Date('2026-03-30T23:59:59Z');
    expect(filterEntriesByTimeRange(entries, start, end)).toHaveLength(0);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```

**Step 3: Implement usageReader.ts**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UsageEntry } from './types';

export function getDefaultDataPath(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

export function parseJsonlLine(line: string): UsageEntry | null {
  try {
    const data = JSON.parse(line);
    if (data.type !== 'assistant') return null;

    const usage = data.message?.usage;
    if (!usage) return null;

    return {
      timestamp: new Date(data.timestamp),
      sessionId: data.sessionId || '',
      model: data.message.model || 'unknown',
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheCreationTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
    };
  } catch {
    return null;
  }
}

export function filterEntriesByTimeRange(
  entries: UsageEntry[],
  start: Date,
  end: Date
): UsageEntry[] {
  return entries.filter(e => e.timestamp >= start && e.timestamp <= end);
}

export function readJsonlFile(filePath: string): UsageEntry[] {
  const entries: UsageEntry[] = [];
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const entry = parseJsonlLine(line);
      if (entry) entries.push(entry);
    }
  } catch {
    // File may be locked or missing - skip silently
  }
  return entries;
}

export function readAllUsageEntries(dataPath?: string): UsageEntry[] {
  const basePath = dataPath || getDefaultDataPath();
  const allEntries: UsageEntry[] = [];

  if (!fs.existsSync(basePath)) return allEntries;

  // Walk all project directories and find .jsonl files
  const walkDir = (dir: string) => {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          walkDir(fullPath);
        } else if (item.name.endsWith('.jsonl')) {
          allEntries.push(...readJsonlFile(fullPath));
        }
      }
    } catch {
      // Permission errors etc - skip
    }
  };

  walkDir(basePath);
  return allEntries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
```

**Step 4: Run tests**

```bash
npm test
```
Expected: PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add JSONL usage reader with tests"
```

---

### Task 4: Usage Analyser

**Files:**
- Create: `src/usageAnalyser.ts`
- Create: `test/usageAnalyser.test.ts`

**Step 1: Write failing tests**

```typescript
// test/usageAnalyser.test.ts
import { UsageAnalyser } from '../src/usageAnalyser';
import { UsageEntry } from '../src/types';

function makeEntry(overrides: Partial<UsageEntry> = {}): UsageEntry {
  return {
    timestamp: new Date('2026-03-29T12:00:00Z'),
    sessionId: 'session-1',
    model: 'claude-opus-4-6',
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    ...overrides,
  };
}

describe('UsageAnalyser', () => {
  let analyser: UsageAnalyser;

  beforeEach(() => {
    analyser = new UsageAnalyser({
      sessionDurationHours: 5,
      weeklyLimitUsd: 100,
      sessionLimitUsd: 72.28,
    });
  });

  describe('getCurrentSessionSummary', () => {
    it('identifies the current session block', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T13:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(2);
      expect(summary.currentSession.costUsd).toBeGreaterThan(0);
    });

    it('calculates reset time as start + session duration', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      // First entry at 12:00, session = 5h, reset = 17:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(17);
    });
  });

  describe('getWeeklySummary', () => {
    it('sums costs for all entries in the current week', () => {
      const now = new Date('2026-03-29T14:00:00Z'); // Saturday
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-24T10:00:00Z') }), // Monday - in week
        makeEntry({ timestamp: new Date('2026-03-29T10:00:00Z') }), // Saturday - in week
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.weekly.messageCount).toBe(2);
    });
  });

  describe('burn rate', () => {
    it('calculates tokens per minute', () => {
      const now = new Date('2026-03-29T12:10:00Z'); // 10 mins after first entry
      const entries: UsageEntry[] = [
        makeEntry({
          timestamp: new Date('2026-03-29T12:00:00Z'),
          inputTokens: 5000,
          outputTokens: 5000,
        }),
      ];

      const summary = analyser.analyse(entries, now);
      // 10000 tokens over 10 minutes = 1000 tokens/min
      expect(summary.burnRate.tokensPerMin).toBeCloseTo(1000, 0);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

**Step 3: Implement usageAnalyser.ts**

```typescript
import { UsageEntry, UsageSummary } from './types';
import { calculateEntryCost } from './pricing';

export interface AnalyserConfig {
  sessionDurationHours: number;
  weeklyLimitUsd: number;
  sessionLimitUsd: number;
}

export class UsageAnalyser {
  constructor(private config: AnalyserConfig) {}

  updateConfig(config: AnalyserConfig) {
    this.config = config;
  }

  analyse(entries: UsageEntry[], now: Date = new Date()): UsageSummary {
    const sessionEntries = this.getCurrentSessionEntries(entries, now);
    const weekEntries = this.getCurrentWeekEntries(entries, now);

    const sessionCost = this.sumCosts(sessionEntries);
    const weeklyCost = this.sumCosts(weekEntries);

    const sessionStart = sessionEntries.length > 0
      ? sessionEntries[0].timestamp
      : now;
    const sessionResetTime = new Date(
      sessionStart.getTime() + this.config.sessionDurationHours * 60 * 60 * 1000
    );

    const weekResetTime = this.getNextWeeklyReset(now);

    const burnRate = this.calculateBurnRate(sessionEntries, now);

    return {
      currentSession: {
        costUsd: sessionCost,
        limitUsd: this.config.sessionLimitUsd,
        percentage: Math.min((sessionCost / this.config.sessionLimitUsd) * 100, 100),
        resetTime: sessionResetTime,
        tokenCount: this.sumTokens(sessionEntries),
        messageCount: sessionEntries.length,
      },
      weekly: {
        costUsd: weeklyCost,
        limitUsd: this.config.weeklyLimitUsd,
        percentage: Math.min((weeklyCost / this.config.weeklyLimitUsd) * 100, 100),
        resetTime: weekResetTime,
        messageCount: weekEntries.length,
      },
      burnRate,
      lastUpdated: now,
    };
  }

  private getCurrentSessionEntries(entries: UsageEntry[], now: Date): UsageEntry[] {
    // Find the most recent session block:
    // Walk backwards from now, find entries within sessionDurationHours
    const sessionDurationMs = this.config.sessionDurationHours * 60 * 60 * 1000;

    // Group by sessionId, find the latest session
    const bySession = new Map<string, UsageEntry[]>();
    for (const entry of entries) {
      const existing = bySession.get(entry.sessionId) || [];
      existing.push(entry);
      bySession.set(entry.sessionId, existing);
    }

    // Find session with the most recent entry
    let latestSession: UsageEntry[] = [];
    let latestTime = 0;
    for (const [, sessionEntries] of bySession) {
      const maxTime = Math.max(...sessionEntries.map(e => e.timestamp.getTime()));
      if (maxTime > latestTime) {
        latestTime = maxTime;
        latestSession = sessionEntries;
      }
    }

    if (latestSession.length === 0) return [];

    // Check if this session is still "active" (started within sessionDurationHours)
    const sessionStart = latestSession[0].timestamp;
    const sessionEnd = new Date(sessionStart.getTime() + sessionDurationMs);

    if (now > sessionEnd) return []; // Session has expired

    return latestSession;
  }

  private getCurrentWeekEntries(entries: UsageEntry[], now: Date): UsageEntry[] {
    const weekStart = this.getWeekStart(now);
    return entries.filter(e => e.timestamp >= weekStart && e.timestamp <= now);
  }

  private getWeekStart(date: Date): Date {
    // Week starts Monday 09:00 UTC (approximate Anthropic reset)
    const d = new Date(date);
    const day = d.getUTCDay();
    const diff = day === 0 ? 6 : day - 1; // Monday = 0 offset
    d.setUTCDate(d.getUTCDate() - diff);
    d.setUTCHours(9, 0, 0, 0);

    // If we're before Monday 9am, go back another week
    if (d > date) {
      d.setUTCDate(d.getUTCDate() - 7);
    }

    return d;
  }

  private getNextWeeklyReset(now: Date): Date {
    const weekStart = this.getWeekStart(now);
    return new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  private sumCosts(entries: UsageEntry[]): number {
    return entries.reduce((sum, e) => sum + calculateEntryCost(e), 0);
  }

  private sumTokens(entries: UsageEntry[]): number {
    return entries.reduce(
      (sum, e) =>
        sum + e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens,
      0
    );
  }

  private calculateBurnRate(
    entries: UsageEntry[],
    now: Date
  ): { tokensPerMin: number; costPerMin: number } {
    if (entries.length === 0) return { tokensPerMin: 0, costPerMin: 0 };

    const firstTime = entries[0].timestamp.getTime();
    const elapsedMin = (now.getTime() - firstTime) / 60000;

    if (elapsedMin < 1) return { tokensPerMin: 0, costPerMin: 0 };

    const totalTokens = this.sumTokens(entries);
    const totalCost = this.sumCosts(entries);

    return {
      tokensPerMin: totalTokens / elapsedMin,
      costPerMin: totalCost / elapsedMin,
    };
  }
}
```

**Step 4: Run tests, verify pass**

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add usage analyser with session/weekly aggregation"
```

---

### Task 5: Webview Provider

**Files:**
- Create: `src/webviewProvider.ts`
- Create: `media/webview.css`

**Step 1: Create webview.css**

Dark theme matching Anthropic console aesthetic:

```css
:root {
  --bg: #1a1a1a;
  --surface: #2a2a2a;
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --accent: #5b9cf5;
  --warning: #f5a623;
  --danger: #e74c3c;
  --success: #4caf50;
  --bar-bg: #3a3a3a;
  --divider: #333;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg);
  color: var(--text-primary);
  padding: 16px;
  font-size: 13px;
  line-height: 1.5;
}

h2 {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 16px;
}

h3 {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 4px;
}

.section {
  margin-bottom: 24px;
}

.divider {
  border: none;
  border-top: 1px solid var(--divider);
  margin: 20px 0;
}

.metric {
  margin-bottom: 16px;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.metric-label {
  font-weight: 600;
}

.metric-subtitle {
  color: var(--text-secondary);
  font-size: 12px;
  margin-bottom: 6px;
}

.bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bar-track {
  flex: 1;
  height: 8px;
  background: var(--bar-bg);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
  background: var(--accent);
}

.bar-fill.warning { background: var(--warning); }
.bar-fill.danger { background: var(--danger); }

.bar-value {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 60px;
  text-align: right;
}

.stats-row {
  display: flex;
  gap: 24px;
  margin-bottom: 8px;
}

.stat {
  display: flex;
  gap: 6px;
  font-size: 12px;
}

.stat-label { color: var(--text-secondary); }
.stat-value { color: var(--text-primary); font-weight: 500; }

.footer {
  color: var(--text-secondary);
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20px;
}

.refresh-btn {
  background: none;
  border: 1px solid var(--divider);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.refresh-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}
```

**Step 2: Create webviewProvider.ts**

```typescript
import * as vscode from 'vscode';
import { UsageSummary } from './types';

export class UsagePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ccm.usagePanel';

  private view?: vscode.WebviewView;
  private summary?: UsageSummary;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.webview.onDidReceiveMessage(message => {
      if (message.command === 'refresh') {
        vscode.commands.executeCommand('ccm.refresh');
      }
    });

    this.updateWebview();
  }

  update(summary: UsageSummary) {
    this.summary = summary;
    this.updateWebview();
  }

  private updateWebview() {
    if (!this.view) return;

    const cssUri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css')
    );

    this.view.webview.html = this.getHtml(cssUri);
  }

  private getHtml(cssUri: vscode.Uri): string {
    const s = this.summary;

    if (!s) {
      return `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="${cssUri}"></head>
<body><p style="color:var(--text-secondary)">Loading usage data...</p></body></html>`;
    }

    const sessionBarClass = this.getBarClass(s.currentSession.percentage);
    const weeklyBarClass = this.getBarClass(s.weekly.percentage);
    const sessionReset = this.formatTimeRemaining(s.currentSession.resetTime);
    const weeklyReset = this.formatResetTime(s.weekly.resetTime);

    return `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div class="section">
    <h2>Plan Usage Limits</h2>

    <div class="metric">
      <h3>Current session</h3>
      <div class="metric-subtitle">Resets in ${sessionReset}</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill ${sessionBarClass}" style="width: ${s.currentSession.percentage}%"></div>
        </div>
        <div class="bar-value">${Math.round(s.currentSession.percentage)}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">
        $${s.currentSession.costUsd.toFixed(2)} / $${s.currentSession.limitUsd.toFixed(2)}
      </div>
    </div>

    <hr class="divider">

    <div class="metric">
      <h3>Weekly limits</h3>
      <div class="metric-subtitle">${weeklyReset}</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill ${weeklyBarClass}" style="width: ${s.weekly.percentage}%"></div>
        </div>
        <div class="bar-value">${Math.round(s.weekly.percentage)}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">
        $${s.weekly.costUsd.toFixed(2)} / $${s.weekly.limitUsd.toFixed(2)}
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section">
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Burn Rate:</span>
        <span class="stat-value">${s.burnRate.tokensPerMin.toFixed(1)} tokens/min</span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Cost Rate:</span>
        <span class="stat-value">$${s.burnRate.costPerMin.toFixed(4)}/min</span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Messages:</span>
        <span class="stat-value">${s.currentSession.messageCount} (session) / ${s.weekly.messageCount} (week)</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Last updated: ${this.formatLastUpdated(s.lastUpdated)}</span>
    <button class="refresh-btn" onclick="refresh()">Refresh</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  private getBarClass(percentage: number): string {
    if (percentage >= 85) return 'danger';
    if (percentage >= 60) return 'warning';
    return '';
  }

  private formatTimeRemaining(resetTime: Date): string {
    const now = new Date();
    const diffMs = resetTime.getTime() - now.getTime();
    if (diffMs <= 0) return 'expired';

    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);

    if (hours > 0) return `${hours} hr ${minutes} min`;
    return `${minutes} min`;
  }

  private formatResetTime(resetTime: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[resetTime.getDay()];
    const hours = resetTime.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `Resets ${day} ${h}:00 ${ampm}`;
  }

  private formatLastUpdated(date: Date): string {
    const diffSec = (Date.now() - date.getTime()) / 1000;
    if (diffSec < 60) return 'less than a minute ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    return `${Math.floor(diffSec / 3600)} hr ago`;
  }
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add webview panel provider with dark theme UI"
```

---

### Task 6: Extension Entry Point (Wiring It All Together)

**Files:**
- Create: `src/extension.ts`
- Create: `media/icon.svg`

**Step 1: Create activity bar icon**

`media/icon.svg` - simple gauge/meter icon:

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z" fill="#888"/>
  <path d="M12 6v6l4 2" stroke="#5b9cf5" stroke-width="2" stroke-linecap="round"/>
</svg>
```

**Step 2: Create extension.ts**

```typescript
import * as vscode from 'vscode';
import { UsagePanelProvider } from './webviewProvider';
import { UsageAnalyser, AnalyserConfig } from './usageAnalyser';
import { readAllUsageEntries } from './usageReader';

let refreshTimer: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;
let panelProvider: UsagePanelProvider;
let analyser: UsageAnalyser;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code Monitor is now active');

  // Initialise analyser
  analyser = new UsageAnalyser(loadAnalyserConfig());

  // Create sidebar webview provider
  panelProvider = new UsagePanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      UsagePanelProvider.viewType,
      panelProvider
    )
  );

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    900
  );
  statusBarItem.command = 'ccm.refresh';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ccm.refresh', refreshUsage)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ccm.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'ccm');
    })
  );

  // Listen for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('ccm')) {
        analyser.updateConfig(loadAnalyserConfig());
        restartRefreshTimer();
        refreshUsage();
      }
    })
  );

  // Initial refresh and start timer
  refreshUsage();
  startRefreshTimer();
}

export function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (statusBarItem) statusBarItem.dispose();
}

function loadAnalyserConfig(): AnalyserConfig {
  const config = vscode.workspace.getConfiguration('ccm');
  return {
    sessionDurationHours: config.get('sessionDurationHours', 5),
    weeklyLimitUsd: config.get('weeklyLimitUsd', 100),
    sessionLimitUsd: config.get('sessionLimitUsd', 72.28),
  };
}

function getDataPath(): string | undefined {
  const config = vscode.workspace.getConfiguration('ccm');
  const custom = config.get<string>('dataPath', '');
  return custom || undefined;
}

function refreshUsage() {
  try {
    const entries = readAllUsageEntries(getDataPath());
    const summary = analyser.analyse(entries);

    // Update webview
    panelProvider.update(summary);

    // Update status bar
    const sessionPct = Math.round(summary.currentSession.percentage);
    const weeklyPct = Math.round(summary.weekly.percentage);
    const icon = sessionPct >= 85 ? '$(warning)' : '$(pulse)';
    statusBarItem.text = `${icon} S:${sessionPct}% W:${weeklyPct}%`;
    statusBarItem.tooltip = `Session: $${summary.currentSession.costUsd.toFixed(2)} / $${summary.currentSession.limitUsd.toFixed(2)}\nWeekly: $${summary.weekly.costUsd.toFixed(2)} / $${summary.weekly.limitUsd.toFixed(2)}\nBurn: ${summary.burnRate.tokensPerMin.toFixed(0)} tok/min`;

    // Colour coding
    const maxPct = Math.max(sessionPct, weeklyPct);
    if (maxPct >= 85) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (maxPct >= 60) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.backgroundColor = undefined;
    }
  } catch (error) {
    console.error('CCM refresh error:', error);
    statusBarItem.text = '$(pulse) CCM: Error';
  }
}

function startRefreshTimer() {
  const config = vscode.workspace.getConfiguration('ccm');
  const intervalSec = config.get('refreshIntervalSec', 60);
  refreshTimer = setInterval(refreshUsage, intervalSec * 1000);
}

function restartRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  startRefreshTimer();
}
```

**Step 3: Compile and verify**

```bash
npm run compile
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: wire up extension with webview, status bar, and auto-refresh"
```

---

### Task 7: Manual Testing and Polish

**Step 1: Package and test locally**

```bash
npm run package
```

Then install the .vsix in VS Code and verify:
- Activity bar icon appears
- Sidebar panel shows usage data with progress bars
- Status bar shows compact summary
- Refresh button works
- Colour coding triggers at thresholds

**Step 2: Fix any issues found during testing**

**Step 3: Final commit**

```bash
git add -A && git commit -m "fix: polish from manual testing"
```

---

## Summary

| Task | Description | Tests |
|------|-------------|-------|
| 1 | Project scaffolding | - |
| 2 | Types + pricing | pricing.test.ts |
| 3 | Usage reader (JSONL parsing) | usageReader.test.ts |
| 4 | Usage analyser (session blocks, costs) | usageAnalyser.test.ts |
| 5 | Webview provider + CSS | - |
| 6 | Extension wiring | - |
| 7 | Manual testing + polish | - |
