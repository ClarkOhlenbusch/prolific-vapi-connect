import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle2, Bug, Clapperboard, Upload, CloudUpload } from "lucide-react";
import { useResearcherAuth } from "@/contexts/ResearcherAuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

// ─── types ────────────────────────────────────────────────────────────────────

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
  artifacts: { fast: string | null; follow: string | null; narrated: string | null };
  artifactUrls: { fast: string | null; follow: string | null; narrated: string | null };
};

type RunRow = {
  runId: string;
  flowId: string;
  createdAt: string;
  ok: boolean;
  syncModel: string | null;
  debugFileName: string;
  // resolved video URLs (from DB if uploaded, or from /__dev__/ in local dev)
  videoFastUrl: string | null;
  videoFollowUrl: string | null;
  videoNarratedUrl: string | null;
};

type ArtifactSlot = "fast" | "follow" | "narrated";

// ─── helpers ──────────────────────────────────────────────────────────────────

const IS_DEV = import.meta.env.DEV;

const toSeconds = (ms: number | null | undefined): string => {
  if (!Number.isFinite(ms ?? NaN)) return "-";
  return `${((ms || 0) / 1000).toFixed(2)}s`;
};

const toDurationMs = (phase: VideoRunPhase): number | null => {
  if (!Number.isFinite(phase.startedAtMs) || !Number.isFinite(phase.endedAtMs ?? NaN)) return null;
  return Math.max(0, (phase.endedAtMs || 0) - phase.startedAtMs);
};

/** Fetch a debug JSON either from /__dev__/ (local) or /playwright-runs/ (prod static). */
async function fetchDebugJson(fileName: string): Promise<VideoRunDebugRecord> {
  const url = IS_DEV
    ? `/__dev__/playwright-runs/debug?file=${encodeURIComponent(fileName)}`
    : `/playwright-runs/${encodeURIComponent(fileName)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch debug record (${res.status})`);
  return res.json() as Promise<VideoRunDebugRecord>;
}

/** Fetch the run manifest either from /__dev__/ (local) or /playwright-runs/ (prod static). */
async function fetchManifest(): Promise<{ runId: string; flowId: string; createdAt: string; ok: boolean; syncModel: string | null; debugFile: string; artifactUrls?: { fast?: string | null; follow?: string | null; narrated?: string | null } }[]> {
  if (IS_DEV) {
    const res = await fetch("/__dev__/playwright-runs/manifest", { cache: "no-store" });
    if (!res.ok) throw new Error(`Manifest fetch failed (${res.status})`);
    const data = await res.json() as { updatedAt: string; runs: { runId: string; flowId: string; createdAt: string; ok: boolean; syncModel: string | null; debugFile: string; artifactUrls?: { fast?: string | null; follow?: string | null; narrated?: string | null } }[] };
    return Array.isArray(data.runs) ? data.runs : [];
  } else {
    // prod: /playwright-runs/manifest.json is a list of filenames; derive run metadata from the JSONs
    const res = await fetch("/playwright-runs/manifest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Manifest fetch failed (${res.status})`);
    const names = await res.json() as string[];
    const results = await Promise.allSettled(
      names.map(async (name) => {
        const r = await fetch(`/playwright-runs/${encodeURIComponent(name)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`Failed to fetch ${name}`);
        const d = await r.json() as VideoRunDebugRecord;
        return { runId: d.runId, flowId: d.flowId, createdAt: d.createdAt, ok: d.ok, syncModel: d.syncModel, debugFile: name };
      })
    );
    return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  }
}

/** Fetch existing DB records for a list of runIds, returning a map runId → DB row. */
async function fetchDbRecords(runIds: string[]) {
  if (runIds.length === 0) return {} as Record<string, { video_fast_url: string | null; video_follow_url: string | null; video_narrated_url: string | null }>;
  const { data } = await supabase
    .from("playwright_run_artifacts")
    .select("run_id, video_fast_url, video_follow_url, video_narrated_url")
    .in("run_id", runIds);
  const map: Record<string, { video_fast_url: string | null; video_follow_url: string | null; video_narrated_url: string | null }> = {};
  for (const row of data ?? []) {
    map[row.run_id] = { video_fast_url: row.video_fast_url, video_follow_url: row.video_follow_url, video_narrated_url: row.video_narrated_url };
  }
  return map;
}

/** Upsert run metadata into the DB (idempotent — only inserts missing rows). */
async function upsertRunMetadata(runs: VideoRunDebugRecord[]) {
  if (runs.length === 0) return;
  const rows = runs.map((r) => ({
    run_id: r.runId,
    flow_id: r.flowId,
    run_created_at: r.createdAt,
    ok: r.ok,
    sync_model: r.syncModel,
    debug_data: r as unknown as Record<string, unknown>,
  }));
  await supabase.from("playwright_run_artifacts").upsert(rows, { onConflict: "run_id", ignoreDuplicates: true });
}

const STORAGE_BUCKET = "playwright-recordings";

/** Upload a video Blob to Supabase Storage and return the public URL. */
async function uploadVideoToStorage(runId: string, slot: ArtifactSlot, blob: Blob): Promise<string> {
  const ext = blob.type.includes("webm") ? "webm" : "mp4";
  const storagePath = `${runId}/${slot}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(storagePath, blob, {
    contentType: blob.type || "video/webm",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

/** Persist a video URL to the DB for a given run + slot. */
async function saveVideoUrl(runId: string, slot: ArtifactSlot, url: string) {
  const col = slot === "fast" ? "video_fast_url" : slot === "follow" ? "video_follow_url" : "video_narrated_url";
  await supabase.from("playwright_run_artifacts").upsert({ run_id: runId, [col]: url } as never, { onConflict: "run_id" });
}

/** In dev: fetch a local artifact blob via the /__dev__/ endpoint. */
async function fetchLocalArtifactBlob(localUrl: string): Promise<Blob> {
  const res = await fetch(localUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch local artifact (${res.status})`);
  return res.blob();
}

// ─── component ────────────────────────────────────────────────────────────────

const ResearcherVideoRunDebug = () => {
  const navigate = useNavigate();
  const { isSuperAdmin, isGuestMode } = useResearcherAuth();

  const [rows, setRows] = useState<RunRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [detail, setDetail] = useState<VideoRunDebugRecord | null>(null);
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // per-slot upload state: { [runId+slot]: 'uploading' | 'done' | 'error' }
  const [uploadState, setUploadState] = useState<Record<string, "uploading" | "done" | "error">>({});
  const [autoUploadState, setAutoUploadState] = useState<"idle" | "running" | "done" | "error">("idle");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<{ runId: string; slot: ArtifactSlot } | null>(null);

  const selectedRow = useMemo(() => rows.find((r) => r.runId === selectedRunId) ?? null, [rows, selectedRunId]);

  // ── load manifest + DB state ──────────────────────────────────────────────

  const loadRuns = useCallback(async () => {
    setLoadingManifest(true);
    setError(null);
    try {
      const manifestRuns = await fetchManifest();
      const runIds = manifestRuns.map((r) => r.runId);
      const dbMap = await fetchDbRecords(runIds);

      const built: RunRow[] = manifestRuns.map((r) => {
        const db = dbMap[r.runId];
        // In dev the manifest already carries local /__dev__/ artifact URLs; in prod they're null until uploaded
        const devUrls = r.artifactUrls ?? {};
        return {
          runId: r.runId,
          flowId: r.flowId,
          createdAt: r.createdAt,
          ok: r.ok,
          syncModel: r.syncModel,
          debugFileName: r.debugFile,
          videoFastUrl: db?.video_fast_url ?? (IS_DEV ? (devUrls.fast ?? null) : null),
          videoFollowUrl: db?.video_follow_url ?? (IS_DEV ? (devUrls.follow ?? null) : null),
          videoNarratedUrl: db?.video_narrated_url ?? (IS_DEV ? (devUrls.narrated ?? null) : null),
        };
      });

      // Sort newest first
      built.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRows(built);
      setSelectedRunId((prev) => (prev && built.some((r) => r.runId === prev) ? prev : (built[0]?.runId ?? "")));

      // Auto-import new runs into DB (fire-and-forget; non-blocking)
      const missingInDb = manifestRuns.filter((r) => !dbMap[r.runId]);
      if (missingInDb.length > 0) {
        Promise.allSettled(missingInDb.map((r) => fetchDebugJson(r.debugFile)))
          .then((results) => {
            const parsed = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
            return upsertRunMetadata(parsed);
          })
          .catch(() => { /* non-blocking; ignore import errors */ });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    } finally {
      setLoadingManifest(false);
    }
  }, []);

  // ── load detail for selected run ─────────────────────────────────────────

  const loadDetail = useCallback(async (row: RunRow | null) => {
    if (!row) { setDetail(null); return; }
    setLoadingDetail(true);
    setError(null);
    try {
      const data = await fetchDebugJson(row.debugFileName);
      setDetail(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load debug record");
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => { void loadRuns(); }, [loadRuns]);
  useEffect(() => { void loadDetail(selectedRow); }, [loadDetail, selectedRow]);

  // ── manual upload via file picker ─────────────────────────────────────────

  const triggerManualUpload = (runId: string, slot: ArtifactSlot) => {
    pendingUpload.current = { runId, slot };
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingUpload.current) return;
    const { runId, slot } = pendingUpload.current;
    pendingUpload.current = null;
    e.target.value = "";

    const key = `${runId}:${slot}`;
    setUploadState((s) => ({ ...s, [key]: "uploading" }));
    try {
      const url = await uploadVideoToStorage(runId, slot, file);
      await saveVideoUrl(runId, slot, url);
      setRows((prev) => prev.map((r) => {
        if (r.runId !== runId) return r;
        return {
          ...r,
          videoFastUrl: slot === "fast" ? url : r.videoFastUrl,
          videoFollowUrl: slot === "follow" ? url : r.videoFollowUrl,
          videoNarratedUrl: slot === "narrated" ? url : r.videoNarratedUrl,
        };
      }));
      setUploadState((s) => ({ ...s, [key]: "done" }));
    } catch (err) {
      setUploadState((s) => ({ ...s, [key]: "error" }));
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  // ── auto-upload local artifacts (dev only) ────────────────────────────────

  const autoUploadLocal = useCallback(async () => {
    if (!IS_DEV) return;
    setAutoUploadState("running");
    setError(null);
    try {
      const slots: ArtifactSlot[] = ["fast", "follow", "narrated"];
      const tasks: Promise<void>[] = [];

      for (const row of rows) {
        const urlMap: Record<ArtifactSlot, string | null> = {
          fast: row.videoFastUrl,
          follow: row.videoFollowUrl,
          narrated: row.videoNarratedUrl,
        };

        for (const slot of slots) {
          const existing = urlMap[slot];
          // Only auto-upload if the current URL is a local /__dev__/ URL (not yet in cloud)
          if (!existing || !existing.startsWith("/__dev__/")) continue;

          const runId = row.runId;
          const localUrl = existing;
          const key = `${runId}:${slot}`;
          setUploadState((s) => ({ ...s, [key]: "uploading" }));

          tasks.push(
            fetchLocalArtifactBlob(localUrl)
              .then((blob) => uploadVideoToStorage(runId, slot, blob))
              .then((cloudUrl) => saveVideoUrl(runId, slot, cloudUrl).then(() => cloudUrl))
              .then((cloudUrl) => {
                setRows((prev) => prev.map((r) => {
                  if (r.runId !== runId) return r;
                  return {
                    ...r,
                    videoFastUrl: slot === "fast" ? cloudUrl : r.videoFastUrl,
                    videoFollowUrl: slot === "follow" ? cloudUrl : r.videoFollowUrl,
                    videoNarratedUrl: slot === "narrated" ? cloudUrl : r.videoNarratedUrl,
                  };
                }));
                setUploadState((s) => ({ ...s, [key]: "done" }));
              })
              .catch(() => {
                setUploadState((s) => ({ ...s, [key]: "error" }));
              })
          );
        }
      }

      await Promise.allSettled(tasks);
      setAutoUploadState("done");
    } catch {
      setAutoUploadState("error");
    }
  }, [rows]);

  // Count how many local-only videos exist (not yet in cloud)
  const pendingLocalCount = useMemo(() => {
    if (!IS_DEV) return 0;
    let count = 0;
    for (const row of rows) {
      if (row.videoFastUrl?.startsWith("/__dev__/")) count++;
      if (row.videoFollowUrl?.startsWith("/__dev__/")) count++;
      if (row.videoNarratedUrl?.startsWith("/__dev__/")) count++;
    }
    return count;
  }, [rows]);

  // ── access gate ───────────────────────────────────────────────────────────

  if (isGuestMode || !isSuperAdmin) {
    return (
      <div className="container mx-auto px-4 py-6">
        <Card>
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>This page is only available to super admins.</CardDescription>
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

  // ── render ────────────────────────────────────────────────────────────────

  const VideoSlot = ({ label, url, slot }: { label: string; url: string | null; slot: ArtifactSlot }) => {
    if (!selectedRow) return null;
    const key = `${selectedRow.runId}:${slot}`;
    const state = uploadState[key];
    const isCloud = url && !url.startsWith("/__dev__/");

    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{label}</CardTitle>
            <div className="flex items-center gap-2">
              {isCloud && <Badge className="bg-emerald-100 text-emerald-800 text-xs">cloud</Badge>}
              {url && !isCloud && <Badge className="bg-amber-100 text-amber-800 text-xs">local only</Badge>}
              {state === "uploading" && <Badge variant="outline" className="text-xs animate-pulse">uploading…</Badge>}
              {state === "done" && <Badge className="bg-emerald-100 text-emerald-800 text-xs">uploaded</Badge>}
              {state === "error" && <Badge className="bg-red-100 text-red-800 text-xs">upload failed</Badge>}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={state === "uploading"}
                onClick={() => triggerManualUpload(selectedRow.runId, slot)}
              >
                <Upload className="h-3 w-3 mr-1" />
                {url ? "Replace" : "Upload"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {url ? (
            <video className="w-full rounded border" controls src={url} />
          ) : (
            <div className="text-sm text-muted-foreground">
              No {label.toLowerCase()} artifact{IS_DEV ? " — run playwright or upload manually" : " — upload via button above"}.
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-4">
      {/* hidden file input shared across all upload slots */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.webm"
        className="hidden"
        onChange={(e) => void handleFileSelected(e)}
      />

      {/* header */}
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
                {IS_DEV && " • Running in local dev mode."}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {IS_DEV && pendingLocalCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void autoUploadLocal()}
                  disabled={autoUploadState === "running"}
                >
                  <CloudUpload className={`mr-2 h-4 w-4 ${autoUploadState === "running" ? "animate-pulse" : ""}`} />
                  {autoUploadState === "running"
                    ? "Uploading…"
                    : `Upload ${pendingLocalCount} local video${pendingLocalCount !== 1 ? "s" : ""} to cloud`}
                </Button>
              )}
              <Button variant="outline" onClick={() => navigate("/researcher/dashboard")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button variant="outline" onClick={() => void loadRuns()} disabled={loadingManifest}>
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
                {rows.length === 0 && <option value="">No runs found</option>}
                {rows.map((run) => (
                  <option key={run.runId} value={run.runId}>
                    {run.flowId} • {new Date(run.createdAt).toLocaleString()} {run.ok ? "✓" : "✗"}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-1 text-sm">
              <div className="text-muted-foreground">Status</div>
              <div className="flex gap-2 flex-wrap">
                {detail?.ok ? (
                  <Badge className="bg-emerald-100 text-emerald-800">PASS</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800">FAIL</Badge>
                )}
                {detail?.syncModel ? <Badge variant="outline">{detail.syncModel}</Badge> : null}
                {detail?.syncFallbackUsed ? <Badge className="bg-amber-100 text-amber-800">fallback</Badge> : null}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="text-muted-foreground">Run ID</div>
              <div className="text-xs truncate text-muted-foreground font-mono">{selectedRow?.runId || "-"}</div>
            </div>
          </div>
          {error ? (
            <div className="text-sm text-red-600 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          ) : null}
          {loadingDetail && <div className="text-sm text-muted-foreground">Loading run details…</div>}
        </CardContent>
      </Card>

      {/* video artifacts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <VideoSlot label="Narrated" url={selectedRow?.videoNarratedUrl ?? null} slot="narrated" />
        <VideoSlot label="Follow" url={selectedRow?.videoFollowUrl ?? null} slot="follow" />
        <VideoSlot label="Fast" url={selectedRow?.videoFastUrl ?? null} slot="fast" />
      </div>

      {/* phase progress + encoding stages */}
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

      {/* narration timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Narration Timeline</CardTitle>
          <CardDescription>Source vs scheduled timings, including compressed silent gaps.</CardDescription>
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
                <tr><td className="py-2 text-muted-foreground" colSpan={6}>No narration events found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* step timeline */}
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
                <tr><td className="py-2 text-muted-foreground" colSpan={4}>No step timeline entries found.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* issues */}
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
