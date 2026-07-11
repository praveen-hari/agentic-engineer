import { type FunctionalComponent } from 'preact';
import type { ProcessLevel } from '../../core/types';

interface RiskBadgeProps {
  readonly level: ProcessLevel;
  readonly size?: 'sm' | 'md';
}

const LEVEL_LABEL: Record<ProcessLevel, string> = {
  light: 'Light',
  standard: 'Standard',
  thorough: 'Thorough',
  guarded: 'Guarded',
};

const LEVEL_VARIANT: Record<ProcessLevel, 'low' | 'medium' | 'high'> = {
  light: 'low',
  standard: 'medium',
  thorough: 'medium',
  guarded: 'high',
};

/**
 * Colored badge showing the process level / risk class.
 *
 * @example
 * <RiskBadge level="guarded" />
 */
export const RiskBadge: FunctionalComponent<RiskBadgeProps> = ({ level, size = 'md' }) => {
  const variant = LEVEL_VARIANT[level];
  const sizeClass = size === 'sm' ? 'risk-badge risk-badge--sm' : 'risk-badge';
  return <span class={`${sizeClass} risk-badge--${variant}`}>{LEVEL_LABEL[level]}</span>;
};
