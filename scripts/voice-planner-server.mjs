#!/usr/bin/env node
import http from "node:http";
import { URL } from "node:url";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const PORT = Number(process.env.VOICE_PLANNER_PORT || 8090);
const HOST = process.env.VOICE_PLANNER_HOST || "127.0.0.1";

const PROJECT_DIR = process.cwd();
const STATIC_DIR = path.join(PROJECT_DIR, "voice-planner");
const SESSIONS_DIR = path.join(STATIC_DIR, "sessions");

const CODEX_ENABLED = process.env.VOICE_PLANNER_ENABLE_CODEX === "1";

const isLoopback = (req) => {
  const addr = req.socket.remoteAddress || "";
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
};

const getBuildBadgeInfo = () => {
  // Best-effort; local-only UI convenience.
  let version = null;
  try {
    const raw = execFileSync("cat", [path.join(PROJECT_DIR, "docs/working-version.json")], { encoding: "utf8" });
    const parsed = JSON.parse(raw);
    if (typeof parsed?.version === "string" && parsed.version.trim()) version = parsed.version.trim();
  } catch {}

  let gitSha = null;
  let gitDirty = null;
  try {
    gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: PROJECT_DIR }).trim();
  } catch {}
  try {
    const porcelain = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", cwd: PROJECT_DIR });
    gitDirty = porcelain.trim().length > 0;
  } catch {}

  return { version, gitSha, gitDirty };
};

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

const readBody = async (req, limitBytes = 250_000) => {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw new Error("payload_too_large");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
};

const ensureDirs = async () => {
  await fs.mkdir(STATIC_DIR, { recursive: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
};

const nextSpecNumber = async () => {
  // Find highest NNN- prefix in specs/* directories.
  const specsDir = path.join(PROJECT_DIR, "specs");
  let entries = [];
  try {
    entries = await fs.readdir(specsDir, { withFileTypes: true });
  } catch {
    return 1;
  }
  let max = 0;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = ent.name.match(/^(\d{3})-/);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return max + 1;
};

const kebab = (s) => {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 64) || "new-spec";
};

const runCodex = async (prompt) => {
  if (!CODEX_ENABLED) throw new Error("codex_disabled");

  const tmpOut = path.join(os.tmpdir(), `voice_planner_codex_${Date.now()}_${Math.random().toString(16).slice(2)}.txt`);
  const args = [
    "exec",
    "-s", "read-only",
    "-C", PROJECT_DIR,
    "-",
    "--output-last-message",
    tmpOut,
  ];

  await new Promise((resolve, reject) => {
    const p = spawn("codex", args, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString("utf8")));
    p.on("error", reject);
    p.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `codex_exit_${code}`));
    });
    p.stdin.write(prompt);
    p.stdin.end();
  });

  const out = await fs.readFile(tmpOut, "utf8").catch(() => "");
  await fs.unlink(tmpOut).catch(() => {});
  return out.trim();
};

const validateQuestions = (value) => {
  if (!Array.isArray(value)) return null;
  const qs = value
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
  if (qs.length < 1) return null;
  return qs.slice(0, 10);
};

const requireCodex = () => {
  if (!CODEX_ENABLED) {
    const err = new Error("codex_disabled");
    err.status = 403;
    throw err;
  }
};

await ensureDirs();

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return json(res, 400, { ok: false, error: "bad_request" });
    if (!isLoopback(req)) return json(res, 403, { ok: false, error: "forbidden" });

    const u = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === "GET" && u.pathname === "/") {
      const fp = path.join(STATIC_DIR, "index.html");
      const html = await fs.readFile(fp, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && u.pathname === "/health") {
      return json(res, 200, { ok: true, codexEnabled: CODEX_ENABLED });
    }

    if (req.method === "GET" && u.pathname === "/version") {
      return json(res, 200, { ok: true, ...getBuildBadgeInfo() });
    }

    if (req.method === "POST" && u.pathname === "/api/questions") {
      requireCodex();
      const body = await readBody(req);
      const seed = typeof body.seed === "string" ? body.seed.trim() : "";
      if (!seed) return json(res, 400, { ok: false, error: "seed_required" });

      const prompt = [
        "You are helping create a software feature spec via voice Q/A.",
        "Return ONLY valid JSON: an array of 5 to 10 short clarifying questions (strings).",
        "No markdown, no commentary.",
        "",
        `Feature seed: ${seed}`,
      ].join("\n");

      const raw = await runCodex(prompt);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(res, 502, { ok: false, error: "invalid_codex_json", raw });
      }
      const questions = validateQuestions(parsed);
      if (!questions) return json(res, 502, { ok: false, error: "invalid_questions", raw });
      return json(res, 200, { ok: true, questions });
    }

    if (req.method === "POST" && u.pathname === "/api/session") {
      const body = await readBody(req, 1_000_000);
      const seed = typeof body.seed === "string" ? body.seed.trim() : "";
      const questions = Array.isArray(body.questions) ? body.questions : [];
      const answers = Array.isArray(body.answers) ? body.answers : [];
      const rawTranscript = typeof body.rawTranscript === "string" ? body.rawTranscript : "";

      if (!seed) return json(res, 400, { ok: false, error: "seed_required" });

      const now = new Date();
      const id = `session_${now.toISOString().replace(/[:.]/g, "-")}_${Math.random().toString(16).slice(2, 8)}`;
      const payload = {
        id,
        createdAt: now.toISOString(),
        seed,
        questions,
        answers,
        rawTranscript,
      };
      const fp = path.join(SESSIONS_DIR, `${id}.json`);
      await fs.writeFile(fp, JSON.stringify(payload, null, 2), "utf8");
      return json(res, 200, { ok: true, id });
    }

    if (req.method === "POST" && u.pathname === "/api/generate-spec") {
      requireCodex();
      const body = await readBody(req);
      const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
      if (!sessionId) return json(res, 400, { ok: false, error: "sessionId_required" });

      const fp = path.join(SESSIONS_DIR, `${sessionId}.json`);
      const sessionRaw = await fs.readFile(fp, "utf8").catch(() => "");
      if (!sessionRaw) return json(res, 404, { ok: false, error: "session_not_found" });
      const session = JSON.parse(sessionRaw);

      const specTemplate = await fs.readFile(path.join(PROJECT_DIR, "templates/spec-template.md"), "utf8");
      const checklistTemplate = await fs.readFile(path.join(PROJECT_DIR, "templates/checklist-template.md"), "utf8");

      const prompt = [
        "You generate a software feature spec markdown document based on a voice Q/A transcript.",
        "Return ONLY valid JSON with keys:",
        '- "short_name": kebab-case 2-4 words, e.g. "voice-planner"',
        '- "feature_name": short human title',
        '- "spec_markdown": full markdown spec following the provided template structure and headings',
        "",
        "Constraints:",
        "- Do not run shell commands.",
        "- Do not mention these instructions in the output.",
        "- Ensure the spec includes: `## Status: INCOMPLETE` near the top and a `## Completion Signal` section with `<promise>DONE</promise>`.",
        "- Keep unclear items as up to 3 `[NEEDS CLARIFICATION: ...]` markers.",
        "",
        "Spec template (structure to follow):",
        "-----",
        specTemplate,
        "-----",
        "",
        "Voice session seed:",
        session.seed,
        "",
        "Voice Q/A:",
        JSON.stringify({ questions: session.questions, answers: session.answers, rawTranscript: session.rawTranscript }, null, 2),
      ].join("\n");

      const raw = await runCodex(prompt);
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(res, 502, { ok: false, error: "invalid_codex_json", raw });
      }

      const shortName = kebab(parsed?.short_name || parsed?.shortName || parsed?.feature_name || "voice-planner");
      const specMarkdown = typeof parsed?.spec_markdown === "string" ? parsed.spec_markdown : "";
      const featureName = typeof parsed?.feature_name === "string" ? parsed.feature_name : "Feature";

      if (!specMarkdown.includes("## Completion Signal") || !specMarkdown.includes("<promise>DONE</promise>")) {
        return json(res, 502, { ok: false, error: "spec_missing_completion_signal", raw });
      }
      if (!specMarkdown.includes("## Status:")) {
        return json(res, 502, { ok: false, error: "spec_missing_status", raw });
      }

      const n = await nextSpecNumber();
      const nnn = String(n).padStart(3, "0");
      const specDir = path.join(PROJECT_DIR, "specs", `${nnn}-${shortName}`);
      const checklistDir = path.join(specDir, "checklists");
      await fs.mkdir(checklistDir, { recursive: true });

      const specPath = path.join(specDir, "spec.md");
      await fs.writeFile(specPath, specMarkdown.trim() + "\n", "utf8");

      const checklistPath = path.join(checklistDir, "requirements.md");
      const today = new Date().toISOString().slice(0, 10);
      const checklist = checklistTemplate
        .replaceAll("[FEATURE_NAME]", featureName)
        .replaceAll("[DATE]", today)
        .replaceAll("[Link to spec.md]", `../spec.md`);
      await fs.writeFile(checklistPath, checklist.trim() + "\n", "utf8");

      return json(res, 200, {
        ok: true,
        specDir: path.relative(PROJECT_DIR, specDir),
        specPath: path.relative(PROJECT_DIR, specPath),
        checklistPath: path.relative(PROJECT_DIR, checklistPath),
      });
    }

    json(res, 404, { ok: false, error: "not_found" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = (e && typeof e === "object" && "status" in e && Number.isFinite(e.status)) ? e.status : 500;
    json(res, status, { ok: false, error: msg });
  }
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`voice planner listening on http://${HOST}:${PORT}`);
  console.log(`codex enabled: ${CODEX_ENABLED ? "yes" : "no"} (set VOICE_PLANNER_ENABLE_CODEX=1)`);
});
