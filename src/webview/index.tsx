import { render } from 'preact';
import { App } from './app';
import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/side-nav.css';
import './styles/components.css';

/**
 * Webview entry point — Engineering Workspace.
 *
 * Renders the Preact UI shell into the webview's <body>.
 */
function main(): void {
  const root = document.getElementById('root');
  if (root) {
    render(<App />, root);
  }
}

main();
