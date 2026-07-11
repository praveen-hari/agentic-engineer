import { describe, it, expect } from 'vitest';
import { ContextAnalyzer } from '../../core/context-analyzer';
import type { ProjectContext } from '../../core/types';

describe('ContextAnalyzer', () => {
  const analyzer = new ContextAnalyzer();

  const makeContext = (overrides: Partial<ProjectContext> = {}): ProjectContext => ({
    rootPath: '/project',
    detectedStack: ['TypeScript', 'React', 'Vitest'],
    languages: ['TypeScript'],
    frameworks: ['React'],
    packageManager: 'npm',
    testFramework: 'Vitest',
    conventions: ['ESLint', 'Prettier', 'TypeScript strict mode'],
    generatedAt: '2026-07-11T10:00:00Z',
    ...overrides,
  });

  describe('analyze', () => {
    it('returns a ProjectContext unchanged', () => {
      const ctx = makeContext();
      const result = analyzer.analyze(ctx);
      expect(result).toEqual(ctx);
    });

    it('generates markdown summary', () => {
      const ctx = makeContext();
      const result = analyzer.generateMarkdown(ctx);
      expect(result).toContain('# Project Context');
      expect(result).toContain('TypeScript');
      expect(result).toContain('React');
    });

    it('markdown includes languages section', () => {
      const ctx = makeContext({ languages: ['TypeScript', 'Python'] });
      const md = analyzer.generateMarkdown(ctx);
      expect(md).toContain('## Languages');
      expect(md).toContain('TypeScript');
      expect(md).toContain('Python');
    });

    it('markdown includes frameworks section', () => {
      const ctx = makeContext({ frameworks: ['React', 'Express'] });
      const md = analyzer.generateMarkdown(ctx);
      expect(md).toContain('## Frameworks');
      expect(md).toContain('React');
      expect(md).toContain('Express');
    });

    it('markdown includes test framework section', () => {
      const ctx = makeContext({ testFramework: 'Vitest' });
      const md = analyzer.generateMarkdown(ctx);
      expect(md).toContain('## Testing');
      expect(md).toContain('Vitest');
    });

    it('markdown includes conventions section', () => {
      const ctx = makeContext({ conventions: ['ESLint', 'Prettier'] });
      const md = analyzer.generateMarkdown(ctx);
      expect(md).toContain('## Conventions');
      expect(md).toContain('ESLint');
      expect(md).toContain('Prettier');
    });

    it('markdown notes when no test framework detected', () => {
      const ctx = makeContext({ testFramework: null });
      const md = analyzer.generateMarkdown(ctx);
      expect(md).toContain('No test framework detected');
    });

    it('markdown notes when no package manager detected', () => {
      const ctx = makeContext({ packageManager: null });
      const md = analyzer.generateMarkdown(ctx);
      expect(md).toContain('No package manager detected');
    });
  });
});
