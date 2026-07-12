import type { LifecycleStage, SkillCategory, SkillDefinition, SkillId, WorkType } from './types';

/**
 * Static catalog of the 12 bundled engineering skills (DD-007, DD-010).
 *
 * Only skills that have a SKILL.md file in the skills/ directory are
 * registered here. The agent can only load skills that are bundled —
 * referencing unbundled skills would cause the agent to hallucinate
 * their content.
 *
 * The Skill Engine uses this registry to look up skills and decide
 * which to activate. Skills are invisible to the user (DD-007) —
 * they activate automatically based on task type, context, and
 * process level.
 */
export class SkillRegistry {
  private readonly skills: readonly SkillDefinition[] = SKILL_DEFINITIONS;

  /** Returns all bundled skills. */
  getAll(): readonly SkillDefinition[] {
    return this.skills;
  }

  /** Returns a skill by its ID, or undefined if not found. */
  getById(id: SkillId): SkillDefinition | undefined {
    return this.skills.find((s) => s.id === id);
  }

  /** Returns all skills in a given category. */
  getByCategory(category: SkillCategory): readonly SkillDefinition[] {
    return this.skills.filter((s) => s.category === category);
  }

  /** Returns all skills active during a given lifecycle stage. */
  getByStage(stage: LifecycleStage): readonly SkillDefinition[] {
    return this.skills.filter((s) => s.activation.stages?.includes(stage) ?? false);
  }

  /** Returns all skills triggered by a given work type. */
  getByTaskType(workType: WorkType): readonly SkillDefinition[] {
    return this.skills.filter((s) => s.activation.workTypes?.includes(workType) ?? false);
  }
}

// ─── Skill Definitions ────────────────────────────────────────────────────
//
// Only the 12 skills that have a bundled SKILL.md file in skills/.
// Categories:
//   always        — 3 background policies, always active
//   by-task-type  — 5 skills activated by work type
//   by-context    — 1 skill activated by context signals
//   interactive   — 1 skill requiring user interaction
//   quality-gate  — 2 skills that block stage progression

const SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  // ─── Always Active (3) ──────────────────────────────────────────────
  {
    id: 'context-engineering',
    name: 'Context Engineering',
    label: 'Context Engineering',
    category: 'always',
    description:
      'Optimizes agent context setup — rules files, context configuration, and project context for AI sessions.',
    activation: {
      mode: 'always',
      stages: ['define', 'plan', 'build'],
    },
  },
  {
    id: 'git-workflow-and-versioning',
    name: 'Git Workflow & Versioning',
    label: 'Git Workflow',
    category: 'always',
    description:
      'Structures git workflow practices — branching, committing, semantic versioning, changelogs.',
    activation: {
      mode: 'always',
      stages: ['build', 'review', 'ship'],
    },
  },
  {
    id: 'incremental-implementation',
    name: 'Incremental Implementation',
    label: 'Incremental Delivery',
    category: 'always',
    description:
      'Delivers changes incrementally — vertical slices, small PRs, progressive complexity.',
    activation: {
      mode: 'always',
      stages: ['plan', 'build'],
    },
  },

  // ─── By Task Type (5) ───────────────────────────────────────────────
  {
    id: 'spec-driven-development',
    name: 'Spec-Driven Development',
    label: 'Spec-Driven Dev',
    category: 'by-task-type',
    description:
      'Creates specs before coding — requirements, scenarios, and acceptance criteria before implementation.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['feature', 'refactor', 'infrastructure'],
      stages: ['define', 'plan'],
      minProcessLevel: 'standard',
    },
  },
  {
    id: 'planning-and-task-breakdown',
    name: 'Planning & Task Breakdown',
    label: 'Planning',
    category: 'by-task-type',
    description:
      'Breaks work into ordered tasks — scope estimation, dependency analysis, parallel work identification.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['feature', 'refactor', 'infrastructure'],
      stages: ['plan'],
      minProcessLevel: 'standard',
    },
  },
  {
    id: 'test-driven-development',
    name: 'Test-Driven Development',
    label: 'TDD',
    category: 'by-task-type',
    description:
      'Drives development with tests — RED/GREEN/REFACTOR cycle, test pyramid, prove-it pattern for bugs.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['feature', 'bugfix', 'refactor', 'security'],
      stages: ['build', 'verify'],
      minProcessLevel: 'standard',
    },
    gateType: 'hard',
  },
  {
    id: 'debugging-and-error-recovery',
    name: 'Debugging & Error Recovery',
    label: 'Debugging',
    category: 'by-task-type',
    description:
      'Systematic root-cause debugging — hypothesis testing, binary search, error isolation.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['bugfix', 'security'],
      stages: ['build', 'verify'],
    },
  },
  {
    id: 'documentation-and-adrs',
    name: 'Documentation & ADRs',
    label: 'Documentation',
    category: 'by-task-type',
    description:
      'Records decisions and documentation — ADRs, architectural context, API docs, changelogs.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['feature', 'refactor', 'documentation', 'infrastructure'],
      stages: ['define', 'review', 'ship'],
      minProcessLevel: 'standard',
    },
  },

  // ─── By Context (1) ─────────────────────────────────────────────────
  {
    id: 'security-and-hardening',
    name: 'Security & Hardening',
    label: 'Security Hardening',
    category: 'by-context',
    description:
      'Hardens code against vulnerabilities — input validation, auth, data storage, third-party integration.',
    activation: {
      mode: 'by-context',
      contextSignals: ['touches_auth_or_input', 'touches_external_services', 'high_risk_decision'],
      stages: ['build', 'verify', 'review'],
      minProcessLevel: 'standard',
    },
    gateType: 'conditional',
  },

  // ─── Interactive (1) ────────────────────────────────────────────────
  {
    id: 'interview-me',
    name: 'Interview Me',
    label: 'Requirements Interview',
    category: 'interactive',
    description:
      'Extracts actual user intent through one-question-at-a-time interview until ~95% confidence.',
    activation: {
      mode: 'interactive',
      stages: ['define'],
    },
  },

  // ─── Quality Gate (2) ───────────────────────────────────────────────
  {
    id: 'code-review-and-quality',
    name: 'Code Review & Quality',
    label: 'Code Review',
    category: 'quality-gate',
    description:
      'Multi-axis code review — correctness, readability, architecture, security, performance before merge.',
    activation: {
      mode: 'quality-gate',
      stages: ['review'],
      minProcessLevel: 'standard',
    },
    gateType: 'hard',
  },
  {
    id: 'shipping-and-launch',
    name: 'Shipping & Launch',
    label: 'Shipping',
    category: 'quality-gate',
    description:
      'Prepares production launches — pre-launch checklist, monitoring, staged rollout, rollback strategy.',
    activation: {
      mode: 'quality-gate',
      stages: ['ship'],
      minProcessLevel: 'thorough',
    },
    gateType: 'hard',
  },
];
