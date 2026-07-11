import { type FunctionalComponent } from 'preact';
import { contextStore } from '../store/workflow.store';

export const KnowledgeView: FunctionalComponent = () => {
  const ctx = contextStore.value;

  return (
    <div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">Project Context</span>
        </div>
        {ctx ? (
          <div class="card-body">
            <div style="margin-bottom: var(--space-sm);">
              <strong>Languages:</strong> {ctx.languages.join(', ') || 'None detected'}
            </div>
            <div style="margin-bottom: var(--space-sm);">
              <strong>Frameworks:</strong> {ctx.frameworks.join(', ') || 'None detected'}
            </div>
            <div style="margin-bottom: var(--space-sm);">
              <strong>Test Framework:</strong> {ctx.testFramework ?? 'Not detected'}
            </div>
            <div style="margin-bottom: var(--space-sm);">
              <strong>Package Manager:</strong> {ctx.packageManager ?? 'Not detected'}
            </div>
            {ctx.conventions.length > 0 && (
              <div>
                <strong>Conventions:</strong> {ctx.conventions.join(', ')}
              </div>
            )}
          </div>
        ) : (
          <div class="card-body">Analyzing project context...</div>
        )}
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Architecture Decisions</span>
        </div>
        <div class="card-body">ADRs will appear here as they are recorded during workflows.</div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Conventions</span>
        </div>
        <div class="card-body">
          Project conventions will be listed here based on detected configuration files.
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Boundaries</span>
        </div>
        <div class="card-body">
          Define what the agent should and shouldn't touch — module boundaries, protected files,
          etc.
        </div>
      </div>
    </div>
  );
};
