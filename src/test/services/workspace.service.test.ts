import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceService } from '../../services/workspace.service';
import { createMockVscode, createVscodeShim } from '../../test-utils/vscode-mock';

describe('WorkspaceService', () => {
  let mock: ReturnType<typeof createMockVscode>;
  let service: WorkspaceService;

  beforeEach(() => {
    mock = createMockVscode('/project');
    const vscode = createVscodeShim(mock);
    service = new WorkspaceService(vscode);
  });

  describe('getWorkspaceRoot', () => {
    it('returns the workspace root path', () => {
      expect(service.getWorkspaceRoot()).toBe('/project');
    });

    it('returns null when no workspace is open', () => {
      mock.workspaceFolders.length = 0;
      expect(service.getWorkspaceRoot()).toBeNull();
    });
  });

  describe('getConfiguration', () => {
    it('returns a config value', () => {
      mock._config.set('engineeringWorkspace.processLevel', 'standard');
      const value = service.getConfiguration<string>('processLevel', 'light');
      expect(value).toBe('standard');
    });

    it('returns default when config not set', () => {
      const value = service.getConfiguration<string>('processLevel', 'light');
      expect(value).toBe('light');
    });
  });

  describe('onConfigChange', () => {
    it('registers a callback that fires on config change', () => {
      let changed = false;
      service.onConfigChange(() => {
        changed = true;
      });
      mock._configChangeCallbacks.forEach((cb) => cb({ affectsConfiguration: () => true }));
      expect(changed).toBe(true);
    });
  });
});
