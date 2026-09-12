import { describe, expect, it } from 'vitest';
import { alsFormularfehler } from './formularfehler';

describe('alsFormularfehler', () => {
  const beschriftungen = { given_name: 'Vorname', family_name: 'Nachname', city: 'Ort' } as const;
  const reihenfolge = ['given_name', 'family_name', 'city'] as const;
  const kennung = (feld: keyof typeof beschriftungen) => `feld-${feld}`;

  it('folgt der Feldreihenfolge, nicht der Fundreihenfolge', () => {
    const liste = alsFormularfehler(
      reihenfolge,
      beschriftungen,
      { city: 'Fehlt.', given_name: 'Fehlt auch.' },
      kennung,
    );

    expect(liste.map((eintrag) => eintrag.feld)).toEqual(['Vorname', 'Ort']);
  });

  it('lässt Felder ohne Fehler aus und trägt Kennung und Beschriftung', () => {
    const liste = alsFormularfehler(
      reihenfolge,
      beschriftungen,
      { family_name: 'Bitte ausfüllen.' },
      kennung,
    );

    expect(liste).toEqual([
      { feldId: 'feld-family_name', feld: 'Nachname', meldung: 'Bitte ausfüllen.' },
    ]);
  });

  it('nennt nur Felder, die in der übergebenen Reihenfolge stehen', () => {
    // Der Mitarbeiterdatensatz blendet die Privatangaben für das Office aus
    // (ANN-024). Ein Eintrag dorthin führte ins Leere.
    const liste = alsFormularfehler<keyof typeof beschriftungen>(
      ['given_name'],
      beschriftungen,
      { given_name: 'Fehlt.', city: 'Fehlt ebenfalls.' },
      kennung,
    );

    expect(liste).toHaveLength(1);
    expect(liste[0]!.feldId).toBe('feld-given_name');
  });
});
