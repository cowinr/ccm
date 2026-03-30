export interface UsageEntry {
  timestamp: Date;
  sessionId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface SessionBlock {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  entries: UsageEntry[];
  totalCostUsd: number;
  totalTokens: number;
  messageCount: number;
  modelBreakdown: Record<string, { tokens: number; costUsd: number }>;
}

export interface UsageSummary {
  currentModel: string | null;
  currentSession: {
    tokenCount: number;
    tokenLimit: number;
    percentage: number;
    messageCount: number;
    resetTime: Date;
    histogram: { label: string; tokens: number; byModel: { sonnet: number; opus: number; haiku: number } }[];
    fromHook: boolean;
    timeElapsedPct: number;
  };
  weekly: {
    tokenCount: number;
    tokenLimit: number;
    percentage: number;
    messageCount: number;
    resetTime: Date;
    fromHook: boolean;
    timeElapsedPct: number;
  };
  burnRate: {
    tokensPerMin: number;
  };
  lastUpdated: Date;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}
