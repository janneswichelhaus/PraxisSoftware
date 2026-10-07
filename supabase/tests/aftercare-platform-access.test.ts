import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, resetDatabase } from './helpers/db';

/**
 * Der Zugang folgt dem Abo (ANG-004, PROJECT_PRINCIPLES.md 4.6, DSN-001 D2
 * und 4.3, ADR-023 Punkt 5, ANN-274).
 *
 *   * Ohne Abo endet die Lesezeit 30 Tage nach dem Abschluss der Versorgung.
 *   * Solange ein Abo läuft, endet der Zugang nicht.
 *   * Nach dem Ende des Abos bleiben 30 Tage zum Lesen, dann nichts mehr.
 *   * Das Training folgt dem Abo der Behandlung nicht (§4.8).
 */

const { users, platformAccesses, patients, trainingRelationships } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const ERIKA_TRAINING = platformAccesses.erikaTraining;

interface Kontext {
  access_id: string;
  readable: boolean;
  read_until: string | null;
}

async function kontext(zugang: string): Promise<Kontext | undefined> {
  const { rows } = await asUser<Kontext>(
    users.plattformErika,
    `select access_id, readable, to_char(read_until at time zone 'Europe/Berlin', 'YYYY-MM-DD') as read_until
       from public.platform_context()`,
  );
  return rows.find((r) => r.access_id === zugang);
}

async function termine(): Promise<number> {
  const { rows } = await asUser(
    users.plattformErika,
    'select * from public.platform_appointments($1::uuid)',
    [ERIKA],
  );
  return rows.length;
}

async function abschliessenVor(tage: number) {
  await asPostgres(
    `update public.patients
        set care_started_on = least(care_started_on, current_date - $2::int),
            care_concluded_on = current_date - $2::int,
            care_concluded_at = now(), care_concluded_by = $3
      where id = $1`,
    [patients.erika, tage, users.ownerTherapist],
  );
}

async function abo(beginnVor: number, endeVor: number | null) {
  await asPostgres(
    `insert into public.aftercare_subscriptions
       (organization_id, patient_id, starts_on, ends_on, created_by,
        cancelled_at, cancelled_on, cancelled_via)
     select organization_id, id, current_date - $2::int, current_date - $3::int, $4,
            case when $3::int is null then null else now() end,
            case when $3::int is null then null else current_date - $3::int end,
            case when $3::int is null then null else 'practice' end
       from public.patients where id = $1`,
    [patients.erika, beginnVor, endeVor, users.office],
  );
}

async function tag(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((${ausdruck})::date, 'YYYY-MM-DD') as tag`,
  );
  return rows[0]!.tag;
}

describe('Zugang folgt dem Nachsorge-Abo (ANG-004)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('ohne Abo: 30 Tage nach dem Abschluss ist die Lesezeit vorbei', async () => {
    await abschliessenVor(40);
    expect((await kontext(ERIKA))?.readable).toBe(false);
    expect(await termine()).toBe(0);
  });

  it('mit laufendem Abo: lesbar, ohne Ende', async () => {
    await abschliessenVor(40);
    await abo(40, null);
    expect(await kontext(ERIKA)).toMatchObject({ readable: true, read_until: null });
    expect(await termine()).toBeGreaterThan(0);
  });

  it('nach dem Ende des Abos: 30 Tage lesbar, gerechnet vom letzten Abo-Tag', async () => {
    await abschliessenVor(100);
    await abo(100, 10);
    expect(await kontext(ERIKA)).toMatchObject({
      readable: true,
      read_until: await tag('current_date - 10 + 31'),
    });
  });

  it('danach nichts mehr', async () => {
    await abschliessenVor(100);
    await abo(100, 31);
    expect((await kontext(ERIKA))?.readable).toBe(false);
    expect(await termine()).toBe(0);
  });

  it('ein Abo, das vor der Behandlung endete, verlängert nichts', async () => {
    // Ein altes Abo aus einer früheren Nachsorge; die neue Behandlung ist
    // seit 40 Tagen abgeschlossen.
    await abschliessenVor(40);
    await abo(200, 150);
    expect((await kontext(ERIKA))?.readable).toBe(false);
  });

  it('läuft die Behandlung, läuft der Zugang wie bisher', async () => {
    await abo(200, 150);
    expect(await kontext(ERIKA)).toMatchObject({ readable: true, read_until: null });
  });

  it('das Training folgt dem Abo der Behandlung nicht (§4.8)', async () => {
    await abschliessenVor(40);
    await abo(40, null);
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date - 40 where id = $1`,
      [trainingRelationships.erika],
    );
    expect((await kontext(ERIKA_TRAINING))?.readable).toBe(false);
    expect((await kontext(ERIKA))?.readable).toBe(true);
  });
});
