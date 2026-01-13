import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  ChevronLeft,
  ChevronRight,
  Eye,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [viewItem, setViewItem] = useState<ArchivedResponse | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('archived_responses')
        .select('*', { count: 'exact' })
        .order('archived_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.ilike('original_table', `%${searchTerm}%`);
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
  }, [currentPage, searchTerm]);

  const handleRestore = async () => {
    if (!restoreId) return;

    try {
      const itemToRestore = data.find(item => item.id === restoreId);
      if (!itemToRestore) return;

      // Re-insert into original table
      const { error: insertError } = await supabase
        .from(itemToRestore.original_table as 'experiment_responses')
        .insert(itemToRestore.archived_data as never);

      if (insertError) throw insertError;

      // Delete from archive
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

  const getTableColor = (table: string) => {
    switch (table) {
      case 'experiment_responses':
        return 'bg-blue-100 text-blue-800';
      case 'demographics':
        return 'bg-green-100 text-green-800';
      case 'participant_calls':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
            placeholder="Search by table name..."
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
              <TableHead>Original Table</TableHead>
              <TableHead>Original ID</TableHead>
              <TableHead>Archived At</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No archived responses
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge className={getTableColor(row.original_table)} variant="outline">
                      {row.original_table.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.original_id}</TableCell>
                  <TableCell>{new Date(row.archived_at).toLocaleString()}</TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {row.archive_reason || 'No reason provided'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewItem(row)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRestoreId(row.id)}
                        className="text-green-600 hover:text-green-700"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
              This will restore the response back to its original table and remove it from the archive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Archived Data</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {viewItem && (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Original Table</label>
                    <p>{viewItem.original_table}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Archived At</label>
                    <p>{new Date(viewItem.archived_at).toLocaleString()}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Archive Reason</label>
                    <p>{viewItem.archive_reason || 'No reason provided'}</p>
                  </div>
                </div>
                
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Original Data</h4>
                  <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
                    {JSON.stringify(viewItem.archived_data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
