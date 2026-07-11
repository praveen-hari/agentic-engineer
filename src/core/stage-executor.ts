import type { SkillRegistry } from './skill-registry';
import type {
  Artifact,
  ArtifactType,
  LifecycleStage,
  ProcessLevel,
  SkillId,
  StageAction,
  StageExecutionResult,
  WorkflowDefinition,
} from './types';

/**
 * Determines what each workflow stage needs to do and tracks execution.
 *
 * The Stage Executor is the bridge between "we have a workflow definition"
 * and "the agent is actually doing engineering work." For each stage, it:
 *
 * 1. Computes the {@link StageAction} — what skills to load, what artifacts
 *    to produce, what gates must pass.
 * 2. Evaluates whether the stage can be completed — are all required
 *    artifacts present? Are all gates passing? Are all approvals granted?
 * 3. Returns a {@link StageExecutionResult} describing what happened or
 *    what's still needed.
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 *
 * @see AGENTIC_SDLC_EXTENSION_ANALYSIS.md §5.2 (Stage Details)
 * @see DESIGN_DECISIONS.md DD-014 (Dynamic Workflow Generation)
 */
export class StageExecutor {
  constructor(private readonly skillRegistry: SkillRegistry) {}

  /**
   * Get the action plan for the current active stage.
   * Returns null if no stage is active.
   */
  getStageAction(workflow: WorkflowDefinition): StageAction | null {
    const activeStage = workflow.stages.find((s) => s.status === 'active');
    if (!activeStage) return null;

    return this.buildStageAction(
      activeStage.id,
      workflow.processLevel,
      workflow.activeSkills,
    );
  }

  /**
   * Evaluate whether the current stage can be completed.
   * Checks: required artifacts exist, required gates pass, required approvals granted.
   */
  evaluateStageCompletion(
    workflow: WorkflowDefinition,
    artifacts: readonly Artifact[],
  ): StageExecutionResult {
    const activeStage = workflow.stages.find((s) => s.status === 'active');
    if (!activeStage) {
      return {
        stage: workflow.state.currentStage ?? 'onboard',
        status: 'completed',
        artifacts: [],
        pendingGates: [],
        pendingApprovals: [],
        message: 'No active stage',
      };
    }

    const action = this.buildStageAction(
      activeStage.id,
      workflow.processLevel,
      workflow.activeSkills,
    );

    // Check required artifacts
    const stageArtifacts = artifacts.filter((a) => a.stage === activeStage.id);
    const missingArtifacts = action.requiredArtifacts.filter(
      (type) => !stageArtifacts.some((a) => a.type === type && a.status !== 'rejected'),
    );

    // Check required gates
    const pendingGates = action.requiredGates.filter((gateId) => {
      const gate = workflow.qualityGates.find((g) => g.id === gateId);
      return !gate || gate.status === 'pending';
    });

    // Check required approvals
    const pendingApprovals = workflow.approvals
      .filter(
        (a) =>
          a.status === 'pending' &&
          this.isApprovalForStage(a.artifact, activeStage.id),
      )
      .map((a) => a.id);

    // Determine status
    const hasBlockers =
      missingArtifacts.length > 0 ||
      pendingGates.length > 0 ||
      pendingApprovals.length > 0;

    if (hasBlockers) {
      const parts: string[] = [];
      if (missingArtifacts.length > 0) {
        parts.push(`Missing artifacts: ${missingArtifacts.join(', ')}`);
      }
      if (pendingGates.length > 0) {
        parts.push(`Pending gates: ${pendingGates.join(', ')}`);
      }
      if (pendingApprovals.length > 0) {
        parts.push(`Pending approvals: ${pendingApprovals.length}`);
      }

      return {
        stage: activeStage.id,
        status: 'blocked',
        artifacts: stageArtifacts,
        pendingGates,
        pendingApprovals,
        message: parts.join('. '),
      };
    }

    return {
      stage: activeStage.id,
      status: 'completed',
      artifacts: stageArtifacts,
      pendingGates: [],
      pendingApprovals: [],
      message: `Stage "${activeStage.name}" is ready to advance`,
    };
  }

  /**
   * Get a human-readable description of what the agent should do
   * for the current stage. This is the "instruction" that gets
   * passed to the LLM or shown in the UI.
   */
  getStageInstructions(workflow: WorkflowDefinition): string {
    const action = this.getStageAction(workflow);
    if (!action) return 'No active stage. Start a workflow first.';

    const instructions = STAGE_INSTRUCTIONS[action.stage];
    if (!instructions) return `Execute stage: ${action.stage}`;

    const skillNames = action.skills
      .map((id) => this.skillRegistry.getById(id)?.label ?? id)
      .join(', ');

    const artifactNames = action.requiredArtifacts.join(', ');
    const gateNames = action.requiredGates.join(', ');

    let text = `## Stage: ${action.description}\n\n`;
    text += `${instructions.description}\n\n`;

    if (instructions.steps.length > 0) {
      text += `### Steps\n`;
      for (const step of instructions.steps) {
        text += `- ${step}\n`;
      }
      text += '\n';
    }

    if (skillNames) {
      text += `### Active Skills\n${skillNames}\n\n`;
    }
    if (artifactNames) {
      text += `### Required Artifacts\n${artifactNames}\n\n`;
    }
    if (gateNames) {
      text += `### Quality Gates\n${gateNames}\n\n`;
    }

    return text;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private buildStageAction(
    stage: LifecycleStage,
    processLevel: ProcessLevel,
    activeSkills: readonly SkillId[],
  ): StageAction {
    const stageSkills = this.skillRegistry
      .getByStage(stage)
      .filter((s) => activeSkills.includes(s.id))
      .map((s) => s.id);

    const config = STAGE_CONFIG[stage];

    // Filter required artifacts by process level
    const requiredArtifacts = (config?.artifacts ?? []).filter((a) =>
      this.artifactRequiredAtLevel(a, processLevel),
    );

    // Filter required gates by process level
    const requiredGates = (config?.gates ?? []).filter((g) =>
      this.gateRequiredAtLevel(g, processLevel),
    );

    return {
      stage,
      description: config?.description ?? stage,
      skills: stageSkills,
      requiredArtifacts,
      requiredGates,
      autoAdvance: config?.autoAdvance ?? false,
    };
  }

  private artifactRequiredAtLevel(
    artifact: ArtifactType,
    level: ProcessLevel,
  ): boolean {
    // Specs and plans are required at standard+
    if (artifact === 'spec' || artifact === 'plan') {
      return level !== 'light';
    }
    // ADRs required at thorough+
    if (artifact === 'adr') {
      return level === 'thorough' || level === 'guarded';
    }
    // Reviews required at standard+
    if (artifact === 'review') {
      return level !== 'light';
    }
    return true;
  }

  private gateRequiredAtLevel(gate: string, level: ProcessLevel): boolean {
    const LEVEL_ORDER: Record<ProcessLevel, number> = {
      light: 0,
      standard: 1,
      thorough: 2,
      guarded: 3,
    };

    const gateMinLevel = GATE_MIN_LEVELS[gate];
    if (!gateMinLevel) return true;
    return LEVEL_ORDER[level] >= LEVEL_ORDER[gateMinLevel];
  }

  private isApprovalForStage(artifactName: string, stage: LifecycleStage): boolean {
    const mapping: Record<string, LifecycleStage> = {
      spec: 'define',
      plan: 'plan',
      review: 'review',
      'code-review': 'review',
      'security-review': 'review',
    };
    return mapping[artifactName] === stage;
  }
}

// ─── Stage Configuration ────────────────────────────────────────────────────

interface StageConfig {
  readonly description: string;
  readonly artifacts: readonly ArtifactType[];
  readonly gates: readonly string[];
  readonly autoAdvance: boolean;
}

const STAGE_CONFIG: Readonly<Record<LifecycleStage, StageConfig>> = {
  onboard: {
    description: 'Onboard — Analyze workspace and establish project context',
    artifacts: [],
    gates: [],
    autoAdvance: true,
  },
  define: {
    description: 'Define — Capture objective and produce specification',
    artifacts: ['spec'],
    gates: ['spec-approved'],
    autoAdvance: false,
  },
  plan: {
    description: 'Plan — Break specification into executable tasks',
    artifacts: ['plan'],
    gates: ['plan-approved'],
    autoAdvance: false,
  },
  build: {
    description: 'Build — Implement tasks one at a time with TDD',
    artifacts: [],
    gates: [],
    autoAdvance: false,
  },
  verify: {
    description: 'Verify — Run tests, security scans, and performance checks',
    artifacts: ['report'],
    gates: ['tests-pass'],
    autoAdvance: false,
  },
  review: {
    description: 'Review — Multi-axis code review before merge',
    artifacts: ['review'],
    gates: ['code-review'],
    autoAdvance: false,
  },
  ship: {
    description: 'Ship — Pre-launch checklist and deployment',
    artifacts: [],
    gates: [],
    autoAdvance: false,
  },
};

// ─── Stage Instructions (human-readable) ────────────────────────────────────

interface StageInstructionDef {
  readonly description: string;
  readonly steps: readonly string[];
}

const STAGE_INSTRUCTIONS: Readonly<Record<LifecycleStage, StageInstructionDef>> = {
  onboard: {
    description:
      'Analyze the workspace, detect the tech stack, and establish project context. This stage runs automatically on first activation.',
    steps: [
      'Scan workspace files and detect languages, frameworks, and conventions',
      'Generate project context document (.codestudio/context.md)',
      'Configure agent skills based on detected stack',
      'Detect existing CI/CD, testing, and deployment configuration',
    ],
  },
  define: {
    description:
      'Capture the user\'s objective and produce a structured specification. The spec is the shared source of truth — it defines what we\'re building, why, and how we\'ll know it\'s done.',
    steps: [
      'Clarify requirements with the user (interview-me skill)',
      'Surface assumptions immediately — list what you\'re assuming',
      'Write a spec covering: Objective, Commands, Structure, Style, Testing, Boundaries',
      'Define success criteria — specific, testable conditions',
      'Present spec for user review and approval',
    ],
  },
  plan: {
    description:
      'Break the approved specification into discrete, implementable tasks ordered by dependency.',
    steps: [
      'Identify major components and their dependencies',
      'Slice vertically — each task delivers testable functionality',
      'Size each task (XS/S/M/L — reject XL, break down further)',
      'Order by dependencies, risk-first',
      'Add verification checkpoints between phases',
      'Present task plan for user review and approval',
    ],
  },
  build: {
    description:
      'Execute tasks one at a time following TDD (RED → GREEN → REFACTOR). Each task produces tested, committed code.',
    steps: [
      'Load task context (relevant files, spec section, patterns)',
      'Write failing test (RED)',
      'Implement minimal code to pass (GREEN)',
      'Refactor for clarity (REFACTOR)',
      'Run full test suite',
      'Commit with descriptive message',
      'Move to next task',
    ],
  },
  verify: {
    description:
      'Prove the implementation works end-to-end. Run all verification checks.',
    steps: [
      'Run full test suite (unit + integration)',
      'Run build and type checker',
      'Run linter',
      'Compile verification report',
    ],
  },
  review: {
    description:
      'Multi-axis quality review of the complete change. Five dimensions: correctness, readability, architecture, security, performance.',
    steps: [
      'Run five-axis code review',
      'Categorize findings (Critical, Required, Optional, Nit, FYI)',
      'Check Definition of Done criteria',
      'Present review for user approval',
    ],
  },
  ship: {
    description:
      'Prepare for deployment with pre-launch checklist and monitoring setup.',
    steps: [
      'Complete pre-launch checklist',
      'Verify all quality gates passed',
      'Document rollback strategy',
      'Prepare commit/PR for merge',
    ],
  },
};

// ─── Gate Minimum Process Levels ────────────────────────────────────────────

const GATE_MIN_LEVELS: Readonly<Record<string, ProcessLevel>> = {
  'spec-approved': 'standard',
  'plan-approved': 'standard',
  'tests-pass': 'standard',
  'code-review': 'standard',
  'security-review': 'thorough',
  'performance-budget': 'thorough',
  'docs-complete': 'thorough',
  'rollback-tested': 'guarded',
  'data-integrity': 'guarded',
};
