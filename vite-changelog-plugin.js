import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);
const docsDir = path.join(root, 'docs');
const outDir = path.join(root, 'public', 'changelog');

const PREFIX = 'changelog-import-';
const SUFFIX = '.json';

function getChangelogFilenames() {
  if (!fs.existsSync(docsDir)) return [];
  return fs.readdirSync(docsDir).filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX));
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

export function changelogPlugin() {
  return {
    name: 'changelog-copy',
    buildStart() {
      copyChangelogFiles();
    },
    // In dev: serve /changelog/* directly from docs/ so no restart needed and responses are JSON, not SPA index.html
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (!url.startsWith('/changelog/')) return next();

        if (url === '/changelog/manifest.json') {
          const names = getChangelogFilenames();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(names));
          return;
        }

        const name = decodeURIComponent(path.basename(url));
        if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) return next();
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
