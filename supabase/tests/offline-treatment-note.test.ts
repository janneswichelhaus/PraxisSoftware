import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  resetDatabaseOhneTermine,
  tagInTagen,
  testDatabaseUrl,
} from './helpers/db';

/**
 * Die Übertragung eines ohne Verbindung geschriebenen Entwurfs (OFF-002,
 * ADR-024 Punkte 6 bis 8, ANN-362).
 *
 *   * additiv und wiederholbar: zweimal gesendet ist einmal gespeichert,
 *   * nichts wird eingemischt: Gibt es am Termin schon eine Dokumentation,
 *     legt der Server nichts an und sagt `conflict`,
 *   * der Server urteilt beim Eingang mit denselben Prüfungen wie online,
 *   * eine Kennung des Geräts gewährt nichts: Die eines anderen Kontos ist
 *     eine unbekannte, ein fremder Termin heißt P0002,
 *   * gesperrte Sitzung: eigener Code 28000, das Gerät behält den Entwurf,
 *   * die Frist der automatischen Finalisierung beginnt mit dem Eingang,
 *   * die Zeit des Geräts steht als Angabe an der Zeile, in der Lesesicht und
 *     in der Auskunft.
 *
 * Alle Inhalte sind erkennbar synthetisch (PROJECT_PRINCIPLES.md 3.1).
 */

const { users, patients, organizationId, trainingRelationships } = SEED;
const TOM = '55555555-5555-4555-8555-000000000006';
const STANDORT = '33333333-3333-4333-8333-000000000001';
const ANNA = '55555555-5555-4555-8555-000000000002';

const TERMIN_ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';
const TERMIN_ABSAGEN =
  'select public.cancel_appointment($1::uuid, $2::timestamptz, $3, null::date, null::time) as id';
const SYNC =
  'select public.sync_offline_treatment_note($1::uuid, $2::uuid, $3, $4::timestamptz) as r';
const ANLEGEN = 'select public.create_treatment_note($1::uuid, $2) as id';
const LESEN = 'select * from public.get_treatment_note($1::uuid)';

const TEXT = 'Synthetisch: Ohne Empfang dokumentiert, Gangschule im Treppenhaus.';

interface Antwort {
  status: 'created' | 'known' | 'conflict';
  note_id: string;
  note_status?: string;
}

let laufend = 0;
async function termin(): Promise<string> {
  laufend += 1;
  const { rows } = await asUserCommitted<{ id: string }>(users.office, TERMIN_ANLEGEN, [
    patients.max,
    ANNA,
    'video',
    tagInTagen(40 + laufend),
    '09:00',
    '10:00',
    null,
  ]);
  return rows[0]!.id;
}

async function absagen(terminId: string): Promise<void> {
  const { rows } = await asPostgres<{ u: string }>(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as u
       from public.appointments where id = $1`,
    [terminId],
  );
  await asUserCommitted(users.office, TERMIN_ABSAGEN, [terminId, rows[0]!.u, 'other']);
}

async function senden(
  konto: string,
  offlineId: string,
  terminId: string,
  text = TEXT,
  geschrieben = '2026-10-12T08:15:00Z',
): Promise<Antwort> {
  const { rows } = await asUserCommitted<{ r: Antwort }>(konto, SYNC, [
    offlineId,
    terminId,
    text,
    geschrieben,
  ]);
  return rows[0]!.r;
}

async function fehlercode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'kein Fehler';
  } catch (e) {
    return String((e as { code?: string }).code);
  }
}

async function zeilenAmTermin(terminId: string) {
  const { rows } = await asPostgres<{
    id: string;
    content: string;
    status: string;
    created_by: string;
    offline_id: string | null;
    reported_written_at: Date | null;
    created_at: Date;
  }>('select * from public.treatment_notes where appointment_id = $1', [terminId]);
  return rows;
}

beforeAll(async () => {
  await resetDatabaseOhneTermine();
  await fremdeOrganisation();
});

describe('OFF-002: Offline-Entwurf übertragen', () => {
  it('legt einen Entwurf an - mit Kennung, Zeit des Geräts und Eingang am Server', async () => {
    const t = await termin();
    const id = randomUUID();
    const a = await senden(users.therapist, id, t, `  ${TEXT}\n`);
    expect(a.status).toBe('created');
    const [zeile] = await zeilenAmTermin(t);
    expect(zeile).toMatchObject({
      id: a.note_id,
      status: 'draft',
      content: TEXT,
      created_by: users.therapist,
      offline_id: id,
    });
    expect(zeile!.reported_written_at?.toISOString()).toBe('2026-10-12T08:15:00.000Z');
    expect(Date.now() - zeile!.created_at.getTime()).toBeLessThan(60_000);
  });

  it('zweimal gesendet ist einmal gespeichert (known), auch nach einer Absage', async () => {
    const t = await termin();
    const id = randomUUID();
    const erst = await senden(users.therapist, id, t);
    await absagen(t);
    const zweit = await senden(users.therapist, id, t);
    expect(zweit).toEqual({ status: 'known', note_id: erst.note_id });
    const zeilen = await zeilenAmTermin(t);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.content).toBe(TEXT);
  });

  it('dieselbe Kennung mit neuerem Text ist kein Wiedererkennen: conflict, nichts geändert (Zweitreview B1)', async () => {
    const t = await termin();
    const id = randomUUID();
    const erst = await senden(users.therapist, id, t, 'Synthetisch: erste Fassung.');
    // Die Antwort ging verloren, danach wurde weitergeschrieben.
    const zweit = await senden(users.therapist, id, t, 'Synthetisch: erste Fassung, ergänzt.');
    expect(zweit).toEqual({ status: 'conflict', note_id: erst.note_id, note_status: 'draft' });
    const zeilen = await zeilenAmTermin(t);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.content).toBe('Synthetisch: erste Fassung.');
    // Derselbe Text bleibt ein Wiedererkennen, auch mit Leerzeichen am Rand.
    expect((await senden(users.therapist, id, t, ' Synthetisch: erste Fassung.\n')).status).toBe(
      'known',
    );
  });

  it('an einem Trainingstermin entsteht keine Behandlungsdokumentation (anderer Leistungsbereich)', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.appointments (
         organization_id, training_relationship_id, staff_member_id, location_id,
         appointment_type, kind, status, starts_at, ends_at
       ) values ($1, $2, $3, $4, 'practice', 'training', 'confirmed',
         ($5::date + time '09:00') at time zone 'Europe/Berlin',
         ($5::date + time '10:00') at time zone 'Europe/Berlin')
       returning id`,
      [organizationId, trainingRelationships.tina, TOM, STANDORT, tagInTagen(90)],
    );
    const t = rows[0]!.id;
    for (const konto of [users.therapist, users.trainer]) {
      expect(await fehlercode(senden(konto, randomUUID(), t))).toMatch(/^(42501|P0002|22023)$/);
    }
    expect(await zeilenAmTermin(t)).toHaveLength(0);
  });

  it('mischt nichts ein: Entwurf einer Kollegin am Termin heißt conflict, nichts geändert', async () => {
    const t = await termin();
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
      t,
      'Synthetisch: Entwurf online.',
    ]);
    const a = await senden(users.therapist, randomUUID(), t);
    expect(a).toEqual({ status: 'conflict', note_id: rows[0]!.id, note_status: 'draft' });
    const zeilen = await zeilenAmTermin(t);
    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]!.content).toBe('Synthetisch: Entwurf online.');
  });

  it('mischt nichts ein: an einer finalisierten Dokumentation ebenso (note_status final)', async () => {
    const t = await termin();
    const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
      t,
      'Synthetisch: festgeschrieben.',
    ]);
    await asPostgres(
      `update public.treatment_notes set status = 'final', finalisation_kind = 'automatic', finalized_at = now() where id = $1`,
      [rows[0]!.id],
    );
    const a = await senden(users.therapist, randomUUID(), t);
    expect(a).toMatchObject({ status: 'conflict', note_status: 'final' });
  });

  it('der Server urteilt beim Eingang: Absage, nicht angetroffen, leer, zu lang (22023)', async () => {
    const t = await termin();
    await absagen(t);
    expect(await fehlercode(senden(users.therapist, randomUUID(), t))).toBe('22023');
    const t2 = await termin();
    await asPostgres(
      `update public.appointments set status = 'no_show', no_show_recorded_at = now(), no_show_recorded_by = $2 where id = $1`,
      [t2, users.therapist],
    );
    expect(await fehlercode(senden(users.therapist, randomUUID(), t2))).toBe('22023');
    const t3 = await termin();
    expect(await fehlercode(senden(users.therapist, randomUUID(), t3, ' \n '))).toBe('22023');
    expect(await fehlercode(senden(users.therapist, randomUUID(), t3, 'x'.repeat(20001)))).toBe(
      '22023',
    );
    expect(await zeilenAmTermin(t3)).toHaveLength(0);
  });

  it('ohne Dokumentationsrecht abgewiesen (42501): Büro und Konto ohne Praxisrolle', async () => {
    const t = await termin();
    expect(await fehlercode(senden(users.office, randomUUID(), t))).toBe('42501');
    expect(await fehlercode(senden(users.patientMax, randomUUID(), t))).toBe('42501');
    expect(await zeilenAmTermin(t)).toHaveLength(0);
  });

  it('ein Termin einer anderen Praxis ist ein unbekannter (P0002)', async () => {
    const f = await fremdeOrganisation();
    const t = await termin();
    expect(await fehlercode(senden(f.owner, randomUUID(), t))).toMatch(/42501|P0002/);
    expect(await fehlercode(senden(users.therapist, randomUUID(), randomUUID()))).toBe('P0002');
    expect(await zeilenAmTermin(t)).toHaveLength(0);
  });

  it('die Kennung eines anderen Kontos gewährt nichts: Sie ist eine unbekannte', async () => {
    const t = await termin();
    const id = randomUUID();
    const anna = await senden(users.therapist, id, t);
    // Jannes sendet dieselbe Kennung: kein „known“, keine fremde note_id als Erfolg.
    const jannes = await senden(users.ownerTherapist, id, t);
    expect(jannes.status).toBe('conflict');
    expect(await zeilenAmTermin(t)).toHaveLength(1);
    expect(anna.status).toBe('created');
    // An einem anderen Termin legt dieselbe Kennung für ein anderes Konto neu an.
    const t2 = await termin();
    expect((await senden(users.ownerTherapist, id, t2)).status).toBe('created');
  });

  it('dieselbe eigene Kennung an einem anderen Termin ist eine Formverletzung (22023)', async () => {
    const t = await termin();
    const t2 = await termin();
    const id = randomUUID();
    await senden(users.therapist, id, t);
    expect(await fehlercode(senden(users.therapist, id, t2))).toBe('22023');
    expect(await zeilenAmTermin(t2)).toHaveLength(0);
  });

  it('eine Uhr aus der Zukunft gilt höchstens als Eingang', async () => {
    const t = await termin();
    await senden(users.therapist, randomUUID(), t, TEXT, '2030-01-01T00:00:00Z');
    const [zeile] = await zeilenAmTermin(t);
    expect(zeile!.reported_written_at!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('gesperrte Sitzung: eigener Code 28000, nichts angelegt', async () => {
    const t = await termin();
    expect(
      await fehlercode(asUser(null, SYNC, [randomUUID(), t, TEXT, '2026-10-12T08:00:00Z'])),
    ).toBe('28000');
    const claims = jwtClaims(users.therapist, {
      amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 61 * 60 }],
      session_id: 'bcbcbcbc-bcbc-4cbc-8cbc-000000000061',
    });
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    let code = 'kein Fehler';
    try {
      await client.query('begin');
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await client.query(SYNC, [randomUUID(), t, TEXT, '2026-10-12T08:00:00Z']);
    } catch (e) {
      code = String((e as { code?: string }).code);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
    expect(code).toBe('28000');
    expect(await zeilenAmTermin(t)).toHaveLength(0);
  });

  it('die Frist der automatischen Finalisierung beginnt mit dem Eingang (ADR-024 Punkt 6)', async () => {
    // Ein Termin vor zehn Tagen, Entwurf erst heute übertragen.
    const t = await termin();
    await asPostgres(
      `update public.appointments
          set starts_at = now() - interval '10 days', ends_at = now() - interval '10 days' + interval '1 hour'
        where id = $1`,
      [t],
    );
    const a = await senden(users.therapist, randomUUID(), t);
    await asPostgres('select public.finalize_overdue_treatment_notes()');
    const { rows } = await asPostgres<{ status: string }>(
      'select status from public.treatment_notes where id = $1',
      [a.note_id],
    );
    expect(rows[0]!.status).toBe('draft');
  });

  it('die Lesesicht nennt die Zeit des Geräts, ein online angelegter Eintrag nicht', async () => {
    const t = await termin();
    await senden(users.therapist, randomUUID(), t);
    const { rows } = await asUser<{ reported_written_at: Date | null }>(users.therapist, LESEN, [
      t,
    ]);
    expect(rows[0]!.reported_written_at?.toISOString()).toBe('2026-10-12T08:15:00.000Z');
    const t2 = await termin();
    await asUserCommitted(users.therapist, ANLEGEN, [t2, 'Synthetisch: online.']);
    const online = await asUser<{ reported_written_at: Date | null }>(users.therapist, LESEN, [t2]);
    expect(online.rows[0]!.reported_written_at).toBeNull();
  });

  it('die Auskunft (Art. 15) trägt die Zeit des Geräts', async () => {
    const t = await termin();
    await senden(users.therapist, randomUUID(), t);
    const { rows } = await asUser<{
      daten: { tabellen: { treatment_notes: Record<string, unknown>[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.max,
    ]);
    const eintrag = rows[0]!.daten.tabellen.treatment_notes.find((n) => n['appointment_id'] === t);
    expect(eintrag?.['reported_written_at']).toBe('2026-10-12T08:15:00+00:00');
  });

  it('schreibt kein Auditereignis und keinen Inhalt ins Auditlog (ADR-024 Punkt 6)', async () => {
    const vorher = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    const t = await termin();
    const nachTermin = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    await senden(users.therapist, randomUUID(), t);
    const nachher = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    expect(nachher.rows[0]!.n).toBe(nachTermin.rows[0]!.n);
    expect(vorher.rows[0]!.n).toBeLessThanOrEqual(nachTermin.rows[0]!.n);
    const { rows } = await asPostgres<{ t: string }>(
      "select coalesce(string_agg(row_to_json(a)::text, chr(10)), '') as t from public.audit_log a",
    );
    expect(rows[0]!.t).not.toContain('Treppenhaus');
  });

  it('ist für anon nicht ausführbar', async () => {
    const { rows } = await asPostgres<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'public.sync_offline_treatment_note(uuid, uuid, text, timestamptz)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.sync_offline_treatment_note(uuid, uuid, text, timestamptz)', 'execute') as auth`,
    );
    expect(rows[0]).toEqual({ anon: false, auth: true });
  });
});
