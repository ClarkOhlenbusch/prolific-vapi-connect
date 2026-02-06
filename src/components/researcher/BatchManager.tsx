import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Star, StickyNote } from 'lucide-react';
import { format } from 'date-fns';
import { GUEST_BATCHES, getGuestBatchStats } from '@/lib/guest-dummy-data';

interface Batch {
  id: string;
  name: string;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string;
  display_order: number;
}

interface BatchStats {
  batch_name: string;
  total_responses: number;
  formal_count: number;
  informal_count: number;
  first_response_at: string | null;
  last_response_at: string | null;
  avg_pets_total: number | null;
  avg_tias_total: number | null;
  avg_formality: number | null;
}

export const BatchManager = () => {
  const { isSuperAdmin, user, isGuestMode } = useResearcherAuth();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchStats, setBatchStats] = useState<Map<string, BatchStats>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
  const [newBatchName, setNewBatchName] = useState('');
  const [newBatchNotes, setNewBatchNotes] = useState('');
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    fetchBatches();
  }, [isGuestMode]);

  const fetchBatches = async () => {
    try {
      setIsLoading(true);
      
      // Use dummy data for guest mode
      if (isGuestMode) {
        setBatches(GUEST_BATCHES);
        const statsMap = new Map<string, BatchStats>();
        GUEST_BATCHES.forEach(batch => {
          statsMap.set(batch.name, getGuestBatchStats(batch.name));
        });
        setBatchStats(statsMap);
        setIsLoading(false);
        return;
      }
      
      // Fetch batches
      const { data: batchData, error: batchError } = await supabase
        .from('experiment_batches')
        .select('*')
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false });

      if (batchError) throw batchError;

      setBatches(batchData || []);

      // Fetch stats for all batches from experiment_responses
      const { data: responses, error: responseError } = await supabase
        .from('experiment_responses')
        .select('batch_label, assistant_type, created_at, pets_total, tias_total, formality');

      if (responseError) throw responseError;

      // Calculate stats per batch
      const statsMap = new Map<string, BatchStats>();
      
      responses?.forEach(response => {
        const batchName = response.batch_label || 'No Batch';
        
        if (!statsMap.has(batchName)) {
          statsMap.set(batchName, {
            batch_name: batchName,
            total_responses: 0,
            formal_count: 0,
            informal_count: 0,
            first_response_at: null,
            last_response_at: null,
            avg_pets_total: null,
            avg_tias_total: null,
            avg_formality: null,
          });
        }

        const stats = statsMap.get(batchName)!;
        stats.total_responses++;
        
        if (response.assistant_type === 'formal') stats.formal_count++;
        if (response.assistant_type === 'informal') stats.informal_count++;

        if (!stats.first_response_at || response.created_at < stats.first_response_at) {
          stats.first_response_at = response.created_at;
        }
        if (!stats.last_response_at || response.created_at > stats.last_response_at) {
          stats.last_response_at = response.created_at;
        }
      });

      // Calculate averages
      responses?.forEach(response => {
        const batchName = response.batch_label || 'No Batch';
        const stats = statsMap.get(batchName)!;
        
        if (response.pets_total !== null) {
          stats.avg_pets_total = (stats.avg_pets_total || 0) + (response.pets_total / stats.total_responses);
        }
        if (response.tias_total !== null) {
          stats.avg_tias_total = (stats.avg_tias_total || 0) + (response.tias_total / stats.total_responses);
        }
        if (response.formality !== null) {
          stats.avg_formality = (stats.avg_formality || 0) + (response.formality / stats.total_responses);
        }
      });

      setBatchStats(statsMap);
    } catch (error) {
      console.error('Error fetching batches:', error);
      toast.error('Failed to load batches');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateBatch = async () => {
    if (!newBatchName.trim()) {
      toast.error('Please enter a batch name');
      return;
    }

    // Guest mode: update local state only
    if (isGuestMode) {
      const maxOrder = batches.reduce((max, b) => Math.max(max, b.display_order), 0);
      const newBatch: Batch = {
        id: `guest-batch-${Date.now()}`,
        name: newBatchName.trim(),
        notes: newBatchNotes.trim() || null,
        is_active: true,
        created_at: new Date().toISOString(),
        created_by: 'guest',
        display_order: maxOrder + 1,
      };
      setBatches(prev => [newBatch, ...prev.map(b => ({ ...b, is_active: false }))]);
      toast.success('Batch created and set as active (demo mode - changes not saved)');
      setNewBatchName('');
      setNewBatchNotes('');
      setShowCreateDialog(false);
      return;
    }

    try {
      const maxOrder = batches.reduce((max, b) => Math.max(max, b.display_order), 0);
      
      const { error } = await supabase
        .from('experiment_batches')
        .insert({
          name: newBatchName.trim(),
          notes: newBatchNotes.trim() || null,
          is_active: true, // New batches are active by default
          created_by: user?.id,
          display_order: maxOrder + 1,
        });

      if (error) throw error;

      toast.success('Batch created and set as active');
      setNewBatchName('');
      setNewBatchNotes('');
      setShowCreateDialog(false);
      fetchBatches();
    } catch (error: any) {
      console.error('Error creating batch:', error);
      if (error.message?.includes('duplicate key')) {
        toast.error('A batch with this name already exists');
      } else {
        toast.error('Failed to create batch');
      }
    }
  };

  const handleSetActive = async (batch: Batch) => {
    // Guest mode: update local state only
    if (isGuestMode) {
      setBatches(prev => prev.map(b => ({ ...b, is_active: b.id === batch.id })));
      toast.success(`"${batch.name}" is now the active batch (demo mode - changes not saved)`);
      return;
    }

    try {
      // Update the batch to be active
      const { error: batchError } = await supabase
        .from('experiment_batches')
        .update({ is_active: true })
        .eq('id', batch.id);

      if (batchError) throw batchError;

      // Also update the current_batch_label setting so new responses use this batch name
      const { error: settingError } = await supabase
        .from('experiment_settings')
        .update({
          setting_value: batch.name,
          updated_at: new Date().toISOString(),
          updated_by: user?.id,
        })
        .eq('setting_key', 'current_batch_label');

      if (settingError) {
        console.error('Error updating batch label setting:', settingError);
        // Still show success since the batch was activated
      }

      toast.success(`"${batch.name}" is now the active batch`);
      fetchBatches();
    } catch (error) {
      console.error('Error setting active batch:', error);
      toast.error('Failed to set active batch');
    }
  };

  const handleUpdateNotes = async () => {
    if (!selectedBatch) return;

    // Guest mode: update local state only
    if (isGuestMode) {
      setBatches(prev => prev.map(b => 
        b.id === selectedBatch.id ? { ...b, notes: editNotes.trim() || null } : b
      ));
      toast.success('Notes updated (demo mode - changes not saved)');
      setShowEditDialog(false);
      setSelectedBatch(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('experiment_batches')
        .update({ notes: editNotes.trim() || null })
        .eq('id', selectedBatch.id);

      if (error) throw error;

      toast.success('Notes updated');
      setShowEditDialog(false);
      setSelectedBatch(null);
      fetchBatches();
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error('Failed to update notes');
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatch) return;

    // Guest mode: update local state only
    if (isGuestMode) {
      setBatches(prev => prev.filter(b => b.id !== selectedBatch.id));
      toast.success('Batch deleted (demo mode - changes not saved)');
      setShowDeleteDialog(false);
      setSelectedBatch(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('experiment_batches')
        .delete()
        .eq('id', selectedBatch.id);

      if (error) throw error;

      toast.success('Batch deleted');
      setShowDeleteDialog(false);
      setSelectedBatch(null);
      fetchBatches();
    } catch (error) {
      console.error('Error deleting batch:', error);
      toast.error('Failed to delete batch');
    }
  };

  const formatNumber = (value: number | null): string => {
    if (value === null || value === undefined) return '—';
    return value.toFixed(2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Experiment Batches</CardTitle>
            <CardDescription>
              Manage experiment batches and track their responses
            </CardDescription>
          </div>
          {isSuperAdmin && (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Batch
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Batch Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Responses</TableHead>
                <TableHead className="text-right">Formal / Informal</TableHead>
                <TableHead>Date Range</TableHead>
                <TableHead className="text-right">Avg PETS</TableHead>
                <TableHead className="text-right">Avg TIAS</TableHead>
                <TableHead className="text-right">Avg Formality</TableHead>
                <TableHead>Notes</TableHead>
                {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((batch, index) => {
                const stats = batchStats.get(batch.name);
                return (
                  <TableRow key={batch.id} className={batch.is_active ? 'bg-primary/5' : ''}>
                    <TableCell className="font-mono text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {batch.name}
                        <button
                          onClick={() => !batch.is_active && isSuperAdmin && handleSetActive(batch)}
                          disabled={batch.is_active || !isSuperAdmin}
                          title={batch.is_active ? "Active batch" : isSuperAdmin ? "Set as active batch" : "Only admins can change active batch"}
                          className={`${batch.is_active || !isSuperAdmin ? "cursor-default" : "cursor-pointer"}`}
                        >
                          <Star 
                            className={`h-4 w-4 ${
                              batch.is_active 
                                ? "text-yellow-500 fill-yellow-500" 
                                : "text-muted-foreground hover:text-yellow-500"
                            }`} 
                          />
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {batch.is_active ? (
                        <Badge className="bg-green-500">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {stats?.total_responses || 0}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm">
                        <Badge variant="default" className="mr-1">{stats?.formal_count || 0}</Badge>
                        /
                        <Badge variant="secondary" className="ml-1">{stats?.informal_count || 0}</Badge>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {stats?.first_response_at && stats?.last_response_at ? (
                        <>
                          {format(new Date(stats.first_response_at), 'MMM d')} - {format(new Date(stats.last_response_at), 'MMM d, yyyy')}
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(stats?.avg_pets_total ?? null)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(stats?.avg_tias_total ?? null)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(stats?.avg_formality ?? null)}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <p className="truncate text-sm text-muted-foreground">
                        {batch.notes || '—'}
                      </p>
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedBatch(batch);
                              setEditNotes(batch.notes || '');
                              setShowEditDialog(true);
                            }}
                            title="Edit notes"
                          >
                            <StickyNote className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedBatch(batch);
                              setShowDeleteDialog(true);
                            }}
                            title="Delete batch"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isSuperAdmin ? 11 : 10} className="text-center text-muted-foreground py-8">
                    No batches created yet. Create a batch to start organizing your experiment responses.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Batch Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Batch</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch Name</label>
              <Input
                placeholder="e.g., Pilot-1, Wave-A"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                placeholder="Add any notes about this batch..."
                value={newBatchNotes}
                onChange={(e) => setNewBatchNotes(e.target.value)}
                rows={3}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This batch will automatically become the active batch. New responses will be labeled with this batch name.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBatch}>
              Create Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Notes Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Notes: {selectedBatch?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="Add notes about this batch..."
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              rows={5}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateNotes}>
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Batch Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Batch: {selectedBatch?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the batch record. Responses with this batch label will keep their label but won't be associated with a batch anymore.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBatch} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
