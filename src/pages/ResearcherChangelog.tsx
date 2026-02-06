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
  ArrowLeft, 
  FlaskConical, 
  Plus, 
  Pencil, 
  Trash2, 
  X, 
  Check,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

type ChangeType = 'added' | 'changed' | 'fixed' | 'removed';

interface ChangelogChange {
  id: string;
  entry_id: string;
  change_type: ChangeType;
  description: string;
  display_order: number;
}

interface ChangelogEntry {
  id: string;
  version: string;
  release_date: string;
  created_at: string;
  changes: ChangelogChange[];
}

const typeColors: Record<ChangeType, string> = {
  added: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  changed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fixed: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  removed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const ResearcherChangelog = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isSuperAdmin } = useResearcherAuth();
  
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ChangelogEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'entry' | 'change'; id: string } | null>(null);
  
  // Form state for new/edit entry
  const [entryForm, setEntryForm] = useState({ version: '', release_date: '' });
  const [newChanges, setNewChanges] = useState<{ type: ChangeType; description: string }[]>([]);
  
  // Inline editing state
  const [editingChange, setEditingChange] = useState<{ id: string; type: ChangeType; description: string } | null>(null);

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
    mutationFn: async (data: { version: string; release_date: string; changes: { type: ChangeType; description: string }[] }) => {
      const { data: entry, error: entryError } = await supabase
        .from('changelog_entries')
        .insert({ version: data.version, release_date: data.release_date, created_by: user!.id })
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
            display_order: i
          })));
        
        if (changesError) throw changesError;
      }
      
      return entry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['changelog-entries'] });
      setShowAddEntry(false);
      setEntryForm({ version: '', release_date: '' });
      setNewChanges([]);
      toast.success('Changelog entry added');
    },
    onError: () => toast.error('Failed to add entry')
  });

  // Update entry mutation
  const updateEntryMutation = useMutation({
    mutationFn: async (data: { id: string; version: string; release_date: string }) => {
      const { error } = await supabase
        .from('changelog_entries')
        .update({ version: data.version, release_date: data.release_date })
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
    mutationFn: async (data: { entry_id: string; type: ChangeType; description: string }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .insert({ entry_id: data.entry_id, change_type: data.type, description: data.description, display_order: 999 });
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
    mutationFn: async (data: { id: string; type: ChangeType; description: string }) => {
      const { error } = await supabase
        .from('changelog_changes')
        .update({ change_type: data.type, description: data.description })
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
    setNewChanges([...newChanges, { type: 'added', description: '' }]);
  };

  const handleSubmitEntry = () => {
    if (!entryForm.version.trim() || !entryForm.release_date) {
      toast.error('Version and date are required');
      return;
    }
    addEntryMutation.mutate({
      version: entryForm.version.trim(),
      release_date: entryForm.release_date,
      changes: newChanges.filter(c => c.description.trim())
    });
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

      <main className="container mx-auto px-4 py-6">
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
                            <Button size="sm" variant="ghost" onClick={() => updateEntryMutation.mutate({ id: entry.id, version: editingEntry.version, release_date: editingEntry.release_date })}>
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
                                <span className="text-sm flex-1">{change.description}</span>
                                <Button size="sm" variant="ghost" onClick={() => setEditingChange({ id: change.id, type: change.change_type as ChangeType, description: change.description })}>
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
                        onClick={() => addChangeMutation.mutate({ entry_id: entry.id, type: 'added', description: 'New change' })}
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
              <label className="text-sm font-medium">Changes</label>
              <div className="space-y-2 mt-2">
                {newChanges.map((change, idx) => (
                  <div key={idx} className="flex gap-2">
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
