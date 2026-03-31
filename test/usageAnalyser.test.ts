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
      // 18:30 entry is before window start (19:00), so only 19:00 and 20:00 count
      expect(summary.currentSession.messageCount).toBe(2);
      // Window starts at 19:00 (rounded up from 18:30), reset at 00:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(0);
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

    it('returns 0% when no hook data (token limits removed)', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z'), inputTokens: 2000, outputTokens: 1000 }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.percentage).toBe(0);
    });

    it('uses hook percentage when live data present', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];
      const hookStatus = {
        fiveHourPct: 42,
        fiveHourResetAt: new Date('2026-03-29T17:00:00Z'),
        sevenDayPct: 15,
        sevenDayResetAt: new Date('2026-04-04T09:00:00Z'),
        modelName: 'Claude Sonnet 4.6',
        updatedAt: now,
        isStale: false,
      };

      const summary = analyser.analyse(entries, now, hookStatus);
      expect(summary.currentSession.percentage).toBe(42);
      expect(summary.weekly.percentage).toBe(15);
    });

    it('caps hook percentage at 100', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const hookStatus = {
        fiveHourPct: 110,
        fiveHourResetAt: new Date('2026-03-29T17:00:00Z'),
        sevenDayPct: null,
        sevenDayResetAt: null,
        modelName: null,
        updatedAt: now,
        isStale: false,
      };

      const summary = analyser.analyse([], now, hookStatus);
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
