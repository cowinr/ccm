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

    const sessionBarClass = this.getBarClass(s.currentSession.percentage);
    const weeklyBarClass = this.getBarClass(s.weekly.percentage);
    const sessionReset = this.formatTimeRemaining(s.currentSession.resetTime);
    const weeklyReset = this.formatResetTime(s.weekly.resetTime);

    return `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="${cssUri}">
</head>
<body>
  <div class="section">
    <h2>Plan Usage Limits</h2>

    <div class="metric">
      <h3>Current session</h3>
      <div class="metric-subtitle">Resets in ${sessionReset}</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill ${sessionBarClass}" style="width: ${s.currentSession.percentage}%"></div>
        </div>
        <div class="bar-value">${Math.round(s.currentSession.percentage)}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">
        $${s.currentSession.costUsd.toFixed(2)} / $${s.currentSession.limitUsd.toFixed(2)}
      </div>
    </div>

    <hr class="divider">

    <div class="metric">
      <h3>Weekly limits</h3>
      <div class="metric-subtitle">${weeklyReset}</div>
      <div class="bar-container">
        <div class="bar-track">
          <div class="bar-fill ${weeklyBarClass}" style="width: ${s.weekly.percentage}%"></div>
        </div>
        <div class="bar-value">${Math.round(s.weekly.percentage)}% used</div>
      </div>
      <div class="metric-subtitle" style="margin-top:4px">
        $${s.weekly.costUsd.toFixed(2)} / $${s.weekly.limitUsd.toFixed(2)}
      </div>
    </div>
  </div>

  <hr class="divider">

  <div class="section">
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Burn Rate:</span>
        <span class="stat-value">${s.burnRate.tokensPerMin.toFixed(1)} tokens/min</span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Cost Rate:</span>
        <span class="stat-value">$${s.burnRate.costPerMin.toFixed(4)}/min</span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat">
        <span class="stat-label">Messages:</span>
        <span class="stat-value">${s.currentSession.messageCount} (session) / ${s.weekly.messageCount} (week)</span>
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
