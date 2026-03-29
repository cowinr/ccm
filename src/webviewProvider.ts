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
    const barClass = this.getBarClass(s.currentSession.percentage);

    return `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div class="section">
    <h2>Current session</h2>

    <div class="metric">
      <div class="metric-subtitle">Resets in ${sessionReset}</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill ${barClass}" style="width: ${s.currentSession.percentage}%"></div>
        </div>
        <div class="bar-value">${pct}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">
        ${this.formatTokens(s.currentSession.tokenCount)} / ${this.formatTokens(s.currentSession.tokenLimit)} tokens
      </div>
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
  </div>

  <hr class="divider">

  <div class="section">
    <h2>Weekly usage</h2>

    <div class="metric">
      <div class="metric-subtitle">${weeklyReset}</div>
      <div class="stats-grid">
        <div class="stat-block">
          <div class="stat-number">${this.formatTokens(s.weekly.tokenCount)}</div>
          <div class="stat-label">tokens</div>
        </div>
        <div class="stat-block">
          <div class="stat-number">${s.weekly.messageCount}</div>
          <div class="stat-label">messages</div>
        </div>
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

  private getBarClass(percentage: number): string {
    if (percentage >= 85) return 'danger';
    if (percentage >= 60) return 'warning';
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
