import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useResearcherAuth } from '@/contexts/ResearcherAuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Cpu,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Play,
  Info,
  Mic,
  FileText,
  BarChart2,
  MessageSquare,
  Zap,
} from 'lucide-react';

// Cost constants (gpt-4o-mini, conservative estimates)
const COST_PER_CALL_PASS_A = 0.00048;
const COST_PER_CALL_PASS_B = 0.00018;

// Estimated wall-clock seconds per call
const TIME_PER_CALL_PASS_A = 2.5;
const TIME_PER_CALL_PASS_B = 1.5;
const TIME_PER_CALL_METRICS = 0.05;

const BATCH = 10;

type StatusLight = 'green' | 'yellow' | 'red' | 'loading';

interface CardStatus {
  light: StatusLight;
  missing: number;
  stale: number;
  total: number;
  fresh: number;
}

interface TranscriptionCardStatus {
  light: StatusLight;
  total: number;
  completed: number;
  inProgress: number;
  error: number;
  missing: number;
}

interface VapiEvalCardStatus {
  light: StatusLight;
  total: number;
  missing: number;
  stale: number;
  fresh: number;
  pending: number;
  running: number;
  failed: number;
  activeMetricId: string | null;
}

const EMPTY_STATUS: CardStatus = { light: 'loading', missing: 0, stale: 0, total: 0, fresh: 0 };
const EMPTY_TRANS: TranscriptionCardStatus = {
  light: 'loading', total: 0, completed: 0, inProgress: 0, error: 0, missing: 0,
};
const EMPTY_VAPI_EVAL: VapiEvalCardStatus = {
  light: 'loading', total: 0, missing: 0, stale: 0, fresh: 0,
  pending: 0, running: 0, failed: 0, activeMetricId: null,
};

// Participants have exactly 24-char Prolific IDs; researchers use "researcherN" format
const isParticipant = (prolificId: string | null | undefined) =>
  typeof prolificId === 'string' && prolificId.length === 24;

function StatusDot({ light }: { light: StatusLight }) {
  const colors: Record<StatusLight, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
    loading: 'bg-gray-300 animate-pulse',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${colors[light]}`} />;
}

function formatCost(dollars: number): string {
  if (dollars === 0) return 'Free';
  if (dollars < 0.01) return `${(dollars * 100).toFixed(1)}¢`;
  return `$${dollars.toFixed(2)}`;
}

function formatTime(seconds: number): string {
  if (seconds < 5) return '< 5s';
  if (seconds < 60) return `~${Math.ceil(seconds)}s`;
  return `~${Math.ceil(seconds / 60)}min`;
}

// ─── Pipeline diagram ──────────────────────────────────────────────────────

interface PipelineNodeProps {
  num: number;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  light: StatusLight;
}

function PipelineNode({ num, label, subtitle, icon, light }: PipelineNodeProps) {
  const borderColor: Record<StatusLight, string> = {
    green: 'border-green-500 bg-green-50 dark:bg-green-950/30',
    yellow: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30',
    red: 'border-red-500 bg-red-50 dark:bg-red-950/30',
    loading: 'border-border bg-muted/40',
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${borderColor[light]}`}>
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-muted-foreground">#{num}</span>
          <span className="font-medium">{label}</span>
          <StatusDot light={light} />
        </div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

function Arrow() {
  return <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-2.5" />;
}

function DiagramArrowDown() {
  return <div className="w-px h-4 bg-border mx-auto" />;
}

interface PipelineDiagramProps {
  transcription: TranscriptionCardStatus;
  metrics: CardStatus;
  passA: CardStatus;
  passB: CardStatus;
  vapiEval: VapiEvalCardStatus;
}

function PipelineDiagram({ transcription, metrics, passA, passB, vapiEval }: PipelineDiagramProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Data Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Track A: Audio → AssemblyAI → Metrics + Thematic A */}
        <div className="flex items-start gap-1 flex-wrap">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
              <Mic className="h-3 w-3" /> Audio recording
            </div>
            <DiagramArrowDown />
            <PipelineNode
              num={1}
              label="AssemblyAI"
              subtitle="transcript + sentiment"
              icon={<FileText className="h-3.5 w-3.5" />}
              light={transcription.light}
            />
          </div>
          <Arrow />
          <div className="flex flex-col gap-1.5">
            <PipelineNode
              num={2}
              label="Qual Metrics"
              subtitle="engagement, arcs"
              icon={<BarChart2 className="h-3.5 w-3.5" />}
              light={metrics.light}
            />
            <PipelineNode
              num={3}
              label="Thematic A"
              subtitle="comfort, rapport"
              icon={<MessageSquare className="h-3.5 w-3.5" />}
              light={passA.light}
            />
          </div>
        </div>

        {/* Track B: Feedback form → Thematic B */}
        <div className="flex items-start gap-1">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3 w-3" /> Feedback form
            </div>
            <DiagramArrowDown />
          </div>
          <Arrow />
          <PipelineNode
            num={4}
            label="Thematic B"
            subtitle="themes, satisfaction"
            icon={<MessageSquare className="h-3.5 w-3.5" />}
            light={passB.light}
          />
        </div>

        {/* Track C: Vapi call data → VAPI Eval */}
        <div className="flex items-start gap-1">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
              <Zap className="h-3 w-3" /> Vapi call data
            </div>
            <DiagramArrowDown />
          </div>
          <Arrow />
          <PipelineNode
            num={5}
            label="VAPI Eval"
            subtitle="structured output score"
            icon={<Zap className="h-3.5 w-3.5" />}
            light={vapiEval.light}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

const ComputeHub = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isGuestMode } = useResearcherAuth();

  const [rulesVersion, setRulesVersion] = useState<number>(1);
  const [transcriptionStatus, setTranscriptionStatus] = useState<TranscriptionCardStatus>(EMPTY_TRANS);
  const [metricsStatus, setMetricsStatus] = useState<CardStatus>(EMPTY_STATUS);
  const [passAStatus, setPassAStatus] = useState<CardStatus>(EMPTY_STATUS);
  const [passBStatus, setPassBStatus] = useState<CardStatus>(EMPTY_STATUS);
  const [vapiEvalStatus, setVapiEvalStatus] = useState<VapiEvalCardStatus>(EMPTY_VAPI_EVAL);

  // Running state per card
  const [transcriptionRunning, setTranscriptionRunning] = useState(false);
  const [metricsRunning, setMetricsRunning] = useState(false);
  const [passARunning, setPassARunning] = useState(false);
  const [passBRunning, setPassBRunning] = useState(false);
  const [vapiEvalRunning, setVapiEvalRunning] = useState(false);
  const [metricsProgress, setMetricsProgress] = useState(0);
  const [passAProgress, setPassAProgress] = useState(0);
  const [passBProgress, setPassBProgress] = useState(0);

  // Run All dialog
  const [runAllOpen, setRunAllOpen] = useState(false);
  const [runAllChecked, setRunAllChecked] = useState({ metrics: true, passA: true, passB: true });
  const [runAllRunning, setRunAllRunning] = useState(false);

  // Guide
  const [guideOpen, setGuideOpen] = useState(true);

  // Advanced
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bumpingVersion, setBumpingVersion] = useState(false);

  // ─── Fetch status ────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    setTranscriptionStatus(EMPTY_TRANS);
    setMetricsStatus(EMPTY_STATUS);
    setPassAStatus(EMPTY_STATUS);
    setPassBStatus(EMPTY_STATUS);
    setVapiEvalStatus(EMPTY_VAPI_EVAL);
    try {
      // 1. Fetch current rules version
      const { data: settingRow } = await supabase
        .from('experiment_settings')
        .select('setting_value')
        .eq('setting_key', 'thematic_coding_rules_version')
        .maybeSingle();
      const currentVersion = settingRow ? parseInt(String(settingRow.setting_value)) || 1 : 1;
      setRulesVersion(currentVersion);

      // 2. ALL experiment_responses with prolific_id (for participant filter)
      const { data: allResponses } = await supabase
        .from('experiment_responses')
        .select('call_id, prolific_id, feedback_sentiment, feedback_rules_version, vapi_total_score, vapi_evaluation_metric_id')
        .not('call_id', 'is', null);

      // Participant = exactly 24-char prolific_id; also exclude empty-string call_ids
      const participantResponses = (allResponses ?? []).filter((r) => isParticipant(r.prolific_id) && r.call_id !== '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const participantResponseMap = new Map(participantResponses.map((r: any) => [r.call_id as string, r]));
      const participantCallIds = new Set(participantResponseMap.keys());

      // 3. ALL transcriptions (filter client-side to participant calls)
      const { data: allTranscriptions } = await supabase
        .from('call_transcriptions_assemblyai')
        .select('call_id, status, utterances');

      const participantTranscriptions = (allTranscriptions ?? []).filter((t) =>
        participantCallIds.has(t.call_id as string),
      );

      const submittedOrMore = new Set(participantTranscriptions.map((t) => t.call_id as string));
      const transcribedIds = new Set(
        participantTranscriptions
          .filter((t) => t.status === 'completed' && t.utterances !== null)
          .map((t) => t.call_id as string),
      );
      const inProgressIds = new Set(
        participantTranscriptions
          .filter((t) => t.status === 'submitted' || t.status === 'processing')
          .map((t) => t.call_id as string),
      );
      const errorIds = new Set(
        participantTranscriptions
          .filter((t) => t.status === 'error')
          .map((t) => t.call_id as string),
      );
      const missingCount = [...participantCallIds].filter((id) => !submittedOrMore.has(id)).length;

      setTranscriptionStatus({
        light: errorIds.size > 0 ? 'red' : missingCount + inProgressIds.size > 0 ? 'yellow' : 'green',
        total: participantCallIds.size,
        completed: transcribedIds.size,
        inProgress: inProgressIds.size,
        error: errorIds.size,
        missing: missingCount,
      });

      // 4. Qualitative metrics (participant transcribed calls only)
      const { data: computed } = await supabase.from('call_qualitative_metrics').select('call_id');
      const computedSet = new Set((computed ?? []).map((r) => r.call_id as string));
      const metricsMissing = [...transcribedIds].filter((id) => !computedSet.has(id)).length;
      const metricsTotal = transcribedIds.size;
      setMetricsStatus({
        light: metricsMissing === 0 ? 'green' : 'yellow',
        missing: metricsMissing,
        stale: 0,
        total: metricsTotal,
        fresh: metricsTotal - metricsMissing,
      });

      // 5. Thematic Pass A (participant transcribed calls only)
      const { data: codedA } = await supabase.from('call_thematic_codes').select('call_id, rules_version');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codedAMap = new Map((codedA ?? []).map((r: any) => [r.call_id as string, (r.rules_version ?? 0) as number]));
      const passAMissing = [...transcribedIds].filter((id) => !codedAMap.has(id)).length;
      const passAStale = [...transcribedIds].filter(
        (id) => codedAMap.has(id) && (codedAMap.get(id) ?? 0) < currentVersion,
      ).length;
      const passATotal = transcribedIds.size;
      setPassAStatus({
        light: passAMissing + passAStale === 0 ? 'green' : passAStale > 0 ? 'red' : 'yellow',
        missing: passAMissing,
        stale: passAStale,
        total: passATotal,
        fresh: passATotal - passAMissing - passAStale,
      });

      // 6. Thematic Pass B (ALL participant responses — feedback doesn't need a transcript)
      const passBTotal = participantCallIds.size;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passBMissing = [...participantCallIds].filter((id) => !(participantResponseMap.get(id) as any)?.feedback_sentiment).length;
      const passBStale = [...participantCallIds].filter((id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = participantResponseMap.get(id) as any;
        return r?.feedback_sentiment && ((r.feedback_rules_version ?? 0) as number) < currentVersion;
      }).length;
      setPassBStatus({
        light: passBMissing + passBStale === 0 ? 'green' : passBStale > 0 ? 'red' : 'yellow',
        missing: passBMissing,
        stale: passBStale,
        total: passBTotal,
        fresh: passBTotal - passBMissing - passBStale,
      });
      // 7. VAPI Evaluation status
      const { data: metricSetting } = await supabase
        .from('experiment_settings')
        .select('setting_value')
        .eq('setting_key', 'active_vapi_evaluation_metric_id')
        .maybeSingle();
      const activeMetricId: string | null = (metricSetting as { setting_value?: string } | null)?.setting_value ?? null;

      const vapiEvalTotal = participantCallIds.size;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vapiMissing = [...participantCallIds].filter((id) => (participantResponseMap.get(id) as any)?.vapi_total_score == null).length;
      const vapiStale = [...participantCallIds].filter((id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = participantResponseMap.get(id) as any;
        return r?.vapi_total_score != null && activeMetricId && r.vapi_evaluation_metric_id !== activeMetricId;
      }).length;
      const vapiFresh = vapiEvalTotal - vapiMissing - vapiStale;

      let vapiPending = 0, vapiRunning = 0, vapiFailed = 0;
      if (activeMetricId) {
        const { data: queueRows } = await supabase
          .from('vapi_evaluation_queue')
          .select('status')
          .eq('metric_id', activeMetricId);
        (queueRows ?? []).forEach((r) => {
          if (r.status === 'pending') vapiPending++;
          else if (r.status === 'running') vapiRunning++;
          else if (r.status === 'failed') vapiFailed++;
        });
      }

      setVapiEvalStatus({
        light: !activeMetricId ? 'yellow' : vapiFailed > 0 ? 'red' : vapiMissing + vapiStale > 0 ? 'yellow' : 'green',
        total: vapiEvalTotal,
        missing: vapiMissing,
        stale: vapiStale,
        fresh: vapiFresh,
        pending: vapiPending,
        running: vapiRunning,
        failed: vapiFailed,
        activeMetricId,
      });
    } catch (e) {
      console.error('[ComputeHub] fetchStatus error:', e);
      toast.error('Failed to load compute status');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ─── Transcription ───────────────────────────────────────────────────────

  const runTranscription = async (retry = false) => {
    if (isGuestMode) return;
    setTranscriptionRunning(true);
    const toastId = 'transcription';
    toast.loading(retry ? 'Retrying failed transcriptions…' : 'Submitting calls for transcription…', { id: toastId });
    let totalSubmitted = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.functions.invoke('trigger-assemblyai-transcription', {
          body: { limit: 25, retry },
        });
        if (error) throw new Error(error.message);
        const batchSubmitted: number = data?.submitted ?? 0;
        totalSubmitted += batchSubmitted;
        const remaining: number = data?.total ?? 0;
        if (remaining === 0 || batchSubmitted === 0) break;
        toast.loading(`Submitting… (${totalSubmitted} sent)`, { id: toastId });
      }
      toast.success(
        totalSubmitted > 0
          ? `${totalSubmitted} call(s) submitted. Results arrive via webhook when AssemblyAI finishes.`
          : 'Nothing to submit — all calls already transcribed.',
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit transcription', { id: toastId });
    } finally {
      setTranscriptionRunning(false);
      fetchStatus();
    }
  };

  // ─── Qualitative metrics ─────────────────────────────────────────────────

  const runMetrics = async (recompute = false) => {
    if (isGuestMode) return;
    setMetricsRunning(true);
    setMetricsProgress(0);
    const toastId = 'compute-metrics';
    toast.loading('Computing qualitative metrics…', { id: toastId });
    let totalDone = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.functions.invoke('compute-qualitative-metrics', {
          body: { limit: BATCH, recompute: totalDone === 0 ? recompute : false },
        });
        if (error) throw new Error(error.message);
        const batchDone: number = data?.computed ?? 0;
        totalDone += batchDone;
        setMetricsProgress(totalDone);
        const remaining: number = data?.total ?? 0;
        if (remaining === 0 || batchDone === 0) break;
        toast.loading(`Computing metrics… (${totalDone} done)`, { id: toastId });
      }
      toast.success(
        totalDone > 0 ? `Metrics computed for ${totalDone} calls.` : 'Nothing to compute — all metrics up to date.',
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to compute metrics', { id: toastId });
    } finally {
      setMetricsRunning(false);
      fetchStatus();
    }
  };

  // ─── Thematic coding ─────────────────────────────────────────────────────

  const runThematic = async (
    opts: { passAOnly?: boolean; passBOnly?: boolean; recompute?: boolean },
    setRunning: (v: boolean) => void,
    setProgress: (v: number) => void,
    toastId: string,
  ) => {
    if (isGuestMode) return;
    setRunning(true);
    setProgress(0);
    toast.loading('Starting thematic coding…', { id: toastId });
    let totalDone = 0;
    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase.functions.invoke('run-thematic-coding', {
          body: { limit: BATCH, recompute: totalDone === 0 ? (opts.recompute ?? false) : false, ...opts },
        });
        if (error) throw new Error(error.message);
        const batchDone: number = data?.processed ?? 0;
        totalDone += batchDone;
        setProgress(totalDone);
        const remaining: number = data?.total ?? 0;
        if (remaining === 0 || batchDone === 0) break;
        toast.loading(`Thematic coding… (${totalDone} coded)`, { id: toastId });
      }
      toast.success(
        totalDone > 0 ? `Thematic coding complete — ${totalDone} calls coded.` : 'Nothing to code — all up to date.',
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to run thematic coding', { id: toastId });
    } finally {
      setRunning(false);
      fetchStatus();
    }
  };

  const runPassA = (recompute = false) =>
    runThematic({ passAOnly: true, recompute }, setPassARunning, setPassAProgress, 'pass-a');

  const runPassB = (recompute = false) =>
    runThematic({ passBOnly: true, recompute }, setPassBRunning, setPassBProgress, 'pass-b');

  // ─── VAPI Evaluation ─────────────────────────────────────────────────────

  const runVapiEvalEnqueue = async (includeStale = false) => {
    if (!isSuperAdmin || isGuestMode) return;
    setVapiEvalRunning(true);
    const toastId = 'vapi-eval-enqueue';
    toast.loading('Fetching calls to enqueue…', { id: toastId });
    try {
      const { data: responses } = await supabase
        .from('experiment_responses')
        .select('call_id, prolific_id, vapi_total_score, vapi_evaluation_metric_id')
        .not('call_id', 'is', null);

      const activeMetricId = vapiEvalStatus.activeMetricId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toEnqueue = (responses ?? []).filter((r: any) => {
        if (!isParticipant(r.prolific_id)) return false;
        if (r.vapi_total_score == null) return true;
        return includeStale && activeMetricId && r.vapi_evaluation_metric_id !== activeMetricId;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }).map((r: any) => r.call_id as string);

      if (toEnqueue.length === 0) {
        toast.success('Nothing to enqueue — all evaluations up to date.', { id: toastId });
        return;
      }

      const { data, error } = await supabase.functions.invoke('enqueue-vapi-evaluations', {
        body: { callIds: toEnqueue },
      });
      if (error) throw new Error(error.message);
      toast.success(`${data?.enqueued ?? toEnqueue.length} call(s) enqueued for evaluation.`, { id: toastId });
      fetchStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to enqueue', { id: toastId });
    } finally {
      setVapiEvalRunning(false);
    }
  };

  const runVapiEvalWorker = async () => {
    if (!isSuperAdmin || isGuestMode) return;
    setVapiEvalRunning(true);
    const toastId = 'vapi-eval-worker';
    toast.loading('Processing VAPI evaluation queue…', { id: toastId });
    try {
      const { data, error } = await supabase.functions.invoke('worker-vapi-evaluations', { body: {} });
      if (error) throw new Error(error.message);
      toast.success(data?.message ?? 'Worker completed.', { id: toastId });
      fetchStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to run worker', { id: toastId });
    } finally {
      setVapiEvalRunning(false);
    }
  };

  // ─── Run All ─────────────────────────────────────────────────────────────

  const runAllNeedCount =
    (runAllChecked.metrics ? metricsStatus.missing : 0) +
    (runAllChecked.passA ? passAStatus.missing + passAStatus.stale : 0) +
    (runAllChecked.passB ? passBStatus.missing + passBStatus.stale : 0);

  const runAllCost =
    (runAllChecked.passA ? (passAStatus.missing + passAStatus.stale) * COST_PER_CALL_PASS_A : 0) +
    (runAllChecked.passB ? (passBStatus.missing + passBStatus.stale) * COST_PER_CALL_PASS_B : 0);

  const runAllTime =
    (runAllChecked.metrics ? metricsStatus.missing * TIME_PER_CALL_METRICS : 0) +
    (runAllChecked.passA ? (passAStatus.missing + passAStatus.stale) * TIME_PER_CALL_PASS_A : 0) +
    (runAllChecked.passB ? (passBStatus.missing + passBStatus.stale) * TIME_PER_CALL_PASS_B : 0);

  const handleRunAll = async () => {
    setRunAllRunning(true);
    setRunAllOpen(false);
    if (runAllChecked.metrics) await runMetrics(false);
    if (runAllChecked.passA) await runPassA(false);
    if (runAllChecked.passB) await runPassB(false);
    setRunAllRunning(false);
  };

  // ─── Bump rules version ──────────────────────────────────────────────────

  const handleBumpRulesVersion = async () => {
    const confirmed = window.confirm(
      `Bump thematic coding rules version from v${rulesVersion} to v${rulesVersion + 1}?\n\nAll existing coded calls will be marked stale and will need re-coding on the next run.`,
    );
    if (!confirmed) return;
    setBumpingVersion(true);
    try {
      const { error } = await supabase
        .from('experiment_settings')
        .update({ setting_value: String(rulesVersion + 1) })
        .eq('setting_key', 'thematic_coding_rules_version');
      if (error) throw new Error(error.message);
      toast.success(`Rules version bumped to v${rulesVersion + 1}. Re-run thematic coding to update all stale calls.`);
      await fetchStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to bump version');
    } finally {
      setBumpingVersion(false);
    }
  };

  // ─── UI helpers ──────────────────────────────────────────────────────────

  const renderStatusBadge = (status: CardStatus) => {
    if (status.light === 'loading') return <Badge variant="secondary">Loading…</Badge>;
    if (status.missing + status.stale === 0)
      return <Badge className="bg-green-500 hover:bg-green-500 text-white">All fresh</Badge>;
    return (
      <div className="flex gap-1 flex-wrap">
        {status.missing > 0 && <Badge variant="secondary">{status.missing} missing</Badge>}
        {status.stale > 0 && <Badge variant="destructive">{status.stale} stale</Badge>}
      </div>
    );
  };

  const renderVapiEvalBadge = (status: VapiEvalCardStatus) => {
    if (status.light === 'loading') return <Badge variant="secondary">Loading…</Badge>;
    if (!status.activeMetricId) return <Badge variant="secondary">No active metric</Badge>;
    if (status.missing + status.stale === 0)
      return <Badge className="bg-green-500 hover:bg-green-500 text-white">All scored</Badge>;
    return (
      <div className="flex gap-1 flex-wrap">
        {status.missing > 0 && <Badge variant="secondary">{status.missing} missing</Badge>}
        {status.stale > 0 && <Badge variant="destructive">{status.stale} stale</Badge>}
        {status.pending > 0 && <Badge className="bg-blue-500 hover:bg-blue-500 text-white">{status.pending} queued</Badge>}
      </div>
    );
  };

  const renderTranscriptionBadge = (status: TranscriptionCardStatus) => {
    if (status.light === 'loading') return <Badge variant="secondary">Loading…</Badge>;
    if (status.missing + status.inProgress + status.error === 0)
      return <Badge className="bg-green-500 hover:bg-green-500 text-white">All transcribed</Badge>;
    return (
      <div className="flex gap-1 flex-wrap">
        {status.missing > 0 && <Badge variant="secondary">{status.missing} not submitted</Badge>}
        {status.inProgress > 0 && <Badge className="bg-blue-500 hover:bg-blue-500 text-white">{status.inProgress} in progress</Badge>}
        {status.error > 0 && <Badge variant="destructive">{status.error} errors</Badge>}
      </div>
    );
  };

  const isAnyRunning = transcriptionRunning || metricsRunning || passARunning || passBRunning || runAllRunning || vapiEvalRunning;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/researcher/dashboard')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Dashboard
          </Button>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Compute Hub</h1>
              <p className="text-sm text-muted-foreground">Participant calls only · {transcriptionStatus.total} total</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStatus} disabled={isAnyRunning}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isAnyRunning ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={() => setRunAllOpen(true)} disabled={isAnyRunning || isGuestMode} size="sm">
              <Play className="h-4 w-4 mr-2" />
              Run All
            </Button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-5">
        {/* Guide */}
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-3 cursor-pointer select-none hover:bg-muted/40 rounded-t-lg transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Info className="h-4 w-4 text-muted-foreground" />
                    How to use
                  </CardTitle>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                {/* Step 1 */}
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Transcribe calls <span className="ml-1 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">⏳ async — wait before continuing</span></div>
                    <div className="text-xs text-muted-foreground mt-0.5">Click <strong>Submit missing</strong> on card #1. AssemblyAI processes calls in the background — come back and hit <strong>Refresh</strong> after a few minutes. Proceed to step 2 only when #1 is green.</div>
                  </div>
                </div>
                {/* Step 2 */}
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">Compute metrics &amp; coding <span className="ml-1 text-xs font-normal text-blue-600 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">⏱ runs on this page</span></div>
                    <div className="text-xs text-muted-foreground mt-0.5">Click <strong>Run All</strong> (top right) to process cards #2–4 in sequence. Stay on this page — it takes ~1–3 min and will show progress. You're done when all three turn green.</div>
                  </div>
                </div>
                {/* Step 3 */}
                <div className="flex gap-3 items-start">
                  <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">VAPI Evaluation <span className="ml-1 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">⏳ async — wait before continuing</span></div>
                    <div className="text-xs text-muted-foreground mt-0.5">On card #5: click <strong>Enqueue missing</strong>, then <strong>Process queue</strong>. Results arrive from VAPI in ~1–2 min — hit <strong>Refresh</strong> to see scores update.</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground border-t pt-2">
                  <strong>Green</strong> = fresh · <strong>Yellow</strong> = missing or not yet run · <strong>Red</strong> = stale or errors. Participant calls only (researcher test calls excluded).
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Pipeline diagram */}
        <PipelineDiagram
          transcription={transcriptionStatus}
          metrics={metricsStatus}
          passA={passAStatus}
          passB={passBStatus}
          vapiEval={vapiEvalStatus}
        />

        {/* ── Card 1: AssemblyAI Transcription ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={transcriptionStatus.light} />
                <CardTitle className="text-base">#1 AssemblyAI Transcription</CardTitle>
              </div>
              {renderTranscriptionBadge(transcriptionStatus)}
            </div>
            <CardDescription>
              Submits call recordings to AssemblyAI for high-quality transcription with speaker labels and sentiment
              analysis. Results return asynchronously via webhook.
              {transcriptionStatus.total > 0 && (
                <span>
                  {' '}{transcriptionStatus.completed}/{transcriptionStatus.total} participant calls transcribed.
                  {transcriptionStatus.inProgress > 0 && ` ${transcriptionStatus.inProgress} in progress.`}
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runTranscription(false)}
              disabled={transcriptionRunning || isGuestMode || transcriptionStatus.missing === 0}
            >
              <Play className={`h-4 w-4 mr-2 ${transcriptionRunning ? 'animate-spin' : ''}`} />
              {transcriptionRunning
                ? 'Submitting…'
                : `Submit missing${transcriptionStatus.missing > 0 ? ` (${transcriptionStatus.missing})` : ''}`}
            </Button>
            {transcriptionStatus.error > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => runTranscription(true)}
                disabled={transcriptionRunning || isGuestMode}
              >
                Retry errors ({transcriptionStatus.error})
              </Button>
            )}
            <span className="text-xs text-muted-foreground">API cost varies by call duration</span>
          </CardContent>
        </Card>

        {/* ── Card 2: Qualitative Metrics ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={metricsStatus.light} />
                <CardTitle className="text-base">#2 Qualitative Metrics</CardTitle>
              </div>
              {renderStatusBadge(metricsStatus)}
            </div>
            <CardDescription>
              Derives sentiment arc, engagement, and word-count features from AssemblyAI utterances.{' '}
              <strong>Free — no API cost.</strong>
              {metricsStatus.total > 0 && ` ${metricsStatus.fresh}/${metricsStatus.total} transcribed calls fresh.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runMetrics(false)}
              disabled={metricsRunning || isGuestMode || metricsStatus.missing === 0}
            >
              <Play className={`h-4 w-4 mr-2 ${metricsRunning ? 'animate-spin' : ''}`} />
              {metricsRunning
                ? `Computing… (${metricsProgress} done)`
                : `Compute missing${metricsStatus.missing > 0 ? ` (${metricsStatus.missing})` : ''}`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runMetrics(true)}
              disabled={metricsRunning || isGuestMode}
              title="Overwrites all existing metric values"
            >
              Hard recompute all
            </Button>
          </CardContent>
        </Card>

        {/* ── Card 3: Thematic Pass A ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={passAStatus.light} />
                <CardTitle className="text-base">#3 Thematic Coding — Pass A (Transcripts)</CardTitle>
              </div>
              {renderStatusBadge(passAStatus)}
            </div>
            <CardDescription>
              GPT-4o-mini reads each call transcript and assigns comfort score, rapport level, self-disclosure, and
              notable moments. Rules version: <strong>v{rulesVersion}</strong>.
              {passAStatus.total > 0 && ` ${passAStatus.fresh}/${passAStatus.total} transcribed calls fresh.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runPassA(false)}
              disabled={passARunning || isGuestMode || passAStatus.missing + passAStatus.stale === 0}
            >
              <Play className={`h-4 w-4 mr-2 ${passARunning ? 'animate-spin' : ''}`} />
              {passARunning
                ? `Coding… (${passAProgress} done)`
                : `Code missing/stale${passAStatus.missing + passAStatus.stale > 0 ? ` (${passAStatus.missing + passAStatus.stale})` : ''}`}
            </Button>
            {passAStatus.missing + passAStatus.stale > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCost((passAStatus.missing + passAStatus.stale) * COST_PER_CALL_PASS_A)} ·{' '}
                {formatTime((passAStatus.missing + passAStatus.stale) * TIME_PER_CALL_PASS_A)}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runPassA(true)}
              disabled={passARunning || isGuestMode}
              title="Force re-runs on all calls, overwriting existing codes"
            >
              Hard recode all
            </Button>
          </CardContent>
        </Card>

        {/* ── Card 4: Thematic Pass B ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={passBStatus.light} />
                <CardTitle className="text-base">#4 Thematic Coding — Pass B (Feedback)</CardTitle>
              </div>
              {renderStatusBadge(passBStatus)}
            </div>
            <CardDescription>
              GPT-4o-mini reads participant text feedback and assigns sentiment, themes, and inferred satisfaction.
              Does not require a transcript. Rules version: <strong>v{rulesVersion}</strong>.
              {passBStatus.total > 0 && ` ${passBStatus.fresh}/${passBStatus.total} participant responses fresh.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runPassB(false)}
              disabled={passBRunning || isGuestMode || passBStatus.missing + passBStatus.stale === 0}
            >
              <Play className={`h-4 w-4 mr-2 ${passBRunning ? 'animate-spin' : ''}`} />
              {passBRunning
                ? `Coding… (${passBProgress} done)`
                : `Code missing/stale${passBStatus.missing + passBStatus.stale > 0 ? ` (${passBStatus.missing + passBStatus.stale})` : ''}`}
            </Button>
            {passBStatus.missing + passBStatus.stale > 0 && (
              <span className="text-xs text-muted-foreground">
                {formatCost((passBStatus.missing + passBStatus.stale) * COST_PER_CALL_PASS_B)} ·{' '}
                {formatTime((passBStatus.missing + passBStatus.stale) * TIME_PER_CALL_PASS_B)}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runPassB(true)}
              disabled={passBRunning || isGuestMode}
              title="Force re-runs on all calls, overwriting existing feedback codes"
            >
              Hard recode all
            </Button>
          </CardContent>
        </Card>

        {/* ── Card 5: VAPI Evaluation ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={vapiEvalStatus.light} />
                <CardTitle className="text-base">#5 VAPI Evaluation</CardTitle>
              </div>
              {renderVapiEvalBadge(vapiEvalStatus)}
            </div>
            <CardDescription>
              Runs VAPI structured output evaluation on each call and stores a total score.
              {!vapiEvalStatus.activeMetricId && (
                <span className="text-yellow-600"> No active metric configured — set one in Experiment Settings.</span>
              )}
              {vapiEvalStatus.total > 0 && vapiEvalStatus.activeMetricId && (
                <span>
                  {' '}{vapiEvalStatus.fresh}/{vapiEvalStatus.total} participant calls scored with current metric.
                  {vapiEvalStatus.pending > 0 && ` ${vapiEvalStatus.pending} queued.`}
                  {vapiEvalStatus.running > 0 && ` ${vapiEvalStatus.running} running.`}
                  {vapiEvalStatus.failed > 0 && ` ${vapiEvalStatus.failed} failed.`}
                </span>
              )}
              {!isSuperAdmin && (
                <span className="text-muted-foreground"> (Super admin only)</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap items-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => runVapiEvalEnqueue(false)}
              disabled={vapiEvalRunning || !isSuperAdmin || isGuestMode || vapiEvalStatus.missing === 0 || !vapiEvalStatus.activeMetricId}
            >
              <Play className={`h-4 w-4 mr-2 ${vapiEvalRunning ? 'animate-spin' : ''}`} />
              {vapiEvalStatus.missing > 0 ? `Enqueue missing (${vapiEvalStatus.missing})` : 'Enqueue missing'}
            </Button>
            {vapiEvalStatus.stale > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => runVapiEvalEnqueue(true)}
                disabled={vapiEvalRunning || !isSuperAdmin || isGuestMode}
              >
                Enqueue stale ({vapiEvalStatus.stale})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={runVapiEvalWorker}
              disabled={vapiEvalRunning || !isSuperAdmin || isGuestMode || (vapiEvalStatus.pending + vapiEvalStatus.running) === 0}
            >
              {vapiEvalRunning ? 'Processing…' : `Process queue${vapiEvalStatus.pending + vapiEvalStatus.running > 0 ? ` (${vapiEvalStatus.pending + vapiEvalStatus.running})` : ''}`}
            </Button>
            <span className="text-xs text-muted-foreground">Uses VAPI API · no extra LLM cost</span>
          </CardContent>
        </Card>

        {/* ── Advanced (super-admin only) ── */}
        {isSuperAdmin && (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center gap-2">
                Advanced
                <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Thematic Coding Rules Version</CardTitle>
                  <CardDescription>
                    Current version: <strong>v{rulesVersion}</strong>. Bumping the version marks all existing coded
                    calls as stale — they will be re-coded on the next run. Do this after editing the coding prompts in
                    the edge function.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBumpRulesVersion}
                    disabled={bumpingVersion || isGuestMode}
                  >
                    Bump to v{rulesVersion + 1} (mark all stale)
                  </Button>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        )}
      </main>

      {/* Run All dialog (GPT-based steps only; transcription is async so excluded) */}
      <Dialog open={runAllOpen} onOpenChange={setRunAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run All</DialogTitle>
            <DialogDescription>
              Runs GPT-based compute jobs for missing and stale entries. AssemblyAI transcription (#1) is excluded
              because it's asynchronous — run it separately first, then refresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={runAllChecked.metrics}
                  onCheckedChange={(v) => setRunAllChecked((prev) => ({ ...prev, metrics: Boolean(v) }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">#2 Qualitative Metrics</div>
                  <div className="text-sm text-muted-foreground">
                    {metricsStatus.missing} missing · Free · {formatTime(metricsStatus.missing * TIME_PER_CALL_METRICS)}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={runAllChecked.passA}
                  onCheckedChange={(v) => setRunAllChecked((prev) => ({ ...prev, passA: Boolean(v) }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">#3 Thematic Pass A (Transcripts)</div>
                  <div className="text-sm text-muted-foreground">
                    {passAStatus.missing + passAStatus.stale} to process ·{' '}
                    {formatCost((passAStatus.missing + passAStatus.stale) * COST_PER_CALL_PASS_A)} ·{' '}
                    {formatTime((passAStatus.missing + passAStatus.stale) * TIME_PER_CALL_PASS_A)}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={runAllChecked.passB}
                  onCheckedChange={(v) => setRunAllChecked((prev) => ({ ...prev, passB: Boolean(v) }))}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-medium">#4 Thematic Pass B (Feedback)</div>
                  <div className="text-sm text-muted-foreground">
                    {passBStatus.missing + passBStatus.stale} to process ·{' '}
                    {formatCost((passBStatus.missing + passBStatus.stale) * COST_PER_CALL_PASS_B)} ·{' '}
                    {formatTime((passBStatus.missing + passBStatus.stale) * TIME_PER_CALL_PASS_B)}
                  </div>
                </div>
              </label>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total calls to process:</span>
                <span className="font-medium">{runAllNeedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated API cost:</span>
                <span className="font-medium">{formatCost(runAllCost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estimated time:</span>
                <span className="font-medium">{formatTime(runAllTime)}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunAllOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRunAll}
              disabled={runAllNeedCount === 0 || (!runAllChecked.metrics && !runAllChecked.passA && !runAllChecked.passB)}
            >
              <Play className="h-4 w-4 mr-2" />
              Run {runAllNeedCount} calls
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComputeHub;
