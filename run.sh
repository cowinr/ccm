#!/usr/bin/env bash
set -euo pipefail

echo "Compiling TypeScript..."
npm run compile

echo "Packaging extension..."
npx vsce package --allow-missing-repository

VSIX=$(ls -t claude-code-monitor-*.vsix | head -1)
echo "Installing ${VSIX}..."
code --install-extension "${VSIX}" --force

echo ""
echo "Done. Reload VS Code to activate the updated extension:"
echo "  Cmd+Shift+P > Developer: Reload Window"
