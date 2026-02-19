/**
 * useBacklogPatchImport
 *
 * Automatically applies docs/backlog-patch-*.json files when the backlog page loads.
 * This lets Claude update backlog items (status, priority, title, details) by
 * committing a JSON file to docs/ and pushing — no service role key required.
 *
 * Deduplication: applied patch filenames are stored in localStorage under
 * "backlog-patches-applied" so each patch runs exactly once per browser.
 *
 * Supported operations in each patch file:
 *   { "op": "update_status",   "id": "<uuid>", "status": "<new status>" }
 *   { "op": "update_priority", "id": "<uuid>", "priority": "<new priority>" }
 *   { "op": "update_title",    "id": "<uuid>", "title": "<new title>" }
 *   { "op": "update_details",  "id": "<uuid>", "details": "<new details>" }
 *
 * Schema for docs/backlog-patch-YYYY-MM-DD-N.json:
 * {
 *   "description": "Human readable reason for this patch",
 *   "operations": [ { "op": "...", "id": "...", ... }, ... ]
 * }
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type PatchOperation =
  | { op: 'update_status';   id: string; status: string }
  | { op: 'update_priority'; id: string; priority: string }
  | { op: 'update_title';    id: string; title: string }
  | { op: 'update_details';  id: string; details: string };

type PatchFile = {
  description?: string;
  operations: PatchOperation[];
};

// Statically import all backlog patch files at build time via Vite glob
// Each key is the full module path; the value is the parsed JSON.
const ALL_PATCHES = import.meta.glob<PatchFile>('/docs/backlog-patch-*.json', {
  eager: true,
  import: 'default',
});

const LS_KEY = 'backlog-patches-applied';

const getApplied = (): Set<string> => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const markApplied = (filename: string): void => {
  const applied = getApplied();
  applied.add(filename);
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(applied)));
};

const applyOperation = async (op: PatchOperation): Promise<void> => {
  const updates: Record<string, string> = {};
  if (op.op === 'update_status')   updates.status   = op.status;
  if (op.op === 'update_priority') updates.priority = op.priority;
  if (op.op === 'update_title')    updates.title    = op.title;
  if (op.op === 'update_details')  updates.details  = op.details;

  const { error } = await supabase
    .from('researcher_backlog_items')
    .update(updates)
    .eq('id', op.id);

  if (error) throw new Error(`[${op.op}] ${op.id}: ${error.message}`);
};

/**
 * Call this hook inside ResearcherErrorLog (or any component that mounts
 * when the researcher accesses the backlog).
 * It is a no-op when there are no new patches.
 */
export const useBacklogPatchImport = (enabled: boolean) => {
  const queryClient = useQueryClient();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!enabled || ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      const applied = getApplied();

      // Sort patch filenames for deterministic order
      const pending = Object.entries(ALL_PATCHES)
        .map(([path, data]) => ({ filename: path.split('/').pop() ?? path, data }))
        .filter(({ filename }) => !applied.has(filename))
        .sort((a, b) => a.filename.localeCompare(b.filename));

      if (pending.length === 0) return;

      let applied_count = 0;
      for (const { filename, data } of pending) {
        try {
          for (const op of data.operations ?? []) {
            await applyOperation(op);
          }
          markApplied(filename);
          applied_count++;
        } catch (err) {
          console.error('[backlog-patch] Failed to apply', filename, err);
          toast.error(`Backlog patch failed: ${filename}`);
          // Stop on first error to avoid partial application of later patches
          break;
        }
      }

      if (applied_count > 0) {
        queryClient.invalidateQueries({ queryKey: ['researcher-backlog-items'] });
        console.log(`[backlog-patch] Applied ${applied_count} patch(es)`);
      }
    };

    void run();
  }, [enabled, queryClient]);
};
