import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EREIGNISARTEN } from './verlaufsereignisse';

describe('Ereignisarten (ANN-106, ANN-364)', () => {
  it.each([
    'supabase/migrations/20260926110000_frb_002e_course_events.sql',
    'supabase/migrations/20261109100000_out_001_progress_events.sql',
  ])('sind dieselben wie in %s', (datei) => {
    const migration = readFileSync(datei, 'utf8');
    const zeile = /kind in \(([^)]*)\)/.exec(migration)![1]!;
    expect([...zeile.matchAll(/'([a-z]+)'/g)].map((m) => m[1])).toEqual([...EREIGNISARTEN]);
  });
});
