import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname);
const docsDir = path.join(root, 'docs');
const outDir = path.join(root, 'public', 'changelog');

const PREFIX = 'changelog-import-';
const SUFFIX = '.json';

function copyChangelogFiles() {
  if (!fs.existsSync(docsDir)) return;
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const names = fs.readdirSync(docsDir).filter((n) => n.startsWith(PREFIX) && n.endsWith(SUFFIX));
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
  };
}
