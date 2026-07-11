import type {
  Complexity,
  ContextSignal,
  ProcessLevel,
  ProjectContext,
  RiskAssessment,
  RiskLevel,
  RiskSignal,
  WorkType,
} from './types';

/**
 * Deterministic risk assessment engine (DD-001, DD-014 Step 1).
 *
 * Analyzes objective text for risk signals (auth, payment, database,
 * security keywords), detects work type, estimates complexity, and
 * maps to a process level. This is the fallback that works without
 * any LLM — the LLM-enhanced version is a V2 feature.
 */
export class RiskEngine {
  /**
   * Assess a work request objective and return a risk assessment.
   *
   * @param objective The work request text to analyze
   * @param _context Optional project context (unused in deterministic v1)
   */
  assess(objective: string, _context?: ProjectContext): RiskAssessment {
    const text = objective.toLowerCase();

    const workType = this.detectWorkType(text);
    const signals = this.detectRiskSignals(text);
    const contextSignals = this.detectContextSignals(text);
    const complexity = this.estimateComplexity(objective, signals);
    const riskLevel = this.determineRiskLevel(signals, contextSignals);
    const processLevel = this.mapToProcessLevel(workType, complexity, riskLevel, signals);

    return {
      workType,
      complexity,
      riskLevel,
      processLevel,
      signals,
      contextSignals,
      source: 'deterministic',
    };
  }

  // ─── Work Type Detection ───────────────────────────────────────────────

  private detectWorkType(text: string): WorkType {
    const patterns: ReadonlyArray<readonly [WorkType, readonly RegExp[]]> = [
      ['security', [/security|cve|vulnerability|xss|csrf|injection|exploit|patch.*cve/i]],
      ['bugfix', [/fix|bug|crash|error|broken|issue|defect|regression/i]],
      ['refactor', [/refactor|restructure|clean up|simplify|extract|decouple/i]],
      ['infrastructure', [/ci\/?cd|docker|kubernetes|deploy|pipeline|terraform|infra/i]],
      ['documentation', [/document|docs?|readme|changelog|wiki|guide/i]],
      ['feature', [/add|create|implement|build|new|support|enable|integrate/i]],
    ];

    for (const [type, regexes] of patterns) {
      if (regexes.some((r) => r.test(text))) {
        return type;
      }
    }
    return 'feature';
  }

  // ─── Risk Signal Detection ────────────────────────────────────────────

  private detectRiskSignals(text: string): RiskSignal[] {
    const signals: RiskSignal[] = [];

    const highRiskPatterns: ReadonlyArray<readonly [string, RegExp]> = [
      ['auth', /auth|oauth|login|password|session|jwt|token|sso|mfa/i],
      ['payment', /payment|stripe|billing|checkout|transaction|credit\s*card|paypal/i],
      ['database migration', /migrate|migration|schema\s*change|alter\s*table/i],
      ['security vulnerability', /security|vulnerability|xss|csrf|sql\s*injection|exploit|cve/i],
      ['deployment', /deploy|production|release|rollback|zero\s*downtime/i],
      ['data deletion', /delete|drop|truncate|remove\s*all|purge/i],
    ];

    const mediumRiskPatterns: ReadonlyArray<readonly [string, RegExp]> = [
      ['external dependency', /install|add\s*dependency|new\s*package|npm\s*install|yarn\s*add/i],
      ['external service', /api|webhook|integration|third.?party|external\s*service/i],
      ['multi-file change', /multiple\s*files|across\s*modules|entire\s*system|all\s*components/i],
    ];

    for (const [signal, pattern] of highRiskPatterns) {
      if (pattern.test(text)) {
        signals.push({
          type: 'keyword',
          signal,
          severity: 'high',
          impact: this.signalImpact(signal),
        });
      }
    }

    for (const [signal, pattern] of mediumRiskPatterns) {
      if (pattern.test(text)) {
        signals.push({
          type: 'keyword',
          signal,
          severity: 'medium',
          impact: this.signalImpact(signal),
        });
      }
    }

    return signals;
  }

  private signalImpact(signal: string): string {
    const impacts: Readonly<Record<string, string>> = {
      auth: 'security-review gate + security-and-hardening skill',
      payment: 'security-review gate + security-and-hardening skill',
      'database migration': 'rollback-tested + data-integrity gates',
      'security vulnerability': 'security-review gate + security-and-hardening skill',
      deployment: 'rollback-tested gate + shipping-and-launch skill',
      'data deletion': 'data-integrity gate + restricted approval',
      'external dependency': 'dependency-audit gate + review approval',
      'external service': 'observability-and-instrumentation skill',
      'multi-file change': 'planning-and-task-breakdown skill',
    };
    return impacts[signal] ?? 'review gate added';
  }

  // ─── Context Signal Detection ─────────────────────────────────────────

  private detectContextSignals(text: string): ContextSignal[] {
    const signals: ContextSignal[] = [];

    if (
      /\bui|page|component|button|form|dashboard|layout|css|style|frontend|screen\b/i.test(text)
    ) {
      signals.push('touches_ui');
    }
    if (/\bapi|endpoint|rest|graphql|route|controller|handler\b/i.test(text)) {
      signals.push('touches_api');
    }
    if (/\bauth|login|password|input|form|validation|session\b/i.test(text)) {
      signals.push('touches_auth_or_input');
    }
    if (/\bintegrate|integration|third.?party|external|webhook|stripe|sendgrid|aws\b/i.test(text)) {
      signals.push('touches_external_services');
    }
    if (/\bperformance|latency|throughput|optimi[sz]e|cache|speed|fast\b/i.test(text)) {
      signals.push('performance_sensitive');
    }
    if (/\bmigrate|deploy|delete|production|rollback\b/i.test(text)) {
      signals.push('high_risk_decision');
    }

    return signals;
  }

  // ─── Complexity Estimation ────────────────────────────────────────────

  private estimateComplexity(objective: string, signals: readonly RiskSignal[]): Complexity {
    const wordCount = objective.trim().split(/\s+/).filter(Boolean).length;
    const signalCount = signals.length;

    if (wordCount <= 3 && signalCount === 0) return 'trivial';
    if (wordCount <= 6 && signalCount <= 1) return 'simple';
    if (wordCount <= 12 && signalCount <= 2) return 'moderate';
    if (wordCount <= 30 || signalCount <= 4) return 'complex';
    return 'critical';
  }

  // ─── Risk Level Determination ─────────────────────────────────────────

  private determineRiskLevel(
    signals: readonly RiskSignal[],
    contextSignals: readonly ContextSignal[],
  ): RiskLevel {
    const highCount = signals.filter((s) => s.severity === 'high').length;
    const mediumCount = signals.filter((s) => s.severity === 'medium').length;
    const highRiskContext = contextSignals.includes('high_risk_decision');

    // Any high-risk signal (auth, payment, migration, security, deployment, deletion)
    // is inherently high risk
    if (highCount >= 1) return 'high';
    if (mediumCount >= 1 || highRiskContext) return 'medium';
    return 'low';
  }

  // ─── Process Level Mapping (DD-001) ───────────────────────────────────

  private mapToProcessLevel(
    workType: WorkType,
    complexity: Complexity,
    riskLevel: RiskLevel,
    signals: readonly RiskSignal[],
  ): ProcessLevel {
    // Guarded: specific high-risk signals that mandate maximum rigor
    // (DD-001: DB migration, auth changes, deployment, data deletion)
    const guardedSignals = ['database migration', 'deployment', 'data deletion'];
    const hasGuardedSignal = signals.some(
      (s) => s.severity === 'high' && guardedSignals.includes(s.signal),
    );
    if (hasGuardedSignal) {
      return 'guarded';
    }

    // Guarded: high risk + critical complexity + infra/security/refactor
    if (
      riskLevel === 'high' &&
      complexity === 'critical' &&
      (workType === 'infrastructure' || workType === 'security' || workType === 'refactor')
    ) {
      return 'guarded';
    }

    // Thorough: high risk (auth, payment, security vulnerability)
    if (riskLevel === 'high') {
      return 'thorough';
    }

    // Light: documentation with no high-risk signals → always light
    if (workType === 'documentation') {
      return 'light';
    }

    // Standard: medium risk or moderate+ complexity
    if (riskLevel === 'medium' || complexity === 'moderate' || complexity === 'complex') {
      return 'standard';
    }

    // Light: low risk, trivial/simple complexity
    if (riskLevel === 'low' && (complexity === 'trivial' || complexity === 'simple')) {
      return 'light';
    }

    return 'standard';
  }
}
