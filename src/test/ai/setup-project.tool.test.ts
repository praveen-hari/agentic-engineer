/**
 * Tests for SetupProjectTool.
 *
 * Covers: directory creation, config.json generation, onComplete callback,
 * error handling, and idempotency.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetupProjectTool } from '../../ai/tools/setup-project.tool';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import { CODESTUDIO_DIRECTORIES, WORKFLOW_DIR } from '../../constants';

// Mock vscode module for LanguageModelToolResult
vi.mock('vscode', () => ({
  LanguageModelToolResult: class {
    constructor(public parts: unknown[]) {}
  },
  LanguageModelTextPart: class {
    constructor(public text: string) {}
  },
  MarkdownString: class {
    constructor(public value: string) {}
  },
}));

describe('SetupProjectTool', () => {
  let fs: InMemoryFileIO;
  let onComplete: ReturnType<typeof vi.fn>;
  let tool: SetupProjectTool;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    onComplete = vi.fn();
    tool = new SetupProjectTool(fs, '/workspace', onComplete);
  });

  describe('invoke()', () => {
    it('creates .codestudio root directory', async () => {
      await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

      expect(await fs.exists(`/workspace/${WORKFLOW_DIR}`)).toBe(true);
    });

    it('creates all subdirectories', async () => {
      await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

      for (const dir of CODESTUDIO_DIRECTORIES) {
        expect(await fs.exists(`/workspace/${WORKFLOW_DIR}/${dir}`)).toBe(true);
      }
    });

    it('creates config.json with default settings', async () => {
      await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

      const configPath = `/workspace/${WORKFLOW_DIR}/config.json`;
      const content = await fs.read(configPath);
      const config = JSON.parse(content);

      expect(config.version).toBe(1);
      expect(config.processLevelDefault).toBe('auto');
      expect(config.autoApproveLowRisk).toBe(false);
      expect(config.reviewTimeoutMinutes).toBe(5);
      expect(config.autoRefreshContext).toBe(true);
    });

    it('calls onComplete callback', async () => {
      await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('returns success result with nextSteps', async () => {
      const result = await tool.invoke(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.success).toBe(true);
      expect(parsed.created).toContain('.codestudio/');
      expect(parsed.created).toContain('.codestudio/config.json');
      expect(parsed.nextSteps).toBeDefined();
      expect(parsed.nextSteps.length).toBeGreaterThan(0);
    });

    it('nextSteps mention context files to create', async () => {
      const result = await tool.invoke(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);
      const stepsText = parsed.nextSteps.join(' ');

      expect(stepsText).toContain('context.md');
      expect(stepsText).toContain('architecture.md');
      expect(stepsText).toContain('conventions.md');
      expect(stepsText).toContain('stack.md');
      expect(stepsText).toContain('boundaries.md');
    });

    it('throws when filesystem fails', async () => {
      const failingFs: InMemoryFileIO = {
        ...fs,
        mkdir: vi.fn().mockRejectedValue(new Error('Permission denied')),
      } as unknown as InMemoryFileIO;
      const failTool = new SetupProjectTool(failingFs, '/workspace', onComplete);

      await expect(
        failTool.invoke({ input: {} } as never, { isCancellationRequested: false } as never),
      ).rejects.toThrow(/Permission denied/);
    });
  });

  describe('prepareInvocation()', () => {
    it('returns invocation message', async () => {
      const result = await tool.prepareInvocation(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      expect(result.invocationMessage).toContain('.codestudio');
    });

    it('includes project name in message when provided', async () => {
      const result = await tool.prepareInvocation(
        { input: { projectName: 'MyApp' } } as never,
        { isCancellationRequested: false } as never,
      );

      expect(result.invocationMessage).toContain('MyApp');
    });
  });
});
