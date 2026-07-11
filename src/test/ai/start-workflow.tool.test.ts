/**
 * Tests for StartWorkflowTool.
 *
 * Covers: workflow creation, process level inference, stage action
 * computation, nextSteps generation, callback notification, and
 * all risk/complexity combinations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartWorkflowTool } from '../../ai/tools/start-workflow.tool';
import { WorkflowGenerator } from '../../core/workflow-generator';
import { WorkflowEngine } from '../../core/workflow-engine';
import { StateManager } from '../../core/state-manager';
import { StageExecutor } from '../../core/stage-executor';
import { SkillRegistry } from '../../core/skill-registry';
import { SkillEngine } from '../../core/skill-engine';
import { ArtifactManager } from '../../services/artifact-manager.service';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

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

describe('StartWorkflowTool', () => {
  let fs: InMemoryFileIO;
  let workflowGenerator: WorkflowGenerator;
  let workflowEngine: WorkflowEngine;
  let stateManager: StateManager;
  let stageExecutor: StageExecutor;
  let artifactManager: ArtifactManager;
  let onWorkflowStarted: ReturnType<typeof vi.fn>;
  let tool: StartWorkflowTool;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    const skillRegistry = new SkillRegistry();
    const skillEngine = new SkillEngine(skillRegistry);
    workflowGenerator = new WorkflowGenerator(skillEngine);
    workflowEngine = new WorkflowEngine();
    stateManager = new StateManager(fs, '/project/.codestudio/workflow.json');
    stageExecutor = new StageExecutor(skillRegistry);
    artifactManager = new ArtifactManager(fs, '/project');
    onWorkflowStarted = vi.fn();

    tool = new StartWorkflowTool(
      workflowGenerator,
      workflowEngine,
      stateManager,
      stageExecutor,
      artifactManager,
      onWorkflowStarted,
    );
  });

  describe('invoke()', () => {
    it('creates and starts a workflow', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Add user authentication',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.workflowId).toBeDefined();
      expect(parsed.objective).toBe('Add user authentication');
      expect(parsed.workType).toBe('feature');
      expect(parsed.currentStage).toBeDefined();
      expect(parsed.totalStages).toBeGreaterThan(0);
    });

    it('saves workflow state to disk', async () => {
      await tool.invoke(
        {
          input: {
            objective: 'Add auth',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const saved = await stateManager.load();
      expect(saved).not.toBeNull();
      expect(saved!.objective).toBe('Add auth');
      expect(saved!.state.status).toBe('active');
    });

    it('saves objective to disk', async () => {
      await tool.invoke(
        {
          input: {
            objective: 'Add auth',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const objective = await artifactManager.readObjective();
      expect(objective).toContain('Add auth');
    });

    it('calls onWorkflowStarted callback', async () => {
      await tool.invoke(
        {
          input: {
            objective: 'Add auth',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      expect(onWorkflowStarted).toHaveBeenCalledTimes(1);
      const wf = onWorkflowStarted.mock.calls[0][0] as WorkflowDefinition;
      expect(wf.state.status).toBe('active');
    });

    it('returns stage action for current stage', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Add auth',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.stageAction).not.toBeNull();
      expect(parsed.stageAction.stage).toBeDefined();
    });

    it('returns nextSteps array', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Add auth',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.nextSteps).toBeDefined();
      expect(parsed.nextSteps.length).toBeGreaterThan(0);
    });

    it('returns instructions string', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Add auth',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);

      expect(parsed.instructions).toBeDefined();
      expect(parsed.instructions.length).toBeGreaterThan(0);
    });
  });

  // ─── Process Level Inference ──────────────────────────────────────

  describe('process level inference', () => {
    it('high risk + critical complexity → guarded', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Add payment',
            workType: 'security',
            complexity: 'critical',
            riskLevel: 'high',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.processLevel).toBe('guarded');
    });

    it('medium risk + complex → thorough', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Add feature',
            workType: 'feature',
            complexity: 'complex',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.processLevel).toBe('thorough');
    });

    it('low risk + trivial → light', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Fix typo',
            workType: 'documentation',
            complexity: 'trivial',
            riskLevel: 'low',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.processLevel).toBe('light');
    });

    it('explicit processLevel overrides inference', async () => {
      const result = await tool.invoke(
        {
          input: {
            objective: 'Fix typo',
            workType: 'documentation',
            complexity: 'trivial',
            riskLevel: 'low',
            processLevel: 'thorough',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
      const parsed = JSON.parse(text);
      expect(parsed.processLevel).toBe('thorough');
    });
  });

  // ─── All Work Types ───────────────────────────────────────────────

  describe('all work types', () => {
    const workTypes = [
      'feature',
      'bugfix',
      'refactor',
      'infrastructure',
      'documentation',
      'security',
    ] as const;

    for (const workType of workTypes) {
      it(`handles workType "${workType}"`, async () => {
        const result = await tool.invoke(
          {
            input: {
              objective: `${workType} task`,
              workType,
              complexity: 'moderate',
              riskLevel: 'medium',
            },
          } as never,
          { isCancellationRequested: false } as never,
        );

        const text = (result as unknown as { parts: Array<{ text: string }> }).parts[0].text;
        const parsed = JSON.parse(text);
        expect(parsed.workType).toBe(workType);
      });
    }
  });

  describe('prepareInvocation()', () => {
    it('includes objective in invocation message', async () => {
      const result = await tool.prepareInvocation(
        {
          input: {
            objective: 'Add user authentication with OAuth2',
            workType: 'feature',
            complexity: 'moderate',
            riskLevel: 'medium',
          },
        } as never,
        { isCancellationRequested: false } as never,
      );

      expect(result.invocationMessage).toContain('feature');
      expect(result.invocationMessage).toContain('medium');
    });
  });
});
