import { describe, expect, it } from 'vitest';
import { TagesWort, bezugszeitpunkt, gewaehlterTag, tagesPfad, tagesWort } from './tageswahl';

const HEUTE = '2026-10-05';

describe('Tageswechsel der Übersicht (ANN-234)', () => {
  it('nimmt nur einen echten Kalendertag aus der Adresse, sonst heute', () => {
    expect(gewaehlterTag('2026-10-06', HEUTE)).toBe('2026-10-06');
    expect(gewaehlterTag(null, HEUTE)).toBe(HEUTE);
    expect(gewaehlterTag('', HEUTE)).toBe(HEUTE);
    expect(gewaehlterTag('morgen', HEUTE)).toBe(HEUTE);
    expect(gewaehlterTag('2026-02-30', HEUTE)).toBe(HEUTE);
    expect(gewaehlterTag('2026-10-6', HEUTE)).toBe(HEUTE);
  });

  it('fuehrt heute auf die Uebersicht ohne Zusatz', () => {
    expect(tagesPfad(HEUTE, HEUTE)).toBe('/');
    expect(tagesPfad('2026-10-06', HEUTE)).toBe('/?tag=2026-10-06');
  });

  it('misst heute an der Uhr, einen kuenftigen Tag davor, einen vergangenen dahinter', () => {
    expect(bezugszeitpunkt(HEUTE, HEUTE, 1234)).toBe(1234);
    expect(bezugszeitpunkt('2026-10-06', HEUTE, 1234)).toBe(0);
    expect(bezugszeitpunkt('2026-10-04', HEUTE, 1234)).toBeGreaterThan(
      Date.parse('2100-01-01T00:00:00Z'),
    );
  });

  it('nennt den Tag im Satz', () => {
    expect(tagesWort(HEUTE, HEUTE)).toBe('heute');
    expect(tagesWort('2026-10-06', HEUTE)).toBe('morgen');
    expect(tagesWort('2026-10-04', HEUTE)).toBe('gestern');
    expect(tagesWort('2026-10-07', HEUTE)).toBe('am Mi., 7.10.');
    expect(TagesWort('2026-10-07', HEUTE)).toBe('Am Mi., 7.10.');
    expect(TagesWort(HEUTE, HEUTE)).toBe('Heute');
  });
});
