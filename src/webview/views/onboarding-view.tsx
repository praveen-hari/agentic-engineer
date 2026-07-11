import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { onboardingStatus, contextStore, hasExistingFiles, actions } from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';

// ─── Main Onboarding View ───────────────────────────────────────────────────

export const OnboardingView: FunctionalComponent = () => {
  const status = onboardingStatus.value;

  switch (status) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'setup-existing':
      return <SetupExistingScreen />;
    case 'setup-new':
      return <SetupNewScreen />;
    case 'scanning':
      return <ScanningScreen />;
    default:
      return <WelcomeScreen />;
  }
};

// ─── Welcome Screen ─────────────────────────────────────────────────────────

const WelcomeScreen: FunctionalComponent = () => {
  return (
    <div class="onboarding">
      <div class="onboarding__hero">
        <div class="onboarding__icon">
          <Icon name="rocket" size={32} />
        </div>
        <h1 class="onboarding__title">Welcome to SDLC Workflow</h1>
        <p class="onboarding__subtitle">
          Set up AI-assisted development for your project.
          <br />
          The agent will understand your codebase, follow your conventions,
          <br />
          and track work from idea to completion.
        </p>
      </div>

      <div class="onboarding__options">
        {hasExistingFiles.value && (
          <button
            class="onboarding__card"
            onClick={() => {
              actions.setOnboardingStatus('scanning');
              bridge.send({ type: 'setupExistingProject' });
            }}
          >
            <div class="onboarding__card-icon onboarding__card-icon--existing">
              <Icon name="folder-library" size={20} />
            </div>
            <div class="onboarding__card-content">
              <div class="onboarding__card-title">Set Up Existing Project</div>
              <div class="onboarding__card-desc">
                Scan your workspace to detect the tech stack, folder structure, and conventions
                automatically. Best for projects that already have code.
              </div>
            </div>
            <div class="onboarding__card-arrow">
              <Icon name="chevron-right" size={16} />
            </div>
          </button>
        )}

        <button
          class="onboarding__card"
          onClick={() => {
            actions.setOnboardingStatus('setup-new');
          }}
        >
          <div class="onboarding__card-icon onboarding__card-icon--new">
            <Icon name="sparkle" size={20} />
          </div>
          <div class="onboarding__card-content">
            <div class="onboarding__card-title">Start New Project</div>
            <div class="onboarding__card-desc">
              Describe what you want to build and I'll help you choose the right tech stack, set up
              the project structure, and configure everything.
            </div>
          </div>
          <div class="onboarding__card-arrow">
            <Icon name="chevron-right" size={16} />
          </div>
        </button>
      </div>

      <div class="onboarding__footer">
        You can also type <code>/project-setup</code> in chat anytime to start this process.
      </div>
    </div>
  );
};

// ─── Scanning Screen (shown while workspace is being analyzed) ──────────────

const ScanningScreen: FunctionalComponent = () => {
  return (
    <div class="onboarding">
      <div class="onboarding__hero">
        <div class="onboarding__icon">
          <Icon name="loading" size={32} spin />
        </div>
        <h2 class="onboarding__title">Starting SDLC Workflow...</h2>
        <p class="onboarding__subtitle">
          The agent is initializing the engineering workspace and starting
          <br />
          the structured development workflow in the chat panel.
        </p>
      </div>

      <div class="onboarding__progress">
        <div class="onboarding__progress-item">
          <Icon name="check" size={14} /> Prompt sent to agent
        </div>
        <div class="onboarding__progress-item">
          <Icon name="loading" size={14} spin /> Agent is setting up the workspace…
        </div>
      </div>

      <div class="onboarding__footer">
        <strong>Check the Chat panel</strong> — the agent is driving the workflow using tools.
        <br />
        This screen will close automatically when setup completes.
      </div>
    </div>
  );
};

// ─── Setup Existing Project Screen ──────────────────────────────────────────

const SetupExistingScreen: FunctionalComponent = () => {
  const ctx = contextStore.value;

  return (
    <div class="onboarding">
      <div class="onboarding__hero">
        <div class="onboarding__icon onboarding__icon--success">
          <Icon name="pass-filled" size={32} />
        </div>
        <h2 class="onboarding__title">Project Detected</h2>
        <p class="onboarding__subtitle">
          Here's what I found in your workspace. The agent will use this context to follow your
          patterns and conventions.
        </p>
      </div>

      {ctx && (
        <div class="onboarding__context">
          {ctx.languages.length > 0 && (
            <div class="onboarding__context-row">
              <span class="onboarding__context-label">Languages</span>
              <span class="onboarding__context-value">{ctx.languages.join(', ')}</span>
            </div>
          )}
          {ctx.frameworks.length > 0 && (
            <div class="onboarding__context-row">
              <span class="onboarding__context-label">Frameworks</span>
              <span class="onboarding__context-value">{ctx.frameworks.join(', ')}</span>
            </div>
          )}
          {ctx.testFramework && (
            <div class="onboarding__context-row">
              <span class="onboarding__context-label">Testing</span>
              <span class="onboarding__context-value">{ctx.testFramework}</span>
            </div>
          )}
          {ctx.packageManager && (
            <div class="onboarding__context-row">
              <span class="onboarding__context-label">Package Manager</span>
              <span class="onboarding__context-value">{ctx.packageManager}</span>
            </div>
          )}
          {ctx.conventions.length > 0 && (
            <div class="onboarding__context-row">
              <span class="onboarding__context-label">Conventions</span>
              <span class="onboarding__context-value">{ctx.conventions.join(', ')}</span>
            </div>
          )}
        </div>
      )}

      <div class="onboarding__actions">
        <button
          class="btn btn-primary btn-full"
          onClick={() => {
            actions.setOnboardingStatus('ready');
          }}
        >
          <Icon name="check" size={14} /> Looks Good — Start Working
        </button>
        <button
          class="btn btn-secondary"
          onClick={() => {
            actions.setOnboardingStatus('welcome');
          }}
        >
          Back
        </button>
      </div>

      <div class="onboarding__footer">
        Project context saved to <code>.codestudio/context.md</code>
        <br />
        The agent will also create <code>.codestudio/codestudio-instructions.md</code> with your
        project conventions.
      </div>
    </div>
  );
};

// ─── Start New Project Screen ───────────────────────────────────────────────

const SetupNewScreen: FunctionalComponent = () => {
  const newProjectName = useSignal('');
  const newProjectDescription = useSignal('');
  const canStart = newProjectName.value.trim().length >= 2;

  return (
    <div class="onboarding">
      <div class="onboarding__hero">
        <div class="onboarding__icon">
          <Icon name="sparkle" size={32} />
        </div>
        <h2 class="onboarding__title">Start New Project</h2>
        <p class="onboarding__subtitle">
          Give your project a name and optionally describe what you're building.
          <br />
          The agent will interview you for the remaining details.
        </p>
      </div>

      <div class="onboarding__form">
        <div class="onboarding__field">
          <label class="onboarding__label">
            Project Name <span class="onboarding__required">*</span>
          </label>
          <input
            class="input"
            type="text"
            placeholder="e.g., my-saas-app, task-tracker, portfolio-site"
            value={newProjectName.value}
            onInput={(e: Event) => {
              newProjectName.value = (e.target as HTMLInputElement).value;
            }}
          />
        </div>

        <div class="onboarding__field">
          <label class="onboarding__label">
            What are you building? <span class="onboarding__optional">(optional)</span>
          </label>
          <textarea
            class="textarea"
            placeholder="e.g., A task management app for small teams with real-time collaboration and Kanban boards"
            value={newProjectDescription.value}
            onInput={(e: Event) => {
              newProjectDescription.value = (e.target as HTMLTextAreaElement).value;
            }}
            rows={3}
          />
          <div class="onboarding__hint">
            The more detail you provide, the fewer questions the agent will need to ask.
          </div>
        </div>
      </div>

      <div class="onboarding__actions">
        <button
          class="btn btn-primary"
          disabled={!canStart}
          onClick={() => {
            actions.setOnboardingStatus('scanning');
            bridge.send({
              type: 'setupNewProject',
              projectName: newProjectName.value.trim(),
              description: newProjectDescription.value.trim(),
            });
          }}
        >
          <Icon name="rocket" size={14} /> Start in Chat
        </button>
        <button
          class="btn btn-secondary"
          onClick={() => {
            actions.setOnboardingStatus('welcome');
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
};
