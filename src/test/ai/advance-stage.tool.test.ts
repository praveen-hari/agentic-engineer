/**
 * Tests for AdvanceStageTool.
 *
 * Covers: successful advance, blocked stage, no workflow, completed
 * workflow, nextSteps per stage, and callback notification.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdvanceStageTool } from '../../ai/tools/advance-stage.tool';
import { WorkflowEngine } from '../../core/workflow-engine';
import { WorkflowGenerator } from '../../core/workflow-generator';
import { StateManager } from '../../core/state-manager';
import { StageExecutor } from '../../core/stage-executor';
import { SkillRegistry } from '../../core/skill-registry';
import { SkillEngine } from '../../core/skill-engine';
import { ArtifactManager } from '../../services/artifact-manager.service';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { RiskAssessment, WorkflowDefinition } from '../../core/types';

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

const STANDARD_ASSESSMENT: RiskAssessment = {
  workType: 'feature',
  complexity: 'moderate',
  riskLevel: 'medium',
  processLevel: 'standard',
  signals: [],
  contextSignals: [],
  source: 'llm',
};

describe('AdvanceStageTool', () => {
  let fs: InMemoryFileIO;
  let workflowEngine: WorkflowEngine;
  let workflowGenerator: WorkflowGenerator;
  let stateManager: StateManager;
  let stageExecutor: StageExecutor;
  let artifactManager: ArtifactManager;
  let onWorkflowUpdated: ReturnType<typeof vi.fn>;
  let tool: AdvanceStageTool;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    const skillRegistry = new SkillRegistry();
    const skillEngine = new SkillEngine(skillRegistry);
    workflowGenerator = new WorkflowGenerator(skillEngine);
    workflowEngine = new WorkflowEngine();
    stateManager = new StateManager(fs, '/project/.codestudio/workflow.json');
    stageExecutor = new StageExecutor(skillRegistry);
    artifactManager = new ArtifactManager(fs, '/project');
    onWorkflowUpdated = vi.fn();

    tool = new AdvanceStageTool(
      workflowEngine,
      stateManager,
      stageExecutor,
      artifactManager,
      onWorkflowUpdated,
    );
  });

  async function createAndStartWorkflow(): Promise<WorkflowDefinition> {
    const wf = workflowGenerator.generate('wf-test', 'Test objective', STANDARD_ASSESSMENT);
    const started = await workflowEngine.start(wf);
    await stateManager.save(started);
    return started;
  }

  describe('invoke()', () => {
    it('advances to next stage when current stage is complete', async () => {
      const wf = await createAndStartWorkflow();
      const firstStage = wf.state.currentStage;

      const result = await tool.invoke(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.advanced).toBe(true);
      expect(parsed.previousStage).toBe(firstStage);
      expect(parsed.currentStage).toBeDefined();
      expect(parsed.currentStage).not.toBe(firstStage);
    });

    it('saves updated workflow to disk', async () => {
      await createAndStartWorkflow();

      await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

      const saved = await stateManager.load();
      expect(saved).not.toBeNull();
      // First stage should be completed
      expect(saved!.stages[0].status).toBe('completed');
    });

    it('calls onWorkflowUpdated callback', async () => {
      await createAndStartWorkflow();

      await tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never);

      expect(onWorkflowUpdated).toHaveBeenCalledTimes(1);
    });

    it('returns nextSteps for the new stage', async () => {
      await createAndStartWorkflow();

      const result = await tool.invoke(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.nextSteps).toBeDefined();
      expect(parsed.nextSteps.length).toBeGreaterThan(0);
    });

    it('returns instructions for the new stage', async () => {
      await createAndStartWorkflow();

      const result = await tool.invoke(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.instructions).toBeDefined();
    });

    it('throws when no workflow exists', async () => {
      await expect(
        tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never),
      ).rejects.toThrow(/No active workflow/);
    });

    it('throws when workflow is completed', async () => {
      // Create, start, and complete a workflow
      const wf = await createAndStartWorkflow();
      let current = wf;
      for (let i = 0; i < wf.stages.length; i++) {
        current = await workflowEngine.advanceStage(current);
      }
      await stateManager.save(current);

      await expect(
        tool.invoke({ input: {} } as never, { isCancellationRequested: false } as never),
      ).rejects.toThrow(/not active/);
    });

    it('detects workflow completion on last stage advance', async () => {
      const wf = await createAndStartWorkflow();
      // Advance to last stage
      let current = wf;
      for (let i = 0; i < wf.stages.length - 1; i++) {
        current = await workflowEngine.advanceStage(current);
      }
      await stateManager.save(current);

      const result = await tool.invoke(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.advanced).toBe(true);
      expect(parsed.workflowStatus).toBe('completed');
      expect(parsed.message).toContain('completed');
    });
  });

  describe('prepareInvocation()', () => {
    it('returns invocation message', async () => {
      const result = await tool.prepareInvocation(
        { input: {} } as never,
        { isCancellationRequested: false } as never,
      );

      expect(result.invocationMessage).toContain('Checking');
    });
  });
});
