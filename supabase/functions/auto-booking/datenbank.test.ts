import { describe, expect, it, vi } from 'vitest';
import { erstelleDatenbank } from './datenbank.ts';
import type { Auftrag } from './typen.ts';

const AUFTRAG: Auftrag = {
  patient: '66666666-6666-4666-8666-000000000001',
  person: null,
  dauerMinuten: 60,
  von: '2026-12-01',
  bis: '2026-12-14',
  wunschzeiten: [{ weekday: 2, from: '09:00', to: '12:00' }],
  grundlage: '88888888-8888-4888-8888-000000000002',
  warteliste: null,
};
const PLAN = {
  days: 7,
  page_size: 7,
  target: { lat: 48.53, lon: 9.05 },
  legs: [{ key: 'a', from: { lat: 48.52, lon: 9.06 }, to: { lat: 48.53, lon: 9.05 } }],
};
const GEBUCHT = {
  outcome: 'booked',
  appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  staff_name: 'Anna Beispiel',
  date: '2026-12-02',
  start: '08:15',
  end: '09:15',
  territory_status: 'none',
};

function mit(status: number, koerper: unknown) {
  const abrufen = vi.fn((_adresse: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response(JSON.stringify(koerper), { status })),
  );
  const datenbank = erstelleDatenbank({
    supabaseUrl: 'http://eigene.test/',
    anonKey: ' anon ',
    abrufen,
  });
  return { abrufen, datenbank };
}

describe('Datenbank der automatischen Buchung', () => {
  it('plant mit dem Token der Person und dem öffentlichen Schlüssel', async () => {
    const { abrufen, datenbank } = mit(200, PLAN);
    const ergebnis = await datenbank.plane('Bearer person', AUFTRAG, 7);
    expect(ergebnis).toEqual({
      ok: true,
      plan: { tage: 7, seitengroesse: 7, ziel: PLAN.target, wege: PLAN.legs },
    });
    const [adresse, init] = abrufen.mock.calls[0]!;
    expect(adresse).toBe('http://eigene.test/rest/v1/rpc/plan_auto_booking');
    expect(init?.headers).toEqual({
      apikey: 'anon',
      Authorization: 'Bearer person',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      p_patient_id: AUFTRAG.patient,
      p_staff_member_id: null,
      p_duration_minutes: 60,
      p_from: '2026-12-01',
      p_to: '2026-12-14',
      p_windows: AUFTRAG.wunschzeiten,
      p_offset: 7,
    });
  });

  it('reicht beim Buchen Fahrzeiten, Grundlage und Wartelisteneintrag durch', async () => {
    const { abrufen, datenbank } = mit(200, GEBUCHT);
    const ergebnis = await datenbank.buche('Bearer person', AUFTRAG, 0, [
      { key: 'a', seconds: 600 },
    ]);
    expect(ergebnis).toEqual({
      ok: true,
      buchung: {
        ausgang: 'gebucht',
        termin: {
          id: GEBUCHT.appointment_id,
          person: GEBUCHT.staff_member_id,
          name: 'Anna Beispiel',
          datum: '2026-12-02',
          beginn: '08:15',
          ende: '09:15',
          gebiet: 'none',
        },
      },
    });
    const [adresse, init] = abrufen.mock.calls[0]!;
    expect(adresse).toBe('http://eigene.test/rest/v1/rpc/book_next_appointment');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      p_offset: 0,
      p_legs: [{ key: 'a', seconds: 600 }],
      p_treatment_basis_id: AUFTRAG.grundlage,
      p_waitlist_entry_id: null,
    });
  });

  it('liest „keiner“ und „nochmal“', async () => {
    const keiner = mit(200, { outcome: 'none', days: 7, unverified: 3, tight: 9, page_size: 7 });
    expect(await keiner.datenbank.buche('Bearer p', AUFTRAG, 0, [])).toEqual({
      ok: true,
      buchung: { ausgang: 'keiner', ungeprueft: 3, knapp: 9 },
    });
    const nochmal = mit(200, { outcome: 'retry' });
    expect(await nochmal.datenbank.buche('Bearer p', AUFTRAG, 0, [])).toEqual({
      ok: true,
      buchung: { ausgang: 'nochmal' },
    });
  });

  it('nimmt eine leere Planung als Abweisung: Ohne Recht nennt die Datenbank keine Wege', async () => {
    const { datenbank } = mit(200, null);
    expect(await datenbank.plane('Bearer p', AUFTRAG, 0)).toEqual({
      ok: false,
      grund: 'forbidden',
    });
  });

  it.each([
    [401, { message: 'JWT expired' }, 'session_invalid'],
    [403, { message: 'not allowed to create appointments' }, 'forbidden'],
    [400, { message: 'patient address is not located' }, 'address_not_located'],
    [400, { message: 'home visit requires a complete patient address' }, 'address_incomplete'],
    [400, { message: 'waitlist entry closed' }, 'waitlist_closed'],
    [400, { message: 'waitlist entry belongs to another patient' }, 'waitlist_closed'],
    [400, { message: 'patient not found' }, 'not_found'],
    [400, { message: 'staff member not assignable' }, 'not_found'],
    [400, { message: 'treatment basis not found' }, 'not_found'],
    [400, { message: 'invalid duration' }, 'invalid_request'],
    [400, { message: 'date range must lie ahead and span at most 42 days' }, 'invalid_request'],
    [500, { message: 'deadlock detected' }, 'unavailable'],
    [400, 'kein Objekt', 'unavailable'],
  ] as const)('ordnet %s %j als %s ein', async (status, koerper, grund) => {
    const { datenbank } = mit(status, koerper);
    expect(await datenbank.buche('Bearer p', AUFTRAG, 0, [])).toEqual({ ok: false, grund });
  });

  it.each([
    ['ohne Ziel', { ...PLAN, target: null }],
    ['mit einem Weg ohne Schlüssel', { ...PLAN, legs: [{ from: PLAN.target, to: PLAN.target }] }],
    ['mit einer Koordinate als Text', { ...PLAN, target: { lat: '48', lon: 9 } }],
    ['ohne Tage', { ...PLAN, days: undefined }],
  ])('verwirft eine Planung %s', async (_name, koerper) => {
    const { datenbank } = mit(200, koerper);
    expect(await datenbank.plane('Bearer p', AUFTRAG, 0)).toEqual({
      ok: false,
      grund: 'unavailable',
    });
  });

  it.each([
    ['ohne Termin', { outcome: 'booked' }],
    ['mit unbekanntem Ausgang', { outcome: 'vielleicht' }],
    ['mit unbekanntem Gebiet', { ...GEBUCHT, territory_status: 'irgendwo' }],
    ['ohne Zähler', { outcome: 'none' }],
  ])('verwirft eine Buchung %s', async (_name, koerper) => {
    const { datenbank } = mit(200, koerper);
    expect(await datenbank.buche('Bearer p', AUFTRAG, 0, [])).toEqual({
      ok: false,
      grund: 'unavailable',
    });
  });

  it('meldet einen Ausfall der Datenbank als nicht erreichbar', async () => {
    const datenbank = erstelleDatenbank({
      supabaseUrl: 'http://eigene.test',
      anonKey: 'anon',
      abrufen: () => Promise.reject(new Error('aus')),
    });
    expect(await datenbank.plane('Bearer p', AUFTRAG, 0)).toEqual({
      ok: false,
      grund: 'unavailable',
    });
  });

  it('fragt ohne Einrichtung gar nicht', async () => {
    const abrufen = vi.fn<typeof fetch>();
    const datenbank = erstelleDatenbank({ supabaseUrl: ' ', anonKey: 'anon', abrufen });
    expect(await datenbank.plane('Bearer p', AUFTRAG, 0)).toEqual({
      ok: false,
      grund: 'not_configured',
    });
    expect(abrufen).not.toHaveBeenCalled();
  });
});
