import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Demo content used when Supabase is not configured (and by the test mock server). */
export function loadDemo() {
  const raw = JSON.parse(fs.readFileSync(path.join(root, 'data/demo.json'), 'utf8'));
  const now = Date.now();
  raw.schedule = raw.schedule.map(({ starts_in_hours, ...e }) => ({
    ...e,
    starts_at: e.starts_at || new Date(now + (starts_in_hours || 0) * 3600 * 1000).toISOString()
  }));
  return raw;
}
