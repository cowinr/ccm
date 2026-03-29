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
      weeklyResetDay: 5,
      weeklyResetHour: 9,
    });
  });

  describe('fixed 5-hour window', () => {
    it('includes all entries within the window', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T13:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      expect(summary.currentSession.messageCount).toBe(2);
      expect(summary.currentSession.tokenCount).toBe(3000);
    });

    it('reset time = window start + 5 hours', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      // Window starts at 12:00, reset at 17:00
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

    it('includes entries from multiple sessions in same window', () => {
      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z'), sessionId: 'session-a' }),
        makeEntry({ timestamp: new Date('2026-03-29T13:00:00Z'), sessionId: 'session-b' }),
      ];

      const summary = analyser.analyse(entries, now);
      // Both sessions count - it's a time window, not per-session
      expect(summary.currentSession.messageCount).toBe(2);
    });

    it('starts a new window after a 5+ hour gap', () => {
      const now = new Date('2026-03-29T20:00:00Z');
      const entries: UsageEntry[] = [
        // Old window (expired)
        makeEntry({ timestamp: new Date('2026-03-29T08:00:00Z') }),
        // Gap of 10 hours
        // New window
        makeEntry({ timestamp: new Date('2026-03-29T18:00:00Z') }),
        makeEntry({ timestamp: new Date('2026-03-29T19:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      // Only the new window entries
      expect(summary.currentSession.messageCount).toBe(2);
      // Reset = 18:00 + 5h = 23:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(23);
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
        weeklyResetDay: 5,
        weeklyResetHour: 9,
      });

      const now = new Date('2026-03-29T14:00:00Z');
      const entries: UsageEntry[] = [
        makeEntry({ timestamp: new Date('2026-03-29T12:00:00Z') }),
      ];

      const summary = analyser.analyse(entries, now);
      // 3h window: start 12:00, reset 15:00
      expect(summary.currentSession.resetTime.getUTCHours()).toBe(15);
    });
  });
});
