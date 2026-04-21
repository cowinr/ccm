#!/usr/bin/env bash
set -euo pipefail

REPO="cowinr/ccm"
TMP=$(mktemp /tmp/ccm-XXXXXX.vsix)

echo "Fetching latest CCM release..."
VSIX_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep browser_download_url \
  | grep '\.vsix' \
  | cut -d '"' -f 4)

if [[ -z "$VSIX_URL" ]]; then
  echo "Error: could not find a .vsix asset in the latest release." >&2
  exit 1
fi

echo "Downloading ${VSIX_URL}..."
curl -fsSL -o "$TMP" "$VSIX_URL"

echo "Installing extension..."
code --install-extension "$TMP" --force

rm -f "$TMP"
echo ""
echo "Done. Reload VS Code: Cmd+Shift+P → Developer: Reload Window"
echo "On first activation the extension will prompt you to install the bridge — click Install."
