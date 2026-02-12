#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DOCS_SNAPSHOT_DIR = join(ROOT, 'docs/system-design/snapshots');
const DOCS_DIFF_DIR = join(ROOT, 'docs/system-design/diffs');
const PUBLIC_SYSTEM_DESIGN_DIR = join(ROOT, 'public/system-design');
const PUBLIC_SNAPSHOT_DIR = join(PUBLIC_SYSTEM_DESIGN_DIR, 'snapshots');
const PUBLIC_DIFF_DIR = join(PUBLIC_SYSTEM_DESIGN_DIR, 'diffs');
const PUBLIC_MANIFEST_PATH = join(PUBLIC_SYSTEM_DESIGN_DIR, 'manifest.json');
const PUSH_WORKFLOW_CONFIG_PATH = join(ROOT, 'docs/push-workflow-config.json');
const AUTO_MARK_RELEASE_SETTING_KEY = 'auto_mark_release_on_push';

const RELEVANT_PATTERNS = [
  /^src\/lib\/study-map\//,
  /^src\/components\/researcher\/StudyMap\.tsx$/,
  /^src\/pages\/ResearcherDashboard\.tsx$/,
  /^src\/pages\/ResearcherChangelog\.tsx$/,
  /^src\/App\.tsx$/,
  /^src\/hooks\/usePageTracking\.ts$/,
  /^src\/pages\/(ProlificId|Consent|NoConsent|Questionnaire|GodspeedQuestionnaire|TiasQuestionnaire|TipiQuestionnaire|FeedbackQuestionnaire|EarlyAccessSignup|Debriefing|Complete)\.tsx$/,
  /^supabase\/functions\/(submit-questionnaire|create-researcher-session|submit-early-access|upsert-experiment-draft)\/index\.ts$/,
];

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8').trim();
}

function safeRun(cmd) {
  try {
    return run(cmd);
  } catch {
    return '';
  }
}

function parseArgs(argv) {
  const args = {
    version: '',
    releaseStatus: 'local_only',
    reason: '',
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--version') {
      args.version = argv[i + 1] || '';
      i += 1;
    } else if (token === '--release-status') {
      args.releaseStatus = argv[i + 1] || 'local_only';
      i += 1;
    } else if (token === '--reason') {
      args.reason = argv[i + 1] || '';
      i += 1;
    } else if (token === '--force') {
      args.force = true;
    }
  }

  if (!['local_only', 'pushed', 'released'].includes(args.releaseStatus)) {
    args.releaseStatus = 'local_only';
  }

  return args;
}

function loadDotEnv(filename) {
  const filePath = resolve(ROOT, filename);
  if (!existsSync(filePath)) return;
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseBooleanString(value, fallback = null) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return fallback;
}

async function getAutoMarkReleaseOnPushFromDb() {
  loadDotEnv('.env.local');
  loadDotEnv('.env');

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return null;

  try {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false },
    });
    const { data: rpcValue, error: rpcError } = await anonClient.rpc('get_auto_mark_release_on_push');
    if (!rpcError) {
      return parseBooleanString(rpcValue, null);
    }

    if (!supabaseServiceRoleKey) return null;

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await serviceClient
      .from('experiment_settings')
      .select('setting_value')
      .eq('setting_key', AUTO_MARK_RELEASE_SETTING_KEY)
      .maybeSingle();

    if (error) return null;

    return parseBooleanString(data?.setting_value ?? null, null);
  } catch {
    return null;
  }
}

function matchesRelevant(path) {
  return RELEVANT_PATTERNS.some((pattern) => pattern.test(path));
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function toLines(value) {
  if (!value) return [];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function getChangedFiles() {
  const unstaged = toLines(safeRun('git diff --name-only'));
  const staged = toLines(safeRun('git diff --name-only --cached'));
  const untracked = toLines(safeRun('git ls-files --others --exclude-standard'));
  return Array.from(new Set([...unstaged, ...staged, ...untracked])).sort();
}

function getTrackedFiles() {
  return toLines(safeRun('git ls-files')).sort();
}

function ensureDirs() {
  mkdirSync(DOCS_SNAPSHOT_DIR, { recursive: true });
  mkdirSync(DOCS_DIFF_DIR, { recursive: true });
  mkdirSync(PUBLIC_SNAPSHOT_DIR, { recursive: true });
  mkdirSync(PUBLIC_DIFF_DIR, { recursive: true });
}

function getIsoParts(date) {
  const iso = date.toISOString();
  const day = iso.slice(0, 10);
  const compactTime = iso.slice(11, 19).replace(/:/g, '');
  return { iso, day, compactTime };
}

function getLatestVersionFallback() {
  const files = safeRun('ls -1 docs/changelog-import-*.json 2>/dev/null');
  const names = toLines(files).map((f) => basename(f));
  const withVersion = names
    .map((name) => {
      const match = name.match(/changelog-import-\d{4}-\d{2}-\d{2}-(v?\d+(?:\.\d+){0,2})/i);
      return match ? match[1].replace(/^v/i, '') : '';
    })
    .filter(Boolean);
  return withVersion.length > 0 ? withVersion[withVersion.length - 1] : '';
}

function resolveVersion(preferred) {
  if (preferred) return preferred;
  const latest = safeRun('node scripts/get-latest-changelog-version.mjs');
  if (latest) return latest;
  const fallback = getLatestVersionFallback();
  return fallback || 'unversioned';
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function getAutoMarkReleaseOnPushSetting() {
  const fromDb = await getAutoMarkReleaseOnPushFromDb();
  if (typeof fromDb === 'boolean') {
    return { value: fromDb, source: 'experiment_settings' };
  }

  const config = readJsonIfExists(PUSH_WORKFLOW_CONFIG_PATH);
  if (config && typeof config.auto_mark_release_on_push === 'boolean') {
    return {
      value: config.auto_mark_release_on_push,
      source: 'docs/push-workflow-config.json',
    };
  }

  return { value: true, source: 'default' };
}

function listFilesByMtime(dirPath, extension) {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((name) => extname(name) === extension)
    .map((name) => join(dirPath, name))
    .filter((path) => statSync(path).isFile())
    .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs);
}

function listSnapshotFiles() {
  return listFilesByMtime(DOCS_SNAPSHOT_DIR, '.json');
}

function compareSnapshots(prevSnapshot, nextSnapshot) {
  const prevMap = new Map((prevSnapshot?.relevant_files || []).map((f) => [f.path, f.sha256]));
  const nextMap = new Map((nextSnapshot.relevant_files || []).map((f) => [f.path, f.sha256]));

  const added = [];
  const removed = [];
  const changed = [];

  for (const [path, hash] of nextMap.entries()) {
    if (!prevMap.has(path)) {
      added.push(path);
      continue;
    }
    if (prevMap.get(path) !== hash) {
      changed.push(path);
    }
  }

  for (const path of prevMap.keys()) {
    if (!nextMap.has(path)) removed.push(path);
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
  };
}

function buildDiffMarkdown(prevSnapshot, nextSnapshot, diff) {
  const lines = [];
  lines.push('# System Design Diff');
  lines.push('');
  lines.push(`- From: ${prevSnapshot ? prevSnapshot.snapshot_id : 'none'}`);
  lines.push(`- To: ${nextSnapshot.snapshot_id}`);
  lines.push(`- Version: ${nextSnapshot.version}`);
  lines.push(`- Generated at: ${nextSnapshot.generated_at}`);
  lines.push(`- Release status: ${nextSnapshot.release_status}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Added files: ${diff.added.length}`);
  lines.push(`- Removed files: ${diff.removed.length}`);
  lines.push(`- Changed files: ${diff.changed.length}`);
  lines.push('');

  const renderSection = (title, items) => {
    lines.push(`## ${title}`);
    lines.push('');
    if (items.length === 0) {
      lines.push('- None');
    } else {
      for (const item of items) lines.push(`- \`${item}\``);
    }
    lines.push('');
  };

  renderSection('Changed Files', diff.changed);
  renderSection('Added Files', diff.added);
  renderSection('Removed Files', diff.removed);

  lines.push('## Review Checklist');
  lines.push('');
  lines.push('- Validate participant and researcher flow impacts in changelog details.');
  lines.push('- Confirm high-risk changes include rollback notes.');
  lines.push('- Confirm push approval before final commit/push.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function writePublicManifest() {
  const snapshots = listFilesByMtime(PUBLIC_SNAPSHOT_DIR, '.json').map((path) => `snapshots/${basename(path)}`);
  const diffs = listFilesByMtime(PUBLIC_DIFF_DIR, '.md').map((path) => `diffs/${basename(path)}`);

  const manifest = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    latest_snapshot: snapshots.length > 0 ? snapshots[snapshots.length - 1] : null,
    latest_diff: diffs.length > 0 ? diffs[diffs.length - 1] : null,
    snapshots,
    diffs,
  };

  writeFileSync(PUBLIC_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDirs();

  const changedFiles = getChangedFiles();
  const relevantChangedFiles = changedFiles.filter(matchesRelevant);

  const version = resolveVersion(args.version);
  const autoMarkReleaseSetting = await getAutoMarkReleaseOnPushSetting();
  const autoMarkReleaseOnPush = autoMarkReleaseSetting.value;
  const now = new Date();
  const { iso, day, compactTime } = getIsoParts(now);
  const versionTag = version.replace(/[^0-9a-zA-Z.-]/g, '-');

  const snapshotFiles = listSnapshotFiles();
  const prevSnapshotPath = snapshotFiles.length > 0 ? snapshotFiles[snapshotFiles.length - 1] : '';
  const prevSnapshot = prevSnapshotPath ? readJsonIfExists(prevSnapshotPath) : null;

  const shouldWrite = args.force || relevantChangedFiles.length > 0 || (prevSnapshot && prevSnapshot.version !== version);
  if (!shouldWrite) {
    process.stdout.write(
      `${JSON.stringify(
        {
          updated: false,
          reason: 'No relevant System Design changes detected.',
          relevant_changed_files: [],
          version,
          auto_mark_release_on_push: autoMarkReleaseOnPush,
          auto_mark_release_on_push_source: autoMarkReleaseSetting.source,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const relevantTrackedFiles = getTrackedFiles().filter(matchesRelevant);
  const relevantFileData = relevantTrackedFiles
    .filter((path) => existsSync(join(ROOT, path)))
    .map((path) => {
      const abs = join(ROOT, path);
      const content = readFileSync(abs, 'utf8');
      return {
        path,
        sha256: sha256(content),
        bytes: Buffer.byteLength(content, 'utf8'),
      };
    });

  const snapshotId = `${day}-${compactTime}-${versionTag}`;
  const snapshotFileName = `system-design-snapshot-${snapshotId}.json`;
  const docsSnapshotPath = join(DOCS_SNAPSHOT_DIR, snapshotFileName);
  const publicSnapshotPath = join(PUBLIC_SNAPSHOT_DIR, snapshotFileName);

  const snapshot = {
    schema_version: 1,
    snapshot_id: snapshotId,
    generated_at: iso,
    version,
    release_status: args.releaseStatus,
    auto_mark_release_on_push: autoMarkReleaseOnPush,
    auto_mark_release_on_push_source: autoMarkReleaseSetting.source,
    reason: args.reason || null,
    relevant_changed_files: relevantChangedFiles,
    relevant_files: relevantFileData,
    diagram_source: 'src/lib/study-map/masterDiagram.ts',
    git: {
      branch: safeRun('git branch --show-current'),
      head: safeRun('git rev-parse --short HEAD') || null,
      dirty: changedFiles.length > 0,
    },
  };

  const snapshotJson = `${JSON.stringify(snapshot, null, 2)}\n`;
  writeFileSync(docsSnapshotPath, snapshotJson, 'utf8');
  writeFileSync(publicSnapshotPath, snapshotJson, 'utf8');

  const diff = compareSnapshots(prevSnapshot, snapshot);
  const prevId = prevSnapshot?.snapshot_id || 'none';
  const diffFileName = `system-design-diff-${prevId}-to-${snapshotId}.md`;
  const docsDiffPath = join(DOCS_DIFF_DIR, diffFileName);
  const publicDiffPath = join(PUBLIC_DIFF_DIR, diffFileName);
  const diffMarkdown = buildDiffMarkdown(prevSnapshot, snapshot, diff);
  writeFileSync(docsDiffPath, diffMarkdown, 'utf8');
  writeFileSync(publicDiffPath, diffMarkdown, 'utf8');

  const manifest = writePublicManifest();

  process.stdout.write(
    `${JSON.stringify(
      {
        updated: true,
        version,
        snapshot: relative(ROOT, docsSnapshotPath),
        diff: relative(ROOT, docsDiffPath),
        public_snapshot: relative(ROOT, publicSnapshotPath),
        public_diff: relative(ROOT, publicDiffPath),
        manifest: relative(ROOT, PUBLIC_MANIFEST_PATH),
        latest_manifest_snapshot: manifest.latest_snapshot,
        latest_manifest_diff: manifest.latest_diff,
        relevant_changed_files: relevantChangedFiles,
        summary: {
          changed: diff.changed.length,
          added: diff.added.length,
          removed: diff.removed.length,
        },
        auto_mark_release_on_push: autoMarkReleaseOnPush,
        auto_mark_release_on_push_source: autoMarkReleaseSetting.source,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`generate-system-design-artifacts failed: ${message}\n`);
  process.exit(1);
});
