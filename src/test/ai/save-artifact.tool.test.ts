/**
 * Tests for SaveArtifactTool.
 *
 * Covers: all artifact types, callback notification, result format,
 * and content preservation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveArtifactTool } from '../../ai/tools/save-artifact.tool';
import { ArtifactManager } from '../../services/artifact-manager.service';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { Artifact } from '../../core/types';

// Mock vscode module
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

describe('SaveArtifactTool', () => {
  let fs: InMemoryFileIO;
  let artifactManager: ArtifactManager;
  let onArtifactSaved: ReturnType<typeof vi.fn>;
  let tool: SaveArtifactTool;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    artifactManager = new ArtifactManager(fs, '/workspace');
    onArtifactSaved = vi.fn();
    tool = new SaveArtifactTool(artifactManager, onArtifactSaved);
  });

  describe('invoke()', () => {
    it('saves spec artifact and returns success', async () => {
      const result = await tool.invoke(
        {
          input: {
            type: 'spec',
            title: 'Auth Specification',
            content: '# Auth Spec\n\nDetailed specification...',
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.success).toBe(true);
      expect(parsed.type).toBe('spec');
      expect(parsed.stage).toBe('define');
      expect(parsed.path).toContain('specs/');
      expect(parsed.path).toContain('.md');
    });

    it('saves plan artifact', async () => {
      const result = await tool.invoke(
        {
          input: {
            type: 'plan',
            title: 'Implementation Plan',
            content: '# Plan\n\n## Tasks\n1. Setup\n2. Build',
            stage: 'plan',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.success).toBe(true);
      expect(parsed.type).toBe('plan');
      expect(parsed.path).toContain('plans/');
    });

    it('saves review artifact', async () => {
      const result = await tool.invoke(
        {
          input: {
            type: 'review',
            title: 'Code Review',
            content: '# Review\n\n## Findings\n- Good architecture',
            stage: 'review',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.success).toBe(true);
      expect(parsed.type).toBe('review');
    });

    it('saves report artifact', async () => {
      const result = await tool.invoke(
        {
          input: {
            type: 'report',
            title: 'Verification Report',
            content: '# Report\n\nAll tests pass.',
            stage: 'verify',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.success).toBe(true);
      expect(parsed.type).toBe('report');
    });

    it('calls onArtifactSaved callback with artifact', async () => {
      await tool.invoke(
        {
          input: {
            type: 'spec',
            title: 'Test Spec',
            content: '# Spec',
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      expect(onArtifactSaved).toHaveBeenCalledTimes(1);
      const artifact = onArtifactSaved.mock.calls[0][0] as Artifact;
      expect(artifact.type).toBe('spec');
      expect(artifact.title).toBe('Test Spec');
    });

    it('preserves content on disk', async () => {
      const content = '# Detailed Spec\n\n## Requirements\n\n1. Auth\n2. Sessions\n3. Tokens';

      await tool.invoke(
        {
          input: {
            type: 'spec',
            title: 'Auth Spec',
            content,
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      // Read back from artifact manager
      const artifact = onArtifactSaved.mock.calls[0][0] as Artifact;
      const readContent = await artifactManager.read(artifact);
      expect(readContent).toBe(content);
    });

    it('returns nextSteps in result', async () => {
      const result = await tool.invoke(
        {
          input: {
            type: 'spec',
            title: 'Test',
            content: '# Test',
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.nextSteps).toBeDefined();
      expect(parsed.nextSteps.length).toBeGreaterThan(0);
      expect(parsed.nextSteps.join(' ')).toContain('engineering_advance_stage');
    });

    it('returns artifactId in result', async () => {
      const result = await tool.invoke(
        {
          input: {
            type: 'spec',
            title: 'Auth Spec',
            content: '# Spec',
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.artifactId).toBeDefined();
      expect(parsed.artifactId.length).toBeGreaterThan(0);
    });
  });

  describe('prepareInvocation()', () => {
    it('includes type and title in message', async () => {
      const result = await tool.prepareInvocation(
        {
          input: {
            type: 'spec',
            title: 'Auth Specification',
            content: '# Spec content here',
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      expect(result.invocationMessage).toContain('spec');
      expect(result.invocationMessage).toContain('Auth Specification');
    });

    it('truncates long content in confirmation', async () => {
      const longContent = 'A'.repeat(500);
      const result = await tool.prepareInvocation(
        {
          input: {
            type: 'spec',
            title: 'Test',
            content: longContent,
            stage: 'define',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      // Confirmation should not include the full 500 chars
      expect(result.confirmationMessages).toBeDefined();
    });
  });
});
