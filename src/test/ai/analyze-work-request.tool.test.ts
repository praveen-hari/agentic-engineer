import { describe, it, expect } from 'vitest';
import { AnalyzeWorkRequestTool } from '../../ai/tools/analyze-work-request.tool';
import { AiRiskAnalyzer } from '../../ai/risk-analyzer';
import { RiskEngine } from '../../core/risk-engine';
import { SkillEngine } from '../../core/skill-engine';
import { SkillRegistry } from '../../core/skill-registry';
import { WorkflowGenerator } from '../../core/workflow-generator';
import type { ModelAccess } from '../../ai/model-access';

describe('AnalyzeWorkRequestTool', () => {
  const riskEngine = new RiskEngine();
  const registry = new SkillRegistry();
  const skillEngine = new SkillEngine(registry);
  const workflowGenerator = new WorkflowGenerator(skillEngine);

  const nullModelAccess: ModelAccess = {
    async getModel() {
      return null;
    },
    async sendRequest() {
      return '';
    },
  };

  const analyzer = new AiRiskAnalyzer(riskEngine, nullModelAccess);
  const tool = new AnalyzeWorkRequestTool(analyzer, workflowGenerator);

  describe('prepareInvocation', () => {
    it('returns confirmation message with objective', () => {
      const result = tool.prepareInvocation({ objective: 'Add login page' });
      expect(result.confirmationTitle).toBe('Analyze Work Request');
      expect(result.confirmationMessage).toContain('Add login page');
    });

    it('truncates long objectives in invocation message', () => {
      const longObjective = 'This is a very long objective that should be truncated '.repeat(3);
      const result = tool.prepareInvocation({ objective: longObjective });
      expect(result.invocationMessage).toContain('...');
      expect(result.invocationMessage.length).toBeLessThan(100);
    });
  });

  describe('invoke', () => {
    it('returns risk assessment with work type', async () => {
      const result = await tool.invoke({ objective: 'Fix typo in README' });
      expect(result.workType).toBe('bugfix');
      expect(result.processLevel).toBe('light');
      expect(result.source).toBe('deterministic');
    });

    it('returns recommended stages from workflow', async () => {
      const result = await tool.invoke({ objective: 'Fix typo in README' });
      expect(result.recommendedStages.length).toBeGreaterThan(0);
    });

    it('returns quality gates from workflow', async () => {
      const result = await tool.invoke({ objective: 'Add feature with API' });
      expect(result.qualityGates).toBeDefined();
    });

    it('returns high risk for auth-related objective', async () => {
      const result = await tool.invoke({ objective: 'Add OAuth login flow' });
      expect(result.riskLevel).toBe('high');
    });
  });
});
