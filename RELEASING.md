# Releasing a New Version

## Prerequisites

- Node.js 18+
- `npm install -g @vscode/vsce`
- `gh` CLI authenticated (`gh auth login`)

## Steps

**1. Bump the version in `package.json`:**

```json
"version": "0.2.0"
```

**2. Build and package:**

```bash
npm run compile
npx vsce package --allow-missing-repository
```

This produces `claude-code-monitor-X.Y.Z.vsix`.

**3. Test locally:**

```bash
code --install-extension claude-code-monitor-X.Y.Z.vsix --force
```

Reload VS Code (`Cmd+Shift+P` → Developer: Reload Window) and verify the extension works.

**4. Commit and push:**

```bash
git add package.json package-lock.json claude-code-monitor-X.Y.Z.vsix
git commit -m "chore: release vX.Y.Z"
git push
```

**5. Create a GitHub release:**

```bash
gh release create vX.Y.Z claude-code-monitor-X.Y.Z.vsix \
  --title "vX.Y.Z" \
  --notes "Summary of what changed."
```

Once the release is published, anyone running the install one-liner will get the new version automatically.
