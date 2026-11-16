import { describe, expect, it } from 'vitest';
import { FEHLERKLASSEN as IM_BROWSER } from '@/features/calendar/slot-search/auto-booking-api';
import { STATUS } from './handler.ts';
import { FEHLERKLASSEN } from './typen.ts';

// Die Function bündelt nur ihr eigenes Verzeichnis und kann nicht aus `src/` importieren. Der
// Browser liest ihre Fehlerklassen aus einer eigenen Liste: Fehlt dort eine, hieße ein 404 mit dieser
// Klasse „nicht eingerichtet“ und jeder andere Status „unklar“.

describe('Fehlerklassen der automatischen Buchung', () => {
  it('stehen im Browser genauso wie in der Function', () => {
    expect([...IM_BROWSER]).toEqual([...FEHLERKLASSEN]);
  });

  it('haben jede einen HTTP-Status', () => {
    expect(Object.keys(STATUS).sort()).toEqual([...FEHLERKLASSEN].sort());
  });
});
