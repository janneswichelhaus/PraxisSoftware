import { describe, expect, it } from 'vitest';
import {
  AUDIOFORMATE,
  DIKTAT_ABSCHNITTE,
  DIKTAT_REGELN,
  HOECHST_BYTES,
  HOECHST_DAUER_S,
  ZWECKE,
  zweckAus,
} from './zwecke.ts';

/**
 * Die Zweckliste (ADR-005, PROJECT_PRINCIPLES.md 6.1): genau ein Zweck, mit
 * Eingabe, Adaptern, Ausgabe und den Regeln aus 6.3 für jeden künftigen
 * Adapter.
 */

describe('Zweckliste', () => {
  it('kennt genau einen Zweck: das Diktat zur Behandlungsdokumentation', () => {
    expect(Object.keys(ZWECKE)).toEqual(['dokumentation.diktat']);
    expect(zweckAus('dokumentation.diktat')?.kennung).toBe('dokumentation.diktat');
  });

  it.each([['Dokumentation.Diktat'], [''], [' dokumentation.diktat'], [null], [42], [{}]])(
    'kennt %j nicht',
    (wert) => {
      expect(zweckAus(wert)).toBeNull();
    },
  );

  it('erlaubt Ton in fünf Formaten, höchstens 10 MB und fünf Minuten, auf Deutsch', () => {
    const { eingabe } = ZWECKE['dokumentation.diktat'];
    expect([...eingabe.formate]).toEqual([
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
    ]);
    expect(eingabe.formate).toBe(AUDIOFORMATE);
    expect(eingabe.hoechstBytes).toBe(HOECHST_BYTES);
    expect(HOECHST_BYTES).toBe(10 * 1024 * 1024);
    expect(eingabe.hoechstDauerS).toBe(HOECHST_DAUER_S);
    expect(HOECHST_DAUER_S).toBe(300);
    expect(eingabe.sprache).toBe('de');
  });

  it('lässt bis zur Anbieterentscheidung nur die Nachbildung zu', () => {
    expect(ZWECKE['dokumentation.diktat'].adapter).toEqual(['mock']);
  });

  it('gibt Transkript und die vier Abschnitte der Vorlage aus', () => {
    expect(ZWECKE['dokumentation.diktat'].ausgabe.abschnitte).toEqual([
      'Angaben der Patient:in',
      'Befund',
      'Behandlung',
      'Plan',
    ]);
    expect(ZWECKE['dokumentation.diktat'].ausgabe.abschnitte).toBe(DIKTAT_ABSCHNITTE);
  });

  it.each([
    ['nichts ergänzen', /Nichts ergänzen/],
    [
      'keine Diagnose, keine Bewertung, keine Empfehlung',
      /keine Diagnose, keine Bewertung, keine Empfehlung/,
    ],
    ['nichts auslassen, nicht verdichten', /Nichts auslassen[^\n]*nicht verdichten/],
    ['nicht umformulieren, nur einordnen', /Nicht umformulieren[^\n]*zugeordnet/],
    ['Zahlen und Einheiten', /Zahlen, Einheiten/],
    ['Körperseiten', /Körperseiten/],
    ['Verneinungen', /Verneinungen/],
    ['Unsicherheiten', /Unsicherheiten/],
    ['Aussage der Patient:in gegen eigene Beobachtung', /Aussage der Patient:in[^\n]*Beobachtung/],
    ['[unverständlich] statt raten', /\[unverständlich\][^\n]*nie geraten/],
    ['diktierte Einschätzungen bleiben', /diktierte Einschätzungen[^\n]*bleiben erhalten/],
    ['leere Abschnitte entfallen', /bleibt leer und wird weggelassen/],
  ])('nennt in den Regeln für jeden Adapter: %s', (_punkt, muster) => {
    expect(DIKTAT_REGELN).toMatch(muster);
    expect(ZWECKE['dokumentation.diktat'].regeln).toBe(DIKTAT_REGELN);
  });

  it('nennt alle vier Abschnitte in den Regeln', () => {
    for (const titel of DIKTAT_ABSCHNITTE) expect(DIKTAT_REGELN).toContain(titel);
  });
});
