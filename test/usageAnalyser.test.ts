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
      sessionTokenLimit: 175_000_000,
      weeklyResetDay: 5,
      weeklyResetHour: 9,
    });
  });

  describe('fixed 5-hour window', () => {
    it('includes all entries within the window (no gaps)', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T12:30:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T13:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(3);
      expect(summary.currentSession.tokenCount).toBe(4500);
    });

    it('reset time = window start + 5 hours', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(17);
    });

    it('returns zero when window has expired', () => {
      const now = new Date('2026-03-29T20:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(0);
      expect(summary.currentSession.tokenCount).toBe(0);
    });

    it('uses largest recent gap (>1h) as window boundary', () => {
      const now = new Date('2026-03-29T20:30:00Z');
      const entries: UsageEntry[] = [
        // Old window activity
        makeEntry({ timestamp: new Date('2026-03-29T14:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T14:30:00Z') }),
        // 4 hour gap (biggest gap = window boundary)
        // New window activity
        makeEntry({ timestamp: new Date('2026-03-29T18:30:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T19:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T20:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      // Only entries after the gap
      expect(summary.currentSession.messageCount).toBe(3);
      // Window starts at 18:00 (rounded down), reset at 23:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(23);
    });

    it('includes entries from multiple sessions in same window', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z'), sessionId: 'session-a' }),
        makeEntry({ timestamp: new Date('2026-03-29T12:30:00Z'), sessionId: 'session-b' }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(2);
    });

    it('calculates percentage against token limit', () => {
      const analyser2 = new UsageAnalyser({
        sessionDurationHours: 5,
        sessionTokenLimit: 10000,
        weeklyResetDay: 5,
        weeklyResetHour: 9,
      });
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z'), inputTokens: 2000, outputTokens: 1000 }),
      ];

      const summary = analyser2.analyse(entries, now);
      expect(summary.currentSession.percentage).toBe(30);
    });

    it('caps percentage at 100', () => {
      const analyser2 = new UsageAnalyser({
        sessionDurationHours: 5,
        sessionTokenLimit: 1000,
        weeklyResetDay: 5,
        weeklyResetHour: 9,
      });
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z'), inputTokens: 2000, outputTokens: 1000 }),
      ];

      const summary = analyser2.analyse(entries, now);
      expect(summary.currentSession.percentage).toBe(100);
    });
  });

  describe('weekly summary', () => {
    it('sums tokens for entries in the current week', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-28T10:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T10:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.weekly.messageCount).toBe(2);
      expect(summary.weekly.tokenCount).toBe(3000);
    });

    it('excludes entries from previous weeks', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-20T10:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T10:00:00Z') }),
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
          inputTokens: 5000,
          outputTokens: 5000,
        }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.burnRate.tokensPerMin).toBeCloseTo(1000, 0);
    });

    it('returns zero burn rate with no entries', () => {
      const summary = analyser.analyse([], new Date());
      expect(summary.burnRate.tokensPerMin).toBe(0);
    });
  });

  describe('updateConfig', () => {
    it('updates window duration', () => {
      analyser.updateConfig({
        sessionDurationHours: 3,
        sessionTokenLimit: 175_000_000,
        weeklyResetDay: 5,
        weeklyResetHour: 9,
      });

      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(15);
    });
  });
});
