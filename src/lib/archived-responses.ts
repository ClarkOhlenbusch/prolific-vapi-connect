/**
 * Helpers to exclude archived records from researcher views.
 * Archived rows are stored in archived_responses; we filter by original_id (participant_calls)
 * and by (prolific_id, call_id) for experiment_responses.
 */

import { supabase } from '@/integrations/supabase/client';

const PARTICIPANT_CALLS_TABLE = 'participant_calls';

export interface ArchivedFilters {
  /** participant_calls.id that have been archived */
  archivedParticipantCallIds: Set<string>;
  /** Keys "prolific_id|call_id" for archived completed responses (from archived_data) */
  archivedResponseKeys: Set<string>;
}

/**
 * Fetches archived_responses where original_table = 'participant_calls' and returns
 * sets of archived participant call IDs and (prolific_id, call_id) keys for filtering.
 */
export async function fetchArchivedFilters(): Promise<ArchivedFilters> {
  const { data, error } = await supabase
    .from('archived_responses')
    .select('original_id, archived_data')
    .eq('original_table', PARTICIPANT_CALLS_TABLE);

  if (error) {
    console.warn('Failed to fetch archived responses for filtering:', error.message);
    return { archivedParticipantCallIds: new Set(), archivedResponseKeys: new Set() };
  }

  const archivedParticipantCallIds = new Set<string>();
  const archivedResponseKeys = new Set<string>();

  (data || []).forEach((row) => {
    if (row.original_id) archivedParticipantCallIds.add(String(row.original_id));
    const d = row.archived_data as { prolific_id?: string; call_id?: string } | null;
    if (d?.prolific_id != null && d?.call_id != null) {
      archivedResponseKeys.add(`${d.prolific_id}|${d.call_id}`);
    }
  });

  return { archivedParticipantCallIds, archivedResponseKeys };
}

export function isResponseArchived(
  prolificId: string,
  callId: string,
  archivedResponseKeys: Set<string>
): boolean {
  return archivedResponseKeys.has(`${prolificId}|${callId}`);
}
