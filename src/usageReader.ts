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

export function readAllUsageEntries(dataPath?: string, maxAgeDays: number = 7): UsageEntry[] {
  const basePath = dataPath || getDefaultDataPath();
  const allEntries: UsageEntry[] = [];

  if (!fs.existsSync(basePath)) return allEntries;

  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  const walkDir = (dir: string) => {
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          walkDir(fullPath);
        } else if (item.name.endsWith('.jsonl')) {
          // Skip files not modified within the lookback window
          try {
            const stat = fs.statSync(fullPath);
            if (stat.mtimeMs < cutoffMs) continue;
          } catch {
            continue;
          }
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
