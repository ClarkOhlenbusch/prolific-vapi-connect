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
  Route,
  Check,
  Flag,
  AlertTriangle,
  BarChart3,
  RefreshCw
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useActivityLog } from '@/hooks/useActivityLog';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tables } from '@/integrations/supabase/types';
import { GUEST_PARTICIPANTS } from '@/lib/guest-dummy-data';
import { fetchArchivedFilters } from '@/lib/archived-responses';

type ParticipantCall = Tables<'participant_calls'>;
type ExperimentResponse = Tables<'experiment_responses'>;
type Demographics = Tables<'demographics'>;

interface UnifiedParticipant {
  // From participant_calls
  id: string;
  prolific_id: string;
  call_id: string;
  created_at: string;
  is_completed: boolean;
  // From experiment_responses (optional)
  response_id?: string;
  response_submission_status?: 'pending' | 'submitted' | 'abandoned' | null;
  assistant_type?: string | null;
  batch_label?: string | null;
  pets_total?: number | null;
  tias_total?: number | null;
  formality?: number | null;
  reviewed_by_researcher?: boolean;
  flagged?: boolean;
  // From demographics (in-app) or prolific_export_demographics (preferred when present)
  age?: string | number | null;
  gender?: string | null;
  ethnicity_simplified?: string | null;
  /** True when both in-app and Prolific export exist and age or gender differ */
  demographics_mismatch?: boolean;
  /** What differs (for tooltip): age and/or gender */
  demographics_mismatch_reasons?: ('age' | 'gender')[];
  // Derived
  status: 'Completed' | 'Pending';
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return Number(value).toFixed(2);
};

type UnifiedParticipantRow = UnifiedParticipant;

const EXPORT_COLUMNS: { id: string; label: string; getValue: (row: UnifiedParticipantRow) => string | number | null | undefined }[] = [
  { id: 'id', label: 'Row ID (participant_calls)', getValue: (r) => r.id },
  { id: 'prolific_id', label: 'Prolific ID', getValue: (r) => r.prolific_id },
  { id: 'call_id', label: 'Call ID', getValue: (r) => r.call_id },
  { id: 'response_id', label: 'Response ID (experiment_responses)', getValue: (r) => r.response_id ?? '' },
  { id: 'status', label: 'Status', getValue: (r) => r.status },
  { id: 'created_at', label: 'Created At', getValue: (r) => r.created_at },
  { id: 'assistant_type', label: 'Condition', getValue: (r) => r.assistant_type ?? '' },
  { id: 'batch_label', label: 'Batch', getValue: (r) => r.batch_label ?? '' },
  { id: 'age', label: 'Age', getValue: (r) => r.age ?? '' },
  { id: 'gender', label: 'Gender', getValue: (r) => r.gender ?? '' },
  { id: 'ethnicity_simplified', label: 'Ethnicity', getValue: (r) => r.ethnicity_simplified ?? '' },
  { id: 'demographics_mismatch', label: 'Demographics mismatch', getValue: (r) => r.demographics_mismatch ? 'Yes' : 'No' },
  { id: 'reviewed_by_researcher', label: 'Reviewed', getValue: (r) => (r.reviewed_by_researcher ? 'Yes' : 'No') },
  { id: 'flagged', label: 'Flagged', getValue: (r) => (r.flagged ? 'Yes' : 'No') },
  { id: 'pets_total', label: 'PETS Total', getValue: (r) => r.pets_total ?? '' },
  { id: 'tias_total', label: 'TIAS Total', getValue: (r) => r.tias_total ?? '' },
  { id: 'formality', label: 'Formality', getValue: (r) => r.formality ?? '' },
];

import { SourceFilterValue } from './GlobalSourceFilter';

interface UnifiedParticipantsTableProps {
  sourceFilter: SourceFilterValue;
  includePending: boolean;
}

export const UnifiedParticipantsTable = ({ sourceFilter: globalSourceFilter, includePending }: UnifiedParticipantsTableProps) => {
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
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveMode, setArchiveMode] = useState<'single' | 'bulk'>('single');
  const [singleArchiveId, setSingleArchiveId] = useState<string | null>(null);
  const [showExportColumnDialog, setShowExportColumnDialog] = useState(false);
  const [exportSelectedColumns, setExportSelectedColumns] = useState<Set<string>>(() => new Set(EXPORT_COLUMNS.map(c => c.id)));
  const [journeyModal, setJourneyModal] = useState<{
    open: boolean;
    prolificId: string;
    status: 'Completed' | 'Pending';
    condition: string | null;
  }>({ open: false, prolificId: '', status: 'Pending', condition: null });
  const [createBatchDialog, setCreateBatchDialog] = useState<{ open: boolean; batchLabel: string | null }>({ open: false, batchLabel: null });
  const [lastStructuredOutputRunId, setLastStructuredOutputRunId] = useState<string | null>(null);
  const [runEvaluationLoading, setRunEvaluationLoading] = useState(false);
  const [checkResultsLoading, setCheckResultsLoading] = useState(false);

  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const { isSuperAdmin, user, isGuestMode } = useResearcherAuth();
  const { logActivity } = useActivityLog();

  const fetchData = async () => {
    setIsLoading(true);
    
    // Use dummy data for guest mode
    if (isGuestMode) {
      const batches = new Set<string>();
      GUEST_PARTICIPANTS.forEach(p => {
        if (p.batch_label) batches.add(p.batch_label);
      });
      setAvailableBatches(Array.from(batches).sort());
      setData(GUEST_PARTICIPANTS);
      setSelectedIds(new Set());
      setIsLoading(false);
      return;
    }
    
    try {
      // Fetch participant_calls
      const { data: calls, error: callsError } = await supabase
        .from('participant_calls')
        .select('*')
        .order('created_at', { ascending: false });

      if (callsError) throw callsError;

      const { archivedParticipantCallIds } = await fetchArchivedFilters();
      const callsFiltered = (calls || []).filter((c) => !archivedParticipantCallIds.has(c.id));

      // Fetch experiment_responses
      let responsesQuery = supabase
        .from('experiment_responses' as any)
        .select('id, call_id, prolific_id, submission_status, assistant_type, batch_label, pets_total, tias_total, formality, reviewed_by_researcher, flagged');

      if (!includePending) {
        responsesQuery = responsesQuery.eq('submission_status', 'submitted');
      }

      const { data: responses, error: responsesError } = await responsesQuery;

      if (responsesError) throw responsesError;

      // Fetch in-app demographics (age column stores year of birth; created_at = survey response time)
      const { data: demographics, error: demographicsError } = await supabase
        .from('demographics')
        .select('prolific_id, age, gender, created_at');

      if (demographicsError) throw demographicsError;

      // Fetch Prolific export demographics (researcher upload)
      const { data: prolificDemo, error: prolificDemoError } = await supabase
        .from('prolific_export_demographics')
        .select('prolific_id, age, gender, ethnicity_simplified');

      if (prolificDemoError) throw prolificDemoError;

      // Create lookup maps
      const responseMap = new Map<string, (typeof responses)[0]>();
      responses?.forEach(r => responseMap.set(r.call_id, r));

      const demographicsMap = new Map<string, (typeof demographics)[0]>();
      demographics?.forEach(d => demographicsMap.set(d.prolific_id, d));

      const prolificDemoMap = new Map<string, (typeof prolificDemo)[0]>();
      prolificDemo?.forEach(d => prolificDemoMap.set(d.prolific_id, d));

      // Combine data: prefer Prolific export demographics when present; flag mismatch when both exist and differ
      // In-app stores birth year in demographics.age; Prolific export has age. Use survey response year for age-at-survey, ±1 year tolerance.
      const norm = (s: string | null | undefined) => (s ?? '').toString().trim().toLowerCase();
      const unified: UnifiedParticipant[] = callsFiltered.map(call => {
        const response = responseMap.get(call.call_id);
        const demo = demographicsMap.get(call.prolific_id);
        const pDemo = prolificDemoMap.get(call.prolific_id);
        const age = pDemo?.age != null ? String(pDemo.age) : demo?.age;
        const gender = pDemo?.gender ?? demo?.gender;

        let demographics_mismatch = false;
        const demographics_mismatch_reasons: ('age' | 'gender')[] = [];
        if (demo && pDemo) {
          const genderDiff = norm(demo.gender) !== norm(pDemo.gender ?? '');
          if (genderDiff) {
            demographics_mismatch = true;
            demographics_mismatch_reasons.push('gender');
          }
          // In-app age = birth year (string). Survey year from demographics.created_at. Prolific = age (integer).
          const birthYearRaw = (demo.age ?? '').toString().trim();
          const birthYear = /^\d{4}$/.test(birthYearRaw) ? parseInt(birthYearRaw, 10) : null;
          const surveyYear = demo.created_at ? new Date(demo.created_at).getUTCFullYear() : null;
          const prolificAgeNum = pDemo.age != null && Number.isFinite(Number(pDemo.age)) ? Number(pDemo.age) : null;
          if (birthYear != null && surveyYear != null && prolificAgeNum != null) {
            const ageAtSurvey = surveyYear - birthYear;
            if (Math.abs(ageAtSurvey - prolificAgeNum) > 1) {
              demographics_mismatch = true;
              demographics_mismatch_reasons.push('age');
            }
          }
        }

        return {
          id: call.id,
          prolific_id: call.prolific_id,
          call_id: call.call_id,
          created_at: call.created_at,
          is_completed: call.is_completed,
          response_id: response?.id,
          response_submission_status: response?.submission_status ?? null,
          assistant_type: response?.assistant_type,
          batch_label: response?.batch_label,
          pets_total: response?.pets_total,
          tias_total: response?.tias_total,
          formality: response?.formality,
          reviewed_by_researcher: response?.reviewed_by_researcher ?? false,
          flagged: response?.flagged ?? false,
          age: age ?? null,
          gender: gender ?? null,
          ethnicity_simplified: pDemo?.ethnicity_simplified ?? null,
          demographics_mismatch,
          demographics_mismatch_reasons: demographics_mismatch_reasons.length > 0 ? demographics_mismatch_reasons : undefined,
          status: call.is_completed ? 'Completed' : 'Pending',
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
  }, [includePending]);

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

    // Source filter (uses global filter from dashboard)
    if (globalSourceFilter === 'researcher') {
      result = result.filter(p => isResearcherId(p.prolific_id));
    } else if (globalSourceFilter === 'participant') {
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
  }, [data, searchTerm, statusFilter, conditionFilter, batchFilter, globalSourceFilter]);

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
  }, [searchTerm, statusFilter, conditionFilter, batchFilter, globalSourceFilter]);

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

  const handleOpenRow = (participant: UnifiedParticipant) => {
    if (participant.response_id) {
      handleViewDetails(participant);
      return;
    }
    // Pending rows don't have experiment_responses records yet.
    // Open response details using participant_calls.id as a fallback identifier.
    navigate(`/researcher/response/${participant.id}`);
  };

  const handleViewJourney = (participant: UnifiedParticipant) => {
    setJourneyModal({
      open: true,
      prolificId: participant.prolific_id,
      status: participant.status,
      condition: participant.assistant_type || null,
    });
  };

  const updateResponseFlag = async (responseId: string, field: 'reviewed_by_researcher' | 'flagged', value: boolean) => {
    const { error } = await supabase
      .from('experiment_responses')
      .update({ [field]: value })
      .eq('id', responseId);
    if (error) throw error;
  };

  const handleToggleReviewed = async (row: UnifiedParticipant, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.response_id || isGuestMode) return;
    const next = !(row.reviewed_by_researcher ?? false);
    try {
      await updateResponseFlag(row.response_id, 'reviewed_by_researcher', next);
      setData(prev => prev.map(p => p.response_id === row.response_id ? { ...p, reviewed_by_researcher: next } : p));
      if (next && row.batch_label) {
        const inBatch = data.filter(p => p.batch_label === row.batch_label && p.response_id);
        const allReviewed = inBatch.every(p => (p.response_id === row.response_id ? next : (p.reviewed_by_researcher ?? false)));
        if (allReviewed) setCreateBatchDialog({ open: true, batchLabel: row.batch_label });
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to update reviewed status');
    }
  };

  const handleToggleFlagged = async (row: UnifiedParticipant, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!row.response_id || isGuestMode) return;
    const next = !(row.flagged ?? false);
    try {
      await updateResponseFlag(row.response_id, 'flagged', next);
      setData(prev => prev.map(p => p.response_id === row.response_id ? { ...p, flagged: next } : p));
    } catch (err) {
      console.error(err);
      toast.error('Failed to update flag');
    }
  };

  const escapeCSV = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportToCSV = async (columnIds: Set<string>) => {
    const cols = EXPORT_COLUMNS.filter(c => columnIds.has(c.id));
    if (cols.length === 0) {
      toast.error('Select at least one column to export');
      return;
    }
    const headers = cols.map(c => c.label);
    const csvContent = [
      headers.map(h => escapeCSV(h)).join(','),
      ...filteredData.map(row => cols.map(c => escapeCSV(c.getValue(row))).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = `participants_${new Date().toISOString().split('T')[0]}.csv`;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);

    await logActivity({
      action: 'download_unified_participants',
      details: {
        record_count: filteredData.length,
        columns: cols.map(c => c.id),
        filters: { statusFilter, conditionFilter, batchFilter },
        filename
      }
    });

    toast.success(`Exported ${filteredData.length} participants`);
  };

  const handleExportWithColumns = () => {
    setShowExportColumnDialog(false);
    exportToCSV(exportSelectedColumns);
  };

  const toggleExportColumn = (id: string) => {
    setExportSelectedColumns(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllExportColumns = () => setExportSelectedColumns(new Set(EXPORT_COLUMNS.map(c => c.id)));
  const deselectAllExportColumns = () => setExportSelectedColumns(new Set());

  const selectedCompletedCallIds = useMemo(() => {
    return paginatedData
      .filter((r) => selectedIds.has(r.id) && r.status === 'Completed' && r.call_id)
      .map((r) => r.call_id);
  }, [paginatedData, selectedIds]);

  const handleRunEvaluation = async () => {
    if (selectedCompletedCallIds.length === 0 || isGuestMode) return;
    setRunEvaluationLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-vapi-structured-output', {
        body: { callIds: selectedCompletedCallIds },
      });
      if (error) throw error;
      const runId = data?.runId ?? null;
      if (runId) setLastStructuredOutputRunId(runId);
      toast.success(
        data?.message ?? `Evaluation started for ${selectedCompletedCallIds.length} call(s). Check back in 1–2 min.`
      );
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to start evaluation');
    } finally {
      setRunEvaluationLoading(false);
    }
  };

  const handleCheckResults = async () => {
    if (!lastStructuredOutputRunId || isGuestMode) return;
    setCheckResultsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-vapi-structured-output-results', {
        body: { runId: lastStructuredOutputRunId },
      });
      if (error) throw error;
      toast.success(data?.message ?? `Updated ${data?.updated ?? 0} of ${data?.total ?? 0} calls.`);
      fetchData();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to fetch results');
    } finally {
      setCheckResultsLoading(false);
    }
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
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {isSuperAdmin && selectedCompletedCallIds.length > 0 && (
            <Button
              onClick={handleRunEvaluation}
              disabled={runEvaluationLoading || isGuestMode}
              variant="outline"
              size="sm"
              title="Run VAPI structured output evaluation on selected completed calls"
            >
              {runEvaluationLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4 mr-2" />
              )}
              Run evaluation ({selectedCompletedCallIds.length})
            </Button>
          )}
          {isSuperAdmin && lastStructuredOutputRunId && (
            <Button
              onClick={handleCheckResults}
              disabled={checkResultsLoading || isGuestMode}
              variant="outline"
              size="sm"
              title="Fetch evaluation results from VAPI and save to responses"
            >
              {checkResultsLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Check for results
            </Button>
          )}
          {isSuperAdmin && selectedIds.size > 0 && (
            <Button onClick={handleArchiveBulk} variant="destructive" size="sm">
              <Archive className="h-4 w-4 mr-2" />
              Archive ({selectedIds.size})
            </Button>
          )}
          {isSuperAdmin && (
            <Button onClick={() => setShowExportColumnDialog(true)} variant="outline" size="sm">
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
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Ethnicity</TableHead>
              <TableHead className="w-[60px] text-center" title="In-app vs Prolific demographics mismatch">Demo</TableHead>
              <TableHead className="w-[80px] text-center" title="Reviewed by researcher">Reviewed</TableHead>
              <TableHead className="w-[80px] text-center" title="Flagged">Flag</TableHead>
              <TableHead className="text-right">PETS</TableHead>
              <TableHead className="text-right">TIAS</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 15 : 14} className="text-center py-8 text-muted-foreground">
                  No participants found
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row) => (
                <TableRow 
                  key={row.id} 
                  className={`${selectedIds.has(row.id) ? 'bg-muted/50' : ''} cursor-pointer hover:bg-muted/30`}
                  onClick={() => handleOpenRow(row)}
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
                  <TableCell className="text-sm">{row.age ?? '-'}</TableCell>
                  <TableCell className="text-sm">{row.gender ?? '-'}</TableCell>
                  <TableCell className="text-sm max-w-[120px] truncate" title={row.ethnicity_simplified ?? undefined}>
                    {row.ethnicity_simplified ?? '-'}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {row.demographics_mismatch ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center justify-center text-amber-600 dark:text-amber-500" aria-label="In-app demographics differ from Prolific export">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[260px]">
                          {row.demographics_mismatch_reasons?.length
                            ? <>In-app questionnaire differs from Prolific export: {row.demographics_mismatch_reasons.map(r => r === 'age' ? 'age (≥2 years)' : 'gender').join(' and ')}.</>
                            : 'In-app demographics don\'t match Prolific export.'}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="inline-flex items-center justify-center text-green-600 dark:text-green-500" aria-label="No demographics mismatch">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {row.response_id ? (
                      <button
                        type="button"
                        onClick={(e) => handleToggleReviewed(row, e)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded border transition-colors ${
                          row.reviewed_by_researcher ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 hover:bg-muted'
                        }`}
                        title={row.reviewed_by_researcher ? 'Reviewed' : 'Mark as reviewed'}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                    {row.response_id ? (
                      <button
                        type="button"
                        onClick={(e) => handleToggleFlagged(row, e)}
                        className={`inline-flex items-center justify-center w-8 h-8 rounded border transition-colors ${
                          row.flagged ? 'bg-destructive/15 text-destructive border-destructive/50' : 'border-muted-foreground/30 hover:bg-muted'
                        }`}
                        title={row.flagged ? 'Flagged' : 'Flag'}
                      >
                        <Flag className="h-4 w-4" />
                      </button>
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

      <Dialog open={showExportColumnDialog} onOpenChange={setShowExportColumnDialog}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Export CSV</DialogTitle>
            <DialogDescription className="text-left space-y-2">
              <p>
                You are about to download <strong>participant data</strong> that may contain sensitive information. Handle it according to your agreements and data protection policies.
              </p>
              <p>
                Export will include <strong>{filteredData.length} row{filteredData.length !== 1 ? 's' : ''}</strong> with your current filters (status, condition, batch, search, source).
              </p>
              <p className="font-medium text-foreground">Choose columns to export:</p>
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto border rounded-md p-3 space-y-2 max-h-[40vh]">
            <div className="flex gap-2 pb-2 border-b">
              <Button type="button" variant="ghost" size="sm" onClick={selectAllExportColumns}>
                Select all
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={deselectAllExportColumns}>
                Deselect all
              </Button>
            </div>
            {EXPORT_COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-2 py-1">
                <Checkbox
                  checked={exportSelectedColumns.has(col.id)}
                  onCheckedChange={() => toggleExportColumn(col.id)}
                />
                <span className="text-sm">{col.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportColumnDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleExportWithColumns}
              disabled={exportSelectedColumns.size === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ParticipantJourneyModal
        open={journeyModal.open}
        onOpenChange={(open) => setJourneyModal(prev => ({ ...prev, open }))}
        prolificId={journeyModal.prolificId}
        status={journeyModal.status}
        condition={journeyModal.condition}
      />

      <AlertDialog open={createBatchDialog.open} onOpenChange={(open) => !open && setCreateBatchDialog({ open: false, batchLabel: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batch fully reviewed</AlertDialogTitle>
            <AlertDialogDescription>
              All participants in batch {createBatchDialog.batchLabel ?? ''} are reviewed. Do you want to create a new batch?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Later</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setCreateBatchDialog({ open: false, batchLabel: null });
                navigate('/researcher/dashboard', { state: { openTab: 'settings', openBatchCreate: true } });
              }}
            >
              Create new batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
