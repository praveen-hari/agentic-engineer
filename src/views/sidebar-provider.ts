import * as vscode from 'vscode';

/**
 * Webview view provider for the Engineering Workspace sidebar (DD-009).
 *
 * Creates and manages the Preact webview, handles messages from the
 * webview, and bridges to the core engine.
 */
export class EngineeringWorkspaceViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly messageHandler: (message: unknown) => Promise<void>,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    const distPath = vscode.Uri.joinPath(this.context.extensionUri, 'out');

    // Codicons font from the VS Code built-in extension
    const codiconsUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'node_modules',
      '@vscode/codicons',
      'dist',
    );

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [distPath, codiconsUri],
    };

    const webviewJs = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(distPath, 'webview.js'))
      .toString();

    const webviewCss = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(distPath, 'webview.css'))
      .toString();

    const codiconsCss = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(codiconsUri, 'codicon.css'))
      .toString();

    const nonce = getNonce();

    webviewView.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webviewView.webview.cspSource}; style-src ${webviewView.webview.cspSource}; script-src 'nonce-${nonce}';" />
  <title>Engineering Workspace</title>
  <link rel="stylesheet" href="${codiconsCss}" />
  <link rel="stylesheet" href="${webviewCss}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${webviewJs}"></script>
</body>
</html>`;

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.messageHandler(message);
      },
      undefined,
      this.context.subscriptions,
    );
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
