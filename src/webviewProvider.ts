import * as vscode from 'vscode';
import { UsageSummary } from './types';

export class UsagePanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ccm.usagePanel';

  private view?: vscode.WebviewView;
  private summary?: UsageSummary;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };

    webviewView.webview.onDidReceiveMessage(message => {
      if (message.command === 'refresh') {
        vscode.commands.executeCommand('ccm.refresh');
      }
    });

    this.updateWebview();
  }

  update(summary: UsageSummary) {
    this.summary = summary;
    this.updateWebview();
  }

  private updateWebview() {
    if (!this.view) return;

    const cssUri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'webview.css')
    );

    this.view.webview.html = this.getHtml(cssUri);
  }

  private getHtml(cssUri: vscode.Uri): string {
    const s = this.summary;

    if (!s) {
      return `<!DOCTYPE html>
<html><head><link rel="stylesheet" href="${cssUri}"></head>
<body><p style="color:var(--text-secondary)">Loading usage data...</p></body></html>`;
    }

    const sessionReset = this.formatTimeRemaining(s.currentSession.resetTime);
    const weeklyReset = this.formatResetTime(s.weekly.resetTime);
    const pct = Math.round(s.currentSession.percentage);
    const barClass = s.currentSession.hookIsStale
      ? 'stale'
      : this.getBarClass(s.currentSession.percentage, s.currentSession.timeElapsedPct);

    const sessionBadge = s.currentSession.fromHook && !s.currentSession.hookIsStale
      ? '<span class="badge-live">live</span>'
      : s.currentSession.hookIsStale
        ? '<span class="badge-est">Stale</span>'
        : '<span class="badge-est">Estimated</span>';
    const weeklyBadge = s.weekly.fromHook && !s.weekly.hookIsStale
      ? '<span class="badge-live">live</span>'
      : s.weekly.hookIsStale
        ? '<span class="badge-est">Stale</span>'
        : '<span class="badge-est">Estimated</span>';

    const sessionTokenLine = s.currentSession.fromHook
      ? `~${this.formatTokens(s.currentSession.tokenCount)} tokens (from local data)`
      : `${this.formatTokens(s.currentSession.tokenCount)} / ${this.formatTokens(s.currentSession.tokenLimit)} tokens`;
    const weeklyTokenLine = s.weekly.fromHook
      ? `~${this.formatTokens(s.weekly.tokenCount)} tokens (from local data)`
      : `${this.formatTokens(s.weekly.tokenCount)} / ${this.formatTokens(s.weekly.tokenLimit)} tokens`;

    const sessionTimePct = Math.round(s.currentSession.timeElapsedPct);
    const weeklyTimePct = Math.round(s.weekly.timeElapsedPct);

    const modelBadge = s.currentModel
      ? (() => {
          const m = s.currentModel.toLowerCase();
          const cls = m.includes('opus') ? 'opus' : m.includes('haiku') ? 'haiku' : 'sonnet';
          return `<div class="model-badge model-${cls}">${s.currentModel}</div>`;
        })()
      : '';

    return `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  ${modelBadge}
  <div class="section">
    <h2>Current session ${sessionBadge}</h2>

    <div class="metric">
      <div class="metric-subtitle">Resets in ${sessionReset}</div>
      <div class="bar-container">
        <div class="bar-with-marker">
          <div class="bar-track">
            <div class="bar-fill ${barClass}" style="width: ${s.currentSession.percentage}%"></div>
          </div>
          <div class="bar-time-marker" style="left:${sessionTimePct}%"></div>
        </div>
        <div class="bar-value">${pct}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">${sessionTokenLine}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-block">
        <div class="stat-number">${s.currentSession.messageCount}</div>
        <div class="stat-label">messages</div>
      </div>
      <div class="stat-block">
        <div class="stat-number">${this.formatTokens(Math.round(s.burnRate.tokensPerMin))}</div>
        <div class="stat-label">tokens/min</div>
      </div>
    </div>

    ${this.renderHistogram(s.currentSession.histogram)}
  </div>

  <hr class="divider">

  <div class="section">
    <h2>Weekly usage ${weeklyBadge}</h2>

    <div class="metric">
      <div class="metric-subtitle">${weeklyReset}</div>
      <div class="bar-container">
        <div class="bar-with-marker">
          <div class="bar-track">
            <div class="bar-fill ${this.getBarClass(s.weekly.percentage, s.weekly.timeElapsedPct)}" style="width: ${s.weekly.percentage}%"></div>
          </div>
          <div class="bar-time-marker" style="left:${weeklyTimePct}%"></div>
        </div>
        <div class="bar-value">${Math.round(s.weekly.percentage)}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">${weeklyTokenLine}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-block">
        <div class="stat-number">${s.weekly.messageCount}</div>
        <div class="stat-label">messages</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span>Last updated: ${this.formatLastUpdated(s.lastUpdated)}</span>
    <button class="refresh-btn" onclick="refresh()">Refresh</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function refresh() {
      vscode.postMessage({ command: 'refresh' });
    }
  </script>
</body>
</html>`;
  }

  private renderHistogram(buckets: { label: string; tokens: number; byModel: { sonnet: number; opus: number; haiku: number } }[]): string {
    const maxTokens = Math.max(...buckets.map(b => b.tokens), 1);

    const MODEL_COLORS = { sonnet: '#5b9cf5', opus: '#e74c3c', haiku: '#4caf50' };

    const bars = buckets.map((b, i) => {
      const heightPct = (b.tokens / maxTokens) * 100;
      const showLabel = i % 4 === 0;
      const label = showLabel ? `<div class="hist-label">${b.label}</div>` : '';

      const parts: string[] = [];
      if (b.byModel.opus > 0)   parts.push(`Opus: ${this.formatTokens(b.byModel.opus)}`);
      if (b.byModel.haiku > 0)  parts.push(`Haiku: ${this.formatTokens(b.byModel.haiku)}`);
      if (b.byModel.sonnet > 0) parts.push(`Sonnet: ${this.formatTokens(b.byModel.sonnet)}`);
      const tooltip = `${b.label}: ${this.formatTokens(b.tokens)}${parts.length ? ' — ' + parts.join(', ') : ''}`;

      const segments = (['haiku', 'sonnet', 'opus'] as const)
        .filter(m => b.byModel[m] > 0)
        .map(m => `<div style="flex:${b.byModel[m]};background:${MODEL_COLORS[m]};min-height:1px"></div>`)
        .join('');

      const stack = `<div class="hist-stack" style="height:${heightPct}%">${segments}</div>`;

      return `<div class="hist-col" title="${tooltip}">${stack}${label}</div>`;
    }).join('');

    return `<div class="histogram"><div class="hist-bars">${bars}</div></div>`;
  }

  private getBarClass(percentage: number, timeElapsedPct: number): string {
    if (percentage >= timeElapsedPct) return 'danger';
    if (percentage >= timeElapsedPct * 0.6) return 'warning';
    return '';
  }

  private formatTokens(count: number): string {
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  }

  private formatTimeRemaining(resetTime: Date): string {
    const now = new Date();
    const diffMs = resetTime.getTime() - now.getTime();
    if (diffMs <= 0) return 'expired';

    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);

    if (hours > 0) return `${hours} hr ${minutes} min`;
    return `${minutes} min`;
  }

  private formatResetTime(resetTime: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = days[resetTime.getDay()];
    const hours = resetTime.getHours();
    const meridiem = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `Resets ${day} ${h}:00 ${meridiem}`;
  }

  private formatLastUpdated(date: Date): string {
    const diffSec = (Date.now() - date.getTime()) / 1000;
    if (diffSec < 60) return 'less than a minute ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    return `${Math.floor(diffSec / 3600)} hr ago`;
  }
}
