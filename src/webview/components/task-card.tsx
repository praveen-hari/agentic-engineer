import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { Icon, type IconName } from './icon';

export type TaskStatus = 'completed' | 'active' | 'pending';

export interface TaskChecklistItem {
  readonly label: string;
  readonly status: TaskStatus;
}

export interface TaskCardProps {
  readonly label: string;
  readonly status: TaskStatus;
  readonly sizeBadge?: string;
  readonly tddBadge?: string;
  readonly checklist?: readonly TaskChecklistItem[];
  readonly hasActivity?: boolean;
  readonly onClick?: () => void;
}

const STATUS_ICON: Record<TaskStatus, IconName> = {
  completed: 'pass-filled',
  active: 'loading',
  pending: 'circle-outline',
};

/**
 * A single task row in the Tasks tab. Expandable when active to show
 * the checklist of sub-steps and an agent activity link.
 *
 * @example
 * <TaskCard label="Task 4: POST /api/payments" status="active" sizeBadge="M" />
 */
export const TaskCard: FunctionalComponent<TaskCardProps> = ({
  label,
  status,
  sizeBadge,
  tddBadge,
  checklist,
  hasActivity,
  onClick,
}) => {
  const expanded = useSignal(false);

  const handleClick = () => {
    if (status === 'active' && checklist) {
      expanded.value = !expanded.value;
    }
    onClick?.();
  };

  return (
    <div class={`task-card task-card--${status}`} onClick={handleClick}>
      <Icon
        name={STATUS_ICON[status]}
        size={14}
        spin={status === 'active'}
        class={`task-card-icon task-card-icon--${status}`}
      />
      <span class={`task-card-label${status === 'active' ? ' task-card-label--active' : ''}`}>
        {label}
      </span>
      <div class="task-card-badges">
        {tddBadge && <span class="badge badge-accent badge-sm">{tddBadge}</span>}
        {sizeBadge && <span class="badge badge-sm">{sizeBadge}</span>}
        {status === 'active' && checklist && (
          <Icon
            name={expanded.value ? 'chevron-down' : 'chevron-right'}
            size={14}
            class="task-card-chevron"
          />
        )}
      </div>

      {expanded.value && checklist && (
        <div class="task-card-detail">
          <div class="task-checklist">
            {checklist.map((item) => (
              <div class={`task-checklist-item task-checklist-item--${item.status}`}>
                <Icon
                  name={STATUS_ICON[item.status]}
                  size={12}
                  spin={item.status === 'active'}
                  class={`task-checklist-icon task-checklist-icon--${item.status}`}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          {hasActivity && (
            <div class="task-activity-link">
              <a href="#" onClick={(e: Event) => e.preventDefault()}>
                View agent activity →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
