import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Unerwartete Antwort beim Therapiebericht (BEF-070, Muster R3-023): Anlegen,
 * Korrigieren und Speichern melden einen deutschen Satz statt des
 * englischen Prüftexts.
 */

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { berichtAnlegen, berichtKorrigieren, berichtSpeichern } = await import('./api');

const VERORDNUNG = '88888888-8888-4888-8888-000000000004';
const BERICHT = '99999999-9999-4999-8999-000000000002';

async function meldung(vorgang: () => Promise<unknown>): Promise<string> {
  try {
    await vorgang();
  } catch (fehler) {
    return (fehler as Error).message;
  }
  throw new Error('Der Vorgang hätte scheitern müssen.');
}

describe('Unerwartete Antwortform beim Therapiebericht', () => {
  beforeEach(() => {
    rpc.mockReset();
    // Kein Fehler, aber auch keine Kennung.
    rpc.mockResolvedValue({ data: 42, error: null });
  });

  it('Anlegen', async () => {
    const satz = await meldung(() => berichtAnlegen(VERORDNUNG));
    expect(satz).toBe('Der Therapiebericht konnte nicht angelegt werden.');
    expect(satz).not.toMatch(/expected|invalid_type/);
  });

  it('Korrigieren', async () => {
    expect(await meldung(() => berichtKorrigieren(VERORDNUNG, BERICHT, 'Tippfehler'))).toBe(
      'Die Korrektur konnte nicht angelegt werden.',
    );
  });

  it('Speichern', async () => {
    const satz = await meldung(() =>
      berichtSpeichern(
        BERICHT,
        { text: 'Verlauf', empfehlung: '', eintraege: [], koerperschema: null },
        '2027-05-12T09:00:00Z',
      ),
    );
    expect(satz).toBe('Der Bericht konnte nicht gespeichert werden.');
    expect(satz.startsWith('[')).toBe(false);
  });
});
