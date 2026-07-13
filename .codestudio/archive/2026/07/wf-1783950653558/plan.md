# Plan: Fix codicon icons not displaying after packaging

## Root Cause

`.vscodeignore` contains `node_modules/**` which excludes ALL node_modules from the `.vsix` package. The webview panel loads codicon CSS and font from `node_modules/@vscode/codicons/dist/` — but after install, that directory doesn't exist.

## Approach: Copy codicon assets into `out/` during build

**Why this approach over whitelisting in .vscodeignore:**
- Whitelisting `!node_modules/@vscode/codicons/**` would include the entire codicons package (300KB+ of unnecessary files like HTML, CSV, SVG, TS)
- Copying only `codicon.css` + `codicon.ttf` into `out/codicons/` keeps the bundle minimal
- The `out/` directory is already in `localResourceRoots` — no new security surface

## Tasks

- [ ] 1. Add codicon copy step to `esbuild.config.mjs` — copy `codicon.css` + `codicon.ttf` to `out/codicons/` (S)
- [ ] 2. Update `panel-provider.ts` — change `codiconsUri` to point to `out/codicons/` instead of `node_modules/` (S)
- [ ] 3. Verify — build, package, check `.vsix` contains the codicon files, and test icon rendering (S)
