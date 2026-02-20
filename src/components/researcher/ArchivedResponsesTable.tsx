import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw
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
import { GUEST_ARCHIVED_RESPONSES } from '@/lib/guest-dummy-data';

interface ArchivedResponse {
  id: string;
  original_table: string;
  original_id: string;
  archived_data: Record<string, unknown>;
  archived_by: string;
  archived_at: string;
  archive_reason: string | null;
}

const PAGE_SIZE = 10;

export const ArchivedResponsesTable = () => {
  const [data, setData] = useState<ArchivedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const { isGuestMode } = useResearcherAuth();
  const navigate = useNavigate();

  const fetchData = async () => {
    // Use dummy data for guest mode
    if (isGuestMode) {
      let filtered = GUEST_ARCHIVED_RESPONSES as ArchivedResponse[];
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        filtered = filtered.filter(item => {
          const pid = (item.archived_data?.prolific_id as string | undefined) ?? '';
          return pid.toLowerCase().includes(query);
        });
      }
      const from = currentPage * PAGE_SIZE;
      const to = from + PAGE_SIZE;
      setData(filtered.slice(from, to));
      setTotalCount(filtered.length);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let query = supabase
        .from('archived_responses')
        .select('*', { count: 'exact' })
        .order('archived_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.ilike('archived_data->>prolific_id', `%${searchTerm}%`);
      }

      const { data: archived, count, error } = await query;

      if (error) throw error;

      setData((archived as ArchivedResponse[]) || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching archived data:', error);
      toast.error('Failed to load archived responses');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, searchTerm, isGuestMode]);

  const handleRestore = async () => {
    if (!restoreId) return;

    // In guest mode, just simulate restoration (update local state)
    if (isGuestMode) {
      setData(prev => prev.filter(item => item.id !== restoreId));
      setTotalCount(prev => prev - 1);
      toast.success('Response restored successfully (demo mode - changes not saved)');
      setRestoreId(null);
      return;
    }

    try {
      const itemToRestore = data.find(item => item.id === restoreId);
      if (!itemToRestore) return;

      // The original record was never deleted from participant_calls (deletion is blocked by trigger).
      // Restore simply removes the archived_responses entry, which makes it visible again.
      const { error: deleteError } = await supabase
        .from('archived_responses')
        .delete()
        .eq('id', restoreId);

      if (deleteError) throw deleteError;

      toast.success('Response restored successfully');
      setRestoreId(null);
      fetchData();
    } catch (error) {
      console.error('Error restoring:', error);
      toast.error('Failed to restore response');
    }
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
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by Prolific ID..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(0);
            }}
            className="pl-10"
          />
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prolific ID</TableHead>
              <TableHead>Archived At</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No archived responses
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => {
                const prolificId = (row.archived_data?.prolific_id as string | undefined) || '—';
                return (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/researcher/response/${row.original_id}`)}>
                    <TableCell className="font-mono text-sm font-medium text-primary">
                      {prolificId}
                    </TableCell>
                    <TableCell>{new Date(row.archived_at).toLocaleString()}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {row.archive_reason || 'No reason provided'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); navigate(`/researcher/response/${row.original_id}`); }}
                          title="View response details"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setRestoreId(row.id); }}
                          className="text-green-600 hover:text-green-700"
                          title="Restore participant"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {Math.min(currentPage * PAGE_SIZE + 1, totalCount)} to {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)} of {totalCount}
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
            Page {currentPage + 1} of {Math.max(1, totalPages)}
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

      <AlertDialog open={!!restoreId} onOpenChange={() => setRestoreId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this response?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unarchive the participant and make them visible again in the participants table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};
