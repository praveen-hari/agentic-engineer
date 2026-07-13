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

export type LifecycleStage = 'define' | 'plan' | 'build' | 'verify' | 'review' | 'ship';

export type SkillCategory =
  'always' | 'by-task-type' | 'by-context' | 'interactive' | 'quality-gate' | 'specialist';

export type ContextSignal =
  | 'touches_ui'
  | 'touches_api'
  | 'touches_auth_or_input'
  | 'touches_external_services'
  | 'performance_sensitive'
  | 'high_risk_decision';

export type WorkflowStateStatus = 'idle' | 'active' | 'paused' | 'completed' | 'failed';

export type ApprovalLevel = 'informational' | 'review' | 'explicit' | 'restricted';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';

export type ApprovalMode = 'user' | 'agent';

export type PluginCategory = 'syncfusion' | 'community' | 'official';

export type PluginInstallStatus = 'not-installed' | 'installing' | 'installed' | 'failed';

export type GateStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export type GateType = 'automated' | 'review' | 'approval';

/** Gate type for skills — whether they block stage progression. */
export type SkillGateType = 'hard' | 'conditional' | 'none';

export type RiskSignalType = 'keyword' | 'file-pattern' | 'dependency' | 'scope';

export type AssessmentSource = 'deterministic' | 'llm';

// ─── Bundled Skill IDs ──────────────────────────────────────────────────────
// Only skills that have a SKILL.md file in the skills/ directory.
// The agent can only load skills that are actually bundled.

export type SkillId =
  | 'context-engineering'
  | 'git-workflow-and-versioning'
  | 'incremental-implementation'
  | 'interview-me'
  | 'spec-driven-development'
  | 'planning-and-task-breakdown'
  | 'test-driven-development'
  | 'debugging-and-error-recovery'
  | 'code-review-and-quality'
  | 'security-and-hardening'
  | 'documentation-and-adrs'
  | 'shipping-and-launch';

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
  readonly workType?: WorkType;
  readonly processLevel: ProcessLevel;
  readonly detectedRisks: readonly RiskSignal[];
  readonly stages: readonly Stage[];
  readonly qualityGates: readonly QualityGate[];
  readonly approvals: readonly Approval[];
  readonly activeSkills: readonly SkillId[];
  readonly skillActivationReason: Readonly<Record<string, string>>;
  readonly state: WorkflowState;
}

// ─── Knowledge Files ───────────────────────────────────────────────────────

export interface KnowledgeFileInfo {
  readonly name: string;
  readonly path: string;
  readonly exists: boolean;
  readonly preview: string;
  readonly updatedAt: string | null;
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

// ─── Plugin Marketplace ────────────────────────────────────────────────────

export interface PluginInstallSource {
  readonly type: 'git' | 'npm' | 'url';
  readonly repo: string;
}

export interface PluginInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly version: string;
  readonly icon: string;
  readonly repository: string;
  readonly keywords: readonly string[];
  readonly category: PluginCategory;
  readonly featured: boolean;
  readonly skillCount: number;
  readonly installSource: PluginInstallSource;
  readonly installStatus?: PluginInstallStatus;
}

export interface PluginRegistryData {
  readonly version: number;
  readonly lastUpdated: string;
  readonly plugins: readonly PluginInfo[];
}

export interface PluginStoreState {
  readonly plugins: readonly PluginInfo[];
  readonly installed: readonly PluginInfo[];
  readonly recommended: readonly PluginInfo[];
  readonly featured: readonly PluginInfo[];
  readonly loading: boolean;
  readonly searchQuery: string;
  readonly activeTab: 'all' | 'syncfusion' | 'community';
  readonly installingIds: readonly string[];
  readonly error: string | null;
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
  | { readonly type: 'requestHistory' }
  | { readonly type: 'requestStageActions' }
  | { readonly type: 'executeStage' }
  | { readonly type: 'requestArtifacts' }
  | { readonly type: 'requestGateStatus' }
  | { readonly type: 'generateArtifact'; readonly stage: LifecycleStage }
  | { readonly type: 'setupExistingProject' }
  | { readonly type: 'setupNewProject'; readonly projectName: string; readonly description: string }
  | { readonly type: 'requestOnboardingStatus' }
  | { readonly type: 'requestStageDetail' }
  | { readonly type: 'requestArtifactContent'; readonly artifactId: string }
  | { readonly type: 'sendToAgent'; readonly stage: LifecycleStage }
  | { readonly type: 'notifyArtifactDetected'; readonly artifact: Artifact }
  | { readonly type: 'openArtifact'; readonly artifactId: string }
  | { readonly type: 'cancelWorkflow' }
  | { readonly type: 'requestSettings' }
  | { readonly type: 'updateSettings'; readonly settings: Partial<WorkspaceConfig> }
  | { readonly type: 'requestKnowledge' }
  | { readonly type: 'refreshKnowledge' }
  | { readonly type: 'openKnowledgeFile'; readonly fileName: string }
  | { readonly type: 'requestHistoryDetail'; readonly archivePath: string }
  | { readonly type: 'cancelAgent' }
  | { readonly type: 'pauseWorkflow' }
  | { readonly type: 'resumeWorkflow' }
  | { readonly type: 'deleteWorkflow' }
  | { readonly type: 'refreshWorkflow' }
  | { readonly type: 'requestPlugins' }
  | { readonly type: 'installPlugin'; readonly pluginId: string }
  | { readonly type: 'uninstallPlugin'; readonly pluginId: string }
  | { readonly type: 'refreshPlugins' };

export type MessageToWebview =
  | { readonly type: 'state'; readonly workflow: WorkflowDefinition | null }
  | { readonly type: 'context'; readonly context: ProjectContext | null }
  | { readonly type: 'assessment'; readonly assessment: RiskAssessment }
  | {
      readonly type: 'history';
      readonly entries: readonly HistoryEntry[];
    }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'navigateTo'; readonly view: string }
  | { readonly type: 'stageActions'; readonly actions: StageAction | null }
  | { readonly type: 'artifacts'; readonly artifacts: readonly Artifact[] }
  | { readonly type: 'gateStatus'; readonly gates: readonly QualityGate[] }
  | { readonly type: 'stageResult'; readonly result: StageExecutionResult }
  | {
      readonly type: 'generatingArtifact';
      readonly stage: LifecycleStage;
      readonly message: string;
    }
  | { readonly type: 'artifactDetected'; readonly artifact: Artifact }
  | {
      readonly type: 'onboardingStatus';
      readonly status: OnboardingStatus;
      readonly projectType: ProjectType | null;
      readonly context: ProjectContext | null;
      readonly hasExistingFiles: boolean;
    }
  | {
      readonly type: 'stageDetail';
      readonly stage: LifecycleStage | null;
      readonly action: StageAction | null;
      readonly completion: StageExecutionResult;
      readonly instructions: string;
      readonly artifacts: readonly Artifact[];
    }
  | {
      readonly type: 'artifactContent';
      readonly artifactId: string;
      readonly content: string | null;
    }
  | {
      readonly type: 'agentStatus';
      readonly status: AgentActivityStatus;
      readonly stage?: LifecycleStage;
      readonly message?: string;
    }
  | { readonly type: 'settingsUpdated' }
  | {
      readonly type: 'knowledgeFiles';
      readonly files: readonly KnowledgeFileInfo[];
    }
  | {
      readonly type: 'historyDetail';
      readonly entry: HistoryEntry;
      readonly workflow: WorkflowDefinition;
      readonly artifacts: readonly ArtifactManifestEntry[];
    }
  | {
      readonly type: 'settingsLoaded';
      readonly settings: {
        readonly processLevelDefault: string;
        readonly autoApproveLowRisk: boolean;
        readonly reviewTimeoutMinutes: number;
      };
    }
  | {
      readonly type: 'pluginsData';
      readonly plugins: readonly PluginInfo[];
      readonly installed: readonly PluginInfo[];
      readonly recommended: readonly PluginInfo[];
      readonly featured: readonly PluginInfo[];
    }
  | {
      readonly type: 'pluginInstalling';
      readonly pluginId: string;
    }
  | {
      readonly type: 'pluginInstallResult';
      readonly pluginId: string;
      readonly success: boolean;
      readonly error?: string;
    };

// ─── Agent Activity ────────────────────────────────────────────────────────

export type AgentActivityStatus = 'idle' | 'working' | 'waiting-approval';

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

// ─── History (DD-006, DD-007 — Phase 4: yearly shards) ─────────────────────

export interface HistoryEntry {
  readonly id: string;
  readonly workflowId: string;
  readonly objective: string;
  readonly workType?: WorkType;
  readonly processLevel: ProcessLevel;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly archivePath: string;
  readonly summary?: string;
  readonly stats?: {
    readonly stagesCompleted: number;
    readonly stagesSkipped: number;
    readonly approvalsGranted: number;
    readonly approvalsRejected: number;
  };
}

export interface HistoryYearFile {
  readonly year: number;
  readonly entries: readonly HistoryEntry[];
}

export interface HistoryMeta {
  readonly years: readonly number[];
  readonly totalWorkflows: number;
}

export interface WorkflowArchive {
  readonly version: number;
  readonly archivedAt: string;
  readonly workflow: WorkflowDefinition;
  readonly artifacts: readonly ArtifactManifestEntry[];
}

// ─── Workspace Config (DD-027) ─────────────────────────────────────────────

export interface WorkspaceConfig {
  readonly version: number;
  readonly processLevelDefault: ProcessLevel | 'auto';
  readonly approvalMode: ApprovalMode;
  readonly autoApproveLowRisk: boolean;
  readonly reviewTimeoutMinutes: number;
  readonly autoRefreshContext: boolean;
}

// ─── Onboarding State ──────────────────────────────────────────────────────

export type ProjectType = 'greenfield' | 'brownfield';

export type OnboardingStatus = 'welcome' | 'setup-existing' | 'setup-new' | 'scanning' | 'ready';

// ─── Stage Execution ───────────────────────────────────────────────────────

export type ArtifactType = 'spec' | 'plan' | 'adr' | 'review' | 'report';

export type ArtifactStatus = 'draft' | 'pending-review' | 'approved' | 'rejected';

export interface Artifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly title: string;
  readonly path: string;
  readonly stage: LifecycleStage;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: ArtifactStatus;
  readonly content?: string;
}

// ─── Artifact Manifest (Phase 2: PDF xref pattern) ─────────────────────────

export interface ArtifactManifestEntry {
  readonly id: string;
  readonly type: ArtifactType;
  readonly title: string;
  readonly filename: string;
  readonly stage: LifecycleStage;
  readonly status: ArtifactStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ArtifactManifest {
  readonly version: number;
  readonly artifacts: readonly ArtifactManifestEntry[];
}

export interface StageAction {
  readonly stage: LifecycleStage;
  readonly description: string;
  readonly skills: readonly SkillId[];
  readonly requiredArtifacts: readonly ArtifactType[];
  readonly requiredGates: readonly string[];
  readonly autoAdvance: boolean;
}

export interface StageExecutionResult {
  readonly stage: LifecycleStage;
  readonly status: 'completed' | 'blocked' | 'needs-input';
  readonly artifacts: readonly Artifact[];
  readonly pendingGates: readonly string[];
  readonly pendingApprovals: readonly string[];
  readonly message: string;
}

export type GateEvaluationResult = {
  readonly gateId: string;
  readonly passed: boolean;
  readonly details: string;
};

// ─── File I/O Interface (for testability — DD-008) ─────────────────────────

export interface FileIO {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  append(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  readDir(path: string): Promise<readonly string[]>;
}
