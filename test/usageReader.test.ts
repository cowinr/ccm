import { parseJsonlLine, filterEntriesByTimeRange } from '../src/usageReader';
import { UsageEntry } from '../src/types';

describe('parseJsonlLine', () => {
  it('parses a valid assistant entry', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-03-29T15:37:56.423Z',
      sessionId: 'session-123',
      message: {
        model: 'claude-opus-4-6',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 300,
        },
      },
    });

    const entry = parseJsonlLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.model).toBe('claude-opus-4-6');
    expect(entry!.inputTokens).toBe(100);
    expect(entry!.outputTokens).toBe(50);
    expect(entry!.cacheCreationTokens).toBe(200);
    expect(entry!.cacheReadTokens).toBe(300);
    expect(entry!.sessionId).toBe('session-123');
  });

  it('returns null for non-assistant entries', () => {
    const line = JSON.stringify({ type: 'user', timestamp: '2026-03-29T15:37:56.423Z' });
    expect(parseJsonlLine(line)).toBeNull();
  });

  it('returns null for entries without usage', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-03-29T15:37:56.423Z',
      sessionId: 'session-123',
      message: { model: 'claude-opus-4-6' },
    });
    expect(parseJsonlLine(line)).toBeNull();
  });

  it('handles missing optional token fields', () => {
    const line = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-03-29T15:37:56.423Z',
      sessionId: 'session-123',
      message: {
        model: 'claude-opus-4-6',
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    });
    const entry = parseJsonlLine(line);
    expect(entry).not.toBeNull();
    expect(entry!.cacheCreationTokens).toBe(0);
    expect(entry!.cacheReadTokens).toBe(0);
  });

  it('returns null for invalid JSON', () => {
    expect(parseJsonlLine('not json at all')).toBeNull();
  });

  it('returns null for file-history-snapshot entries', () => {
    const line = JSON.stringify({ type: 'file-history-snapshot', timestamp: '2026-03-29T15:37:56.423Z' });
    expect(parseJsonlLine(line)).toBeNull();
  });
});

describe('filterEntriesByTimeRange', () => {
  const entries: UsageEntry[] = [
    { timestamp: new Date('2026-03-29T10:00:00Z'), sessionId: 's1', model: 'opus', inputTokens: 100, outputTokens: 50, cacheCreationTokens: 0, cacheReadTokens: 0 },
    { timestamp: new Date('2026-03-29T12:00:00Z'), sessionId: 's1', model: 'opus', inputTokens: 200, outputTokens: 100, cacheCreationTokens: 0, cacheReadTokens: 0 },
    { timestamp: new Date('2026-03-29T14:00:00Z'), sessionId: 's2', model: 'opus', inputTokens: 300, outputTokens: 150, cacheCreationTokens: 0, cacheReadTokens: 0 },
  ];

  it('filters entries within time range', () => {
    const start = new Date('2026-03-29T11:00:00Z');
    const end = new Date('2026-03-29T13:00:00Z');
    const filtered = filterEntriesByTimeRange(entries, start, end);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].inputTokens).toBe(200);
  });

  it('returns empty array when no entries match', () => {
    const start = new Date('2026-03-30T00:00:00Z');
    const end = new Date('2026-03-30T23:59:59Z');
    expect(filterEntriesByTimeRange(entries, start, end)).toHaveLength(0);
  });
});
