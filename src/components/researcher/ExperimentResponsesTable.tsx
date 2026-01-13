import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  Edit,
  GripVertical,
  Filter,
  X,
  CalendarIcon,
  Check
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tables } from '@/integrations/supabase/types';

type Demographics = Tables<'demographics'>;

interface ExperimentResponseWithDemographics extends Tables<'experiment_responses'> {
  demographics?: Demographics | null;
}

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

type ExperimentResponse = ExperimentResponseWithDemographics;

type SortColumn = 'prolific_id' | 'created_at' | 'pets_total' | 'tias_total' | 'formality' | 'assistant_type' | 'batch_label' | 'godspeed_anthro_total' | 'godspeed_like_total' | 'godspeed_intel_total';
type SortDirection = 'asc' | 'desc' | null;

type ColumnId = 'select' | 'prolific_id' | 'created_at' | 'age' | 'gender' | 'pets_total' | 'tias_total' | 'godspeed_anthro_total' | 'godspeed_like_total' | 'godspeed_intel_total' | 'formality' | 'assistant_type' | 'batch_label' | 'actions';

interface ColumnDef {
  id: ColumnId;
  label: string;
  sortable: boolean;
  filterable: boolean;
  width?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatNumber = (value: number | null): string => {
  if (value === null || value === undefined) return 'N/A';
  return Number(value).toFixed(2);
};

interface FilterState {
  assistantType: string;
  batch: string;
  dateFrom: Date | undefined;
  dateTo: Date | undefined;
}

// Excel-style header cell with filter dropdown
const FilterableHeaderCell = ({ 
  column, 
  sortColumn, 
  sortDirection, 
  onSort, 
  filters,
  onFilterChange,
  availableBatches,
  isSuperAdmin,
}: { 
  column: ColumnDef;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (col: SortColumn) => void;
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: any) => void;
  availableBatches: string[];
  isSuperAdmin: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [datePickerType, setDatePickerType] = useState<'from' | 'to'>('from');

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Check if this column has an active filter
  const hasActiveFilter = () => {
    switch (column.id) {
      case 'assistant_type':
        return filters.assistantType !== 'all';
      case 'batch_label':
        return filters.batch !== 'all';
      case 'created_at':
        return filters.dateFrom !== undefined || filters.dateTo !== undefined;
      default:
        return false;
    }
  };

  const getSortIcon = () => {
    if (sortColumn !== column.id || sortDirection === null) {
      return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  // Special non-draggable columns
  if (column.id === 'select' || column.id === 'actions') {
    if (column.id === 'select' && !isSuperAdmin) return null;
    if (column.id === 'actions' && !isSuperAdmin) return null;
    return (
      <TableHead className={column.width}>
        {column.label}
      </TableHead>
    );
  }

  // Non-filterable columns
  if (!column.filterable) {
    return (
      <TableHead ref={setNodeRef} style={style} className="relative">
        <div className="flex items-center gap-1">
          <div {...attributes} {...listeners} className="cursor-grab opacity-50 hover:opacity-100">
            <GripVertical className="h-4 w-4" />
          </div>
          {column.sortable ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 -ml-1 font-medium px-2"
              onClick={() => onSort(column.id as SortColumn)}
            >
              {column.label}
              {getSortIcon()}
            </Button>
          ) : (
            <span className="font-medium">{column.label}</span>
          )}
        </div>
      </TableHead>
    );
  }

  // Filterable columns with Excel-style dropdown
  return (
    <TableHead ref={setNodeRef} style={style} className="relative">
      <div className="flex items-center gap-1">
        <div {...attributes} {...listeners} className="cursor-grab opacity-50 hover:opacity-100">
          <GripVertical className="h-4 w-4" />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 -ml-1 font-medium px-2 gap-1",
                hasActiveFilter() && "text-primary"
              )}
            >
              {column.label}
              <ChevronDown className="h-3 w-3" />
              {hasActiveFilter() && (
                <Filter className="h-3 w-3 text-primary" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-popover z-50">
            {/* Sort options */}
            {column.sortable && (
              <>
                <DropdownMenuItem onClick={() => { onSort(column.id as SortColumn); }}>
                  <ArrowUp className="h-4 w-4 mr-2" />
                  Sort Ascending
                  {sortColumn === column.id && sortDirection === 'asc' && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { 
                  if (sortColumn !== column.id || sortDirection !== 'desc') {
                    onSort(column.id as SortColumn);
                    if (sortDirection === 'asc') onSort(column.id as SortColumn);
                  }
                }}>
                  <ArrowDown className="h-4 w-4 mr-2" />
                  Sort Descending
                  {sortColumn === column.id && sortDirection === 'desc' && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Filter options based on column type */}
            {column.id === 'assistant_type' && (
              <>
                <DropdownMenuItem 
                  onClick={() => onFilterChange('assistantType', 'all')}
                  className={filters.assistantType === 'all' ? 'bg-accent' : ''}
                >
                  <Check className={cn("h-4 w-4 mr-2", filters.assistantType !== 'all' && "opacity-0")} />
                  All Types
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onFilterChange('assistantType', 'formal')}
                  className={filters.assistantType === 'formal' ? 'bg-accent' : ''}
                >
                  <Check className={cn("h-4 w-4 mr-2", filters.assistantType !== 'formal' && "opacity-0")} />
                  <Badge variant="default" className="text-xs mr-2">formal</Badge>
                  Formal Only
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onFilterChange('assistantType', 'informal')}
                  className={filters.assistantType === 'informal' ? 'bg-accent' : ''}
                >
                  <Check className={cn("h-4 w-4 mr-2", filters.assistantType !== 'informal' && "opacity-0")} />
                  <Badge variant="secondary" className="text-xs mr-2">informal</Badge>
                  Informal Only
                </DropdownMenuItem>
              </>
            )}

            {column.id === 'batch_label' && (
              <>
                <DropdownMenuItem 
                  onClick={() => onFilterChange('batch', 'all')}
                  className={filters.batch === 'all' ? 'bg-accent' : ''}
                >
                  <Check className={cn("h-4 w-4 mr-2", filters.batch !== 'all' && "opacity-0")} />
                  All Batches
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => onFilterChange('batch', 'none')}
                  className={filters.batch === 'none' ? 'bg-accent' : ''}
                >
                  <Check className={cn("h-4 w-4 mr-2", filters.batch !== 'none' && "opacity-0")} />
                  <span className="text-muted-foreground italic">No Batch</span>
                </DropdownMenuItem>
                {availableBatches.length > 0 && <DropdownMenuSeparator />}
                {availableBatches.map(batch => (
                  <DropdownMenuItem 
                    key={batch}
                    onClick={() => onFilterChange('batch', batch)}
                    className={filters.batch === batch ? 'bg-accent' : ''}
                  >
                    <Check className={cn("h-4 w-4 mr-2", filters.batch !== batch && "opacity-0")} />
                    <Badge variant="outline" className="text-xs mr-2">{batch}</Badge>
                  </DropdownMenuItem>
                ))}
              </>
            )}

            {column.id === 'created_at' && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    From Date
                    {filters.dateFrom && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {format(filters.dateFrom, 'MM/dd')}
                      </span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="p-0 bg-popover">
                      <Calendar
                        mode="single"
                        selected={filters.dateFrom}
                        onSelect={(date) => onFilterChange('dateFrom', date)}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    To Date
                    {filters.dateTo && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {format(filters.dateTo, 'MM/dd')}
                      </span>
                    )}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="p-0 bg-popover">
                      <Calendar
                        mode="single"
                        selected={filters.dateTo}
                        onSelect={(date) => onFilterChange('dateTo', date)}
                        initialFocus
                        className={cn("p-3 pointer-events-auto")}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
                {(filters.dateFrom || filters.dateTo) && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => {
                      onFilterChange('dateFrom', undefined);
                      onFilterChange('dateTo', undefined);
                    }}>
                      <X className="h-4 w-4 mr-2" />
                      Clear Date Filter
                    </DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TableHead>
  );
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

  // Filter states
  const [filters, setFilters] = useState<FilterState>({
    assistantType: 'all',
    batch: 'all',
    dateFrom: undefined,
    dateTo: undefined,
  });
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);

  // Column order state
  const [columnOrder, setColumnOrder] = useState<ColumnId[]>([
    'select', 'prolific_id', 'created_at', 'batch_label', 'assistant_type', 'formality', 'pets_total', 'tias_total', 'godspeed_anthro_total', 'godspeed_like_total', 'godspeed_intel_total', 'age', 'gender', 'actions'
  ]);

  const columns: ColumnDef[] = useMemo(() => [
    { id: 'select', label: '', sortable: false, filterable: false, width: 'w-12' },
    { id: 'prolific_id', label: 'Prolific ID', sortable: true, filterable: false },
    { id: 'created_at', label: 'Created At', sortable: true, filterable: true },
    { id: 'age', label: 'Age', sortable: false, filterable: false },
    { id: 'gender', label: 'Gender', sortable: false, filterable: false },
    { id: 'pets_total', label: 'PETS Total', sortable: true, filterable: false },
    { id: 'tias_total', label: 'TIAS Total', sortable: true, filterable: false },
    { id: 'godspeed_anthro_total', label: 'GS Anthro', sortable: true, filterable: false },
    { id: 'godspeed_like_total', label: 'GS Like', sortable: true, filterable: false },
    { id: 'godspeed_intel_total', label: 'GS Intel', sortable: true, filterable: false },
    { id: 'formality', label: 'Formality', sortable: true, filterable: false },
    { id: 'assistant_type', label: 'Assistant', sortable: true, filterable: true },
    { id: 'batch_label', label: 'Batch', sortable: true, filterable: true },
    { id: 'actions', label: 'Actions', sortable: false, filterable: false },
  ], []);

  const orderedColumns = useMemo(() => {
    return columnOrder.map(id => columns.find(c => c.id === id)!).filter(Boolean);
  }, [columnOrder, columns]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumnOrder((items) => {
        const oldIndex = items.indexOf(active.id as ColumnId);
        const newIndex = items.indexOf(over.id as ColumnId);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleFilterChange = (key: keyof FilterState, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setCurrentPage(0);
  };

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

  // Fetch available batches for filter dropdown
  const fetchBatches = async () => {
    try {
      const { data: batches, error } = await supabase
        .from('experiment_responses')
        .select('batch_label')
        .not('batch_label', 'is', null);

      if (error) throw error;

      const uniqueBatches = [...new Set(batches?.map(b => b.batch_label).filter(Boolean) as string[])];
      setAvailableBatches(uniqueBatches.sort());
    } catch (error) {
      console.error('Error fetching batches:', error);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

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

      // Apply search
      if (searchTerm) {
        query = query.or(`prolific_id.ilike.%${searchTerm}%,call_id.ilike.%${searchTerm}%,batch_label.ilike.%${searchTerm}%`);
      }

      // Apply filters
      if (filters.assistantType !== 'all') {
        query = query.eq('assistant_type', filters.assistantType);
      }

      if (filters.batch !== 'all') {
        if (filters.batch === 'none') {
          query = query.is('batch_label', null);
        } else {
          query = query.eq('batch_label', filters.batch);
        }
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data: responses, count, error } = await query;

      if (error) throw error;

      // Fetch demographics for each prolific_id
      if (responses && responses.length > 0) {
        const prolificIds = [...new Set(responses.map(r => r.prolific_id))];
        const { data: demographicsData, error: demoError } = await supabase
          .from('demographics')
          .select('*')
          .in('prolific_id', prolificIds);

        if (demoError) {
          console.error('Error fetching demographics:', demoError);
        }

        // Create a map for quick lookup
        const demographicsMap = new Map<string, Demographics>();
        demographicsData?.forEach(d => {
          demographicsMap.set(d.prolific_id, d);
        });

        // Merge demographics with responses
        const responsesWithDemographics = responses.map(r => ({
          ...r,
          demographics: demographicsMap.get(r.prolific_id) || null,
        }));

        setData(responsesWithDemographics);
      } else {
        setData([]);
      }
      
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
  }, [currentPage, searchTerm, pageSize, sortColumn, sortDirection, filters]);

  const clearFilters = () => {
    setFilters({
      assistantType: 'all',
      batch: 'all',
      dateFrom: undefined,
      dateTo: undefined,
    });
    setCurrentPage(0);
  };

  const hasActiveFilters = filters.assistantType !== 'all' || filters.batch !== 'all' || filters.dateFrom || filters.dateTo;

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

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0 || !user) return;

    try {
      const itemsToArchive = data.filter(item => selectedIds.has(item.id));
      
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
      fetchBatches();
    } catch (error) {
      console.error('Error updating batch label:', error);
      toast.error('Failed to update batch label');
    }
  };

  const handleUpdateSingleBatchLabel = async (id: string, newLabel: string) => {
    try {
      const { error } = await supabase
        .from('experiment_responses')
        .update({ batch_label: newLabel.trim() || null })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Updated batch label`);
      fetchData();
      fetchBatches();
    } catch (error) {
      console.error('Error updating batch label:', error);
      toast.error('Failed to update');
    }
  };

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

  // Export only the currently filtered data
  const exportToCSV = async () => {
    try {
      let query = supabase
        .from('experiment_responses')
        .select('*');

      if (sortColumn && sortDirection) {
        query = query.order(sortColumn, { ascending: sortDirection === 'asc', nullsFirst: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      if (searchTerm) {
        query = query.or(`prolific_id.ilike.%${searchTerm}%,call_id.ilike.%${searchTerm}%,batch_label.ilike.%${searchTerm}%`);
      }

      if (filters.assistantType !== 'all') {
        query = query.eq('assistant_type', filters.assistantType);
      }

      if (filters.batch !== 'all') {
        if (filters.batch === 'none') {
          query = query.is('batch_label', null);
        } else {
          query = query.eq('batch_label', filters.batch);
        }
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom.toISOString());
      }

      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte('created_at', endOfDay.toISOString());
      }

      const { data: exportData, error } = await query;

      if (error) throw error;

      if (!exportData || exportData.length === 0) {
        toast.error('No data to export');
        return;
      }

      // Fetch demographics for export
      const prolificIds = [...new Set(exportData.map(r => r.prolific_id))];
      const { data: demographicsData } = await supabase
        .from('demographics')
        .select('*')
        .in('prolific_id', prolificIds);

      const demographicsMap = new Map<string, Demographics>();
      demographicsData?.forEach(d => {
        demographicsMap.set(d.prolific_id, d);
      });

      const escapeCSV = (value: any) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Get all columns from the first row to ensure we export everything
      const experimentColumns = [
        'id', 'prolific_id', 'call_id', 'created_at', 'call_attempt_number', 'assistant_type', 'batch_label',
        'e1', 'e1_position', 'e2', 'e2_position', 'e3', 'e3_position', 
        'e4', 'e4_position', 'e5', 'e5_position', 'e6', 'e6_position',
        'u1', 'u1_position', 'u2', 'u2_position', 'u3', 'u3_position', 'u4', 'u4_position',
        'attention_check_1', 'attention_check_1_expected', 'attention_check_1_position',
        'pets_er', 'pets_ut', 'pets_total',
        'tias_1', 'tias_1_position', 'tias_2', 'tias_2_position', 'tias_3', 'tias_3_position',
        'tias_4', 'tias_4_position', 'tias_5', 'tias_5_position', 'tias_6', 'tias_6_position',
        'tias_7', 'tias_7_position', 'tias_8', 'tias_8_position', 'tias_9', 'tias_9_position',
        'tias_10', 'tias_10_position', 'tias_11', 'tias_11_position', 'tias_12', 'tias_12_position',
        'tias_attention_check_1', 'tias_attention_check_1_expected', 'tias_attention_check_1_position',
        'tias_total',
        'intention_1', 'intention_2', 'formality',
        'godspeed_anthro_1', 'godspeed_anthro_1_position', 'godspeed_anthro_2', 'godspeed_anthro_2_position',
        'godspeed_anthro_3', 'godspeed_anthro_3_position', 'godspeed_anthro_4', 'godspeed_anthro_4_position',
        'godspeed_anthro_total',
        'godspeed_like_1', 'godspeed_like_1_position', 'godspeed_like_2', 'godspeed_like_2_position',
        'godspeed_like_3', 'godspeed_like_3_position', 'godspeed_like_4', 'godspeed_like_4_position',
        'godspeed_like_5', 'godspeed_like_5_position', 'godspeed_like_total',
        'godspeed_intel_1', 'godspeed_intel_1_position', 'godspeed_intel_2', 'godspeed_intel_2_position',
        'godspeed_intel_3', 'godspeed_intel_3_position', 'godspeed_intel_4', 'godspeed_intel_4_position',
        'godspeed_intel_5', 'godspeed_intel_5_position', 'godspeed_intel_total',
        'godspeed_attention_check_1', 'godspeed_attention_check_1_expected', 'godspeed_attention_check_1_position',
        'voice_assistant_feedback', 'communication_style_feedback', 'experiment_feedback'
      ];

      const demographicColumns = [
        'demo_age', 'demo_gender', 'demo_native_english', 'demo_ethnicity', 
        'demo_va_familiarity', 'demo_va_usage_frequency'
      ];

      const headers = [...experimentColumns, ...demographicColumns];
      
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => {
          const demo = demographicsMap.get(row.prolific_id);
          const ethnicityStr = demo?.ethnicity 
            ? (Array.isArray(demo.ethnicity) ? (demo.ethnicity as string[]).join('; ') : String(demo.ethnicity))
            : '';
          
          const experimentValues = experimentColumns.map(col => {
            const value = (row as any)[col];
            return escapeCSV(value ?? '');
          });

          const demographicValues = [
            escapeCSV(demo?.age ?? ''),
            escapeCSV(demo?.gender ?? ''),
            escapeCSV(demo?.native_english ?? ''),
            escapeCSV(ethnicityStr),
            escapeCSV(demo?.voice_assistant_familiarity ?? ''),
            escapeCSV(demo?.voice_assistant_usage_frequency ?? ''),
          ];

          return [...experimentValues, ...demographicValues].join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      let filename = `experiment_responses_${new Date().toISOString().split('T')[0]}`;
      if (filters.batch !== 'all') filename += `_batch-${filters.batch}`;
      if (filters.assistantType !== 'all') filename += `_${filters.assistantType}`;
      filename += '.csv';
      
      a.download = filename;
      a.click();
      
      toast.success(`Exported ${exportData.length} responses`);
    } catch (error) {
      console.error('Error exporting:', error);
      toast.error('Failed to export data');
    }
  };

  const renderCell = (row: ExperimentResponse, columnId: ColumnId) => {
    switch (columnId) {
      case 'select':
        return isSuperAdmin ? (
          <TableCell onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedIds.has(row.id)}
              onCheckedChange={() => toggleSelect(row.id)}
              aria-label={`Select ${row.prolific_id}`}
            />
          </TableCell>
        ) : null;

      case 'prolific_id':
        return <TableCell className="font-mono text-sm" title={row.prolific_id}>{row.prolific_id.substring(0, 4)}...</TableCell>;

      case 'created_at':
        return <TableCell>{new Date(row.created_at).toLocaleDateString()}</TableCell>;

      case 'age':
        return <TableCell className="text-sm">{row.demographics?.age || <span className="text-muted-foreground">-</span>}</TableCell>;

      case 'gender':
        return <TableCell className="text-sm">{row.demographics?.gender || <span className="text-muted-foreground">-</span>}</TableCell>;

      case 'pets_total':
        return <TableCell>{formatNumber(row.pets_total)}</TableCell>;

      case 'tias_total':
        return <TableCell>{formatNumber(row.tias_total)}</TableCell>;

      case 'godspeed_anthro_total':
        return <TableCell>{formatNumber(row.godspeed_anthro_total)}</TableCell>;

      case 'godspeed_like_total':
        return <TableCell>{formatNumber(row.godspeed_like_total)}</TableCell>;

      case 'godspeed_intel_total':
        return <TableCell>{formatNumber(row.godspeed_intel_total)}</TableCell>;

      case 'formality':
        return <TableCell>{formatNumber(row.formality)}</TableCell>;

      case 'assistant_type':
        return (
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
                <SelectContent className="bg-popover">
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
        );

      case 'batch_label':
        return (
          <TableCell onClick={(e) => e.stopPropagation()}>
            {isSuperAdmin ? (
              <Input
                className="w-24 h-8 text-xs"
                defaultValue={row.batch_label || ''}
                placeholder="-"
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
        );

      case 'actions':
        return isSuperAdmin ? (
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
        ) : null;

      default:
        return null;
    }
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
        
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}
          
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
              <SelectContent className="bg-popover">
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

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.assistantType !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Assistant: {filters.assistantType}
              <button onClick={() => handleFilterChange('assistantType', 'all')} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.batch !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Batch: {filters.batch === 'none' ? 'No Batch' : filters.batch}
              <button onClick={() => handleFilterChange('batch', 'all')} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.dateFrom && (
            <Badge variant="secondary" className="gap-1">
              From: {format(filters.dateFrom, 'PP')}
              <button onClick={() => handleFilterChange('dateFrom', undefined)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.dateTo && (
            <Badge variant="secondary" className="gap-1">
              To: {format(filters.dateTo, 'PP')}
              <button onClick={() => handleFilterChange('dateTo', undefined)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}

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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <TableRow>
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  {orderedColumns.map((column) => {
                    // Special handling for select column checkbox
                    if (column.id === 'select') {
                      return isSuperAdmin ? (
                        <TableHead key={column.id} className="w-12">
                          <Checkbox
                            checked={data.length > 0 && selectedIds.size === data.length}
                            onCheckedChange={toggleSelectAll}
                            aria-label="Select all"
                          />
                        </TableHead>
                      ) : null;
                    }
                    
                    return (
                      <FilterableHeaderCell
                        key={column.id}
                        column={column}
                        sortColumn={sortColumn}
                        sortDirection={sortDirection}
                        onSort={handleSort}
                        filters={filters}
                        onFilterChange={handleFilterChange}
                        availableBatches={availableBatches}
                        isSuperAdmin={isSuperAdmin}
                      />
                    );
                  })}
                </SortableContext>
              </TableRow>
            </DndContext>
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
                  {orderedColumns.map((column) => (
                    <React.Fragment key={column.id}>
                      {renderCell(row, column.id)}
                    </React.Fragment>
                  ))}
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
          {hasActiveFilters && ' (filtered)'}
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

                  {/* Demographics Section */}
                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-2">Demographics</h4>
                    {viewItem.demographics ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground">Age</label>
                          <p>{viewItem.demographics.age}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Gender</label>
                          <p>{viewItem.demographics.gender}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Native English</label>
                          <p>{viewItem.demographics.native_english}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Ethnicity</label>
                          <p className="text-sm">
                            {Array.isArray(viewItem.demographics.ethnicity) 
                              ? (viewItem.demographics.ethnicity as string[]).join(', ')
                              : String(viewItem.demographics.ethnicity)}
                          </p>
                        </div>
                        {viewItem.demographics.voice_assistant_familiarity !== null && (
                          <div>
                            <label className="text-sm text-muted-foreground">VA Familiarity</label>
                            <p>{formatNumber(viewItem.demographics.voice_assistant_familiarity)}</p>
                          </div>
                        )}
                        {viewItem.demographics.voice_assistant_usage_frequency !== null && (
                          <div>
                            <label className="text-sm text-muted-foreground">VA Usage Frequency</label>
                            <p>{formatNumber(viewItem.demographics.voice_assistant_usage_frequency)}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic text-sm">No demographic data available</p>
                    )}
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

                  {/* Godspeed Section */}
                  {(viewItem.godspeed_anthro_total !== null || viewItem.godspeed_like_total !== null || viewItem.godspeed_intel_total !== null) && (
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Godspeed Scores</h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="text-sm text-muted-foreground">Anthropomorphism</label>
                          <p className="font-bold">{formatNumber(viewItem.godspeed_anthro_total)}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Likeability</label>
                          <p className="font-bold">{formatNumber(viewItem.godspeed_like_total)}</p>
                        </div>
                        <div>
                          <label className="text-sm text-muted-foreground">Intelligence</label>
                          <p className="font-bold">{formatNumber(viewItem.godspeed_intel_total)}</p>
                        </div>
                      </div>
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
