import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_OUT_DIR = "playwright-recordings";
const MAX_DEBUG_RUNS = 60;
const DEFAULT_TTS = {
  enabled: false,
  voice: "Samantha",
  rate: 185,
  sync: "step-locked",
};

const DEFAULT_TIMING = {
  preStepMs: 1200,
  postActionMs: 700,
  completeHoldMs: 1800,
  introHoldMs: 3000,
  summaryHoldMs: 5000,
};

const OVERLAY_CONFIG = {
  titleTestId: "qa-overlay-title",
  stepTestId: "qa-overlay-step",
  counterTestId: "qa-overlay-counter",
  listTestId: "qa-overlay-list",
};

const parseDotenv = (raw) => {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
  return env;
};

const loadLocalEnv = async () => {
  const dotenvPath = path.join(process.cwd(), ".env.playwright.local");
  try {
    const raw = await fs.readFile(dotenvPath, "utf8");
    return parseDotenv(raw);
  } catch {
    return {};
  }
};

const parseArgs = (argv) => {
  const out = {
    baseUrl: DEFAULT_BASE_URL,
    outDir: DEFAULT_OUT_DIR,
    headless: true,
    auth: true,
    flow: "all",
    strategy: "preflight-first",
    maxAttempts: 8,
    noImproveThreshold: 2,
    recordOnPass: true,
    recordOnFailure: true,
    fast: false,
    postSlowdown: 1,
    profiles: "all",
    followSlowdown: 2.5,
    narratedBaseSlowdown: 3.0,
    narrationScope: "all",
    narrationGapMaxMs: 2000,
    timing: { ...DEFAULT_TIMING },
    tts: { ...DEFAULT_TTS },
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") out.baseUrl = String(argv[i + 1] ?? out.baseUrl);
    if (arg === "--out-dir") out.outDir = String(argv[i + 1] ?? out.outDir);
    if (arg === "--flow") out.flow = String(argv[i + 1] ?? out.flow);
    if (arg === "--headed") out.headless = false;
    if (arg === "--no-auth") out.auth = false;
    if (arg === "--strategy") out.strategy = String(argv[i + 1] ?? out.strategy);
    if (arg === "--max-attempts") out.maxAttempts = Number(argv[i + 1] ?? out.maxAttempts);
    if (arg === "--no-improve-threshold") out.noImproveThreshold = Number(argv[i + 1] ?? out.noImproveThreshold);
    if (arg === "--no-record-on-pass") out.recordOnPass = false;
    if (arg === "--record-on-pass") out.recordOnPass = true;
    if (arg === "--no-record-on-failure") out.recordOnFailure = false;
    if (arg === "--record-on-failure") out.recordOnFailure = true;
    if (arg === "--fast") out.fast = true;
    if (arg === "--post-slowdown") out.postSlowdown = Number(argv[i + 1] ?? out.postSlowdown);
    if (arg === "--profiles") out.profiles = String(argv[i + 1] ?? out.profiles);
    if (arg === "--follow-slowdown") out.followSlowdown = Number(argv[i + 1] ?? out.followSlowdown);
    if (arg === "--narrated-base-slowdown") {
      out.narratedBaseSlowdown = Number(argv[i + 1] ?? out.narratedBaseSlowdown);
    }
    if (arg === "--narration-scope") out.narrationScope = String(argv[i + 1] ?? out.narrationScope);
    if (arg === "--narration-gap-max-ms") out.narrationGapMaxMs = Number(argv[i + 1] ?? out.narrationGapMaxMs);
    if (arg === "--pre-step-ms") out.timing.preStepMs = Number(argv[i + 1] ?? out.timing.preStepMs);
    if (arg === "--post-action-ms") out.timing.postActionMs = Number(argv[i + 1] ?? out.timing.postActionMs);
    if (arg === "--complete-hold-ms") out.timing.completeHoldMs = Number(argv[i + 1] ?? out.timing.completeHoldMs);
    if (arg === "--intro-hold-ms") out.timing.introHoldMs = Number(argv[i + 1] ?? out.timing.introHoldMs);
    if (arg === "--summary-hold-ms") out.timing.summaryHoldMs = Number(argv[i + 1] ?? out.timing.summaryHoldMs);
    if (arg === "--with-tts") out.tts.enabled = true;
    if (arg === "--tts-voice") out.tts.voice = String(argv[i + 1] ?? out.tts.voice);
    if (arg === "--tts-rate") out.tts.rate = Number(argv[i + 1] ?? out.tts.rate);
    if (arg === "--tts-sync") out.tts.sync = String(argv[i + 1] ?? out.tts.sync);
  }

  out.maxAttempts = Number.isFinite(out.maxAttempts) ? Math.max(1, Math.floor(out.maxAttempts)) : 8;
  out.noImproveThreshold = Number.isFinite(out.noImproveThreshold)
    ? Math.max(1, Math.floor(out.noImproveThreshold))
    : 2;
  if (!["preflight-first", "record-only"].includes(out.strategy)) out.strategy = "preflight-first";
  if (!["step-locked", "soft", "stretch"].includes(out.tts.sync)) out.tts.sync = "step-locked";
  if (!["key", "all", "intro-summary"].includes(out.narrationScope)) out.narrationScope = "key";
  out.postSlowdown = Number.isFinite(out.postSlowdown) ? Math.max(1, out.postSlowdown) : 1;
  out.followSlowdown = Number.isFinite(out.followSlowdown) ? Math.max(1, out.followSlowdown) : 2.5;
  out.narratedBaseSlowdown = Number.isFinite(out.narratedBaseSlowdown)
    ? Math.max(1, out.narratedBaseSlowdown)
    : 3.0;
  out.narrationGapMaxMs = Number.isFinite(out.narrationGapMaxMs)
    ? Math.max(100, Math.floor(out.narrationGapMaxMs))
    : 2000;
  if (Number.isFinite(out.postSlowdown) && out.postSlowdown > 1 && !argv.includes("--follow-slowdown")) {
    out.followSlowdown = out.postSlowdown;
  }
  if (out.fast) {
    out.timing.preStepMs = 180;
    out.timing.postActionMs = 120;
    out.timing.completeHoldMs = 350;
    out.timing.introHoldMs = 600;
    out.timing.summaryHoldMs = 1200;
  }

  return out;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const nowIso = () => new Date().toISOString();

const makeRunId = (flowId) => `${flowId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const toRelativePath = (candidate, baseDir) => {
  if (!candidate) return null;
  const rel = path.relative(baseDir, candidate);
  return rel.startsWith("..") ? path.basename(candidate) : rel;
};

const createDebugContext = (flowId, outDir) => ({
  flowId,
  outDir,
  runId: makeRunId(flowId),
  createdAt: nowIso(),
  progressPhases: [],
  ffmpegStages: [],
  narrationSkippedSteps: [],
});

const startPhase = (debug, phase, percentStart, percentEnd) => {
  const row = {
    phase,
    percentStart,
    percentEnd,
    startedAtMs: Date.now(),
    endedAtMs: null,
  };
  debug.progressPhases.push(row);
  console.error(`[progress] ${debug.flowId} ${phase} ${percentStart}%`);
  return row;
};

const endPhase = (debug, phaseRow) => {
  if (!phaseRow || phaseRow.endedAtMs !== null) return;
  phaseRow.endedAtMs = Date.now();
  console.error(`[progress] ${debug.flowId} ${phaseRow.phase} ${phaseRow.percentEnd}%`);
};

const withPhase = async (debug, phase, percentStart, percentEnd, fn) => {
  const row = startPhase(debug, phase, percentStart, percentEnd);
  try {
    return await fn();
  } finally {
    endPhase(debug, row);
  }
};

const pushStageTiming = (debug, stage) => {
  debug.ffmpegStages.push(stage);
};

const runCommand = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => reject(error));
  child.on("close", (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${cmd} exited with code ${code}. ${stderr.trim()}`.trim()));
  });
});

const runCommandTimed = async ({ cmd, args, debug, label }) => {
  const startedAtMs = Date.now();
  await runCommand(cmd, args);
  if (debug) {
    const endedAtMs = Date.now();
    pushStageTiming(debug, {
      label: label || cmd,
      command: `${cmd} ${args.join(" ")}`,
      startedAtMs,
      endedAtMs,
      durationMs: Math.max(0, endedAtMs - startedAtMs),
    });
  }
};

const runCommandCapture = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => reject(error));
  child.on("close", (code) => {
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`${cmd} exited with code ${code}. ${stderr.trim()}`.trim()));
  });
});

const estimateSpeechDurationMs = async (text, ttsConfig, outDir) => {
  const safe = String(text || "").trim();
  if (!safe) return 0;
  const tempAiff = path.join(outDir, `.tts-estimate-${Date.now()}-${Math.random().toString(36).slice(2)}.aiff`);
  try {
    await runCommand("say", ["-v", String(ttsConfig.voice), "-r", String(ttsConfig.rate), "-o", tempAiff, "--", safe]);
    const { stdout } = await runCommandCapture("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      tempAiff,
    ]);
    const sec = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    return Math.round(sec * 1000);
  } catch {
    return 0;
  } finally {
    await fs.unlink(tempAiff).catch(() => {});
  }
};

const getMediaDurationMs = async (filePath) => {
  const { stdout } = await runCommandCapture("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const sec = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.round(sec * 1000);
};

const toErrorMessage = (error) => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const getVisibleAuthErrors = async (page) => {
  const possibleErrors = [
    page.locator("[role='alert']"),
    page.locator("text=/invalid|incorrect|error|failed|unauthorized/i"),
  ];

  for (const locator of possibleErrors) {
    const count = await locator.count().catch(() => 0);
    if (!count) continue;
    const values = [];
    const take = Math.min(count, 3);
    for (let i = 0; i < take; i += 1) {
      const text = await locator.nth(i).innerText().catch(() => "");
      const trimmed = text.trim();
      if (trimmed) values.push(trimmed);
    }
    if (values.length) return values;
  }

  return [];
};

const classifyErrorClass = ({ errMsg, finalUrl, failedStep }) => {
  const text = `${errMsg || ""} ${failedStep || ""} ${finalUrl || ""}`.toLowerCase();
  const normalizedUrl = String(finalUrl || "").toLowerCase();
  if (
    normalizedUrl.endsWith("/researcher") ||
    normalizedUrl.endsWith("/researcher/") ||
    text.includes("login failed")
  ) return "auth";
  if (text.includes("waitforurl") || text.includes("navigation") || text.includes("route") || text.includes("redirect")) {
    return "navigation";
  }
  if (
    text.includes("locator") ||
    text.includes("selector") ||
    text.includes("no response rows") ||
    text.includes("not found") ||
    text.includes("strict mode")
  ) return "selector";
  if (text.includes("assert") || text.includes("expect")) return "assertion";
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  return "unknown";
};

const ERROR_SEVERITY = {
  auth: 6,
  navigation: 5,
  selector: 4,
  assertion: 3,
  timeout: 2,
  unknown: 1,
};

const compareAttemptProgress = (prev, next) => {
  if (!prev) return "improved";
  if (next.ok && !prev.ok) return "improved";
  if (prev.ok && !next.ok) return "regressed";
  if (next.furthestStepIndex > prev.furthestStepIndex) return "improved";
  if (next.furthestStepIndex < prev.furthestStepIndex) return "regressed";
  if (next.failedStepOrdinal > prev.failedStepOrdinal) return "improved";
  if (next.failedStepOrdinal < prev.failedStepOrdinal) return "regressed";
  if ((next.errorSeverity ?? 0) < (prev.errorSeverity ?? 0)) return "improved";
  if ((next.errorSeverity ?? 0) > (prev.errorSeverity ?? 0)) return "regressed";
  if ((next.errorSignature || "") !== (prev.errorSignature || "")) return "improved";
  return "no_change";
};

const inferFailureExplanations = ({ errMsg, finalUrl, failedStep, errorClass }) => {
  const explanations = [];
  const lowerErr = String(errMsg || "").toLowerCase();
  const lowerUrl = String(finalUrl || "").toLowerCase();

  if (errorClass === "auth" || (lowerUrl.includes("/researcher") && !lowerUrl.includes("/researcher/dashboard"))) {
    explanations.push("Authentication may have failed due to invalid credentials in .env.playwright.local.");
    explanations.push("Auth transition may be delayed; dashboard redirect might not have completed in time.");
    explanations.push("Login selectors may have changed and no longer match expected fields/buttons.");
  }
  if (lowerErr.includes("no response rows")) {
    explanations.push("The selected dataset may currently have no rows available.");
    explanations.push("A different data source tab may be active (Participants vs Researchers/All).");
    explanations.push("Status or batch filters may be hiding rows.");
  }
  if (
    lowerErr.includes("add to backlog") ||
    lowerErr.includes("save backlog") ||
    lowerErr.includes("dialog") ||
    (errorClass === "selector" && String(failedStep || "").toLowerCase().includes("dialog"))
  ) {
    explanations.push("UI labels or selectors may have changed for the modal/dialog controls.");
    explanations.push("Dialog may not have opened due to earlier click timing/race conditions.");
  }
  if (errorClass === "navigation" || lowerErr.includes("url")) {
    explanations.push("Route transition may be slower than expected in this environment.");
    explanations.push("Click target may be stale, causing navigation to not start.");
  }
  if (!explanations.length) {
    explanations.push("The failure does not match a known pattern; check the failing step and final URL for drift.");
    explanations.push("Recent UI or data changes may require updated selectors or wait conditions.");
  }
  return explanations.slice(0, 4);
};

const buildAttemptHints = (attemptNumber, previousAttempt) => {
  const hints = {
    authExtraWaitMs: Math.max(0, (attemptNumber - 1) * 300),
    aggressiveRowsRefresh: false,
    extraNavigationSettleMs: 0,
    retryModalOpen: false,
  };
  if (!previousAttempt) return hints;
  if (previousAttempt.errorClass === "auth") hints.authExtraWaitMs += 1000;
  if (previousAttempt.errorClass === "navigation") hints.extraNavigationSettleMs += 1200;
  if (previousAttempt.errorClass === "selector") hints.retryModalOpen = true;
  if (String(previousAttempt.errMsg || "").toLowerCase().includes("no response rows")) hints.aggressiveRowsRefresh = true;
  return hints;
};

const installOverlayInitScript = async (context) => {
  await context.addInitScript(({ titleTestId, stepTestId, counterTestId, listTestId }) => {
    const ROOT_ID = "qa-overlay-root";
    const normalizeLines = (value) => Array.isArray(value) ? value.map((x) => String(x)) : [];
    const renderList = (container, rows = []) => {
      const list = document.createElement("ul");
      list.dataset.testid = listTestId;
      list.style.margin = "0";
      list.style.paddingLeft = "18px";
      list.style.fontSize = "12px";
      list.style.lineHeight = "1.55";
      for (const row of rows) {
        const li = document.createElement("li");
        li.textContent = row;
        list.appendChild(li);
      }
      container.appendChild(list);
    };
    const setSharedRootStyle = (root) => {
      root.style.position = "fixed";
      root.style.zIndex = "2147483647";
      root.style.pointerEvents = "none";
      root.style.color = "#ffffff";
      root.style.fontFamily = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
      root.style.boxShadow = "0 16px 40px rgba(0,0,0,0.35)";
      root.style.background = "rgba(16, 24, 40, 0.90)";
      root.style.border = "1px solid rgba(148, 163, 184, 0.25)";
    };
    const renderCompact = (root, state) => {
      root.style.top = "12px";
      root.style.right = "12px";
      root.style.left = "";
      root.style.bottom = "";
      root.style.transform = "";
      root.style.maxWidth = "520px";
      root.style.minWidth = "360px";
      root.style.padding = "12px 14px";
      root.style.borderRadius = "12px";

      const title = document.createElement("div");
      title.dataset.testid = titleTestId;
      title.style.fontSize = "13px";
      title.style.fontWeight = "700";
      title.style.marginBottom = "4px";
      title.textContent = state.title || "Flow";
      root.appendChild(title);

      const counter = document.createElement("div");
      counter.dataset.testid = counterTestId;
      counter.style.fontSize = "12px";
      counter.style.opacity = "0.88";
      counter.style.marginBottom = "6px";
      counter.textContent = state.stepCounter || "";
      root.appendChild(counter);

      const step = document.createElement("div");
      step.dataset.testid = stepTestId;
      step.style.fontSize = "12px";
      step.style.fontWeight = "600";
      step.style.marginBottom = "6px";
      step.textContent = state.step || "Preparing...";
      root.appendChild(step);

      const completed = normalizeLines(state.completedSteps);
      if (completed.length) {
        const completedTitle = document.createElement("div");
        completedTitle.style.fontSize = "11px";
        completedTitle.style.opacity = "0.85";
        completedTitle.style.marginBottom = "4px";
        completedTitle.textContent = "Completed Steps";
        root.appendChild(completedTitle);
        renderList(root, completed.slice(-10));
      }
    };
    const renderCenterCard = (root, state, summaryMode) => {
      root.style.top = "50%";
      root.style.left = "50%";
      root.style.right = "";
      root.style.bottom = "";
      root.style.transform = "translate(-50%, -50%)";
      root.style.maxWidth = "900px";
      root.style.minWidth = "680px";
      root.style.padding = "24px 28px";
      root.style.borderRadius = "18px";

      const title = document.createElement("div");
      title.dataset.testid = titleTestId;
      title.style.fontSize = summaryMode ? "26px" : "24px";
      title.style.fontWeight = "800";
      title.style.marginBottom = "10px";
      title.style.lineHeight = "1.2";
      title.textContent = summaryMode ? (state.summaryTitle || "Run Summary") : (state.introTitle || "What This Video Tests");
      root.appendChild(title);

      const subtitle = document.createElement("div");
      subtitle.dataset.testid = stepTestId;
      subtitle.style.fontSize = summaryMode ? "18px" : "16px";
      subtitle.style.opacity = "0.95";
      subtitle.style.marginBottom = "12px";
      subtitle.style.lineHeight = "1.35";
      subtitle.textContent = summaryMode ? (state.summarySubtitle || "") : (state.introBody || "");
      root.appendChild(subtitle);

      const rows = summaryMode ? normalizeLines(state.summaryLines) : normalizeLines(state.introLines);
      if (rows.length) {
        renderList(root, rows);
      }
    };

    const ensureOverlay = () => {
      const state = window.__qaOverlayState || { title: "Flow", step: "Preparing...", mode: "compact" };
      window.__qaOverlayState = state;

      if (!document.body) {
        requestAnimationFrame(ensureOverlay);
        return;
      }

      let root = document.getElementById(ROOT_ID);
      if (!root) {
        root = document.createElement("div");
        root.id = ROOT_ID;
        document.body.appendChild(root);
      }
      setSharedRootStyle(root);
      root.replaceChildren();

      if (state.mode === "intro") {
        renderCenterCard(root, state, false);
      } else if (state.mode === "summary") {
        renderCenterCard(root, state, true);
      } else {
        renderCompact(root, state);
      }
    };

    window.__qaOverlayApply = (patch = {}) => {
      const prev = window.__qaOverlayState || {
        title: "Flow",
        step: "Preparing...",
        mode: "compact",
        completedSteps: [],
      };
      window.__qaOverlayState = { ...prev, ...patch };
      ensureOverlay();
    };

    ensureOverlay();
  }, OVERLAY_CONFIG);
};

const applyOverlayState = async (page, overlayState) => {
  await page
    .evaluate((next) => {
      if (typeof window.__qaOverlayApply === "function") {
        window.__qaOverlayApply(next);
      }
    }, overlayState)
    .catch(() => {});
};

const setFlowTitle = async (page, text, overlayState) => {
  overlayState.title = text;
  await applyOverlayState(page, overlayState);
};

const setStepText = async (page, text, overlayState) => {
  overlayState.step = text;
  await applyOverlayState(page, overlayState);
};

const markComplete = async (page, overlayState, text = "Completed") => {
  await setStepText(page, text, overlayState);
};

const showIntro = async (page, flow, overlayState, timing, runState, ttsConfig, outDir) => {
  overlayState.mode = "intro";
  overlayState.introTitle = flow.introTitle || `What This Video Tests: ${flow.title}`;
  overlayState.introBody = flow.introBody || "This recording demonstrates each action step by step.";
  overlayState.introLines = flow.introLines || [];
  overlayState.step = "Starting soon...";
  overlayState.stepCounter = runState.totalSteps ? `Total steps: ${runState.totalSteps}` : "";
  await applyOverlayState(page, overlayState);
  const introScript = [overlayState.introBody, ...(overlayState.introLines || [])].filter(Boolean).join(". ");
  const introSpeechMs = ttsConfig.enabled && ["step-locked", "stretch"].includes(ttsConfig.sync)
    ? await estimateSpeechDurationMs(introScript, ttsConfig, outDir)
    : 0;
  await delay(Math.max(timing.introHoldMs, introSpeechMs + 300));
  overlayState.mode = "compact";
  overlayState.step = "Starting now...";
  await applyOverlayState(page, overlayState);
  await delay(400);
};

const showSummary = async (page, overlayState, timing, runState, ok, errMsg, failureExplanations, ttsConfig, outDir) => {
  overlayState.mode = "summary";
  overlayState.summaryTitle = ok ? "Run Complete ✅" : "Run Completed With Issues ⚠️";
  overlayState.summarySubtitle = ok
    ? "All planned steps finished successfully."
    : `The flow stopped at: ${runState.currentStep || "Unknown step"}`;
  const lines = [];
  lines.push(`Completed steps: ${runState.completedSteps.length}/${runState.totalSteps || runState.completedSteps.length}`);
  for (const item of runState.completedSteps) lines.push(`✅ ${item}`);
  if (!ok && runState.currentStep) lines.push(`⚠️ Failed step: ${runState.currentStep}`);
  if (!ok && Array.isArray(failureExplanations) && failureExplanations.length) {
    lines.push("Possible explanations:");
    for (const reason of failureExplanations.slice(0, 4)) lines.push(`• ${reason}`);
  }
  if (!ok) lines.push(`❌ ${errMsg || "Unknown error"}`);
  overlayState.summaryLines = lines;
  await applyOverlayState(page, overlayState);
  const summaryScript = [overlayState.summarySubtitle, ...lines].filter(Boolean).join(". ");
  const summarySpeechMs = ttsConfig.enabled && ["step-locked", "stretch"].includes(ttsConfig.sync)
    ? await estimateSpeechDurationMs(summaryScript, ttsConfig, outDir)
    : 0;
  await delay(Math.max(timing.summaryHoldMs, summarySpeechMs + 300));
  overlayState.mode = "compact";
  await applyOverlayState(page, overlayState);
};

const createStepHelper = (page, timing, runState, overlayState, options = {}) => async (text, actionFn, opts = {}) => {
  const mode = options.mode || "record";
  const ttsConfig = options.ttsConfig || DEFAULT_TTS;
  const outDir = options.outDir || DEFAULT_OUT_DIR;
  runState.currentStep = text;
  runState.stepIndex += 1;
  runState.furthestStepIndex = Math.max(runState.furthestStepIndex || 0, runState.stepIndex);
  overlayState.mode = "compact";
  overlayState.stepCounter = runState.totalSteps
    ? `Step ${runState.stepIndex}/${runState.totalSteps}`
    : `Step ${runState.stepIndex}`;
  overlayState.step = `In progress: ${text}`;
  overlayState.completedSteps = [...runState.completedSteps];
  if (mode === "record") {
    await applyOverlayState(page, overlayState);
  }

  const sourceStartMs = Math.max(0, Date.now() - runState.flowStartedAtMs);
  runState.events.push({ type: "step_start", label: text, sourceMs: sourceStartMs });

  let preDelayMs = opts.preStepMs ?? timing.preStepMs;
  let postDelayMs = opts.postActionMs ?? timing.postActionMs;
  let narrationMs = 0;
  if (mode === "record" && ttsConfig.enabled && ["step-locked", "stretch"].includes(ttsConfig.sync)) {
    const line = `Step ${runState.stepIndex} of ${runState.totalSteps || runState.stepIndex}. ${text}.`;
    const speechMs = await estimateSpeechDurationMs(line, ttsConfig, outDir);
    if (speechMs > 0) {
      narrationMs = speechMs;
      if (ttsConfig.sync === "stretch") {
        preDelayMs = Math.max(350, Math.round(speechMs * 0.5));
        postDelayMs = Math.max(350, Math.round(speechMs * 0.5));
      } else {
        preDelayMs = Math.max(500, Math.round(speechMs * 0.4));
        postDelayMs = Math.max(timing.postActionMs, speechMs - preDelayMs);
      }
    }
  } else if (mode === "preflight") {
    preDelayMs = Math.min(220, preDelayMs);
    postDelayMs = Math.min(180, postDelayMs);
  }

  const startedAt = Date.now();
  await delay(preDelayMs);
  await actionFn();
  runState.completedSteps.push(text);
  overlayState.completedSteps = runState.completedSteps.map((item) => `✅ ${item}`);
  overlayState.step = `Done: ${text} ✅`;
  if (mode === "record") {
    await applyOverlayState(page, overlayState);
  }
  await delay(postDelayMs);
  const actualMs = Date.now() - startedAt;
  const sourceEndMs = Math.max(sourceStartMs, Date.now() - runState.flowStartedAtMs);
  runState.events.push({ type: "step_done", label: text, sourceMs: sourceEndMs });
  runState.timeline.push({
    step: text,
    stepStartMs: sourceStartMs,
    stepEndMs: sourceEndMs,
    plannedMs: preDelayMs + postDelayMs,
    actualMs,
    narrationMs,
  });
};

const isKeyNarrationStep = (stepLabel) => {
  const s = String(stepLabel || "").toLowerCase();
  return (
    s.includes("open researcher dashboard") ||
    s.includes("open backlog") ||
    s.includes("open responses tab") ||
    s.includes("open first response details") ||
    s.includes("save backlog item") ||
    s.includes("save notes") ||
    s.includes("add pending/abandoned record to backlog")
  );
};

const buildNarrationEvents = ({
  flow,
  runState,
  ok,
  errMsg,
  failureExplanations = [],
  scope = "key",
}) => {
  const events = [];
  const skippedSteps = [];
  const introText = flow.introBody || flow.title;
  const introDetails = Array.isArray(flow.introLines) ? flow.introLines.join(". ") : "";
  events.push({
    label: "intro",
    text: `This video tests the following flow. ${introText}${introDetails ? `. ${introDetails}` : ""}`,
    sourceMs: 0,
  });

  const stepTimelines = Array.isArray(runState.timeline) ? runState.timeline : [];
  for (let i = 0; i < stepTimelines.length; i += 1) {
    const row = stepTimelines[i];
    const shouldInclude = scope === "all" || (scope === "key" && isKeyNarrationStep(row.step));
    if (!shouldInclude) {
      skippedSteps.push({
        step: row.step,
        reason: scope === "intro-summary"
          ? "Narration scope excludes step narration."
          : "Step not matched by key narration filter.",
      });
      continue;
    }
    const total = runState.totalSteps || stepTimelines.length;
    events.push({
      label: `step_${i + 1}`,
      text: `Step ${i + 1} of ${total}. ${row.step}.`,
      sourceMs: row.stepStartMs ?? row.stepEndMs ?? 0,
    });
  }

  if (!ok) {
    events.push({
      label: "failure",
      text: `The run failed at step: ${runState.currentStep || "unknown step"}.`,
      sourceMs: Math.max(0, runState.events?.find((e) => e.type === "failure")?.sourceMs ?? 0),
    });
    if (failureExplanations.length) {
      events.push({
        label: "failure_explanations",
        text: `Possible explanations. ${failureExplanations.slice(0, 4).join(". ")}`,
        sourceMs: Math.max(0, runState.events?.find((e) => e.type === "summary_start")?.sourceMs ?? 0),
      });
    }
  }

  events.push({
    label: "summary",
    text: ok
      ? `Summary. All ${runState.completedSteps.length} steps completed successfully.`
      : `Summary. ${runState.completedSteps.length} steps completed before failure.${errMsg ? ` Error detail: ${errMsg}.` : ""}`,
    sourceMs: Math.max(0, runState.events?.find((e) => e.type === "summary_start")?.sourceMs ?? 0),
  });
  if (scope === "intro-summary") {
    return {
      events: events.filter((e) => e.label === "intro" || e.label.startsWith("failure") || e.label === "summary"),
      skippedSteps,
    };
  }
  return { events, skippedSteps };
};

const SERIAL_NARRATION_MIN_GAP_MS = 150;
const SERIAL_NARRATION_MAX_GAP_MS = 2000;

const synthesizeNarrationClips = async ({
  events,
  ttsConfig,
  tempDir,
  narratedBaseSlowdown,
  debug,
}) => {
  const speechWavs = [];
  const narrationEvents = [];
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const speechAiff = path.join(tempDir, `speech-${i + 1}.aiff`);
    const speechWav = path.join(tempDir, `speech-${i + 1}.wav`);
    await runCommand("say", ["-v", String(ttsConfig.voice), "-r", String(ttsConfig.rate), "-o", speechAiff, "--", ev.text]);
    await runCommandTimed({
      cmd: "ffmpeg",
      args: ["-y", "-i", speechAiff, "-ar", "48000", "-ac", "2", speechWav],
      debug,
      label: `tts-aiff-to-wav:${ev.label}`,
    });
    speechWavs.push(speechWav);

    const clipDurationMs = await getMediaDurationMs(speechWav);
    const sourceMs = Math.max(0, ev.sourceMs || 0);
    const narratedMs = Math.max(0, Math.round(sourceMs * narratedBaseSlowdown));
    narrationEvents.push({
      label: ev.label,
      sourceMs,
      narratedMs,
      clipDurationMs,
      scheduledStartMs: narratedMs,
      scheduledEndMs: narratedMs + clipDurationMs,
      gapCompressedMs: 0,
    });
  }
  return { speechWavs, narrationEvents };
};

const buildSerialNarrationSchedule = (
  events,
  minGapMs = SERIAL_NARRATION_MIN_GAP_MS,
  maxGapMs = SERIAL_NARRATION_MAX_GAP_MS
) => {
  const scheduled = [];
  let lastEndMs = 0;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const clipDurationMs = Math.max(0, Math.round(ev.clipDurationMs || 0));
    const desiredStartMs = Math.max(0, Math.round(ev.narratedMs || 0));
    let scheduledStartMs = desiredStartMs;
    let gapCompressedMs = 0;
    if (i > 0) {
      const minGap = Math.max(0, Math.round(minGapMs));
      const maxGap = Math.max(minGap, Math.round(maxGapMs));
      const desiredGap = Math.max(0, desiredStartMs - lastEndMs);
      const boundedGap = Math.min(maxGap, Math.max(minGap, desiredGap));
      scheduledStartMs = lastEndMs + boundedGap;
      gapCompressedMs = Math.max(0, desiredGap - boundedGap);
    }
    const scheduledEndMs = scheduledStartMs + clipDurationMs;
    scheduled.push({
      ...ev,
      clipDurationMs,
      scheduledStartMs,
      scheduledEndMs,
      gapCompressedMs,
    });
    lastEndMs = scheduledEndMs;
  }
  return scheduled;
};

const retimeVideoByEventSchedule = async ({
  inputPath,
  outputPath,
  narrationEvents,
  debug,
}) => {
  if (!Array.isArray(narrationEvents) || !narrationEvents.length) {
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }

  const durationMs = await getMediaDurationMs(inputPath);
  const durationSec = Math.max(0.05, durationMs / 1000);
  const anchors = [{ sourceMs: 0, targetMs: 0 }];
  for (const ev of narrationEvents) {
    anchors.push({
      sourceMs: Math.max(0, Math.round(ev.narratedMs || 0)),
      targetMs: Math.max(0, Math.round(ev.scheduledStartMs || 0)),
    });
  }
  const last = narrationEvents[narrationEvents.length - 1];
  const netShiftMs = Math.round((last?.scheduledStartMs || 0) - (last?.narratedMs || 0));
  const targetEndMs = Math.max(
    Math.round(durationMs + netShiftMs),
    Math.round((last?.scheduledEndMs || 0) + 500),
    500
  );
  anchors.push({
    sourceMs: Math.round(durationMs),
    targetMs: targetEndMs,
  });

  anchors.sort((a, b) => a.sourceMs - b.sourceMs);
  const normalized = [];
  let prevSource = -1;
  let prevTarget = -1;
  for (const anchor of anchors) {
    const sourceMs = Math.max(0, Math.round(anchor.sourceMs));
    const targetMs = Math.max(0, Math.round(anchor.targetMs));
    if (sourceMs <= prevSource) continue;
    const safeTarget = normalized.length
      ? Math.max(targetMs, prevTarget + 1)
      : targetMs;
    normalized.push({ sourceMs, targetMs: safeTarget });
    prevSource = sourceMs;
    prevTarget = safeTarget;
  }
  if (normalized.length < 2) {
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }

  const filterParts = [];
  const concatInputs = [];
  let segmentIndex = 0;
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const curr = normalized[i];
    const next = normalized[i + 1];
    const inStart = Math.max(0, Math.min(durationSec, curr.sourceMs / 1000));
    const inEnd = Math.max(0, Math.min(durationSec, next.sourceMs / 1000));
    const inDur = inEnd - inStart;
    if (inDur < 0.0005) continue;
    const outDur = Math.max(0.001, (next.targetMs - curr.targetMs) / 1000);
    const setptsFactor = outDur / inDur;
    const label = `v${segmentIndex}`;
    segmentIndex += 1;
    filterParts.push(
      `[0:v]trim=start=${inStart.toFixed(6)}:end=${inEnd.toFixed(6)},setpts=${setptsFactor.toFixed(6)}*(PTS-STARTPTS)[${label}]`
    );
    concatInputs.push(`[${label}]`);
  }

  if (!concatInputs.length || !filterParts.length) {
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }

  filterParts.push(`${concatInputs.join("")}concat=n=${concatInputs.length}:v=1:a=0[vout]`);

  await runCommandTimed({
    cmd: "ffmpeg",
    args: [
      "-y",
      "-i",
      inputPath,
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "[vout]",
      "-an",
      "-c:v",
      "libvpx-vp9",
      outputPath,
    ],
    debug,
    label: "retime-video-to-narration",
  });
  return outputPath;
};

const renderNarrationAudioTrack = async ({
  baseVideoPath,
  speechWavs,
  narrationEvents,
  outputPath,
  debug,
}) => {
  if (!speechWavs.length) {
    await fs.copyFile(baseVideoPath, outputPath);
    return outputPath;
  }

  const ffmpegArgs = ["-y", "-i", baseVideoPath];
  for (const wavPath of speechWavs) ffmpegArgs.push("-i", wavPath);

  const filterParts = [];
  const mixInputs = [];
  for (let i = 0; i < speechWavs.length; i += 1) {
    const startMs = Math.max(0, Math.round(narrationEvents[i].scheduledStartMs || 0));
    filterParts.push(`[${i + 1}:a]adelay=${startMs}|${startMs}[a${i}]`);
    mixInputs.push(`[a${i}]`);
  }
  filterParts.push(`${mixInputs.join("")}amix=inputs=${speechWavs.length}:normalize=0,apad[aout]`);

  ffmpegArgs.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "0:v:0",
    "-map",
    "[aout]",
    "-c:v",
    "copy",
    "-c:a",
    "libopus",
    "-shortest",
    outputPath,
  );
  await runCommandTimed({
    cmd: "ffmpeg",
    args: ffmpegArgs,
    debug,
    label: "mux-narration-audio",
  });
  return outputPath;
};

const renderEventAlignedNarratedVideo = async ({
  inputFastPath,
  outputNarratedPath,
  flow,
  runState,
  ok,
  errMsg,
  failureExplanations,
  ttsConfig,
  narrationScope,
  narratedBaseSlowdown,
  outDir,
  debug = createDebugContext(flow.id, outDir),
}) => {
  const tempDir = path.join(outDir, `.tts-aligned-${flow.id}-${Date.now()}`);
  const slowedVideoPath = path.join(tempDir, `${flow.id}.slowed.webm`);
  const { events, skippedSteps } = buildNarrationEvents({
    flow,
    runState,
    ok,
    errMsg,
    failureExplanations,
    scope: narrationScope,
  });

  await fs.mkdir(tempDir, { recursive: true });
  await withPhase(debug, "slowdown_render", 55, 65, async () => {
    await renderSlowedVideo({
      inputPath: inputFastPath,
      outputPath: slowedVideoPath,
      slowdownFactor: narratedBaseSlowdown,
      keepAudio: false,
      debug,
      stageLabel: "slowdown-event-aligned",
    });
  });

  const { speechWavs, narrationEvents } = await withPhase(debug, "tts_generation", 65, 80, async () => {
    return synthesizeNarrationClips({
      events,
      ttsConfig,
      tempDir,
      narratedBaseSlowdown,
      debug,
    });
  });
  if (Array.isArray(skippedSteps) && skippedSteps.length) debug.narrationSkippedSteps.push(...skippedSteps);

  if (!speechWavs.length) {
    await fs.copyFile(slowedVideoPath, outputNarratedPath);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    return {
      outputPath: outputNarratedPath,
      narrationEvents,
      syncModel: "event-aligned",
      narrationOverlapResolved: false,
      syncFallbackUsed: false,
    };
  }

  await renderNarrationAudioTrack({
    baseVideoPath: slowedVideoPath,
    speechWavs,
    narrationEvents,
    outputPath: outputNarratedPath,
    debug,
  });
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  return {
    outputPath: outputNarratedPath,
    narrationEvents,
    syncModel: "event-aligned",
    narrationOverlapResolved: false,
    syncFallbackUsed: false,
  };
};

const renderSerialGatedNarratedVideo = async ({
  inputFastPath,
  outputNarratedPath,
  flow,
  runState,
  ok,
  errMsg,
  failureExplanations,
  ttsConfig,
  narrationScope,
  narratedBaseSlowdown,
  outDir,
  narrationGapMaxMs,
  debug = createDebugContext(flow.id, outDir),
}) => {
  const tempDir = path.join(outDir, `.tts-serial-${flow.id}-${Date.now()}`);
  const slowedVideoPath = path.join(tempDir, `${flow.id}.slowed.webm`);
  const serialVideoPath = path.join(tempDir, `${flow.id}.serial.webm`);
  const { events, skippedSteps } = buildNarrationEvents({
    flow,
    runState,
    ok,
    errMsg,
    failureExplanations,
    scope: narrationScope,
  });
  if (Array.isArray(skippedSteps) && skippedSteps.length) debug.narrationSkippedSteps.push(...skippedSteps);

  await fs.mkdir(tempDir, { recursive: true });
  await withPhase(debug, "slowdown_render", 55, 65, async () => {
    await renderSlowedVideo({
      inputPath: inputFastPath,
      outputPath: slowedVideoPath,
      slowdownFactor: narratedBaseSlowdown,
      keepAudio: false,
      debug,
      stageLabel: "slowdown-serial",
    });
  });

  const { speechWavs, narrationEvents: baseEvents } = await withPhase(debug, "tts_generation", 65, 80, async () => {
    return synthesizeNarrationClips({
      events,
      ttsConfig,
      tempDir,
      narratedBaseSlowdown,
      debug,
    });
  });
  const narrationEvents = await withPhase(debug, "serial_schedule_build", 80, 86, async () => (
    buildSerialNarrationSchedule(baseEvents, SERIAL_NARRATION_MIN_GAP_MS, narrationGapMaxMs)
  ));

  await withPhase(debug, "video_retime", 86, 92, async () => {
    await retimeVideoByEventSchedule({
      inputPath: slowedVideoPath,
      outputPath: serialVideoPath,
      narrationEvents,
      debug,
    });
  });

  await withPhase(debug, "audio_mux", 92, 98, async () => {
    await renderNarrationAudioTrack({
      baseVideoPath: serialVideoPath,
      speechWavs,
      narrationEvents,
      outputPath: outputNarratedPath,
      debug,
    });
  });

  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  return {
    outputPath: outputNarratedPath,
    narrationEvents,
    syncModel: "serial-gated",
    narrationOverlapResolved: true,
    syncFallbackUsed: false,
  };
};

const buildAtempoFilters = (targetTempo) => {
  let remaining = targetTempo;
  const filters = [];
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);
  return filters.join(",");
};

const parseProfiles = (raw) => {
  if (!raw || raw === "all") return ["fast", "follow", "narrated"];
  const allowed = new Set(["fast", "follow", "narrated"]);
  const items = raw.split(",").map((x) => x.trim()).filter(Boolean);
  const unique = [];
  for (const item of items) {
    if (allowed.has(item) && !unique.includes(item)) unique.push(item);
  }
  return unique.length ? unique : ["fast", "follow", "narrated"];
};

const renderSlowedVideo = async ({
  inputPath,
  outputPath,
  slowdownFactor,
  keepAudio = true,
  debug = null,
  stageLabel = "slowdown-render",
}) => {
  if (!Number.isFinite(slowdownFactor) || slowdownFactor <= 1) {
    await fs.copyFile(inputPath, outputPath);
    return outputPath;
  }
  const tempo = 1 / slowdownFactor;
  const audioFilter = buildAtempoFilters(tempo);

  if (keepAudio) {
    await runCommandTimed({
      cmd: "ffmpeg",
      args: [
        "-y",
        "-i",
        inputPath,
        "-filter:v",
        `setpts=${slowdownFactor}*PTS`,
        "-filter:a",
        audioFilter,
        "-c:v",
        "libvpx-vp9",
        "-c:a",
        "libopus",
        outputPath,
      ],
      debug,
      label: `${stageLabel}:with-audio`,
    }).catch(async () => {
      await runCommandTimed({
        cmd: "ffmpeg",
        args: [
          "-y",
          "-i",
          inputPath,
          "-filter:v",
          `setpts=${slowdownFactor}*PTS`,
          "-an",
          "-c:v",
          "libvpx-vp9",
          outputPath,
        ],
        debug,
        label: `${stageLabel}:video-only-fallback`,
      });
    });
  } else {
    await runCommandTimed({
      cmd: "ffmpeg",
      args: [
        "-y",
        "-i",
        inputPath,
        "-filter:v",
        `setpts=${slowdownFactor}*PTS`,
        "-an",
        "-c:v",
        "libvpx-vp9",
        outputPath,
      ],
      debug,
      label: `${stageLabel}:video-only`,
    });
  }
  return outputPath;
};

const login = async (page, { baseUrl, username, password, timing, attemptHints = {} }) => {
  const researcherUrl = new URL("/researcher", baseUrl).toString();
  await page.goto(researcherUrl, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/researcher/dashboard")) return;

  const signInTab = page.getByRole("button", { name: /^Sign In$/i });
  const loginInput = page.getByRole("textbox", { name: /Email or Username/i }).first();
  const passwordInput = page.locator("input[type='password']").first();
  const signInBtn = page.getByRole("button", { name: /^Sign In$/i }).last();

  await Promise.race([
    page.waitForURL("**/researcher/dashboard", { timeout: 5000 }).catch(() => {}),
    loginInput.waitFor({ state: "visible", timeout: 5000 }).catch(() => {}),
  ]);

  if (page.url().includes("/researcher/dashboard")) return;

  if (await signInTab.isVisible().catch(() => false)) {
    await signInTab.click();
    await delay(200);
  }

  await loginInput.waitFor({ state: "visible", timeout: 5000 });
  if (await loginInput.isVisible().catch(() => false)) {
    await loginInput.fill(username);
    await passwordInput.fill(password);
    await signInBtn.click();
  }

  await page
    .waitForURL("**/researcher/dashboard", { timeout: 8000 })
    .catch(async () => {
      await delay(Math.max(timing.postActionMs, 1200) + (attemptHints.authExtraWaitMs || 0));
    });

  if (!page.url().includes("/researcher/dashboard")) {
    const authErrors = await getVisibleAuthErrors(page);
    const authText = authErrors.length ? ` Visible auth errors: ${authErrors.join(" | ")}` : "";
    throw new Error(`Login failed. Current URL: ${page.url()}.${authText}`);
  }
};

const flowBacklogTabs = async ({ page, baseUrl, step }) => {
  await step("Open researcher dashboard", async () => {
    await page.goto(new URL("/researcher/dashboard", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  });

  await step("Open Backlog", async () => {
    const backlogBtn = page.getByRole("button", { name: /^Backlog$/i });
    await backlogBtn.click();
  });

  const tabNames = ["Future Features", "Errors", "All"];
  for (const tabName of tabNames) {
    await step(`Switch backlog tab: ${tabName}`, async () => {
      const tab = page.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") });
      await tab.click();
    });
  }
};

const ensureResponsesRows = async (page, attemptHints = {}) => {
  const participantsSourceBtn = page.getByRole("button", { name: /^Participants$/i });
  if (await participantsSourceBtn.isVisible().catch(() => false)) {
    await participantsSourceBtn.click();
    await delay(400);
  }

  const rows = page.locator("tbody tr");
  const hasRows = await rows.first().waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
  if (!hasRows || attemptHints.aggressiveRowsRefresh) {
    const refreshBtn = page.getByRole("button", { name: /refresh/i }).first();
    if (await refreshBtn.isVisible().catch(() => false)) {
      await refreshBtn.click();
      await delay(attemptHints.aggressiveRowsRefresh ? 1200 : 600);
    }
  }
};

const flowResponseDetailsAddBacklog = async ({ page, baseUrl, step, attemptHints = {} }) => {
  await step("Open researcher dashboard", async () => {
    await page.goto(new URL("/researcher/dashboard", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  });

  await step("Open Responses tab", async () => {
    await page.getByRole("tab", { name: /^Responses$/i }).click();
  });

  await step("Ensure participant rows are visible", async () => {
    await ensureResponsesRows(page, attemptHints);
  });

  await step("Open first response details", async () => {
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    if (!count) throw new Error("No response rows found.");
    await rows.first().click();
  });

  await step("Open Add to Backlog dialog", async () => {
    const btn = page.getByRole("button", { name: /Add to Backlog/i });
    await btn.click();
    if (attemptHints.retryModalOpen) {
      const isOpen = await page.getByRole("button", { name: /^Save$/i }).isVisible().catch(() => false);
      if (!isOpen) {
        await delay(200);
        await btn.click();
      }
    }
  });

  await step("Save backlog item", async () => {
    await page.getByRole("button", { name: /^Save$/i }).click();
    await page.getByText(/backlog/i).first().waitFor({ timeout: 8000 }).catch(() => {});
  });
};

const flowPendingOrAbandonedNotesBacklog = async ({ page, baseUrl, step, attemptHints = {} }) => {
  await step("Open researcher dashboard", async () => {
    await page.goto(new URL("/researcher/dashboard", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  });

  await step("Open Responses tab", async () => {
    await page.getByRole("tab", { name: /^Responses$/i }).click();
  });

  await step("Ensure participant rows are visible", async () => {
    await ensureResponsesRows(page, attemptHints);
  });

  await step("Apply pending/abandoned filter when available", async () => {
    const statusFilter = page.getByRole("combobox", { name: /status/i });
    if (!(await statusFilter.isVisible().catch(() => false))) return;

    await statusFilter.click();
    const pending = page.getByRole("option", { name: /pending|abandoned/i }).first();
    if (await pending.isVisible().catch(() => false)) {
      await pending.click();
    } else {
      await page.keyboard.press("Escape");
    }
  });

  await step("Open first row details", async () => {
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    if (!count) throw new Error("No response rows found after optional filtering.");
    await rows.first().click();
  });

  await step("Save notes", async () => {
    const saveNotesBtn = page.getByRole("button", { name: /^Save notes$/i });
    if (!(await saveNotesBtn.isVisible().catch(() => false))) return;
    await saveNotesBtn.click();
  });

  await step("Add pending/abandoned record to backlog", async () => {
    const addBtn = page.getByRole("button", { name: /Add to Backlog/i });
    if (!(await addBtn.isVisible().catch(() => false))) return;
    await addBtn.click();
    if (attemptHints.retryModalOpen) {
      const isOpen = await page.getByRole("button", { name: /^Save$/i }).isVisible().catch(() => false);
      if (!isOpen) {
        await delay(200);
        await addBtn.click();
      }
    }
  });

  await step("Save backlog item", async () => {
    const saveBtn = page.getByRole("button", { name: /^Save$/i });
    if (!(await saveBtn.isVisible().catch(() => false))) return;
    await saveBtn.click();
  });
};

const flowCatalog = [
  {
    id: "flow1-backlog-tabs",
    title: "Backlog tabs navigation",
    totalSteps: 5,
    introTitle: "Backlog Navigation Test",
    introBody: "This test checks that the Backlog page opens and tab switching works correctly.",
    introLines: [
      "Step 1: Open the researcher dashboard.",
      "Step 2: Open the Backlog page.",
      "Step 3-5: Switch between Future Features, Errors, and All tabs.",
    ],
    run: flowBacklogTabs,
  },
  {
    id: "flow2-response-details-add-backlog",
    title: "Response details: add to backlog",
    totalSteps: 6,
    introTitle: "Response Details Backlog Save Test",
    introBody: "This test checks that you can open a response and save a backlog item from its details page.",
    introLines: [
      "Open dashboard and Responses tab.",
      "Open first response details page.",
      "Click Add to Backlog and save.",
    ],
    run: flowResponseDetailsAddBacklog,
  },
  {
    id: "flow3-pending-or-abandoned-notes-backlog",
    title: "Pending/abandoned: notes + backlog",
    totalSteps: 8,
    introTitle: "Pending/Abandoned Notes and Backlog Test",
    introBody: "This test checks notes saving and backlog creation for pending or abandoned responses.",
    introLines: [
      "Open dashboard and Responses tab.",
      "Apply pending/abandoned filter when available.",
      "Open a response, save notes, then add it to backlog.",
    ],
    run: flowPendingOrAbandonedNotesBacklog,
  },
];

const pickFlows = (flowArg) => {
  if (!flowArg || flowArg === "all") return flowCatalog;
  const wanted = new Set(flowArg.split(",").map((x) => x.trim()).filter(Boolean));
  return flowCatalog.filter((f) => wanted.has(f.id));
};

const runSingleAttempt = async ({
  browser,
  flow,
  baseUrl,
  outDir,
  timing,
  authConfig,
  ttsConfig,
  recordVideo,
  attemptNumber,
  attemptHints,
}) => {
  const contextOptions = { viewport: { width: 1440, height: 920 } };
  if (recordVideo) {
    contextOptions.recordVideo = { dir: outDir, size: { width: 1440, height: 920 } };
  }
  const context = await browser.newContext(contextOptions);
  if (recordVideo) await installOverlayInitScript(context);

  const page = await context.newPage();
  if (!recordVideo) {
    page.setDefaultTimeout(8000);
    page.setDefaultNavigationTimeout(12000);
  }
  let ok = false;
  let errMsg = null;
  let failedStep = null;
  let finalUrl = null;

  const runState = {
    flowStartedAtMs: Date.now(),
    currentStep: null,
    stepIndex: 0,
    furthestStepIndex: 0,
    totalSteps: flow.totalSteps || null,
    completedSteps: [],
    timeline: [],
    events: [],
  };
  const overlayState = {
    title: flow.title,
    step: "Preparing...",
    mode: "compact",
    stepCounter: runState.totalSteps ? `Step 0/${runState.totalSteps}` : "Step 0",
    completedSteps: [],
  };
  const step = createStepHelper(page, timing, runState, overlayState, {
    mode: recordVideo ? "record" : "preflight",
    ttsConfig,
    outDir,
  });
  const onFrameNavigated = () => {
    if (recordVideo) void applyOverlayState(page, overlayState);
  };
  page.on("framenavigated", onFrameNavigated);

  try {
    if (recordVideo) {
      await setFlowTitle(page, flow.title, overlayState);
      runState.events.push({ type: "intro_start", label: "Intro", sourceMs: 0 });
      await showIntro(page, flow, overlayState, timing, runState, ttsConfig, outDir);
      runState.events.push({
        type: "intro_done",
        label: "Intro",
        sourceMs: Math.max(0, Date.now() - runState.flowStartedAtMs),
      });
    }

    if (authConfig.enabled) {
      if (recordVideo) await setStepText(page, "Authenticating...", overlayState);
      await login(page, {
        baseUrl,
        username: authConfig.username,
        password: authConfig.password,
        timing,
        attemptHints,
      });
    }

    if (attemptHints.extraNavigationSettleMs > 0) {
      await delay(attemptHints.extraNavigationSettleMs);
    }

    await flow.run({ page, baseUrl, step, attemptHints });
    if (recordVideo) {
      await markComplete(page, overlayState, "All action steps completed ✅");
      await delay(timing.completeHoldMs);
    }
    ok = true;
  } catch (error) {
    errMsg = toErrorMessage(error);
    failedStep = runState.currentStep;
    runState.events.push({
      type: "failure",
      label: failedStep || "Unknown failure",
      sourceMs: Math.max(0, Date.now() - runState.flowStartedAtMs),
    });
    if (recordVideo) {
      await setStepText(page, `Failed: ${failedStep || "unknown step"}`, overlayState);
      await delay(700);
    }
  } finally {
    finalUrl = page.url();
  }

  const errorClass = classifyErrorClass({ errMsg, finalUrl, failedStep });
  const errorSeverity = ERROR_SEVERITY[errorClass] ?? ERROR_SEVERITY.unknown;
  const errorSignature = `${errorClass}::${String(errMsg || "").slice(0, 220)}`;
  const failedStepOrdinal = failedStep ? runState.stepIndex : 0;
  const failureExplanations = ok
    ? []
    : inferFailureExplanations({ errMsg, finalUrl, failedStep, errorClass });

  let savedPath = null;
  let masterVideoPath = null;
  if (recordVideo) {
    runState.events.push({
      type: "summary_start",
      label: "Summary",
      sourceMs: Math.max(0, Date.now() - runState.flowStartedAtMs),
    });
    await showSummary(
      page,
      overlayState,
      timing,
      runState,
      ok,
      errMsg,
      failureExplanations,
      ttsConfig,
      outDir,
    ).catch(() => {});
    runState.events.push({
      type: "summary_done",
      label: "Summary",
      sourceMs: Math.max(0, Date.now() - runState.flowStartedAtMs),
    });
  }

  const video = page.video();
  page.off("framenavigated", onFrameNavigated);
  await context.close();
  if (recordVideo && video) {
    const rawPath = await video.path();
    const finalPath = path.join(outDir, `${flow.id}.master.webm`);
    await fs.rename(rawPath, finalPath).catch(async () => {
      await fs.copyFile(rawPath, finalPath);
      await fs.unlink(rawPath).catch(() => {});
    });
    savedPath = finalPath;
    masterVideoPath = finalPath;
  }

  return {
    flow: flow.id,
    attempt: attemptNumber,
    ok,
    errMsg,
    failedStep,
    finalUrl,
    furthestStepIndex: runState.furthestStepIndex,
    failedStepOrdinal,
    errorClass,
    errorSeverity,
    errorSignature,
    completedSteps: [...runState.completedSteps],
    timeline: [...runState.timeline],
    events: [...runState.events],
    currentStep: runState.currentStep,
    failureExplanations,
    masterVideoPath,
    savedPath,
    ttsEnabled: Boolean(ttsConfig.enabled),
    ttsError: null,
  };
};

const renderFlowProfiles = async ({ flow, runResult, args, debug = createDebugContext(flow.id, args.outDir) }) => {
  const profilesRequested = parseProfiles(args.profiles);
  const profilesGenerated = [];
  const artifacts = { fastPath: null, followPath: null, narratedPath: null };
  let narrationEvents = [];
  let ttsError = null;
  let syncModel = null;
  let narrationOverlapResolved = false;
  let syncFallbackUsed = false;

  const masterPath = runResult.masterVideoPath;
  if (!masterPath) {
    return {
      artifacts,
      profilesGenerated,
      narrationEvents,
      ttsError,
      syncModel,
      narrationOverlapResolved,
      syncFallbackUsed,
      progressPhases: debug.progressPhases,
      ffmpegStages: debug.ffmpegStages,
      narrationSkippedSteps: debug.narrationSkippedSteps,
    };
  }

  const fastPath = path.join(args.outDir, `${flow.id}.fast.webm`);
  const followPath = path.join(args.outDir, `${flow.id}.follow.webm`);
  const narratedPath = path.join(args.outDir, `${flow.id}.narrated.webm`);
  const basePathForDerivatives = profilesRequested.includes("fast") ? fastPath : masterPath;

  if (profilesRequested.includes("fast")) {
    await withPhase(debug, "finalize_fast_artifact", 98, 99, async () => {
      await fs.copyFile(masterPath, fastPath);
    });
    artifacts.fastPath = fastPath;
    profilesGenerated.push("fast");
  }

  if (profilesRequested.includes("follow")) {
    await withPhase(debug, "follow_render", 70, 90, async () => {
      await renderSlowedVideo({
        inputPath: basePathForDerivatives,
        outputPath: followPath,
        slowdownFactor: args.followSlowdown,
        keepAudio: true,
        debug,
        stageLabel: "follow-render",
      });
    });
    artifacts.followPath = followPath;
    profilesGenerated.push("follow");
  }

  if (profilesRequested.includes("narrated")) {
    const forcedTts = { ...args.tts, enabled: true };
    const wantsRelaxedSync = forcedTts.sync === "soft";
    try {
      const sharedRendererInput = {
        inputFastPath: basePathForDerivatives,
        outputNarratedPath: narratedPath,
        flow,
        runState: {
          ...runResult,
          timeline: runResult.timeline || [],
          events: runResult.events || [],
          completedSteps: runResult.completedSteps || [],
          currentStep: runResult.currentStep || null,
        },
        ok: runResult.ok,
        errMsg: runResult.errMsg,
        failureExplanations: runResult.failureExplanations || [],
        ttsConfig: forcedTts,
        narrationScope: args.narrationScope,
        narratedBaseSlowdown: args.narratedBaseSlowdown,
        narrationGapMaxMs: args.narrationGapMaxMs,
        outDir: args.outDir,
        debug,
      };
      let narratedResult;
      if (wantsRelaxedSync) {
        narratedResult = await renderEventAlignedNarratedVideo(sharedRendererInput);
      } else {
        try {
          narratedResult = await renderSerialGatedNarratedVideo(sharedRendererInput);
        } catch (serialError) {
          syncFallbackUsed = true;
          ttsError = `Serial sync failed, used event-aligned fallback: ${toErrorMessage(serialError)}`;
          narratedResult = await renderEventAlignedNarratedVideo(sharedRendererInput);
          narratedResult.syncFallbackUsed = true;
        }
      }
      artifacts.narratedPath = narratedResult.outputPath;
      narrationEvents = narratedResult.narrationEvents || [];
      syncModel = narratedResult.syncModel || (wantsRelaxedSync ? "event-aligned" : "serial-gated");
      narrationOverlapResolved = Boolean(narratedResult.narrationOverlapResolved);
      syncFallbackUsed = syncFallbackUsed || Boolean(narratedResult.syncFallbackUsed);
    } catch (error) {
      const fatalRenderError = toErrorMessage(error);
      ttsError = ttsError ? `${ttsError} | ${fatalRenderError}` : fatalRenderError;
      syncFallbackUsed = true;
      await renderSlowedVideo({
        inputPath: basePathForDerivatives,
        outputPath: narratedPath,
        slowdownFactor: args.narratedBaseSlowdown,
        keepAudio: false,
        debug,
        stageLabel: "narrated-fallback",
      });
      artifacts.narratedPath = narratedPath;
      narrationEvents = [];
      syncModel = wantsRelaxedSync ? "event-aligned" : "serial-gated";
      narrationOverlapResolved = false;
    }
    profilesGenerated.push("narrated");
  }

  const keepMaster = process.env.PLAYWRIGHT_KEEP_MASTER === "1";
  if (!keepMaster) {
    await fs.unlink(masterPath).catch(() => {});
  }

  return {
    artifacts,
    profilesGenerated,
    narrationEvents,
    ttsError,
    syncModel,
    narrationOverlapResolved,
    syncFallbackUsed,
    progressPhases: debug.progressPhases,
    ffmpegStages: debug.ffmpegStages,
    narrationSkippedSteps: debug.narrationSkippedSteps,
  };
};

const runAdaptiveFlow = async ({
  preflightBrowser,
  recordBrowser,
  flow,
  args,
  authConfig,
}) => {
  const attemptHistory = [];
  const improvementHistory = [];
  let consecutiveNoImprove = 0;
  let previousAttempt = null;
  let terminationReason = "max_attempts";
  let passed = false;
  const debug = createDebugContext(flow.id, args.outDir);

  await withPhase(debug, "preflight_attempts", 0, 35, async () => {
    for (let attemptNumber = 1; attemptNumber <= args.maxAttempts; attemptNumber += 1) {
      const attemptHints = buildAttemptHints(attemptNumber, previousAttempt);
      const attempt = await runSingleAttempt({
        browser: preflightBrowser,
        flow,
        baseUrl: args.baseUrl,
        outDir: args.outDir,
        timing: args.timing,
        authConfig,
        ttsConfig: { ...args.tts, enabled: false },
        recordVideo: false,
        attemptNumber,
        attemptHints,
      });

      attemptHistory.push({
        attempt: attempt.attempt,
        ok: attempt.ok,
        errMsg: attempt.errMsg,
        failedStep: attempt.failedStep,
        finalUrl: attempt.finalUrl,
        furthestStepIndex: attempt.furthestStepIndex,
        failedStepOrdinal: attempt.failedStepOrdinal,
        errorClass: attempt.errorClass,
        errorSeverity: attempt.errorSeverity,
        errorSignature: attempt.errorSignature,
      });

      if (attempt.ok) {
        passed = true;
        terminationReason = "passed";
        previousAttempt = attempt;
        break;
      }

      if (previousAttempt) {
        const status = compareAttemptProgress(previousAttempt, attempt);
        improvementHistory.push({
          fromAttempt: previousAttempt.attempt,
          toAttempt: attempt.attempt,
          status,
        });
        if (status === "improved") {
          consecutiveNoImprove = 0;
        } else {
          consecutiveNoImprove += 1;
        }

        if (consecutiveNoImprove >= args.noImproveThreshold) {
          terminationReason = "no_improve_threshold";
          previousAttempt = attempt;
          break;
        }
      }
      previousAttempt = attempt;
    }
  });

  if (!passed && attemptHistory.length >= args.maxAttempts) {
    terminationReason = "max_attempts";
  }

  let recordingDecision = "skipped";
  let recordingResult = null;
  let profileResult = {
    artifacts: { fastPath: null, followPath: null, narratedPath: null },
    profilesGenerated: [],
    narrationEvents: [],
    ttsError: null,
    syncModel: null,
    narrationOverlapResolved: false,
    syncFallbackUsed: false,
    progressPhases: [],
    ffmpegStages: [],
    narrationSkippedSteps: [],
  };
  if (passed && args.recordOnPass) {
    recordingDecision = "success_video";
    recordingResult = await withPhase(debug, "recording_run", 35, 55, async () => runSingleAttempt({
      browser: recordBrowser,
      flow,
      baseUrl: args.baseUrl,
      outDir: args.outDir,
      timing: args.timing,
      authConfig,
      ttsConfig: args.tts,
      recordVideo: true,
      attemptNumber: attemptHistory.length + 1,
      attemptHints: buildAttemptHints(attemptHistory.length + 1, previousAttempt),
    }));
    profileResult = await withPhase(debug, "profile_render", 55, 98, async () => renderFlowProfiles({
      flow,
      runResult: recordingResult,
      args,
      debug,
    }));
  } else if (!passed && args.recordOnFailure) {
    recordingDecision = "failure_video";
    recordingResult = await withPhase(debug, "recording_run", 35, 55, async () => runSingleAttempt({
      browser: recordBrowser,
      flow,
      baseUrl: args.baseUrl,
      outDir: args.outDir,
      timing: args.timing,
      authConfig,
      ttsConfig: args.tts,
      recordVideo: true,
      attemptNumber: attemptHistory.length + 1,
      attemptHints: buildAttemptHints(attemptHistory.length + 1, previousAttempt),
    }));
    profileResult = await withPhase(debug, "profile_render", 55, 98, async () => renderFlowProfiles({
      flow,
      runResult: recordingResult,
      args,
      debug,
    }));
  }

  const finalRef = recordingResult || previousAttempt || attemptHistory[attemptHistory.length - 1] || null;
  const failureExplanations = finalRef?.failureExplanations || [];
  const preferredPath = profileResult.artifacts.fastPath
    || profileResult.artifacts.followPath
    || profileResult.artifacts.narratedPath
    || recordingResult?.savedPath
    || null;

  return {
    flow: flow.id,
    ok: passed,
    attempts: attemptHistory.length,
    attemptHistory,
    improvementHistory: improvementHistory.map((x) => x.status),
    consecutiveNoImprove,
    terminationReason,
    recordingDecision,
    failureExplanations,
    errMsg: finalRef?.errMsg ?? null,
    failedStep: finalRef?.failedStep ?? null,
    finalUrl: finalRef?.finalUrl ?? null,
    savedPath: preferredPath,
    silentVideoPath: profileResult.artifacts.fastPath || null,
    artifacts: profileResult.artifacts,
    profilesGenerated: profileResult.profilesGenerated,
    narrationScope: args.narrationScope,
    narrationGapMaxMs: args.narrationGapMaxMs,
    followSlowdown: args.followSlowdown,
    narratedSlowdownApplied: args.narratedBaseSlowdown,
    syncModel: profileResult.syncModel || (parseProfiles(args.profiles).includes("narrated") ? "serial-gated" : null),
    narrationEvents: profileResult.narrationEvents,
    narrationOverlapResolved: profileResult.narrationOverlapResolved,
    syncFallbackUsed: profileResult.syncFallbackUsed,
    ttsEnabled: Boolean(args.tts.enabled || profileResult.artifacts.narratedPath),
    ttsError: profileResult.ttsError || recordingResult?.ttsError || null,
    ttsSyncMode: args.tts.sync,
    timeline: finalRef?.timeline ?? [],
    runId: debug.runId,
    createdAt: debug.createdAt,
    progressPhases: profileResult.progressPhases?.length ? profileResult.progressPhases : debug.progressPhases,
    ffmpegStages: profileResult.ffmpegStages?.length ? profileResult.ffmpegStages : debug.ffmpegStages,
    narrationSkippedSteps: profileResult.narrationSkippedSteps?.length
      ? profileResult.narrationSkippedSteps
      : debug.narrationSkippedSteps,
  };
};

const runRecordOnlyFlow = async ({ browser, flow, args, authConfig }) => {
  const debug = createDebugContext(flow.id, args.outDir);
  const recordResult = await withPhase(debug, "recording_run", 35, 55, async () => runSingleAttempt({
    browser,
    flow,
    baseUrl: args.baseUrl,
    outDir: args.outDir,
    timing: args.timing,
    authConfig,
    ttsConfig: args.tts,
    recordVideo: true,
    attemptNumber: 1,
    attemptHints: buildAttemptHints(1, null),
  }));
  const profileResult = await withPhase(debug, "profile_render", 55, 98, async () => renderFlowProfiles({
    flow,
    runResult: recordResult,
    args,
    debug,
  }));
  const preferredPath = profileResult.artifacts.fastPath
    || profileResult.artifacts.followPath
    || profileResult.artifacts.narratedPath
    || recordResult.savedPath
    || null;
  return {
    flow: flow.id,
    ok: recordResult.ok,
    attempts: 1,
    attemptHistory: [{
      attempt: 1,
      ok: recordResult.ok,
      errMsg: recordResult.errMsg,
      failedStep: recordResult.failedStep,
      finalUrl: recordResult.finalUrl,
      furthestStepIndex: recordResult.furthestStepIndex,
      failedStepOrdinal: recordResult.failedStepOrdinal,
      errorClass: recordResult.errorClass,
      errorSeverity: recordResult.errorSeverity,
      errorSignature: recordResult.errorSignature,
    }],
    improvementHistory: [],
    consecutiveNoImprove: 0,
    terminationReason: recordResult.ok ? "passed" : "no_improve_threshold",
    recordingDecision: recordResult.ok ? "success_video" : "failure_video",
    failureExplanations: recordResult.failureExplanations || [],
    errMsg: recordResult.errMsg,
    failedStep: recordResult.failedStep,
    finalUrl: recordResult.finalUrl,
    savedPath: preferredPath,
    silentVideoPath: profileResult.artifacts.fastPath || null,
    artifacts: profileResult.artifacts,
    profilesGenerated: profileResult.profilesGenerated,
    narrationScope: args.narrationScope,
    narrationGapMaxMs: args.narrationGapMaxMs,
    followSlowdown: args.followSlowdown,
    narratedSlowdownApplied: args.narratedBaseSlowdown,
    syncModel: profileResult.syncModel || (parseProfiles(args.profiles).includes("narrated") ? "serial-gated" : null),
    narrationEvents: profileResult.narrationEvents,
    narrationOverlapResolved: profileResult.narrationOverlapResolved,
    syncFallbackUsed: profileResult.syncFallbackUsed,
    ttsEnabled: Boolean(args.tts.enabled || profileResult.artifacts.narratedPath),
    ttsError: profileResult.ttsError || recordResult.ttsError || null,
    ttsSyncMode: args.tts.sync,
    timeline: recordResult.timeline || [],
    runId: debug.runId,
    createdAt: debug.createdAt,
    progressPhases: profileResult.progressPhases?.length ? profileResult.progressPhases : debug.progressPhases,
    ffmpegStages: profileResult.ffmpegStages?.length ? profileResult.ffmpegStages : debug.ffmpegStages,
    narrationSkippedSteps: profileResult.narrationSkippedSteps?.length
      ? profileResult.narrationSkippedSteps
      : debug.narrationSkippedSteps,
  };
};

const toPublicArtifactUrl = (relativePath) => {
  if (!relativePath) return null;
  return `/__dev__/playwright-runs/artifact/${encodeURIComponent(relativePath)}`;
};

const persistRunDebugArtifacts = async ({ result, args }) => {
  const runId = result.runId || makeRunId(result.flow || "flow");
  const flowId = result.flow || "unknown-flow";
  const runFileName = `${flowId}.${runId}.debug.json`;
  const latestFileName = `${flowId}.debug.json`;
  const runPath = path.join(args.outDir, runFileName);
  const latestPath = path.join(args.outDir, latestFileName);

  const toRel = (candidate) => toRelativePath(candidate, args.outDir);
  const artifacts = {
    fast: toRel(result.artifacts?.fastPath || null),
    follow: toRel(result.artifacts?.followPath || null),
    narrated: toRel(result.artifacts?.narratedPath || null),
  };
  const artifactUrls = {
    fast: toPublicArtifactUrl(artifacts.fast),
    follow: toPublicArtifactUrl(artifacts.follow),
    narrated: toPublicArtifactUrl(artifacts.narrated),
  };

  const debugRecord = {
    runId,
    flowId,
    createdAt: result.createdAt || nowIso(),
    ok: Boolean(result.ok),
    attempts: result.attempts ?? null,
    syncModel: result.syncModel ?? null,
    narrationScope: result.narrationScope ?? null,
    narrationGapMaxMs: args.narrationGapMaxMs,
    narrationOverlapResolved: Boolean(result.narrationOverlapResolved),
    syncFallbackUsed: Boolean(result.syncFallbackUsed),
    ttsError: result.ttsError || null,
    failureExplanations: Array.isArray(result.failureExplanations) ? result.failureExplanations : [],
    progressPhases: Array.isArray(result.progressPhases) ? result.progressPhases : [],
    ffmpegStages: Array.isArray(result.ffmpegStages) ? result.ffmpegStages : [],
    narrationSkippedSteps: Array.isArray(result.narrationSkippedSteps) ? result.narrationSkippedSteps : [],
    timeline: Array.isArray(result.timeline) ? result.timeline : [],
    narrationEvents: Array.isArray(result.narrationEvents) ? result.narrationEvents : [],
    artifacts,
    artifactUrls,
  };

  await fs.writeFile(runPath, `${JSON.stringify(debugRecord, null, 2)}\n`, "utf8");
  await fs.writeFile(latestPath, `${JSON.stringify(debugRecord, null, 2)}\n`, "utf8");

  const manifestPath = path.join(args.outDir, "manifest.debug.json");
  let manifest = { updatedAt: nowIso(), runs: [] };
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.runs)) manifest = parsed;
  } catch {
    // ignore if first run
  }

  const summaryRow = {
    runId,
    flowId,
    createdAt: debugRecord.createdAt,
    ok: debugRecord.ok,
    syncModel: debugRecord.syncModel,
    debugFile: runFileName,
    latestFile: latestFileName,
    artifactUrls: debugRecord.artifactUrls,
  };

  manifest = {
    updatedAt: nowIso(),
    runs: [
      summaryRow,
      ...manifest.runs.filter((row) => row?.runId !== runId).slice(0, MAX_DEBUG_RUNS - 1),
    ],
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { debugFile: runFileName, latestFile: latestFileName };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const localEnv = await loadLocalEnv();

  const authConfig = {
    enabled: args.auth,
    username: process.env.RESEARCHER_USERNAME || localEnv.RESEARCHER_USERNAME || "",
    password: process.env.RESEARCHER_PASSWORD || localEnv.RESEARCHER_PASSWORD || "",
  };

  if (authConfig.enabled && (!authConfig.username || !authConfig.password)) {
    throw new Error(
      "Missing auth config. Set RESEARCHER_USERNAME/RESEARCHER_PASSWORD env vars or .env.playwright.local keys."
    );
  }

  await fs.mkdir(args.outDir, { recursive: true });

  const selectedFlows = pickFlows(args.flow);
  if (!selectedFlows.length) {
    throw new Error(`No flows selected for --flow=${args.flow}. Available: ${flowCatalog.map((f) => f.id).join(", ")}`);
  }

  let preflightBrowser = null;
  let recordBrowser = null;
  try {
    preflightBrowser = await chromium.launch({ headless: true, channel: "chrome" });
  } catch {
    preflightBrowser = await chromium.launch({ headless: true });
  }
  try {
    recordBrowser = await chromium.launch({ headless: args.headless, channel: "chrome" });
  } catch {
    recordBrowser = await chromium.launch({ headless: args.headless });
  }

  const results = [];
  try {
    for (const flow of selectedFlows) {
      const result = args.strategy === "preflight-first"
        ? await runAdaptiveFlow({
            preflightBrowser,
            recordBrowser,
            flow,
            args,
            authConfig,
          })
        : await runRecordOnlyFlow({
            browser: recordBrowser,
            flow,
            args,
            authConfig,
          });
      const debugFiles = await persistRunDebugArtifacts({ result, args });
      result.debugFile = debugFiles.debugFile;
      result.latestDebugFile = debugFiles.latestFile;
      results.push(result);
    }
  } finally {
    if (recordBrowser) await recordBrowser.close();
    if (preflightBrowser && preflightBrowser !== recordBrowser) await preflightBrowser.close();
  }

  console.log(JSON.stringify({
    baseUrl: args.baseUrl,
    outDir: args.outDir,
    strategy: args.strategy,
    maxAttempts: args.maxAttempts,
    noImproveThreshold: args.noImproveThreshold,
    recordOnPass: args.recordOnPass,
    recordOnFailure: args.recordOnFailure,
    fast: args.fast,
    profiles: parseProfiles(args.profiles),
    followSlowdown: args.followSlowdown,
    narratedBaseSlowdown: args.narratedBaseSlowdown,
    narrationScope: args.narrationScope,
    narrationGapMaxMs: args.narrationGapMaxMs,
    postSlowdown: args.postSlowdown,
    timing: args.timing,
    tts: args.tts,
    flows: results,
  }, null, 2));

  const hasFailures = results.some((r) => !r.ok);
  process.exitCode = hasFailures ? 1 : 0;
};

main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
