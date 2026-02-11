import { useState } from 'react';
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
  Package
} from 'lucide-react';
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
}

interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  description: string | null;
  active_batch_label: string | null;
  created_at: string;
  changes: ChangelogChange[];
}

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
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'entry' | 'change'; id: string } | null>(null);
  const [checklistOpen, setChecklistOpen] = useState(true);
  
  // Form state for new/edit entry
  const [entryForm, setEntryForm] = useState({ version: '', release_date: '', description: '', active_batch_label: '' });
  const [newChanges, setNewChanges] = useState<{ type: ChangeType; description: string; scope: ChangeScope }[]>([]);
  
  // Inline editing state
  const [editingChange, setEditingChange] = useState<{ id: string; type: ChangeType; description: string; scope: ChangeScope } | null>(null);

  // Fetch changelog entries with changes
  const { data: entries = [], isLoading } = useQuery({
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

  // Add entry mutation
  const addEntryMutation = useMutation({
    mutationFn: async (data: { version: string; release_date: string; description?: string | null; active_batch_label?: string | null; changes: { type: ChangeType; description: string; scope?: ChangeScope }[] }) => {
      const { data: entry, error: entryError } = await supabase
        .from('changelog_entries')
        .insert({
          version: data.version,
          release_date: data.release_date,
          description: data.description?.trim() || null,
          active_batch_label: data.active_batch_label?.trim() || null,
          created_by: user!.id
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
            scope: c.scope ?? 'both'
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
    mutationFn: async (data: { id: string; version: string; release_date: string; description?: string | null; active_batch_label?: string | null }) => {
      const { error } = await supabase
        .from('changelog_entries')
        .update({
          version: data.version,
          release_date: data.release_date,
          description: data.description?.trim() || null,
          active_batch_label: data.active_batch_label?.trim() || null
        })
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

  // Add change mutation
  const addChangeMutation = useMutation({
    mutationFn: async (data: { entry_id: string; type: ChangeType; description: string; scope?: ChangeScope }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .insert({ entry_id: data.entry_id, change_type: data.type, description: data.description, display_order: 999, scope: data.scope ?? 'both' });
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
    mutationFn: async (data: { id: string; type: ChangeType; description: string; scope: ChangeScope }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .update({ change_type: data.type, description: data.description, scope: data.scope })
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
      changes: newChanges.filter(c => c.description.trim()).map(c => ({ type: c.type, description: c.description.trim(), scope: c.scope }))
    });
  };

  const handleImportJson = () => {
    try {
      const parsed = JSON.parse(importJsonText) as { version?: string; release_date?: string; description?: string; active_batch_label?: string; changes?: { type: string; description: string; scope?: string }[] };
      const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
      const release_date = typeof parsed.release_date === 'string' ? parsed.release_date.trim() : '';
      const description = typeof parsed.description === 'string' ? parsed.description.trim() : undefined;
      const active_batch_label = typeof parsed.active_batch_label === 'string' ? parsed.active_batch_label.trim() : undefined;
      const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
      const validScopes = ['participant', 'researcher', 'both'] as const;
      const changes = rawChanges
        .filter((c): c is { type: ChangeType; description: string; scope?: string } =>
          c && typeof c.type === 'string' && ['added', 'changed', 'fixed', 'removed'].includes(c.type) && typeof c.description === 'string'
        )
        .map((c) => ({ type: c.type as ChangeType, description: String(c.description).trim(), scope: (validScopes.includes(c.scope as ChangeScope) ? c.scope : 'both') as ChangeScope }))
        .filter((c) => c.description.length > 0);
      if (!version || !release_date) {
        toast.error('JSON must include "version" and "release_date"');
        return;
      }
      addEntryMutation.mutate({ version, release_date, description: description || undefined, active_batch_label: active_batch_label || undefined, changes }, {
        onSuccess: () => {
          setShowImportDialog(false);
          setImportJsonText('');
        }
      });
    } catch {
      toast.error('Invalid JSON. Expected: { "version": "...", "release_date": "YYYY-MM-DD", "changes": [ { "type": "added"|"changed"|"fixed"|"removed", "description": "..." } ] }');
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

        <Card>
          <CardHeader>
            <CardTitle>Release History</CardTitle>
            <CardDescription>
              Track all changes, improvements, and fixes to the research platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No changelog entries yet. Click "Add Entry" to create one.
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-350px)]">
                <div className="space-y-8">
                  {entries.map((entry) => (
                    <div key={entry.id} className="border-l-2 border-primary/20 pl-4">
                      <div className="flex items-center gap-3 mb-3">
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
                          {entry.active_batch_label ? <p className="text-sm text-muted-foreground mb-2">Active batch: <span className="font-medium">{entry.active_batch_label}</span></p> : null}
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
                                <Button size="sm" variant="ghost" onClick={() => setEditingChange({ id: change.id, type: change.change_type as ChangeType, description: change.description, scope: (change.scope as ChangeScope) || 'both' })}>
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
              Are you sure you want to delete this {deleteConfirm?.type}? This action cannot be undone.
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
