import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const BRIDGE_DEST = path.join(CLAUDE_DIR, 'ccm-bridge.js');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');

const BRIDGE_CALL = `input=$(cat); echo "$input" | node ~/.claude/ccm-bridge.js >/dev/null 2>&1`;

export function checkAndPromptBridgeInstall(context: vscode.ExtensionContext): void {
  if (isBridgeConfigured()) {
    // Bridge file may have been updated in this release — keep it in sync
    copyBridgeScript(context);
    return;
  }

  vscode.window
    .showInformationMessage(
      'Claude Code Monitor: install the bridge script to enable live rate-limit data?',
      'Install',
      'Not now'
    )
    .then(selection => {
      if (selection === 'Install') {
        installBridge(context);
      }
    });
}

function isBridgeConfigured(): boolean {
  if (!fs.existsSync(BRIDGE_DEST)) { return false; }
  if (!fs.existsSync(SETTINGS_PATH)) { return false; }
  try {
    const content = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return content.includes('ccm-bridge.js');
  } catch {
    return false;
  }
}

function copyBridgeScript(context: vscode.ExtensionContext): void {
  try {
    const src = path.join(context.extensionPath, 'resources', 'ccm-bridge.js');
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.copyFileSync(src, BRIDGE_DEST);
  } catch {
    // Non-fatal: existing bridge still works
  }
}

function installBridge(context: vscode.ExtensionContext): void {
  try {
    copyBridgeScript(context);
    const result = patchSettings();

    if (result === 'patched') {
      vscode.window.showInformationMessage(
        'CCM bridge installed. Restart Claude Code sessions to activate live data.'
      );
    } else if (result === 'already') {
      vscode.window.showInformationMessage('CCM bridge script updated.');
    } else {
      // Existing custom statusLine — show manual instructions
      showManualInstructions();
    }
  } catch (error) {
    vscode.window.showErrorMessage(`CCM: bridge install failed — ${error}`);
  }
}

type PatchResult = 'patched' | 'already' | 'manual-required';

function patchSettings(): PatchResult {
  let settings: Record<string, unknown> = {};

  if (fs.existsSync(SETTINGS_PATH)) {
    try {
      settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    } catch {
      settings = {};
    }
  }

  const statusLine = settings.statusLine as { command?: string } | undefined;
  const existingCmd = statusLine?.command ?? '';

  if (existingCmd.includes('ccm-bridge.js')) {
    return 'already';
  }

  if (!settings.statusLine) {
    settings.statusLine = { type: 'command', command: BRIDGE_CALL };
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 4));
    return 'patched';
  }

  // Has a custom statusLine we can't safely modify
  return 'manual-required';
}

function showManualInstructions(): void {
  const channel = vscode.window.createOutputChannel('Claude Code Monitor');
  channel.appendLine('CCM bridge script has been installed to ~/.claude/ccm-bridge.js');
  channel.appendLine('');
  channel.appendLine(
    'Your ~/.claude/settings.json already has a custom statusLine command.'
  );
  channel.appendLine('Add the following to the start of your statusLine command:');
  channel.appendLine('');
  channel.appendLine(`  ${BRIDGE_CALL} &`);
  channel.appendLine('');
  channel.appendLine(
    'Make sure to capture stdin first with: input=$(cat)'
  );
  channel.appendLine(
    'then replace any bare `cat` in your existing command with: echo "$input"'
  );
  channel.show();

  vscode.window.showWarningMessage(
    'CCM: bridge script installed, but your settings.json has a custom statusLine. See Output panel for instructions.',
    'Show instructions'
  ).then(sel => {
    if (sel === 'Show instructions') { channel.show(); }
  });
}
