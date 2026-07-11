import { describe, it, expect, beforeEach } from 'vitest';
import { NotificationService } from '../../services/notification.service';
import { createMockVscode, createVscodeShim } from '../../test-utils/vscode-mock';

describe('NotificationService', () => {
  let mock: ReturnType<typeof createMockVscode>;
  let service: NotificationService;

  beforeEach(() => {
    mock = createMockVscode();
    const vscode = createVscodeShim(mock);
    service = new NotificationService(vscode);
  });

  describe('showInfo', () => {
    it('shows an info message', () => {
      service.showInfo('Operation completed');
      expect(mock._messages).toContainEqual({ type: 'info', message: 'Operation completed' });
    });
  });

  describe('showError', () => {
    it('shows an error message', () => {
      service.showError('Something went wrong');
      expect(mock._messages).toContainEqual({ type: 'error', message: 'Something went wrong' });
    });
  });

  describe('updateStatusBar', () => {
    it('creates a status bar item with text', () => {
      service.updateStatusBar('Workflow: Active');
      expect(mock._statusBarItems.length).toBeGreaterThan(0);
      expect(mock._statusBarItems[0].text).toBe('Workflow: Active');
    });

    it('updates existing status bar item text', () => {
      service.updateStatusBar('Workflow: Active');
      service.updateStatusBar('Workflow: Completed');
      expect(mock._statusBarItems).toHaveLength(1);
      expect(mock._statusBarItems[0].text).toBe('Workflow: Completed');
    });
  });
});
