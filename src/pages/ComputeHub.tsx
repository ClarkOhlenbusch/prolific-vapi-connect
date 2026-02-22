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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Cpu,
  ChevronDown,
  RefreshCw,
  Play,
  Info,
} from 'lucide-react';

// Cost constants (gpt-4o-mini, conservative estimates)
const COST_PER_CALL_PASS_A = 0.00048; // transcript → call_thematic_codes
const COST_PER_CALL_PASS_B = 0.00018; // feedback → experiment_responses

// Estimated wall-clock seconds per call (including API wait)
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

function StatusDot({ light }: { light: StatusLight }) {
  const colors: Record<StatusLight, string> = {
    green: 'bg-green-500',
    yellow: 'bg-yellow-400',
    red: 'bg-red-500',
    loading: 'bg-gray-300 animate-pulse',
  };
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[light]}`} />;
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

const EMPTY_STATUS: CardStatus = { light: 'loading', missing: 0, stale: 0, total: 0, fresh: 0 };

const ComputeHub = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isGuestMode } = useResearcherAuth();

  const [rulesVersion, setRulesVersion] = useState<number>(1);
  const [metricsStatus, setMetricsStatus] = useState<CardStatus>(EMPTY_STATUS);
  const [passAStatus, setPassAStatus] = useState<CardStatus>(EMPTY_STATUS);
  const [passBStatus, setPassBStatus] = useState<CardStatus>(EMPTY_STATUS);

  // Running state per card
  const [metricsRunning, setMetricsRunning] = useState(false);
  const [passARunning, setPassARunning] = useState(false);
  const [passBRunning, setPassBRunning] = useState(false);
  const [metricsProgress, setMetricsProgress] = useState(0);
  const [passAProgress, setPassAProgress] = useState(0);
  const [passBProgress, setPassBProgress] = useState(0);

  // Run All dialog
  const [runAllOpen, setRunAllOpen] = useState(false);
  const [runAllChecked, setRunAllChecked] = useState({ metrics: true, passA: true, passB: true });
  const [runAllRunning, setRunAllRunning] = useState(false);

  // Advanced
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [bumpingVersion, setBumpingVersion] = useState(false);

  // ─── Fetch status ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async () => {
    setMetricsStatus(EMPTY_STATUS);
    setPassAStatus(EMPTY_STATUS);
    setPassBStatus(EMPTY_STATUS);
    try {
      // 1. Current rules version
      const { data: settingRow } = await supabase
        .from('experiment_settings')
        .select('setting_value')
        .eq('setting_key', 'thematic_coding_rules_version')
        .maybeSingle();
      const currentVersion = settingRow ? parseInt(String(settingRow.setting_value)) || 1 : 1;
      setRulesVersion(currentVersion);

      // 2. All transcribed call IDs
      const { data: transcriptions } = await supabase
        .from('call_transcriptions_assemblyai')
        .select('call_id')
        .eq('status', 'completed')
        .not('utterances', 'is', null);
      const allIds = new Set((transcriptions ?? []).map((r) => r.call_id as string));
      const total = allIds.size;

      // 3. Qualitative metrics
      const { data: computed } = await supabase
        .from('call_qualitative_metrics')
        .select('call_id');
      const computedSet = new Set((computed ?? []).map((r) => r.call_id as string));
      const metricsMissing = [...allIds].filter((id) => !computedSet.has(id)).length;
      setMetricsStatus({
        light: metricsMissing === 0 ? 'green' : 'yellow',
        missing: metricsMissing,
        stale: 0,
        total,
        fresh: total - metricsMissing,
      });

      // 4. Thematic Pass A
      const { data: codedA } = await supabase
        .from('call_thematic_codes')
        .select('call_id, rules_version');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codedAMap = new Map((codedA ?? []).map((r: any) => [r.call_id as string, (r.rules_version ?? 0) as number]));
      const passAMissing = [...allIds].filter((id) => !codedAMap.has(id)).length;
      const passAStale = [...allIds].filter((id) => codedAMap.has(id) && (codedAMap.get(id) ?? 0) < currentVersion).length;
      setPassAStatus({
        light: passAMissing + passAStale === 0 ? 'green' : passAStale > 0 ? 'red' : 'yellow',
        missing: passAMissing,
        stale: passAStale,
        total,
        fresh: total - passAMissing - passAStale,
      });

      // 5. Thematic Pass B
      const { data: responses } = await supabase
        .from('experiment_responses')
        .select('call_id, feedback_sentiment, feedback_rules_version')
        .not('call_id', 'is', null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseMap = new Map((responses ?? []).map((r: any) => [r.call_id as string, r]));
      const eligibleIds = [...allIds].filter((id) => responseMap.has(id));
      const eligibleTotal = eligibleIds.length;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const passBMissing = eligibleIds.filter((id) => !(responseMap.get(id) as any)?.feedback_sentiment).length;
      const passBStale = eligibleIds.filter((id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const r = responseMap.get(id) as any;
        return r?.feedback_sentiment && ((r.feedback_rules_version ?? 0) as number) < currentVersion;
      }).length;
      setPassBStatus({
        light: passBMissing + passBStale === 0 ? 'green' : passBStale > 0 ? 'red' : 'yellow',
        missing: passBMissing,
        stale: passBStale,
        total: eligibleTotal,
        fresh: eligibleTotal - passBMissing - passBStale,
      });
    } catch (e) {
      console.error('[ComputeHub] fetchStatus error:', e);
      toast.error('Failed to load compute status');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // ─── Run helpers ───────────────────────────────────────────────────────────

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

  // ─── Run All ───────────────────────────────────────────────────────────────

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

  // ─── Bump rules version ────────────────────────────────────────────────────

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

  // ─── UI helpers ────────────────────────────────────────────────────────────

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

  const isAnyRunning = metricsRunning || passARunning || passBRunning || runAllRunning;

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
              <p className="text-sm text-muted-foreground">Run AI computations on call data</p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchStatus} disabled={isAnyRunning}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isAnyRunning ? 'animate-spin' : ''}`} />
              Refresh status
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
        {/* Info alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Green</strong> = fresh, <strong>yellow</strong> = some missing, <strong>red</strong> = stale (rules
            changed). After editing thematic coding prompts, use <em>Advanced → Bump version</em> to mark all codes
            stale, then re-run.
          </AlertDescription>
        </Alert>

        {/* Qualitative Metrics */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={metricsStatus.light} />
                <CardTitle className="text-base">Qualitative Metrics</CardTitle>
              </div>
              {renderStatusBadge(metricsStatus)}
            </div>
            <CardDescription>
              Derives sentiment arc, word count, and engagement features from AssemblyAI utterances.{' '}
              <strong>Free — no API cost.</strong>
              {metricsStatus.total > 0 ? ` ${metricsStatus.fresh}/${metricsStatus.total} calls fresh.` : ''}
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

        {/* Thematic Pass A */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={passAStatus.light} />
                <CardTitle className="text-base">Thematic Coding — Pass A (Transcripts)</CardTitle>
              </div>
              {renderStatusBadge(passAStatus)}
            </div>
            <CardDescription>
              GPT-4o-mini reads each call transcript and assigns comfort score, rapport level, self-disclosure, and
              notable moments. Rules version: <strong>v{rulesVersion}</strong>.
              {passAStatus.total > 0 ? ` ${passAStatus.fresh}/${passAStatus.total} calls fresh.` : ''}
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

        {/* Thematic Pass B */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <StatusDot light={passBStatus.light} />
                <CardTitle className="text-base">Thematic Coding — Pass B (Feedback)</CardTitle>
              </div>
              {renderStatusBadge(passBStatus)}
            </div>
            <CardDescription>
              GPT-4o-mini reads participant text feedback and assigns sentiment, themes, and inferred satisfaction.
              Rules version: <strong>v{rulesVersion}</strong>.
              {passBStatus.total > 0 ? ` ${passBStatus.fresh}/${passBStatus.total} responses fresh.` : ''}
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

        {/* Advanced (super-admin only) */}
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

      {/* Run All dialog */}
      <Dialog open={runAllOpen} onOpenChange={setRunAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run All</DialogTitle>
            <DialogDescription>
              Choose which computations to run. Only missing and stale entries will be processed.
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
                  <div className="font-medium">Qualitative Metrics</div>
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
                  <div className="font-medium">Thematic Pass A (Transcripts)</div>
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
                  <div className="font-medium">Thematic Pass B (Feedback)</div>
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
