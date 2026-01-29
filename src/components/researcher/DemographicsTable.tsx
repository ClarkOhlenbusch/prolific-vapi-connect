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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tables } from '@/integrations/supabase/types';

type Demographics = Tables<'demographics'>;

const PAGE_SIZE = 10;

export const DemographicsTable = () => {
  const [data, setData] = useState<Demographics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<Demographics | null>(null);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const { isSuperAdmin, user } = useResearcherAuth();
  const { logActivity } = useActivityLog();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('demographics')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (searchTerm) {
        query = query.ilike('prolific_id', `%${searchTerm}%`);
      }

      const { data: demographics, count, error } = await query;

      if (error) throw error;

      setData(demographics || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load demographics');
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
      const itemToArchive = data.find(item => item.id === deleteId);
      if (!itemToArchive) return;

      const { error: archiveError } = await supabase
        .from('archived_responses')
        .insert([{
          original_table: 'demographics',
          original_id: deleteId,
          archived_data: JSON.parse(JSON.stringify(itemToArchive)),
          archived_by: user.id,
          archive_reason: 'Archived by researcher',
        }]);

      if (archiveError) throw archiveError;

      const { error: deleteError } = await supabase
        .from('demographics')
        .delete()
        .eq('id', deleteId);

      if (deleteError) throw deleteError;

      toast.success('Demographics archived successfully');
      setDeleteId(null);
      fetchData();
    } catch (error) {
      console.error('Error archiving:', error);
      toast.error('Failed to archive demographics');
    }
  };

  const exportToCSV = async () => {
    const headers = ['Prolific ID', 'Age', 'Gender', 'Native English', 'Ethnicity', 'Created At'];
    
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.prolific_id,
        row.age,
        row.gender,
        row.native_english,
        JSON.stringify(row.ethnicity),
        row.created_at
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `demographics_${new Date().toISOString().split('T')[0]}.csv`;
    a.download = filename;
    a.click();

    // Log the download activity
    await logActivity({ 
      action: 'download_demographics', 
      details: { 
        record_count: data.length,
        filename 
      } 
    });

    toast.success(`Exported ${data.length} demographics records`);
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

  const formatEthnicity = (ethnicity: unknown): string => {
    if (Array.isArray(ethnicity)) {
      return ethnicity.join(', ');
    }
    return String(ethnicity);
  };

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
        
        {isSuperAdmin && (
          <Button onClick={() => setShowDownloadConfirm(true)} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Prolific ID</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Native English</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No demographics found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-sm">{row.prolific_id}</TableCell>
                  <TableCell>{row.age}</TableCell>
                  <TableCell className="capitalize">{row.gender}</TableCell>
                  <TableCell className="capitalize">{row.native_english}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
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

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the demographics to the archive. It won't be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewItem} onOpenChange={() => setViewItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Demographics Details</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Prolific ID</label>
                  <p className="font-mono">{viewItem.prolific_id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Created At</label>
                  <p>{new Date(viewItem.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Age</label>
                  <p>{viewItem.age}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Gender</label>
                  <p className="capitalize">{viewItem.gender}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Native English</label>
                  <p className="capitalize">{viewItem.native_english}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Ethnicity</label>
                  <p>{formatEthnicity(viewItem.ethnicity)}</p>
                </div>
                {viewItem.voice_assistant_familiarity && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">VA Familiarity</label>
                    <p>{viewItem.voice_assistant_familiarity}</p>
                  </div>
                )}
                {viewItem.voice_assistant_usage_frequency && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">VA Usage Frequency</label>
                    <p>{viewItem.voice_assistant_usage_frequency}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Download Confirmation Dialog */}
      <DownloadConfirmDialog
        open={showDownloadConfirm}
        onOpenChange={setShowDownloadConfirm}
        onConfirm={exportToCSV}
        dataType="demographics data with participant information"
      />
    </div>
  );
};
