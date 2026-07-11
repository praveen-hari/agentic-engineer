import type { ContextSignal, ProjectContext } from './types';
import { SkillPackCatalog } from './skill-pack-catalog';
import type { SkillPack } from './skill-pack-catalog';

/**
 * A recommendation for the Capabilities view (DD-024, DD-025, DD-026).
 */
export interface Recommendation {
  readonly type: 'skill-pack' | 'instruction';
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly action: string;
  readonly category: 'recommended';
  readonly packId?: string;
}

/**
 * Recommendation engine for the Capabilities view (DD-024, DD-025).
 *
 * Given a {@link ProjectContext} and detected {@link ContextSignal}s,
 * generates context-aware recommendations for what the user should add —
 * Syncfusion skill packs, custom instructions, security conventions,
 * testing standards, etc.
 *
 * Each recommendation includes a human-readable "Why" explanation tied
 * to what was detected in the project.
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 */
export class CapabilityRecommender {
  constructor(private readonly catalog: SkillPackCatalog = new SkillPackCatalog()) {}

  /**
   * Generate context-aware recommendations.
   *
   * @param context The project context from ProjectDetector
   * @param signals The context signals from ContextSignalDetector
   * @returns Array of recommendations, each with a "Why" explanation
   */
  recommend(context: ProjectContext, signals: readonly ContextSignal[]): Recommendation[] {
    const recs: Recommendation[] = [];

    // ─── Skill Pack Recommendations (from detected frameworks) ───────

    const frameworkToPack: Readonly<Record<string, string>> = {
      React: 'react-ui-components',
      Angular: 'angular-ui-components',
      Blazor: 'blazor-ui-components',
      Vue: 'vue-ui-components',
      'ASP.NET Core': 'aspnet-core-ui-components',
      '.NET MAUI': 'maui-ui-components',
    };

    for (const framework of context.frameworks) {
      const packId = frameworkToPack[framework];
      if (packId) {
        const pack = this.catalog.getById(packId);
        if (pack) {
          recs.push(this.makePackRecommendation(pack, framework));
        }
      }
    }

    // ─── Instruction Recommendations (from context signals) ─────────

    // No test framework → recommend Testing Standards
    if (!context.testFramework) {
      recs.push({
        type: 'instruction',
        title: 'Testing Standards',
        description: 'Define testing conventions, coverage thresholds, and test structure rules for the project.',
        reason: 'No test framework detected — establish testing standards before writing code.',
        action: 'Create .codestudio/instructions/testing-standards.md',
        category: 'recommended',
      });
    }

    // touches_auth_or_input → recommend Security Hardening
    if (signals.includes('touches_auth_or_input')) {
      recs.push({
        type: 'instruction',
        title: 'Security Hardening Conventions',
        description: 'Define input validation, auth/session handling, and secure coding rules.',
        reason: 'Project touches authentication or user input — security conventions are critical.',
        action: 'Create .codestudio/instructions/security-hardening.md',
        category: 'recommended',
      });
    }

    // touches_api → recommend API Conventions
    if (signals.includes('touches_api')) {
      recs.push({
        type: 'instruction',
        title: 'API Design Conventions',
        description: 'Define REST/GraphQL endpoint naming, versioning, error handling, and response format rules.',
        reason: 'Project has API endpoints — establish consistent API conventions.',
        action: 'Create .codestudio/instructions/api-conventions.md',
        category: 'recommended',
      });
    }

    // touches_external_services → recommend Integration Standards
    if (signals.includes('touches_external_services')) {
      recs.push({
        type: 'instruction',
        title: 'Integration Standards',
        description: 'Define external service integration patterns, retry logic, error handling, and observability rules.',
        reason: 'Project integrates with external services — establish integration standards.',
        action: 'Create .codestudio/instructions/integration-standards.md',
        category: 'recommended',
      });
    }

    // performance_sensitive → recommend Performance Budget
    if (signals.includes('performance_sensitive')) {
      recs.push({
        type: 'instruction',
        title: 'Performance Budget',
        description: 'Define performance budgets, Core Web Vitals targets, and optimization rules.',
        reason: 'Project is performance-sensitive — establish performance budgets early.',
        action: 'Create .codestudio/instructions/performance-budget.md',
        category: 'recommended',
      });
    }

    return recs;
  }

  private makePackRecommendation(pack: SkillPack, framework: string): Recommendation {
    return {
      type: 'skill-pack',
      title: pack.name,
      description: `${pack.skillCount}+ skills for ${pack.platform} — ${pack.representativeComponents.slice(0, 3).join(', ')}, and more.`,
      reason: `${framework} detected in project — install the ${pack.name} pack for component-level agent skills.`,
      action: `npx skills add ${pack.repo} -y`,
      category: 'recommended',
      packId: pack.id,
    };
  }
}
