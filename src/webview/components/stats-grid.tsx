import { type FunctionalComponent } from 'preact';

interface StatItem {
  readonly label: string;
  readonly value: string | number;
  readonly variant?: 'default' | 'success' | 'accent';
}

interface StatsGridProps {
  readonly stats: readonly StatItem[];
}

/**
 * Horizontal grid of stat cards used in the Tasks complete state
 * and the active workflow header.
 *
 * @example
 * <StatsGrid stats={[
 *   { label: 'Tasks', value: '8/8', variant: 'success' },
 *   { label: 'Tests', value: 24 },
 * ]} />
 */
export const StatsGrid: FunctionalComponent<StatsGridProps> = ({ stats }) => {
  return (
    <div class="stats-grid">
      {stats.map((s) => {
        const valueClass =
          s.variant === 'success'
            ? 'stat-value stat-value--success'
            : s.variant === 'accent'
              ? 'stat-value stat-value--accent'
              : 'stat-value';
        return (
          <div key={s.label} class="stat-card">
            <div class={valueClass}>{s.value}</div>
            <div class="stat-label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
};
