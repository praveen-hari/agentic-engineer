import type { ContextSignal, ProjectContext } from './types';

/**
 * Detects workspace context signals that drive skill activation
 * and risk assessment (DD-014).
 *
 * Analyzes the {@link ProjectContext} (frameworks, conventions, languages)
 * and optionally the objective text to detect signals like `touches_ui`,
 * `touches_api`, `touches_auth_or_input`, etc.
 *
 * These signals feed into the Skill Engine (Task 7b) and Risk Engine
 * (Task 5) to determine which skills to activate and what process level
 * to recommend.
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 */
export class ContextSignalDetector {
  /**
   * Detect context signals from a project context.
   * Optionally also analyzes objective text for additional signals.
   *
   * @param context The project context from ProjectDetector
   * @param objective Optional objective text to analyze for additional signals
   * @returns Array of detected context signals (additive — no duplicates)
   */
  detect(context: ProjectContext, objective?: string): ContextSignal[] {
    const signals = new Set<ContextSignal>();

    // ─── From Project Context ────────────────────────────────────────

    const frameworks = context.frameworks;
    const conventions = context.conventions;

    // touches_ui: frontend frameworks
    const uiFrameworks = ['React', 'Angular', 'Vue', 'Svelte', 'Blazor', '.NET MAUI', 'Next.js'];
    if (frameworks.some((f) => uiFrameworks.includes(f))) {
      signals.add('touches_ui');
    }

    // touches_api: backend frameworks
    const apiFrameworks = ['Express', 'ASP.NET Core', 'NestJS'];
    if (frameworks.some((f) => apiFrameworks.includes(f))) {
      signals.add('touches_api');
    }

    // touches_auth_or_input: auth-related conventions or frameworks with Identity
    const authConventions = ['auth-middleware', 'authentication', 'auth', 'login', 'session'];
    if (conventions.some((c) => authConventions.some((a) => c.toLowerCase().includes(a)))) {
      signals.add('touches_auth_or_input');
    }
    // ASP.NET Core typically includes Identity/auth
    if (frameworks.includes('ASP.NET Core')) {
      signals.add('touches_auth_or_input');
    }

    // touches_external_services: external service indicators
    const externalConventions = [
      'webhook-handler',
      'webhook',
      'integration',
      'external-service',
      'stripe',
      'sendgrid',
      'aws-sdk',
    ];
    if (conventions.some((c) => externalConventions.some((e) => c.toLowerCase().includes(e)))) {
      signals.add('touches_external_services');
    }
    // NestJS often integrates with external services
    if (frameworks.includes('NestJS')) {
      signals.add('touches_external_services');
    }

    // performance_sensitive: performance conventions or public-facing web
    const perfConventions = ['performance-budget', 'lighthouse', 'performance', 'web-vitals'];
    if (conventions.some((c) => perfConventions.some((p) => c.toLowerCase().includes(p)))) {
      signals.add('performance_sensitive');
    }
    // Next.js is public-facing → performance-sensitive
    if (frameworks.includes('Next.js')) {
      signals.add('performance_sensitive');
    }

    // high_risk_decision: database, migration, architecture conventions
    const highRiskConventions = [
      'database-migration',
      'migration',
      'schema-change',
      'breaking-change',
      'architecture',
    ];
    if (conventions.some((c) => highRiskConventions.some((h) => c.toLowerCase().includes(h)))) {
      signals.add('high_risk_decision');
    }
    // .NET MAUI (mobile) = high risk
    if (frameworks.includes('.NET MAUI')) {
      signals.add('high_risk_decision');
    }

    // ─── From Objective Text ─────────────────────────────────────────

    if (objective) {
      const text = objective.toLowerCase();

      // touches_ui from objective
      if (
        /\bui|page|component|button|form|dashboard|layout|css|style|frontend|screen\b/i.test(text)
      ) {
        signals.add('touches_ui');
      }

      // touches_api from objective
      if (/\bapi|endpoint|rest|graphql|route|controller|handler\b/i.test(text)) {
        signals.add('touches_api');
      }

      // touches_auth_or_input from objective
      if (/\bauth|login|password|input|form|validation|session\b/i.test(text)) {
        signals.add('touches_auth_or_input');
      }

      // touches_external_services from objective
      if (
        /\bintegrate|integration|stripe|sendgrid|aws|webhook|third.?party|external\b/i.test(text)
      ) {
        signals.add('touches_external_services');
      }

      // performance_sensitive from objective
      if (/\bperformance|latency|optimi[sz]e|cache|speed|fast\b/i.test(text)) {
        signals.add('performance_sensitive');
      }

      // high_risk_decision from objective
      if (/\bmigrate|migration|architecture|breaking|schema|deploy\b/i.test(text)) {
        signals.add('high_risk_decision');
      }
    }

    return Array.from(signals);
  }
}
