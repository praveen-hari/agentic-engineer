// esbuild dual-bundle config: extension host (CJS/Node) + webview (ESM/browser)
// Usage:
//   node esbuild.config.mjs              → one-shot build
//   node esbuild.config.mjs --watch      → watch mode
//   node esbuild.config.mjs --production → minified, no sourcemaps

import { build, context } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

/** @type {import('esbuild').BuildOptions} */
const extensionOptions = {
  bundle: true,
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: !isProduction,
  minify: isProduction,
  external: ['vscode', '@vscode/prompt-tsx', '@vscode/chat-extension-utils'],
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions} */
const webviewOptions = {
  bundle: true,
  entryPoints: ['src/webview/index.tsx'],
  outdir: 'out',
  entryNames: 'webview',
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  sourcemap: !isProduction,
  minify: isProduction,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  // CSS imports produce a separate webview.css file
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
  logLevel: 'info',
};

/**
 * Copy @vscode/codicons CSS + font into out/codicons/ so they are
 * included in the .vsix package. node_modules/ is excluded by
 * .vscodeignore, so the webview can't load them from there after install.
 */
function copyCodiconAssets() {
  const src = resolve('node_modules', '@vscode', 'codicons', 'dist');
  const dest = resolve('out', 'codicons');
  mkdirSync(dest, { recursive: true });
  copyFileSync(resolve(src, 'codicon.css'), resolve(dest, 'codicon.css'));
  copyFileSync(resolve(src, 'codicon.ttf'), resolve(dest, 'codicon.ttf'));
  console.log('[esbuild] copied codicon assets → out/codicons/');
}

async function main() {
  if (isWatch) {
    const extCtx = await context(extensionOptions);
    const webCtx = await context(webviewOptions);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    copyCodiconAssets();
    console.log('[esbuild] watching extension + webview...');
  } else {
    await Promise.all([build(extensionOptions), build(webviewOptions)]);
    copyCodiconAssets();
    console.log('[esbuild] build complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
