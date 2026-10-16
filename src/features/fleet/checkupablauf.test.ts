import { describe, expect, it } from 'vitest';
import {
  ABSCHLUSS,
  PRUEFPUNKTE,
  START,
  allesBeantwortet,
  bewertungen,
  fortschritt,
  nachDerAntwort,
  punktSeite,
  vorigeSeite,
  zusammenfassung,
} from './checkupablauf';
import { CHECK_ITEMS } from './bike3d/zones';

/** Der geführte Check-Up ohne Oberfläche (FLT-005, ANN-562). */
describe('Ablauf des geführten Check-Ups', () => {
  it('geht nach jeder Antwort zum nächsten Punkt und nach dem zwölften zum Abschluss', () => {
    expect(PRUEFPUNKTE).toBe(12);
    expect(START).toEqual(punktSeite(0));
    expect(nachDerAntwort(0, false)).toEqual(punktSeite(1));
    expect(nachDerAntwort(10, false)).toEqual(punktSeite(11));
    expect(nachDerAntwort(11, false)).toEqual(ABSCHLUSS);
  });

  it('kehrt nach einer Änderung aus dem Abschluss dorthin zurück', () => {
    expect(nachDerAntwort(3, true)).toEqual(ABSCHLUSS);
    expect(vorigeSeite(punktSeite(3), true)).toEqual(ABSCHLUSS);
  });

  it('führt „← Zurück“ erst durch die Fragen des Punkts, dann zum vorigen Punkt', () => {
    expect(vorigeSeite(punktSeite(4, 'was'), false)).toEqual(punktSeite(4, 'wo'));
    expect(vorigeSeite(punktSeite(4, 'wo'), false)).toEqual(punktSeite(4));
    expect(vorigeSeite(punktSeite(4), false)).toEqual(punktSeite(3));
    expect(vorigeSeite(START, false)).toBeNull();
    expect(vorigeSeite(ABSCHLUSS, false)).toEqual(punktSeite(11));
    expect(vorigeSeite({ art: 'weitere' }, false)).toEqual(ABSCHLUSS);
  });

  it('zeigt „Prüfpunkt n von 12“ und im Abschluss den vollen Balken', () => {
    expect(fortschritt(punktSeite(2, 'wo'))).toEqual({ text: 'Prüfpunkt 3 von 12', wert: 3 });
    expect(fortschritt(ABSCHLUSS)).toEqual({ text: 'Abschluss', wert: 12 });
  });

  it('hebt eine Antwort mit den Stellen ihres Punkts an, nie ab (ANN-555)', () => {
    const antworten = Object.fromEntries(
      CHECK_ITEMS.map((item) => [item.key, { rating: 'ok', note: '' }]),
    ) as Parameters<typeof bewertungen>[0];
    antworten.reifen = { rating: 'problem', note: 'abgefahren' };
    const bewertet = bewertungen(antworten, [
      { zone: 'bremse-vorne', severity: 'beobachten' },
      { zone: 'reifen-vorne', severity: 'beobachten' },
      { zone: 'rahmen', severity: 'problem' },
    ]);
    expect(bewertet.bremsen).toBe('beobachten');
    expect(bewertet.reifen).toBe('problem');
    expect(bewertet.akku).toBe('ok');
    expect(allesBeantwortet(antworten)).toBe(true);
    expect(
      zusammenfassung(bewertet, [
        { zone: 'bremse-vorne', severity: 'beobachten' },
        { zone: 'reifen-vorne', severity: 'beobachten' },
        { zone: 'rahmen', severity: 'problem' },
      ]),
    ).toBe('2 Probleme · 1 zu beobachten · 3 Stellen am Rad markiert');
  });

  it('erkennt, wenn noch ein Punkt fehlt', () => {
    expect(allesBeantwortet({ reifen: { rating: 'ok', note: '' } })).toBe(false);
  });
});
