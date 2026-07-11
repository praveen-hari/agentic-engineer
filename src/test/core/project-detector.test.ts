import { describe, it, expect } from 'vitest';
import { ProjectDetector } from '../../core/project-detector';
import type { FileEntry } from '../../core/project-detector';

describe('ProjectDetector', () => {
  const detector = new ProjectDetector();

  describe('language detection', () => {
    it('detects TypeScript from .ts files', () => {
      const result = detector.detect([
        { path: 'src/index.ts', isDirectory: false },
        { path: 'src/app.ts', isDirectory: false },
      ]);
      expect(result.languages).toContain('TypeScript');
    });

    it('detects JavaScript from .js files', () => {
      const result = detector.detect([
        { path: 'index.js', isDirectory: false },
      ]);
      expect(result.languages).toContain('JavaScript');
    });

    it('detects Python from .py files', () => {
      const result = detector.detect([
        { path: 'main.py', isDirectory: false },
      ]);
      expect(result.languages).toContain('Python');
    });

    it('detects C# from .cs files', () => {
      const result = detector.detect([
        { path: 'Program.cs', isDirectory: false },
      ]);
      expect(result.languages).toContain('C#');
    });

    it('detects multiple languages', () => {
      const result = detector.detect([
        { path: 'src/app.ts', isDirectory: false },
        { path: 'scripts/build.py', isDirectory: false },
        { path: 'tools/cli.cs', isDirectory: false },
      ]);
      expect(result.languages).toContain('TypeScript');
      expect(result.languages).toContain('Python');
      expect(result.languages).toContain('C#');
    });
  });

  describe('framework detection', () => {
    it('detects React from package.json with react dependency', () => {
      const result = detector.detect([
        { path: 'package.json', isDirectory: false, content: '{"dependencies":{"react":"^18.0.0"}}' },
        { path: 'src/App.tsx', isDirectory: false },
      ]);
      expect(result.frameworks).toContain('React');
    });

    it('detects Next.js from package.json', () => {
      const result = detector.detect([
        { path: 'package.json', isDirectory: false, content: '{"dependencies":{"next":"^14.0.0"}}' },
      ]);
      expect(result.frameworks).toContain('Next.js');
    });

    it('detects Angular from package.json', () => {
      const result = detector.detect([
        { path: 'package.json', isDirectory: false, content: '{"dependencies":{"@angular/core":"^17.0.0"}}' },
      ]);
      expect(result.frameworks).toContain('Angular');
    });

    it('detects Vue from package.json', () => {
      const result = detector.detect([
        { path: 'package.json', isDirectory: false, content: '{"dependencies":{"vue":"^3.0.0"}}' },
      ]);
      expect(result.frameworks).toContain('Vue');
    });

    it('detects Express from package.json', () => {
      const result = detector.detect([
        { path: 'package.json', isDirectory: false, content: '{"dependencies":{"express":"^4.0.0"}}' },
      ]);
      expect(result.frameworks).toContain('Express');
    });

    it('detects Blazor from .razor files', () => {
      const result = detector.detect([
        { path: 'Pages/Index.razor', isDirectory: false },
        { path: 'Program.cs', isDirectory: false },
      ]);
      expect(result.frameworks).toContain('Blazor');
    });

    it('detects ASP.NET Core from .csproj', () => {
      const result = detector.detect([
        { path: 'MyApp.csproj', isDirectory: false, content: '<Project Sdk="Microsoft.NET.Sdk.Web">' },
      ]);
      expect(result.frameworks).toContain('ASP.NET Core');
    });

    it('detects .NET MAUI from .csproj', () => {
      const result = detector.detect([
        { path: 'MyApp.csproj', isDirectory: false, content: '<UseMaui>true</UseMaui>' },
      ]);
      expect(result.frameworks).toContain('.NET MAUI');
    });
  });

  describe('test framework detection', () => {
    it('detects Vitest from config file', () => {
      const result = detector.detect([
        { path: 'vitest.config.ts', isDirectory: false },
      ]);
      expect(result.testFramework).toBe('Vitest');
    });

    it('detects Jest from config file', () => {
      const result = detector.detect([
        { path: 'jest.config.js', isDirectory: false },
      ]);
      expect(result.testFramework).toBe('Jest');
    });

    it('detects pytest from config file', () => {
      const result = detector.detect([
        { path: 'pytest.ini', isDirectory: false },
      ]);
      expect(result.testFramework).toBe('pytest');
    });

    it('detects xUnit from .csproj', () => {
      const result = detector.detect([
        { path: 'MyApp.Tests.csproj', isDirectory: false, content: '<PackageReference Include="xunit" />' },
      ]);
      expect(result.testFramework).toBe('xUnit');
    });

    it('returns null when no test framework detected', () => {
      const result = detector.detect([
        { path: 'src/index.ts', isDirectory: false },
      ]);
      expect(result.testFramework).toBeNull();
    });
  });

  describe('package manager detection', () => {
    it('detects npm from package-lock.json', () => {
      const result = detector.detect([
        { path: 'package-lock.json', isDirectory: false },
      ]);
      expect(result.packageManager).toBe('npm');
    });

    it('detects yarn from yarn.lock', () => {
      const result = detector.detect([
        { path: 'yarn.lock', isDirectory: false },
      ]);
      expect(result.packageManager).toBe('yarn');
    });

    it('detects pnpm from pnpm-lock.yaml', () => {
      const result = detector.detect([
        { path: 'pnpm-lock.yaml', isDirectory: false },
      ]);
      expect(result.packageManager).toBe('pnpm');
    });

    it('returns null when no lock file found', () => {
      const result = detector.detect([
        { path: 'src/index.ts', isDirectory: false },
      ]);
      expect(result.packageManager).toBeNull();
    });
  });

  describe('build tool detection', () => {
    it('detects esbuild from config', () => {
      const result = detector.detect([
        { path: 'esbuild.config.mjs', isDirectory: false },
      ]);
      expect(result.detectedStack).toContain('esbuild');
    });

    it('detects Vite from config', () => {
      const result = detector.detect([
        { path: 'vite.config.ts', isDirectory: false },
      ]);
      expect(result.detectedStack).toContain('Vite');
    });
  });

  describe('conventions detection', () => {
    it('detects ESLint from config', () => {
      const result = detector.detect([
        { path: '.eslintrc.json', isDirectory: false },
      ]);
      expect(result.conventions).toContain('ESLint');
    });

    it('detects Prettier from config', () => {
      const result = detector.detect([
        { path: '.prettierrc', isDirectory: false },
      ]);
      expect(result.conventions).toContain('Prettier');
    });

    it('detects TypeScript strict mode from tsconfig', () => {
      const result = detector.detect([
        { path: 'tsconfig.json', isDirectory: false, content: '{"compilerOptions":{"strict":true}}' },
      ]);
      expect(result.conventions).toContain('TypeScript strict mode');
    });
  });

  describe('edge cases', () => {
    it('handles empty file list', () => {
      const result = detector.detect([]);
      expect(result.languages).toHaveLength(0);
      expect(result.frameworks).toHaveLength(0);
    });

    it('handles files with no recognizable extensions', () => {
      const result = detector.detect([
        { path: 'README.md', isDirectory: false },
        { path: 'LICENSE', isDirectory: false },
      ]);
      expect(result.languages).not.toContain('TypeScript');
    });
  });
});
