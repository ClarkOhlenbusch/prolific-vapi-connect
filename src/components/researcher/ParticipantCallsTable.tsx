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
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Trash2, 
  Search, 
  Download,
  ChevronLeft,
  ChevronRight,
  Archive
} from 'lucide-react';
import { toast } from 'sonner';
import { useActivityLog } from '@/hooks/useActivityLog';
import { DownloadConfirmDialog } from './DownloadConfirmDialog';
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
import { Tables } from '@/integrations/supabase/types';

type ParticipantCall = Tables<'participant_calls'>;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const ParticipantCallsTable = () => {
  const [data, setData] = useState<ParticipantCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveMode, setArchiveMode] = useState<'single' | 'bulk'>('single');
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const { isSuperAdmin, user } = useResearcherAuth();
  const { logActivity } = useActivityLog();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('participant_calls')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      if (searchTerm) {
        query = query.or(`prolific_id.ilike.%${searchTerm}%,call_id.ilike.%${searchTerm}%`);
      }

      if (statusFilter === 'completed') {
        query = query.eq('is_completed', true);
      } else if (statusFilter === 'pending') {
        query = query.eq('is_completed', false);
      }

      const { data: calls, count, error } = await query;

      if (error) throw error;

      setData(calls || []);
      setTotalCount(count || 0);
      // Clear selection when data changes
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load calls');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentPage, searchTerm, pageSize, statusFilter]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(data.map(item => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedIds(newSelection);
  };

  const handleArchiveSingle = (id: string) => {
    setSingleDeleteId(id);
    setArchiveMode('single');
    setShowArchiveDialog(true);
  };

  const handleArchiveBulk = () => {
    setArchiveMode('bulk');
    setShowArchiveDialog(true);
  };

  const handleArchiveConfirm = async () => {
    if (!user) return;

    const idsToArchive = archiveMode === 'single' && singleDeleteId 
      ? [singleDeleteId] 
      : Array.from(selectedIds);

    if (idsToArchive.length === 0) return;

    try {
      const itemsToArchive = data.filter(item => idsToArchive.includes(item.id));
      
      // Insert all items to archive
      const archiveRecords = itemsToArchive.map(item => ({
        original_table: 'participant_calls',
        original_id: item.id,
        archived_data: JSON.parse(JSON.stringify(item)),
        archived_by: user.id,
        archive_reason: archiveMode === 'bulk' ? 'Bulk archived by researcher' : 'Archived by researcher',
      }));

      const { error: archiveError } = await supabase
        .from('archived_responses')
        .insert(archiveRecords);

      if (archiveError) throw archiveError;

      // Delete all archived items
      const { error: deleteError } = await supabase
        .from('participant_calls')
        .delete()
        .in('id', idsToArchive);

      if (deleteError) throw deleteError;

      toast.success(`${idsToArchive.length} call(s) archived successfully`);
      setShowArchiveDialog(false);
      setSingleDeleteId(null);
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      console.error('Error archiving:', error);
      toast.error('Failed to archive calls');
    }
  };

  const exportToCSV = async () => {
    const headers = ['Prolific ID', 'Call ID', 'Created At', 'Expires At', 'Token Used'];
    
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.prolific_id,
        row.call_id,
        row.created_at,
        row.expires_at,
        row.is_completed
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `participant_calls_${new Date().toISOString().split('T')[0]}.csv`;
    a.download = filename;
    a.click();

    // Log the download activity
    await logActivity({ 
      action: 'download_participant_calls', 
      details: { 
        record_count: data.length,
        filename 
      } 
    });

    toast.success(`Exported ${data.length} participant calls`);
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allSelected = data.length > 0 && data.every(item => selectedIds.has(item.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

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
      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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
          
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value);
            setCurrentPage(0);
          }}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          {isSuperAdmin && selectedIds.size > 0 && (
            <Button onClick={handleArchiveBulk} variant="destructive" size="sm">
              <Archive className="h-4 w-4 mr-2" />
              Archive ({selectedIds.size})
            </Button>
          )}
          {isSuperAdmin && (
            <Button onClick={() => setShowDownloadConfirm(true)} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isSuperAdmin && (
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) {
                        (el as any).indeterminate = someSelected;
                      }
                    }}
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
              <TableHead>Prolific ID</TableHead>
              <TableHead>Call ID</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Status</TableHead>
              {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 6 : 4} className="text-center py-8 text-muted-foreground">
                  No calls found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id} className={selectedIds.has(row.id) ? 'bg-muted/50' : ''}>
                  {isSuperAdmin && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(checked) => handleSelectOne(row.id, !!checked)}
                        aria-label={`Select ${row.prolific_id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm">{row.prolific_id}</TableCell>
                  <TableCell className="font-mono text-xs max-w-[150px] truncate">
                    {row.call_id}
                  </TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant={row.is_completed ? "secondary" : "outline"}>
                      {row.is_completed ? 'Completed' : 'Pending'}
                    </Badge>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchiveSingle(row.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Show</span>
          <Select value={pageSize.toString()} onValueChange={(value) => {
            setPageSize(Number(value));
            setCurrentPage(0);
          }}>
            <SelectTrigger className="w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(size => (
                <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">per page</span>
        </div>

        <p className="text-sm text-muted-foreground">
          Showing {totalCount === 0 ? 0 : currentPage * pageSize + 1} to {Math.min((currentPage + 1) * pageSize, totalCount)} of {totalCount}
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
            Page {totalPages === 0 ? 0 : currentPage + 1} of {totalPages}
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

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveMode === 'bulk' 
                ? `Archive ${selectedIds.size} call(s)?` 
                : 'Archive this call?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will move the call record(s) to the archive. They won't be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Download Confirmation Dialog */}
      <DownloadConfirmDialog
        open={showDownloadConfirm}
        onOpenChange={setShowDownloadConfirm}
        onConfirm={exportToCSV}
        dataType="participant call data"
      />
    </div>
  );
};
