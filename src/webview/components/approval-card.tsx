import { type FunctionalComponent } from 'preact';
import { Icon, type IconName } from './icon';

export interface ApprovalCheck {
  readonly label: string;
  readonly status: 'pass' | 'warn';
}

export interface ApprovalCardProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly riskBadge?: string;
  readonly checks?: readonly ApprovalCheck[];
  readonly compact?: boolean;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
}

/**
 * Inline approval card shown in the Tasks tab when a quality gate
 * requires human approval (e.g., security gate, new dependency).
 *
 * @example
 * <ApprovalCard title="Security gate — approval needed" riskBadge="High Risk"
 *   checks={[{ label: 'No raw cards', status: 'pass' }]}
 *   onApprove={() => bridge.send({ type: 'approve', approvalId: 'a1' })} />
 */
export const ApprovalCard: FunctionalComponent<ApprovalCardProps> = ({
  title,
  subtitle,
  riskBadge,
  checks,
  compact,
  onApprove,
  onReject,
}) => {
  const icon: IconName = compact ? 'package' : 'shield';

  if (compact) {
    return (
      <div class="card approval-card approval-card--compact">
        <div class="approval-card-header">
          <Icon name={icon} size={16} class="task-card-icon--pending" />
          <div class="approval-card-content">
            <div class="approval-card-title">{title}</div>
            {subtitle && <div class="approval-card-subtitle">{subtitle}</div>}
          </div>
          <button class="btn btn-success btn-sm" onClick={onApprove}>
            <Icon name="pass" size={12} /> Approve
          </button>
          <button class="btn btn-danger btn-sm" onClick={onReject}>
            <Icon name="close" size={12} /> Reject
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="card approval-card">
      <div class="approval-card-header">
        <Icon name={icon} size={16} class="task-card-icon--pending" />
        <span class="approval-card-title">{title}</span>
        {riskBadge && <span class="badge badge-error badge-sm">{riskBadge}</span>}
      </div>
      {subtitle && <div class="approval-card-subtitle">{subtitle}</div>}
      {checks && checks.length > 0 && (
        <div class="approval-checks">
          {checks.map((c) => (
            <span class={`approval-check approval-check--${c.status}`}>
              <Icon name={c.status === 'pass' ? 'pass-filled' : 'warning'} size={11} />
              {c.label}
            </span>
          ))}
        </div>
      )}
      <div class="approval-actions">
        <button class="btn btn-success btn-sm" onClick={onApprove}>
          <Icon name="pass" size={12} /> Approve
        </button>
        <button class="btn btn-danger btn-sm" onClick={onReject}>
          <Icon name="close" size={12} /> Reject
        </button>
      </div>
    </div>
  );
};
