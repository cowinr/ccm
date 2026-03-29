import { UsageEntry, UsageSummary } from './types';

export interface AnalyserConfig {
  sessionDurationHours: number;
  weeklyResetDay: number;  // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  weeklyResetHour: number; // 0-23, local time
}

export class UsageAnalyser {
  constructor(private config: AnalyserConfig) {}

  updateConfig(config: AnalyserConfig) {
    this.config = config;
  }

  analyse(entries: UsageEntry[], now: Date = new Date()): UsageSummary {
    const sessionEntries = this.getCurrentSessionEntries(entries, now);
    const weekEntries = this.getCurrentWeekEntries(entries, now);

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
        tokenCount: this.sumTokens(sessionEntries),
        messageCount: sessionEntries.length,
        resetTime: sessionResetTime,
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

  private getCurrentSessionEntries(entries: UsageEntry[], now: Date): UsageEntry[] {
    const sessionDurationMs = this.config.sessionDurationHours * 60 * 60 * 1000;

    const bySession = new Map<string, UsageEntry[]>();
    for (const entry of entries) {
      const existing = bySession.get(entry.sessionId) || [];
      existing.push(entry);
      bySession.set(entry.sessionId, existing);
    }

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

    const sessionStart = latestSession[0].timestamp;
    const sessionEnd = new Date(sessionStart.getTime() + sessionDurationMs);

    if (now > sessionEnd) return [];

    return latestSession;
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
