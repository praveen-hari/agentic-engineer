/**
 * Minimal VS Code API mock for unit testing services.
 *
 * Provides a controllable mock of the subset of `vscode` APIs that
 * our services use: `workspace.fs`, `workspace.workspaceFolders`,
 * `workspace.getConfiguration`, `window.showInformationMessage`,
 * `window.showErrorMessage`, `window.createStatusBarItem`.
 */

export interface MockFileEntry {
  content: string;
  isDirectory: boolean;
}

export interface MockVscode {
  readonly fs: {
    readFile(uri: { fsPath: string }): Promise<Uint8Array>;
    writeFile(uri: { fsPath: string }, content: Uint8Array): Promise<void>;
    stat(uri: { fsPath: string }): Promise<{ type: 'file' | 'directory'; size: number }>;
    createDirectory(uri: { fsPath: string }): Promise<void>;
    readDirectory(uri: { fsPath: string }): Promise<readonly [string, number][]>;
    delete(uri: { fsPath: string }): Promise<void>;
  };
  readonly workspaceFolders: { readonly uri: { readonly fsPath: string }; readonly name: string }[];
  readonly _files: Map<string, MockFileEntry>;
  readonly _config: Map<string, unknown>;
  readonly _statusBarItems: { text: string; tooltip: string; show(): void; hide(): void; dispose(): void }[];
  _messages: { type: 'info' | 'error'; message: string }[];
  _configChangeCallbacks: (() => void)[];
}

export function createMockVscode(workspacePath = '/project'): MockVscode {
  const files = new Map<string, MockFileEntry>();
  const config = new Map<string, unknown>();
  const statusBars: MockVscode['_statusBarItems'] = [];
  const messages: MockVscode['_messages'] = [];
  const configChangeCallbacks: ((e: { affectsConfiguration: (section: string) => boolean }) => void)[] = [];

  const workspaceFolders: MockVscode['workspaceFolders'] = [
    { uri: { fsPath: workspacePath }, name: 'project' },
  ];

  return {
    _files: files,
    _config: config,
    _statusBarItems: statusBars,
    _messages: messages,
    _configChangeCallbacks: configChangeCallbacks as never,
    get workspaceFolders() {
      return workspaceFolders;
    },
    set workspaceFolders(value) {
      workspaceFolders.length = 0;
      workspaceFolders.push(...value);
    },
    fs: {
      async readFile(uri: { fsPath: string }) {
        const entry = files.get(uri.fsPath);
        if (!entry) {
          const err = new Error(`File not found: ${uri.fsPath}`) as Error & { code: string };
          err.code = 'FileNotFound';
          throw err;
        }
        return new TextEncoder().encode(entry.content);
      },
      async writeFile(uri: { fsPath: string }, content: Uint8Array) {
        files.set(uri.fsPath, { content: new TextDecoder().decode(content), isDirectory: false });
      },
      async stat(uri: { fsPath: string }) {
        const entry = files.get(uri.fsPath);
        if (!entry) {
          const err = new Error(`Not found: ${uri.fsPath}`) as Error & { code: string };
          err.code = 'FileNotFound';
          throw err;
        }
        return { type: entry.isDirectory ? 'directory' : 'file', size: entry.content.length };
      },
      async createDirectory(uri: { fsPath: string }) {
        files.set(uri.fsPath, { content: '', isDirectory: true });
      },
      async readDirectory(uri: { fsPath: string }) {
        const results: [string, number][] = [];
        const prefix = uri.fsPath.endsWith('/') ? uri.fsPath : uri.fsPath + '/';
        for (const [path, entry] of files) {
          if (path.startsWith(prefix)) {
            const relative = path.slice(prefix.length);
            const name = relative.split('/')[0];
            if (name && !results.find((r) => r[0] === name)) {
              results.push([name, entry.isDirectory ? 2 : 1]);
            }
          }
        }
        return results;
      },
      async delete(uri: { fsPath: string }) {
        files.delete(uri.fsPath);
      },
    },
  };
}

/**
 * Create a VS Code-like object from a mock, suitable for injecting
 * into services that import `vscode`.
 */
export function createVscodeShim(mock: MockVscode): typeof import('vscode') {
  return {
    workspace: {
      fs: mock.fs,
      workspaceFolders: mock.workspaceFolders as never,
      getConfiguration(section?: string) {
        const prefix = section ? `${section}.` : '';
        return {
          get<T>(key: string, defaultValue?: T): T | undefined {
            return (mock._config.get(`${prefix}${key}`) as T) ?? defaultValue;
          },
          update(key: string, value: unknown) {
            mock._config.set(`${prefix}${key}`, value);
          },
          has(key: string) {
            return mock._config.has(`${prefix}${key}`);
          },
        } as never;
      },
      onDidChangeConfiguration(handler: (e: { affectsConfiguration: (section: string) => boolean }) => void) {
        mock._configChangeCallbacks.push(handler as never);
        return { dispose() {} } as never;
      },
    },
    window: {
      showInformationMessage(message: string) {
        mock._messages.push({ type: 'info', message });
      },
      showErrorMessage(message: string) {
        mock._messages.push({ type: 'error', message });
      },
      createStatusBarItem() {
        const item = {
          text: '',
          tooltip: '',
          show() {},
          hide() {},
          dispose() {},
        };
        mock._statusBarItems.push(item);
        return item as never;
      },
    },
    Uri: {
      file(fsPath: string) {
        return { fsPath };
      },
      joinPath(base: { fsPath: string }, ...parts: string[]) {
        return { fsPath: [base.fsPath, ...parts].join('/') };
      },
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    extensions: {
      getExtension() {
        return undefined;
      },
    },
  } as never;
}
