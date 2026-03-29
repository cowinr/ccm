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
    costUsd: number;
    limitUsd: number;
    percentage: number;
    resetTime: Date;
    tokenCount: number;
    messageCount: number;
  };
  weekly: {
    costUsd: number;
    limitUsd: number;
    percentage: number;
    resetTime: Date;
    messageCount: number;
  };
  burnRate: {
    tokensPerMin: number;
    costPerMin: number;
  };
  lastUpdated: Date;
}

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheCreationPerMillion: number;
  cacheReadPerMillion: number;
}
