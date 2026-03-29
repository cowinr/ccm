import { UsageEntry, UsageSummary } from './types';

export interface AnalyserConfig {
  sessionDurationHours: number;
  sessionTokenLimit: number;
  weeklyResetDay: number;  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  weeklyResetHour: number; // 0-23, local time
}

export class UsageAnalyser {
  constructor(private config: AnalyserConfig) {}

  updateConfig(config: AnalyserConfig) {
    this.config = config;
  }

  analyse(entries: UsageEntry[], now: Date = new Date()): UsageSummary {
    const windowMs = this.config.sessionDurationHours * 60 * 60 * 1000;

    // Fixed window: find the start of the current window by looking for a gap >= windowMs
    const windowStart = this.findWindowStart(entries, now, windowMs);
    const windowEnd = windowStart
      ? new Date(windowStart.getTime() + windowMs)
      : now;

    // If window has expired, no active session
    const windowActive = windowStart !== null && windowEnd > now;
    const sessionEntries = windowActive
      ? entries.filter(e => e.timestamp >= windowStart && e.timestamp <= now)
      : [];

    const weekEntries = this.getCurrentWeekEntries(entries, now);
    const weekResetTime = this.getNextWeeklyReset(now);
    const burnRate = this.calculateBurnRate(sessionEntries, now);

    const sessionTokens = this.sumTokens(sessionEntries);

    const histogram = this.buildHistogram(sessionEntries, windowStart || now, windowMs);

    return {
      currentSession: {
        tokenCount: sessionTokens,
        tokenLimit: this.config.sessionTokenLimit,
        percentage: Math.min((sessionTokens / this.config.sessionTokenLimit) * 100, 100),
        messageCount: sessionEntries.length,
        resetTime: windowEnd,
        histogram,
      },
      weekly: {
        tokenCount: this.sumTokens(weekEntries),
        messageCount: weekEntries.length,
        resetTime: weekResetTime,
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

  private buildHistogram(
    entries: UsageEntry[],
    windowStart: Date,
    windowMs: number
  ): { label: string; tokens: number }[] {
    const BUCKET_MS = 15 * 60 * 1000; // 15-minute buckets
    const bucketCount = Math.ceil(windowMs / BUCKET_MS);
    const startMs = windowStart.getTime();

    const buckets: { label: string; tokens: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const bucketStart = new Date(startMs + i * BUCKET_MS);
      const h = bucketStart.getHours().toString().padStart(2, '0');
      const m = bucketStart.getMinutes().toString().padStart(2, '0');
      buckets.push({ label: `${h}:${m}`, tokens: 0 });
    }

    for (const entry of entries) {
      const offset = entry.timestamp.getTime() - startMs;
      const idx = Math.floor(offset / BUCKET_MS);
      if (idx >= 0 && idx < buckets.length) {
        buckets[idx].tokens += entry.inputTokens + entry.outputTokens +
          entry.cacheCreationTokens + entry.cacheReadTokens;
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
