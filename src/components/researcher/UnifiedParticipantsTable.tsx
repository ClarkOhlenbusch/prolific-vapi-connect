import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import { Switch } from '@/components/ui/switch';
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Archive,
  Route,
  Check,
  Flag,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  GripVertical
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
type VapiEvaluationQueueRow = Tables<'vapi_evaluation_queue'>;

type EvalQueueStatus = 'pending' | 'running' | 'completed' | 'failed';

type EvalQueueCounts = {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  unknown: number;
};

type ColumnId =
  | 'select'
  | 'prolific_id'
  | 'status'
  | 'call'
  | 'created_at'
  | 'condition'
  | 'batch'
  | 'age'
  | 'gender'
  | 'ethnicity'
  | 'demo'
  | 'reviewed'
  | 'flag'
  | 'pets'
  | 'tias'
  | 'eval'
  | 'actions';

const ALL_RESPONSES_COLUMN_ORDER_STORAGE_KEY = 'researcher-all-responses-column-order-v1';
const DEFAULT_MOVABLE_COLUMN_ORDER: ColumnId[] = [
  'prolific_id',
  'status',
  'call',
  'created_at',
  'condition',
  'batch',
  'age',
  'gender',
  'ethnicity',
  'demo',
  'reviewed',
  'flag',
  'pets',
  'tias',
  'eval',
];

const isSubmissionStatus = (v: unknown): v is 'pending' | 'submitted' | 'abandoned' => {
  return v === 'pending' || v === 'submitted' || v === 'abandoned';
};

const uniqStrings = (xs: string[]) => Array.from(new Set(xs.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())));

const chunkArray = <T,>(xs: T[], size: number): T[][] => {
  if (size <= 0) return [xs];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
};

const sleepMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
  status: 'Completed' | 'Pending' | 'Abandoned';

  // Vapi evaluation (lightweight dashboard fields)
  vapi_total_score?: number | null;
  vapi_structured_output_at?: string | null;
  vapi_evaluation_metric_id?: string | null;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const formatNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  return Number(value).toFixed(2);
};

type UnifiedParticipantRow = UnifiedParticipant;

const formatEvalTimestamp = (iso: string | null | undefined): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString();
};

const ColumnDragHandle = ({ disabled }: { disabled: boolean }) => {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center rounded-sm mr-1 ${
        disabled ? 'opacity-40' : 'opacity-70 hover:opacity-100'
      }`}
    >
      <GripVertical className="h-4 w-4" />
    </span>
  );
};

const SortableHeaderCell = ({
  id,
  enabled,
  className,
  children,
}: {
  id: ColumnId;
  enabled: boolean;
  className?: string;
  children: ReactNode;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    whiteSpace: 'nowrap',
  };

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      data-testid={`all-responses-col-${id}`}
      className={`${enabled ? 'select-none' : ''} ${className ?? ''}`.trim() || undefined}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`inline-flex items-center rounded-sm p-0.5 -ml-1 ${
            enabled ? 'cursor-grab active:cursor-grabbing hover:bg-muted' : 'cursor-default'
          }`}
          aria-label={`Drag column ${id}`}
          data-testid={`all-responses-col-handle-${id}`}
          disabled={!enabled}
          {...attributes}
          {...listeners}
        >
          <ColumnDragHandle disabled={!enabled} />
        </button>
        <div className="flex-1">{children}</div>
      </div>
    </TableHead>
  );
};

const EXPORT_COLUMNS: { id: string; label: string; getValue: (row: UnifiedParticipantRow) => string | number | null | undefined }[] = [
  { id: 'id', label: 'Row ID (participant_calls)', getValue: (r) => r.id },
  { id: 'prolific_id', label: 'Prolific ID', getValue: (r) => r.prolific_id },
  { id: 'call_id', label: 'Call ID', getValue: (r) => r.call_id },
  { id: 'response_id', label: 'Response ID (experiment_responses)', getValue: (r) => r.response_id ?? '' },
  { id: 'status', label: 'Status', getValue: (r) => r.status },
  { id: 'response_submission_status', label: 'Questionnaire Status', getValue: (r) => r.response_submission_status ?? '' },
  { id: 'call_ended', label: 'Call Ended', getValue: (r) => (r.is_completed ? 'Yes' : 'No') },
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
  { id: 'vapi_total_score', label: 'Vapi Eval Total Score', getValue: (r) => r.vapi_total_score ?? '' },
];

import { SourceFilterValue } from './GlobalSourceFilter';

interface UnifiedParticipantsTableProps {
  sourceFilter: SourceFilterValue;
}

export const UnifiedParticipantsTable = ({ sourceFilter: globalSourceFilter }: UnifiedParticipantsTableProps) => {
  const navigate = useNavigate();
  const [data, setData] = useState<UnifiedParticipant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [batchFilter, setBatchFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<'all' | 'flagged' | 'not_flagged'>('all');
  const [reviewedFilter, setReviewedFilter] = useState<'all' | 'reviewed' | 'not_reviewed'>('all');
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveMode, setArchiveMode] = useState<'single' | 'bulk'>('single');
  const [singleArchiveId, setSingleArchiveId] = useState<string | null>(null);
  const [showExportColumnDialog, setShowExportColumnDialog] = useState(false);
  const [exportSelectedColumns, setExportSelectedColumns] = useState<Set<string>>(() => new Set(EXPORT_COLUMNS.map(c => c.id)));
  const [journeyModal, setJourneyModal] = useState<{
    open: boolean;
    prolificId: string;
    status: 'Completed' | 'Pending' | 'Abandoned';
    condition: string | null;
  }>({ open: false, prolificId: '', status: 'Pending', condition: null });
  const [createBatchDialog, setCreateBatchDialog] = useState<{ open: boolean; batchLabel: string | null }>({ open: false, batchLabel: null });
  const [lastStructuredOutputRunId, setLastStructuredOutputRunId] = useState<string | null>(null);
  const [runEvaluationLoading, setRunEvaluationLoading] = useState(false);
  const [checkResultsLoading, setCheckResultsLoading] = useState(false);

  // Evaluation metric context (for stale detection + button-driven worker)
  const [activeMetricId, setActiveMetricId] = useState<string | null>(null);
  const [enqueueLoading, setEnqueueLoading] = useState(false);
  const [processQueueLoading, setProcessQueueLoading] = useState(false);
  const [evalRefreshInFlight, setEvalRefreshInFlight] = useState(false);
  const [evalRefreshLabel, setEvalRefreshLabel] = useState<string>('');
  const [evalRefreshCounts, setEvalRefreshCounts] = useState<EvalQueueCounts | null>(null);
  const [evalRefreshNote, setEvalRefreshNote] = useState<string>('');
  const [showEvalAdvanced, setShowEvalAdvanced] = useState(false);
  const [reorderColumnsEnabled, setReorderColumnsEnabled] = useState(false);
  const [movableColumnOrder, setMovableColumnOrder] = useState<ColumnId[]>(() => {
    try {
      const raw = localStorage.getItem(ALL_RESPONSES_COLUMN_ORDER_STORAGE_KEY);
      if (!raw) return DEFAULT_MOVABLE_COLUMN_ORDER;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_MOVABLE_COLUMN_ORDER;
      const ids = parsed.filter((v) => typeof v === 'string') as string[];
      const allowed = new Set<ColumnId>(DEFAULT_MOVABLE_COLUMN_ORDER);
      const cleaned = ids.filter((id): id is ColumnId => allowed.has(id as ColumnId));
      // Auto-append any newly added columns so older saved orders still work.
      const merged = [...cleaned, ...DEFAULT_MOVABLE_COLUMN_ORDER.filter((id) => !cleaned.includes(id))];
      return merged;
    } catch {
      return DEFAULT_MOVABLE_COLUMN_ORDER;
    }
  });

  const [availableBatches, setAvailableBatches] = useState<string[]>([]);
  const { isSuperAdmin, user, isGuestMode } = useResearcherAuth();
  const { logActivity } = useActivityLog();
  const mountedRef = useRef(true);

  const openEvalMetricSettings = () => {
    // ResearcherDashboard listens to `location.state.openTab`.
    navigate('/researcher/dashboard', { state: { openTab: 'settings' } });
  };

  // Fetch from experiment_batches so newly created batches appear in filter UI
  // even if they don't show up in the currently loaded response rows.
  useEffect(() => {
    if (isGuestMode) return;
    const fetchBatchOptions = async () => {
      try {
        const { data, error } = await supabase
          .from('experiment_batches')
          .select('name')
          .order('created_at', { ascending: false });
        if (error) throw error;
        const names = (data ?? []).map((r) => (r.name ?? '').trim()).filter(Boolean);
        setAvailableBatches((prev) => [...new Set([...prev, ...names])].sort());
      } catch (error) {
        console.error('Error fetching batches:', error);
      }
    };
    fetchBatchOptions();
  }, [isGuestMode]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (isGuestMode) return;
    const fetchActiveMetric = async () => {
      try {
        const { data, error } = await supabase
          .from("experiment_settings")
          .select("setting_value")
          .eq("setting_key", "active_vapi_evaluation_metric_id")
          .maybeSingle();
        if (error) throw error;
        const v = (data?.setting_value ?? "").toString().trim();
        setActiveMetricId(v || null);
      } catch (e) {
        console.warn("Failed to fetch active eval metric id:", e);
        setActiveMetricId(null);
      }
    };
    fetchActiveMetric();
  }, [isGuestMode]);

  const enqueueEvaluations = async (callIds: string[], mode: "missing" | "stale" | "all") => {
    if (callIds.length === 0 || isGuestMode) return;
    if (!activeMetricId) {
      toast.error("No active evaluation metric configured. Create one in Experiment Settings.", {
        action: { label: "Open settings", onClick: openEvalMetricSettings },
      });
      return;
    }
    setEnqueueLoading(true);
    try {
      const callIdsClean = uniqStrings(callIds);
      // Edge function enforces a hard limit (currently 500). Batch to be safe.
      const batches = chunkArray(callIdsClean, 500);
      let enqueued = 0;
      for (const b of batches) {
        const { data, error } = await supabase.functions.invoke("enqueue-vapi-evaluations", {
          body: { callIds: b, mode },
        });
        if (error) throw error;
        enqueued += b.length;
        if (mountedRef.current) {
          setEvalRefreshNote(data?.message ?? `Enqueued ${enqueued}/${callIdsClean.length} call(s).`);
        }
      }
      toast.success(`Enqueued ${enqueued} call(s).`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to enqueue evaluations", {
        action: { label: "Open settings", onClick: openEvalMetricSettings },
      });
    } finally {
      setEnqueueLoading(false);
    }
  };

  const fetchEvalQueueCounts = async (callIds: string[]): Promise<EvalQueueCounts> => {
    const ids = uniqStrings(callIds);
    const total = ids.length;
    const base: EvalQueueCounts = { total, pending: 0, running: 0, completed: 0, failed: 0, unknown: total };
    if (total === 0 || isGuestMode || !activeMetricId) return base;

    const chunks = chunkArray(ids, 500);
    const seen = new Map<string, EvalQueueStatus>();
    for (const c of chunks) {
      const { data, error } = await supabase
        .from('vapi_evaluation_queue')
        .select('call_id,status')
        .eq('metric_id', activeMetricId)
        .in('call_id', c);
      if (error) throw error;
      for (const row of data ?? []) {
        const r = row as Pick<VapiEvaluationQueueRow, 'call_id' | 'status'>;
        const callId: unknown = r?.call_id;
        const status: unknown = r?.status;
        if (typeof callId === 'string' && (status === 'pending' || status === 'running' || status === 'completed' || status === 'failed')) {
          seen.set(callId, status as EvalQueueStatus);
        }
      }
    }

    const counts: EvalQueueCounts = { total, pending: 0, running: 0, completed: 0, failed: 0, unknown: 0 };
    for (const id of ids) {
      const st = seen.get(id);
      if (!st) counts.unknown += 1;
      else if (st === 'pending') counts.pending += 1;
      else if (st === 'running') counts.running += 1;
      else if (st === 'completed') counts.completed += 1;
      else if (st === 'failed') counts.failed += 1;
    }
    return counts;
  };

  const processQueueNow = async (opts?: { refreshTable?: boolean }) => {
    if (isGuestMode) return;
    if (!activeMetricId) {
      toast.error("No active evaluation metric configured. Create one in Experiment Settings.", {
        action: { label: "Open settings", onClick: openEvalMetricSettings },
      });
      return;
    }
    setProcessQueueLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("worker-vapi-evaluations", {
        body: {},
      });
      if (error) throw error;
      toast.success(data?.message ?? "Processed evaluation queue.");
      if (opts?.refreshTable !== false) fetchData();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to process evaluation queue", {
        action: { label: "Open settings", onClick: openEvalMetricSettings },
      });
    } finally {
      setProcessQueueLoading(false);
    }
  };

  const runEvalRefresh = async (opts: { callIds: string[]; label: string; confirmLarge?: boolean }) => {
    const callIds = uniqStrings(opts.callIds);
    if (callIds.length === 0 || isGuestMode) return;
    if (!isSuperAdmin) return;
    if (!activeMetricId) {
      toast.error("No active evaluation metric configured. Create one in Experiment Settings.", {
        action: { label: "Open settings", onClick: openEvalMetricSettings },
      });
      return;
    }
    if (evalRefreshInFlight) return;
    if (opts.confirmLarge && callIds.length > 200) {
      const ok = window.confirm(`This will enqueue ${callIds.length} calls for evaluation refresh. Continue?`);
      if (!ok) return;
    }

    setEvalRefreshInFlight(true);
    setEvalRefreshLabel(opts.label);
    setEvalRefreshNote('');
    setEvalRefreshCounts({ total: callIds.length, pending: 0, running: 0, completed: 0, failed: 0, unknown: callIds.length });

    try {
      // 1) Enqueue in batches.
      await enqueueEvaluations(callIds, "all");

      // 2) Kick the worker once immediately (starts runs).
      setEvalRefreshNote('Starting runs…');
      await processQueueNow({ refreshTable: false });

      // 3) Poll loop (best-effort).
      const startedAt = Date.now();
      const maxDurationMs = 180_000;
      const initialWaitMs = 70_000;
      const intervalMs = 20_000;

      setEvalRefreshNote('Waiting for results to become pollable…');
      await sleepMs(initialWaitMs);

      // Update counts before entering the loop.
      const firstCounts = await fetchEvalQueueCounts(callIds);
      if (mountedRef.current) setEvalRefreshCounts(firstCounts);

      while (Date.now() - startedAt < maxDurationMs) {
        const counts = await fetchEvalQueueCounts(callIds);
        if (mountedRef.current) setEvalRefreshCounts(counts);

        const remaining = counts.pending + counts.running + counts.unknown;
        if (remaining === 0) {
          setEvalRefreshNote('Done.');
          break;
        }

        setEvalRefreshNote('Polling worker…');
        await processQueueNow({ refreshTable: false });
        await sleepMs(intervalMs);
      }

      const finalCounts = await fetchEvalQueueCounts(callIds);
      if (mountedRef.current) setEvalRefreshCounts(finalCounts);

      const remaining = finalCounts.pending + finalCounts.running + finalCounts.unknown;
      if (remaining > 0) {
        setEvalRefreshNote(`Timed out with ${remaining} still pending/running. Click again to continue.`);
      } else {
        setEvalRefreshNote('Completed.');
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to refresh evaluations');
      setEvalRefreshNote('Failed.');
    } finally {
      // Always refresh table once at the end.
      fetchData();
      if (mountedRef.current) setEvalRefreshInFlight(false);
    }
  };

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
      // Keep abandoned status up-to-date for stale drafts (best-effort; don't block data fetch).
      try {
        await supabase.functions.invoke('mark-abandoned-drafts', { body: { cutoffMinutes: 90 } });
      } catch (e) {
        console.warn('mark-abandoned-drafts failed (continuing):', e);
      }

      // Fetch participant_calls
      const { data: calls, error: callsError } = await supabase
        .from('participant_calls')
        .select('*')
        .order('created_at', { ascending: false });

      if (callsError) throw callsError;

      const { archivedParticipantCallIds } = await fetchArchivedFilters();
      const callsFiltered = (calls || []).filter((c) => !archivedParticipantCallIds.has(c.id));

      // Fetch experiment_responses
      const responsesQuery = supabase
        .from('experiment_responses')
        .select('id, call_id, prolific_id, session_token, submission_status, assistant_type, batch_label, pets_total, tias_total, formality, reviewed_by_researcher, flagged, vapi_total_score, vapi_structured_output_at, vapi_evaluation_metric_id');

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

      // Create lookup maps: prefer joining by session_token, then call_id.
      const responseBySession = new Map<string, (typeof responses)[0]>();
      const responseByCallId = new Map<string, (typeof responses)[0]>();
      const preferSubmitted = (a: (typeof responses)[0] | undefined, b: (typeof responses)[0]) => {
        if (!a) return b;
        const aSubmitted = a.submission_status === 'submitted';
        const bSubmitted = b.submission_status === 'submitted';
        if (aSubmitted && !bSubmitted) return a;
        if (!aSubmitted && bSubmitted) return b;
        // Otherwise keep the existing one (stable), since we don't have a reliable "latest" signal.
        return a;
      };

      responses?.forEach((r) => {
        if (r.session_token) {
          const k = String(r.session_token);
          responseBySession.set(k, preferSubmitted(responseBySession.get(k), r));
        }
        if (r.call_id) {
          const k = String(r.call_id);
          responseByCallId.set(k, preferSubmitted(responseByCallId.get(k), r));
        }
      });

      const demographicsMap = new Map<string, (typeof demographics)[0]>();
      demographics?.forEach(d => demographicsMap.set(d.prolific_id, d));

      const prolificDemoMap = new Map<string, (typeof prolificDemo)[0]>();
      prolificDemo?.forEach(d => prolificDemoMap.set(d.prolific_id, d));

      // Combine data: prefer Prolific export demographics when present; otherwise convert in-app birth year to age.
      // In-app stores birth year in demographics.age; Prolific export stores age.
      const norm = (s: string | null | undefined) => (s ?? '').toString().trim().toLowerCase();
      const unified: UnifiedParticipant[] = callsFiltered.map(call => {
        const sessionTokenRaw = (call as unknown as { session_token?: unknown })?.session_token;
        const sessionToken = sessionTokenRaw ? String(sessionTokenRaw) : null;
        const response =
          (sessionToken ? responseBySession.get(sessionToken) : undefined) ??
          (call.call_id ? responseByCallId.get(call.call_id) : undefined);
        const demo = demographicsMap.get(call.prolific_id);
        const pDemo = prolificDemoMap.get(call.prolific_id);
        const birthYearRaw = (demo?.age ?? '').toString().trim();
        const birthYear = /^\d{4}$/.test(birthYearRaw) ? parseInt(birthYearRaw, 10) : null;
        const surveyYear = demo?.created_at ? new Date(demo.created_at).getUTCFullYear() : null;
        const computedAgeFromBirthYear =
          birthYear != null && surveyYear != null && surveyYear >= birthYear
            ? String(surveyYear - birthYear)
            : null;
        const age = pDemo?.age != null ? String(pDemo.age) : computedAgeFromBirthYear;
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
          response_submission_status: isSubmissionStatus(response?.submission_status) ? response.submission_status : null,
          assistant_type: response?.assistant_type,
          batch_label: response?.batch_label,
          pets_total: response?.pets_total,
          tias_total: response?.tias_total,
          formality: response?.formality,
          vapi_total_score: response?.vapi_total_score ?? null,
          vapi_structured_output_at: response?.vapi_structured_output_at ?? null,
          vapi_evaluation_metric_id: response?.vapi_evaluation_metric_id ?? null,
          reviewed_by_researcher: response?.reviewed_by_researcher ?? false,
          flagged: response?.flagged ?? false,
          age: age ?? null,
          gender: gender ?? null,
          ethnicity_simplified: pDemo?.ethnicity_simplified ?? null,
          demographics_mismatch,
          demographics_mismatch_reasons: demographics_mismatch_reasons.length > 0 ? demographics_mismatch_reasons : undefined,
          // "Completed" across the researcher UI means questionnaire submitted.
          status:
            response?.submission_status === 'submitted'
              ? 'Completed'
              : response?.submission_status === 'abandoned'
                ? 'Abandoned'
                : 'Pending',
        };
      });

      // Get unique batches for filter
      const batches = new Set<string>();
      unified.forEach(p => {
        if (p.batch_label) batches.add(p.batch_label);
      });
      setAvailableBatches((prev) => [...new Set([...prev, ...Array.from(batches)])].sort());

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
    try {
      localStorage.setItem(ALL_RESPONSES_COLUMN_ORDER_STORAGE_KEY, JSON.stringify(movableColumnOrder));
    } catch {
      // ignore (private mode, etc.)
    }
  }, [movableColumnOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const orderedColumnIds: ColumnId[] = useMemo(() => {
    const prefix: ColumnId[] = isSuperAdmin ? ['select'] : [];
    return [...prefix, ...movableColumnOrder, 'actions'];
  }, [isSuperAdmin, movableColumnOrder]);

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
    } else if (statusFilter === 'abandoned') {
      result = result.filter(p => p.status === 'Abandoned');
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

    // Flag filter
    if (flagFilter === 'flagged') {
      result = result.filter(p => p.flagged);
    } else if (flagFilter === 'not_flagged') {
      result = result.filter(p => !p.flagged);
    }

    // Reviewed filter
    if (reviewedFilter === 'reviewed') {
      result = result.filter(p => p.reviewed_by_researcher);
    } else if (reviewedFilter === 'not_reviewed') {
      result = result.filter(p => !p.reviewed_by_researcher);
    }

    return result;
  }, [data, searchTerm, statusFilter, conditionFilter, batchFilter, flagFilter, reviewedFilter, globalSourceFilter]);

  const paginatedData = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const visibleCompletedCallIds = useMemo(() => {
    // "Filtered set" means the visible rows after all filters are applied (paginated subset).
    // For now we scope to the visible page to keep things safe; if you want "all filtered across pages",
    // we can switch to a backend query later.
    return paginatedData
      .filter((r) => r.is_completed && r.call_id)
      .map((r) => r.call_id);
  }, [paginatedData]);

  const filteredCompletedCallIds = useMemo(() => {
    return uniqStrings(filteredData.filter((r) => r.is_completed && r.call_id).map((r) => r.call_id));
  }, [filteredData]);

  const missingEvalCallIds = useMemo(() => {
    return visibleCompletedCallIds.filter((callId) => {
      const row = paginatedData.find((r) => r.call_id === callId);
      return row ? row.vapi_total_score == null : false;
    });
  }, [visibleCompletedCallIds, paginatedData]);

  const staleEvalCallIds = useMemo(() => {
    if (!activeMetricId) return [];
    return visibleCompletedCallIds.filter((callId) => {
      const row = paginatedData.find((r) => r.call_id === callId);
      return Boolean(
        row &&
          row.vapi_total_score != null &&
          row.vapi_evaluation_metric_id &&
          row.vapi_evaluation_metric_id !== activeMetricId
      );
    });
  }, [visibleCompletedCallIds, paginatedData, activeMetricId]);

  const neededEvalCallIdsVisiblePage = useMemo(() => {
    return uniqStrings([...missingEvalCallIds, ...staleEvalCallIds]);
  }, [missingEvalCallIds, staleEvalCallIds]);

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
      // Evaluation runs on calls, so gate on call completion (not questionnaire submission).
      .filter((r) => selectedIds.has(r.id) && r.is_completed && r.call_id)
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

  const handleColumnDragEnd = (event: { active: { id: unknown }; over: { id: unknown } | null }) => {
    const activeId = event.active.id as ColumnId;
    const overId = event.over?.id as ColumnId | undefined;
    if (!overId || activeId === overId) return;
    setMovableColumnOrder((items) => {
      const oldIndex = items.indexOf(activeId);
      const newIndex = items.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  const resetColumnOrder = () => {
    setMovableColumnOrder(DEFAULT_MOVABLE_COLUMN_ORDER);
  };

  const renderHeaderCell = (id: ColumnId, sortable: boolean) => {
    if (id === 'select') {
      return (
        <TableHead key={id} data-testid={`all-responses-col-${id}`} className="w-[50px]">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={handleSelectAll}
            aria-label="Select all"
          />
        </TableHead>
      );
    }

    if (id === 'demo') {
      const content = (
        <span title="In-app vs Prolific demographics mismatch" className="inline-flex items-center justify-center w-full">
          Demo
        </span>
      );
      return sortable ? (
        <SortableHeaderCell key={id} id={id} enabled={reorderColumnsEnabled} className="w-[60px] text-center">
          {content}
        </SortableHeaderCell>
      ) : (
        <TableHead key={id} data-testid={`all-responses-col-${id}`} className="w-[60px] text-center" title="In-app vs Prolific demographics mismatch">
          Demo
        </TableHead>
      );
    }

    if (id === 'reviewed') {
      const content = (
        <span title="Reviewed by researcher" className="inline-flex items-center justify-center w-full">
          Reviewed
        </span>
      );
      return sortable ? (
        <SortableHeaderCell key={id} id={id} enabled={reorderColumnsEnabled} className="w-[80px] text-center">
          {content}
        </SortableHeaderCell>
      ) : (
        <TableHead key={id} data-testid={`all-responses-col-${id}`} className="w-[80px] text-center" title="Reviewed by researcher">
          Reviewed
        </TableHead>
      );
    }

    if (id === 'flag') {
      const content = (
        <span title="Flagged" className="inline-flex items-center justify-center w-full">
          Flag
        </span>
      );
      return sortable ? (
        <SortableHeaderCell key={id} id={id} enabled={reorderColumnsEnabled} className="w-[80px] text-center">
          {content}
        </SortableHeaderCell>
      ) : (
        <TableHead key={id} data-testid={`all-responses-col-${id}`} className="w-[80px] text-center" title="Flagged">
          Flag
        </TableHead>
      );
    }

    const label: Record<Exclude<ColumnId, 'select' | 'demo' | 'reviewed' | 'flag'>, string> = {
      prolific_id: 'Prolific ID',
      status: 'Status',
      call: 'Call',
      created_at: 'Created At',
      condition: 'Condition',
      batch: 'Batch',
      age: 'Age',
      gender: 'Gender',
      ethnicity: 'Ethnicity',
      pets: 'PETS',
      tias: 'TIAS',
      eval: 'Eval',
      actions: 'Actions',
    };

    const text = label[id as keyof typeof label] ?? id;

    // Preserve a few alignments from the old table.
    const className =
      id === 'pets' || id === 'tias' ? 'text-right' : id === 'eval' ? 'text-center' : undefined;

    return sortable ? (
      <SortableHeaderCell key={id} id={id} enabled={reorderColumnsEnabled} className={className}>
        <span className={className}>{text}</span>
      </SortableHeaderCell>
    ) : (
      <TableHead key={id} data-testid={`all-responses-col-${id}`} className={className}>
        {text}
      </TableHead>
    );
  };

  const renderBodyCell = (id: ColumnId, row: UnifiedParticipantRow) => {
    switch (id) {
      case 'select':
        return (
          <TableCell key={id} onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={selectedIds.has(row.id)}
              onCheckedChange={(checked) => handleSelectOne(row.id, !!checked)}
              aria-label={`Select ${row.prolific_id}`}
            />
          </TableCell>
        );
      case 'prolific_id':
        return (
          <TableCell key={id} className="font-mono text-sm">
            {row.prolific_id}
          </TableCell>
        );
      case 'status':
        return (
          <TableCell key={id}>
            <Badge
              variant={
                row.status === 'Completed' ? 'default' : row.status === 'Abandoned' ? 'destructive' : 'secondary'
              }
            >
              {row.status}
            </Badge>
          </TableCell>
        );
      case 'call':
        return (
          <TableCell key={id}>
            <Badge variant={row.is_completed ? 'secondary' : 'outline'}>
              {row.is_completed ? 'Ended' : 'Active'}
            </Badge>
          </TableCell>
        );
      case 'created_at':
        return (
          <TableCell key={id} className="text-sm">
            {new Date(row.created_at).toLocaleString()}
          </TableCell>
        );
      case 'condition':
        return (
          <TableCell key={id}>
            {row.assistant_type ? (
              <Badge variant={row.assistant_type === 'formal' ? 'default' : 'secondary'}>{row.assistant_type}</Badge>
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
        );
      case 'batch':
        return (
          <TableCell key={id}>
            {row.batch_label ? <Badge variant="outline">{row.batch_label}</Badge> : <span className="text-muted-foreground">-</span>}
          </TableCell>
        );
      case 'age':
        return (
          <TableCell key={id} className="text-sm">
            {row.age ?? '-'}
          </TableCell>
        );
      case 'gender':
        return (
          <TableCell key={id} className="text-sm">
            {row.gender ?? '-'}
          </TableCell>
        );
      case 'ethnicity':
        return (
          <TableCell key={id} className="text-sm max-w-[120px] truncate" title={row.ethnicity_simplified ?? undefined}>
            {row.ethnicity_simplified ?? '-'}
          </TableCell>
        );
      case 'demo':
        return (
          <TableCell key={id} className="text-center" onClick={(e) => e.stopPropagation()}>
            {row.demographics_mismatch ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex items-center justify-center text-amber-600 dark:text-amber-500"
                    aria-label="In-app demographics differ from Prolific export"
                  >
                    <AlertTriangle className="h-4 w-4" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px]">
                  {row.demographics_mismatch_reasons?.length ? (
                    <>
                      In-app questionnaire differs from Prolific export:{' '}
                      {row.demographics_mismatch_reasons.map((r) => (r === 'age' ? 'age (≥2 years)' : 'gender')).join(' and ')}.
                    </>
                  ) : (
                    "In-app demographics don't match Prolific export."
                  )}
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="inline-flex items-center justify-center text-green-600 dark:text-green-500" aria-label="No demographics mismatch">
                <Check className="h-4 w-4" />
              </span>
            )}
          </TableCell>
        );
      case 'reviewed':
        return (
          <TableCell key={id} className="text-center" onClick={(e) => e.stopPropagation()}>
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
        );
      case 'flag':
        return (
          <TableCell key={id} className="text-center" onClick={(e) => e.stopPropagation()}>
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
        );
      case 'pets':
        return (
          <TableCell key={id} className="text-right font-mono text-sm">
            {formatNumber(row.pets_total)}
          </TableCell>
        );
      case 'tias':
        return (
          <TableCell key={id} className="text-right font-mono text-sm">
            {formatNumber(row.tias_total)}
          </TableCell>
        );
      case 'eval':
        return (
          <TableCell key={id} className="text-center" onClick={(e) => e.stopPropagation()}>
            {row.vapi_total_score != null ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className={
                      activeMetricId && row.vapi_evaluation_metric_id && row.vapi_evaluation_metric_id !== activeMetricId
                        ? 'border-amber-500 text-amber-600'
                        : undefined
                    }
                  >
                    {row.vapi_total_score}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[280px]">
                  <div className="text-xs space-y-1">
                    {row.vapi_structured_output_at ? <div>Fetched: {formatEvalTimestamp(row.vapi_structured_output_at)}</div> : null}
                    {activeMetricId ? (
                      <div>
                        {row.vapi_evaluation_metric_id && row.vapi_evaluation_metric_id !== activeMetricId
                          ? 'Status: stale (metric changed)'
                          : 'Status: current'}
                      </div>
                    ) : (
                      <div>Status: unknown (no active metric configured)</div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <span className="text-muted-foreground" title="No evaluation score saved yet">
                -
              </span>
            )}
          </TableCell>
        );
      case 'actions':
        return (
          <TableCell key={id} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => handleViewJourney(row)} title="View Journey">
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
        );
      default:
        return (
          <TableCell key={id} className="text-muted-foreground">
            -
          </TableCell>
        );
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
            <SelectItem value="abandoned">Abandoned</SelectItem>
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

          <Select value={flagFilter} onValueChange={(v) => setFlagFilter(v as typeof flagFilter)}>
            <SelectTrigger className="w-full sm:w-[130px]">
              <SelectValue placeholder="Flag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Flags</SelectItem>
              <SelectItem value="flagged">Flagged</SelectItem>
              <SelectItem value="not_flagged">Not Flagged</SelectItem>
            </SelectContent>
          </Select>

          <Select value={reviewedFilter} onValueChange={(v) => setReviewedFilter(v as typeof reviewedFilter)}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="Reviewed" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reviewed</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="not_reviewed">Not Reviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          {isSuperAdmin && (
            <>
              <Button
                onClick={() => runEvalRefresh({ callIds: neededEvalCallIdsVisiblePage, label: 'Refresh needed evals (visible page)' })}
                disabled={evalRefreshInFlight || enqueueLoading || processQueueLoading || isGuestMode || neededEvalCallIdsVisiblePage.length === 0 || !activeMetricId}
                variant="outline"
                size="sm"
                title={
                  !activeMetricId
                    ? "Set an active evaluation metric first (Experiment Settings)."
                    : "Updates only the rows on this page that are missing a score or have an outdated score (after metric changes)."
                }
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${evalRefreshInFlight ? "animate-spin" : ""}`} />
                Refresh needed evals ({neededEvalCallIdsVisiblePage.length})
              </Button>
              <Button
                onClick={() => runEvalRefresh({ callIds: filteredCompletedCallIds, label: 'Hard refresh all filtered evals', confirmLarge: true })}
                disabled={evalRefreshInFlight || enqueueLoading || processQueueLoading || isGuestMode || filteredCompletedCallIds.length === 0 || !activeMetricId}
                variant="outline"
                size="sm"
                title={
                  !activeMetricId
                    ? "Set an active evaluation metric first (Experiment Settings)."
                    : "Force-refreshes scores for all completed rows matching your current filters (across all pages). Use after changing the metric."
                }
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${evalRefreshInFlight ? "animate-spin" : ""}`} />
                Hard refresh filtered evals ({filteredCompletedCallIds.length})
              </Button>
              <Collapsible open={showEvalAdvanced} onOpenChange={setShowEvalAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    title="Advanced: manual controls for the evaluation queue (useful for debugging)."
                  >
                    Advanced
                    <ChevronDown className={`h-4 w-4 ml-2 transition-transform ${showEvalAdvanced ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <Button
                      onClick={() => processQueueNow()}
                      disabled={processQueueLoading || isGuestMode || !activeMetricId}
                      variant="outline"
                      size="sm"
                      title={
                        !activeMetricId
                          ? "Set an active evaluation metric first (Experiment Settings)."
                          : "Runs the evaluation worker once. This starts/polls queued work, but may not finish everything."
                      }
                    >
                      <RefreshCw className={`h-4 w-4 mr-2 ${processQueueLoading ? "animate-spin" : ""}`} />
                      Process queue now
                    </Button>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </>
          )}
          {isSuperAdmin && evalRefreshCounts && (
            <div className="basis-full text-xs text-muted-foreground">
              <span className="font-medium">{evalRefreshLabel}</span>: {evalRefreshCounts.completed}/{evalRefreshCounts.total} completed, {evalRefreshCounts.running} running, {evalRefreshCounts.pending} pending, {evalRefreshCounts.failed} failed
              {evalRefreshCounts.unknown ? `, ${evalRefreshCounts.unknown} unknown` : ''}
              {evalRefreshNote ? ` · ${evalRefreshNote}` : ''}
            </div>
          )}
          {isSuperAdmin && selectedCompletedCallIds.length > 0 && (
            <Button
              onClick={handleRunEvaluation}
              disabled={runEvaluationLoading || isGuestMode}
              variant="outline"
              size="sm"
              title="Run evaluation for the selected rows (starts a new Vapi run). Then use “Check for results” after 1–2 minutes."
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
              title="Fetch results for the last “Run evaluation” run and save them into responses."
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
          <div className="flex items-center gap-2 pl-2 ml-1 border-l">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Reorder columns</span>
              <Switch
                checked={reorderColumnsEnabled}
                onCheckedChange={setReorderColumnsEnabled}
                data-testid="all-responses-reorder-toggle"
                aria-label="Toggle reorder columns"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetColumnOrder}
              disabled={movableColumnOrder.join('|') === DEFAULT_MOVABLE_COLUMN_ORDER.join('|')}
              data-testid="all-responses-columns-reset"
              title="Reset column order"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table data-testid="all-responses-table">
          <TableHeader>
            <TableRow>
              {reorderColumnsEnabled ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColumnDragEnd}
                >
                  {isSuperAdmin ? renderHeaderCell('select', false) : null}
                  <SortableContext items={movableColumnOrder} strategy={horizontalListSortingStrategy}>
                    {movableColumnOrder.map((id) => renderHeaderCell(id, true))}
                  </SortableContext>
                  {renderHeaderCell('actions', false)}
                </DndContext>
              ) : (
                orderedColumnIds.map((id) => renderHeaderCell(id, false))
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={isSuperAdmin ? 17 : 16} className="text-center py-8 text-muted-foreground">
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
                  {orderedColumnIds.map((id) => {
                    if (id === 'select' && !isSuperAdmin) return null;
                    return renderBodyCell(id, row);
                  })}
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
