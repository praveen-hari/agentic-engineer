import type { ProjectContext } from './types';

/**
 * Analyzes a {@link ProjectContext} and generates a human-readable
 * markdown summary for `context.md` (DD-014).
 *
 * Pure TypeScript — no VS Code or filesystem dependencies.
 */
export class ContextAnalyzer {
  /**
   * Analyze a ProjectContext — returns it unchanged (the detection
   * is already done by ProjectDetector). This method exists for
   * future enrichment (e.g., LLM-powered analysis).
   */
  analyze(context: ProjectContext): ProjectContext {
    return context;
  }

  /**
   * Generate a markdown summary of the project context.
   * This is written to `.codestudio/context.md`.
   */
  generateMarkdown(context: ProjectContext): string {
    const lines: string[] = [];

    lines.push('# Project Context');
    lines.push('');
    lines.push(`> Auto-generated on ${context.generatedAt}`);
    lines.push('');

    // Languages
    if (context.languages.length > 0) {
      lines.push('## Languages');
      lines.push('');
      for (const lang of context.languages) {
        lines.push(`- ${lang}`);
      }
      lines.push('');
    }

    // Frameworks
    if (context.frameworks.length > 0) {
      lines.push('## Frameworks');
      lines.push('');
      for (const fw of context.frameworks) {
        lines.push(`- ${fw}`);
      }
      lines.push('');
    }

    // Build tools / detected stack
    if (context.detectedStack.length > 0) {
      lines.push('## Build Tools');
      lines.push('');
      for (const tool of context.detectedStack) {
        lines.push(`- ${tool}`);
      }
      lines.push('');
    }

    // Testing
    lines.push('## Testing');
    lines.push('');
    if (context.testFramework) {
      lines.push(`- Test framework: ${context.testFramework}`);
    } else {
      lines.push('- No test framework detected');
    }
    lines.push('');

    // Package manager
    lines.push('## Package Manager');
    lines.push('');
    if (context.packageManager) {
      lines.push(`- ${context.packageManager}`);
    } else {
      lines.push('- No package manager detected');
    }
    lines.push('');

    // Conventions
    if (context.conventions.length > 0) {
      lines.push('## Conventions');
      lines.push('');
      for (const conv of context.conventions) {
        lines.push(`- ${conv}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
