import { describe, expect, it } from 'vitest';
import type { Zeitstrahleintrag } from './api';
import { nachMonat, zeile, type Namen } from './eintraege';

const P = 'p1';
const NAMEN: Namen = {
  instrument: (k) => (k === 'nrs_schmerz' ? 'Schmerzskala (NRS)' : k),
  thema: (t) => (t === 'complaint' ? 'Beschwerden' : 'Sonstiges'),
  bauart: (b) => (b === 'follow_up' ? 'Folgeverordnung' : 'Grundlage'),
};

function e(teil: Partial<Zeitstrahleintrag>): Zeitstrahleintrag {
  return {
    on: '2026-11-03',
    at: '2026-11-03T09:00:00Z',
    kind: 'appointment',
    state: 'documented',
    label: 'home_visit',
    detail: 'final',
    ref: 't1',
    ...teil,
  };
}

const z = (teil: Partial<Zeitstrahleintrag>) => zeile(e(teil), P, 'Europe/Berlin', NAMEN);

describe('Zeile im Zeitstrahl (ORG-002)', () => {
  it('Termin: Art, Uhrzeit, Weg in die Doku; festgeschrieben ohne Abzeichen', () => {
    expect(z({})).toEqual({
      titel: 'Hausbesuch',
      meta: '10:00',
      abzeichen: null,
      ziel: '/patienten/p1/doku?termin=t1',
    });
  });

  it('Termin: Stand der Doku nur nach dem Abhaken, Absage vor der Doku', () => {
    expect(z({ state: 'completed', detail: 'draft' }).abzeichen).toBe('Doku im Entwurf');
    expect(z({ state: 'completed', detail: 'none' }).abzeichen).toBe('Doku fehlt');
    expect(z({ state: 'confirmed', detail: 'none' }).abzeichen).toBeNull();
    expect(z({ state: 'cancelled', detail: 'none' }).abzeichen).toBe('Abgesagt');
    expect(z({ state: 'no_show', detail: 'none' }).abzeichen).toBe('Ausfall');
  });

  it('Termin ohne Recht auf die Doku: kein Weg dorthin, kein Doku-Stand', () => {
    expect(z({ state: 'completed', detail: null })).toMatchObject({ abzeichen: null, ziel: null });
  });

  it('Rückfrage: Thema, offen als Stand, nie der Wortlaut', () => {
    expect(z({ kind: 'message', state: 'open', label: 'complaint', ref: 'm1' })).toEqual({
      titel: 'Rückfrage: Beschwerden',
      meta: '10:00',
      abzeichen: 'Offen',
      ziel: '/rueckfragen/m1',
    });
  });

  it('Erhebung, Ereignis, Grundlage, Rechnung, Planwechsel, Einheit', () => {
    expect(
      z({ kind: 'questionnaire', label: 'nrs_schmerz', state: 'platform', detail: null }),
    ).toMatchObject({ titel: 'Schmerzskala (NRS)', meta: 'Von der Person über die Plattform' });
    expect(z({ kind: 'course_event', label: 'operation', detail: 'Knie-TEP' })).toMatchObject({
      titel: 'Operation',
      meta: 'Knie-TEP',
    });
    expect(z({ kind: 'treatment_basis', label: 'follow_up' }).titel).toBe('Folgeverordnung');
    expect(z({ kind: 'invoice', label: 'R-2026-0007', state: 'cancelled', ref: 'r1' })).toEqual({
      titel: 'Rechnung R-2026-0007',
      meta: null,
      abzeichen: 'Storniert',
      ziel: '/abrechnung/rechnungen/r1',
    });
    expect(z({ kind: 'plan_ended', label: 'Heimprogramm Knie' })).toMatchObject({
      titel: 'Übungsplan beendet',
      meta: 'Heimprogramm Knie',
    });
    expect(
      z({ kind: 'session', label: 'Heimprogramm Knie', state: 'legal_representative' }).meta,
    ).toBe('Heimprogramm Knie · Von der Vertretung');
  });

  it('gruppiert nach Monat in der Reihenfolge des Servers', () => {
    const monate = nachMonat([
      e({ on: '2026-11-03' }),
      e({ on: '2026-11-01' }),
      e({ on: '2026-10-30' }),
    ]);
    expect(monate.map((m) => [m.monat, m.eintraege.length])).toEqual([
      ['2026-11-01', 2],
      ['2026-10-01', 1],
    ]);
  });
});
