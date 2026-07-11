import { type FunctionalComponent } from 'preact';
import { useSignal } from '@preact/signals';
import { Icon, type IconName } from './icon';

export type ArtifactStatus = 'approved' | 'pending' | 'recorded' | 'auto' | 'active';

export interface ArtifactViewerProps {
  readonly name: string;
  readonly meta: string;
  readonly status: ArtifactStatus;
  readonly icon?: IconName;
  readonly iconColor?: 'success' | 'info' | 'warning' | 'muted';
  readonly detail?: preact.ComponentChildren;
}

const STATUS_BADGE: Record<ArtifactStatus, { class: string; label: string }> = {
  approved: { class: 'badge badge-success', label: 'Approved' },
  pending: { class: 'badge badge-warning', label: 'Pending' },
  recorded: { class: 'badge', label: 'Recorded' },
  auto: { class: 'badge', label: 'Auto' },
  active: { class: 'badge badge-accent', label: 'Active' },
};

const ICON_COLOR_CLASS: Record<NonNullable<ArtifactViewerProps['iconColor']>, string> = {
  success: 'task-card-icon--completed',
  info: 'task-card-icon--active',
  warning: 'task-card-icon--pending',
  muted: 'task-card-icon--pending',
};

/**
 * Collapsible artifact card for the Artifacts tab. Shows the artifact
 * name, metadata, status badge, and expandable detail content.
 *
 * @example
 * <ArtifactViewer name="stripe-payment-spec.md" meta="Specification • 2h ago"
 *   status="approved" icon="file-text" iconColor="success" detail={<SpecContent />} />
 */
export const ArtifactViewer: FunctionalComponent<ArtifactViewerProps> = ({
  name,
  meta,
  status,
  icon = 'file-text',
  iconColor = 'success',
  detail,
}) => {
  const expanded = useSignal(false);
  const badge = STATUS_BADGE[status];

  return (
    <div
      class={`card${detail ? ' artifact-card' : ' card-clickable'}`}
      onClick={() => {
        if (detail) expanded.value = !expanded.value;
      }}
    >
      <div class="artifact-card-header">
        <Icon name={icon} size={16} class={ICON_COLOR_CLASS[iconColor]} />
        <div style="flex: 1;">
          <div class="artifact-card-title">{name}</div>
          <div class="artifact-card-meta">{meta}</div>
        </div>
        <span class={badge.class}>{badge.label}</span>
        {detail && (
          <Icon
            name={expanded.value ? 'chevron-down' : 'chevron-right'}
            size={14}
            class="artifact-card-chevron"
          />
        )}
      </div>
      {expanded.value && detail && (
        <div class="artifact-card-detail">
          <div class="artifact-detail-content">{detail}</div>
        </div>
      )}
    </div>
  );
};
