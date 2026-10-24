import { describe, expect, it } from 'vitest';
import { grussNachTageszeit, tageBis, tagUndMonat, zeitraumLang } from './zeit';

/** Zeiten der Übersicht (Handoff 2026-10-22, 5.1) auf der Uhr des Geräts (ANN-697). */
describe('grussNachTageszeit', () => {
  it('grüßt morgens von 5 bis 11, am Tag bis 18, dann am Abend', () => {
    const um = (stunde: number) => grussNachTageszeit(new Date(2026, 9, 22, stunde, 0));
    expect(um(5)).toBe('Guten Morgen');
    expect(um(10)).toBe('Guten Morgen');
    expect(um(11)).toBe('Guten Tag');
    expect(um(17)).toBe('Guten Tag');
    expect(um(18)).toBe('Guten Abend');
    expect(um(2)).toBe('Guten Abend');
  });
});

describe('tagUndMonat, zeitraumLang, tageBis', () => {
  const jetzt = new Date(2026, 9, 22, 12, 0);

  it('nennt das Jahr nur, wenn es nicht das laufende ist', () => {
    expect(tagUndMonat('2026-10-31', jetzt)).toBe('31. Oktober');
    expect(tagUndMonat('2027-01-04', jetzt)).toBe('4. Januar 2027');
  });

  it('schreibt einen Zeitraum mit dem Jahr am Ende', () => {
    expect(zeitraumLang('2026-08-12T09:00:00', '2026-10-15T09:00:00')).toBe(
      '12. August bis 15. Oktober 2026',
    );
    expect(zeitraumLang('2025-12-12T09:00:00', '2026-01-15T09:00:00')).toBe(
      '12. Dezember 2025 bis 15. Januar 2026',
    );
    // An einem Tag nur dieser, nicht „17. Oktober bis 17. Oktober“.
    expect(zeitraumLang('2026-10-17T09:00:00', '2026-10-17T11:00:00')).toBe('17. Oktober 2026');
  });

  it('zählt Kalendertage, nicht Stunden', () => {
    expect(tageBis(new Date(2026, 9, 22, 23, 30).toISOString(), jetzt)).toBe(0);
    expect(tageBis(new Date(2026, 9, 23, 0, 30).toISOString(), jetzt)).toBe(1);
    // Über die Zeitumstellung am 25.10.2026 hinweg.
    expect(tageBis(new Date(2026, 9, 26, 9, 0).toISOString(), jetzt)).toBe(4);
  });
});
