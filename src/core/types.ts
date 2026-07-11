/**
 * Core type definitions for the Engineering Workspace extension.
 *
 * All interfaces use `readonly` properties (DD-015, SPEC §6 Conventions).
 * These types are the shared vocabulary between the extension host,
 * webview, chat participant, and language model tools.
 *
 * @see DESIGN_DECISIONS.md DD-015 (Workflow Definition Schema)
 * @see SPEC.md §6 (Code Style)
 */

// ─── Literal Union Types ───────────────────────────────────────────────────

export type ProcessLevel = 'light' | 'standard' | 'thorough' | 'guarded';

export type StageStatus = 'pending' | 'active' | 'completed' | 'skipped' | 'blocked';

export type WorkType =
  'feature' | 'bugfix' | 'refactor' | 'infrastructure' | 'documentation' | 'security';

export type Complexity = 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical';

export type RiskLevel = 'low' | 'medium' | 'high';

export type LifecycleStage = 'onboard' | 'define' | 'plan' | 'build' | 'verify' | 'review' | 'ship';

export type SkillCategory =
  'always' | 'by-task-type' | 'by-context' | 'interactive' | 'quality-gate' | 'specialist';

export type ContextSignal =
  | 'touches_ui'
  | 'touches_api'
  | 'touches_auth_or_input'
  | 'touches_external_services'
  | 'performance_sensitive'
  | 'high_risk_decision';

export type WorkflowStateStatus = 'idle' | 'active' | 'completed' | 'failed';

export type ApprovalLevel = 'informational' | 'review' | 'explicit' | 'restricted';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';

export type GateStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export type GateType = 'automated' | 'review' | 'approval';

/** Gate type for skills — whether they block stage progression. */
export type SkillGateType = 'hard' | 'conditional' | 'none';

export type RiskSignalType = 'keyword' | 'file-pattern' | 'dependency' | 'scope';

export type AssessmentSource = 'deterministic' | 'llm';

// ─── All 24 Skill IDs ──────────────────────────────────────────────────────

export type SkillId =
  | 'context-engineering'
  | 'git-workflow-and-versioning'
  | 'incremental-implementation'
  | 'interview-me'
  | 'idea-refine'
  | 'spec-driven-development'
  | 'planning-and-task-breakdown'
  | 'test-driven-development'
  | 'source-driven-development'
  | 'doubt-driven-development'
  | 'frontend-ui-engineering'
  | 'api-and-interface-design'
  | 'browser-testing-with-devtools'
  | 'debugging-and-error-recovery'
  | 'code-review-and-quality'
  | 'code-simplification'
  | 'security-and-hardening'
  | 'performance-optimization'
  | 'observability-and-instrumentation'
  | 'documentation-and-adrs'
  | 'deprecation-and-migration'
  | 'ci-cd-and-automation'
  | 'shipping-and-launch'
  | 'using-agent-skills'
  | 'code-reviewer'
  | 'security-auditor'
  | 'test-engineer'
  | 'web-performance-auditor';

// ─── Result Type (for expected failures, per SPEC §6) ───────────────────────

export type Result<T, E = string> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// ─── Risk Assessment ───────────────────────────────────────────────────────

export interface RiskSignal {
  readonly type: RiskSignalType;
  readonly signal: string;
  readonly severity: RiskLevel;
  readonly impact: string;
}

export interface RiskAssessment {
  readonly workType: WorkType;
  readonly complexity: Complexity;
  readonly riskLevel: RiskLevel;
  readonly processLevel: ProcessLevel;
  readonly signals: readonly RiskSignal[];
  readonly contextSignals: readonly ContextSignal[];
  readonly source: AssessmentSource;
}

// ─── Workflow Definition (DD-015) ──────────────────────────────────────────

export interface Condition {
  readonly type: string;
  readonly description: string;
  readonly met: boolean;
}

export interface Stage {
  readonly id: LifecycleStage;
  readonly name: string;
  readonly status: StageStatus;
  readonly skippable: boolean;
  readonly entryConditions: readonly Condition[];
  readonly exitConditions: readonly Condition[];
  readonly artifacts: readonly string[];
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface QualityGate {
  readonly id: string;
  readonly name: string;
  readonly type: GateType;
  readonly status: GateStatus;
  readonly stage: LifecycleStage;
  readonly blocking: boolean;
  readonly conditional: boolean;
  readonly reason?: string;
  readonly result?: {
    readonly passedAt?: string;
    readonly failedAt?: string;
    readonly details?: string;
  };
}

export interface Approval {
  readonly id: string;
  readonly level: ApprovalLevel;
  readonly artifact: string;
  readonly status: ApprovalStatus;
  readonly reason?: string;
  readonly approvedBy?: string;
  readonly approvedAt?: string;
  readonly comment?: string;
}

export interface WorkflowState {
  readonly currentStage: LifecycleStage | null;
  readonly currentTask: string | null;
  readonly tasksCompleted: number;
  readonly tasksTotal: number;
  readonly startedAt: string;
  readonly lastActivityAt: string;
  readonly status: WorkflowStateStatus;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: number;
  readonly objective: string;
  readonly processLevel: ProcessLevel;
  readonly detectedRisks: readonly RiskSignal[];
  readonly stages: readonly Stage[];
  readonly qualityGates: readonly QualityGate[];
  readonly approvals: readonly Approval[];
  readonly activeSkills: readonly SkillId[];
  readonly skillActivationReason: Readonly<Record<string, string>>;
  readonly state: WorkflowState;
}

// ─── Event Sourcing (DD-008) ───────────────────────────────────────────────

export type WorkflowEventType =
  | 'workflow.created'
  | 'workflow.started'
  | 'workflow.completed'
  | 'workflow.failed'
  | 'stage.entered'
  | 'stage.completed'
  | 'stage.skipped'
  | 'gate.passed'
  | 'gate.failed'
  | 'gate.skipped'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.rejected'
  | 'approval.auto-approved'
  | 'skill.activated'
  | 'task.started'
  | 'task.completed'
  | 'workflow.promoted'
  | 'artifact.created'
  | 'artifact.updated';

export interface WorkflowEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly type: WorkflowEventType;
  readonly workflowId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

// ─── Project Context ───────────────────────────────────────────────────────

export interface ProjectContext {
  readonly rootPath: string;
  readonly detectedStack: readonly string[];
  readonly languages: readonly string[];
  readonly frameworks: readonly string[];
  readonly packageManager: string | null;
  readonly testFramework: string | null;
  readonly conventions: readonly string[];
  readonly generatedAt: string;
}

// ─── Skill Definitions (DD-007, DD-010) ────────────────────────────────────

export interface SkillActivationRules {
  readonly mode: 'always' | 'by-task-type' | 'by-context' | 'interactive' | 'quality-gate';
  readonly workTypes?: readonly WorkType[];
  readonly contextSignals?: readonly ContextSignal[];
  readonly stages?: readonly LifecycleStage[];
  readonly minProcessLevel?: ProcessLevel;
}

export interface SkillDefinition {
  readonly id: SkillId;
  readonly name: string;
  readonly label: string;
  readonly category: SkillCategory;
  readonly description: string;
  readonly activation: SkillActivationRules;
  readonly gateType?: SkillGateType;
}

// ─── Message Protocol (Webview ↔ Extension Host) ────────────────────────────

export type MessageToHost =
  | { readonly type: 'requestState' }
  | { readonly type: 'requestContext' }
  | { readonly type: 'analyzeObjective'; readonly objective: string }
  | {
      readonly type: 'startWorkflow';
      readonly objective: string;
      readonly assessment: RiskAssessment;
    }
  | { readonly type: 'advanceStage' }
  | { readonly type: 'skipStage'; readonly stageId: LifecycleStage }
  | { readonly type: 'approve'; readonly approvalId: string; readonly comment?: string }
  | { readonly type: 'reject'; readonly approvalId: string; readonly comment?: string }
  | { readonly type: 'navigate'; readonly view: string }
  | { readonly type: 'requestHistory'; readonly page?: number };

export type MessageToWebview =
  | { readonly type: 'state'; readonly workflow: WorkflowDefinition | null }
  | { readonly type: 'context'; readonly context: ProjectContext | null }
  | { readonly type: 'assessment'; readonly assessment: RiskAssessment }
  | {
      readonly type: 'history';
      readonly entries: readonly HistoryEntry[];
      readonly hasMore: boolean;
    }
  | { readonly type: 'error'; readonly message: string };

// ─── Chat Commands ─────────────────────────────────────────────────────────

export type ChatCommand = 'status' | 'analyze' | 'history';

export interface ChatCommandContext {
  readonly command: ChatCommand;
  readonly prompt: string;
  readonly history: ReadonlyArray<{
    readonly role: 'user' | 'assistant';
    readonly content: string;
  }>;
}

// ─── Language Model Tool Inputs ────────────────────────────────────────────

export interface AnalyzeWorkRequestInput {
  readonly objective: string;
  readonly context?: {
    readonly touchesUi?: boolean;
    readonly touchesApi?: boolean;
    readonly touchesDatabase?: boolean;
  };
}

export interface GetWorkflowStatusInput {
  readonly includeHistory?: boolean;
}

export interface GetProjectContextInput {}

// ─── History (DD-006, DD-007) ──────────────────────────────────────────────

export type HistoryTier = 'hot' | 'warm' | 'cold';

export interface HistoryEntry {
  readonly id: string;
  readonly workflowId: string;
  readonly objective: string;
  readonly processLevel: ProcessLevel;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly tier: HistoryTier;
  readonly summary?: string;
  readonly stats?: {
    readonly stagesCompleted: number;
    readonly stagesSkipped: number;
    readonly approvalsGranted: number;
    readonly approvalsRejected: number;
    readonly events: number;
  };
}

export interface HistoryIndex {
  readonly entries: readonly HistoryEntry[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly hasMore: boolean;
}

// ─── File I/O Interface (for testability — DD-008) ─────────────────────────

export interface FileIO {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<readonly string[]>;
}
