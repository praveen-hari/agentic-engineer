// esbuild dual-bundle config: extension host (CJS/Node) + webview (ESM/browser)
// Usage:
//   node esbuild.config.mjs              → one-shot build
//   node esbuild.config.mjs --watch      → watch mode
//   node esbuild.config.mjs --production → minified, no sourcemaps

import { build, context } from 'esbuild';

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
  outfile: 'out/webview.js',
  platform: 'browser',
  format: 'esm',
  target: 'es2020',
  sourcemap: !isProduction,
  minify: isProduction,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  define: {
    'process.env.NODE_ENV': isProduction ? '"production"' : '"development"',
  },
  logLevel: 'info',
};

async function main() {
  if (isWatch) {
    const extCtx = await context(extensionOptions);
    const webCtx = await context(webviewOptions);
    await Promise.all([extCtx.watch(), webCtx.watch()]);
    console.log('[esbuild] watching extension + webview...');
  } else {
    await Promise.all([build(extensionOptions), build(webviewOptions)]);
    console.log('[esbuild] build complete');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
