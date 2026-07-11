import { render } from 'preact';

/**
 * Webview entry point — Engineering Workspace.
 *
 * Renders the Preact UI shell into the webview's <body>.
 *
 * This is a minimal stub for Task 1 (Project Scaffold). Full
 * implementation arrives in Task 12 (Preact Webview Shell).
 */
function main(): void {
  const root = document.getElementById('root');
  if (root) {
    render(
      <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
        <h1>Engineering Workspace</h1>
        <p>Webview scaffold ready.</p>
      </div>,
      root,
    );
  }
}

main();
