import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface HookStatus {
  fiveHourPct: number | null;
  fiveHourResetAt: Date | null;
  sevenDayPct: number | null;
  sevenDayResetAt: Date | null;
  modelName: string | null;
  updatedAt: Date;
  isStale: boolean;
}

const STATUS_PATH = path.join(os.homedir(), '.claude', 'ccm-status.json');
const STALE_MS = 5 * 60 * 1000; // 5 minutes

let lastValidStatus: HookStatus | null = null;

export function readHookStatus(): HookStatus | null {
  try {
    const raw = fs.readFileSync(STATUS_PATH, 'utf-8');
    const data = JSON.parse(raw);

    const updatedAt = new Date(data.updatedAt);
    if (isNaN(updatedAt.getTime())) return lastValidStatus;

    const isStale = Date.now() - updatedAt.getTime() > STALE_MS;

    if (!isStale) {
      lastValidStatus = {
        fiveHourPct: typeof data.fiveHourPct === 'number' ? data.fiveHourPct : null,
        fiveHourResetAt: data.fiveHourResetAt ? new Date(data.fiveHourResetAt * 1000) : null,
        sevenDayPct: typeof data.sevenDayPct === 'number' ? data.sevenDayPct : null,
        sevenDayResetAt: data.sevenDayResetAt ? new Date(data.sevenDayResetAt * 1000) : null,
        modelName: typeof data.modelName === 'string' ? data.modelName : null,
        updatedAt,
        isStale: false,
      };
      return lastValidStatus;
    }

    // Stale file — return cached reading marked as stale if available
    if (lastValidStatus) {
      return { ...lastValidStatus, isStale: true };
    }

    return null;
  } catch {
    // File missing or corrupt — return cached reading marked as stale if available
    if (lastValidStatus) {
      return { ...lastValidStatus, isStale: true };
    }
    return null;
  }
}
