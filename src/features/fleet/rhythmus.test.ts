import { describe, expect, it } from 'vitest';
import {
  CHECKUP_DAUER_MINUTEN,
  checkupLuecke,
  checkupVorschlaege,
  eintragenPfad,
  faelligAm,
  faelligText,
  faelligkeit,
  radImEinsatz,
  rhythmusText,
} from './rhythmus';
import { ANNA, testRad } from './testdaten';

/** Der Check-Up-Rhythmus ohne Oberfläche (FLT-009, ANN-570). */
describe('Check-Up-Rhythmus', () => {
  const zone = 'Europe/Berlin';

  it('ist fällig am Tag des letzten Check-Ups plus Rhythmus, ohne Check-Up sofort', () => {
    // 22:30 UTC ist in Berlin schon der nächste Tag.
    const rad = testRad({ last_checkup_at: '2026-10-01T22:30:00+00:00' });
    expect(faelligkeit(rad, 14, zone)).toEqual({ ab: '2026-10-16' });
    expect(faelligkeit(testRad(), 14, zone)).toEqual({ ab: null });
    expect(faelligAm({ ab: '2026-10-16' }, '2026-10-15')).toBe(false);
    expect(faelligAm({ ab: '2026-10-16' }, '2026-10-16')).toBe(true);
    expect(faelligAm({ ab: null }, '2026-10-15')).toBe(true);
  });

  it('gibt keinen Hinweis bei abgeschaltetem Rhythmus und für ein gesperrtes Rad', () => {
    expect(faelligkeit(testRad(), null, zone)).toBeNull();
    const gesperrt = testRad({
      block: { id: 's', blocked_at: '2026-10-14T08:00:00Z', reason: null, breakdown_id: null },
    });
    expect(faelligkeit(gesperrt, 14, zone)).toBeNull();
    expect(faelligAm(null, '2026-10-16')).toBe(false);
  });

  it('sagt seit wann, ab wann oder dass es nie war', () => {
    expect(faelligText({ ab: '2026-10-12' }, '2026-10-16')).toBe('Check-Up fällig seit 12.10.2026');
    expect(faelligText({ ab: '2026-10-16' }, '2026-10-16')).toBe('Check-Up heute fällig');
    expect(faelligText({ ab: '2026-10-20' }, '2026-10-16')).toBe('Check-Up fällig ab 20.10.2026');
    expect(faelligText({ ab: null }, '2026-10-16')).toBe('Check-Up fällig, noch nie geprüft');
    expect(rhythmusText(14)).toBe('Alle 2 Wochen');
    expect(rhythmusText(10)).toBe('Alle 10 Tage');
    expect(rhythmusText(null)).toBe('Aus');
  });

  it('schlägt die früheste Lücke in der Arbeitszeit vor, ohne Termine zu berühren', () => {
    const baender = [{ vonMinute: 8 * 60, bisMinute: 16 * 60 }];
    // Erster Termin um 8:00, der zweite um 9:30; dazwischen 30 Minuten frei.
    const belegt = [
      { vonMinute: 8 * 60, bisMinute: 9 * 60 },
      { vonMinute: 9 * 60 + 30, bisMinute: 12 * 60 },
    ];
    expect(checkupLuecke(baender, belegt)).toEqual({
      vonMinute: 9 * 60,
      bisMinute: 9 * 60 + CHECKUP_DAUER_MINUTEN,
    });
    // Eine Lücke von 15 Minuten reicht nicht.
    expect(
      checkupLuecke(baender, [
        { vonMinute: 8 * 60, bisMinute: 9 * 60 },
        { vonMinute: 9 * 60 + 15, bisMinute: 16 * 60 },
      ]),
    ).toBeNull();
    // Heute nichts, was schon vorbei ist.
    expect(checkupLuecke(baender, [], 10 * 60 + 5)).toEqual({
      vonMinute: 10 * 60 + 5,
      bisMinute: 10 * 60 + 25,
    });
    expect(checkupLuecke(null, [])).toBeNull();
  });

  it('sucht an den Radtagen der Stammnutzer:in ab Fälligkeit und ab heute', () => {
    // Mo, Di, Do, Fr; zuletzt geprüft am Montag, 5.10. - fällig ab Montag, 19.10.
    const rad = testRad({ last_checkup_at: '2026-10-05T07:00:00+00:00' });
    const voll = [{ vonMinute: 8 * 60, bisMinute: 16 * 60 }];
    const spalten = ['2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21'].map((tag) => ({
      person: ANNA.id,
      tag,
      baender: voll,
      // Am Montag ist der ganze Tag belegt.
      belegt: tag === '2026-10-19' ? voll : [],
    }));
    const [vorschlag] = checkupVorschlaege({
      raeder: [rad, testRad({ id: 'ersatz', regular_rider: null, is_spare: true })],
      rhythmus: 14,
      zone,
      heute: '2026-10-16',
      jetztMinute: 9 * 60,
      spalten,
    });
    expect(vorschlag?.faellig).toEqual({ ab: '2026-10-19' });
    expect(vorschlag?.luecke).toEqual({
      person: ANNA.id,
      tag: '2026-10-20',
      von: 8 * 60,
      bis: 8 * 60 + 20,
    });
    // Ein Ersatzrad ohne Stammnutzer:in steht nur in der Radflotte.
    expect(
      checkupVorschlaege({
        raeder: [testRad({ id: 'ersatz', regular_rider: null })],
        rhythmus: 14,
        zone,
        heute: '2026-10-16',
        jetztMinute: null,
        spalten,
      }),
    ).toEqual([]);
  });

  it('nennt ein Rad, das im Ausschnitt noch nicht fällig wird, nicht', () => {
    const rad = testRad({ last_checkup_at: '2026-10-14T07:00:00+00:00' });
    expect(
      checkupVorschlaege({
        raeder: [rad],
        rhythmus: 14,
        zone,
        heute: '2026-10-16',
        jetztMinute: null,
        spalten: [{ person: ANNA.id, tag: '2026-10-16', baender: null, belegt: [] }],
      }),
    ).toEqual([]);
    expect(radImEinsatz(rad, '2026-10-17')).toBe(false); // Samstag
    expect(radImEinsatz(testRad({ planned_weekdays: [] }), '2026-10-17')).toBe(true);
  });

  it('führt ins Formular der Fehlzeit nur mit Kennungen und Uhrzeiten', () => {
    const pfad = eintragenPfad(
      { person: ANNA.id, tag: '2026-10-20', von: 8 * 60, bis: 8 * 60 + 20 },
      '/kalender?ansicht=tag',
    );
    const url = new URL(pfad, 'https://praxis.invalid');
    expect(url.pathname).toBe('/termine/ereignis');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      datum: '2026-10-20',
      beginn: '08:00',
      ende: '08:20',
      person: ANNA.id,
      zweck: 'checkup',
      zurueck: '/kalender?ansicht=tag',
    });
    expect(pfad).not.toContain('Anna');
  });
});
