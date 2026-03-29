import { calculateEntryCost, normaliseModelName } from '../src/pricing';
import { UsageEntry } from '../src/types';

describe('normaliseModelName', () => {
  it('normalises opus variants', () => {
    expect(normaliseModelName('claude-opus-4-6')).toBe('opus');
    expect(normaliseModelName('claude-opus-4-20250514')).toBe('opus');
  });

  it('normalises sonnet variants', () => {
    expect(normaliseModelName('claude-sonnet-4-6')).toBe('sonnet');
    expect(normaliseModelName('claude-sonnet-4-5-20250514')).toBe('sonnet');
  });

  it('normalises haiku variants', () => {
    expect(normaliseModelName('claude-haiku-4-5-20251001')).toBe('haiku');
  });

  it('returns unknown for unrecognised models', () => {
    expect(normaliseModelName('gpt-4')).toBe('unknown');
  });
});

describe('calculateEntryCost', () => {
  it('calculates opus cost correctly', () => {
    const entry: UsageEntry = {
      timestamp: new Date(),
      sessionId: 'test',
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 2000,
      cacheReadTokens: 3000,
    };
    const cost = calculateEntryCost(entry);
    expect(cost).toBeCloseTo(0.0945, 4);
  });

  it('calculates sonnet cost correctly', () => {
    const entry: UsageEntry = {
      timestamp: new Date(),
      sessionId: 'test',
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    const cost = calculateEntryCost(entry);
    expect(cost).toBeCloseTo(0.0105, 4);
  });

  it('returns 0 for unknown models', () => {
    const entry: UsageEntry = {
      timestamp: new Date(),
      sessionId: 'test',
      model: 'unknown-model',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };
    expect(calculateEntryCost(entry)).toBe(0);
  });
});
