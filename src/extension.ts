import * as vscode from 'vscode';
import { UsagePanelProvider } from './webviewProvider';
import { UsageAnalyser, AnalyserConfig } from './usageAnalyser';
import { readAllUsageEntries } from './usageReader';

let refreshTimer: NodeJS.Timeout | undefined;
let statusBarItem: vscode.StatusBarItem;
let panelProvider: UsagePanelProvider;
let analyser: UsageAnalyser;

export function activate(context: vscode.ExtensionContext) {
  console.log('Claude Code Monitor is now active');

  // Initialise analyser
  analyser = new UsageAnalyser(loadAnalyserConfig());

  // Create sidebar webview provider
  panelProvider = new UsagePanelProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      UsagePanelProvider.viewType,
      panelProvider
    )
  );

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    900
  );
  statusBarItem.command = 'ccm.refresh';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ccm.refresh', refreshUsage)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('ccm.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'ccm');
    })
  );

  // Listen for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('ccm')) {
        analyser.updateConfig(loadAnalyserConfig());
        restartRefreshTimer();
        refreshUsage();
      }
    })
  );

  // Initial refresh and start timer
  refreshUsage();
  startRefreshTimer();
}

export function deactivate() {
  if (refreshTimer) clearInterval(refreshTimer);
  if (statusBarItem) statusBarItem.dispose();
}

function loadAnalyserConfig(): AnalyserConfig {
  const config = vscode.workspace.getConfiguration('ccm');
  return {
    sessionDurationHours: config.get('sessionDurationHours', 5),
    sessionTokenLimit: config.get('sessionTokenLimit', 250_000_000),
    weeklyResetDay: config.get('weeklyResetDay', 5),
    weeklyResetHour: config.get('weeklyResetHour', 9),
  };
}

function getDataPath(): string | undefined {
  const config = vscode.workspace.getConfiguration('ccm');
  const custom = config.get<string>('dataPath', '');
  return custom || undefined;
}

function refreshUsage() {
  try {
    const entries = readAllUsageEntries(getDataPath());
    const summary = analyser.analyse(entries);

    // Update webview
    panelProvider.update(summary);

    // Update status bar with mini progress bars
    const sPct = Math.round(summary.currentSession.percentage);
    const wPct = 0; // No weekly limit calibrated yet
    const sBar = miniBar(sPct);
    const wBar = miniBar(wPct);
    const sessionTok = formatTokensCompact(summary.currentSession.tokenCount);
    const weekTok = formatTokensCompact(summary.weekly.tokenCount);

    statusBarItem.text = `S ${sBar} ${sPct}%  W ${wBar} ${weekTok}`;
    statusBarItem.tooltip = `Session: ${sPct}% (${sessionTok} / ${formatTokensCompact(summary.currentSession.tokenLimit)})\n${summary.currentSession.messageCount} msgs, ${Math.round(summary.burnRate.tokensPerMin)} tok/min\nWeekly: ${weekTok} tokens, ${summary.weekly.messageCount} msgs`;

    if (sPct >= 85) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (sPct >= 60) {
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      statusBarItem.backgroundColor = undefined;
    }
  } catch (error) {
    console.error('CCM refresh error:', error);
    statusBarItem.text = '$(pulse) CCM: Error';
  }
}

function miniBar(pct: number, width: number = 8): string {
  const filled = Math.round((pct / 100) * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
}

function formatTokensCompact(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function startRefreshTimer() {
  const config = vscode.workspace.getConfiguration('ccm');
  const intervalSec = config.get('refreshIntervalSec', 60);
  refreshTimer = setInterval(refreshUsage, intervalSec * 1000);
}

function restartRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  startRefreshTimer();
}
