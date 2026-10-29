import { describe, expect, it } from 'vitest';
import {
  eintragenAdresse,
  ernaehrungAdresse,
  literZahl,
  literZiel,
  tagName,
  tagZeilen,
  tagebuchAdresse,
  tagebuchVonDerErnaehrung,
  zurueckZumTag,
} from './tagebuchAdresse';

/** Wege, Tage und Mengen des Tagebuchs (Handoff 2026-10-29, Abschnitt 0 und 5.7). */

const HEUTE = '2026-10-29';
const VON_DER_UEBERSICHT = `?bereich=treatment&zurueck=${encodeURIComponent('/p?bereich=treatment')}`;

function suche(adresse: string): string {
  return new URL(adresse, 'https://plattform.invalid').search;
}

describe('Wege des Tagebuchs', () => {
  it('nimmt die Herkunft über das Eintragen mit zurück zum Tag', () => {
    const eintragen = eintragenAdresse(HEUTE, 'lunch', VON_DER_UEBERSICHT, HEUTE);
    expect(eintragen.startsWith('/p/ernaehrung/tagebuch/eintragen?')).toBe(true);
    const parameter = new URLSearchParams(suche(eintragen));
    expect(parameter.get('mahlzeit')).toBe('lunch');
    expect(parameter.get('tag')).toBe(HEUTE);
    // Der Rückweg des Eintragens ist der Tag samt dessen eigenem Rückweg zur Übersicht.
    const tag = `/p/ernaehrung/tagebuch${VON_DER_UEBERSICHT}`;
    expect(parameter.get('zurueck')).toBe(tag);
    expect(zurueckZumTag(suche(eintragen), HEUTE, HEUTE)).toBe(tag);
  });

  it('behält einen anderen Tag in der Adresse, heute fällt er weg', () => {
    const eintragen = eintragenAdresse('2026-10-27', 'dinner', '?bereich=treatment&tag=2026-10-27');
    expect(zurueckZumTag(suche(eintragen), '2026-10-27')).toBe(
      '/p/ernaehrung/tagebuch?bereich=treatment&tag=2026-10-27',
    );
    expect(tagebuchAdresse(HEUTE, '?bereich=treatment&tag=2026-10-28', HEUTE)).toBe(
      '/p/ernaehrung/tagebuch?bereich=treatment',
    );
    expect(tagebuchAdresse('2026-10-28', VON_DER_UEBERSICHT, HEUTE)).toBe(
      `/p/ernaehrung/tagebuch${VON_DER_UEBERSICHT}&tag=2026-10-28`,
    );
  });

  it('folgt ohne Rückweg oder mit fremdem Ziel dem Tag ohne Herkunft', () => {
    expect(zurueckZumTag('?bereich=treatment&tag=2026-10-27&mahlzeit=lunch', '2026-10-27')).toBe(
      '/p/ernaehrung/tagebuch?bereich=treatment&tag=2026-10-27',
    );
    for (const fremd of [
      '//fremd.invalid/p/ernaehrung/tagebuch',
      '/p/ich',
      'https://fremd.invalid',
    ]) {
      expect(
        zurueckZumTag(
          `?bereich=treatment&mahlzeit=snack&zurueck=${encodeURIComponent(fremd)}`,
          null,
        ),
      ).toBe('/p/ernaehrung/tagebuch?bereich=treatment');
    }
  });

  it('führt zwischen Ernährung und Tagebuch ohne Tag und ohne Herkunft', () => {
    expect(ernaehrungAdresse(`${VON_DER_UEBERSICHT}&tag=2026-10-27`)).toBe(
      '/p/ernaehrung?bereich=treatment',
    );
    expect(
      tagebuchVonDerErnaehrung(`?bereich=training&zurueck=${encodeURIComponent('/p/ich')}`),
    ).toBe('/p/ernaehrung/tagebuch?bereich=training');
    expect(ernaehrungAdresse('')).toBe('/p/ernaehrung');
  });
});

describe('Tage und Mengen des Tagebuchs', () => {
  it('nennt den Tag in zwei Zeilen, auch heute und gestern mit Datum', () => {
    expect(tagZeilen(HEUTE, HEUTE)).toEqual({
      name: 'Heute',
      datum: 'Donnerstag, 29.\u00a0Oktober',
    });
    expect(tagZeilen('2026-10-28', HEUTE)).toEqual({
      name: 'Gestern',
      datum: 'Mittwoch, 28.\u00a0Oktober',
    });
    expect(tagZeilen('2026-10-27', HEUTE)).toEqual({ name: 'Dienstag', datum: '27.\u00a0Oktober' });
    expect(tagName('2026-10-27', HEUTE)).toBe('Dienstag, 27.\u00a0Oktober');
    expect(tagName(HEUTE, HEUTE)).toBe('Heute');
  });

  it('schreibt Wasser in Litern mit bis zu zwei Stellen, das Ziel mit einer', () => {
    expect(literZahl(500)).toBe('0,5');
    expect(literZahl(750)).toBe('0,75');
    expect(literZahl(2000)).toBe('2');
    expect(literZahl(1250)).toBe('1,25');
    expect(literZahl(0)).toBe('0');
    expect(literZahl(2570)).toBe('2,57');
    expect(literZiel(2570)).toBe('2,6\u00a0l');
    expect(literZiel(2000)).toBe('2,0\u00a0l');
  });
});
