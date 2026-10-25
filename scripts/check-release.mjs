// Scan only tracked release files. Never print a matching secret.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
if (!files.length) throw new Error('No tracked release files to check. Stage the intended release first.');
const forbiddenPath = /(?:^|\/)(?:private|node_modules|work|test-results|playwright-report|\.vercel|\.next[^/]*)(?:\/|$)|(?:^|\/)\.env(?!\.example$)|\.log$/i;
const forbiddenContent = [
  /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,
];
const originalIdentity = ['aziz' + 'pixels.me', 'abdul' + 'aziz', 'vel' + 'dope', 'manual:' + 'confirmed:'];
let failed = false;
for (const file of files) {
  if (forbiddenPath.test(file)) { console.error(`Excluded release path: ${file}`); failed = true; continue; }
  if (/\.(?:png|jpe?g|webp|gif|ico)$/i.test(file)) continue;
  const contents = readFileSync(file, 'utf8');
  if (forbiddenContent.some(pattern => pattern.test(contents)) || originalIdentity.some(value => contents.toLowerCase().includes(value))) {
    console.error(`Review possible secret or personal content in: ${file}`); failed = true;
  }
}
if (failed) process.exit(1);
console.log(`Release scan passed for ${files.length} tracked files.`);
