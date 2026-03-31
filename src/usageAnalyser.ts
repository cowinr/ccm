import { UsageEntry, UsageSummary } from './types';
import { HookStatus } from './statusReader';

export interface AnalyserConfig {
  sessionDurationHours: number;
  sessionTokenLimit: number;
  weeklyTokenLimit: number;
  weeklyResetDay: number;  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  weeklyResetHour: number; // 0-23, local time
}

export class UsageAnalyser {
  constructor(private config: AnalyserConfig) {}

  updateConfig(config: AnalyserConfig) {
    this.config = config;
  }

  analyse(entries: UsageEntry[], now: Date = new Date(), hookStatus?: HookStatus | null): UsageSummary {
    const windowMs = this.config.sessionDurationHours * 60 * 60 * 1000;

    // Fixed window: find the start of the current window by looking for a gap >= windowMs
    const jsonlWindowStart = this.findWindowStart(entries, now, windowMs);
    const jsonlWindowEnd = jsonlWindowStart
      ? new Date(jsonlWindowStart.getTime() + windowMs)
      : now;

    const sessionReset = hookStatus?.fiveHourResetAt ?? jsonlWindowEnd;
    const weekResetTime = this.getNextWeeklyReset(now);

    // Prefer live hook data for window boundaries; fall back to JSONL heuristic
    const sessionWindowStart = hookStatus?.fiveHourResetAt
      ? new Date(hookStatus.fiveHourResetAt.getTime() - windowMs)
      : (jsonlWindowStart ?? now);
    const sessionWindowEnd = hookStatus?.fiveHourResetAt ?? jsonlWindowEnd;

    // If window has expired, no active session
    const windowActive = sessionWindowEnd > now &&
      (hookStatus?.fiveHourResetAt != null || jsonlWindowStart !== null);
    const sessionEntries = windowActive
      ? entries.filter(e => e.timestamp >= sessionWindowStart && e.timestamp <= now)
      : [];

    const weekEntries = this.getCurrentWeekEntries(entries, now);
    const burnRate = this.calculateBurnRate(sessionEntries, now);

    const sessionTokens = this.sumTokens(sessionEntries);
    const weeklyTokens = this.sumTokens(weekEntries);

    const histogram = this.buildHistogram(sessionEntries, sessionWindowStart, windowMs);

    const sessionPct = hookStatus?.fiveHourPct != null
      ? Math.min(hookStatus.fiveHourPct, 100)
      : Math.min((sessionTokens / this.config.sessionTokenLimit) * 100, 100);

    const weeklyPct = hookStatus?.sevenDayPct != null
      ? Math.min(hookStatus.sevenDayPct, 100)
      : Math.min((weeklyTokens / this.config.weeklyTokenLimit) * 100, 100);
    const weeklyReset = hookStatus?.sevenDayResetAt ?? weekResetTime;
    const sessionWindowMs = sessionWindowEnd.getTime() - sessionWindowStart.getTime();
    const sessionTimeElapsedPct = sessionWindowMs > 0
      ? Math.min(Math.max((now.getTime() - sessionWindowStart.getTime()) / sessionWindowMs * 100, 0), 100)
      : 0;

    // Time elapsed within the current week (0–100)
    const weekStart = this.getWeekStart(now);
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const weeklyTimeElapsedPct = Math.min(Math.max(
      (now.getTime() - weekStart.getTime()) / weekMs * 100, 0), 100);

    const rawModel = hookStatus?.modelName
      ?? (entries.length > 0 ? entries[entries.length - 1].model : null);
    const currentModel = rawModel
      ? (rawModel.startsWith('claude-') ? this.formatModelName(rawModel) : rawModel)
      : null;

    return {
      currentModel,
      currentSession: {
        tokenCount: sessionTokens,
        tokenLimit: this.config.sessionTokenLimit,
        percentage: sessionPct,
        messageCount: sessionEntries.length,
        resetTime: sessionReset,
        histogram,
        fromHook: hookStatus?.fiveHourPct != null,
        hookIsStale: hookStatus?.isStale ?? false,
        timeElapsedPct: sessionTimeElapsedPct,
      },
      weekly: {
        tokenCount: weeklyTokens,
        tokenLimit: this.config.weeklyTokenLimit,
        percentage: weeklyPct,
        messageCount: weekEntries.length,
        resetTime: weeklyReset,
        fromHook: hookStatus?.sevenDayPct != null,
        hookIsStale: hookStatus?.isStale ?? false,
        timeElapsedPct: weeklyTimeElapsedPct,
      },
      burnRate,
      lastUpdated: now,
    };
  }

  /**
   * Find the start of the current fixed window.
   * Since Anthropic's window boundaries are server-side and can't be
   * perfectly detected from local data, we use the largest gap (> 1 hour)
   * walking backwards from the latest entry as a proxy for "session resumed
   * after previous window expired". Falls back to the first entry if no
   * significant gap is found.
   */
  private findWindowStart(entries: UsageEntry[], now: Date, windowMs: number): Date | null {
    if (entries.length === 0) return null;

    // Only consider entries within the last 2 windows
    const cutoff = now.getTime() - windowMs * 2;
    const relevantEntries = entries.filter(e => e.timestamp.getTime() > cutoff);
    if (relevantEntries.length === 0) return null;

    // Walk backwards looking for the largest gap (proxy for window boundary)
    // Only consider gaps > 1 hour as meaningful session breaks
    const MIN_GAP_MS = 60 * 60 * 1000; // 1 hour
    let bestGapIdx = 0;
    let bestGapMs = 0;

    for (let i = relevantEntries.length - 1; i > 0; i--) {
      const gap = relevantEntries[i].timestamp.getTime() - relevantEntries[i - 1].timestamp.getTime();
      if (gap > MIN_GAP_MS && gap > bestGapMs) {
        bestGapMs = gap;
        bestGapIdx = i;
        break; // Take the most recent significant gap
      }
    }

    const windowStart = this.roundUpToHour(relevantEntries[bestGapIdx].timestamp);
    const windowEnd = new Date(windowStart.getTime() + windowMs);

    if (windowEnd <= now) return null;

    return windowStart;
  }

  private formatModelName(id: string): string {
    // claude-sonnet-4-6 → Claude Sonnet 4.6
    // claude-haiku-4-5-20251001 → Claude Haiku 4.5
    return id
      .replace(/^claude-/, 'Claude ')
      .replace(/-(\d+)-(\d+).*$/, ' $1.$2')
      .replace(/(^|\s)\w/g, c => c.toUpperCase());
  }

  private classifyModel(model: string): 'opus' | 'haiku' | 'sonnet' {
    const m = model.toLowerCase();
    if (m.includes('opus')) return 'opus';
    if (m.includes('haiku')) return 'haiku';
    return 'sonnet';
  }

  private buildHistogram(
    entries: UsageEntry[],
    windowStart: Date,
    windowMs: number
  ): { label: string; tokens: number; byModel: { sonnet: number; opus: number; haiku: number } }[] {
    const BUCKET_MS = 15 * 60 * 1000; // 15-minute buckets
    const bucketCount = Math.ceil(windowMs / BUCKET_MS);
    const startMs = windowStart.getTime();

    const buckets: { label: string; tokens: number; byModel: { sonnet: number; opus: number; haiku: number } }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = new Date(startMs + i * BUCKET_MS);
      const h = bucketStart.getHours().toString().padStart(2, '0');
      const m = bucketStart.getMinutes().toString().padStart(2, '0');
      buckets.push({ label: `${h}:${m}`, tokens: 0, byModel: { sonnet: 0, opus: 0, haiku: 0 } });
    }

    for (const entry of entries) {
      const offset = entry.timestamp.getTime() - startMs;
      const idx = Math.floor(offset / BUCKET_MS);
      if (idx >= 0 && idx < buckets.length) {
        const entryTokens = entry.inputTokens + entry.outputTokens +
          entry.cacheCreationTokens + entry.cacheReadTokens;
        buckets[idx].tokens += entryTokens;
        buckets[idx].byModel[this.classifyModel(entry.model)] += entryTokens;
      }
    }

    return buckets;
  }

  private roundUpToHour(date: Date): Date {
    const d = new Date(date);
    if (d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0) {
      return d; // Already on the hour
    }
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }

  private getCurrentWeekEntries(entries: UsageEntry[], now: Date): UsageEntry[] {
    const weekStart = this.getWeekStart(now);
    return entries.filter(e => e.timestamp >= weekStart && e.timestamp <= now);
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const currentDay = d.getDay();
    const resetDay = this.config.weeklyResetDay;

    let daysSinceReset = currentDay - resetDay;
    if (daysSinceReset < 0) daysSinceReset += 7;

    d.setDate(d.getDate() - daysSinceReset);
    d.setHours(this.config.weeklyResetHour, 0, 0, 0);

    if (d > date) {
      d.setDate(d.getDate() - 7);
    }

    return d;
  }

  private getNextWeeklyReset(now: Date): Date {
    const weekStart = this.getWeekStart(now);
    return new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  private sumTokens(entries: UsageEntry[]): number {
    return entries.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens,
      0
    );
  }

  private calculateBurnRate(
    entries: UsageEntry[],
    now: Date
  ): { tokensPerMin: number } {
    if (entries.length === 0) return { tokensPerMin: 0 };

    const firstTime = entries[0].timestamp.getTime();
    const elapsedMin = (now.getTime() - firstTime) / 60000;

    if (elapsedMin < 1) return { tokensPerMin: 0 };

    return {
      tokensPerMin: this.sumTokens(entries) / elapsedMin,
    };
  }
}
