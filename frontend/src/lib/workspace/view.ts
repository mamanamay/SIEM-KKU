import { writable } from 'svelte/store';

export interface RowSnapshot {
  id: string;
  title: string;
  fields: { label: string; value: string }[];
}

// Presentation state only: no event store, API requests or persisted row data.
export const workspaceView = writable<{
  preview: RowSnapshot | null;
  comparison: RowSnapshot[];
  comparing: boolean;
  compact: boolean;
}>({ preview: null, comparison: [], comparing: false, compact: false });

export function previewRow(row: RowSnapshot) {
  workspaceView.update(s => ({ ...s, preview: row, comparing: false }));
}

export function compareRow(row: RowSnapshot) {
  workspaceView.update(s => {
    const existing = s.comparison.some(r => r.id === row.id);
    return { ...s, comparison: existing ? s.comparison.filter(r => r.id !== row.id) : [...s.comparison.slice(-1), row] };
  });
}

export function closeWorkspacePanel() {
  workspaceView.update(s => ({ ...s, preview: null, comparing: false }));
}

export function resetWorkspacePage() {
  workspaceView.update(s => ({ ...s, preview: null, comparison: [], comparing: false }));
}
