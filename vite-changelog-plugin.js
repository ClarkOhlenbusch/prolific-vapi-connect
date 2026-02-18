import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);
const docsDir = path.join(root, 'docs');
const outDir = path.join(root, 'public', 'changelog');

// Playwright run debug JSONs (docs/playwright-runs/ → public/playwright-runs/)
const playwrightRunsDocsDir = path.join(root, 'docs', 'playwright-runs');
const playwrightRunsOutDir = path.join(root, 'public', 'playwright-runs');
const PLAYWRIGHT_RUN_SUFFIX = '.debug.json';

function getPlaywrightRunFilenames() {
  if (!fs.existsSync(playwrightRunsDocsDir)) return [];
  return fs.readdirSync(playwrightRunsDocsDir).filter((n) => n.endsWith(PLAYWRIGHT_RUN_SUFFIX));
}

function copyPlaywrightRunFiles() {
  if (!fs.existsSync(playwrightRunsDocsDir)) return;
  if (!fs.existsSync(playwrightRunsOutDir)) fs.mkdirSync(playwrightRunsOutDir, { recursive: true });
  const names = getPlaywrightRunFilenames();
  for (const name of names) {
    fs.copyFileSync(path.join(playwrightRunsDocsDir, name), path.join(playwrightRunsOutDir, name));
  }
  fs.writeFileSync(path.join(playwrightRunsOutDir, 'manifest.json'), JSON.stringify(names));
}

const PREFIX_IMPORT = 'changelog-import-';
const PREFIX_MERGE = 'changelog-merge-';
const SUFFIX = '.json';
const SYSTEM_DESIGN_GENERATOR_SCRIPT = path.join(root, 'scripts', 'generate-system-design-artifacts.mjs');

function getChangelogFilenames() {
  if (!fs.existsSync(docsDir)) return [];
  return fs.readdirSync(docsDir).filter(
    (n) => n.endsWith(SUFFIX) && (n.startsWith(PREFIX_IMPORT) || n.startsWith(PREFIX_MERGE))
  );
}

function copyChangelogFiles() {
  if (!fs.existsSync(docsDir)) return;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const names = getChangelogFilenames();
  for (const name of names) {
    fs.copyFileSync(path.join(docsDir, name), path.join(outDir, name));
  }
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(names));
}

function runSystemDesignGenerator({
  version = '',
  releaseStatus = 'local_only',
  reason = 'manual UI trigger',
  force = false,
} = {}) {
  if (!fs.existsSync(SYSTEM_DESIGN_GENERATOR_SCRIPT)) {
    throw new Error('System Design generator script not found.');
  }

  const args = [SYSTEM_DESIGN_GENERATOR_SCRIPT];
  if (version) args.push('--version', version);
  if (releaseStatus) args.push('--release-status', releaseStatus);
  if (reason) args.push('--reason', reason);
  if (force) args.push('--force');

  const stdout = execFileSync('node', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error('Generator output is not valid JSON.');
  }
}

function runSystemDesignFileDiff({
  before = '',
  after = '',
  filePath = '',
} = {}) {
  if (!before || !after || !filePath) {
    throw new Error('Missing before, after, or path.');
  }

  const args = ['diff', '--no-color', '--unified=3', before, after, '--', filePath];
  const stdout = execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    before,
    after,
    path: filePath,
    diff: stdout || '',
  };
}

export function changelogPlugin() {
  return {
    name: 'changelog-copy',
    buildStart() {
      copyChangelogFiles();
      copyPlaywrightRunFiles();
    },
    // In dev: serve /changelog/* directly from docs/ so no restart needed and responses are JSON, not SPA index.html
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/system-design/generate') {
          const fullUrl = new URL(req.url || '/system-design/generate', 'http://localhost');
          const version = fullUrl.searchParams.get('version') || '';
          const releaseStatus = fullUrl.searchParams.get('release_status') || 'local_only';
          const reason = fullUrl.searchParams.get('reason') || 'manual UI trigger';
          const force = fullUrl.searchParams.get('force') === 'true';
          try {
            const payload = runSystemDesignGenerator({
              version,
              releaseStatus,
              reason,
              force,
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Failed to generate System Design artifacts.',
              }),
            );
          }
          return;
        }

        if (url === '/system-design/file-diff') {
          const fullUrl = new URL(req.url || '/system-design/file-diff', 'http://localhost');
          const before = fullUrl.searchParams.get('before') || '';
          const after = fullUrl.searchParams.get('after') || '';
          const filePath = fullUrl.searchParams.get('path') || '';
          try {
            const payload = runSystemDesignFileDiff({
              before,
              after,
              filePath,
            });
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Failed to load file diff.',
              }),
            );
          }
          return;
        }

        // Serve /playwright-runs/* from docs/playwright-runs/ in dev
        if (url.startsWith('/playwright-runs/')) {
          if (url === '/playwright-runs/manifest.json') {
            const names = getPlaywrightRunFilenames();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(names));
            return;
          }
          const name = decodeURIComponent(path.basename(url));
          if (!name.endsWith(PLAYWRIGHT_RUN_SUFFIX)) return next();
          const filePath = path.join(playwrightRunsDocsDir, name);
          if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
          }
          res.setHeader('Content-Type', 'application/json');
          res.end(fs.readFileSync(filePath, 'utf8'));
          return;
        }

        if (!url.startsWith('/changelog/')) return next();

        if (url === '/changelog/manifest.json') {
          const names = getChangelogFilenames();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(names));
          return;
        }

        const name = decodeURIComponent(path.basename(url));
        if ((!name.startsWith(PREFIX_IMPORT) && !name.startsWith(PREFIX_MERGE)) || !name.endsWith(SUFFIX)) return next();
        const filePath = path.join(docsDir, name);
        if (!fs.existsSync(filePath)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Not found' }));
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(fs.readFileSync(filePath, 'utf8'));
      });
    },
  };
}
