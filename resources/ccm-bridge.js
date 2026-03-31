#!/usr/bin/env node
// CCM bridge: reads Claude Code statusLine stdin JSON, extracts rate_limits,
// writes ~/.claude/ccm-status.json for the VS Code extension to read.
const fs = require('fs');
const path = require('path');
const os = require('os');

const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  try {
    const json = JSON.parse(Buffer.concat(chunks).toString());
    const rl = json.rate_limits;
    if (!rl) return;

    const status = {
      fiveHourPct: rl.five_hour?.used_percentage ?? null,
      fiveHourResetAt: rl.five_hour?.resets_at ?? null,
      sevenDayPct: rl.seven_day?.used_percentage ?? null,
      sevenDayResetAt: rl.seven_day?.resets_at ?? null,
      modelName: json.model?.display_name ?? json.model?.id ?? null,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(
      path.join(os.homedir(), '.claude', 'ccm-status.json'),
      JSON.stringify(status)
    );
  } catch (_) {
    // Silently ignore parse errors or missing data
  }
});
