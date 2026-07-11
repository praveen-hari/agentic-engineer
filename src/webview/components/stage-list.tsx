import { type FunctionalComponent } from 'preact';
import type { Stage } from '../../core/types';
import { Icon, type IconName } from './icon';

interface StageListProps {
  readonly stages: readonly Stage[];
}

const STATUS_ICON: Record<Stage['status'], IconName> = {
  completed: 'pass-filled',
  active: 'loading',
  skipped: 'close',
  pending: 'circle-outline',
  blocked: 'warning',
};

const STATUS_LABEL: Record<Stage['status'], string> = {
  completed: 'Done',
  active: 'Active',
  skipped: 'Skipped',
  pending: 'Pending',
  blocked: 'Blocked',
};

/**
 * Vertical list of workflow stages with status icons.
 * Used in the Stages tab of the Tasks view.
 *
 * @example
 * <StageList stages={workflow.stages} />
 */
export const StageList: FunctionalComponent<StageListProps> = ({ stages }) => {
  return (
    <div class="stage-list">
      {stages.map((s) => (
        <div key={s.id} class={`stage-item stage-item--${s.status}`}>
          <span class="stage-icon">
            <Icon
              name={STATUS_ICON[s.status]}
              size={16}
              spin={s.status === 'active'}
              class={`task-card-icon--${s.status === 'completed' ? 'completed' : s.status === 'active' ? 'active' : 'pending'}`}
            />
          </span>
          <span class="stage-label">{s.name}</span>
          <span class="stage-status">{STATUS_LABEL[s.status]}</span>
        </div>
      ))}
    </div>
  );
};
