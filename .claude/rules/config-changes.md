---
description: Keep README and CLAUDE.md in sync when changing settings or architecture
paths:
  - package.json
  - src/extension.ts
  - src/usageAnalyser.ts
  - src/types.ts
---

When changing any of the following, always update README.md and CLAUDE.md in the same commit:

- VS Code settings (`ccm.*` in package.json `contributes.configuration`)
- `AnalyserConfig` fields in `usageAnalyser.ts`
- New source files added to `src/` or `resources/`
- Test count changes

Also rebuild the VSIX before committing if docs or resources changed:
```bash
npm run compile && npx vsce package --allow-missing-repository
```
