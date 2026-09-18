import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alleEntwuerfeVerwerfen,
  entwurfAblegen,
  entwurfAnsehen,
  entwurfEntfernen,
  entwurfVerordnerNachtragen,
  leereGrundlage,
  type TreatmentBasisDraft,
} from './api';

/**
 * Entwurfsspeicher für VER-003 (siehe api.ts) - eigener In-Memory-Speicher
 * statt TanStack-Query-Cache, damit ein Entwurf nicht der normalen
 * `gcTime`-Garbage-Collection zum Opfer fällt, bevor die Person von der
 * Verordner-Anlage zurückkehrt. Diese Tests prüfen genau die Eigenschaften,
 * die dafür sorgen müssen: Bindung an Vorgang und Benutzer, ein Verfallsdatum
 * jenseits von fünf Minuten und das Verwerfen bei Abmeldung.
 */
const RUECKPFAD = '/patienten/66666666-6666-4666-8666-000000000001/verordnungen/neu';
const BENUTZER_A = '11111111-1111-4111-8111-000000000001';
const BENUTZER_B = '11111111-1111-4111-8111-000000000002';

const ENTWURF: TreatmentBasisDraft = {
  werte: { ...leereGrundlage, frequency_note: '2x pro Woche' },
  positionen: [
    { id: null, remedy: 'Manuelle Therapie', prescribed_quantity: '6', used_quantity: '0' },
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
  alleEntwuerfeVerwerfen();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Entwurfsspeicher', () => {
  it('liefert einen abgelegten Entwurf unveraendert an dieselbe Person zurueck', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);
    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toEqual(ENTWURF);
  });

  it('ueberlebt mehr als fuenf Minuten - der fruehere Fehler war die Standard-gcTime von fuenf Minuten', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);

    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toEqual(ENTWURF);
  });

  it('verfaellt nach laengerer Zeit von selbst - ein abgebrochener Versuch taucht bei einem spaeteren, unabhaengigen Versuch nicht wieder auf', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);

    vi.advanceTimersByTime(31 * 60 * 1000);

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toBeUndefined();
  });

  it('gibt den Entwurf einer anderen Person nie zurueck', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_B)).toBeUndefined();
    // Und der eigentliche Entwurf bleibt fuer die richtige Person unberuehrt.
    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toEqual(ENTWURF);
  });

  it('entfernt einen Entwurf endgueltig - ein zweites Ansehen findet nichts mehr vor', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);

    entwurfEntfernen(RUECKPFAD, BENUTZER_A);

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toBeUndefined();
  });

  it('entfernen ohne vorhandenen Entwurf ist unschaedlich (React StrictMode ruft doppelt auf)', () => {
    expect(() => {
      entwurfEntfernen(RUECKPFAD, BENUTZER_A);
      entwurfEntfernen(RUECKPFAD, BENUTZER_A);
    }).not.toThrow();
  });

  it('traegt die neue Verordner:in in einen vorhandenen Entwurf derselben Person nach', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);

    entwurfVerordnerNachtragen(RUECKPFAD, BENUTZER_A, 'neue-verordner-id');

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toEqual({
      ...ENTWURF,
      neuerVerordnerId: 'neue-verordner-id',
    });
  });

  it('traegt nichts nach, wenn kein Entwurf vorliegt (Aufruf direkt aus der Verordnerkartei)', () => {
    expect(() =>
      entwurfVerordnerNachtragen(RUECKPFAD, BENUTZER_A, 'neue-verordner-id'),
    ).not.toThrow();
    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toBeUndefined();
  });

  it('traegt nichts in den Entwurf einer anderen Person nach', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);

    entwurfVerordnerNachtragen(RUECKPFAD, BENUTZER_B, 'fremde-verordner-id');

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toEqual(ENTWURF);
  });

  it('verwirft alle Entwuerfe aller Personen - Abmeldung (VER-003)', () => {
    entwurfAblegen(RUECKPFAD, BENUTZER_A, ENTWURF);
    entwurfAblegen('/patienten/anderer-patient/verordnungen/neu', BENUTZER_B, ENTWURF);

    alleEntwuerfeVerwerfen();

    expect(entwurfAnsehen(RUECKPFAD, BENUTZER_A)).toBeUndefined();
    expect(
      entwurfAnsehen('/patienten/anderer-patient/verordnungen/neu', BENUTZER_B),
    ).toBeUndefined();
  });
});
