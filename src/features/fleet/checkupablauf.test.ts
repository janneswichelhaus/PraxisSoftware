import { describe, expect, it } from 'vitest';
import {
  ABSCHLUSS,
  BEISPIEL,
  PRUEFPUNKTE,
  SCHRITTE,
  SEITEN,
  START,
  WERBUNG,
  alleSeiten,
  allesBeantwortet,
  bewertungen,
  einzigesBauteil,
  fortschritt,
  fotoSeite,
  nachDemFoto,
  nachDerAntwort,
  nachDerWerbung,
  punktSeite,
  vorigeSeite,
  wasSeite,
  werbeflaechenText,
  zusammenfassung,
} from './checkupablauf';
import { CHECK_ITEMS } from './bike3d/zones';

/** Der geführte Check-Up ohne Oberfläche (FLT-005, ANN-563). */
describe('Ablauf des geführten Check-Ups', () => {
  it('geht nach jeder Antwort zum nächsten Punkt, nach dem zwölften zu Werbeflächen und Fotos (ANN-568)', () => {
    expect(PRUEFPUNKTE).toBe(12);
    expect(SCHRITTE).toBe(17);
    expect(START).toEqual(punktSeite(0));
    expect(nachDerAntwort(0, false)).toEqual(punktSeite(1));
    expect(nachDerAntwort(10, false)).toEqual(punktSeite(11));
    expect(nachDerAntwort(11, false)).toEqual(WERBUNG);
    expect(nachDerWerbung(false)).toEqual(fotoSeite(0));
    expect(nachDemFoto(0, false)).toEqual(fotoSeite(1));
    expect(nachDemFoto(3, false)).toEqual(ABSCHLUSS);
  });

  it('fotografiert links, vorne, rechts, hinten - ein Gang ums Rad', () => {
    expect(SEITEN.map((seite) => seite.key)).toEqual(['left', 'front', 'right', 'back']);
    expect(SEITEN.map((seite) => seite.titel)).toEqual([
      'Foto von links',
      'Foto von vorne',
      'Foto von rechts',
      'Foto von hinten',
    ]);
  });

  it('kehrt nach einer Änderung aus dem Abschluss dorthin zurück', () => {
    expect(nachDerAntwort(3, true)).toEqual(ABSCHLUSS);
    expect(vorigeSeite(punktSeite(3), true)).toEqual(ABSCHLUSS);
    expect(nachDerAntwort(11, true)).toEqual(ABSCHLUSS);
    expect(nachDerWerbung(true)).toEqual(ABSCHLUSS);
    expect(nachDemFoto(1, true)).toEqual(ABSCHLUSS);
    expect(vorigeSeite(WERBUNG, true)).toEqual(ABSCHLUSS);
    expect(vorigeSeite(fotoSeite(2), true)).toEqual(ABSCHLUSS);
  });

  it('führt „← Zurück“ dorthin, woher man kam, dann zum vorigen Punkt', () => {
    expect(vorigeSeite(wasSeite(4, true), false)).toEqual(punktSeite(4, 'wo'));
    // Über das Rad oder ohne Wahl des Bauteils gekommen: zurück zur Frage.
    expect(vorigeSeite(wasSeite(4, false), false)).toEqual(punktSeite(4));
    expect(vorigeSeite(punktSeite(4, 'wo'), false)).toEqual(punktSeite(4));
    expect(vorigeSeite(punktSeite(4), false)).toEqual(punktSeite(3));
    expect(vorigeSeite(START, false)).toBeNull();
    expect(vorigeSeite(ABSCHLUSS, false)).toEqual(fotoSeite(3));
    expect(vorigeSeite(fotoSeite(1), false)).toEqual(fotoSeite(0));
    expect(vorigeSeite(fotoSeite(0), false)).toEqual(WERBUNG);
    expect(vorigeSeite(WERBUNG, false)).toEqual(punktSeite(11));
    expect(vorigeSeite({ art: 'weitere' }, false)).toEqual(ABSCHLUSS);
  });

  it('zeigt „Prüfpunkt n von 12“, „Foto n von 4“ und im Abschluss den vollen Balken', () => {
    expect(fortschritt(punktSeite(2, 'wo'))).toEqual({ text: 'Prüfpunkt 3 von 12', wert: 3 });
    expect(fortschritt(WERBUNG)).toEqual({ text: 'Reinigung', wert: 13 });
    expect(fortschritt(fotoSeite(0))).toEqual({ text: 'Foto 1 von 4', wert: 14 });
    expect(fortschritt(fotoSeite(3))).toEqual({ text: 'Foto 4 von 4', wert: 17 });
    expect(fortschritt(ABSCHLUSS)).toEqual({ text: 'Abschluss', wert: 17 });
  });

  it('verlangt alle vier Seiten und sagt, was mit den Werbeflächen war', () => {
    const foto = new Blob(['x']);
    expect(alleSeiten({ left: foto, front: foto, right: foto })).toBe(false);
    expect(alleSeiten({ left: foto, front: foto, right: foto, back: foto })).toBe(true);
    expect(werbeflaechenText({ wert: 'wiped' })).toBe('Abgewischt');
    expect(werbeflaechenText({ wert: 'not_possible', grund: ' Kein Tuch ' })).toBe(
      'Nicht möglich: Kein Tuch',
    );
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

  it('fragt „Wo genau?“ nur bei Punkten mit mehreren Bauteilen', () => {
    expect(einzigesBauteil('transportbox')).toBe('transportbox');
    expect(einzigesBauteil('schrauben_sattel')).toBe('sattel');
    expect(einzigesBauteil('bremsen')).toBeNull();
    expect(CHECK_ITEMS.filter((item) => einzigesBauteil(item.key) !== null)).toHaveLength(7);
  });

  it('hat für jeden Punkt ein eigenes Beispiel', () => {
    for (const item of CHECK_ITEMS) expect(BEISPIEL[item.key]).toMatch(/^z\. B\. /);
    expect(new Set(Object.values(BEISPIEL)).size).toBe(PRUEFPUNKTE);
  });

  it('erkennt, wenn noch ein Punkt fehlt', () => {
    expect(allesBeantwortet({ reifen: { rating: 'ok', note: '' } })).toBe(false);
  });
});
