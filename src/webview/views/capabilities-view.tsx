import { type FunctionalComponent } from 'preact';
import { capabilitiesStore } from '../store/workflow.store';

export const CapabilitiesView: FunctionalComponent = () => {
  const recommendations = capabilitiesStore.value.recommendations as readonly {
    type: string;
    title: string;
    description: string;
    reason: string;
    action: string;
    packId?: string;
  }[];

  return (
    <div>
      {/* Zone 1: Recommended for This Project */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">Recommended for This Project</span>
        </div>
        {recommendations.length === 0 ? (
          <div class="card-body">
            No recommendations yet. Open a project to get context-aware suggestions.
          </div>
        ) : (
          recommendations.map((rec) => (
            <div
              key={rec.title}
              style="margin-bottom: var(--space-md); padding-bottom: var(--space-md); border-bottom: 1px solid var(--color-border);"
            >
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-xs);">
                <strong>{rec.title}</strong>
                <span
                  class={`badge ${rec.type === 'skill-pack' ? 'badge-success' : 'badge-warning'}`}
                >
                  {rec.type === 'skill-pack' ? 'Skill Pack' : 'Instruction'}
                </span>
              </div>
              <p style="font-size: var(--font-size-sm); color: var(--color-text-muted); margin-bottom: var(--space-xs);">
                {rec.description}
              </p>
              <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-bottom: var(--space-xs);">
                <em>Why: {rec.reason}</em>
              </p>
              <code style="font-size: var(--font-size-xs);">{rec.action}</code>
            </div>
          ))
        )}
      </div>

      {/* Zone 2: Current Setup */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">Current Setup</span>
        </div>
        <div class="card-body">
          <p style="margin-bottom: var(--space-sm);">
            Manage your agents, skills, instructions, hooks, and MCP servers in Code Studio's native
            Agent Customizations panel.
          </p>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">{capabilitiesStore.value.installedPacks.length}</div>
              <div class="stat-label">Skill Packs</div>
            </div>
          </div>
        </div>
      </div>

      {/* Zone 3: Syncfusion Skill Pack Marketplace */}
      <div class="card">
        <div class="card-header">
          <span class="card-title">Syncfusion Skill Pack Marketplace</span>
        </div>
        <div class="card-body">
          <p style="margin-bottom: var(--space-md);">
            14 packs covering 700+ skills across Web, .NET, and Document platforms.
          </p>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-sm);">
            {[
              'React',
              'Angular',
              'Blazor',
              'Vue',
              'JavaScript',
              'ASP.NET Core',
              '.NET MAUI',
              'WPF',
              'WinUI',
              'WinForms',
              'Document Editor',
              'PDF Viewer',
              'DOCX Editor',
              'Spreadsheet Editor',
            ].map((name) => (
              <div
                key={name}
                style="padding: var(--space-sm); border: 1px solid var(--color-border); border-radius: var(--radius-sm);"
              >
                <div style="font-size: var(--font-size-sm); font-weight: 500;">{name}</div>
                <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">
                  60+ skills
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
