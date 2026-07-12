/**
 * Reusable confirmation dialog overlay.
 *
 * Renders a modal overlay with a message and two buttons.
 * Used for destructive actions like deleting a task.
 */
import { type FunctionalComponent } from 'preact';
import { Icon, type IconName } from './icon';

export interface ConfirmDialogProps {
  readonly icon?: IconName;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly confirmDanger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export const ConfirmDialog: FunctionalComponent<ConfirmDialogProps> = ({
  icon = 'warning',
  title,
  message,
  confirmLabel,
  confirmDanger = false,
  onConfirm,
  onCancel,
}) => (
  <div class="confirm-overlay" onClick={onCancel}>
    <div
      class="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      onClick={(e: Event) => e.stopPropagation()}
    >
      <div class="confirm-dialog-icon">
        <Icon name={icon} size={24} />
      </div>
      <h3 id="confirm-title" class="confirm-dialog-title">{title}</h3>
      <p id="confirm-message" class="confirm-dialog-message">{message}</p>
      <div class="confirm-dialog-actions">
        <button class="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          class={`btn ${confirmDanger ? 'btn-danger' : 'btn-primary'}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
