import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Bug, Clapperboard } from "lucide-react";
import { useResearcherAuth } from "@/contexts/ResearcherAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type VideoRunPhase = {
  phase: string;
  startedAtMs: number;
  endedAtMs: number | null;
  percentStart: number;
  percentEnd: number;
};

type NarrationEventDebug = {
  label: string;
  sourceMs: number;
  narratedMs: number;
  clipDurationMs: number;
  scheduledStartMs: number;
  scheduledEndMs: number;
  gapCompressedMs?: number;
};

type EncodingStageDebug = {
  label: string;
  command?: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs?: number;
};

type ManifestRun = {
  runId: string;
  flowId: string;
  createdAt: string;
  ok: boolean;
  syncModel: string | null;
  debugFile: string;
  latestFile: string;
  artifactUrls?: {
    fast?: string | null;
    follow?: string | null;
    narrated?: string | null;
  };
};

type ManifestDebug = {
  updatedAt: string;
  runs: ManifestRun[];
};

type VideoRunDebugRecord = {
  runId: string;
  flowId: string;
  createdAt: string;
  ok: boolean;
  attempts: number | null;
  syncModel: string | null;
  narrationScope: string | null;
  narrationGapMaxMs: number;
  narrationOverlapResolved: boolean;
  syncFallbackUsed: boolean;
  ttsError: string | null;
  failureExplanations: string[];
  narrationSkippedSteps: Array<{ step: string; reason: string }>;
  progressPhases: VideoRunPhase[];
  ffmpegStages: EncodingStageDebug[];
  timeline: Array<{ step: string; stepStartMs: number; stepEndMs: number; narrationMs?: number }>;
  narrationEvents: NarrationEventDebug[];
  artifacts: {
    fast: string | null;
    follow: string | null;
    narrated: string | null;
  };
  artifactUrls: {
    fast: string | null;
    follow: string | null;
    narrated: string | null;
  };
};

const ENABLE_PLAYWRIGHT_DEBUG_PAGE = import.meta.env.DEV && import.meta.env.VITE_ENABLE_PLAYWRIGHT_DEBUG === "true";

const toSeconds = (ms: number | null | undefined): string => {
  if (!Number.isFinite(ms ?? NaN)) return "-";
  return `${((ms || 0) / 1000).toFixed(2)}s`;
};

const toDurationMs = (phase: VideoRunPhase): number | null => {
  if (!Number.isFinite(phase.startedAtMs) || !Number.isFinite(phase.endedAtMs ?? NaN)) return null;
  return Math.max(0, (phase.endedAtMs || 0) - phase.startedAtMs);
};

const ResearcherVideoRunDebug = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isGuestMode } = useResearcherAuth();
  const [manifest, setManifest] = useState<ManifestDebug>({ updatedAt: "", runs: [] });
  const [selectedRunId, setSelectedRunId] = useState("");
  const [detail, setDetail] = useState<VideoRunDebugRecord | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedRun = useMemo(
    () => manifest.runs.find((run) => run.runId === selectedRunId) || null,
    [manifest.runs, selectedRunId],
  );

  const loadManifest = useCallback(async () => {
    setLoadingManifest(true);
    setError(null);
    try {
      const res = await fetch("/__dev__/playwright-runs/manifest", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch manifest (${res.status})`);
      const data = (await res.json()) as ManifestDebug;
      const runs = Array.isArray(data.runs) ? data.runs : [];
      setManifest({ updatedAt: data.updatedAt || "", runs });
      setSelectedRunId((prev) => (prev && runs.some((r) => r.runId === prev) ? prev : (runs[0]?.runId || "")));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load manifest");
    } finally {
      setLoadingManifest(false);
    }
  }, []);

  const loadDetail = useCallback(async (run: ManifestRun | null) => {
    if (!run?.debugFile) {
      setDetail(null);
      return;
    }
    setLoadingDetail(true);
    setError(null);
    try {
      const url = `/__dev__/playwright-runs/debug?file=${encodeURIComponent(run.debugFile)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to fetch debug record (${res.status})`);
      const data = (await res.json()) as VideoRunDebugRecord;
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load debug record");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  useEffect(() => {
    void loadDetail(selectedRun);
  }, [loadDetail, selectedRun]);

  if (!ENABLE_PLAYWRIGHT_DEBUG_PAGE || isGuestMode || !isSuperAdmin) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Video Debug Disabled</CardTitle>
            <CardDescription>
              This page is only available for super admins in local dev when `VITE_ENABLE_PLAYWRIGHT_DEBUG=true`.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate("/researcher/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clapperboard className="h-5 w-5 text-primary" />
                Playwright Video Run Debug
              </CardTitle>
              <CardDescription>
                Inspect run telemetry, narration scheduling, and encoding stages.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => navigate("/researcher/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button variant="outline" onClick={() => void loadManifest()} disabled={loadingManifest}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loadingManifest ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Run</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
              >
                {manifest.runs.length === 0 && <option value="">No runs found</option>}
                {manifest.runs.map((run) => (
                  <option key={run.runId} value={run.runId}>
                    {run.flowId} • {new Date(run.createdAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <div className="text-muted-foreground">Manifest updated</div>
              <div>{manifest.updatedAt ? new Date(manifest.updatedAt).toLocaleString() : "-"}</div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="text-muted-foreground">Status</div>
              <div className="flex gap-2">
                {detail?.ok ? (
                  <Badge className="bg-emerald-100 text-emerald-800">PASS</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">FAIL</Badge>
                )}
                {detail?.syncModel ? <Badge variant="outline">{detail.syncModel}</Badge> : null}
                {detail?.syncFallbackUsed ? <Badge className="bg-amber-100 text-amber-800">fallback</Badge> : null}
              </div>
            </div>
          </div>
          {error ? (
            <div className="text-sm text-red-600 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Narrated Video Preview</CardTitle>
          <CardDescription>
            Source: {detail?.artifactUrls?.narrated || selectedRun?.artifactUrls?.narrated || "-"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDetail ? (
            <div className="text-sm text-muted-foreground">Loading run details...</div>
          ) : detail?.artifactUrls?.narrated ? (
            <video className="w-full rounded border" controls src={detail.artifactUrls.narrated} />
          ) : (
            <div className="text-sm text-muted-foreground">No narrated artifact available for this run.</div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Phase Progress</CardTitle>
            <CardDescription>Execution and post-processing progress timeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail?.progressPhases?.length ? detail.progressPhases.map((phase) => {
              const durationMs = toDurationMs(phase);
              return (
                <div key={`${phase.phase}-${phase.startedAtMs}`} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{phase.phase}</span>
                    <span className="text-muted-foreground">{toSeconds(durationMs)}</span>
                  </div>
                  <Progress value={Math.max(0, Math.min(100, phase.percentEnd || 0))} className="h-2" />
                </div>
              );
            }) : <div className="text-sm text-muted-foreground">No phase telemetry found.</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Encoding Stages</CardTitle>
            <CardDescription>Timed ffmpeg stages used to produce artifacts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail?.ffmpegStages?.length ? detail.ffmpegStages.map((stage) => (
              <div key={`${stage.label}-${stage.startedAtMs}`} className="rounded border p-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{stage.label}</span>
                  <span className="text-muted-foreground">{toSeconds(stage.durationMs ?? null)}</span>
                </div>
                {stage.command ? (
                  <div className="mt-1 text-xs text-muted-foreground break-all">{stage.command}</div>
                ) : null}
              </div>
            )) : <div className="text-sm text-muted-foreground">No ffmpeg stage telemetry found.</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Narration Timeline</CardTitle>
          <CardDescription>
            Source vs scheduled timings, including compressed silent gaps.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <div className="mb-3 text-xs text-muted-foreground">
            Attempts: {detail?.attempts ?? "-"} • Run: {detail?.runId || "-"} • Created: {detail?.createdAt ? new Date(detail.createdAt).toLocaleString() : "-"}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">Label</th>
                <th className="py-2 pr-2">Source</th>
                <th className="py-2 pr-2">Scheduled Start</th>
                <th className="py-2 pr-2">Scheduled End</th>
                <th className="py-2 pr-2">Clip</th>
                <th className="py-2 pr-2">Gap Compressed</th>
              </tr>
            </thead>
            <tbody>
              {detail?.narrationEvents?.length ? detail.narrationEvents.map((event) => (
                <tr key={`${event.label}-${event.sourceMs}`} className="border-b">
                  <td className="py-2 pr-2 font-medium">{event.label}</td>
                  <td className="py-2 pr-2">{toSeconds(event.sourceMs)}</td>
                  <td className="py-2 pr-2">{toSeconds(event.scheduledStartMs)}</td>
                  <td className="py-2 pr-2">{toSeconds(event.scheduledEndMs)}</td>
                  <td className="py-2 pr-2">{toSeconds(event.clipDurationMs)}</td>
                  <td className="py-2 pr-2">{toSeconds(event.gapCompressedMs || 0)}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-2 text-muted-foreground" colSpan={6}>No narration events found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recorded Step Timeline</CardTitle>
          <CardDescription>Raw step timings captured during automation execution.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-2">Step</th>
                <th className="py-2 pr-2">Start</th>
                <th className="py-2 pr-2">End</th>
                <th className="py-2 pr-2">Narration</th>
              </tr>
            </thead>
            <tbody>
              {detail?.timeline?.length ? detail.timeline.map((row, idx) => (
                <tr key={`${row.step}-${idx}`} className="border-b">
                  <td className="py-2 pr-2 font-medium">{row.step}</td>
                  <td className="py-2 pr-2">{toSeconds(row.stepStartMs)}</td>
                  <td className="py-2 pr-2">{toSeconds(row.stepEndMs)}</td>
                  <td className="py-2 pr-2">{toSeconds(row.narrationMs || 0)}</td>
                </tr>
              )) : (
                <tr>
                  <td className="py-2 text-muted-foreground" colSpan={4}>No step timeline entries found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Issues and Notes</CardTitle>
          <CardDescription>Fallbacks, TTS errors, and narration omissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {detail?.syncFallbackUsed ? (
              <Badge className="bg-amber-100 text-amber-800">
                <Bug className="mr-1 h-3 w-3" />
                Sync fallback used
              </Badge>
            ) : (
              <Badge className="bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Serial sync active
              </Badge>
            )}
            {detail?.narrationGapMaxMs ? <Badge variant="outline">Gap cap: {detail.narrationGapMaxMs}ms</Badge> : null}
            {detail?.narrationScope ? <Badge variant="outline">Scope: {detail.narrationScope}</Badge> : null}
          </div>

          {detail?.ttsError ? <div className="text-red-600">TTS Error: {detail.ttsError}</div> : null}

          {detail?.failureExplanations?.length ? (
            <div>
              <div className="font-medium mb-1">Failure explanations</div>
              <ul className="list-disc pl-5 space-y-1">
                {detail.failureExplanations.map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {detail?.narrationSkippedSteps?.length ? (
            <div>
              <div className="font-medium mb-1">Skipped narration steps</div>
              <ul className="list-disc pl-5 space-y-1">
                {detail.narrationSkippedSteps.map((item, idx) => (
                  <li key={`${item.step}-${idx}`}>{item.step}: {item.reason}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-muted-foreground">No skipped narration steps recorded.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResearcherVideoRunDebug;
