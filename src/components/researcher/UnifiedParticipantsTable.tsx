import { useEffect, useState, useMemo } from 'react';
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
  Search, 
  Download,
  ChevronLeft,
  ChevronRight,
  Archive,
  Route
} from 'lucide-react';
import { toast } from 'sonner';
import { useActivityLog } from '@/hooks/useActivityLog';
import { DownloadConfirmDialog } from './DownloadConfirmDialog';
import { ParticipantJourneyModal } from './ParticipantJourneyModal';
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
type ExperimentResponse = Tables<'experiment_responses'>;
type Demographics = Tables<'demographics'>;

interface UnifiedParticipant {
  // From participant_calls
  id: string;
  prolific_id: string;
  call_id: string;
  created_at: string;
  token_used: boolean;
  // From experiment_responses (optional)
  response_id?: string;
  assistant_type?: string | null;
  batch_label?: string | null;
  pets_total?: number | null;
  tias_total?: number | null;
  formality?: number | null;
  // From demographics (optional)
  age?: string | null;
  gender?: string | null;
  // Derived
  status: 'Completed' | 'Pending';
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return Number(value).toFixed(2);
};

export const UnifiedParticipantsTable = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<UnifiedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('completed'); // Default to completed
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all'); // New: researcher vs participant filter
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveMode, setArchiveMode] = useState<'single' | 'bulk'>('single');
  const [singleArchiveId, setSingleArchiveId] = useState<string | null>(null);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [journeyModal, setJourneyModal] = useState<{
    open: boolean;
    prolificId: string;
    status: 'Completed' | 'Pending';
    condition: string | null;
  }>({ open: false, prolificId: '', status: 'Pending', condition: null });
  
  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const { isSuperAdmin, user } = useResearcherAuth();
  const { logActivity } = useActivityLog();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch participant_calls
      const { data: calls, error: callsError } = await supabase
        .from('participant_calls')
        .select('*')
        .order('created_at', { ascending: false });

      if (callsError) throw callsError;

      // Fetch experiment_responses
      const { data: responses, error: responsesError } = await supabase
        .from('experiment_responses')
        .select('id, call_id, prolific_id, assistant_type, batch_label, pets_total, tias_total, formality');

      if (responsesError) throw responsesError;

      // Fetch demographics
      const { data: demographics, error: demographicsError } = await supabase
        .from('demographics')
        .select('prolific_id, age, gender');

      if (demographicsError) throw demographicsError;

      // Create lookup maps
      const responseMap = new Map<string, typeof responses[0]>();
      responses?.forEach(r => responseMap.set(r.call_id, r));

      const demographicsMap = new Map<string, typeof demographics[0]>();
      demographics?.forEach(d => demographicsMap.set(d.prolific_id, d));

      // Combine data
      const unified: UnifiedParticipant[] = (calls || []).map(call => {
        const response = responseMap.get(call.call_id);
        const demo = demographicsMap.get(call.prolific_id);

        return {
          id: call.id,
          prolific_id: call.prolific_id,
          call_id: call.call_id,
          created_at: call.created_at,
          token_used: call.token_used,
          response_id: response?.id,
          assistant_type: response?.assistant_type,
          batch_label: response?.batch_label,
          pets_total: response?.pets_total,
          tias_total: response?.tias_total,
          formality: response?.formality,
          age: demo?.age,
          gender: demo?.gender,
          status: response ? 'Completed' : 'Pending',
        };
      });

      // Get unique batches for filter
      const batches = new Set<string>();
      unified.forEach(p => {
        if (p.batch_label) batches.add(p.batch_label);
      });
      setAvailableBatches(Array.from(batches).sort());

      setData(unified);
      setSelectedIds(new Set());
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load participants');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Helper to detect researcher IDs (Prolific IDs are exactly 24 characters)
  const isResearcherId = (prolificId: string): boolean => {
    return prolificId.length !== 24;
  };

  // Filter and paginate data
  const filteredData = useMemo(() => {
    let result = data;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.prolific_id.toLowerCase().includes(term) ||
        p.call_id.toLowerCase().includes(term)
      );
    }

    // Status filter
    if (statusFilter === 'completed') {
      result = result.filter(p => p.status === 'Completed');
    } else if (statusFilter === 'pending') {
      result = result.filter(p => p.status === 'Pending');
    }

    // Source filter (researcher vs participant)
    if (sourceFilter === 'researcher') {
      result = result.filter(p => isResearcherId(p.prolific_id));
    } else if (sourceFilter === 'participant') {
      result = result.filter(p => !isResearcherId(p.prolific_id));
    }

    // Condition filter
    if (conditionFilter !== 'all') {
      result = result.filter(p => p.assistant_type === conditionFilter);
    }

    // Batch filter
    if (batchFilter !== 'all') {
      if (batchFilter === 'none') {
        result = result.filter(p => !p.batch_label);
      } else {
        result = result.filter(p => p.batch_label === batchFilter);
      }
    }

    return result;
  }, [data, searchTerm, statusFilter, conditionFilter, batchFilter, sourceFilter]);

  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  useEffect(() => {
    setTotalCount(filteredData.length);
  }, [filteredData]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchTerm, statusFilter, conditionFilter, batchFilter, sourceFilter]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(paginatedData.map(item => item.id)));
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
    setSingleArchiveId(id);
    setArchiveMode('single');
    setShowArchiveDialog(true);
  };

  const handleArchiveBulk = () => {
    setArchiveMode('bulk');
    setShowArchiveDialog(true);
  };

  const handleArchiveConfirm = async () => {
    if (!user) return;

    const idsToArchive = archiveMode === 'single' && singleArchiveId 
      ? [singleArchiveId] 
      : Array.from(selectedIds);

    if (idsToArchive.length === 0) return;

    try {
      const itemsToArchive = data.filter(item => idsToArchive.includes(item.id));
      
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

      const { error: deleteError } = await supabase
        .from('participant_calls')
        .delete()
        .in('id', idsToArchive);

      if (deleteError) throw deleteError;

      toast.success(`${idsToArchive.length} participant(s) archived successfully`);
      setShowArchiveDialog(false);
      setSingleArchiveId(null);
      setSelectedIds(new Set());
      fetchData();
    } catch (error) {
      console.error('Error archiving:', error);
      toast.error('Failed to archive participants');
    }
  };

  const handleViewDetails = (participant: UnifiedParticipant) => {
    if (participant.response_id) {
      navigate(`/researcher/response/${participant.response_id}`);
    }
  };

  const handleViewJourney = (participant: UnifiedParticipant) => {
    setJourneyModal({
      open: true,
      prolificId: participant.prolific_id,
      status: participant.status,
      condition: participant.assistant_type || null,
    });
  };

  const exportToCSV = async () => {
    const headers = [
      'Prolific ID', 'Status', 'Created At', 'Call ID', 
      'Condition', 'Batch', 'PETS Total', 'TIAS Total', 
      'Formality', 'Age', 'Gender'
    ];
    
    const csvContent = [
      headers.join(','),
      ...filteredData.map(row => [
        row.prolific_id,
        row.status,
        row.created_at,
        row.call_id,
        row.assistant_type || '',
        row.batch_label || '',
        row.pets_total ?? '',
        row.tias_total ?? '',
        row.formality ?? '',
        row.age || '',
        row.gender || '',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `participants_${new Date().toISOString().split('T')[0]}.csv`;
    a.download = filename;
    a.click();

    await logActivity({ 
      action: 'download_unified_participants', 
      details: { 
        record_count: filteredData.length,
        filters: { statusFilter, conditionFilter, batchFilter },
        filename 
      } 
    });

    toast.success(`Exported ${filteredData.length} participants`);
  };

  const totalPages = Math.ceil(totalCount / pageSize);
  const allSelected = paginatedData.length > 0 && paginatedData.every(item => selectedIds.has(item.id));
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
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by Prolific ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>

          <Select value={conditionFilter} onValueChange={setConditionFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="informal">Informal</SelectItem>
            </SelectContent>
          </Select>

          <Select value={batchFilter} onValueChange={setBatchFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Batches</SelectItem>
              <SelectItem value="none">No Batch</SelectItem>
              {availableBatches.map(batch => (
                <SelectItem key={batch} value={batch}>{batch}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="participant">Participants</SelectItem>
              <SelectItem value="researcher">Researchers</SelectItem>
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

      <div className="rounded-md border overflow-x-auto">
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
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead>Condition</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead className="text-right">PETS</TableHead>
              <TableHead className="text-right">TIAS</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                  No participants found
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => (
                <TableRow 
                  key={row.id} 
                  className={`${selectedIds.has(row.id) ? 'bg-muted/50' : ''} ${row.status === 'Completed' ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                  onClick={() => row.status === 'Completed' && handleViewDetails(row)}
                >
                  {isSuperAdmin && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(row.id)}
                        onCheckedChange={(checked) => handleSelectOne(row.id, !!checked)}
                        aria-label={`Select ${row.prolific_id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm">{row.prolific_id}</TableCell>
                  <TableCell>
                    <Badge variant={row.status === 'Completed' ? 'default' : 'secondary'}>
                      {row.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {row.assistant_type ? (
                      <Badge variant={row.assistant_type === 'formal' ? 'default' : 'secondary'}>
                        {row.assistant_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.batch_label ? (
                      <Badge variant="outline">{row.batch_label}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.pets_total)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(row.tias_total)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewJourney(row)}
                        title="View Journey"
                      >
                        <Route className="h-4 w-4" />
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleArchiveSingle(row.id)}
                          className="text-destructive hover:text-destructive"
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" />
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
                ? `Archive ${selectedIds.size} participant(s)?` 
                : 'Archive this participant?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will move the participant record(s) to the archive. They won't be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchiveConfirm}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DownloadConfirmDialog
        open={showDownloadConfirm}
        onOpenChange={setShowDownloadConfirm}
        onConfirm={exportToCSV}
        dataType="participant data"
      />

      <ParticipantJourneyModal
        open={journeyModal.open}
        onOpenChange={(open) => setJourneyModal(prev => ({ ...prev, open }))}
        prolificId={journeyModal.prolificId}
        status={journeyModal.status}
        condition={journeyModal.condition}
      />
    </div>
  );
};
