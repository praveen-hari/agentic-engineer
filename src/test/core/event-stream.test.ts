import { describe, it, expect, beforeEach } from 'vitest';
import { EventStream } from '../../core/event-stream';
import { InMemoryFileIO } from '../../test-utils/in-memory-file-io';
import type { WorkflowEvent } from '../../core/types';

describe('EventStream', () => {
  let fs: InMemoryFileIO;
  let stream: EventStream;

  beforeEach(() => {
    fs = new InMemoryFileIO();
    stream = new EventStream(fs, '/project/.codestudio/events.jsonl');
  });

  describe('append', () => {
    it('writes a single event as a JSON line to the events file', async () => {
      const event: WorkflowEvent = {
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: { objective: 'Fix typo' },
      };

      await stream.append(event);

      const content = await fs.read('/project/.codestudio/events.jsonl');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(JSON.parse(lines[0])).toEqual(event);
    });

    it('appends multiple events as separate JSON lines', async () => {
      await stream.append({
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: {},
      });
      await stream.append({
        id: 'evt-002',
        timestamp: '2026-07-11T10:01:00Z',
        type: 'stage.entered',
        workflowId: 'wf-001',
        payload: { stage: 'plan' },
      });

      const content = await fs.read('/project/.codestudio/events.jsonl');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).id).toBe('evt-001');
      expect(JSON.parse(lines[1]).id).toBe('evt-002');
    });

    it('creates the directory if it does not exist', async () => {
      await stream.append({
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: {},
      });

      expect(await fs.exists('/project/.codestudio/events.jsonl')).toBe(true);
    });
  });

  describe('read', () => {
    it('returns an empty array when the file does not exist', async () => {
      const events = await stream.read();
      expect(events).toEqual([]);
    });

    it('reads all events from an existing file', async () => {
      await stream.append({
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: {},
      });
      await stream.append({
        id: 'evt-002',
        timestamp: '2026-07-11T10:01:00Z',
        type: 'stage.entered',
        workflowId: 'wf-001',
        payload: {},
      });

      const events = await stream.read();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('evt-001');
      expect(events[1].id).toBe('evt-002');
    });

    it('skips invalid JSON lines without crashing', async () => {
      // Manually write a file with a corrupt line
      await fs.mkdir('/project/.codestudio');
      await fs.write(
        '/project/.codestudio/events.jsonl',
        [
          '{"id":"evt-001","timestamp":"2026-07-11T10:00:00Z","type":"workflow.created","workflowId":"wf-001","payload":{}}',
          'THIS IS NOT VALID JSON',
          '{"id":"evt-002","timestamp":"2026-07-11T10:01:00Z","type":"stage.entered","workflowId":"wf-001","payload":{}}',
        ].join('\n'),
      );

      const events = await stream.read();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('evt-001');
      expect(events[1].id).toBe('evt-002');
    });

    it('handles empty file gracefully', async () => {
      await fs.mkdir('/project/.codestudio');
      await fs.write('/project/.codestudio/events.jsonl', '');

      const events = await stream.read();
      expect(events).toEqual([]);
    });
  });

  describe('replay', () => {
    it('returns events in chronological order (append order)', async () => {
      await stream.append({
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: {},
      });
      await stream.append({
        id: 'evt-002',
        timestamp: '2026-07-11T10:01:00Z',
        type: 'stage.entered',
        workflowId: 'wf-001',
        payload: {},
      });
      await stream.append({
        id: 'evt-003',
        timestamp: '2026-07-11T10:02:00Z',
        type: 'stage.completed',
        workflowId: 'wf-001',
        payload: {},
      });

      const events = await stream.replay();
      expect(events.map((e) => e.id)).toEqual(['evt-001', 'evt-002', 'evt-003']);
    });

    it('returns events filtered by workflow ID', async () => {
      await stream.append({
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: {},
      });
      await stream.append({
        id: 'evt-002',
        timestamp: '2026-07-11T10:01:00Z',
        type: 'workflow.created',
        workflowId: 'wf-002',
        payload: {},
      });

      const events = await stream.replay('wf-001');
      expect(events).toHaveLength(1);
      expect(events[0].workflowId).toBe('wf-001');
    });

    it('returns empty array for non-existent workflow ID', async () => {
      await stream.append({
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'workflow.created',
        workflowId: 'wf-001',
        payload: {},
      });

      const events = await stream.replay('wf-nonexistent');
      expect(events).toEqual([]);
    });
  });

  describe('round-trip integrity', () => {
    it('can read back exactly what was appended', async () => {
      const event: WorkflowEvent = {
        id: 'evt-001',
        timestamp: '2026-07-11T10:00:00Z',
        type: 'approval.granted',
        workflowId: 'wf-001',
        payload: {
          artifact: 'spec',
          by: 'user',
          comment: 'Looks good',
        },
      };

      await stream.append(event);
      const [read] = await stream.read();

      expect(read).toEqual(event);
    });
  });
});
