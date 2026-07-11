import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AiRiskAnalyzer } from '../../ai/risk-analyzer';
import { RiskEngine } from '../../core/risk-engine';
import type { RiskAssessment } from '../../core/types';

describe('AiRiskAnalyzer', () => {
  const deterministicEngine = new RiskEngine();

  describe('fallback (no LLM available)', () => {
    it('falls back to deterministic engine when model is unavailable', async () => {
      const analyzer = new AiRiskAnalyzer(deterministicEngine, {
        async getModel() {
          return null;
        },
        async sendRequest() {
          return '';
        },
      });

      const result = await analyzer.analyze('Fix typo in README');

      expect(result.source).toBe('deterministic');
      expect(result.workType).toBe('bugfix');
      expect(result.processLevel).toBe('light');
    });

    it('falls back to deterministic engine when LLM throws', async () => {
      const analyzer = new AiRiskAnalyzer(deterministicEngine, {
        async getModel() {
          throw new Error('Model access failed');
        },
        async sendRequest() {
          return '';
        },
      });

      const result = await analyzer.analyze('Add login page');

      expect(result.source).toBe('deterministic');
    });
  });

  describe('LLM-enhanced analysis', () => {
    it('uses LLM result when available', async () => {
      const llmResult: RiskAssessment = {
        workType: 'feature',
        complexity: 'complex',
        riskLevel: 'high',
        processLevel: 'thorough',
        signals: [{ type: 'keyword', signal: 'auth', severity: 'high', impact: 'security gate' }],
        contextSignals: ['touches_auth_or_input'],
        source: 'llm',
      };

      const analyzer = new AiRiskAnalyzer(deterministicEngine, {
        async getModel() {
          return { id: 'copilot-gpt-4', name: 'GitHub Copilot' };
        },
        async sendRequest(_model, messages) {
          const lastMessage = messages[messages.length - 1];
          if (lastMessage && typeof lastMessage === 'object' && 'text' in (lastMessage as object)) {
            // Simulate LLM returning a structured response
          }
          return JSON.stringify(llmResult);
        },
      });

      const result = await analyzer.analyze('Add OAuth login with SAML SSO');

      expect(result.source).toBe('llm');
      expect(result.workType).toBe('feature');
      expect(result.processLevel).toBe('thorough');
    });

    it('falls back to deterministic when LLM returns invalid JSON', async () => {
      const analyzer = new AiRiskAnalyzer(deterministicEngine, {
        async getModel() {
          return { id: 'copilot-gpt-4', name: 'GitHub Copilot' };
        },
        async sendRequest() {
          return 'this is not valid JSON';
        },
      });

      const result = await analyzer.analyze('Fix typo in README');

      expect(result.source).toBe('deterministic');
    });

    it('falls back to deterministic when LLM returns incomplete assessment', async () => {
      const analyzer = new AiRiskAnalyzer(deterministicEngine, {
        async getModel() {
          return { id: 'copilot-gpt-4', name: 'GitHub Copilot' };
        },
        async sendRequest() {
          return JSON.stringify({ workType: 'feature' }); // missing fields
        },
      });

      const result = await analyzer.analyze('Add feature');

      expect(result.source).toBe('deterministic');
    });
  });

  describe('caching', () => {
    it('caches model selection across calls', async () => {
      let getModelCalls = 0;
      const analyzer = new AiRiskAnalyzer(deterministicEngine, {
        async getModel() {
          getModelCalls++;
          return null;
        },
        async sendRequest() {
          return '';
        },
      });

      await analyzer.analyze('Fix typo');
      await analyzer.analyze('Add feature');

      // Model should only be fetched once (cached)
      expect(getModelCalls).toBe(1);
    });
  });
});
