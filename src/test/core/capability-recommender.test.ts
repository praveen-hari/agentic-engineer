import { describe, it, expect } from 'vitest';
import { CapabilityRecommender } from '../../core/capability-recommender';
import type { ProjectContext, ContextSignal } from '../../core/types';

describe('CapabilityRecommender', () => {
  const recommender = new CapabilityRecommender();

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

  describe('recommend — Syncfusion skill packs', () => {
    it('recommends React pack when React is detected', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['React'] }), []);
      const packRec = recs.find((r) => r.title.includes('React'));
      expect(packRec).toBeDefined();
      expect(packRec!.type).toBe('skill-pack');
      expect(packRec!.reason).toMatch(/React/i);
    });

    it('recommends Angular pack when Angular is detected', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['Angular'] }), []);
      const packRec = recs.find((r) => r.title.includes('Angular'));
      expect(packRec).toBeDefined();
    });

    it('recommends Blazor pack when Blazor is detected', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['Blazor'] }), []);
      const packRec = recs.find((r) => r.title.includes('Blazor'));
      expect(packRec).toBeDefined();
    });

    it('recommends Vue pack when Vue is detected', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['Vue'] }), []);
      const packRec = recs.find((r) => r.title.includes('Vue'));
      expect(packRec).toBeDefined();
    });

    it('recommends ASP.NET Core pack when ASP.NET Core is detected', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['ASP.NET Core'] }), []);
      const packRec = recs.find((r) => r.title.includes('ASP.NET Core'));
      expect(packRec).toBeDefined();
    });

    it('recommends .NET MAUI pack when .NET MAUI is detected', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['.NET MAUI'] }), []);
      const packRec = recs.find((r) => r.title.includes('MAUI'));
      expect(packRec).toBeDefined();
    });
  });

  describe('recommend — instructions', () => {
    it('recommends Testing Standards when no test framework detected', () => {
      const recs = recommender.recommend(makeContext({ testFramework: null }), []);
      const testRec = recs.find((r) => r.title.toLowerCase().includes('test'));
      expect(testRec).toBeDefined();
      expect(testRec!.type).toBe('instruction');
      expect(testRec!.reason).toMatch(/no test framework/i);
    });

    it('does not recommend Testing Standards when test framework exists', () => {
      const recs = recommender.recommend(makeContext({ testFramework: 'Vitest' }), []);
      const testRec = recs.find((r) => r.title.toLowerCase().includes('testing standards'));
      expect(testRec).toBeUndefined();
    });

    it('recommends Security Hardening when touches_auth_or_input signal present', () => {
      const recs = recommender.recommend(makeContext(), ['touches_auth_or_input']);
      const secRec = recs.find((r) => r.title.toLowerCase().includes('security'));
      expect(secRec).toBeDefined();
      expect(secRec!.reason).toMatch(/auth|input/i);
    });

    it('recommends API Conventions when touches_api signal present', () => {
      const recs = recommender.recommend(makeContext(), ['touches_api']);
      const apiRec = recs.find((r) => r.title.toLowerCase().includes('api'));
      expect(apiRec).toBeDefined();
    });
  });

  describe('recommendation structure', () => {
    it('every recommendation has type, title, description, reason, action, category', () => {
      const recs = recommender.recommend(
        makeContext({ frameworks: ['React'], testFramework: null }),
        ['touches_ui'],
      );
      for (const rec of recs) {
        expect(rec.type).toBeDefined();
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.reason).toBeDefined();
        expect(rec.action).toBeDefined();
        expect(rec.category).toBeDefined();
      }
    });

    it('reason explains WHY the recommendation was made', () => {
      const recs = recommender.recommend(makeContext({ frameworks: ['React'] }), []);
      const reactRec = recs.find((r) => r.title.includes('React'));
      expect(reactRec!.reason).toMatch(/React/i);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for a project with no detectable signals', () => {
      const recs = recommender.recommend(
        makeContext({ frameworks: [], testFramework: 'Vitest' }),
        [],
      );
      expect(recs).toHaveLength(0);
    });

    it('returns multiple recommendations for a rich project', () => {
      const recs = recommender.recommend(
        makeContext({
          frameworks: ['React', 'Express'],
          testFramework: null,
        }),
        ['touches_auth_or_input', 'touches_api'],
      );
      expect(recs.length).toBeGreaterThan(1);
    });
  });
});
