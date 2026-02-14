import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  ArrowLeft, 
  FlaskConical, 
  Plus, 
  Pencil, 
  Trash2, 
  X, 
  Check,
  Loader2,
  FileJson,
  ChevronDown,
  Package,
  ExternalLink,
  Flag,
  Eye,
  Download,
  History,
  ChevronRight
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const GITHUB_REPO = (import.meta.env.VITE_GITHUB_REPO as string) || 'ClarkOhlenbusch/prolific-vapi-connect';
const VISITED_COMMITS_KEY = 'changelog-visited-commit-ids';
const LAST_ENTRY_KEY = 'changelog-last-clicked-entry-id';
const AUTO_MARK_RELEASE_SETTING_KEY = 'auto_mark_release_on_push';

function commitUrl(hash: string) {
  const clean = hash.trim().replace(/^https:\/\/github\.com\/[^/]+\/[^/]+\/commit\//i, '').split('/')[0];
  return `https://github.com/${GITHUB_REPO}/commit/${clean}`;
}

/** Compare version strings (e.g. 1.1, 1.2, 1.1.4) segment-by-segment; returns -1 | 0 | 1 */
function compareVersions(va: string, vb: string): number {
  const parts = (v: string) => (v || '').split('.').map(p => parseInt(p, 10) || 0);
  const a = parts(va);
  const b = parts(vb);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const na = a[i] ?? 0;
    const nb = b[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

function getVisitedSet(): Set<string> {
  try {
    const raw = sessionStorage.getItem(VISITED_COMMITS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markVisited(changeId: string) {
  const set = getVisitedSet();
  set.add(changeId);
  try {
    sessionStorage.setItem(VISITED_COMMITS_KEY, JSON.stringify([...set]));
  } catch {}
}

function formatPushTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatDetailsForEditor(details: Json | null): string {
  if (details === null || details === undefined) return '';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

function parseDetailsFromEditor(input: string): Json | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as Json;
  } catch {
    return { summary_simple: trimmed };
  }
}

function getDetailString(details: Json | null, key: string): string | null {
  if (!isObject(details)) return null;
  const value = details[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getDetailStringArray(details: Json | null, key: string): string[] {
  if (!isObject(details)) return [];
  const value = details[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
}

function parseBooleanSetting(value: string | null | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}
import { toast } from 'sonner';

type ChangeType = 'added' | 'changed' | 'fixed' | 'removed';
type ChangeScope = 'participant' | 'researcher' | 'both';
type ReleaseStatus = 'committed' | 'pushed' | 'released';

const releaseStatusOrder: Record<ReleaseStatus, number> = {
  committed: 0,
  pushed: 1,
  released: 2,
};

function normalizeReleaseStatus(value: unknown): ReleaseStatus {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (raw === 'committed' || raw === 'local_only') return 'committed';
  if (raw === 'released' || raw === 'deployed') return 'released';
  // Default to pushed for historical entries and unknown values.
  return 'pushed';
}

interface ChangelogChange {
  id: string;
  entry_id: string;
  change_type: ChangeType;
  description: string;
  display_order: number;
  created_at: string;
  pushed_at: string | null;
  details: Json | null;
  scope: ChangeScope;
  commit_hash?: string | null;
}

interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  description: string | null;
  active_batch_label: string | null;
  release_status: ReleaseStatus;
  created_at: string;
  changes: ChangelogChange[];
  reviewed?: boolean;
  flagged?: boolean;
}

type ChangelogEntryWithInferred = ChangelogEntry & { inferredBatchLabel: string | null };
type ChangelogChangeWithPush = ChangelogChange & { pushed_at: string };
type ChangelogVersionGroup = {
  id: string;
  version: string;
  release_date: string;
  description: string | null;
  active_batch_label: string | null;
  inferredBatchLabel: string | null;
  created_at: string;
  release_status: ReleaseStatus;
  reviewedAll: boolean;
  flaggedAny: boolean;
  entryIds: string[];
  primaryEntryId: string;
  changes: ChangelogChangeWithPush[];
};

type SystemDesignManifest = {
  schema_version?: number;
  generated_at?: string;
  latest_snapshot?: string | null;
  latest_diff?: string | null;
  snapshots?: string[];
  diffs?: string[];
};

const typeColors: Record<ChangeType, string> = {
  added: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  changed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fixed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  removed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const scopeLabels: Record<ChangeScope, string> = {
  participant: 'Participant',
  researcher: 'Researcher',
  both: 'Both',
};
const scopeColors: Record<ChangeScope, string> = {
  participant: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  researcher: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  both: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

const releaseStatusMeta: Record<ReleaseStatus, { label: string; className: string }> = {
  committed: { label: 'Committed', className: 'border-amber-600/40 text-amber-700' },
  pushed: { label: 'Pushed', className: 'border-sky-600/40 text-sky-700' },
  released: { label: 'Deployed', className: 'border-green-600/40 text-green-700' },
};

const ResearcherChangelog = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isSuperAdmin, isGuestMode } = useResearcherAuth();
  
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showCreateBatchDialog, setShowCreateBatchDialog] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchNotes, setNewBatchNotes] = useState('');
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'entry' | 'change'; id: string } | { type: 'entries'; ids: string[] } | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'participant' | 'researcher'>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [lastRemovedDuplicates, setLastRemovedDuplicates] = useState<number | null>(null);
  const [visitedCommitIds, setVisitedCommitIds] = useState<Set<string>>(getVisitedSet);
  const [showApplyEditsDialog, setShowApplyEditsDialog] = useState(false);
  const [applyEditsJsonText, setApplyEditsJsonText] = useState('');
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeFromVersion, setMergeFromVersion] = useState('');
  const [mergeToVersion, setMergeToVersion] = useState('');
  const [mergeTargetVersion, setMergeTargetVersion] = useState('');
  const [mergeDescription, setMergeDescription] = useState('');
  const entryRefsMap = useRef<Record<string, HTMLDivElement | null>>({});

  // Form state for new/edit entry
  const [entryForm, setEntryForm] = useState({ version: '', release_date: '', description: '', active_batch_label: '' });
  const [newChanges, setNewChanges] = useState<{ type: ChangeType; description: string; scope: ChangeScope; commit_hash?: string | null; details_text?: string }[]>([]);
  
  // Inline editing state
  const [editingChange, setEditingChange] = useState<{ id: string; type: ChangeType; description: string; scope: ChangeScope; commit_hash?: string | null; details_text: string } | null>(null);
  const [expandedChangeIds, setExpandedChangeIds] = useState<Set<string>>(new Set());

  // Fetch changelog entries with changes
  const { data: entriesRaw = [], isLoading } = useQuery({
    queryKey: ['changelog-entries'],
    queryFn: async () => {
      const { data: entriesData, error: entriesError } = await supabase
        .from('changelog_entries')
        .select('*')
        .order('release_date', { ascending: false });
      
      if (entriesError) throw entriesError;
      
      const { data: changesData, error: changesError } = await supabase
        .from('changelog_changes')
        .select('*')
        .order('display_order', { ascending: true });
      
      if (changesError) throw changesError;
      
      return entriesData.map(entry => ({
        ...entry,
        release_status: normalizeReleaseStatus((entry as any).release_status),
        changes: changesData.filter(c => c.entry_id === entry.id) as ChangelogChange[]
      })) as ChangelogEntry[];
    }
  });

  const entries = entriesRaw;

  const { data: autoMarkReleaseOnPush = true, isLoading: isAutoMarkReleaseLoading } = useQuery({
    queryKey: ['changelog-auto-mark-release-on-push'],
    queryFn: async () => {
      if (isGuestMode) return true;
      const { data, error } = await supabase
        .from('experiment_settings')
        .select('setting_value')
        .eq('setting_key', AUTO_MARK_RELEASE_SETTING_KEY)
        .maybeSingle();

      if (error) throw error;
      return parseBooleanSetting(data?.setting_value, true);
    },
    enabled: !!user,
  });

  const updateAutoMarkReleaseMutation = useMutation({
    mutationFn: async (nextValue: boolean) => {
      if (isGuestMode) return;
      const { error } = await supabase
        .from('experiment_settings')
        .upsert(
          {
            setting_key: AUTO_MARK_RELEASE_SETTING_KEY,
            setting_value: String(nextValue),
            updated_at: new Date().toISOString(),
            updated_by: user?.id ?? null,
          },
          { onConflict: 'setting_key' },
        );
      if (error) throw error;
    },
    onSuccess: (_, nextValue) => {
      queryClient.invalidateQueries({ queryKey: ['changelog-auto-mark-release-on-push'] });
      toast.success(nextValue ? 'Pushes will be auto-marked as released' : 'Pushes will stay in pushed state');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update release automation setting');
    },
  });

  const updateReleaseStatusMutation = useMutation({
    mutationFn: async (payload: { entryIds: string[]; release_status: ReleaseStatus }) => {
      if (isGuestMode) return;
      if (!isSuperAdmin) throw new Error('Only super admins can change release status.');
      const { error } = await supabase
        .from('changelog_entries')
        .update({ release_status: payload.release_status })
        .in('id', payload.entryIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      toast.success('Release status updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update release status');
    },
  });

  const {
    data: systemDesignManifest = null,
    isLoading: isSystemDesignManifestLoading,
    refetch: refetchSystemDesignManifest,
  } = useQuery({
    queryKey: ['system-design-manifest'],
    queryFn: async () => {
      const response = await fetch('/system-design/manifest.json');
      if (!response.ok) throw new Error('Manifest not available');
      const parsed = (await response.json()) as SystemDesignManifest;
      return parsed;
    },
    retry: false,
  });

  const { data: experimentBatches = [] } = useQuery({
    queryKey: ['experiment-batches-for-changelog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('experiment_batches')
        .select('name, created_at')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { name: string; created_at: string }[];
    },
  });

  const { data: importedSourceKeys = [], isError: importedSourceKeysQueryError, isSuccess: importedSourceKeysQuerySuccess } = useQuery({
    queryKey: ['changelog-imported-sources'],
    queryFn: async () => {
      const { data, error } = await supabase.from('changelog_imported_sources').select('source_key');
      if (error) throw error;
      return (data ?? []).map((r) => r.source_key);
    },
    retry: false,
  });
  const autoImportRunOnceRef = useRef(false);

  const getBatchActiveOnDate = useMemo(() => {
    if (experimentBatches.length === 0) return (_: string) => null as string | null;
    const sorted = [...experimentBatches].sort((a, b) => a.created_at.localeCompare(b.created_at));
    return (releaseDate: string) => {
      const d = releaseDate.slice(0, 10);
      for (let i = 0; i < sorted.length; i++) {
        const batchDate = sorted[i].created_at.slice(0, 10);
        const nextDate = i + 1 < sorted.length ? sorted[i + 1].created_at.slice(0, 10) : null;
        if (d >= batchDate && (nextDate === null || d < nextDate)) return sorted[i].name;
      }
      return null;
    };
  }, [experimentBatches]);

  const batchOptions = useMemo(() => {
    const labels = new Set<string>();
    experimentBatches.forEach(b => labels.add(b.name));
    entries.forEach(e => {
      const v = e.active_batch_label?.trim();
      if (v) labels.add(v);
    });
    return Array.from(labels).sort();
  }, [entries, experimentBatches]);

  const logImportAttempt = async (sourceKey: string, status: 'success' | 'failure', errorMessage: string | null) => {
    await supabase.from('changelog_import_attempts').insert({ source_key: sourceKey, status, error_message: errorMessage });
  };

  const { data: importAttempts = [] } = useQuery({
    queryKey: ['changelog-import-attempts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('changelog_import_attempts')
        .select('id, source_key, status, error_message, attempted_at')
        .is('archived_at', null)
        .order('attempted_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as { id: string; source_key: string; status: string; error_message: string | null; attempted_at: string }[];
    },
  });

  const archiveImportAttemptsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('changelog_import_attempts')
        .update({ archived_at: new Date().toISOString() } as Record<string, unknown>)
        .is('archived_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-import-attempts'] });
      toast.success('Import attempts archived');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const validScopes = ['participant', 'researcher', 'both'] as const;
  type ImportChange = { type: string; description: string; scope?: string; commit_hash?: string; pushed_at?: string; details?: Json };
  const normalizeChangelogEntry = (obj: { version?: string; release_date?: string; description?: string; active_batch_label?: string; release_status?: string; changes?: ImportChange[] }) => {
    const version = typeof obj.version === 'string' ? obj.version.trim() : '';
    const release_date = typeof obj.release_date === 'string' ? obj.release_date.trim() : '';
    const description = typeof obj.description === 'string' ? obj.description.trim() : undefined;
    const active_batch_label = typeof obj.active_batch_label === 'string' ? obj.active_batch_label.trim() : undefined;
    const release_status = normalizeReleaseStatus(obj.release_status);
    const rawChanges = Array.isArray(obj.changes) ? obj.changes : [];
    const changes = rawChanges
      .filter((c): c is ImportChange & { type: ChangeType } =>
        c && typeof c.type === 'string' && ['added', 'changed', 'fixed', 'removed'].includes(c.type) && typeof c.description === 'string'
      )
      .map((c) => ({
        type: c.type as ChangeType,
        description: String(c.description).trim(),
        scope: (validScopes.includes(c.scope as ChangeScope) ? c.scope : 'both') as ChangeScope,
        commit_hash: typeof c.commit_hash === 'string' ? (c.commit_hash.trim() || undefined) : undefined,
        pushed_at: typeof c.pushed_at === 'string' ? (c.pushed_at.trim() || undefined) : undefined,
        details: c.details ?? null,
      }))
      .filter((c) => c.description.length > 0);
    return { version, release_date, description, active_batch_label, release_status, changes };
  };

  const upsertChangelogVersionEntry = async (data: {
    version: string;
    release_date: string;
    description?: string;
    active_batch_label?: string;
    release_status?: ReleaseStatus;
    changes: { type: ChangeType; description: string; scope?: ChangeScope; commit_hash?: string; pushed_at?: string; details?: Json | null }[];
  }) => {
    const version = data.version.trim();
    const releaseDate = data.release_date.trim();
    const description = data.description?.trim() || null;
    const activeBatchLabel = data.active_batch_label?.trim() || null;
    const incomingReleaseStatus = data.release_status ? normalizeReleaseStatus(data.release_status) : null;

    // Backwards compatible with older DBs where changelog_entries.release_status doesn't exist yet.
    let existingEntry: { id: string; release_date: string; release_status?: string | null } | null = null;
    {
      const query = supabase
        .from('changelog_entries')
        .select('id, release_date, release_status')
        .eq('version', version)
        .order('created_at', { ascending: false })
        .limit(1);
      const result = await query.maybeSingle();
      if (result.error && /release_status/i.test(result.error.message || '')) {
        const fallback = await supabase
          .from('changelog_entries')
          .select('id, release_date')
          .eq('version', version)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallback.error) throw fallback.error;
        existingEntry = fallback.data as any;
      } else {
        if (result.error) throw result.error;
        existingEntry = result.data as any;
      }
    }

    let entryId = existingEntry?.id ?? null;

    if (entryId) {
      const nextReleaseDate = existingEntry.release_date > releaseDate ? existingEntry.release_date : releaseDate;
      const updatePayload: Record<string, unknown> = {
        release_date: nextReleaseDate,
      };
      if (description !== null) updatePayload.description = description;
      if (activeBatchLabel !== null) updatePayload.active_batch_label = activeBatchLabel;
      if (incomingReleaseStatus) {
        const current = normalizeReleaseStatus((existingEntry as any).release_status);
        const next =
          releaseStatusOrder[incomingReleaseStatus] > releaseStatusOrder[current]
            ? incomingReleaseStatus
            : current;
        updatePayload.release_status = next;
      }

      {
        const res = await supabase.from('changelog_entries').update(updatePayload).eq('id', entryId);
        if (res.error) {
          // If the DB doesn't have release_status yet, retry without it.
          if (incomingReleaseStatus && /release_status/i.test(res.error.message || '')) {
            const { release_status: _ignored, ...withoutStatus } = updatePayload;
            const retry = await supabase.from('changelog_entries').update(withoutStatus).eq('id', entryId);
            if (retry.error) throw retry.error;
          } else {
            throw res.error;
          }
        }
      }
    } else {
      const insertPayload: Record<string, unknown> = {
        version,
        release_date: releaseDate,
        description,
        active_batch_label: activeBatchLabel,
        release_status: incomingReleaseStatus ?? 'pushed',
        created_by: user?.id ?? null,
      };
      const inserted = await supabase.from('changelog_entries').insert(insertPayload).select('id').single();
      if (inserted.error) {
        if (/release_status/i.test(inserted.error.message || '')) {
          delete insertPayload.release_status;
          const retry = await supabase.from('changelog_entries').insert(insertPayload).select('id').single();
          if (retry.error) throw retry.error;
          entryId = (retry.data as any).id;
        } else {
          throw inserted.error;
        }
      } else {
        entryId = (inserted.data as any).id;
      }
    }

    if (data.changes.length === 0) return entryId;

    const { data: lastChange, error: lastChangeError } = await supabase
      .from('changelog_changes')
      .select('display_order')
      .eq('entry_id', entryId)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastChangeError) throw lastChangeError;

    const nextDisplayOrder = (lastChange?.display_order ?? -1) + 1;
    const { error: insertChangesError } = await supabase.from('changelog_changes').insert(
      data.changes.map((change, index) => ({
        entry_id: entryId,
        change_type: change.type,
        description: change.description,
        display_order: nextDisplayOrder + index,
        scope: change.scope ?? 'both',
        commit_hash: change.commit_hash?.trim() || null,
        pushed_at: change.pushed_at?.trim() || new Date().toISOString(),
        details: change.details ?? null,
      })),
    );
    if (insertChangesError) throw insertChangesError;

    return entryId;
  };

  const runImportForFile = async (name: string): Promise<{ ok: boolean; errorMessage: string | null }> => {
    const url = `/changelog/${encodeURIComponent(name)}`;
    let raw: string;
    try {
      const r = await fetch(url);
      console.log('[changelog import] fetch', url, 'status', r.status, r.statusText);
      if (!r.ok) return { ok: false, errorMessage: `Fetch failed: ${r.status} ${r.statusText}` };
      raw = await r.text();
    } catch (e) {
      console.error('[changelog import] fetch error', url, e);
      return { ok: false, errorMessage: e instanceof Error ? e.message : 'Fetch failed' };
    }
    const trimmed = raw.trim();
    console.log('[changelog import] response preview', trimmed.startsWith('<') ? '(HTML)' : raw.slice(0, 120) + (raw.length > 120 ? '...' : ''));
    if (trimmed.startsWith('<')) {
      return { ok: false, errorMessage: 'Server returned HTML (file not found or wrong path), not JSON. Restart dev server or redeploy so /changelog/ files are served.' };
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ok: false, errorMessage: e instanceof Error ? e.message : 'Invalid JSON' };
    }
    const parsedEntries = Array.isArray(data) ? data.map(normalizeChangelogEntry) : [normalizeChangelogEntry(data as Parameters<typeof normalizeChangelogEntry>[0])];
    const valid = parsedEntries.filter((e) => e.version && e.release_date);
    if (valid.length === 0) return { ok: false, errorMessage: 'No entries with version and release_date' };
    for (const { version, release_date, description, active_batch_label, release_status, changes } of valid) {
      const normalizedStatus = normalizeReleaseStatus(release_status);
      const effectiveStatus =
        normalizedStatus === 'pushed' && autoMarkReleaseOnPush ? ('released' as const) : normalizedStatus;
      try {
        await upsertChangelogVersionEntry({
          version,
          release_date,
          description,
          active_batch_label,
          release_status: effectiveStatus,
          changes: changes.map((change) => ({
            ...change,
            pushed_at: change.pushed_at ?? new Date().toISOString(),
            details: change.details ?? { summary_simple: 'Imported from JSON file' },
          })),
        });
      } catch (error) {
        return { ok: false, errorMessage: error instanceof Error ? error.message : 'Failed to upsert changelog entry' };
      }
    }
    return { ok: true, errorMessage: null };
  };

  const retryImportMutation = useMutation({
    mutationFn: async (sourceKey: string) => {
      const result = await runImportForFile(sourceKey);
      if (!result.ok) throw new Error(result.errorMessage ?? 'Import failed');
      await supabase.from('changelog_imported_sources').insert({ source_key: sourceKey });
      await logImportAttempt(sourceKey, 'success', null);
    },
    onSuccess: (sourceKey) => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      queryClient.invalidateQueries({ queryKey: ['changelog-imported-sources'] });
      queryClient.invalidateQueries({ queryKey: ['changelog-import-attempts'] });
      toast.success(`Imported ${sourceKey}`);
    },
    onError: async (err: Error, sourceKey) => {
      await logImportAttempt(sourceKey, 'failure', err.message);
      queryClient.invalidateQueries({ queryKey: ['changelog-import-attempts'] });
      toast.error(err.message);
    },
  });

  // Auto-import new changelog JSON files (copied from docs/ to public/changelog at build time; Lovable deploys them with the site).
  // Run at most once per page load to avoid a loop when changelog_imported_sources is missing or invalidated.
  useEffect(() => {
    if (!user || isGuestMode) {
      console.log('[changelog auto-import] skip: no user or guest mode');
      return;
    }
    if (importedSourceKeysQueryError) {
      console.log('[changelog auto-import] skip: imported sources query error (table may not exist)');
      return;
    }
    if (!importedSourceKeysQuerySuccess) {
      console.log('[changelog auto-import] skip: waiting for imported sources query');
      return;
    }
    if (autoImportRunOnceRef.current) {
      console.log('[changelog auto-import] skip: already ran once this load');
      return;
    }
    autoImportRunOnceRef.current = true;

    const run = async () => {
      let list: string[];
      try {
        const res = await fetch('/changelog/manifest.json');
        console.log('[changelog auto-import] manifest', res.ok ? 'ok' : res.status, res.statusText);
        if (!res.ok) return;
        list = (await res.json()) as string[];
      } catch (e) {
        console.error('[changelog auto-import] manifest fetch failed', e);
        return;
      }
      const changelogFiles = Array.isArray(list) ? list.filter((n) => typeof n === 'string' && n.startsWith('changelog-import-') && n.endsWith('.json')) : [];
      const mergeFiles = Array.isArray(list) ? list.filter((n) => typeof n === 'string' && n.startsWith('changelog-merge-') && n.endsWith('.json')) : [];
      const newImportFiles = changelogFiles.filter((name) => !importedSourceKeys.includes(name));
      const newMergeFiles = mergeFiles.filter((name) => !importedSourceKeys.includes(name));
      console.log('[changelog auto-import] manifest import files', changelogFiles.length, 'new', newImportFiles.length, 'merge files', mergeFiles.length, 'new merge', newMergeFiles.length);

      let importedCount = 0;
      for (const name of newImportFiles) {
        const result = await runImportForFile(name);
        console.log('[changelog auto-import]', name, result.ok ? 'ok' : 'failed', result.errorMessage ?? '');
        if (result.ok) {
          await supabase.from('changelog_imported_sources').insert({ source_key: name });
          await logImportAttempt(name, 'success', null);
          importedCount += 1;
        } else {
          await logImportAttempt(name, 'failure', result.errorMessage);
        }
      }
      if (importedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
        queryClient.invalidateQueries({ queryKey: ['changelog-imported-sources'] });
        queryClient.invalidateQueries({ queryKey: ['changelog-import-attempts'] });
        toast.success(importedCount === 1 ? '1 changelog file imported' : `${importedCount} changelog files imported`);
      }

      for (const name of newMergeFiles) {
        let raw: string;
        try {
          const r = await fetch(`/changelog/${encodeURIComponent(name)}`);
          if (!r.ok) {
            await logImportAttempt(name, 'failure', `Fetch ${r.status}`);
            continue;
          }
          raw = await r.text();
        } catch (e) {
          await logImportAttempt(name, 'failure', e instanceof Error ? e.message : 'Fetch failed');
          continue;
        }
        if (raw.trim().startsWith('<')) {
          await logImportAttempt(name, 'failure', 'Server returned HTML');
          continue;
        }
        let payload: { merge_versions?: { from_version?: string; to_version?: string; target_version?: string; description?: string } };
        try {
          payload = JSON.parse(raw);
        } catch {
          await logImportAttempt(name, 'failure', 'Invalid JSON');
          continue;
        }
        const m = payload.merge_versions;
        if (!m?.from_version?.trim() || !m?.to_version?.trim()) {
          await logImportAttempt(name, 'failure', 'Missing merge_versions.from_version or to_version');
          continue;
        }
        await queryClient.prefetchQuery({ queryKey: ['changelog-entries'] });
        const entriesFresh = queryClient.getQueryData(['changelog-entries']) as ChangelogEntry[] | undefined;
        try {
          await mergeVersionsMutation.mutateAsync({
            fromVersion: m.from_version.trim(),
            toVersion: m.to_version.trim(),
            targetVersion: (m.target_version || m.to_version || '').trim(),
            description: (m.description || '').trim(),
            entriesOverride: entriesFresh ?? [],
            fromAutoApply: true
          });
          await supabase.from('changelog_imported_sources').insert({ source_key: name });
          await logImportAttempt(name, 'success', null);
          queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
          queryClient.invalidateQueries({ queryKey: ['changelog-imported-sources'] });
          queryClient.invalidateQueries({ queryKey: ['changelog-import-attempts'] });
          toast.success(`Merge applied: ${name}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Merge failed';
          await logImportAttempt(name, 'failure', msg);
          toast.error(`${name}: ${msg}`);
        }
      }
    };
    run();
  }, [user, isGuestMode, importedSourceKeysQueryError, importedSourceKeysQuerySuccess, importedSourceKeys, queryClient]);

  const [availableChangelogFiles, setAvailableChangelogFiles] = useState<string[]>([]);
  const [testImportStatus, setTestImportStatus] = useState<string | null>(null);

  const runTestImport = async () => {
    setTestImportStatus('Running…');
    const testPayload = {
      version: '0.0.0-test',
      release_date: new Date().toISOString().slice(0, 10),
      description: 'Diagnostic test entry (safe to delete)',
      release_status: 'pushed',
      changes: [{ type: 'added' as const, description: 'Test change', scope: 'both' as const }]
    };
    const parsedEntries = [normalizeChangelogEntry(testPayload)];
    const valid = parsedEntries.filter((e) => e.version && e.release_date);
    if (valid.length === 0) {
      setTestImportStatus('Error: no valid entry');
      return;
    }
    try {
      for (const { version, release_date, description, active_batch_label, release_status, changes } of valid) {
        const normalizedStatus = normalizeReleaseStatus(release_status);
        const effectiveStatus =
          normalizedStatus === 'pushed' && autoMarkReleaseOnPush ? ('released' as const) : normalizedStatus;
        await upsertChangelogVersionEntry({
          version,
          release_date,
          description,
          active_batch_label,
          release_status: effectiveStatus,
          changes: changes.map((change) => ({
            ...change,
            pushed_at: change.pushed_at ?? new Date().toISOString(),
            details: change.details ?? { summary_simple: 'Diagnostic test change' },
          })),
        });
      }
      setTestImportStatus('Success');
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
    } catch (e) {
      setTestImportStatus(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const fetchManifestForDownload = async () => {
    try {
      const res = await fetch('/changelog/manifest.json');
      if (!res.ok) return;
      const list = (await res.json()) as string[];
      const files = Array.isArray(list) ? list.filter((n) => typeof n === 'string' && n.endsWith('.json')) : [];
      files.sort((a, b) => b.localeCompare(a));
      setAvailableChangelogFiles(files);
    } catch {
      setAvailableChangelogFiles([]);
    }
  };
  const downloadChangelogJson = (filename: string) => {
    fetch(`/changelog/${encodeURIComponent(filename)}`)
      .then((r) => r.text())
      .then((text) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast.error('Failed to download'));
  };

  const filteredAndSortedEntries = useMemo(() => {
    let list = entries.map(entry => ({
      ...entry,
      inferredBatchLabel: getBatchActiveOnDate(entry.release_date),
    }));
    if (batchFilter !== 'all') {
      if (batchFilter === '__none__') {
        list = list.filter(e => !e.active_batch_label?.trim() && !e.inferredBatchLabel);
      } else {
        list = list.filter(e =>
          (e.active_batch_label?.trim() ?? '') === batchFilter ||
          e.inferredBatchLabel === batchFilter
        );
      }
    }
    list = list.map(entry => {
      let changes = entry.changes;
      if (scopeFilter === 'participant') {
        changes = changes.filter(c => c.scope === 'participant' || c.scope === 'both');
      } else if (scopeFilter === 'researcher') {
        changes = changes.filter(c => c.scope === 'researcher' || c.scope === 'both');
      }
      return { ...entry, changes };
    }) as ChangelogEntryWithInferred[];
    if (scopeFilter !== 'all') {
      list = list.filter(e => e.changes.length > 0);
    }

    const groups = new Map<string, ChangelogVersionGroup>();
    for (const entry of list) {
      const versionKey = entry.version.trim();
      const pushedAt = entry.created_at || `${entry.release_date}T00:00:00.000Z`;
      const changesForEntry: ChangelogChangeWithPush[] = entry.changes.map((change) => ({
        ...change,
        pushed_at: change.pushed_at || change.created_at || pushedAt,
      }));

      const existing = groups.get(versionKey);
      if (!existing) {
        const groupStatus = normalizeReleaseStatus((entry as any).release_status);
        groups.set(versionKey, {
          id: versionKey,
          version: entry.version,
          release_date: entry.release_date,
          description: entry.description,
          active_batch_label: entry.active_batch_label,
          inferredBatchLabel: entry.inferredBatchLabel,
          created_at: pushedAt,
          release_status: groupStatus,
          reviewedAll: !!entry.reviewed,
          flaggedAny: !!entry.flagged,
          entryIds: [entry.id],
          primaryEntryId: entry.id,
          changes: changesForEntry,
        });
        continue;
      }

      existing.entryIds.push(entry.id);
      existing.reviewedAll = existing.reviewedAll && !!entry.reviewed;
      existing.flaggedAny = existing.flaggedAny || !!entry.flagged;
      existing.changes.push(...changesForEntry);
      {
        const incoming = normalizeReleaseStatus((entry as any).release_status);
        if (releaseStatusOrder[incoming] > releaseStatusOrder[existing.release_status]) {
          existing.release_status = incoming;
        }
      }
      if (entry.release_date > existing.release_date) existing.release_date = entry.release_date;
      if (pushedAt > existing.created_at) {
        existing.created_at = pushedAt;
        existing.primaryEntryId = entry.id;
        existing.description = entry.description;
        existing.active_batch_label = entry.active_batch_label;
        existing.inferredBatchLabel = entry.inferredBatchLabel;
      }
    }

    const sorted = Array.from(groups.values())
      .map((group) => ({
        ...group,
        changes: [...group.changes].sort((a, b) => {
          const aTime = Date.parse(a.pushed_at || '');
          const bTime = Date.parse(b.pushed_at || '');
          const aValid = Number.isFinite(aTime);
          const bValid = Number.isFinite(bTime);

          if (aValid && bValid && aTime !== bTime) {
            return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
          }
          if (aValid !== bValid) return aValid ? -1 : 1;

          return a.display_order - b.display_order;
        }),
      }))
      .sort((a, b) => {
        const createdCmp = (a.created_at || '').localeCompare(b.created_at || '');
        if (createdCmp !== 0) return sortOrder === 'desc' ? -createdCmp : createdCmp;
        const versionCmp = compareVersions(a.version || '', b.version || '');
        return sortOrder === 'desc' ? -versionCmp : versionCmp;
      });
    return sorted;
  }, [entries, batchFilter, scopeFilter, sortOrder, getBatchActiveOnDate]);

  const groupedEntryIdMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of filteredAndSortedEntries) map.set(group.id, group.entryIds);
    return map;
  }, [filteredAndSortedEntries]);

  const selectedResolvedEntryIds = useMemo(() => {
    const ids = new Set<string>();
    for (const selectedId of selectedEntryIds) {
      const sourceIds = groupedEntryIdMap.get(selectedId) ?? [selectedId];
      sourceIds.forEach((id) => ids.add(id));
    }
    return [...ids];
  }, [selectedEntryIds, groupedEntryIdMap]);

  // Add entry mutation
  const addEntryMutation = useMutation({
    mutationFn: async (data: { version: string; release_date: string; description?: string | null; active_batch_label?: string | null; changes: { type: ChangeType; description: string; scope?: ChangeScope; commit_hash?: string | null; pushed_at?: string; details?: Json | null }[] }) => {
      return upsertChangelogVersionEntry({
        version: data.version,
        release_date: data.release_date,
        description: data.description ?? undefined,
        active_batch_label: data.active_batch_label ?? undefined,
        changes: data.changes.map((change) => ({
          ...change,
          commit_hash: change.commit_hash ?? undefined,
          pushed_at: change.pushed_at ?? new Date().toISOString(),
          details: change.details ?? null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setShowAddEntry(false);
      setEntryForm({ version: '', release_date: '', description: '', active_batch_label: '' });
      setNewChanges([]);
      toast.success('Changelog updated');
    },
    onError: () => toast.error('Failed to add entry')
  });

  // Update entry mutation
  const updateEntryMutation = useMutation({
    mutationFn: async (data: { id: string; version: string; release_date: string; description?: string | null; active_batch_label?: string | null; reviewed?: boolean; flagged?: boolean }) => {
      const payload: Record<string, unknown> = {
        version: data.version,
        release_date: data.release_date,
        description: data.description?.trim() ?? null,
        active_batch_label: data.active_batch_label?.trim() ?? null
      };
      if (data.reviewed !== undefined) payload.reviewed = data.reviewed;
      if (data.flagged !== undefined) payload.flagged = data.flagged;
      const { error } = await supabase
        .from('changelog_entries')
        .update(payload)
        .eq('id', data.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setEditingEntry(null);
      toast.success('Entry updated');
    },
    onError: () => toast.error('Failed to update entry')
  });

  // Batch update entries (reviewed/flagged)
  const batchUpdateEntriesMutation = useMutation({
    mutationFn: async (data: { ids: string[]; reviewed?: boolean; flagged?: boolean }) => {
      if (data.ids.length === 0) return;
      const payload: Record<string, unknown> = {};
      if (data.reviewed !== undefined) payload.reviewed = data.reviewed;
      if (data.flagged !== undefined) payload.flagged = data.flagged;
      const { error } = await supabase
        .from('changelog_entries')
        .update(payload)
        .in('id', data.ids);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setSelectedEntryIds(new Set());
      toast.success(`${variables.ids.length} entr${variables.ids.length === 1 ? 'y' : 'ies'} updated`);
    },
    onError: () => toast.error('Failed to update entries')
  });

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('changelog_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setDeleteConfirm(null);
      toast.success('Entry deleted');
    },
    onError: () => toast.error('Failed to delete entry')
  });

  // Batch delete entries (selected release dates)
  const batchDeleteEntriesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      const { error } = await supabase.from('changelog_entries').delete().in('id', ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setSelectedEntryIds(new Set());
      setDeleteConfirm(null);
      toast.success(ids.length === 1 ? '1 entry deleted' : `${ids.length} entries deleted`);
    },
    onError: () => toast.error('Failed to delete entries')
  });

  const removeDuplicateEntriesMutation = useMutation({
    mutationFn: async () => {
      // RPC added in migration 20260211140000_rpc_remove_duplicate_changelog_entries
      const { data, error } = await (supabase as unknown as { rpc: (n: string) => Promise<{ data: number | null; error: { message: string } | null }> }).rpc('remove_duplicate_changelog_entries');
      if (error) throw error;
      return typeof data === 'number' ? data : 0;
    },
    onSuccess: (deletedCount) => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setLastRemovedDuplicates(deletedCount);
      toast.success(deletedCount === 0 ? 'No duplicate entries found' : `${deletedCount} duplicate ${deletedCount === 1 ? 'entry' : 'entries'} removed`);
    },
    onError: () => toast.error('Failed to remove duplicates')
  });

  const exportReleaseHistory = () => {
    const payload = {
      entries: entries.map((e) => ({
        id: e.id,
        version: e.version,
        release_date: e.release_date,
        description: e.description ?? '',
        active_batch_label: e.active_batch_label ?? '',
        changes: e.changes.map((c) => ({
          type: c.change_type,
          description: c.description,
          scope: c.scope,
          commit_hash: c.commit_hash ?? undefined,
          pushed_at: c.pushed_at ?? c.created_at,
          details: c.details ?? undefined,
        }))
      })),
      delete_entry_ids: [] as string[]
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `changelog-release-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  type ApplyEditsEntry = {
    id?: string;
    version: string;
    release_date: string;
    description?: string | null;
    active_batch_label?: string | null;
    changes: { type: string; description: string; scope?: string; commit_hash?: string; pushed_at?: string; details?: Json }[];
  };
  const applyEditsMutation = useMutation({
    mutationFn: async (payload: { entries: ApplyEditsEntry[]; delete_entry_ids?: string[] }) => {
      const { entries: edits, delete_entry_ids = [] } = payload;
      for (const entry of edits) {
        const version = (entry.version || '').trim();
        const release_date = (entry.release_date || '').trim();
        if (!version || !release_date) continue;
        const changes = (entry.changes || []).map((c, i) => ({
          change_type: ['added', 'changed', 'fixed', 'removed'].includes(c.type) ? c.type : 'changed',
          description: String(c.description || '').trim(),
          scope: (c.scope === 'participant' || c.scope === 'researcher' || c.scope === 'both') ? c.scope : 'both',
          display_order: i,
          commit_hash: c.commit_hash?.trim() || null,
          pushed_at: c.pushed_at?.trim() || new Date().toISOString(),
          details: c.details ?? null,
        })).filter((c) => c.description.length > 0);

        const existingById = entry.id ? (await supabase.from('changelog_entries').select('id').eq('id', entry.id).single()).data : null;
        const existingByVersion = !existingById ? (await supabase.from('changelog_entries').select('id').eq('version', version).eq('release_date', release_date).maybeSingle()).data : null;
        const existingId = existingById?.id ?? existingByVersion?.id ?? null;

        if (existingId) {
          await supabase.from('changelog_entries').update({
            version,
            release_date,
            description: (entry.description ?? '').trim() || null,
            active_batch_label: (entry.active_batch_label ?? '').trim() || null
          }).eq('id', existingId);
          await supabase.from('changelog_changes').delete().eq('entry_id', existingId);
          if (changes.length > 0) {
            await supabase.from('changelog_changes').insert(changes.map((c) => ({ ...c, entry_id: existingId })));
          }
        } else {
          const { data: newEntry, error: insertErr } = await supabase.from('changelog_entries').insert({
            version,
            release_date,
            description: (entry.description ?? '').trim() || null,
            active_batch_label: (entry.active_batch_label ?? '').trim() || null,
            created_by: user?.id ?? null
          }).select('id').single();
          if (insertErr) throw insertErr;
          if (newEntry && changes.length > 0) {
            await supabase.from('changelog_changes').insert(changes.map((c) => ({ ...c, entry_id: newEntry.id })));
          }
        }
      }
      if (delete_entry_ids.length > 0) {
        await supabase.from('changelog_changes').delete().in('entry_id', delete_entry_ids);
        const { error: delErr } = await supabase.from('changelog_entries').delete().in('id', delete_entry_ids);
        if (delErr) throw delErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setShowApplyEditsDialog(false);
      setApplyEditsJsonText('');
      toast.success('Edits applied');
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const mergeVersionsMutation = useMutation({
    mutationFn: async (params: { fromVersion: string; toVersion: string; targetVersion: string; description: string; entriesOverride?: ChangelogEntry[]; fromAutoApply?: boolean }) => {
      const { fromVersion, toVersion, targetVersion, description, entriesOverride } = params;
      const list = entriesOverride ?? entries;
      const inRange = list
        .filter((e) => {
          const v = e.version || '';
          return compareVersions(v, fromVersion) >= 0 && compareVersions(v, toVersion) <= 0;
        })
        .sort((a, b) => compareVersions(a.version || '', b.version || ''));
      if (inRange.length === 0) throw new Error('No entries in version range');
      const allChanges = inRange.flatMap((e) => e.changes.map((c) => ({
        change_type: c.change_type,
        description: c.description,
        scope: c.scope,
        display_order: 0,
        commit_hash: c.commit_hash ?? null,
        pushed_at: c.pushed_at ?? c.created_at,
        details: c.details ?? null,
      })));
      const uniq = allChanges.reduce((acc, c, i) => {
        acc.push({ ...c, display_order: i });
        return acc;
      }, [] as { change_type: ChangeType; description: string; scope: ChangeScope; display_order: number; commit_hash: string | null; pushed_at: string | null; details: Json | null }[]);
      const keepId = inRange[inRange.length - 1].id;
      const deleteIds = inRange.filter((e) => e.id !== keepId).map((e) => e.id);
      await supabase.from('changelog_entries').update({
        version: targetVersion.trim(),
        release_date: inRange[inRange.length - 1].release_date,
        description: description.trim() || null,
        active_batch_label: inRange[inRange.length - 1].active_batch_label ?? null
      }).eq('id', keepId);
      await supabase.from('changelog_changes').delete().eq('entry_id', keepId);
      if (uniq.length > 0) {
        await supabase.from('changelog_changes').insert(uniq.map((c, i) => ({ ...c, entry_id: keepId, display_order: i })));
      }
      if (deleteIds.length > 0) {
        await supabase.from('changelog_changes').delete().in('entry_id', deleteIds);
        await supabase.from('changelog_entries').delete().in('id', deleteIds);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setShowMergeDialog(false);
      setShowApplyEditsDialog(false);
      setApplyEditsJsonText('');
      setMergeFromVersion('');
      setMergeToVersion('');
      setMergeTargetVersion('');
      setMergeDescription('');
      if (!variables.fromAutoApply) toast.success('Versions merged');
    },
    onError: (e: Error) => toast.error(e.message)
  });

  // Add change mutation
  const addChangeMutation = useMutation({
    mutationFn: async (data: { entry_id: string; type: ChangeType; description: string; scope?: ChangeScope; commit_hash?: string | null; details?: Json | null; pushed_at?: string | null }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .insert({
          entry_id: data.entry_id,
          change_type: data.type,
          description: data.description,
          display_order: 999,
          scope: data.scope ?? 'both',
          commit_hash: data.commit_hash?.trim() || null,
          details: data.details ?? null,
          pushed_at: data.pushed_at ?? new Date().toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      toast.success('Change added');
    },
    onError: () => toast.error('Failed to add change')
  });

  // Update change mutation
  const updateChangeMutation = useMutation({
    mutationFn: async (data: { id: string; type: ChangeType; description: string; scope: ChangeScope; commit_hash?: string | null; details?: Json | null }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .update({
          change_type: data.type,
          description: data.description,
          scope: data.scope,
          commit_hash: data.commit_hash?.trim() || null,
          details: data.details ?? null,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setEditingChange(null);
      toast.success('Change updated');
    },
    onError: () => toast.error('Failed to update change')
  });

  // Delete change mutation
  const deleteChangeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('changelog_changes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setDeleteConfirm(null);
      toast.success('Change deleted');
    },
    onError: () => toast.error('Failed to delete change')
  });

  const handleAddNewChange = () => {
    setNewChanges([...newChanges, { type: 'added', description: '', scope: 'both', details_text: '' }]);
  };

  // Scroll to last-clicked entry when returning from external commit link
  useEffect(() => {
    const lastId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(LAST_ENTRY_KEY) : null;
    if (!lastId || !entryRefsMap.current[lastId]) return;
    const t = setTimeout(() => {
      entryRefsMap.current[lastId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      try { sessionStorage.removeItem(LAST_ENTRY_KEY); } catch {}
    }, 100);
    return () => clearTimeout(t);
  }, [filteredAndSortedEntries.length]);

  const createBatchMutation = useMutation({
    mutationFn: async (data: { name: string; notes: string }) => {
      if (isGuestMode) {
        toast.success(`Batch "${data.name}" created and set as active (demo mode - not saved)`);
        return { id: 'guest-batch' };
      }
      const { data: existing, error: fetchError } = await supabase
        .from('experiment_batches')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchError) throw fetchError;
      const maxOrder = existing?.display_order ?? 0;

      const { data: newBatch, error: insertError } = await supabase
        .from('experiment_batches')
        .insert({
          name: data.name.trim(),
          notes: data.notes.trim() || null,
          is_active: true,
          created_by: user!.id,
          display_order: maxOrder + 1,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      await supabase
        .from('experiment_batches')
        .update({ is_active: false })
        .neq('id', newBatch.id);

      await supabase
        .from('experiment_batches')
        .update({ is_active: true })
        .eq('id', newBatch.id);

      const { error: settingError } = await supabase
        .from('experiment_settings')
        .update({
          setting_value: data.name.trim(),
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq('setting_key', 'current_batch_label');
      if (settingError) console.warn('Could not update current_batch_label', settingError);

      return newBatch;
    },
    onSuccess: (_, variables) => {
      if (!isGuestMode) toast.success(`Batch "${variables.name}" created and set as active`);
      setShowCreateBatchDialog(false);
      setNewBatchName('');
      setNewBatchNotes('');
    },
    onError: (err: Error) => {
      toast.error(err.message?.includes('duplicate') ? 'A batch with this name already exists' : 'Failed to create batch');
    },
  });

  const handleSubmitEntry = () => {
    if (!entryForm.version.trim() || !entryForm.release_date) {
      toast.error('Version and date are required');
      return;
    }
    addEntryMutation.mutate({
      version: entryForm.version.trim(),
      release_date: entryForm.release_date,
      description: entryForm.description.trim() || undefined,
      active_batch_label: entryForm.active_batch_label.trim() || undefined,
      changes: newChanges
        .filter(c => c.description.trim())
        .map(c => ({
          type: c.type,
          description: c.description.trim(),
          scope: c.scope,
          commit_hash: c.commit_hash?.trim() || undefined,
          pushed_at: new Date().toISOString(),
          details: parseDetailsFromEditor(c.details_text ?? ''),
        }))
    });
  };

  const handleImportJson = async () => {
    try {
      const parsed = JSON.parse(importJsonText) as
        | { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: ImportChange[] }
        | { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: ImportChange[] }[];
      const entries = Array.isArray(parsed)
        ? parsed.map((entry) => normalizeChangelogEntry(entry))
        : [normalizeChangelogEntry(parsed)];
      const valid = entries.filter((e) => e.version && e.release_date);
      if (valid.length === 0) {
        toast.error('JSON must include at least one entry with "version" and "release_date"');
        return;
      }
      for (const { version, release_date, description, active_batch_label, changes } of valid) {
        await addEntryMutation.mutateAsync({
          version,
          release_date,
          description: description || undefined,
          active_batch_label: active_batch_label || undefined,
          changes: changes.map((change) => ({
            ...change,
            pushed_at: change.pushed_at ?? new Date().toISOString(),
            details: change.details ?? null,
          })),
        });
      }
      setShowImportDialog(false);
      setImportJsonText('');
      toast.success(valid.length === 1 ? '1 entry imported' : `${valid.length} entries imported`);
    } catch (e) {
      if (e && typeof (e as { message?: string }).message === 'string') toast.error((e as Error).message);
      else toast.error('Invalid JSON. Use a single entry object or an array of entries with "version", "release_date", "changes".');
    }
  };

  const getSystemDesignAssetHref = (path: string | null | undefined) => {
    if (!path) return null;
    const normalized = path.trim().replace(/^\/+/, '');
    if (!normalized) return null;
    return normalized.startsWith('system-design/') ? `/${normalized}` : `/system-design/${normalized}`;
  };

  const latestSystemDesignSnapshotHref = getSystemDesignAssetHref(systemDesignManifest?.latest_snapshot ?? null);
  const latestSystemDesignDiffHref = getSystemDesignAssetHref(systemDesignManifest?.latest_diff ?? null);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Changelog</h1>
              <p className="text-sm text-muted-foreground">Version history and updates</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button variant="outline" onClick={() => setShowCreateBatchDialog(true)}>
                <Package className="h-4 w-4 mr-2" />
                Create new batch
              </Button>
            )}
            <Button variant="outline" onClick={() => setShowImportDialog(true)}>
              <FileJson className="h-4 w-4 mr-2" />
              Import from JSON
            </Button>
            <Button onClick={() => setShowAddEntry(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
            <Button variant="outline" onClick={() => navigate('/researcher/dashboard')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Check className="h-5 w-5 text-primary" />
                      Release checklist
                    </CardTitle>
                    <CardDescription>
                      Push (changelog file every time) → Import / Edit from JSON → New batch when ready
                    </CardDescription>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${checklistOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li><strong className="text-foreground">Push</strong> — Use /push to commit and push. A changelog file is added every time (same version until a new version is cut). When the assistant suggests it, say whether to start a new version.</li>
                  <li><strong className="text-foreground">Changelog</strong> — New pushes are auto-imported when you open this page. You can also paste JSON (Import from JSON) or <strong className="text-foreground">edit release history from JSON</strong> (Export, edit in chat or in a file, then Apply edits) to merge versions or bulk-edit.</li>
                  <li><strong className="text-foreground">Create new batch</strong> — When starting a new wave, click &quot;Create new batch&quot; above (e.g. prepilot, pilot, main). You can also create batches from Experiment Settings.</li>
                </ol>
                <div className="mt-4 rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Auto mark release on push</p>
                      <p className="text-xs text-muted-foreground">
                        If enabled, approved pushes are marked as released automatically.
                      </p>
                    </div>
                    <Switch
                      checked={autoMarkReleaseOnPush}
                      disabled={isGuestMode || !isSuperAdmin || isAutoMarkReleaseLoading || updateAutoMarkReleaseMutation.isPending}
                      onCheckedChange={(checked) => updateAutoMarkReleaseMutation.mutate(checked)}
                      aria-label="Auto mark release on push"
                    />
                  </div>
                  {!isSuperAdmin ? (
                    <p className="mt-2 text-xs text-muted-foreground">Only super admins can change this setting.</p>
                  ) : null}
                </div>
                <div className="mt-3 rounded-md border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">System Design artifacts</p>
                      <p className="text-xs text-muted-foreground">
                        Latest generated snapshot and diff for pre-push review.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => refetchSystemDesignManifest()} disabled={isSystemDesignManifestLoading}>
                      {isSystemDesignManifestLoading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      Refresh
                    </Button>
                  </div>
                  {latestSystemDesignSnapshotHref || latestSystemDesignDiffHref ? (
                    <div className="flex flex-wrap gap-2">
                      {latestSystemDesignSnapshotHref ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={latestSystemDesignSnapshotHref} target="_blank" rel="noreferrer">
                            Snapshot
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      ) : null}
                      {latestSystemDesignDiffHref ? (
                        <Button size="sm" variant="outline" asChild>
                          <a href={latestSystemDesignDiffHref} target="_blank" rel="noreferrer">
                            Diff
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No published artifacts found at <code className="bg-background px-1 rounded">/system-design/manifest.json</code>.
                    </p>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <History className="h-5 w-5" />
                      Import history &amp; debug
                    </CardTitle>
                    <CardDescription>
                      Log of auto-import attempts and download JSON to retry manually (e.g. v1.1.2)
                    </CardDescription>
                  </div>
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2">Latest JSON from build</h4>
                  <p className="text-sm text-muted-foreground mb-2">Fetch the list of changelog files deployed with this app and download any file to paste into Import from JSON. Open devtools Console for import debug logs.</p>
                  <Button size="sm" variant="outline" onClick={fetchManifestForDownload}>Load available files</Button>
                  {availableChangelogFiles.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {availableChangelogFiles.map((name) => (
                        <li key={name} className="flex items-center gap-2">
                          <span className="font-mono text-xs">{name}</span>
                          <Button size="sm" variant="ghost" onClick={() => downloadChangelogJson(name)}>
                            <Download className="h-3 w-3" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">Click &quot;Load available files&quot; to fetch from /changelog/manifest.json</p>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Test import (diagnostic)</h4>
                  <p className="text-sm text-muted-foreground mb-2">Try importing a minimal test entry. Check Console for logs. If this succeeds, DB insert works; if it fails, the error points to the cause.</p>
                  <Button size="sm" variant="outline" onClick={runTestImport} disabled={testImportStatus === 'Running…'}>
                    {testImportStatus === null ? 'Run test import' : testImportStatus}
                  </Button>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-sm font-medium">Import attempts (last 100)</h4>
                    {importAttempts.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => archiveImportAttemptsMutation.mutate()}
                        disabled={archiveImportAttemptsMutation.isPending}
                      >
                        {archiveImportAttemptsMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                        Archive import attempts
                      </Button>
                    )}
                  </div>
                  {importAttempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No import attempts recorded yet.</p>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left p-2">File</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Error</th>
                            <th className="text-left p-2">Time</th>
                            <th className="text-left p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importAttempts.map((a) => (
                            <tr key={a.id} className="border-b last:border-0">
                              <td className="p-2 font-mono text-xs">{a.source_key}</td>
                              <td className="p-2">
                                <span className={a.status === 'success' ? 'text-green-600' : 'text-destructive'}>{a.status}</span>
                              </td>
                              <td className="p-2 text-muted-foreground max-w-xs truncate" title={a.error_message ?? ''}>{a.error_message ?? '—'}</td>
                              <td className="p-2 text-muted-foreground">{new Date(a.attempted_at).toLocaleString()}</td>
                              <td className="p-2 flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => downloadChangelogJson(a.source_key)} title="Download JSON to paste into Import from JSON">
                                  <Download className="h-3 w-3 mr-1" /> Download
                                </Button>
                                {a.status === 'failure' && (
                                  <Button size="sm" variant="outline" onClick={() => retryImportMutation.mutate(a.source_key)} disabled={retryImportMutation.isPending}>
                                    {retryImportMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                    Retry
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
            <div>
              <CardTitle>Release History</CardTitle>
              <CardDescription>
                Track all changes, improvements, and fixes to the research platform
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportReleaseHistory} title="Download release history as JSON (edit and apply via Edit from JSON)">
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowApplyEditsDialog(true)} title="Paste JSON to upsert entries and/or delete by id">
                <FileJson className="h-4 w-4 mr-1" />
                Edit from JSON
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowMergeDialog(true)} title="Merge a version range into one entry">
                Merge versions
              </Button>
              {isSuperAdmin && (
                <>
                  <Button variant="outline" size="sm" onClick={() => removeDuplicateEntriesMutation.mutate()} disabled={removeDuplicateEntriesMutation.isPending} title="Remove duplicate entries (same version + release date)">
                    {removeDuplicateEntriesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Remove duplicates
                  </Button>
                  {lastRemovedDuplicates !== null && (
                    <span className="text-xs text-muted-foreground">
                      {lastRemovedDuplicates === 0 ? 'No duplicates found' : `${lastRemovedDuplicates} duplicate${lastRemovedDuplicates === 1 ? '' : 's'} removed`}
                    </span>
                  )}
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {entries.length > 0 && (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Sort by date</span>
                  <Select value={sortOrder} onValueChange={(v: 'asc' | 'desc') => setSortOrder(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest first</SelectItem>
                      <SelectItem value="asc">Oldest first</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Scope</span>
                  <Select value={scopeFilter} onValueChange={(v: 'all' | 'participant' | 'researcher') => setScopeFilter(v)}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="participant">Participant</SelectItem>
                      <SelectItem value="researcher">Researcher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Batch</span>
                  <Select value={batchFilter} onValueChange={setBatchFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="All batches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All batches</SelectItem>
                      <SelectItem value="__none__">No batch</SelectItem>
                      {batchOptions.map(label => (
                        <SelectItem key={label} value={label}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No changelog entries yet. Click "Add Entry" to create one.
              </div>
            ) : filteredAndSortedEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No entries match the current filters.
              </div>
            ) : (
              <>
                {selectedEntryIds.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 py-2 px-3 mb-2 rounded-md bg-muted/50 border">
                    <span className="text-sm font-medium">{selectedEntryIds.size} version{selectedEntryIds.size === 1 ? '' : 's'} selected</span>
                    <Button size="sm" variant="outline" onClick={() => batchUpdateEntriesMutation.mutate({ ids: selectedResolvedEntryIds, reviewed: true })} disabled={batchUpdateEntriesMutation.isPending}>
                      Mark reviewed
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchUpdateEntriesMutation.mutate({ ids: selectedResolvedEntryIds, flagged: true })} disabled={batchUpdateEntriesMutation.isPending}>
                      Flag
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchUpdateEntriesMutation.mutate({ ids: selectedResolvedEntryIds, flagged: false })} disabled={batchUpdateEntriesMutation.isPending}>
                      Clear flag
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedEntryIds(new Set())}>
                      Deselect all
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteConfirm({ type: 'entries', ids: selectedResolvedEntryIds })} disabled={batchDeleteEntriesMutation.isPending}>
                      Delete {selectedEntryIds.size} version{selectedEntryIds.size === 1 ? '' : 's'}
                    </Button>
                  </div>
                )}
              <ScrollArea className="h-[calc(100vh-380px)]">
                <div className="space-y-8">
                  {filteredAndSortedEntries.map((entry) => (
                    <div
                      key={entry.id}
                      ref={(el) => { entryRefsMap.current[entry.id] = el; }}
                      data-entry-id={entry.id}
                      className={entry.flaggedAny ? 'border-l-2 border-l-destructive pl-4' : 'border-l-2 border-primary/20 pl-4'}
                    >
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <Checkbox
                          checked={selectedEntryIds.has(entry.id)}
                          onCheckedChange={(checked) => {
                            setSelectedEntryIds(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(entry.id); else next.delete(entry.id);
                              return next;
                            });
                          }}
                          aria-label={`Select ${entry.version}`}
                        />
                        {editingEntry?.id === entry.primaryEntryId ? (
                          <>
                            <Input
                              value={editingEntry.version}
                              onChange={(e) => setEditingEntry({ ...editingEntry, version: e.target.value })}
                              placeholder="Version"
                              className="w-24"
                            />
                            <Input
                              type="date"
                              value={editingEntry.release_date}
                              onChange={(e) => setEditingEntry({ ...editingEntry, release_date: e.target.value })}
                              className="w-40"
                            />
                            <Button size="sm" variant="ghost" onClick={() => updateEntryMutation.mutate({ id: entry.primaryEntryId, version: editingEntry.version, release_date: editingEntry.release_date, description: editingEntry.description ?? null, active_batch_label: editingEntry.active_batch_label ?? null })}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingEntry(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-lg font-semibold">v{entry.version}</span>
                            <Badge
                              variant="outline"
                              className={releaseStatusMeta[entry.release_status].className}
                              title={
                                entry.release_status === 'committed'
                                  ? 'Local-only commit (not pushed)'
                                  : entry.release_status === 'pushed'
                                    ? 'Pushed to the repo (not marked deployed)'
                                    : 'Marked as deployed/released'
                              }
                            >
                              {releaseStatusMeta[entry.release_status].label}
                            </Badge>
                            {isSuperAdmin && !isGuestMode ? (
                              <Select
                                value={entry.release_status}
                                onValueChange={(v) =>
                                  updateReleaseStatusMutation.mutate({
                                    entryIds: entry.entryIds,
                                    release_status: normalizeReleaseStatus(v),
                                  })
                                }
                                disabled={updateReleaseStatusMutation.isPending}
                              >
                                <SelectTrigger className="h-8 w-[150px]">
                                  <SelectValue placeholder="Release status" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="committed">Committed</SelectItem>
                                  <SelectItem value="pushed">Pushed</SelectItem>
                                  <SelectItem value="released">Deployed</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : null}
                            <span className="text-sm text-muted-foreground" title={entry.created_at ? new Date(entry.created_at).toLocaleString() : entry.release_date}>
                              {entry.release_date}
                              {entry.created_at ? ` · ${new Date(entry.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
                            </span>
                            {entry.entryIds.length > 1 ? (
                              <span className="text-xs text-muted-foreground">{entry.entryIds.length} pushes</span>
                            ) : null}
                            <Button
                              size="sm"
                              variant={entry.reviewedAll ? 'secondary' : 'ghost'}
                              className={entry.reviewedAll ? 'opacity-100' : 'opacity-70'}
                              onClick={() => batchUpdateEntriesMutation.mutate({ ids: entry.entryIds, reviewed: !entry.reviewedAll })}
                              title={entry.reviewedAll ? 'Reviewed' : 'Mark reviewed'}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              {entry.reviewedAll ? 'Reviewed' : 'Review'}
                            </Button>
                            <Button
                              size="sm"
                              variant={entry.flaggedAny ? 'destructive' : 'ghost'}
                              onClick={() => batchUpdateEntriesMutation.mutate({ ids: entry.entryIds, flagged: !entry.flaggedAny })}
                              title={entry.flaggedAny ? 'Flagged' : 'Flag'}
                            >
                              <Flag className="h-3.5 w-3.5 mr-1" />
                              {entry.flaggedAny ? 'Flagged' : 'Flag'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const primaryEntry = entries.find((candidate) => candidate.id === entry.primaryEntryId);
                                if (primaryEntry) setEditingEntry(primaryEntry);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {isSuperAdmin && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirm({ type: 'entries', ids: entry.entryIds })}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                      {editingEntry?.id === entry.primaryEntryId ? (
                        <div className="space-y-2 mb-2">
                          <div>
                            <label className="text-xs text-muted-foreground">Version description (optional)</label>
                            <Input
                              value={editingEntry.description ?? ''}
                              onChange={(e) => setEditingEntry({ ...editingEntry, description: e.target.value })}
                              placeholder="e.g. Major UX improvements"
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted-foreground">Active batch when this version was live (optional)</label>
                            <Input
                              value={editingEntry.active_batch_label ?? ''}
                              onChange={(e) => setEditingEntry({ ...editingEntry, active_batch_label: e.target.value })}
                              placeholder="e.g. Main Collection"
                              className="mt-1"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          {entry.description ? <p className="text-sm text-muted-foreground mb-1">{entry.description}</p> : null}
                          {(entry.active_batch_label?.trim() ?? entry.inferredBatchLabel) ? (
                            <p className="text-sm text-muted-foreground mb-2">
                              Active batch: <span className="font-medium">{entry.active_batch_label?.trim() ?? entry.inferredBatchLabel}</span>
                              {!entry.active_batch_label?.trim() && entry.inferredBatchLabel ? (
                                <span className="ml-1 text-muted-foreground/80 italic">(from batch dates)</span>
                              ) : null}
                            </p>
                          ) : null}
                        </>
                      )}
                      <ul className="space-y-2">
                        {entry.changes.map((change) => (
                          <li key={change.id} className="space-y-2">
                            {editingChange?.id === change.id ? (
                              <div className="space-y-2 rounded-md border bg-muted/20 p-2">
                                <div className="flex items-start gap-2 flex-wrap">
                                  <Select value={editingChange.type} onValueChange={(v) => setEditingChange({ ...editingChange, type: v as ChangeType })}>
                                    <SelectTrigger className="w-24">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="added">added</SelectItem>
                                      <SelectItem value="changed">changed</SelectItem>
                                      <SelectItem value="fixed">fixed</SelectItem>
                                      <SelectItem value="removed">removed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Select value={editingChange.scope} onValueChange={(v) => setEditingChange({ ...editingChange, scope: v as ChangeScope })}>
                                    <SelectTrigger className="w-28">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="participant">Participant</SelectItem>
                                      <SelectItem value="researcher">Researcher</SelectItem>
                                      <SelectItem value="both">Both</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    value={editingChange.description}
                                    onChange={(e) => setEditingChange({ ...editingChange, description: e.target.value })}
                                    className="flex-1 min-w-[260px]"
                                  />
                                  <Input
                                    placeholder="Commit hash"
                                    value={editingChange.commit_hash ?? ''}
                                    onChange={(e) => setEditingChange({ ...editingChange, commit_hash: e.target.value || undefined })}
                                    className="w-32 font-mono text-xs"
                                    title="Git commit hash (e.g. abc123f)"
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      updateChangeMutation.mutate({
                                        id: editingChange.id,
                                        type: editingChange.type,
                                        description: editingChange.description,
                                        scope: editingChange.scope,
                                        commit_hash: editingChange.commit_hash,
                                        details: parseDetailsFromEditor(editingChange.details_text),
                                      })
                                    }
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setEditingChange(null)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Long details (plain language, JSON optional)</Label>
                                  <Textarea
                                    value={editingChange.details_text}
                                    onChange={(e) => setEditingChange({ ...editingChange, details_text: e.target.value })}
                                    placeholder='{"summary_simple":"...", "changed_locations":["/questionnaire"], "flow_impact":"..."}'
                                    className="mt-1 min-h-[110px] font-mono text-xs"
                                  />
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColors[change.change_type as ChangeType]}`}>
                                  {change.change_type}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${scopeColors[(change.scope as ChangeScope) || 'both']}`} title="Affects">
                                  {scopeLabels[(change.scope as ChangeScope) || 'both']}
                                </span>
                                <span className="text-sm flex-1">{change.description}</span>
                                <span className="text-xs text-muted-foreground whitespace-nowrap" title="Push timestamp">
                                  {formatPushTimestamp(change.pushed_at)}
                                </span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1.5 text-xs"
                                  onClick={() =>
                                    setExpandedChangeIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(change.id)) next.delete(change.id);
                                      else next.add(change.id);
                                      return next;
                                    })
                                  }
                                  title="Show/hide long details"
                                >
                                  <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expandedChangeIds.has(change.id) ? 'rotate-90' : ''}`} />
                                  Details
                                </Button>
                                {change.commit_hash ? (
                                  <a
                                    href={commitUrl(change.commit_hash)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`shrink-0 flex items-center gap-1 ${visitedCommitIds.has(change.id) ? 'text-muted-foreground/60 visited:opacity-70' : 'text-muted-foreground hover:text-foreground'}`}
                                    title={visitedCommitIds.has(change.id) ? 'Viewed · View commit' : 'View commit'}
                                    onClick={() => {
                                      markVisited(change.id);
                                      try { sessionStorage.setItem(LAST_ENTRY_KEY, entry.id); } catch {}
                                      setVisitedCommitIds(getVisitedSet());
                                    }}
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                    {visitedCommitIds.has(change.id) && <span className="text-[10px] text-muted-foreground">Viewed</span>}
                                  </a>
                                ) : null}
                                <Button size="sm" variant="ghost" onClick={() => setEditingChange({ id: change.id, type: change.change_type as ChangeType, description: change.description, scope: (change.scope as ChangeScope) || 'both', commit_hash: change.commit_hash ?? undefined, details_text: formatDetailsForEditor(change.details ?? null) })}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {isSuperAdmin && (
                                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirm({ type: 'change', id: change.id })}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                                </div>
                                {expandedChangeIds.has(change.id) ? (
                                  <div className="ml-2 rounded-md border bg-muted/20 p-3 text-xs space-y-2">
                                    {typeof change.details === 'string' ? (
                                      <p className="text-sm">{change.details}</p>
                                    ) : (
                                      <>
                                        {(() => {
                                          const knownSummary = getDetailString(change.details, 'summary_simple');
                                          const knownLocations = getDetailStringArray(change.details, 'changed_locations');
                                          const knownAffected = getDetailString(change.details, 'affected_users');
                                          const knownFlow = getDetailString(change.details, 'flow_impact');
                                          const knownOutcome = getDetailString(change.details, 'user_visible_outcome');
                                          const knownRisk = getDetailString(change.details, 'risk_notes');
                                          const hasKnownFields =
                                            !!knownSummary ||
                                            knownLocations.length > 0 ||
                                            !!knownAffected ||
                                            !!knownFlow ||
                                            !!knownOutcome ||
                                            !!knownRisk;
                                          return (
                                            <>
                                              {knownSummary ? (
                                                <p><span className="font-medium">Summary:</span> {knownSummary}</p>
                                              ) : null}
                                              {knownLocations.length > 0 ? (
                                                <p><span className="font-medium">Changed locations:</span> {knownLocations.join(', ')}</p>
                                              ) : null}
                                              {knownAffected ? (
                                                <p><span className="font-medium">Affected users:</span> {knownAffected}</p>
                                              ) : null}
                                              {knownFlow ? (
                                                <p><span className="font-medium">Flow impact:</span> {knownFlow}</p>
                                              ) : null}
                                              {knownOutcome ? (
                                                <p><span className="font-medium">User-visible outcome:</span> {knownOutcome}</p>
                                              ) : null}
                                              {knownRisk ? (
                                                <p><span className="font-medium">Risk/notes:</span> {knownRisk}</p>
                                              ) : null}
                                              {!change.details ? (
                                                <p className="text-muted-foreground">No detailed notes yet.</p>
                                              ) : null}
                                              {!hasKnownFields && isObject(change.details) ? (
                                                <pre className="whitespace-pre-wrap rounded bg-background/70 p-2 text-[11px]">{JSON.stringify(change.details, null, 2)}</pre>
                                              ) : null}
                                            </>
                                          );
                                        })()}
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 text-muted-foreground"
                        onClick={() =>
                          addChangeMutation.mutate({
                            entry_id: entry.primaryEntryId,
                            type: 'added',
                            description: 'New change',
                            scope: 'both',
                            details: {
                              summary_simple: '',
                              changed_locations: [],
                              affected_users: 'both',
                              flow_impact: '',
                              user_visible_outcome: '',
                              risk_notes: '',
                            },
                          })
                        }
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add change
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Create new batch Dialog */}
      <Dialog open={showCreateBatchDialog} onOpenChange={(open) => { setShowCreateBatchDialog(open); if (!open) { setNewBatchName(''); setNewBatchNotes(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new batch</DialogTitle>
            <DialogDescription>
              New batch will be set as active. New participant responses will use this batch name. You can also create batches from Experiment Settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Batch name</label>
              <Input
                placeholder="e.g. prepilot, pilot, main"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Input
                placeholder="e.g. Second wave after 1.2.1"
                value={newBatchNotes}
                onChange={(e) => setNewBatchNotes(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateBatchDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createBatchMutation.mutate({ name: newBatchName, notes: newBatchNotes })}
              disabled={!newBatchName.trim() || createBatchMutation.isPending}
            >
              {createBatchMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create and set as active
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import from JSON Dialog */}
      <Dialog open={showImportDialog} onOpenChange={(open) => { setShowImportDialog(open); if (!open) setImportJsonText(''); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from JSON</DialogTitle>
            <DialogDescription>
              Paste a single changelog entry. Use the file <code className="text-xs bg-muted px-1 rounded">docs/researcher-changelog-latest.json</code> from the repo (e.g. after running the changelog command).
            </DialogDescription>
          </DialogHeader>
          <textarea
            className="w-full min-h-[200px] rounded-md border bg-muted/30 p-3 font-mono text-sm"
            placeholder={'{\n  "version": "1.2.0",\n  "release_date": "2025-02-10",\n  "description": "Optional",\n  "active_batch_label": "Main Collection",\n  "changes": [\n    { "type": "added", "description": "...", "scope": "both" }\n  ]\n}'}
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImportDialog(false); setImportJsonText(''); }}>Cancel</Button>
            <Button onClick={handleImportJson} disabled={addEntryMutation.isPending}>
              {addEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit release history from JSON */}
      <Dialog open={showApplyEditsDialog} onOpenChange={(open) => { setShowApplyEditsDialog(open); if (!open) setApplyEditsJsonText(''); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit release history from JSON</DialogTitle>
            <DialogDescription>
              Use Export to download the current history. Edit in a file or in chat, then paste here. Format: <code className="text-xs bg-muted px-1 rounded">{"{ \"entries\": [...], \"delete_entry_ids\"?: [...] }"}</code> to upsert/delete, or <code className="text-xs bg-muted px-1 rounded">{"{ \"merge_versions\": { \"from_version\", \"to_version\", \"target_version\", \"description\" } }"}</code> to merge a version range (no export needed).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            className="flex-1 min-h-[240px] font-mono text-sm"
            placeholder='{ "entries": [...], "delete_entry_ids": [] }'
            value={applyEditsJsonText}
            onChange={(e) => setApplyEditsJsonText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApplyEditsDialog(false); setApplyEditsJsonText(''); }}>Cancel</Button>
            <Button onClick={() => {
              try {
                const payload = JSON.parse(applyEditsJsonText) as {
                  entries?: ApplyEditsEntry[];
                  delete_entry_ids?: string[];
                  merge_versions?: { from_version: string; to_version: string; target_version: string; description: string };
                };
                if (payload.merge_versions) {
                  const m = payload.merge_versions;
                  mergeVersionsMutation.mutate({
                    fromVersion: (m.from_version || '').trim(),
                    toVersion: (m.to_version || '').trim(),
                    targetVersion: (m.target_version || m.to_version || '').trim(),
                    description: (m.description || '').trim()
                  });
                  return;
                }
                const entriesList = Array.isArray(payload.entries) ? payload.entries : [];
                const deleteIds = Array.isArray(payload.delete_entry_ids) ? payload.delete_entry_ids : [];
                applyEditsMutation.mutate({ entries: entriesList, delete_entry_ids: deleteIds });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Invalid JSON');
              }
            }} disabled={applyEditsMutation.isPending || mergeVersionsMutation.isPending || !applyEditsJsonText.trim()}>
            {(applyEditsMutation.isPending || mergeVersionsMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply edits
          </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge versions */}
      <Dialog open={showMergeDialog} onOpenChange={(open) => { setShowMergeDialog(open); if (!open) { setMergeFromVersion(''); setMergeToVersion(''); setMergeTargetVersion(''); setMergeDescription(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Merge versions</DialogTitle>
            <DialogDescription>
              Combine all entries from version A through B into a single entry (e.g. from 1.1.1 to 1.1.5). The highest version in range is kept; others are deleted. All changes are merged into one entry.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>From version (inclusive)</Label>
              <Input placeholder="1.1.1" value={mergeFromVersion} onChange={(e) => setMergeFromVersion(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>To version (inclusive)</Label>
              <Input placeholder="1.1.5" value={mergeToVersion} onChange={(e) => setMergeToVersion(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Target version</Label>
              <Input placeholder="1.1.5" value={mergeTargetVersion} onChange={(e) => setMergeTargetVersion(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Input placeholder="Any changes and pushes are automatically added as a changelog" value={mergeDescription} onChange={(e) => setMergeDescription(e.target.value)} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMergeDialog(false)}>Cancel</Button>
            <Button onClick={() => mergeVersionsMutation.mutate({ fromVersion: mergeFromVersion.trim(), toVersion: mergeToVersion.trim(), targetVersion: mergeTargetVersion.trim() || mergeToVersion.trim(), description: mergeDescription.trim() })} disabled={mergeVersionsMutation.isPending || !mergeFromVersion.trim() || !mergeToVersion.trim()}>
              {mergeVersionsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Entry Dialog */}
      <Dialog open={showAddEntry} onOpenChange={setShowAddEntry}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Changelog Entry</DialogTitle>
            <DialogDescription>Create a new version entry with changes</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Version</label>
                <Input
                  placeholder="e.g., 1.2.0"
                  value={entryForm.version}
                  onChange={(e) => setEntryForm({ ...entryForm, version: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Release Date</label>
                <Input
                  type="date"
                  value={entryForm.release_date}
                  onChange={(e) => setEntryForm({ ...entryForm, release_date: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="e.g. Major UX improvements and new batch workflow"
                value={entryForm.description}
                onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Active batch when this version was live (optional)</label>
              <Input
                placeholder="e.g. Main Collection"
                value={entryForm.active_batch_label}
                onChange={(e) => setEntryForm({ ...entryForm, active_batch_label: e.target.value })}
                className="mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium">Changes</label>
              <div className="space-y-2 mt-2">
                {newChanges.map((change, idx) => (
                  <div key={idx} className="space-y-2 rounded-md border p-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <Select value={change.type} onValueChange={(v) => {
                        const updated = [...newChanges];
                        updated[idx].type = v as ChangeType;
                        setNewChanges(updated);
                      }}>
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="added">added</SelectItem>
                          <SelectItem value="changed">changed</SelectItem>
                          <SelectItem value="fixed">fixed</SelectItem>
                          <SelectItem value="removed">removed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={change.scope} onValueChange={(v) => {
                        const updated = [...newChanges];
                        updated[idx].scope = v as ChangeScope;
                        setNewChanges(updated);
                      }}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="participant">Participant</SelectItem>
                          <SelectItem value="researcher">Researcher</SelectItem>
                          <SelectItem value="both">Both</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Description"
                        value={change.description}
                        onChange={(e) => {
                          const updated = [...newChanges];
                          updated[idx].description = e.target.value;
                          setNewChanges(updated);
                        }}
                        className="flex-1"
                      />
                      <Input
                        placeholder="Commit"
                        value={change.commit_hash ?? ''}
                        onChange={(e) => {
                          const updated = [...newChanges];
                          updated[idx].commit_hash = e.target.value || undefined;
                          setNewChanges(updated);
                        }}
                        className="w-24 font-mono text-xs"
                        title="Git commit hash"
                      />
                      <Button size="icon" variant="ghost" onClick={() => setNewChanges(newChanges.filter((_, i) => i !== idx))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      placeholder='Long details (plain language or JSON), e.g. {"summary_simple":"...","changed_locations":["/questionnaire"]}'
                      value={change.details_text ?? ''}
                      onChange={(e) => {
                        const updated = [...newChanges];
                        updated[idx].details_text = e.target.value;
                        setNewChanges(updated);
                      }}
                      className="min-h-[100px] font-mono text-xs"
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={handleAddNewChange}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Change
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddEntry(false)}>Cancel</Button>
            <Button onClick={handleSubmitEntry} disabled={addEntryMutation.isPending}>
              {addEntryMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              {deleteConfirm?.type === 'entries'
                ? `Delete ${deleteConfirm.ids.length} ${deleteConfirm.ids.length === 1 ? 'entry' : 'entries'}? This action cannot be undone.`
                : `Are you sure you want to delete this ${deleteConfirm?.type}? This action cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteConfirm?.type === 'entry') {
                  deleteEntryMutation.mutate(deleteConfirm.id);
                } else if (deleteConfirm?.type === 'change') {
                  deleteChangeMutation.mutate(deleteConfirm.id);
                } else if (deleteConfirm?.type === 'entries') {
                  batchDeleteEntriesMutation.mutate(deleteConfirm.ids);
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResearcherChangelog;
