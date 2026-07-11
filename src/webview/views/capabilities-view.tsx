import { type FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import { capabilitiesStore } from '../store/workflow.store';
import { bridge } from '../bridge';

export const CapabilitiesView: FunctionalComponent = () => {
  // Request context on mount — capabilities are derived from project context
  useEffect(() => {
    bridge.send({ type: 'requestContext' });
  }, []);

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
            <div key={rec.title} class="capability-rec">
              <div class="capability-rec-header">
                <strong>{rec.title}</strong>
                <span
                  class={`badge ${rec.type === 'skill-pack' ? 'badge-success' : 'badge-warning'}`}
                >
                  {rec.type === 'skill-pack' ? 'Skill Pack' : 'Instruction'}
                </span>
              </div>
              <p class="capability-rec-desc">{rec.description}</p>
              <p class="capability-rec-reason">
                <em>Why: {rec.reason}</em>
              </p>
              <code class="capability-rec-action">{rec.action}</code>
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
          <p class="capability-rec-desc">
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
          <p class="capability-rec-desc">
            14 packs covering 700+ skills across Web, .NET, and Document platforms.
          </p>
          <div class="capability-marketplace-grid">
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
              <div key={name} class="capability-marketplace-item">
                <div class="capability-marketplace-name">{name}</div>
                <div class="capability-marketplace-count">60+ skills</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
