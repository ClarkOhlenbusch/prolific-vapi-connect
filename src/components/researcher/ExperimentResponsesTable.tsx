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
import { Badge } from '@/components/ui/badge';
import { 
  Trash2, 
  Search, 
  Download,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Archive,
  Edit
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
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

type SortColumn = 'prolific_id' | 'created_at' | 'pets_total' | 'tias_total' | 'formality' | 'assistant_type' | 'batch_label';
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkArchiveDialog, setShowBulkArchiveDialog] = useState(false);
  const [showBulkAssistantDialog, setShowBulkAssistantDialog] = useState(false);
  const [showBulkBatchDialog, setShowBulkBatchDialog] = useState(false);
  const [bulkAssistantType, setBulkAssistantType] = useState<'formal' | 'informal'>('formal');
  const [bulkBatchLabel, setBulkBatchLabel] = useState('');
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
        query = query.or(`prolific_id.ilike.%${searchTerm}%,call_id.ilike.%${searchTerm}%,batch_label.ilike.%${searchTerm}%`);
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

  // Bulk archive selected responses
  const handleBulkArchive = async () => {
    if (selectedIds.size === 0 || !user) return;

    try {
      const itemsToArchive = data.filter(item => selectedIds.has(item.id));
      
      // Insert all into archived_responses
      const archiveInserts = itemsToArchive.map(item => ({
        original_table: 'experiment_responses',
        original_id: item.id,
        archived_data: JSON.parse(JSON.stringify(item)),
        archived_by: user.id,
        archive_reason: 'Bulk archived by researcher',
      }));

      const { error: archiveError } = await supabase
        .from('archived_responses')
        .insert(archiveInserts);

      if (archiveError) throw archiveError;

      // Delete all from experiment_responses
      const { error: deleteError } = await supabase
        .from('experiment_responses')
        .delete()
        .in('id', Array.from(selectedIds));

      if (deleteError) throw deleteError;

      toast.success(`${selectedIds.size} responses archived successfully`);
      setSelectedIds(new Set());
      setShowBulkArchiveDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error bulk archiving:', error);
      toast.error('Failed to archive responses');
    }
  };

  // Bulk update assistant type
  const handleBulkUpdateAssistantType = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ assistant_type: bulkAssistantType })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`Updated ${selectedIds.size} responses to ${bulkAssistantType}`);
      setSelectedIds(new Set());
      setShowBulkAssistantDialog(false);
      fetchData();
    } catch (error) {
      console.error('Error updating assistant type:', error);
      toast.error('Failed to update assistant type');
    }
  };

  // Bulk update batch label
  const handleBulkUpdateBatchLabel = async () => {
    if (selectedIds.size === 0) return;

    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ batch_label: bulkBatchLabel.trim() || null })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      toast.success(`Updated ${selectedIds.size} responses to batch "${bulkBatchLabel.trim() || '(none)'}"`);
      setSelectedIds(new Set());
      setShowBulkBatchDialog(false);
      setBulkBatchLabel('');
      fetchData();
    } catch (error) {
      console.error('Error updating batch label:', error);
      toast.error('Failed to update batch label');
    }
  };

  // Update single response batch label
  const handleUpdateSingleBatchLabel = async (id: string, newLabel: string) => {
    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ batch_label: newLabel.trim() || null })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Updated batch label`);
      fetchData();
    } catch (error) {
      console.error('Error updating batch label:', error);
      toast.error('Failed to update');
    }
  };

  // Update single response assistant type
  const handleUpdateSingleAssistantType = async (id: string, newType: 'formal' | 'informal') => {
    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ assistant_type: newType })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Updated to ${newType}`);
      fetchData();
    } catch (error) {
      console.error('Error updating assistant type:', error);
      toast.error('Failed to update');
    }
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.map(item => item.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const exportToCSV = () => {
    const headers = [
      'Prolific ID', 'Call ID', 'Created At', 'Assistant Type', 'Batch Label', 'PETS Total', 'PETS ER', 'PETS UT',
      'TIAS Total', 'Formality', 'Intention 1', 'Intention 2'
    ];
    
    const csvContent = [
      headers.join(','),
      ...data.map(row => [
        row.prolific_id,
        row.call_id,
        row.created_at,
        row.assistant_type || 'unknown',
        row.batch_label || '',
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
            placeholder="Search by ID, Call ID, or Batch..."
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

      {/* Bulk Actions Bar */}
      {isSuperAdmin && selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-muted rounded-lg border">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkAssistantDialog(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Change Assistant Type
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkBatchDialog(true)}
            >
              <Edit className="h-4 w-4 mr-2" />
              Change Batch Label
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkArchiveDialog(true)}
              className="text-destructive hover:text-destructive"
            >
              <Archive className="h-4 w-4 mr-2" />
              Archive Selected
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {isSuperAdmin && (
                <TableHead className="w-12">
                  <Checkbox
                    checked={data.length > 0 && selectedIds.size === data.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
              )}
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
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('assistant_type')}
                >
                  Assistant
                  {getSortIcon('assistant_type')}
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 -ml-3 font-medium"
                  onClick={() => handleSort('batch_label')}
                >
                  Batch
                  {getSortIcon('batch_label')}
                </Button>
              </TableHead>
              {isSuperAdmin && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 9 : 7} className="text-center py-8 text-muted-foreground">
                  No responses found
                </TableCell>
              </TableRow>
            ) : (
              data.map((row) => (
                <TableRow 
                  key={row.id}
                  className={`cursor-pointer hover:bg-muted/50 transition-colors ${selectedIds.has(row.id) ? 'bg-muted/30' : ''}`}
                  onClick={() => {
                    setViewItem(row);
                    resetScrollIndicator();
                  }}
                >
                  {isSuperAdmin && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${row.prolific_id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm">{row.prolific_id}</TableCell>
                  <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>{formatNumber(row.pets_total)}</TableCell>
                  <TableCell>{formatNumber(row.tias_total)}</TableCell>
                  <TableCell>{formatNumber(row.formality)}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isSuperAdmin ? (
                      <Select
                        value={row.assistant_type || 'unknown'}
                        onValueChange={(value) => {
                          if (value === 'formal' || value === 'informal') {
                            handleUpdateSingleAssistantType(row.id, value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-28 h-8">
                          <SelectValue>
                            {row.assistant_type ? (
                              <Badge variant={row.assistant_type === 'formal' ? 'default' : 'secondary'} className="text-xs">
                                {row.assistant_type}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">Unknown</span>
                            )}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formal">
                            <Badge variant="default" className="text-xs">formal</Badge>
                          </SelectItem>
                          <SelectItem value="informal">
                            <Badge variant="secondary" className="text-xs">informal</Badge>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      row.assistant_type ? (
                        <Badge variant={row.assistant_type === 'formal' ? 'default' : 'secondary'}>
                          {row.assistant_type}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Unknown</span>
                      )
                    )}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {isSuperAdmin ? (
                      <Input
                        className="w-24 h-8 text-xs"
                        value={row.batch_label || ''}
                        placeholder="-"
                        onChange={(e) => {
                          // Debounce update on blur
                        }}
                        onBlur={(e) => {
                          const newLabel = e.target.value;
                          if (newLabel !== (row.batch_label || '')) {
                            handleUpdateSingleBatchLabel(row.id, newLabel);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    ) : (
                      row.batch_label ? (
                        <Badge variant="outline" className="text-xs">
                          {row.batch_label}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )
                    )}
                  </TableCell>
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
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Assistant Type</label>
                      <p>
                        {viewItem.assistant_type ? (
                          <Badge variant={viewItem.assistant_type === 'formal' ? 'default' : 'secondary'}>
                            {viewItem.assistant_type}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">Unknown</span>
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Batch Label</label>
                      <p>
                        {viewItem.batch_label ? (
                          <Badge variant="outline">
                            {viewItem.batch_label}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">None</span>
                        )}
                      </p>
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

      {/* Bulk Archive Dialog */}
      <AlertDialog open={showBulkArchiveDialog} onOpenChange={setShowBulkArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {selectedIds.size} responses?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move {selectedIds.size} selected responses to the archive. They won't be permanently deleted and can be viewed in the Archived tab.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkArchive}>Archive All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Assistant Type Dialog */}
      <Dialog open={showBulkAssistantDialog} onOpenChange={setShowBulkAssistantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Assistant Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Update the assistant type for {selectedIds.size} selected responses.
            </p>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Select new assistant type:</label>
              <div className="flex gap-4">
                <Button
                  variant={bulkAssistantType === 'formal' ? 'default' : 'outline'}
                  onClick={() => setBulkAssistantType('formal')}
                  className="flex-1"
                >
                  <Badge variant="default" className="mr-2">Formal</Badge>
                  Professional style
                </Button>
                <Button
                  variant={bulkAssistantType === 'informal' ? 'default' : 'outline'}
                  onClick={() => setBulkAssistantType('informal')}
                  className="flex-1"
                >
                  <Badge variant="secondary" className="mr-2">Informal</Badge>
                  Casual style
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowBulkAssistantDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleBulkUpdateAssistantType}>
                Update {selectedIds.size} responses
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Batch Label Dialog */}
      <Dialog open={showBulkBatchDialog} onOpenChange={setShowBulkBatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Batch Label</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Update the batch label for {selectedIds.size} selected responses.
            </p>
            <div className="flex flex-col gap-3">
              <label className="text-sm font-medium">Enter new batch label:</label>
              <Input
                placeholder="e.g., Pilot-1, Wave-A (leave empty to clear)"
                value={bulkBatchLabel}
                onChange={(e) => setBulkBatchLabel(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to remove batch labels from selected responses.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => {
                setShowBulkBatchDialog(false);
                setBulkBatchLabel('');
              }}>
                Cancel
              </Button>
              <Button onClick={handleBulkUpdateBatchLabel}>
                Update {selectedIds.size} responses
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
