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
  currentSession: {
    tokenCount: number;
    tokenLimit: number;
    percentage: number;
    messageCount: number;
    resetTime: Date;
    histogram: { label: string; tokens: number }[];
  };
  weekly: {
    tokenCount: number;
    messageCount: number;
    resetTime: Date;
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
