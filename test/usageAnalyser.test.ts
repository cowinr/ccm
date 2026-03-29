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

  describe('current session', () => {
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

    it('calculates reset time as first entry time + session duration', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      // First entry at 12:00, session = 5h, reset = 17:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(17);
    });

    it('returns zero when session has expired', () => {
      const now = new Date('2026-03-29T20:00:00Z'); // Well past 5h window
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(0);
      expect(summary.currentSession.costUsd).toBe(0);
    });

    it('uses the most recent session when multiple exist', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T08:00:00Z'), sessionId: 'old-session' }),
        makeEntry({ timestamp: new Date('2026-03-29T13:00:00Z'), sessionId: 'new-session' }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(1);
    });

    it('caps percentage at 100', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      // Create entries with huge token counts to exceed limit
      const entries: UsageEntry[] = [
        makeEntry({
          timestamp: new Date('2026-03-29T12:00:00Z'),
          inputTokens: 1_000_000,
          outputTokens: 1_000_000,
        }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.percentage).toBe(100);
    });
  });

  describe('weekly summary', () => {
    it('sums costs for entries in the current week', () => {
      const now = new Date('2026-03-29T14:00:00Z'); // Saturday
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-24T10:00:00Z') }), // Monday
        makeEntry({ timestamp: new Date('2026-03-29T10:00:00Z') }), // Saturday
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.weekly.messageCount).toBe(2);
      expect(summary.weekly.costUsd).toBeGreaterThan(0);
    });

    it('excludes entries from previous weeks', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-20T10:00:00Z') }), // Previous week
        makeEntry({ timestamp: new Date('2026-03-29T10:00:00Z') }), // This week
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.weekly.messageCount).toBe(1);
    });
  });

  describe('burn rate', () => {
    it('calculates tokens per minute', () => {
      const now = new Date('2026-03-29T12:10:00Z');
      const entries: UsageEntry[] = [
        makeEntry({
          timestamp: new Date('2026-03-29T12:00:00Z'),
          sessionId: 'active',
          inputTokens: 5000,
          outputTokens: 5000,
        }),
      ];

      const summary = analyser.analyse(entries, now);
      // 10000 tokens over 10 minutes = 1000 tokens/min
      expect(summary.burnRate.tokensPerMin).toBeCloseTo(1000, 0);
    });

    it('returns zero burn rate with no entries', () => {
      const summary = analyser.analyse([], new Date());
      expect(summary.burnRate.tokensPerMin).toBe(0);
      expect(summary.burnRate.costPerMin).toBe(0);
    });

    it('returns zero burn rate when elapsed time is less than 1 minute', () => {
      const now = new Date('2026-03-29T12:00:30Z'); // 30 seconds after
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z'), sessionId: 'active' }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.burnRate.tokensPerMin).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('updates limits', () => {
      analyser.updateConfig({
        sessionDurationHours: 3,
        weeklyLimitUsd: 200,
        sessionLimitUsd: 50,
      });

      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.limitUsd).toBe(50);
      expect(summary.weekly.limitUsd).toBe(200);
      // Reset should be 3h from start = 15:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(15);
    });
  });
});
