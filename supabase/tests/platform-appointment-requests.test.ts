import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

/**
 * Terminwunsch über die Plattform (POR-009, PROJECT_PRINCIPLES.md 8, DSN-001
 * 4.1, ANN-243).
 *
 * Ein Wunsch ist ein eigener Datensatz, kein Termin. Schreiben dürfen alle
 * drei Arten des Zugangs (Recht `request`), lesen nur das eigene Verhältnis;
 * ohne lesbaren Zugang wird abgewiesen. Beantwortete Wünsche fallen zwölf
 * Monate nach der Antwort im Löschlauf.
 */

const { users, platformAccesses, patients } = SEED;
const WUNSCH = `select public.request_platform_appointment($1::uuid, $2::date[], $3::text[], $4) as id`;
const LISTE = 'select * from public.platform_appointment_requests($1::uuid)';
const ZURUECK = 'select public.withdraw_platform_appointment_request($1::uuid, $2::uuid) as ok';

interface Zeile {
  id: string;
  kind: string;
  /** `date[]` liefert der Treiber als Date-Objekte. */
  preferred_days: Date[];
  preferred_times: string[];
  note: string | null;
  status: string;
  answer: string | null;
}

async function wuenschen(
  konto: string,
  zugang: string,
  tage: string[],
  zeiten: string[] = ['morning'],
  notiz: string | null = null,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, WUNSCH, [
    zugang,
    tage,
    zeiten,
    notiz,
  ]);
  return rows[0]!.id;
}

async function liste(konto: string, zugang: string) {
  return (await asUser<Zeile>(konto, LISTE, [zugang])).rows;
}

describe('request_platform_appointment (POR-009)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('legt einen Wunsch mit Tagen, Tageszeiten und Zeile an und zeigt ihn der Person', async () => {
    const id = await wuenschen(
      users.plattformErika,
      platformAccesses.erikaBehandlung,
      [tagInTagen(3), tagInTagen(3), tagInTagen(5)],
      ['afternoon', 'morning'],
      '  Bitte nicht vor 9 Uhr.  ',
    );
    const zeilen = await liste(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(zeilen).toEqual([
      expect.objectContaining({
        id,
        kind: 'new',
        appointment_id: null,
        note: 'Bitte nicht vor 9 Uhr.',
        status: 'open',
        answer: null,
      }),
    ]);
    // Doppelte Tage zusammengefasst, Tageszeiten als Menge.
    expect(zeilen[0]!.preferred_days.map((d) => d.toISOString().slice(0, 10))).toEqual([
      tagInTagen(3),
      tagInTagen(5),
    ]);
    expect([...zeilen[0]!.preferred_times].sort()).toEqual(['afternoon', 'morning']);
    // Nachweis am Datensatz, kein Auditeintrag (ADR-010 Fassung 3).
    const { rows } = await asPostgres<{ created_by: string; created_by_access_id: string }>(
      `select created_by, created_by_access_id from public.platform_appointment_requests where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      created_by: users.plattformErika,
      created_by_access_id: platformAccesses.erikaBehandlung,
    });
    expect(
      (await asPostgres(`select 1 from public.audit_log where subject_type = 'platform_access'`))
        .rows,
    ).toEqual([]);
    // Kein Termin ist entstanden (ANN-243).
    expect(
      (
        await asPostgres(`select 1 from public.appointments where status not in
        ('confirmed','cancelled','no_show','completed','documented','invoiced')`)
      ).rows,
    ).toEqual([]);
  });

  it('weist unvollstaendige oder unmoegliche Wuensche ab', async () => {
    const z = platformAccesses.erikaBehandlung;
    const faelle: [string[], string[], string | null, string][] = [
      [[], ['morning'], null, 'at least one day'],
      [Array.from({ length: 15 }, (_, i) => tagInTagen(i + 1)), [], null, 'too many days'],
      [[tagInTagen(-1)], [], null, 'day out of range'],
      [[tagInTagen(400)], [], null, 'day out of range'],
      [[tagInTagen(2)], ['night'], null, 'unknown time of day'],
      [[tagInTagen(2)], [], 'x'.repeat(501), 'note too long'],
    ];
    for (const [tage, zeiten, notiz, meldung] of faelle) {
      const fehler = await abgefangen(
        asUser(users.plattformErika, WUNSCH, [z, tage, zeiten, notiz]),
      );
      expect(fehler?.message).toContain(meldung);
    }
  });

  it('fremde Person, gesperrt, Praxiskonto: abgewiesen, keine Zeile', async () => {
    const z = platformAccesses.erikaBehandlung;
    const fremd = await abgefangen(
      asUser(users.plattformTina, WUNSCH, [z, [tagInTagen(2)], [], null]),
    );
    expect(fremd?.message).toContain('not allowed');
    const praxis = await abgefangen(
      asUser(users.therapist, WUNSCH, [z, [tagInTagen(2)], [], null]),
    );
    expect(praxis?.message).toContain('not allowed');
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [z],
    );
    const gesperrt = await abgefangen(
      asUser(users.plattformErika, WUNSCH, [z, [tagInTagen(2)], [], null]),
    );
    expect(gesperrt?.message).toContain('not allowed');
    expect(await liste(users.plattformErika, z)).toEqual([]);
    expect(await liste(users.plattformTina, z)).toEqual([]);
  });

  it('trennt die Bereiche: der Wunsch im Training steht nicht in der Behandlung (4.8)', async () => {
    await wuenschen(users.plattformErika, platformAccesses.erikaTraining, [tagInTagen(4)]);
    expect(await liste(users.plattformErika, platformAccesses.erikaBehandlung)).toEqual([]);
    expect(await liste(users.plattformErika, platformAccesses.erikaTraining)).toHaveLength(1);
  });

  it('Begleitung wuenscht fuer die Person; der Aufruf steht im Protokoll (Punkt 24)', async () => {
    const id = await wuenschen(users.plattformPaula, platformAccesses.paulaBegleitungMax, [
      tagInTagen(2),
    ]);
    const { rows } = await asPostgres<{ patient_id: string; created_by: string }>(
      `select patient_id, created_by from public.platform_appointment_requests where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({ patient_id: patients.max, created_by: users.plattformPaula });
    const protokoll = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'platform_representation.read' and context ->> 'view' = 'request'`,
    );
    expect(protokoll.rows).toHaveLength(1);
  });

  it('zieht nur einen eigenen offenen Wunsch zurueck', async () => {
    const id = await wuenschen(users.plattformErika, platformAccesses.erikaBehandlung, [
      tagInTagen(2),
    ]);
    const fremd = await asUser<{ ok: boolean }>(users.plattformTina, ZURUECK, [
      platformAccesses.tinaTraining,
      id,
    ]);
    expect(fremd.rows[0]!.ok).toBe(false);
    const eigen = await asUserCommitted<{ ok: boolean }>(users.plattformErika, ZURUECK, [
      platformAccesses.erikaBehandlung,
      id,
    ]);
    expect(eigen.rows[0]!.ok).toBe(true);
    const nochmal = await asUser<{ ok: boolean }>(users.plattformErika, ZURUECK, [
      platformAccesses.erikaBehandlung,
      id,
    ]);
    expect(nochmal.rows[0]!.ok).toBe(false);
    const zeilen = await liste(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(zeilen[0]).toEqual(expect.objectContaining({ id, status: 'withdrawn' }));
  });
});

describe('Loeschlauf: Terminwuensche (ANN-243)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function beantwortetVor(id: string, monate: number) {
    await asPostgres(
      `update public.platform_appointment_requests
          set status = 'declined', resolved_at = now() - ($2::int * interval '1 month'),
              resolved_by = $3::uuid, answer = 'Leider nicht moeglich.'
        where id = $1`,
      [id, monate, users.office],
    );
  }

  it('loescht beantwortete Wuensche zwoelf Monate nach der Antwort und journalisiert sie', async () => {
    const alt = await wuenschen(users.plattformErika, platformAccesses.erikaBehandlung, [
      tagInTagen(2),
    ]);
    const jung = await wuenschen(users.plattformErika, platformAccesses.erikaBehandlung, [
      tagInTagen(3),
    ]);
    const offen = await wuenschen(users.plattformErika, platformAccesses.erikaBehandlung, [
      tagInTagen(4),
    ]);
    await beantwortetVor(alt, 13);
    await beantwortetVor(jung, 11);
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ id: string }>(
      `select id from public.platform_appointment_requests order by created_at`,
    );
    expect(rows.map((r) => r.id).sort()).toEqual([jung, offen].sort());
    const journal = await asPostgres<{ target_table: string; retention_class: string }>(
      `select target_table, retention_class from public.deletion_journal where target_id = $1`,
      [alt],
    );
    expect(journal.rows).toEqual([
      { target_table: 'platform_appointment_requests', retention_class: 'terminwunsch' },
    ]);
  });

  it('haelt einen beantworteten Wunsch unter Loeschsperre der Akte', async () => {
    const alt = await wuenschen(users.plattformErika, platformAccesses.erikaBehandlung, [
      tagInTagen(2),
    ]);
    await beantwortetVor(alt, 13);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1, 'patient', $2, 'Probe', $3)`,
      [SEED.organizationId, patients.erika, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      (await asPostgres(`select 1 from public.platform_appointment_requests where id = $1`, [alt]))
        .rows,
    ).toHaveLength(1);
  });

  it('faellt mit der Akte', async () => {
    const id = await wuenschen(users.plattformErika, platformAccesses.erikaBehandlung, [
      tagInTagen(2),
    ]);
    await asPostgres(
      `select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())`,
      [patients.erika],
    );
    expect(
      (await asPostgres(`select 1 from public.platform_appointment_requests where id = $1`, [id]))
        .rows,
    ).toEqual([]);
  });
});
