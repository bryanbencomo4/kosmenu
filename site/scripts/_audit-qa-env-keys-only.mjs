/** List env KEY NAMES only from preview/staging files. No values. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const files = [
  join(process.cwd(), '..', '.env.preview.local'),
  join(process.cwd(), '..', '.env.preview.keys'),
  join(process.cwd(), '.env.preview.check'),
  join(process.cwd(), '.env.staging.local'),
];

for (const f of files) {
  console.log('FILE', f.replace(/\\/g, '/'), 'exists=', existsSync(f));
  if (!existsSync(f)) continue;
  const keys = [];
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    keys.push(t.slice(0, i).trim());
  }
  console.log(
    'KEYS',
    keys.filter((k) => /SUPABASE|PREVIEW|STAGING|PLATFORM_WA|BUSINESS/i.test(k)).join(', '),
  );
}
