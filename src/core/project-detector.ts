import type { ProjectContext } from './types';

/**
 * A file entry from the workspace — path, whether it's a directory,
 * and optional content (for config files like package.json, tsconfig.json).
 */
export interface FileEntry {
  readonly path: string;
  readonly isDirectory: boolean;
  readonly content?: string;
}

/**
 * Result of project detection — raw findings before analysis.
 */
export interface DetectionResult {
  readonly languages: string[];
  readonly frameworks: string[];
  readonly testFramework: string | null;
  readonly packageManager: string | null;
  readonly detectedStack: string[];
  readonly conventions: string[];
}

/**
 * Detects tech stack, file structure, conventions, and dependencies
 * from a list of workspace files (DD-014 Step 1 input).
 *
 * Pure TypeScript — takes a file list, returns structured detection.
 * No VS Code or Node.js filesystem dependencies.
 */
export class ProjectDetector {
  /**
   * Analyze a list of workspace files and detect the tech stack.
   */
  detect(files: readonly FileEntry[]): DetectionResult {
    const languages = this.detectLanguages(files);
    const frameworks = this.detectFrameworks(files);
    const testFramework = this.detectTestFramework(files);
    const packageManager = this.detectPackageManager(files);
    const detectedStack = this.detectBuildTools(files);
    const conventions = this.detectConventions(files);

    return {
      languages,
      frameworks,
      testFramework,
      packageManager,
      detectedStack,
      conventions,
    };
  }

  /**
   * Convert a DetectionResult into a ProjectContext.
   */
  toContext(detection: DetectionResult, rootPath: string): ProjectContext {
    return {
      rootPath,
      detectedStack: detection.detectedStack,
      languages: detection.languages,
      frameworks: detection.frameworks,
      packageManager: detection.packageManager,
      testFramework: detection.testFramework,
      conventions: detection.conventions,
      generatedAt: new Date().toISOString(),
    };
  }

  // ─── Language Detection ───────────────────────────────────────────────

  private detectLanguages(files: readonly FileEntry[]): string[] {
    const languages = new Set<string>();

    for (const file of files) {
      const ext = this.getExtension(file.path);
      switch (ext) {
        case '.ts':
        case '.tsx':
          languages.add('TypeScript');
          break;
        case '.js':
        case '.jsx':
        case '.mjs':
        case '.cjs':
          languages.add('JavaScript');
          break;
        case '.py':
          languages.add('Python');
          break;
        case '.cs':
          languages.add('C#');
          break;
        case '.java':
          languages.add('Java');
          break;
        case '.go':
          languages.add('Go');
          break;
        case '.rb':
          languages.add('Ruby');
          break;
        case '.php':
          languages.add('PHP');
          break;
        case '.rs':
          languages.add('Rust');
          break;
      }
    }

    return Array.from(languages);
  }

  // ─── Framework Detection ──────────────────────────────────────────────

  private detectFrameworks(files: readonly FileEntry[]): string[] {
    const frameworks = new Set<string>();

    for (const file of files) {
      const basename = this.getBasename(file.path);

      // From package.json dependencies
      if (basename === 'package.json' && file.content) {
        const deps = this.parsePackageJsonDeps(file.content);
        if (deps.has('react')) frameworks.add('React');
        if (deps.has('next')) frameworks.add('Next.js');
        if (deps.has('@angular/core')) frameworks.add('Angular');
        if (deps.has('vue')) frameworks.add('Vue');
        if (deps.has('express')) frameworks.add('Express');
        if (deps.has('@nestjs/core')) frameworks.add('NestJS');
        if (deps.has('svelte')) frameworks.add('Svelte');
      }

      // From .razor files
      if (file.path.endsWith('.razor')) {
        frameworks.add('Blazor');
      }

      // From .csproj
      if (file.path.endsWith('.csproj') && file.content) {
        if (file.content.includes('Microsoft.NET.Sdk.Web')) {
          frameworks.add('ASP.NET Core');
        }
        if (file.content.includes('UseMaui') || file.content.includes('Microsoft.NET.Sdk.Maui')) {
          frameworks.add('.NET MAUI');
        }
      }
    }

    return Array.from(frameworks);
  }

  // ─── Test Framework Detection ─────────────────────────────────────────

  private detectTestFramework(files: readonly FileEntry[]): string | null {
    for (const file of files) {
      const basename = this.getBasename(file.path);

      if (basename === 'vitest.config.ts' || basename === 'vitest.config.js' || basename === 'vitest.config.mts') {
        return 'Vitest';
      }
      if (basename === 'jest.config.js' || basename === 'jest.config.ts' || basename === 'jest.config.mjs') {
        return 'Jest';
      }
      if (basename === 'pytest.ini' || basename === 'pyproject.toml' || basename === 'setup.cfg') {
        if (file.content?.includes('pytest') || basename === 'pytest.ini') {
          return 'pytest';
        }
      }
      if (file.path.endsWith('.csproj') && file.content?.includes('xunit')) {
        return 'xUnit';
      }
      if (file.path.endsWith('.csproj') && file.content?.includes('NUnit')) {
        return 'NUnit';
      }
    }
    return null;
  }

  // ─── Package Manager Detection ────────────────────────────────────────

  private detectPackageManager(files: readonly FileEntry[]): string | null {
    for (const file of files) {
      const basename = this.getBasename(file.path);
      if (basename === 'package-lock.json') return 'npm';
      if (basename === 'yarn.lock') return 'yarn';
      if (basename === 'pnpm-lock.yaml') return 'pnpm';
      if (basename === 'bun.lockb') return 'bun';
    }
    return null;
  }

  // ─── Build Tool Detection ─────────────────────────────────────────────

  private detectBuildTools(files: readonly FileEntry[]): string[] {
    const tools = new Set<string>();

    for (const file of files) {
      const basename = this.getBasename(file.path);
      if (basename?.startsWith('esbuild.config')) tools.add('esbuild');
      if (basename?.startsWith('vite.config')) tools.add('Vite');
      if (basename?.startsWith('webpack.config')) tools.add('Webpack');
      if (basename?.startsWith('rollup.config')) tools.add('Rollup');
      if (basename === 'turbo.json') tools.add('Turborepo');
      if (file.path.endsWith('.csproj')) tools.add('MSBuild');
    }

    return Array.from(tools);
  }

  // ─── Conventions Detection ────────────────────────────────────────────

  private detectConventions(files: readonly FileEntry[]): string[] {
    const conventions = new Set<string>();

    for (const file of files) {
      const basename = this.getBasename(file.path);

      // ESLint
      if (
        basename?.startsWith('.eslintrc') ||
        basename === 'eslint.config.js' ||
        basename === 'eslint.config.mjs'
      ) {
        conventions.add('ESLint');
      }

      // Prettier
      if (basename?.startsWith('.prettierrc') || basename === 'prettier.config.js') {
        conventions.add('Prettier');
      }

      // TypeScript strict mode
      if (basename === 'tsconfig.json' && file.content) {
        if (file.content.includes('"strict":true') || file.content.includes('"strict": true')) {
          conventions.add('TypeScript strict mode');
        }
      }
    }

    return Array.from(conventions);
  }

  // ─── Utilities ────────────────────────────────────────────────────────

  private getExtension(path: string): string {
    const dotIndex = path.lastIndexOf('.');
    if (dotIndex === -1) return '';
    return path.slice(dotIndex).toLowerCase();
  }

  private getBasename(path: string): string {
    const slashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return path.slice(slashIndex + 1);
  }

  private parsePackageJsonDeps(content: string): Set<string> {
    try {
      const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = new Set<string>();
      for (const key of Object.keys(pkg.dependencies ?? {})) deps.add(key);
      for (const key of Object.keys(pkg.devDependencies ?? {})) deps.add(key);
      return deps;
    } catch {
      return new Set();
    }
  }
}
