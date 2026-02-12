import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
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
  History
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

const GITHUB_REPO = (import.meta.env.VITE_GITHUB_REPO as string) || 'ClarkOhlenbusch/prolific-vapi-connect';
const VISITED_COMMITS_KEY = 'changelog-visited-commit-ids';
const LAST_ENTRY_KEY = 'changelog-last-clicked-entry-id';

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
import { toast } from 'sonner';

type ChangeType = 'added' | 'changed' | 'fixed' | 'removed';
type ChangeScope = 'participant' | 'researcher' | 'both';

interface ChangelogChange {
  id: string;
  entry_id: string;
  change_type: ChangeType;
  description: string;
  display_order: number;
  scope: ChangeScope;
  commit_hash?: string | null;
}

interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  description: string | null;
  active_batch_label: string | null;
  created_at: string;
  changes: ChangelogChange[];
  reviewed?: boolean;
  flagged?: boolean;
}

type ChangelogEntryWithInferred = ChangelogEntry & { inferredBatchLabel: string | null };

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
  const entryRefsMap = useRef<Record<string, HTMLDivElement | null>>({});

  // Form state for new/edit entry
  const [entryForm, setEntryForm] = useState({ version: '', release_date: '', description: '', active_batch_label: '' });
  const [newChanges, setNewChanges] = useState<{ type: ChangeType; description: string; scope: ChangeScope; commit_hash?: string | null }[]>([]);
  
  // Inline editing state
  const [editingChange, setEditingChange] = useState<{ id: string; type: ChangeType; description: string; scope: ChangeScope; commit_hash?: string | null } | null>(null);

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
        changes: changesData.filter(c => c.entry_id === entry.id) as ChangelogChange[]
      })) as ChangelogEntry[];
    }
  });

  const entries = entriesRaw;

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
  type ImportChange = { type: string; description: string; scope?: string; commit_hash?: string };
  const normalizeChangelogEntry = (obj: { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: ImportChange[] }) => {
    const version = typeof obj.version === 'string' ? obj.version.trim() : '';
    const release_date = typeof obj.release_date === 'string' ? obj.release_date.trim() : '';
    const description = typeof obj.description === 'string' ? obj.description.trim() : undefined;
    const active_batch_label = typeof obj.active_batch_label === 'string' ? obj.active_batch_label.trim() : undefined;
    const rawChanges = Array.isArray(obj.changes) ? obj.changes : [];
    const changes = rawChanges
      .filter((c): c is ImportChange & { type: ChangeType } =>
        c && typeof c.type === 'string' && ['added', 'changed', 'fixed', 'removed'].includes(c.type) && typeof c.description === 'string'
      )
      .map((c) => ({
        type: c.type as ChangeType,
        description: String(c.description).trim(),
        scope: (validScopes.includes(c.scope as ChangeScope) ? c.scope : 'both') as ChangeScope,
        commit_hash: typeof c.commit_hash === 'string' ? (c.commit_hash.trim() || undefined) : undefined
      }))
      .filter((c) => c.description.length > 0);
    return { version, release_date, description, active_batch_label, changes };
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
    for (const { version, release_date, description, active_batch_label, changes } of valid) {
      const { data: entry, error: entryError } = await supabase
        .from('changelog_entries')
        .insert({
          version,
          release_date,
          description: description?.trim() || null,
          active_batch_label: active_batch_label?.trim() || null,
          created_by: user?.id ?? null
        })
        .select('id')
        .single();
      if (entryError) {
        return { ok: false, errorMessage: entryError.message };
      }
      if (entry && changes.length > 0) {
        const { error: chErr } = await supabase.from('changelog_changes').insert(
          changes.map((c, i) => ({
            entry_id: entry.id,
            change_type: c.type,
            description: c.description,
            display_order: i,
            scope: c.scope ?? 'both',
            commit_hash: c.commit_hash ?? null
          }))
        );
        if (chErr) return { ok: false, errorMessage: chErr.message };
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
      const newFiles = changelogFiles.filter((name) => !importedSourceKeys.includes(name));
      console.log('[changelog auto-import] manifest files', changelogFiles.length, 'already imported', importedSourceKeys.length, 'new to import', newFiles.length, newFiles);
      if (newFiles.length === 0) return;

      let importedCount = 0;
      for (const name of newFiles) {
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
      changes: [{ type: 'added' as const, description: 'Test change', scope: 'both' as const }]
    };
    const parsedEntries = [normalizeChangelogEntry(testPayload)];
    const valid = parsedEntries.filter((e) => e.version && e.release_date);
    if (valid.length === 0) {
      setTestImportStatus('Error: no valid entry');
      return;
    }
    try {
      for (const { version, release_date, description, active_batch_label, changes } of valid) {
        const { data: entry, error: entryError } = await supabase
          .from('changelog_entries')
          .insert({
            version,
            release_date,
            description: description?.trim() || null,
            active_batch_label: active_batch_label?.trim() || null,
            created_by: user?.id ?? null
          })
          .select('id')
          .single();
        if (entryError) {
          setTestImportStatus(`Error: ${entryError.message}`);
          return;
        }
        if (entry && changes.length > 0) {
          const { error: chErr } = await supabase.from('changelog_changes').insert(
            changes.map((c, i) => ({
              entry_id: entry.id,
              change_type: c.type,
              description: c.description,
              display_order: i,
              scope: c.scope ?? 'both',
              commit_hash: c.commit_hash ?? null
            }))
          );
          if (chErr) {
            setTestImportStatus(`Error (changes): ${chErr.message}`);
            return;
          }
        }
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
    const sorted = [...list].sort((a, b) => {
      // Primary: version (desc = newest first = highest version, asc = oldest first = lowest version)
      const d = sortOrder === 'desc' ? -1 : 1;
      const versionCmp = compareVersions(a.version || '', b.version || '');
      if (versionCmp !== 0) return versionCmp * d;
      // Tie-break: release_date, then created_at
      if (a.release_date !== b.release_date) {
        return a.release_date < b.release_date ? -d : d;
      }
      return (a.created_at || '').localeCompare(b.created_at || '');
    });
    return sorted;
  }, [entries, batchFilter, scopeFilter, sortOrder, getBatchActiveOnDate]);

  // Add entry mutation
  const addEntryMutation = useMutation({
    mutationFn: async (data: { version: string; release_date: string; description?: string | null; active_batch_label?: string | null; changes: { type: ChangeType; description: string; scope?: ChangeScope; commit_hash?: string | null }[] }) => {
      const { data: entry, error: entryError } = await supabase
        .from('changelog_entries')
        .insert({
          version: data.version,
          release_date: data.release_date,
          description: data.description?.trim() || null,
          active_batch_label: data.active_batch_label?.trim() || null,
          created_by: user?.id ?? null
        })
        .select()
        .single();
      
      if (entryError) throw entryError;
      
      if (data.changes.length > 0) {
        const { error: changesError } = await supabase
          .from('changelog_changes')
          .insert(data.changes.map((c, i) => ({
            entry_id: entry.id,
            change_type: c.type,
            description: c.description,
            display_order: i,
            scope: c.scope ?? 'both',
            commit_hash: c.commit_hash?.trim() || null
          })));
        
        if (changesError) throw changesError;
      }
      
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setShowAddEntry(false);
      setEntryForm({ version: '', release_date: '', description: '', active_batch_label: '' });
      setNewChanges([]);
      toast.success('Changelog entry added');
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

  // Add change mutation
  const addChangeMutation = useMutation({
    mutationFn: async (data: { entry_id: string; type: ChangeType; description: string; scope?: ChangeScope; commit_hash?: string | null }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .insert({ entry_id: data.entry_id, change_type: data.type, description: data.description, display_order: 999, scope: data.scope ?? 'both', commit_hash: data.commit_hash?.trim() || null });
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
    mutationFn: async (data: { id: string; type: ChangeType; description: string; scope: ChangeScope; commit_hash?: string | null }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .update({ change_type: data.type, description: data.description, scope: data.scope, commit_hash: data.commit_hash?.trim() || null })
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
    setNewChanges([...newChanges, { type: 'added', description: '', scope: 'both' }]);
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
      changes: newChanges.filter(c => c.description.trim()).map(c => ({ type: c.type, description: c.description.trim(), scope: c.scope, commit_hash: c.commit_hash?.trim() || undefined }))
    });
  };

  const handleImportJson = async () => {
    try {
      type ImportChange = { type: string; description: string; scope?: string; commit_hash?: string };
      const parsed = JSON.parse(importJsonText) as
        | { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: ImportChange[] }
        | { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: ImportChange[] }[];
      const validScopes = ['participant', 'researcher', 'both'] as const;
      const normalizeEntry = (obj: { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: ImportChange[] }) => {
        const version = typeof obj.version === 'string' ? obj.version.trim() : '';
        const release_date = typeof obj.release_date === 'string' ? obj.release_date.trim() : '';
        const description = typeof obj.description === 'string' ? obj.description.trim() : undefined;
        const active_batch_label = typeof obj.active_batch_label === 'string' ? obj.active_batch_label.trim() : undefined;
        const rawChanges = Array.isArray(obj.changes) ? obj.changes : [];
        const changes = rawChanges
          .filter((c): c is ImportChange & { type: ChangeType } =>
            c && typeof c.type === 'string' && ['added', 'changed', 'fixed', 'removed'].includes(c.type) && typeof c.description === 'string'
          )
          .map((c) => ({
            type: c.type as ChangeType,
            description: String(c.description).trim(),
            scope: (validScopes.includes(c.scope as ChangeScope) ? c.scope : 'both') as ChangeScope,
            commit_hash: typeof c.commit_hash === 'string' ? (c.commit_hash.trim() || undefined) : undefined
          }))
          .filter((c) => c.description.length > 0);
        return { version, release_date, description, active_batch_label, changes };
      };
      const entries = Array.isArray(parsed) ? parsed.map(normalizeEntry) : [normalizeEntry(parsed)];
      const valid = entries.filter((e) => e.version && e.release_date);
      if (valid.length === 0) {
        toast.error('JSON must include at least one entry with "version" and "release_date"');
        return;
      }
      for (const { version, release_date, description, active_batch_label, changes } of valid) {
        await addEntryMutation.mutateAsync({ version, release_date, description: description || undefined, active_batch_label: active_batch_label || undefined, changes });
      }
      setShowImportDialog(false);
      setImportJsonText('');
      toast.success(valid.length === 1 ? '1 entry imported' : `${valid.length} entries imported`);
    } catch (e) {
      if (e && typeof (e as { message?: string }).message === 'string') toast.error((e as Error).message);
      else toast.error('Invalid JSON. Use a single entry object or an array of entries with "version", "release_date", "changes".');
    }
  };

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
                      Push → Changelog → Import → New batch (prepilot / pilot / main)
                    </CardDescription>
                  </div>
                  <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${checklistOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li><strong className="text-foreground">Push</strong> — Deploy is instant; push code when ready.</li>
                  <li><strong className="text-foreground">Update changelog</strong> — Run /changelog add (or add entry), set <em>active_batch_label</em> in <code className="text-xs bg-muted px-1 rounded">docs/researcher-changelog-latest.json</code> for the version that was live.</li>
                  <li><strong className="text-foreground">Import or add entry</strong> — Paste the draft here (Import from JSON) or add an entry manually.</li>
                  <li><strong className="text-foreground">Create new batch</strong> — Click &quot;Create new batch&quot; above (e.g. prepilot, pilot, main) so the next wave uses the new batch. You can also create batches from Experiment Settings.</li>
                </ol>
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
            {isSuperAdmin && (
              <div className="flex flex-col items-end gap-1">
                <Button variant="outline" size="sm" onClick={() => removeDuplicateEntriesMutation.mutate()} disabled={removeDuplicateEntriesMutation.isPending} title="Remove duplicate entries (same version + release date)">
                  {removeDuplicateEntriesMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Remove duplicates
                </Button>
                {lastRemovedDuplicates !== null && (
                  <span className="text-xs text-muted-foreground">
                    {lastRemovedDuplicates === 0 ? 'No duplicates found' : `${lastRemovedDuplicates} duplicate${lastRemovedDuplicates === 1 ? '' : 's'} removed`}
                  </span>
                )}
              </div>
            )}
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
                    <span className="text-sm font-medium">{selectedEntryIds.size} selected</span>
                    <Button size="sm" variant="outline" onClick={() => batchUpdateEntriesMutation.mutate({ ids: [...selectedEntryIds], reviewed: true })} disabled={batchUpdateEntriesMutation.isPending}>
                      Mark reviewed
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchUpdateEntriesMutation.mutate({ ids: [...selectedEntryIds], flagged: true })} disabled={batchUpdateEntriesMutation.isPending}>
                      Flag
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => batchUpdateEntriesMutation.mutate({ ids: [...selectedEntryIds], flagged: false })} disabled={batchUpdateEntriesMutation.isPending}>
                      Clear flag
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedEntryIds(new Set())}>
                      Deselect all
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleteConfirm({ type: 'entries', ids: [...selectedEntryIds] })} disabled={batchDeleteEntriesMutation.isPending}>
                      Delete {selectedEntryIds.size} {selectedEntryIds.size === 1 ? 'entry' : 'entries'}
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
                      className={entry.flagged ? 'border-l-2 border-l-destructive pl-4' : 'border-l-2 border-primary/20 pl-4'}
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
                        {editingEntry?.id === entry.id ? (
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
                            <Button size="sm" variant="ghost" onClick={() => updateEntryMutation.mutate({ id: entry.id, version: editingEntry.version, release_date: editingEntry.release_date, description: editingEntry.description ?? null, active_batch_label: editingEntry.active_batch_label ?? null })}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingEntry(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <span className="text-lg font-semibold">v{entry.version}</span>
                            <span className="text-sm text-muted-foreground">{entry.release_date}</span>
                            <Button
                              size="sm"
                              variant={entry.reviewed ? 'secondary' : 'ghost'}
                              className={entry.reviewed ? 'opacity-100' : 'opacity-70'}
                              onClick={() => updateEntryMutation.mutate({ id: entry.id, version: entry.version, release_date: entry.release_date, description: entry.description ?? null, active_batch_label: entry.active_batch_label ?? null, reviewed: !entry.reviewed })}
                              title={entry.reviewed ? 'Reviewed' : 'Mark reviewed'}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />
                              {entry.reviewed ? 'Reviewed' : 'Review'}
                            </Button>
                            <Button
                              size="sm"
                              variant={entry.flagged ? 'destructive' : 'ghost'}
                              onClick={() => updateEntryMutation.mutate({ id: entry.id, version: entry.version, release_date: entry.release_date, description: entry.description ?? null, active_batch_label: entry.active_batch_label ?? null, flagged: !entry.flagged })}
                              title={entry.flagged ? 'Flagged' : 'Flag'}
                            >
                              <Flag className="h-3.5 w-3.5 mr-1" />
                              {entry.flagged ? 'Flagged' : 'Flag'}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingEntry(entry)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            {isSuperAdmin && (
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirm({ type: 'entry', id: entry.id })}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                      {editingEntry?.id === entry.id ? (
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
                          <li key={change.id} className="flex items-start gap-2">
                            {editingChange?.id === change.id ? (
                              <>
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
                                  className="flex-1"
                                />
                                <Input
                                  placeholder="Commit hash"
                                  value={editingChange.commit_hash ?? ''}
                                  onChange={(e) => setEditingChange({ ...editingChange, commit_hash: e.target.value || undefined })}
                                  className="w-32 font-mono text-xs"
                                  title="Git commit hash (e.g. abc123f)"
                                />
                                <Button size="sm" variant="ghost" onClick={() => updateChangeMutation.mutate(editingChange)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingChange(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${typeColors[change.change_type as ChangeType]}`}>
                                  {change.change_type}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-xs ${scopeColors[(change.scope as ChangeScope) || 'both']}`} title="Affects">
                                  {scopeLabels[(change.scope as ChangeScope) || 'both']}
                                </span>
                                <span className="text-sm flex-1">{change.description}</span>
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
                                <Button size="sm" variant="ghost" onClick={() => setEditingChange({ id: change.id, type: change.change_type as ChangeType, description: change.description, scope: (change.scope as ChangeScope) || 'both', commit_hash: change.commit_hash ?? undefined })}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {isSuperAdmin && (
                                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConfirm({ type: 'change', id: change.id })}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-2 text-muted-foreground"
                        onClick={() => addChangeMutation.mutate({ entry_id: entry.id, type: 'added', description: 'New change', scope: 'both' })}
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
                  <div key={idx} className="flex flex-wrap gap-2 items-center">
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
