import type { RiskEngine } from '../core/risk-engine';
import type { RiskAssessment } from '../core/types';
import type { ChatMessage, ModelAccess, ModelInfo } from './model-access';

/**
 * LLM-powered risk analyzer with deterministic fallback (DD-014).
 *
 * Uses the Language Model API for enriched risk assessment when an LLM
 * is available. Falls back to the deterministic {@link RiskEngine} when:
 *   - No model is available
 *   - The LLM request fails
 *   - The LLM returns invalid/incomplete JSON
 *
 * This is the "Layer 2" intelligence that sits on top of the deterministic
 * "Layer 1" engine. The deterministic engine is always the safety net.
 */
export class AiRiskAnalyzer {
  private cachedModel: ModelInfo | null | undefined = undefined;

  constructor(
    private readonly deterministicEngine: RiskEngine,
    private readonly modelAccess: ModelAccess,
  ) {}

  /**
   * Analyze a work request objective using LLM if available,
   * falling back to deterministic rules otherwise.
   *
   * @param objective The work request text to analyze
   * @param context Optional project context for richer analysis
   */
  async analyze(objective: string, context?: unknown): Promise<RiskAssessment> {
    const model = await this.getModel();

    if (!model) {
      return this.deterministicFallback(objective, context);
    }

    try {
      const response = await this.modelAccess.sendRequest(
        model,
        this.buildPrompt(objective, context),
      );

      const parsed = this.parseResponse(response);
      if (parsed) {
        return parsed;
      }

      // LLM returned invalid/incomplete response — fall back
      return this.deterministicFallback(objective, context);
    } catch {
      // LLM request failed — fall back
      return this.deterministicFallback(objective, context);
    }
  }

  /**
   * Get the cached model, or fetch and cache it.
   * Returns null if no model is available.
   */
  private async getModel(): Promise<ModelInfo | null> {
    if (this.cachedModel !== undefined) {
      return this.cachedModel;
    }
    try {
      this.cachedModel = await this.modelAccess.getModel();
    } catch {
      this.cachedModel = null;
    }
    return this.cachedModel;
  }

  /**
   * Build the prompt messages for the LLM.
   */
  private buildPrompt(objective: string, context?: unknown): ChatMessage[] {
    const systemPrompt = `You are an engineering risk assessment engine. Analyze the given work request and return a JSON object with these exact fields:
{
  "workType": "feature" | "bugfix" | "refactor" | "infrastructure" | "documentation" | "security",
  "complexity": "trivial" | "simple" | "moderate" | "complex" | "critical",
  "riskLevel": "low" | "medium" | "high",
  "processLevel": "light" | "standard" | "thorough" | "guarded",
  "signals": [{ "type": "keyword", "signal": "string", "severity": "low|medium|high", "impact": "string" }],
  "contextSignals": ["touches_ui" | "touches_api" | "touches_auth_or_input" | "touches_external_services" | "performance_sensitive" | "high_risk_decision"],
  "source": "llm"
}

Return ONLY the JSON object, no markdown, no explanation.`;

    const userPrompt = `Analyze this work request:\n\n${objective}${
      context ? `\n\nProject context: ${JSON.stringify(context)}` : ''
    }`;

    return [
      { role: 'system', text: systemPrompt },
      { role: 'user', text: userPrompt },
    ];
  }

  /**
   * Parse the LLM response into a RiskAssessment.
   * Returns null if the response is invalid or incomplete.
   */
  private parseResponse(response: string): RiskAssessment | null {
    try {
      // Strip markdown code fences if present
      const cleaned = response
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      const parsed = JSON.parse(cleaned) as Partial<RiskAssessment>;

      // Validate required fields
      if (
        !parsed.workType ||
        !parsed.complexity ||
        !parsed.riskLevel ||
        !parsed.processLevel ||
        !parsed.signals ||
        !parsed.contextSignals
      ) {
        return null;
      }

      return {
        workType: parsed.workType,
        complexity: parsed.complexity,
        riskLevel: parsed.riskLevel,
        processLevel: parsed.processLevel,
        signals: parsed.signals,
        contextSignals: parsed.contextSignals,
        source: 'llm',
      };
    } catch {
      return null;
    }
  }

  /**
   * Fall back to the deterministic engine.
   */
  private deterministicFallback(objective: string, context?: unknown): RiskAssessment {
    return this.deterministicEngine.assess(objective, context as never);
  }
}
