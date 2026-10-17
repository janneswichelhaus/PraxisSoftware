import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Wochenplan in einem Zug (set_staff_working_week): mehrere Wochentage in
 * einer Transaktion, alle oder keiner, je Tag dieselbe Prüfung wie
 * set_staff_working_hours. Rechte wie dort (owner, team_lead, office), die
 * Negativfälle aus ADR-013 Punkt 9 Nr. 1, kein Auditeintrag.
 */

const { users } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';

const WOCHE = 'select public.set_staff_working_week($1::uuid, $2::jsonb) as anzahl';

type Tag = { weekday: number; blocks: { von: string; bis: string }[] };

async function speichern(konto: string, tage: Tag[], person = ANNA): Promise<number> {
  const { rows } = await asUserCommitted<{ anzahl: number }>(konto, WOCHE, [
    person,
    JSON.stringify(tage),
  ]);
  return rows[0]!.anzahl;
}

/** Annas heute gültige Blöcke je Wochentag, „HH:MM-HH:MM“. */
async function plan(): Promise<Record<number, string[]>> {
  const { rows } = await asPostgres<{ weekday: number; block: string }>(
    `select weekday, to_char(starts_at, 'HH24:MI') || '-' || to_char(ends_at, 'HH24:MI') as block
       from public.staff_working_hours h
       join public.organizations o on o.id = h.organization_id
      where h.staff_member_id = $1
        and daterange(h.valid_from, h.valid_until, '[]') @> (now() at time zone o.time_zone)::date
      order by weekday, starts_at`,
    [ANNA],
  );
  const ergebnis: Record<number, string[]> = {};
  for (const r of rows) (ergebnis[r.weekday] ??= []).push(r.block);
  return ergebnis;
}

async function fehler(versuch: Promise<unknown>): Promise<{ code?: string; hint?: string }> {
  const f = await abgefangen(versuch);
  return f ? (f as { code?: string; hint?: string }) : { code: 'kein Fehler' };
}

describe('set_staff_working_week', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('speichert mehrere Wochentage in einem Zug und lässt die übrigen stehen', async () => {
    const vorher = await plan();
    const anzahl = await speichern(users.office, [
      { weekday: 1, blocks: [{ von: '07:00', bis: '15:00' }] },
      { weekday: 3, blocks: [] },
      { weekday: 6, blocks: [{ von: '09:00', bis: '12:00' }] },
    ]);
    expect(anzahl).toBe(3);
    const nachher = await plan();
    expect(nachher[1]).toEqual(['07:00-15:00']);
    expect(nachher[3]).toBeUndefined();
    expect(nachher[6]).toEqual(['09:00-12:00']);
    expect(nachher[2]).toEqual(vorher[2]);
  });

  it('speichert alle oder keinen - und nennt den Tag, an dem es scheitert', async () => {
    const vorher = await plan();
    const f = await fehler(
      speichern(users.ownerTherapist, [
        { weekday: 1, blocks: [{ von: '07:00', bis: '15:00' }] },
        {
          weekday: 3,
          blocks: [
            { von: '08:00', bis: '12:00' },
            { von: '11:00', bis: '14:00' },
          ],
        },
      ]),
    );
    expect(f.code).toBe('23P01');
    expect(f.hint).toBe('weekday 3');
    expect(await plan()).toEqual(vorher);
  });

  it('gibt das Speichern owner, Teamleitung und Büro - nicht der Therapie', async () => {
    const tag: Tag[] = [{ weekday: 2, blocks: [{ von: '09:00', bis: '17:00' }] }];
    expect(await speichern(users.teamLead, tag)).toBe(1);
    const vorher = await plan();
    const f = await fehler(speichern(users.therapist, [{ weekday: 2, blocks: [] }]));
    expect(f.code).toBe('42501');
    expect(f.hint).toBe('weekday 2');
    expect(await plan()).toEqual(vorher);
  });

  it('weist Konten ohne Praxisrolle, Plattformkonten, anon und eine fremde Praxis ab', async () => {
    const tag = JSON.stringify([{ weekday: 2, blocks: [] }]);
    expect((await fehler(asUser(users.patientMax, WOCHE, [ANNA, tag]))).code).toBe('42501');
    expect((await fehler(asUser(users.plattformTina, WOCHE, [ANNA, tag]))).code).toBe('42501');
    expect((await fehler(asAnon(WOCHE, [ANNA, tag]))).code).toBe('42501');
    const fremd = await fremdeOrganisation();
    expect((await fehler(asUser(fremd.owner, WOCHE, [ANNA, tag]))).code).toBe('P0002');
    expect((await plan())[2]).toBeDefined();
  });

  it('nimmt ein bis sieben Wochentage, jeden höchstens einmal', async () => {
    const tag = (weekday: number): Tag => ({ weekday, blocks: [] });
    expect((await fehler(speichern(users.office, []))).code).toBe('22023');
    expect((await fehler(speichern(users.office, [1, 2, 3, 4, 5, 6, 7, 1].map(tag)))).code).toBe(
      '22023',
    );
    expect((await fehler(speichern(users.office, [tag(2), tag(2)]))).code).toBe('22023');
    const f = await fehler(speichern(users.office, [tag(9)]));
    expect(f.code).toBe('22023');
    expect(f.hint).toBe('weekday 9');
    expect(
      (await fehler(asUser(users.office, WOCHE, [ANNA, JSON.stringify({ weekday: 1 })]))).code,
    ).toBe('22023');
  });

  it('schreibt keinen Auditeintrag', async () => {
    const zaehlen = async () =>
      (await asPostgres<{ n: number }>('select count(*)::int as n from public.audit_log')).rows[0]!
        .n;
    const vorher = await zaehlen();
    await speichern(users.office, [{ weekday: 1, blocks: [{ von: '07:00', bis: '15:00' }] }]);
    expect(await zaehlen()).toBe(vorher);
  });
});
