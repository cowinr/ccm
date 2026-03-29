import { ModelPricing, UsageEntry } from './types';

const MODEL_PRICING: Record<string, ModelPricing> = {
  opus: {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheCreationPerMillion: 18.75,
    cacheReadPerMillion: 1.50,
  },
  sonnet: {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheCreationPerMillion: 3.75,
    cacheReadPerMillion: 0.30,
  },
  haiku: {
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
    cacheCreationPerMillion: 0.30,
    cacheReadPerMillion: 0.03,
  },
};

export function normaliseModelName(model: string): string {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'opus';
  if (lower.includes('sonnet')) return 'sonnet';
  if (lower.includes('haiku')) return 'haiku';
  return 'unknown';
}

export function calculateEntryCost(entry: UsageEntry): number {
  const modelKey = normaliseModelName(entry.model);
  const pricing = MODEL_PRICING[modelKey];
  if (!pricing) return 0;

  return (
    (entry.inputTokens * pricing.inputPerMillion +
      entry.outputTokens * pricing.outputPerMillion +
      entry.cacheCreationTokens * pricing.cacheCreationPerMillion +
      entry.cacheReadTokens * pricing.cacheReadPerMillion) /
    1_000_000
  );
}
