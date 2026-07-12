import { type FunctionalComponent } from 'preact';
import { useEffect } from 'preact/hooks';
import { knowledgeStore, knowledgeRefreshing } from '../store/workflow.store';
import { bridge } from '../bridge';
import { Icon } from '../components/icon';
import type { KnowledgeFileInfo } from '../../core/types';

// ─── Icon mapping for knowledge files ───────────────────────────────────────

import type { IconName } from '../components/icon';

const FILE_ICONS: Record<string, IconName> = {
  'architecture.md': 'layers',
  'conventions.md': 'list-tree',
  'stack.md': 'package',
  'boundaries.md': 'shield',
  'codestudio-instructions.md': 'file-code',
};

// ─── Knowledge View ─────────────────────────────────────────────────────────

export const KnowledgeView: FunctionalComponent = () => {
  useEffect(() => {
    bridge.send({ type: 'requestKnowledge' });
  }, []);

  const files = knowledgeStore.value;
  const refreshing = knowledgeRefreshing.value;
  const existingFiles = files.filter((f) => f.exists);
  const missingFiles = files.filter((f) => !f.exists);

  // ─── Empty State ───────────────────────────────────────────────
  if (files.length === 0 || existingFiles.length === 0) {
    return (
      <div class="knowledge-empty">
        <div class="empty-state">
          <div class="empty-state-icon">
            <Icon name="book" size={32} />
          </div>
          <div class="empty-state-title">No Knowledge Yet</div>
          <div class="empty-state-description">
            Set up your project or run a workflow to generate knowledge files. These help the agent
            understand your project.
          </div>
          <button
            class="btn btn-primary"
            disabled={refreshing}
            onClick={() => {
              knowledgeRefreshing.value = true;
              bridge.send({ type: 'refreshKnowledge' });
            }}
          >
            {refreshing ? (
              <>
                <Icon name="loading" size={14} spin /> Generating...
              </>
            ) : (
              <>
                <Icon name="sparkle" size={14} /> Generate Knowledge
              </>
            )}
          </button>
        </div>

        <div class="knowledge-file-list-hint">
          <div class="knowledge-hint-label">Knowledge files help the agent understand:</div>
          <ul class="knowledge-hint-list">
            <li>
              <strong>architecture.md</strong> — How it's structured
            </li>
            <li>
              <strong>stack.md</strong> — What tech it uses
            </li>
            <li>
              <strong>conventions.md</strong> — How code should be written
            </li>
            <li>
              <strong>boundaries.md</strong> — What the agent should/shouldn't do
            </li>
          </ul>
        </div>
      </div>
    );
  }

  // ─── Normal State ──────────────────────────────────────────────
  return (
    <div class="knowledge-view">
      {/* Header with refresh button */}
      <div class="knowledge-header">
        <h3>Project Knowledge</h3>
        <button
          class="btn btn-secondary btn-sm"
          disabled={refreshing}
          onClick={() => {
            knowledgeRefreshing.value = true;
            bridge.send({ type: 'refreshKnowledge' });
          }}
        >
          {refreshing ? (
            <>
              <Icon name="loading" size={12} spin /> Refreshing...
            </>
          ) : (
            <>
              <Icon name="refresh" size={12} /> Refresh All
            </>
          )}
        </button>
      </div>

      {/* Existing knowledge files */}
      <div class="knowledge-file-list">
        {existingFiles.map((file) => (
          <KnowledgeFileCard key={file.name} file={file} />
        ))}
      </div>

      {/* Missing files section */}
      {missingFiles.length > 0 && (
        <div class="knowledge-missing">
          <div class="knowledge-section-label">Not Created Yet</div>
          {missingFiles.map((file) => (
            <div key={file.name} class="knowledge-missing-item">
              <Icon name="circle-outline" size={12} class="task-card-icon--pending" />
              <span class="knowledge-missing-name">{file.name}</span>
              <span class="knowledge-missing-hint">
                Click "Refresh All" or run a workflow to generate
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Knowledge File Card ────────────────────────────────────────────────────

const KnowledgeFileCard: FunctionalComponent<{ file: KnowledgeFileInfo }> = ({ file }) => {
  const iconName = FILE_ICONS[file.name] ?? 'file-text';

  return (
    <div class="knowledge-file-card">
      <div class="knowledge-file-card-header">
        <Icon name={iconName} size={16} />
        <span class="knowledge-file-name">{file.name}</span>
      </div>
      {file.preview && <div class="knowledge-file-preview">{file.preview}</div>}
      <div class="knowledge-file-actions">
        <button
          class="btn btn-secondary btn-sm"
          onClick={() => bridge.send({ type: 'openKnowledgeFile', fileName: file.path })}
        >
          Open
        </button>
      </div>
    </div>
  );
};
