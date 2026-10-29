import { describe, expect, it } from 'vitest';
import type { ScoreItem } from '@/features/clinical/assessments/schema';
import { FRAGEN_JE_SCHRITT, bogenschritte, schrittTitel } from './bogenschritte';
import { fuerDiePlattform } from './instrumentwahl';

/**
 * Die Regel für Bögen ohne Themenplan (ANN-467): Schritte zu höchstens acht Fragen, nie mitten in
 * einer Gruppe; der Anamnesebogen steht seit Schritt 4c in Themen (`bogenthemen.ts`).
 */
describe('bogenschritte', () => {
  it('schneidet nach Nummer und Hinweis, nie mitten in einer Gruppe (ANN-467)', () => {
    const items = fuerDiePlattform()[0]!.items;
    const schritte = bogenschritte(items);
    // Nichts geht verloren, nichts doppelt, die Reihenfolge bleibt.
    expect(schritte.flat().map((i) => i.id)).toEqual(items.map((i) => i.id));
    for (const [index, schritt] of schritte.entries()) {
      const naechster = schritte[index + 1]?.[0];
      const letzte = schritt.at(-1)!;
      if (!naechster) continue;
      if (letzte.nummer !== undefined) expect(naechster.nummer).not.toBe(letzte.nummer);
      if (letzte.hinweis !== undefined) expect(naechster.hinweis).not.toBe(letzte.hinweis);
    }
    // Höchstens acht Fragen je Schritt, außer eine Gruppe ist selbst länger.
    expect(schritte.every((s) => s.length <= FRAGEN_JE_SCHRITT)).toBe(true);
  });

  it('nennt einen Schritt nach den Nummern des Bogens', () => {
    const frage = (nummer?: number) =>
      ({
        id: `f${nummer ?? 0}`,
        ...(nummer === undefined ? {} : { nummer }),
      }) as unknown as ScoreItem;
    expect(schrittTitel([frage(13), frage(14), frage(20)])).toBe('Fragen 13 bis 20');
    expect(schrittTitel([frage(39)])).toBe('Frage 39');
    expect(schrittTitel([frage()])).toBe('Zu Ihrer Person');
  });
});
