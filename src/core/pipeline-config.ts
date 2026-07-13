/**
 * Unified Pipeline Configuration — the single source of truth for
 * how the SDLC workflow behaves.
 *
 * Replaces 6 scattered constants across 4 files:
 * - constants.ts: BASE_STAGES, STAGE_NAMES, MIN_APPROVALS
 * - stage-executor.ts: STAGE_CONFIG, STAGE_INSTRUCTIONS, GATE_MIN_LEVELS
 * - workflow-generator.ts: signalGateMap, approval generation if/else
 * - skill-engine.ts: PROCESS_LEVEL_SKILLS
 *
 * Every engine (WorkflowEngine, WorkflowGenerator, StageExecutor,
 * SkillEngine) reads from this config. Adding a stage, gate, or
 * approval is a data edit — not a code change.
 *
 * Future: load overrides from `.codestudio/config.json` to allow
 * per-project pipeline customization.
 *
 * @see ARCHITECTURE_PLAN_MESSAGE_HANDLER_REFACTOR.md
 * @see DESIGN_DECISIONS.md DD-014 (Dynamic Workflow Generation)
 */

import type {
  ArtifactType,
  GateType,
  ApprovalLevel,
  LifecycleStage,
  ProcessLevel,
  SkillId,
} from './types';

// ─── Pipeline Config Types ──────────────────────────────────────────────────

/** Process level ordering — used for "minLevel" comparisons. */
export const PROCESS_LEVEL_ORDER: Readonly<Record<ProcessLevel, number>> = {
  light: 0,
  standard: 1,
  thorough: 2,
  guarded: 3,
};

/** Artifact requirement within a stage. */
export interface ArtifactRequirement {
  /** Minimum process level at which this artifact is required. */
  readonly minLevel: ProcessLevel;
}

/** Gate requirement within a stage. */
export interface GateRequirement {
  /** Display name for the gate. */
  readonly name: string;
  /** Gate type: automated check, human review, or explicit approval. */
  readonly type: GateType;
  /** Minimum process level at which this gate is required. */
  readonly minLevel: ProcessLevel;
}

/** Approval requirement generated at a process level. */
export interface ApprovalRequirement {
  readonly id: string;
  readonly level: ApprovalLevel;
  readonly artifact: string;
  readonly reason: string;
  /** Minimum process level at which this approval is required. */
  readonly minLevel: ProcessLevel;
}

/** Conditional gate triggered by a context signal. */
export interface ConditionalGateDef {
  readonly id: string;
  readonly name: string;
  readonly stage: LifecycleStage;
  readonly reason: string;
}

/** Conditional approval triggered by a context signal. */
export interface ConditionalApprovalDef {
  readonly id: string;
  readonly level: ApprovalLevel;
  readonly artifact: string;
  readonly reason: string;
}

/** Full configuration for a single pipeline stage. */
export interface StageDefinition {
  /** Display name (e.g., "Define", "Plan"). */
  readonly name: string;
  /** Short description shown in the UI and instructions. */
  readonly description: string;
  /** Required artifacts, keyed by artifact type. */
  readonly artifacts: Readonly<Record<string, ArtifactRequirement>>;
  /** Required quality gates, keyed by gate ID. */
  readonly gates: Readonly<Record<string, GateRequirement>>;
  /** Skills relevant to this stage. */
  readonly skills: readonly SkillId[];
  /** Human-readable steps for the agent. */
  readonly steps: readonly string[];
  /** Process levels at which this stage can be skipped. */
  readonly skippableAt: readonly ProcessLevel[];
  /** Whether the stage auto-advances when all requirements are met. */
  readonly autoAdvance: boolean;
}

/** Configuration for a process level. */
export interface ProcessLevelDefinition {
  /** Ordered list of stage IDs for this level. */
  readonly stages: readonly LifecycleStage[];
  /** Minimum number of approvals required. */
  readonly minApprovals: number;
  /** Skills activated purely by this process level (additive). */
  readonly skills: readonly SkillId[];
}

/** Maps approval artifact names to the stage they belong to. */
export type ApprovalStageMapping = Readonly<Record<string, LifecycleStage>>;

/** The complete pipeline configuration. */
export interface PipelineConfig {
  /** Stage definitions, keyed by stage ID. */
  readonly stages: Readonly<Record<LifecycleStage, StageDefinition>>;
  /** Process level definitions. */
  readonly processLevels: Readonly<Record<ProcessLevel, ProcessLevelDefinition>>;
  /** Conditional gates triggered by context signals. */
  readonly conditionalGates: Readonly<Record<string, ConditionalGateDef>>;
  /** Conditional approvals triggered by context signals. */
  readonly conditionalApprovals: Readonly<Record<string, ConditionalApprovalDef>>;
  /** Base approvals generated per process level. */
  readonly approvals: readonly ApprovalRequirement[];
  /** Maps approval artifact names to the stage they belong to. */
  readonly approvalStageMap: ApprovalStageMapping;
}

// ─── Default Pipeline Configuration ─────────────────────────────────────────

export const DEFAULT_PIPELINE: PipelineConfig = {
  // ─── Stages ─────────────────────────────────────────────────────────
  stages: {
    define: {
      name: 'Define',
      description: 'Define — Capture objective and produce specification',
      artifacts: {
        spec: { minLevel: 'standard' },
      },
      gates: {
        'spec-approved': { name: 'Spec Approved', type: 'approval', minLevel: 'standard' },
      },
      skills: ['spec-driven-development', 'interview-me'],
      steps: [
        'Clarify requirements with the user (interview-me skill)',
        "Surface assumptions immediately — list what you're assuming",
        'Write a spec covering: Objective, Commands, Structure, Style, Testing, Boundaries',
        'Define success criteria — specific, testable conditions',
        'Present spec for user review and approval',
      ],
      skippableAt: [],
      autoAdvance: false,
    },
    plan: {
      name: 'Plan',
      description: 'Plan — Break specification into executable tasks',
      artifacts: {
        plan: { minLevel: 'standard' },
      },
      gates: {
        'plan-approved': { name: 'Plan Approved', type: 'approval', minLevel: 'standard' },
      },
      skills: ['planning-and-task-breakdown', 'incremental-implementation'],
      steps: [
        'Identify major components and their dependencies',
        'Slice vertically — each task delivers testable functionality',
        'Size each task (XS/S/M/L — reject XL, break down further)',
        'Order by dependencies, risk-first',
        'Add verification checkpoints between phases',
        'Present task plan for user review and approval',
      ],
      skippableAt: [],
      autoAdvance: false,
    },
    build: {
      name: 'Build',
      description: 'Build — Implement tasks one at a time with TDD',
      artifacts: {},
      gates: {
        'build-complete': { name: 'Build Complete', type: 'approval', minLevel: 'light' },
      },
      skills: ['incremental-implementation', 'test-driven-development'],
      steps: [
        'Load task context (relevant files, spec section, patterns)',
        'Write failing test (RED)',
        'Implement minimal code to pass (GREEN)',
        'Refactor for clarity (REFACTOR)',
        'Run full test suite',
        'Commit with descriptive message',
        'Move to next task',
      ],
      skippableAt: [],
      autoAdvance: false,
    },
    verify: {
      name: 'Verify',
      description: 'Verify — Run tests, security scans, and performance checks',
      artifacts: {
        report: { minLevel: 'light' },
      },
      gates: {
        'tests-pass': { name: 'Tests Pass', type: 'automated', minLevel: 'standard' },
        'performance-budget': {
          name: 'Performance Budget',
          type: 'automated',
          minLevel: 'thorough',
        },
        'data-integrity': {
          name: 'Data Integrity Check',
          type: 'automated',
          minLevel: 'guarded',
        },
      },
      skills: ['test-driven-development'],
      steps: [
        'Run full test suite (unit + integration)',
        'Run build and type checker',
        'Run linter',
        'Compile verification report',
      ],
      skippableAt: [],
      autoAdvance: false,
    },
    review: {
      name: 'Review',
      description: 'Review — Multi-axis code review before merge',
      artifacts: {
        review: { minLevel: 'standard' },
      },
      gates: {
        'code-review': { name: 'Code Review', type: 'review', minLevel: 'standard' },
        'security-review': { name: 'Security Review', type: 'review', minLevel: 'thorough' },
      },
      skills: ['code-review-and-quality', 'security-and-hardening'],
      steps: [
        'Run five-axis code review',
        'Categorize findings (Critical, Required, Optional, Nit, FYI)',
        'Check Definition of Done criteria',
        'Present review for user approval',
      ],
      skippableAt: ['light', 'standard', 'thorough'],
      autoAdvance: false,
    },
    ship: {
      name: 'Ship',
      description: 'Ship — Pre-launch checklist and deployment',
      artifacts: {},
      gates: {
        'ship-checklist': { name: 'Ship Checklist', type: 'approval', minLevel: 'thorough' },
        'docs-complete': {
          name: 'Documentation Complete',
          type: 'review',
          minLevel: 'thorough',
        },
        'rollback-tested': { name: 'Rollback Tested', type: 'automated', minLevel: 'guarded' },
      },
      skills: ['shipping-and-launch', 'documentation-and-adrs'],
      steps: [
        'Complete pre-launch checklist',
        'Verify all quality gates passed',
        'Document rollback strategy',
        'Prepare commit/PR for merge',
      ],
      skippableAt: [],
      autoAdvance: false,
    },
  },

  // ─── Process Levels ─────────────────────────────────────────────────
  processLevels: {
    light: {
      stages: ['plan', 'build', 'verify'],
      minApprovals: 0,
      skills: [],
    },
    standard: {
      stages: ['define', 'plan', 'build', 'verify', 'review'],
      minApprovals: 2,
      skills: ['code-review-and-quality'],
    },
    thorough: {
      stages: ['define', 'plan', 'build', 'verify', 'review', 'ship'],
      minApprovals: 3,
      skills: ['shipping-and-launch', 'security-and-hardening', 'documentation-and-adrs'],
    },
    guarded: {
      stages: ['define', 'plan', 'build', 'verify', 'review', 'ship'],
      minApprovals: 4,
      skills: [],
    },
  },

  // ─── Conditional Gates (triggered by context signals) ───────────────
  conditionalGates: {
    touches_auth_or_input: {
      id: 'security-review',
      name: 'Security Review',
      stage: 'review',
      reason: 'Task touches authentication or user input — security review required',
    },
    touches_ui: {
      id: 'accessibility-check',
      name: 'Accessibility Check',
      stage: 'review',
      reason: 'Task touches UI — accessibility verification required',
    },
    touches_api: {
      id: 'api-contract-review',
      name: 'API Contract Review',
      stage: 'review',
      reason: 'Task touches API — contract review required',
    },
    touches_external_services: {
      id: 'integration-test',
      name: 'Integration Test',
      stage: 'review',
      reason: 'Task touches external services — integration test required',
    },
    performance_sensitive: {
      id: 'performance-budget',
      name: 'Performance Budget',
      stage: 'verify',
      reason: 'Task is performance-sensitive — performance budget check required',
    },
    high_risk_decision: {
      id: 'architecture-review',
      name: 'Architecture Review',
      stage: 'review',
      reason: 'Task involves high-risk decision — architecture review required',
    },
  },

  // ─── Conditional Approvals (triggered by context signals) ───────────
  conditionalApprovals: {
    touches_auth_or_input: {
      id: 'approval-security',
      level: 'explicit',
      artifact: 'security-review',
      reason: 'Security review required for auth/input changes',
    },
    touches_external_services: {
      id: 'approval-integration',
      level: 'review',
      artifact: 'integration',
      reason: 'Integration review required for external service changes',
    },
  },

  // ─── Base Approvals (generated per process level) ───────────────────
  approvals: [
    {
      id: 'approval-spec',
      level: 'explicit',
      artifact: 'spec',
      reason: 'Spec requires explicit approval',
      minLevel: 'standard',
    },
    {
      id: 'approval-review',
      level: 'review',
      artifact: 'code-review',
      reason: 'Code review required before merge',
      minLevel: 'standard',
    },
    {
      id: 'approval-architecture',
      level: 'review',
      artifact: 'architecture',
      reason: 'Architecture review required for thorough process',
      minLevel: 'thorough',
    },
    {
      id: 'approval-restricted-1',
      level: 'restricted',
      artifact: 'schema-migration',
      reason: 'Restricted approval: schema migration',
      minLevel: 'guarded',
    },
    {
      id: 'approval-restricted-2',
      level: 'restricted',
      artifact: 'deployment',
      reason: 'Restricted approval: production deployment',
      minLevel: 'guarded',
    },
  ],

  // ─── Approval → Stage Mapping ──────────────────────────────────────
  approvalStageMap: {
    spec: 'define',
    plan: 'plan',
    'code-review': 'review',
    review: 'review',
    'security-review': 'review',
    architecture: 'review',
    integration: 'review',
    'schema-migration': 'ship',
    deployment: 'ship',
  },
};

// ─── Helper Functions ───────────────────────────────────────────────────────

/**
 * Check if a process level meets a minimum level requirement.
 */
export function meetsMinLevel(current: ProcessLevel, minimum: ProcessLevel): boolean {
  return PROCESS_LEVEL_ORDER[current] >= PROCESS_LEVEL_ORDER[minimum];
}

/**
 * Get the stage IDs for a given process level from the pipeline config.
 */
export function getStagesForLevel(
  config: PipelineConfig,
  level: ProcessLevel,
): readonly LifecycleStage[] {
  return config.processLevels[level]?.stages ?? config.processLevels.standard.stages;
}

/**
 * Check if a stage is skippable at a given process level.
 */
export function isStageSkippable(
  config: PipelineConfig,
  stageId: LifecycleStage,
  level: ProcessLevel,
): boolean {
  // Guarded: nothing is skippable (safety override)
  if (level === 'guarded') return false;
  const stageDef = config.stages[stageId];
  if (!stageDef) return false;
  return stageDef.skippableAt.includes(level);
}

/**
 * Get required artifact types for a stage at a given process level.
 */
export function getRequiredArtifacts(
  config: PipelineConfig,
  stageId: LifecycleStage,
  level: ProcessLevel,
): readonly ArtifactType[] {
  const stageDef = config.stages[stageId];
  if (!stageDef) return [];
  return Object.entries(stageDef.artifacts)
    .filter(([, req]) => meetsMinLevel(level, req.minLevel))
    .map(([type]) => type as ArtifactType);
}

/**
 * Get required gate IDs for a stage at a given process level.
 */
export function getRequiredGates(
  config: PipelineConfig,
  stageId: LifecycleStage,
  level: ProcessLevel,
): readonly string[] {
  const stageDef = config.stages[stageId];
  if (!stageDef) return [];
  return Object.entries(stageDef.gates)
    .filter(([, req]) => meetsMinLevel(level, req.minLevel))
    .map(([id]) => id);
}
