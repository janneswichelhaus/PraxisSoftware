import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Der Nachweis, dass „Alle Sitzungen beenden" hält, was es vermerkt (FIX-003).
 *
 * `MeinKontoPage.test.tsx` mockt dieses Modul vollständig — das Innere von
 * `api.ts` lief bisher in keinem Test. Genau darin lagen zwei Fehler: ein
 * `try`/`catch` um einen Aufruf, der nicht wirft, und ein Auditvermerk, dessen
 * Fehlschlag niemand bemerkt hätte.
 *
 * Geprüft wird die **Reihenfolge**, nicht nur das Ob. Sie ist bei
 * `sessions_ended` die Sache selbst: Nach dem Abmelden gibt es kein
 * `auth.uid()` mehr, mit dem sich noch etwas protokollieren ließe (ANN-044).
 */

const rpc = vi.fn();
const signOut = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, auth: { signOut, updateUser } }),
}));

const { KENNWORT_MINDESTLAENGE, aendereKennwort, beendeAlleSitzungen } = await import('./api');

/** Hält fest, in welcher Reihenfolge die beiden Aufrufe tatsächlich fielen. */
let ablauf: string[] = [];

beforeEach(() => {
  ablauf = [];
  rpc.mockReset();
  signOut.mockReset();
  updateUser.mockReset();

  rpc.mockImplementation((_name: string, args: { p_event: string }) => {
    ablauf.push(`rpc:${args.p_event}`);
    return Promise.resolve({ error: null });
  });
  signOut.mockImplementation(() => {
    ablauf.push('signOut');
    return Promise.resolve({ error: null });
  });
  updateUser.mockImplementation(() => {
    ablauf.push('updateUser');
    return Promise.resolve({ error: null });
  });
});

describe('beendeAlleSitzungen', () => {
  it('vermerkt vor dem Abmelden — danach gäbe es kein Konto mehr, dem der Vorgang zuzuordnen wäre', async () => {
    await beendeAlleSitzungen();

    expect(ablauf).toEqual(['rpc:sessions_ended', 'signOut']);
  });

  it('meldet den Vorgang global, nicht nur für dieses Gerät', async () => {
    await beendeAlleSitzungen();

    expect(signOut).toHaveBeenCalledWith({ scope: 'global' });
  });

  it('meldet sich nicht ab, wenn der Vermerk scheitert — sonst stünde der Vorgang in keinem Nachweis', async () => {
    rpc.mockResolvedValue({ error: { message: 'not authenticated' } });

    await expect(beendeAlleSitzungen()).rejects.toThrow();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('meldet einen Fehlschlag des Anmeldedienstes weiter', async () => {
    signOut.mockResolvedValue({ error: { message: 'network' } });

    await expect(beendeAlleSitzungen()).rejects.toThrow(
      'Die Sitzungen konnten nicht beendet werden.',
    );
  });
});

describe('aendereKennwort', () => {
  it('vermerkt erst nach dem Vorgang — hier ist die Sitzung danach noch da', async () => {
    await aendereKennwort('ein-langes-kennwort');

    expect(ablauf).toEqual(['updateUser', 'rpc:password_changed']);
  });

  it('stellt ein geändertes Kennwort nicht als Misserfolg dar, wenn nur der Vermerk scheitert', async () => {
    rpc.mockResolvedValue({ error: { message: 'audit down' } });
    const konsole = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(aendereKennwort('ein-langes-kennwort')).resolves.toBeUndefined();

    // Still bleiben darf er trotzdem nicht: der frühere try/catch fing nichts,
    // weil `rpc` bei einem Serverfehler regulär auflöst.
    expect(konsole).toHaveBeenCalledOnce();
    konsole.mockRestore();
  });

  it('meldet nichts, wenn das Kennwort gar nicht geändert wurde', async () => {
    updateUser.mockResolvedValue({ error: { message: 'weak password' } });

    await expect(aendereKennwort('kurz')).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Kennwort-Mindestlänge (ANN-027, R3-013)', () => {
  it('steht auch im Anmeldedienst, nicht nur im Formular', () => {
    // Das Formular prüft die Länge, damit die Person es früh erfährt —
    // durchsetzen muss sie der Anmeldedienst. Ohne diesen Eintrag gilt dort
    // der GoTrue-Standard von sechs Zeichen, und jeder Weg an diesem Formular
    // vorbei (Wiederherstellungslink, API, ein zweiter Client) setzt ein
    // kürzeres Kennwort durch.
    const toml = readFileSync(join(process.cwd(), 'supabase/config.toml'), 'utf8');
    const treffer = /^\s*minimum_password_length\s*=\s*(\d+)\s*$/m.exec(toml);

    expect(treffer).not.toBeNull();
    expect(Number(treffer?.[1])).toBe(KENNWORT_MINDESTLAENGE);
  });
});
