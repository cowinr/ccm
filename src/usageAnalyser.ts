import { UsageEntry, UsageSummary } from './types';
import { calculateEntryCost } from './pricing';

export interface AnalyserConfig {
  sessionDurationHours: number;
  weeklyLimitUsd: number;
  sessionLimitUsd: number;
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

    // Check if this session is still "active"
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
    const currentDay = d.getDay(); // 0=Sun..6=Sat, local time
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

  private sumCosts(entries: UsageEntry[]): number {
    return entries.reduce((sum, e) => sum + calculateEntryCost(e), 0);
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
