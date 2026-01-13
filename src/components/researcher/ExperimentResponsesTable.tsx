import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Trash2, 
  Search, 
  Download,
  ChevronLeft,
  ChevronRight,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tables } from '@/integrations/supabase/types';

type ExperimentResponse = Tables<'experiment_responses'>;

const PAGE_SIZE = 10;

export const ExperimentResponsesTable = () => {
  const [data, setData] = useState<ExperimentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<ExperimentResponse | null>(null);
  const { isSuperAdmin, user } = useResearcherAuth();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('experiment_responses')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.or(`prolific_id.ilike.%${searchTerm}%,call_id.ilike.%${searchTerm}%`);
      }

      const { data: responses, count, error } = await query;

      if (error) throw error;

      setData(responses || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load responses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, searchTerm]);

  const handleArchive = async () => {
    if (!deleteId || !user) return;

    try {
      // Find the item to archive
      const itemToArchive = data.find(item => item.id === deleteId);
      if (!itemToArchive) return;

      // Insert into archive
      const { error: archiveError } = await supabase
        .from('archived_responses')
        .insert([{
          original_table: 'experiment_responses',
          original_id: deleteId,
          archived_data: JSON.parse(JSON.stringify(itemToArchive)),
          archived_by: user.id,
          archive_reason: 'Archived by researcher',
        }]);

      if (archiveError) throw archiveError;

      // Delete from original table
      const { error: deleteError } = await supabase
        .from('experiment_responses')
        .delete()
        .eq('id', deleteId);

      if (deleteError) throw deleteError;

      toast.success('Response archived successfully');
      setDeleteId(null);
      fetchData();
    } catch (error) {
      console.error('Error archiving:', error);
      toast.error('Failed to archive response');
    }
  };

  const exportToCSV = () => {
    const headers = [
      'Prolific ID', 'Call ID', 'Created At', 'PETS Total', 'PETS ER', 'PETS UT',
      'TIAS Total', 'Formality', 'Intention 1', 'Intention 2'
    ];
    
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.prolific_id,
        row.call_id,
        row.created_at,
        row.pets_total,
        row.pets_er,
        row.pets_ut,
        row.tias_total || '',
        row.formality,
        row.intention_1,
        row.intention_2
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `experiment_responses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (isLoading && data.length === 0) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Prolific ID or Call ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(0);
            }}
            className="pl-10"
          />
        </div>
        
        {isSuperAdmin && (
          <Button onClick={exportToCSV} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prolific ID</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>PETS Total</TableHead>
              <TableHead>TIAS Total</TableHead>
              <TableHead>Formality</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No responses found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.prolific_id}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{row.pets_total}</TableCell>
                  <TableCell>{row.tias_total ?? 'N/A'}</TableCell>
                  <TableCell>{row.formality}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewItem(row)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(row.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {currentPage * PAGE_SIZE + 1} to {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => p - 1)}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={currentPage >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Archive Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this response?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the response to the archive. It won't be permanently deleted and can be viewed in the Archived tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Details Dialog */}
      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Response Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {viewItem && (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Prolific ID</label>
                    <p className="font-mono">{viewItem.prolific_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Call ID</label>
                    <p className="font-mono text-sm">{viewItem.call_id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Created At</label>
                    <p>{new Date(viewItem.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Call Attempt</label>
                    <p>{viewItem.call_attempt_number}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">PETS Scores</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Total</label>
                      <p className="font-bold">{viewItem.pets_total}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">ER</label>
                      <p>{viewItem.pets_er}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">UT</label>
                      <p>{viewItem.pets_ut}</p>
                    </div>
                  </div>
                </div>

                {viewItem.tias_total !== null && (
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">TIAS Score</h4>
                    <p className="font-bold">{viewItem.tias_total}</p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Formality & Intention</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm text-muted-foreground">Formality</label>
                      <p>{viewItem.formality}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Intention 1</label>
                      <p>{viewItem.intention_1}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Intention 2</label>
                      <p>{viewItem.intention_2}</p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Feedback</h4>
                  <div className="space-y-2">
                    <div>
                      <label className="text-sm text-muted-foreground">Voice Assistant</label>
                      <p className="text-sm">{viewItem.voice_assistant_feedback}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Communication Style</label>
                      <p className="text-sm">{viewItem.communication_style_feedback}</p>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground">Experiment</label>
                      <p className="text-sm">{viewItem.experiment_feedback}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
