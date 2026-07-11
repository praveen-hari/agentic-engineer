import { describe, it, expect } from 'vitest';
import { RiskEngine } from '../../core/risk-engine';
import type { ProjectContext } from '../../core/types';

describe('RiskEngine', () => {
  const engine = new RiskEngine();

  const contextWithStack = (stack: string[]): ProjectContext => ({
    rootPath: '/project',
    detectedStack: stack,
    languages: [],
    frameworks: [],
    packageManager: 'npm',
    testFramework: 'vitest',
    conventions: [],
    generatedAt: '2026-07-11T10:00:00Z',
  });

  describe('work type detection', () => {
    it('detects "feature" from feature keywords', () => {
      const result = engine.assess('Add a new user profile page');
      expect(result.workType).toBe('feature');
    });

    it('detects "bugfix" from bug/fix keywords', () => {
      const result = engine.assess('Fix the login crash on Safari');
      expect(result.workType).toBe('bugfix');
    });

    it('detects "refactor" from refactor keywords', () => {
      const result = engine.assess('Refactor the payment module to use strategy pattern');
      expect(result.workType).toBe('refactor');
    });

    it('detects "infrastructure" from infra keywords', () => {
      const result = engine.assess('Update CI/CD pipeline and Docker configuration');
      expect(result.workType).toBe('infrastructure');
    });

    it('detects "documentation" from docs keywords', () => {
      const result = engine.assess('Update API documentation for v2 endpoints');
      expect(result.workType).toBe('documentation');
    });

    it('detects "security" from security keywords', () => {
      const result = engine.assess('Patch CVE-2024-1234 in the auth library');
      expect(result.workType).toBe('security');
    });

    it('defaults to "feature" when no keyword matches', () => {
      const result = engine.assess('Make the dashboard faster');
      expect(result.workType).toBe('feature');
    });
  });

  describe('risk signal detection', () => {
    it('detects authentication-related risk signals', () => {
      const result = engine.assess('Add OAuth login flow');
      expect(result.signals.some((s) => s.signal.includes('auth'))).toBe(true);
    });

    it('detects payment-related risk signals', () => {
      const result = engine.assess('Integrate Stripe payment processing');
      expect(result.signals.some((s) => s.signal.includes('payment'))).toBe(true);
    });

    it('detects database-related risk signals', () => {
      const result = engine.assess('Migrate user table schema');
      expect(result.signals.some((s) => s.signal.includes('database') || s.signal.includes('migration'))).toBe(true);
    });

    it('detects security-related risk signals', () => {
      const result = engine.assess('Fix XSS vulnerability in comment form');
      expect(result.signals.some((s) => s.signal.includes('security') || s.signal.includes('vulnerability'))).toBe(true);
    });

    it('detects deployment-related risk signals', () => {
      const result = engine.assess('Deploy to production with zero downtime');
      expect(result.signals.some((s) => s.signal.includes('deploy'))).toBe(true);
    });

    it('detects migration-related risk signals', () => {
      const result = engine.assess('Migrate from MySQL to PostgreSQL');
      expect(result.signals.some((s) => s.signal.includes('migrat'))).toBe(true);
    });

    it('returns no signals for a simple typo fix', () => {
      const result = engine.assess('Fix typo in README');
      expect(result.signals).toHaveLength(0);
    });
  });

  describe('process level mapping (DD-001)', () => {
    it('"Fix typo in README" → light process (low risk, trivial)', () => {
      const result = engine.assess('Fix typo in README');
      expect(result.processLevel).toBe('light');
      expect(result.riskLevel).toBe('low');
    });

    it('"Add login page" → standard+ process (auth = high risk)', () => {
      const result = engine.assess('Add login page with OAuth');
      expect(['standard', 'thorough', 'guarded']).toContain(result.processLevel);
      expect(result.riskLevel).toBe('high');
    });

    it('"Refactor payment module" → thorough process (payment + refactor)', () => {
      const result = engine.assess('Refactor the payment module');
      expect(['thorough', 'guarded']).toContain(result.processLevel);
      expect(result.riskLevel).toBe('high');
    });

    it('"Migrate MySQL to PostgreSQL" → guarded process (database migration)', () => {
      const result = engine.assess('Migrate MySQL to PostgreSQL');
      expect(result.processLevel).toBe('guarded');
      expect(result.riskLevel).toBe('high');
    });

    it('"Update API docs" → light process (documentation)', () => {
      const result = engine.assess('Update API documentation');
      expect(result.processLevel).toBe('light');
    });

    it('"Deploy to production" → guarded process (deployment risk)', () => {
      const result = engine.assess('Deploy to production');
      expect(result.processLevel).toBe('guarded');
    });

    it('multi-file feature → standard process', () => {
      const result = engine.assess('Add user profile feature with avatar upload and settings page');
      expect(['standard', 'thorough']).toContain(result.processLevel);
    });
  });

  describe('complexity estimation', () => {
    it('short objective → trivial or simple complexity', () => {
      const result = engine.assess('Fix typo');
      expect(['trivial', 'simple']).toContain(result.complexity);
    });

    it('long objective with multiple concerns → complex complexity', () => {
      const result = engine.assess(
        'Redesign the entire authentication system with OAuth, SSO, MFA, session management, and role-based access control',
      );
      expect(['complex', 'critical']).toContain(result.complexity);
    });
  });

  describe('source', () => {
    it('always returns source: "deterministic"', () => {
      const result = engine.assess('Anything');
      expect(result.source).toBe('deterministic');
    });
  });

  describe('context signals', () => {
    it('detects touches_ui from UI-related keywords', () => {
      const result = engine.assess('Add a new dashboard page with charts');
      expect(result.contextSignals).toContain('touches_ui');
    });

    it('detects touches_api from API-related keywords', () => {
      const result = engine.assess('Create a new REST API endpoint for user data');
      expect(result.contextSignals).toContain('touches_api');
    });

    it('detects touches_auth_or_input from auth keywords', () => {
      const result = engine.assess('Add login form with password validation');
      expect(result.contextSignals).toContain('touches_auth_or_input');
    });

    it('detects touches_external_services from integration keywords', () => {
      const result = engine.assess('Integrate with Stripe and SendGrid');
      expect(result.contextSignals).toContain('touches_external_services');
    });

    it('returns empty context signals for internal refactoring', () => {
      const result = engine.assess('Rename variable foo to bar');
      expect(result.contextSignals).toHaveLength(0);
    });
  });

  describe('with project context', () => {
    it('uses context to refine assessment', () => {
      const ctx = contextWithStack(['react', 'node']);
      const result = engine.assess('Add a new component', ctx);
      expect(result.workType).toBe('feature');
    });
  });

  describe('edge cases', () => {
    it('handles empty objective gracefully', () => {
      const result = engine.assess('');
      expect(result.workType).toBe('feature');
      expect(result.processLevel).toBe('light');
    });

    it('handles very long objective', () => {
      const long = 'Add '.repeat(100) + 'feature';
      const result = engine.assess(long);
      expect(result.complexity).not.toBe('trivial');
    });

    it('is case-insensitive', () => {
      const upper = engine.assess('FIX THE LOGIN BUG');
      const lower = engine.assess('fix the login bug');
      expect(upper.workType).toBe(lower.workType);
      expect(upper.riskLevel).toBe(lower.riskLevel);
    });
  });
});
