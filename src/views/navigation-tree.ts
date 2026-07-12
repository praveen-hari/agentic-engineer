import * as vscode from 'vscode';

/**
 * Navigation item shown in the sidebar TreeView.
 * Each item represents a view (Tasks, Capabilities, Knowledge, History).
 * Clicking an item opens/switches the webview panel to that view.
 */
export class NavigationItem extends vscode.TreeItem {
  constructor(
    public readonly viewId: string,
    public readonly label: string,
    public readonly icon: string,
    public readonly badgeText?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(icon);
    this.command = {
      command: 'engineeringWorkspace.navigateTo',
      title: `Open ${label}`,
      arguments: [viewId],
    };
    this.contextValue = viewId;

    if (badgeText) {
      this.description = badgeText;
    }
  }
}

/**
 * TreeView data provider for the Engineering Workspace sidebar.
 *
 * Shows navigation items: Tasks, Capabilities, Knowledge, History.
 * Settings is accessed via a gear icon in the view title bar.
 * Badges show counts (pending tasks, capabilities, knowledge items, history entries).
 */
export class NavigationTreeProvider implements vscode.TreeDataProvider<NavigationItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<NavigationItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private badges: Record<string, string> = {};

  getTreeItem(element: NavigationItem): vscode.TreeItem {
    return element;
  }

  getChildren(): NavigationItem[] {
    return [
      new NavigationItem('tasks', 'Tasks', 'tasklist', this.badges['tasks']),
      new NavigationItem('capabilities', 'Plugins', 'extensions', this.badges['capabilities']),
      new NavigationItem('knowledge', 'Knowledge', 'book', this.badges['knowledge']),
      new NavigationItem('history', 'History', 'history', this.badges['history']),
    ];
  }

  /**
   * Update the badge text for a navigation item.
   * Pass undefined to clear the badge.
   */
  updateBadge(viewId: string, text: string | undefined): void {
    if (text) {
      this.badges[viewId] = text;
    } else {
      delete this.badges[viewId];
    }
    this._onDidChangeTreeData.fire();
  }

  /**
   * Refresh the entire tree.
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}
