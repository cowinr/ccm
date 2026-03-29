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

    return {
      currentSession: {
        tokenCount: sessionTokens,
        tokenLimit: this.config.sessionTokenLimit,
        percentage: Math.min((sessionTokens / this.config.sessionTokenLimit) * 100, 100),
        messageCount: sessionEntries.length,
        resetTime: windowEnd,
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
   * Walk backwards through entries; the window starts at the first entry
   * after the most recent gap of >= windowMs (or the first entry if no gap).
   * Returns null if the most recent window has already expired.
   */
  private findWindowStart(entries: UsageEntry[], now: Date, windowMs: number): Date | null {
    if (entries.length === 0) return null;

    // Only consider entries that could be in an active or recently-expired window
    // (no point scanning ancient history)
    const relevantEntries = entries.filter(
      e => e.timestamp.getTime() > now.getTime() - windowMs * 2
    );
    if (relevantEntries.length === 0) return null;

    // Walk backwards to find the most recent gap >= windowMs
    let windowStartIdx = 0;
    for (let i = relevantEntries.length - 1; i > 0; i--) {
      const gap = relevantEntries[i].timestamp.getTime() - relevantEntries[i - 1].timestamp.getTime();
      if (gap >= windowMs) {
        windowStartIdx = i;
        break;
      }
    }

    // Window starts on the clock hour (rounded down)
    const raw = relevantEntries[windowStartIdx].timestamp;
    const windowStart = new Date(raw);
    windowStart.setMinutes(0, 0, 0);
    const windowEnd = new Date(windowStart.getTime() + windowMs);

    // If the window has expired, return null
    if (windowEnd <= now) return null;

    return windowStart;
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
