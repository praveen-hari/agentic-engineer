import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import {
  onboardingStatus,
  hasExistingFiles,
  actions,
  agentStatusMessage,
} from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';

/** Timeout for the scanning screen (60 seconds). */
const SCANNING_TIMEOUT_MS = 60_000;

// ─── Main Onboarding View ───────────────────────────────────────────────────

export const OnboardingView: FunctionalComponent = () => {
  const status = onboardingStatus.value;

  switch (status) {
    case 'welcome':
      return <WelcomeScreen />;
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
  const clicked = useSignal(false);

  return (
    <div class="onboarding">
      <div class="onboarding__hero">
        <div class="onboarding__icon">
          <Icon name="rocket" size={32} />
        </div>
        <h1 class="onboarding__title">Welcome to Engineering Workspace</h1>
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
            disabled={clicked.value}
            onClick={() => {
              if (clicked.value) return;
              clicked.value = true;
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
                Scan your workspace to detect the tech stack, conventions, and structure
                automatically.
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
              Describe what you want to build and the agent will help you set everything up.
            </div>
          </div>
          <div class="onboarding__card-arrow">
            <Icon name="chevron-right" size={16} />
          </div>
        </button>
      </div>
    </div>
  );
};

// ─── Scanning Screen (shown while workspace is being analyzed) ──────────────

const ScanningScreen: FunctionalComponent = () => {
  const timedOut = useSignal(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-timeout after SCANNING_TIMEOUT_MS
  useEffect(() => {
    timer.current = setTimeout(() => {
      timedOut.value = true;
    }, SCANNING_TIMEOUT_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Timed out or error state
  if (timedOut.value) {
    return (
      <div class="onboarding">
        <div class="onboarding__hero">
          <div class="onboarding__icon">
            <Icon name="warning" size={32} />
          </div>
          <h2 class="onboarding__title">Setup Taking Too Long</h2>
          <p class="onboarding__subtitle">
            The agent didn't complete the setup in time.
            <br />
            This can happen if the agent hit a budget limit, lost connection, or encountered an
            error.
          </p>
        </div>

        <div class="onboarding__actions">
          <button
            class="btn btn-primary"
            onClick={() => {
              timedOut.value = false;
              actions.setOnboardingStatus('scanning');
              bridge.send({ type: 'setupExistingProject' });
              // Restart timeout
              timer.current = setTimeout(() => {
                timedOut.value = true;
              }, SCANNING_TIMEOUT_MS);
            }}
          >
            <Icon name="refresh" size={14} /> Try Again
          </button>
          <button
            class="btn btn-secondary"
            onClick={() => {
              actions.setOnboardingStatus('welcome');
            }}
          >
            Back to Start
          </button>
        </div>

        <div class="onboarding__footer">
          Check the <strong>Chat panel</strong> for error messages.
        </div>
      </div>
    );
  }

  return (
    <div class="onboarding">
      <div class="onboarding__hero">
        <div class="onboarding__icon">
          <Icon name="gear" size={32} />
        </div>
        <h2 class="onboarding__title">Setting Up Project...</h2>
        <p class="onboarding__subtitle">
          The agent is scanning your workspace and creating project knowledge files.
        </p>
      </div>

      <div class="onboarding__progress">
        <div class="onboarding__progress-item onboarding__progress-item--done">
          <Icon name="pass-filled" size={14} /> Prompt sent to agent
        </div>
        <div class="onboarding__progress-item">
          <Icon name="loading" size={14} spin />{' '}
          {agentStatusMessage.value || 'Agent is setting up the workspace…'}
        </div>
      </div>

      <div class="onboarding__actions">
        <button
          class="btn btn-secondary"
          onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            agentStatusMessage.value = null;
            bridge.send({ type: 'cancelAgent' });
            actions.setOnboardingStatus('welcome');
          }}
        >
          <Icon name="close" size={14} /> Cancel Setup
        </button>
      </div>

      <div class="onboarding__footer">
        Check the <strong>Chat panel</strong> to see the agent's progress.
        <br />
        This screen closes automatically when setup completes.
      </div>
    </div>
  );
};

// ─── Start New Project Screen ───────────────────────────────────────────────

const SetupNewScreen: FunctionalComponent = () => {
  const newProjectName = useSignal('');
  const newProjectDescription = useSignal('');
  const starting = useSignal(false);
  const canStart = newProjectName.value.trim().length >= 2 && !starting.value;

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
            if (starting.value) return;
            starting.value = true;
            actions.setOnboardingStatus('scanning');
            bridge.send({
              type: 'setupNewProject',
              projectName: newProjectName.value.trim(),
              description: newProjectDescription.value.trim(),
            });
          }}
        >
          <Icon name="rocket" size={14} /> Create Project
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
