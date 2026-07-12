import type { LifecycleStage, SkillCategory, SkillDefinition, SkillId, WorkType } from './types';

/**
 * Static catalog of all 24 engineering skills (DD-007, DD-010).
 *
 * This is the "phone book" of skills — it maps skill IDs to their
 * metadata (name, label, category, activation rules, gate type).
 * The Skill Engine (Task 7b) uses this registry to look up skills
 * and decide which to activate.
 *
 * Skills are invisible to the user (DD-007) — they activate automatically
 * based on task type, context, and process level. The `label` field is
 * used only in advanced/debug views.
 */
export class SkillRegistry {
  private readonly skills: readonly SkillDefinition[] = SKILL_DEFINITIONS;

  /** Returns all 24 skills. */
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
// Categories per SPEC §5:
//   always        — 3 background policies, always active
//   by-task-type  — 7 skills activated by work type (feature, bugfix, etc.)
//   by-context    — 7 skills activated by workspace context signals
//   interactive   — 4 skills requiring user interaction
//   quality-gate  — 3 skills that block stage progression
//   specialist    — 4 agent-powered review panels
//
// Some skills appear in multiple categories (e.g., spec-driven-development
// is both by-task-type and interactive). The primary category is listed.

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

  // ─── By Task Type (7) ───────────────────────────────────────────────
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
    id: 'source-driven-development',
    name: 'Source-Driven Development',
    label: 'Source-Driven Dev',
    category: 'by-task-type',
    description:
      'Grounds implementation decisions in official documentation — authoritative, source-cited code.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['feature', 'infrastructure'],
      stages: ['build'],
      minProcessLevel: 'standard',
    },
  },
  {
    id: 'doubt-driven-development',
    name: 'Doubt-Driven Development',
    label: 'Doubt-Driven Dev',
    category: 'by-task-type',
    description:
      'Subjects non-trivial decisions to adversarial review — fresh-context verification before standing.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['feature', 'security', 'infrastructure'],
      stages: ['build', 'review'],
      minProcessLevel: 'thorough',
    },
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
    id: 'deprecation-and-migration',
    name: 'Deprecation & Migration',
    label: 'Migration',
    category: 'by-task-type',
    description:
      'Manages deprecation and migration — sunsetting old systems, migrating users, maintaining backward compat.',
    activation: {
      mode: 'by-task-type',
      workTypes: ['refactor', 'infrastructure'],
      stages: ['plan', 'build', 'ship'],
      minProcessLevel: 'thorough',
    },
  },

  // ─── By Context (7) ─────────────────────────────────────────────────
  {
    id: 'frontend-ui-engineering',
    name: 'Frontend UI Engineering',
    label: 'Frontend UI',
    category: 'by-context',
    description:
      'Builds production-quality, accessible, responsive UIs — WCAG compliance, component architecture.',
    activation: {
      mode: 'by-context',
      contextSignals: ['touches_ui'],
      stages: ['build', 'verify'],
    },
  },
  {
    id: 'api-and-interface-design',
    name: 'API & Interface Design',
    label: 'API Design',
    category: 'by-context',
    description:
      'Guides stable API and interface design — REST/GraphQL endpoints, module boundaries, type contracts.',
    activation: {
      mode: 'by-context',
      contextSignals: ['touches_api'],
      stages: ['define', 'build'],
    },
  },
  {
    id: 'browser-testing-with-devtools',
    name: 'Browser Testing with DevTools',
    label: 'Browser Testing',
    category: 'by-context',
    description:
      'Tests in real browsers via Chrome DevTools — DOM inspection, console errors, network, performance.',
    activation: {
      mode: 'by-context',
      contextSignals: ['touches_ui'],
      stages: ['verify'],
    },
  },
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
  {
    id: 'performance-optimization',
    name: 'Performance Optimization',
    label: 'Performance',
    category: 'by-context',
    description:
      'Optimizes performance — Core Web Vitals, N+1 queries, profiling, bundle size, rendering.',
    activation: {
      mode: 'by-context',
      contextSignals: ['performance_sensitive', 'touches_ui'],
      stages: ['verify', 'review'],
      minProcessLevel: 'standard',
    },
    gateType: 'conditional',
  },
  {
    id: 'observability-and-instrumentation',
    name: 'Observability & Instrumentation',
    label: 'Observability',
    category: 'by-context',
    description:
      'Instruments code for production visibility — logging, metrics, tracing, alerting.',
    activation: {
      mode: 'by-context',
      contextSignals: ['touches_external_services', 'touches_api'],
      stages: ['build', 'ship'],
      minProcessLevel: 'standard',
    },
  },
  {
    id: 'ci-cd-and-automation',
    name: 'CI/CD & Automation',
    label: 'CI/CD',
    category: 'by-context',
    description:
      'Automates CI/CD pipelines — build, test, deploy, quality gates, deployment strategies.',
    activation: {
      mode: 'by-context',
      contextSignals: ['high_risk_decision'],
      workTypes: ['infrastructure'],
      stages: ['ship'],
      minProcessLevel: 'standard',
    },
  },

  // ─── Interactive (4) ────────────────────────────────────────────────
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
  {
    id: 'idea-refine',
    name: 'Idea Refine',
    label: 'Idea Refinement',
    category: 'interactive',
    description:
      'Refines raw ideas into sharp, actionable concepts through structured divergent and convergent thinking.',
    activation: {
      mode: 'interactive',
      stages: ['define'],
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

  // ─── Quality Gate (3) ───────────────────────────────────────────────
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
    id: 'code-simplification',
    name: 'Code Simplification',
    label: 'Code Simplification',
    category: 'quality-gate',
    description:
      'Simplifies code for clarity — removes unnecessary complexity, improves readability without behavior change.',
    activation: {
      mode: 'quality-gate',
      stages: ['review'],
      minProcessLevel: 'standard',
    },
    gateType: 'conditional',
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

  // ─── Specialist Agents (4) ──────────────────────────────────────────
  {
    id: 'using-agent-skills',
    name: 'Using Agent Skills',
    label: 'Skill Discovery',
    category: 'always',
    description:
      'Discovers and invokes agent skills — meta-skill that governs how all other skills are found and activated.',
    activation: {
      mode: 'always',
      stages: ['define', 'plan'],
    },
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    label: 'Code Reviewer',
    category: 'specialist',
    description:
      'Senior code reviewer evaluating changes across five dimensions — correctness, readability, architecture, security, performance.',
    activation: {
      mode: 'quality-gate',
      stages: ['review'],
      minProcessLevel: 'standard',
    },
    gateType: 'hard',
  },
  {
    id: 'security-auditor',
    name: 'Security Auditor',
    label: 'Security Auditor',
    category: 'specialist',
    description:
      'Security engineer focused on vulnerability detection, threat modeling, and secure coding practices.',
    activation: {
      mode: 'by-context',
      contextSignals: ['touches_auth_or_input', 'high_risk_decision'],
      stages: ['review'],
      minProcessLevel: 'thorough',
    },
    gateType: 'conditional',
  },
  {
    id: 'test-engineer',
    name: 'Test Engineer',
    label: 'Test Engineer',
    category: 'specialist',
    description: 'QA engineer specialized in test strategy, test writing, and coverage analysis.',
    activation: {
      mode: 'quality-gate',
      stages: ['verify'],
      minProcessLevel: 'standard',
    },
    gateType: 'hard',
  },
  {
    id: 'web-performance-auditor',
    name: 'Web Performance Auditor',
    label: 'Performance Auditor',
    category: 'specialist',
    description:
      'Web performance engineer focused on Core Web Vitals, loading, rendering, and network optimization.',
    activation: {
      mode: 'by-context',
      contextSignals: ['performance_sensitive', 'touches_ui'],
      stages: ['verify', 'review'],
      minProcessLevel: 'thorough',
    },
    gateType: 'conditional',
  },
];
