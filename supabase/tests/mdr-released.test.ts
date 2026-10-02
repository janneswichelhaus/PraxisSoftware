import { beforeAll, describe, expect, it } from 'vitest';
import { asPostgres, resetDatabase } from './helpers/db';
import { MDR_REVIEW_REQUIRED } from '../../src/app/mdr';

/**
 * Die MDR-Sperre auf dem Server (ABN-019, BEF-110, ANN-089): Solange kein
 * Freigabevermerk mit Pruefdokument vorliegt, ist keine klassifizierte
 * Funktion freigegeben - fuer jede Kennung des Registers antwortet
 * `app.mdr_released` mit false.
 */
describe('app.mdr_released', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('gibt keine Kennung des Registers frei', async () => {
    for (const eintrag of MDR_REVIEW_REQUIRED) {
      const { rows } = await asPostgres<{ frei: boolean }>('select app.mdr_released($1) as frei', [
        eintrag.id,
      ]);
      expect(rows[0]!.frei, eintrag.id).toBe(false);
    }
  });

  it('haelt Register und Server deckungsgleich: ein Vermerk am Eintrag verlangt die Freigabe im Server', () => {
    // Heute traegt kein Eintrag einen Vermerk. Kommt einer, muss die Migration
    // ihn auch hier freigeben - und dieser Test wird dann angepasst, im Diff.
    expect(MDR_REVIEW_REQUIRED.filter((e) => e.freigabe !== undefined)).toEqual([]);
  });
});
