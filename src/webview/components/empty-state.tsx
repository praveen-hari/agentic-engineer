import { type FunctionalComponent } from 'preact';
import { Icon, type IconName } from './icon';

interface EmptyStateProps {
  readonly icon?: IconName;
  readonly emoji?: string;
  readonly title: string;
  readonly description?: string;
  readonly children?: preact.ComponentChildren;
}

/**
 * Centered empty-state placeholder used across views.
 *
 * Either an `icon` (codicon) or `emoji` can be supplied for the glyph.
 *
 * @example
 * <EmptyState icon="rocket" title="Start a New Work Request" />
 */
export const EmptyState: FunctionalComponent<EmptyStateProps> = ({
  icon,
  emoji,
  title,
  description,
  children,
}) => {
  return (
    <div class="empty-state">
      {icon ? (
        <div class="empty-state-icon-wrap">
          <Icon name={icon} size={24} />
        </div>
      ) : emoji ? (
        <div class="empty-state-icon">{emoji}</div>
      ) : null}
      <div class="empty-state-title">{title}</div>
      {description && <div class="empty-state-description">{description}</div>}
      {children}
    </div>
  );
};
