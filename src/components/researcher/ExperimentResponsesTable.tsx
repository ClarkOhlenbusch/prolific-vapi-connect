import { useEffect, useState, useRef } from 'react';
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
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tables } from '@/integrations/supabase/types';

type ExperimentResponse = Tables<'experiment_responses'>;

type SortColumn = 'prolific_id' | 'created_at' | 'pets_total' | 'tias_total' | 'formality';
type SortDirection = 'asc' | 'desc' | null;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatNumber = (value: number | null): string => {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toFixed(2);
};

export const ExperimentResponsesTable = () => {
  const [data, setData] = useState<ExperimentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewItem, setViewItem] = useState<ExperimentResponse | null>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const [pageSize, setPageSize] = useState(10);
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isSuperAdmin, user } = useResearcherAuth();

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 20;
    setShowScrollIndicator(!isAtBottom);
  };

  const resetScrollIndicator = () => {
    setShowScrollIndicator(true);
    setTimeout(() => {
      if (scrollRef.current) {
        const isScrollable = scrollRef.current.scrollHeight > scrollRef.current.clientHeight;
        setShowScrollIndicator(isScrollable);
      }
    }, 100);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle: asc -> desc -> null -> asc
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn('created_at');
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
    setCurrentPage(0);
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column || sortDirection === null) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 ml-1" />
      : <ArrowDown className="h-4 w-4 ml-1" />;
  };

  const fetchData = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('experiment_responses')
        .select('*', { count: 'exact' })
        .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      // Apply sorting
      if (sortColumn && sortDirection) {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc', nullsFirst: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

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
  }, [currentPage, searchTerm, pageSize, sortColumn, sortDirection]);

  const handleArchive = async () => {
    if (!deleteId || !user) return;

    try {
      const itemToArchive = data.find(item => item.id === deleteId);
      if (!itemToArchive) return;

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

  const totalPages = Math.ceil(totalCount / pageSize);

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
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Show</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => {
                setPageSize(Number(value));
                setCurrentPage(0);
              }}
            >
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {isSuperAdmin && (
            <Button onClick={exportToCSV} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('prolific_id')}
                >
                  Prolific ID
                  {getSortIcon('prolific_id')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('created_at')}
                >
                  Created At
                  {getSortIcon('created_at')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('pets_total')}
                >
                  PETS Total
                  {getSortIcon('pets_total')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('tias_total')}
                >
                  TIAS Total
                  {getSortIcon('tias_total')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('formality')}
                >
                  Formality
                  {getSortIcon('formality')}
                </Button>
              </TableHead>
              {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">
                  No responses found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow 
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setViewItem(row);
                    resetScrollIndicator();
                  }}
                >
                  <TableCell className="font-mono text-sm">{row.prolific_id}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{formatNumber(row.pets_total)}</TableCell>
                  <TableCell>{formatNumber(row.tias_total)}</TableCell>
                  <TableCell>{formatNumber(row.formality)}</TableCell>
                  {isSuperAdmin && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(row.id);
                        }}
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

      {/* Pagination */}
      <div className="flex items-center justify-between">
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
          <div className="relative">
            <div 
              ref={scrollRef}
              className="max-h-[60vh] overflow-y-auto pr-2"
              onScroll={handleScroll}
            >
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
                        <p className="font-bold">{formatNumber(viewItem.pets_total)}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">ER</label>
                        <p>{formatNumber(viewItem.pets_er)}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">UT</label>
                        <p>{formatNumber(viewItem.pets_ut)}</p>
                      </div>
                    </div>
                  </div>

                  {viewItem.tias_total !== null && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">TIAS Score</h4>
                      <p className="font-bold">{formatNumber(viewItem.tias_total)}</p>
                    </div>
                  )}

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Formality & Intention</h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm text-muted-foreground">Formality</label>
                        <p>{formatNumber(viewItem.formality)}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Intention 1</label>
                        <p>{formatNumber(viewItem.intention_1)}</p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Intention 2</label>
                        <p>{formatNumber(viewItem.intention_2)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Feedback</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm text-muted-foreground">Voice Assistant</label>
                        <p className="text-sm mt-1 p-2 bg-muted/50 rounded-md">
                          {viewItem.voice_assistant_feedback || <span className="text-muted-foreground italic">No feedback provided</span>}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Communication Style</label>
                        <p className="text-sm mt-1 p-2 bg-muted/50 rounded-md">
                          {viewItem.communication_style_feedback || <span className="text-muted-foreground italic">No feedback provided</span>}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm text-muted-foreground">Experiment</label>
                        <p className="text-sm mt-1 p-2 bg-muted/50 rounded-md">
                          {viewItem.experiment_feedback || <span className="text-muted-foreground italic">No feedback provided</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Scroll indicator */}
            {showScrollIndicator && (
              <div className="absolute bottom-0 left-0 right-0 pointer-events-none">
                <div className="h-16 bg-gradient-to-t from-background to-transparent" />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center text-muted-foreground">
                  <ChevronDown className="h-5 w-5 animate-bounce" />
                  <span className="text-xs">Scroll for more</span>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
