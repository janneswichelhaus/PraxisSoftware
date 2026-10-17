// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  ABSTAND_MINUTEN,
  heuteSchonGezeigt,
  hinweisJetzt,
  merkeGezeigt,
  passenderZeitpunkt,
  type EigenerTermin,
  type Hinweis,
} from './zwischendurch';

/** ANN-603: Hinweise zwischendurch - wann ein Fenster passt. */

const um = (zeit: string) => Date.parse(`2026-10-17T${zeit}:00Z`);
const termin = (von: string, bis: string, status = 'confirmed'): EigenerTermin => ({
  starts_at: `2026-10-17T${von}:00Z`,
  ends_at: `2026-10-17T${bis}:00Z`,
  status,
});

describe('passenderZeitpunkt', () => {
  it('wartet, solange die Termine nicht geladen sind', () => {
    expect(passenderZeitpunkt({ jetzt: um('10:00'), termine: null })).toBeNull();
  });

  it('passt an einem Tag ohne eigene Termine', () => {
    expect(passenderZeitpunkt({ jetzt: um('10:00'), termine: [] })).toBe('zwischendurch');
  });

  it('nie, während ein eigener Termin läuft', () => {
    const termine = [termin('09:30', '10:30')];
    expect(passenderZeitpunkt({ jetzt: um('09:30'), termine })).toBeNull();
    expect(passenderZeitpunkt({ jetzt: um('10:29'), termine })).toBeNull();
  });

  it(`nie, wenn der nächste eigene Termin näher als ${ABSTAND_MINUTEN} Minuten ist`, () => {
    const termine = [termin('08:00', '09:00'), termin('10:00', '11:00')];
    expect(passenderZeitpunkt({ jetzt: um('09:41'), termine })).toBeNull();
    // Genau zwanzig Minuten reichen.
    expect(passenderZeitpunkt({ jetzt: um('09:40'), termine })).toBe('zwischendurch');
    expect(passenderZeitpunkt({ jetzt: um('07:00'), termine })).toBe('zwischendurch');
  });

  it('beim Tagesabschluss, wenn alle Termine vorbei sind', () => {
    const termine = [termin('08:00', '09:00'), termin('10:00', '11:00')];
    expect(passenderZeitpunkt({ jetzt: um('11:00'), termine })).toBe('tagesabschluss');
  });

  it('zählt abgesagte Termine nicht', () => {
    const termine = [termin('10:00', '11:00', 'cancelled')];
    expect(passenderZeitpunkt({ jetzt: um('10:15'), termine })).toBe('zwischendurch');
    expect(passenderZeitpunkt({ jetzt: um('09:50'), termine })).toBe('zwischendurch');
  });
});

describe('hinweisJetzt', () => {
  const barometer: Hinweis = {
    schluessel: 'barometer-2026-10',
    titel: 'Barometer Oktober',
    text: 'Fünf kurze Fragen.',
    ziel: '/betrieb/barometer',
  };

  it('nimmt den ersten Hinweis, der heute noch nicht zu sehen war', () => {
    const anderer = { ...barometer, schluessel: 'anderer' };
    expect(
      hinweisJetzt({
        hinweise: [barometer, anderer],
        heute: '2026-10-17',
        jetzt: um('10:00'),
        termine: [],
        schonGezeigt: (schluessel) => schluessel === barometer.schluessel,
      }),
    ).toBe(anderer);
  });

  it('zeigt keinen, wenn der Zeitpunkt nicht passt oder nichts offen ist', () => {
    const lage = { heute: '2026-10-17', jetzt: um('10:00'), schonGezeigt: () => false };
    expect(
      hinweisJetzt({ ...lage, hinweise: [barometer], termine: [termin('09:30', '10:30')] }),
    ).toBeNull();
    expect(hinweisJetzt({ ...lage, hinweise: [], termine: [] })).toBeNull();
    expect(hinweisJetzt({ ...lage, hinweise: [barometer], termine: [] })).toBe(barometer);
  });
});

describe('Merker im Browser', () => {
  afterEach(() => window.localStorage.clear());

  it('merkt sich je Hinweis den Tag - einmal am Tag', () => {
    expect(heuteSchonGezeigt('barometer-2026-10', '2026-10-17')).toBe(false);
    merkeGezeigt('barometer-2026-10', '2026-10-17');
    expect(heuteSchonGezeigt('barometer-2026-10', '2026-10-17')).toBe(true);
    // Am nächsten Tag wieder; ein Eintrag je Hinweis, kein Verlauf.
    expect(heuteSchonGezeigt('barometer-2026-10', '2026-10-18')).toBe(false);
    merkeGezeigt('barometer-2026-10', '2026-10-18');
    expect(window.localStorage.length).toBe(1);
  });

  it('kommt ohne Speicher aus', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('gesperrt');
      },
    });
    try {
      expect(() => merkeGezeigt('x', '2026-10-17')).not.toThrow();
      expect(heuteSchonGezeigt('x', '2026-10-17')).toBe(false);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
