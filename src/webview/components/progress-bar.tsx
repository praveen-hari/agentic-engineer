import { type FunctionalComponent } from 'preact';

interface ProgressBarProps {
  /** Completion percentage 0–100. */
  readonly value: number;
  readonly variant?: 'default' | 'success';
  readonly height?: number;
}

/**
 * Thin progress bar matching the design prototype.
 *
 * @example
 * <ProgressBar value={37} />
 */
export const ProgressBar: FunctionalComponent<ProgressBarProps> = ({
  value,
  variant = 'default',
  height = 6,
}) => {
  const clamped = Math.max(0, Math.min(100, value));
  const fillClass = variant === 'success' ? 'progress-bar-fill--success' : 'progress-bar-fill';

  return (
    <div
      class="progress-bar"
      style={`height: ${height}px; border-radius: var(--radius-full); overflow: hidden;`}
    >
      <div class={fillClass} style={`width: ${clamped}%; height: 100%; transition: width 0.3s;`} />
    </div>
  );
};
