import { describe, it, expect } from 'vitest';
import { ContextSignalDetector } from '../../core/context-signal-detector';
import type { ProjectContext, ContextSignal } from '../../core/types';

describe('ContextSignalDetector', () => {
  const detector = new ContextSignalDetector();

  const makeContext = (overrides: Partial<ProjectContext> = {}): ProjectContext => ({
    rootPath: '/project',
    detectedStack: [],
    languages: ['TypeScript'],
    frameworks: [],
    packageManager: 'npm',
    testFramework: null,
    conventions: [],
    generatedAt: '2026-07-11T10:00:00Z',
    ...overrides,
  });

  describe('touches_ui', () => {
    it('detects touches_ui when React framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['React'] }));
      expect(signals).toContain('touches_ui');
    });

    it('detects touches_ui when Angular framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['Angular'] }));
      expect(signals).toContain('touches_ui');
    });

    it('detects touches_ui when Vue framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['Vue'] }));
      expect(signals).toContain('touches_ui');
    });

    it('detects touches_ui when Blazor framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['Blazor'] }));
      expect(signals).toContain('touches_ui');
    });

    it('detects touches_ui when .NET MAUI framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['.NET MAUI'] }));
      expect(signals).toContain('touches_ui');
    });

    it('does not detect touches_ui for backend-only frameworks', () => {
      const signals = detector.detect(makeContext({ frameworks: ['Express'] }));
      expect(signals).not.toContain('touches_ui');
    });
  });

  describe('touches_api', () => {
    it('detects touches_api when Express framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['Express'] }));
      expect(signals).toContain('touches_api');
    });

    it('detects touches_api when ASP.NET Core framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['ASP.NET Core'] }));
      expect(signals).toContain('touches_api');
    });

    it('detects touches_api when NestJS framework is present', () => {
      const signals = detector.detect(makeContext({ frameworks: ['NestJS'] }));
      expect(signals).toContain('touches_api');
    });

    it('does not detect touches_api for frontend-only frameworks', () => {
      const signals = detector.detect(makeContext({ frameworks: ['React'] }));
      expect(signals).not.toContain('touches_api');
    });
  });

  describe('touches_auth_or_input', () => {
    it('detects touches_auth_or_input when project has auth-related conventions', () => {
      const signals = detector.detect(makeContext({ conventions: ['auth-middleware'] }));
      expect(signals).toContain('touches_auth_or_input');
    });

    it('detects touches_auth_or_input when ASP.NET Core is present (Identity)', () => {
      const signals = detector.detect(makeContext({ frameworks: ['ASP.NET Core'] }));
      expect(signals).toContain('touches_auth_or_input');
    });
  });

  describe('touches_external_services', () => {
    it('detects touches_external_services when project has external service indicators', () => {
      const signals = detector.detect(makeContext({ conventions: ['webhook-handler'] }));
      expect(signals).toContain('touches_external_services');
    });

    it('detects touches_external_services when NestJS is present (often integrates services)', () => {
      const signals = detector.detect(makeContext({ frameworks: ['NestJS'] }));
      expect(signals).toContain('touches_external_services');
    });
  });

  describe('performance_sensitive', () => {
    it('detects performance_sensitive when project has performance conventions', () => {
      const signals = detector.detect(makeContext({ conventions: ['performance-budget'] }));
      expect(signals).toContain('performance_sensitive');
    });

    it('detects performance_sensitive for public-facing web frameworks', () => {
      const signals = detector.detect(makeContext({ frameworks: ['Next.js'] }));
      expect(signals).toContain('performance_sensitive');
    });
  });

  describe('high_risk_decision', () => {
    it('detects high_risk_decision when project has database-related conventions', () => {
      const signals = detector.detect(makeContext({ conventions: ['database-migration'] }));
      expect(signals).toContain('high_risk_decision');
    });

    it('detects high_risk_decision when .NET MAUI is present (mobile = high risk)', () => {
      const signals = detector.detect(makeContext({ frameworks: ['.NET MAUI'] }));
      expect(signals).toContain('high_risk_decision');
    });
  });

  describe('additive signals', () => {
    it('a project can have multiple signals', () => {
      const signals = detector.detect(
        makeContext({
          frameworks: ['React', 'Express'],
          conventions: ['auth-middleware', 'performance-budget'],
        }),
      );
      expect(signals).toContain('touches_ui');
      expect(signals).toContain('touches_api');
      expect(signals).toContain('touches_auth_or_input');
      expect(signals).toContain('performance_sensitive');
    });

    it('returns empty array for a project with no detectable signals', () => {
      const signals = detector.detect(
        makeContext({
          languages: ['Python'],
          frameworks: [],
          conventions: [],
        }),
      );
      expect(signals).toHaveLength(0);
    });
  });

  describe('with objective text', () => {
    it('can detect signals from objective text in addition to project context', () => {
      const signals = detector.detect(
        makeContext({ frameworks: ['React'] }),
        'Add a new payment integration with Stripe',
      );
      expect(signals).toContain('touches_ui');
      expect(signals).toContain('touches_external_services');
    });

    it('detects touches_auth_or_input from objective mentioning login', () => {
      const signals = detector.detect(makeContext(), 'Add login form with password validation');
      expect(signals).toContain('touches_auth_or_input');
    });
  });
});
