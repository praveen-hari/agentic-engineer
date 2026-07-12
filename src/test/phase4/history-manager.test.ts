/**
 * Phase 4: History/Archive System Tests (TDD — RED first)
 *
 * Tests the git-pack-file-inspired archive system:
 * 1. archiveWorkflow() — packs completed workflow into archive/YYYY/MM/wf-xxx/
 * 2. loadHistory() — reads yearly index shards
 * 3. loadArchivedWorkflow() — reads a specific archived workflow
 * 4. Clears workflows/current/ after archiving
 * 5. Yearly sharding for 10-year scalability
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HistoryManager } from '../../services/history-manager.service';
import { ArtifactManager } from '../../services/artifact-manager.service';
import { StateManager } from '../../core/state-manager';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowDefinition } from '../../core/types';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const COMPLETED_WORKFLOW: WorkflowDefinition = {
  id: 'wf-test-001',
  version: 8,
  objective: 'Add OAuth2 authentication',
  processLevel: 'standard',
  detectedRisks: [],
  stages: [
    {
      id: 'define',
      name: 'Define',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      startedAt: '2026-07-11T10:01:00Z',
      completedAt: '2026-07-11T10:10:00Z',
    },
    {
      id: 'plan',
      name: 'Plan',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      startedAt: '2026-07-11T10:10:00Z',
      completedAt: '2026-07-11T10:20:00Z',
    },
    {
      id: 'build',
      name: 'Build',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      startedAt: '2026-07-11T10:20:00Z',
      completedAt: '2026-07-11T11:00:00Z',
    },
    {
      id: 'verify',
      name: 'Verify',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      startedAt: '2026-07-11T11:00:00Z',
      completedAt: '2026-07-11T11:10:00Z',
    },
    {
      id: 'review',
      name: 'Review',
      status: 'skipped',
      skippable: true,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      completedAt: '2026-07-11T11:10:00Z',
    },
    {
      id: 'ship',
      name: 'Ship',
      status: 'completed',
      skippable: false,
      entryConditions: [],
      exitConditions: [],
      artifacts: [],
      startedAt: '2026-07-11T11:10:00Z',
      completedAt: '2026-07-11T11:20:00Z',
    },
  ],
  qualityGates: [],
  approvals: [
    {
      id: 'apr-1',
      level: 'explicit',
      artifact: 'spec',
      status: 'approved',
      reason: 'Spec review',
      approvedAt: '2026-07-11T10:05:00Z',
    },
    {
      id: 'apr-2',
      level: 'review',
      artifact: 'code-review',
      status: 'approved',
      reason: 'Code review',
      approvedAt: '2026-07-11T11:15:00Z',
    },
  ],
  activeSkills: ['spec-driven-development', 'test-driven-development'],
  skillActivationReason: {},
  state: {
    currentStage: null,
    currentTask: null,
    tasksCompleted: 5,
    tasksTotal: 5,
    startedAt: '2026-07-11T10:00:00Z',
    lastActivityAt: '2026-07-11T11:20:00Z',
    status: 'completed',
  },
};

describe('Phase 4: HistoryManager', () => {
  let fs: InMemoryFileIO;
  let historyManager: HistoryManager;
  let artifactManager: ArtifactManager;
  let stateManager: StateManager;

  beforeEach(async () => {
    fs = new InMemoryFileIO();
    historyManager = new HistoryManager(fs, '/workspace');
    artifactManager = new ArtifactManager(fs, '/workspace');
    stateManager = new StateManager(fs, '/workspace/.codestudio/workflows/current/workflow.json');

    // Set up a completed workflow with artifacts
    await stateManager.save(COMPLETED_WORKFLOW);
    await artifactManager.save(
      'spec',
      'Auth Spec',
      '# Authentication Specification\n\nOAuth2 flow...',
      'define',
    );
    await artifactManager.save(
      'plan',
      'Implementation Plan',
      '# Plan\n\n1. Add OAuth routes...',
      'plan',
    );
  });

  // ─── archiveWorkflow ──────────────────────────────────────────────

  describe('archiveWorkflow()', () => {
    it('creates archive directory with year/month structure', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const archivePath = `/workspace/.codestudio/archive/2026/07/wf-test-001`;
      expect(await fs.exists(`${archivePath}/archive.json`)).toBe(true);
    });

    it('writes archive.json with workflow state', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const archivePath = `/workspace/.codestudio/archive/2026/07/wf-test-001/archive.json`;
      const content = JSON.parse(await fs.read(archivePath));

      expect(content.version).toBe(1);
      expect(content.workflow.id).toBe('wf-test-001');
      expect(content.workflow.objective).toBe('Add OAuth2 authentication');
      expect(content.workflow.state.status).toBe('completed');
      expect(content.archivedAt).toBeDefined();
    });

    it('copies artifact files to archive directory', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const archiveBase = `/workspace/.codestudio/archive/2026/07/wf-test-001`;
      expect(await fs.exists(`${archiveBase}/spec.md`)).toBe(true);
      expect(await fs.exists(`${archiveBase}/plan.md`)).toBe(true);

      const specContent = await fs.read(`${archiveBase}/spec.md`);
      expect(specContent).toContain('OAuth2 flow');
    });

    it('includes artifact metadata in archive.json', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const archivePath = `/workspace/.codestudio/archive/2026/07/wf-test-001/archive.json`;
      const content = JSON.parse(await fs.read(archivePath));

      expect(content.artifacts).toHaveLength(2);
      expect(content.artifacts[0].type).toBe('spec');
      expect(content.artifacts[1].type).toBe('plan');
    });

    it('creates history entry in yearly shard', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const entries = await historyManager.loadHistory(2026);
      expect(entries).toHaveLength(1);
      expect(entries[0].workflowId).toBe('wf-test-001');
      expect(entries[0].objective).toBe('Add OAuth2 authentication');
      expect(entries[0].processLevel).toBe('standard');
      expect(entries[0].archivePath).toBe('archive/2026/07/wf-test-001');
    });

    it('computes stats from workflow', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const entries = await historyManager.loadHistory(2026);
      expect(entries[0].stats).toBeDefined();
      expect(entries[0].stats!.stagesCompleted).toBe(5); // 5 completed
      expect(entries[0].stats!.stagesSkipped).toBe(1); // 1 skipped (review)
      expect(entries[0].stats!.approvalsGranted).toBe(2);
    });

    it('updates history meta', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const meta = await historyManager.loadMeta();
      expect(meta.years).toContain(2026);
      expect(meta.totalWorkflows).toBe(1);
    });

    it('clears current workflow after archiving', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const wf = await stateManager.load();
      expect(wf).toBeNull();
    });

    it('clears artifact manifest after archiving', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const artifacts = await artifactManager.listAll();
      expect(artifacts).toEqual([]);
    });
  });

  // ─── Multiple archives ────────────────────────────────────────────

  describe('multiple archives', () => {
    it('appends to existing yearly shard', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const wf2: WorkflowDefinition = {
        ...COMPLETED_WORKFLOW,
        id: 'wf-test-002',
        objective: 'Add email notifications',
      };
      await stateManager.save(wf2);
      await historyManager.archiveWorkflow(wf2);

      const entries = await historyManager.loadHistory(2026);
      expect(entries).toHaveLength(2);
      expect(entries[0].workflowId).toBe('wf-test-001');
      expect(entries[1].workflowId).toBe('wf-test-002');
    });

    it('increments totalWorkflows in meta', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const wf2: WorkflowDefinition = { ...COMPLETED_WORKFLOW, id: 'wf-test-002' };
      await stateManager.save(wf2);
      await historyManager.archiveWorkflow(wf2);

      const meta = await historyManager.loadMeta();
      expect(meta.totalWorkflows).toBe(2);
    });
  });

  // ─── loadHistory ──────────────────────────────────────────────────

  describe('loadHistory()', () => {
    it('returns empty array for year with no history', async () => {
      const entries = await historyManager.loadHistory(2025);
      expect(entries).toEqual([]);
    });

    it('returns entries for the specified year', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const entries = await historyManager.loadHistory(2026);
      expect(entries).toHaveLength(1);
    });

    it('loads current year by default', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const entries = await historyManager.loadHistory();
      expect(entries).toHaveLength(1);
    });
  });

  // ─── loadMeta ─────────────────────────────────────────────────────

  describe('loadMeta()', () => {
    it('returns empty meta when no history exists', async () => {
      const meta = await historyManager.loadMeta();
      expect(meta.years).toEqual([]);
      expect(meta.totalWorkflows).toBe(0);
    });
  });

  // ─── loadArchivedWorkflow ─────────────────────────────────────────

  describe('loadArchivedWorkflow()', () => {
    it('loads a specific archived workflow', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const archive = await historyManager.loadArchivedWorkflow('archive/2026/07/wf-test-001');
      expect(archive).not.toBeNull();
      expect(archive!.workflow.id).toBe('wf-test-001');
      expect(archive!.workflow.objective).toBe('Add OAuth2 authentication');
    });

    it('returns null for non-existent archive', async () => {
      const archive = await historyManager.loadArchivedWorkflow('archive/2026/07/wf-nonexistent');
      expect(archive).toBeNull();
    });

    it('includes artifact metadata', async () => {
      await historyManager.archiveWorkflow(COMPLETED_WORKFLOW);

      const archive = await historyManager.loadArchivedWorkflow('archive/2026/07/wf-test-001');
      expect(archive!.artifacts).toHaveLength(2);
    });
  });
});
