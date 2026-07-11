import * as vscode from 'vscode';

/**
 * Manages the Engineering Workspace webview panel in the editor area.
 *
 * Unlike the sidebar WebviewViewProvider, this opens a full-width
 * WebviewPanel in the editor group — matching the design mockup where
 * the sidebar has a native TreeView and the editor area has the webview.
 */
export class EngineeringWorkspacePanelProvider {
  private panel: vscode.WebviewPanel | undefined;
  private currentView = 'tasks';

  /**
   * Messages queued while the panel is not yet created.
   * Drained when the panel opens. Capped to prevent unbounded growth.
   */
  private pendingMessages: unknown[] = [];
  private static readonly MAX_PENDING = 50;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly messageHandler: (message: unknown) => Promise<void>,
  ) {}

  /**
   * Open or reveal the webview panel, optionally navigating to a view.
   */
  open(viewId?: string): void {
    if (viewId) {
      this.currentView = viewId;
    }

    if (this.panel) {
      // Panel already exists — reveal it and navigate
      this.panel.reveal(vscode.ViewColumn.One);
      this.postNavigate(this.currentView);
      return;
    }

    // Create a new panel
    const distPath = vscode.Uri.joinPath(this.context.extensionUri, 'out');
    const codiconsUri = vscode.Uri.joinPath(
      this.context.extensionUri,
      'node_modules',
      '@vscode',
      'codicons',
      'dist',
    );

    this.panel = vscode.window.createWebviewPanel(
      'engineeringWorkspace.panel',
      this.getTitle(this.currentView),
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [distPath, codiconsUri],
      },
    );

    // Set the panel icon
    this.panel.iconPath = new vscode.ThemeIcon('tasklist');

    const webview = this.panel.webview;

    const webviewJs = webview.asWebviewUri(vscode.Uri.joinPath(distPath, 'webview.js')).toString();

    const webviewCss = webview
      .asWebviewUri(vscode.Uri.joinPath(distPath, 'webview.css'))
      .toString();

    const codiconsCss = webview
      .asWebviewUri(vscode.Uri.joinPath(codiconsUri, 'codicon.css'))
      .toString();

    const nonce = getNonce();

    webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <title>Engineering Workspace</title>
  <link rel="stylesheet" href="${codiconsCss}" />
  <link rel="stylesheet" href="${webviewCss}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    window.vscode = acquireVsCodeApi();
    window.__initialView = "${this.currentView}";
  </script>
  <script nonce="${nonce}" src="${webviewJs}"></script>
</body>
</html>`;

    // Handle messages from the webview
    webview.onDidReceiveMessage(
      (message: unknown) => {
        void this.messageHandler(message);
      },
      undefined,
      this.context.subscriptions,
    );

    // Clean up when panel is closed
    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      this.context.subscriptions,
    );

    // Navigate to the initial view
    this.postNavigate(this.currentView);

    // Drain any messages that were queued before the panel existed
    if (this.pendingMessages.length > 0) {
      const queued = this.pendingMessages.splice(0);
      for (const msg of queued) {
        void this.panel.webview.postMessage(msg);
      }
    }
  }

  /**
   * Navigate the webview to a specific view.
   */
  navigateTo(viewId: string): void {
    this.currentView = viewId;
    if (this.panel) {
      this.panel.title = this.getTitle(viewId);
      this.postNavigate(viewId);
      this.panel.reveal(vscode.ViewColumn.One, true);
    } else {
      this.open(viewId);
    }
  }

  /**
   * Send a message to the webview.
   * If the panel doesn't exist yet, queues the message for delivery
   * when the panel is opened (up to MAX_PENDING messages).
   */
  postMessage(message: unknown): void {
    if (this.panel) {
      void this.panel.webview.postMessage(message);
    } else {
      if (this.pendingMessages.length < EngineeringWorkspacePanelProvider.MAX_PENDING) {
        this.pendingMessages.push(message);
      }
    }
  }

  /**
   * Whether the panel is currently visible.
   */
  get isVisible(): boolean {
    return this.panel?.visible ?? false;
  }

  private postNavigate(viewId: string): void {
    void this.panel?.webview.postMessage({ type: 'navigateTo', view: viewId });
  }

  private getTitle(viewId: string): string {
    const titles: Record<string, string> = {
      tasks: 'Tasks',
      capabilities: 'Capabilities',
      knowledge: 'Knowledge',
      history: 'History',
      settings: 'Settings',
    };
    return titles[viewId] ?? 'Engineering Workspace';
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
