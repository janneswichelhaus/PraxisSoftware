import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';

/**
 * Datenschutzinformation, Behandlungsvertrag und Einwilligungen (PAT-006).
 *
 * Die wichtigste Zusage zuerst: Ein Widerruf ueberschreibt die Erteilung
 * nicht. Beide Zeilen bleiben stehen, der Stand ergibt sich aus der juengsten
 * (Art. 7 Abs. 1 DSGVO - die Praxis muss die Einwilligung auch fuer die Zeit
 * vor dem Widerruf nachweisen koennen). Danach Rollen, Mandantengrenze,
 * Auditeintrag und die Auskunft.
 */

const { users, patients } = SEED;

const VERMERKEN =
  'select public.record_patient_privacy_entry($1::uuid, $2, $3, $4, $5::date) as id';
const LESEN = `select record_kind, purpose, notice_version, occurred_on::text as occurred_on
                 from public.patient_privacy_records
                where patient_id = $1::uuid
                order by recorded_at, id`;

const HEUTE = tagInTagen(0);
const GESTERN = tagInTagen(-1);
const VORGESTERN = tagInTagen(-2);

async function vermerken(
  kind: string,
  purpose: string | null,
  version: string | null,
  tag: string,
  userId: string = users.office,
  patientId: string = patients.max,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(userId, VERMERKEN, [
    patientId,
    kind,
    purpose,
    version,
    tag,
  ]);
  return rows[0]!.id;
}

async function fehlerBeim(
  userId: string | null,
  params: unknown[],
): Promise<{ code?: string; message: string } | null> {
  try {
    await asUser(userId, VERMERKEN, params);
    return null;
  } catch (fehler) {
    return fehler as { code?: string; message: string };
  }
}

describe('record_patient_privacy_entry', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('laesst die Erteilung nach dem Widerruf stehen', async () => {
    await vermerken('consent_granted', 'email_contact', null, VORGESTERN);
    await vermerken('consent_withdrawn', 'email_contact', null, GESTERN);

    const { rows } = await asUser(users.therapist, LESEN, [patients.max]);
    expect(rows).toEqual([
      {
        record_kind: 'consent_granted',
        purpose: 'email_contact',
        notice_version: null,
        occurred_on: VORGESTERN,
      },
      {
        record_kind: 'consent_withdrawn',
        purpose: 'email_contact',
        notice_version: null,
        occurred_on: GESTERN,
      },
    ]);
  });

  it('erlaubt eine neue Erteilung nach dem Widerruf', async () => {
    await vermerken('consent_granted', 'prescriber_report', null, VORGESTERN);
    await vermerken('consent_withdrawn', 'prescriber_report', null, GESTERN);
    await vermerken('consent_granted', 'prescriber_report', null, HEUTE);

    const { rows } = await asUser(users.office, LESEN, [patients.max]);
    expect(rows).toHaveLength(3);
  });

  it('weist eine doppelte Erteilung ab', async () => {
    await vermerken('consent_granted', 'email_contact', null, GESTERN);
    const fehler = await fehlerBeim(users.office, [
      patients.max,
      'consent_granted',
      'email_contact',
      null,
      HEUTE,
    ]);
    expect(fehler?.message).toMatch(/consent already granted/);
  });

  it('weist einen Widerruf ohne Erteilung ab', async () => {
    const fehler = await fehlerBeim(users.office, [
      patients.max,
      'consent_withdrawn',
      'email_contact',
      null,
      HEUTE,
    ]);
    expect(fehler?.message).toMatch(/no consent to withdraw/);
  });

  it('weist einen Widerruf vor der Erteilung ab', async () => {
    await vermerken('consent_granted', 'email_contact', null, GESTERN);
    const fehler = await fehlerBeim(users.office, [
      patients.max,
      'consent_withdrawn',
      'email_contact',
      null,
      VORGESTERN,
    ]);
    expect(fehler?.message).toMatch(/withdrawal before consent/);
  });

  it('weist ein Datum in der Zukunft ab', async () => {
    const fehler = await fehlerBeim(users.office, [
      patients.max,
      'treatment_contract_signed',
      null,
      null,
      tagInTagen(2),
    ]);
    expect(fehler?.message).toMatch(/future/);
  });

  it('verlangt die Fassung bei der Datenschutzinformation und nur dort', async () => {
    const ohneFassung = await fehlerBeim(users.office, [
      patients.max,
      'privacy_notice_handed_out',
      null,
      null,
      HEUTE,
    ]);
    expect(ohneFassung?.code).toBe('23514');

    const fassungAmVertrag = await fehlerBeim(users.office, [
      patients.max,
      'treatment_contract_signed',
      null,
      '2026-09',
      HEUTE,
    ]);
    expect(fassungAmVertrag?.code).toBe('23514');

    await vermerken('privacy_notice_handed_out', null, '2026-09', HEUTE);
    await vermerken('treatment_contract_signed', null, null, HEUTE);
    const { rows } = await asUser(users.ownerTherapist, LESEN, [patients.max]);
    expect(rows).toHaveLength(2);
  });

  describe('Ablehnung (ADR-017 Punkt 35, ANN-127)', () => {
    it('haelt eine Ablehnung als eigenen Vermerk und laesst danach eine Erteilung zu', async () => {
      await vermerken('consent_refused', 'patient_photos', null, GESTERN);
      await vermerken('consent_granted', 'patient_photos', null, HEUTE);

      const { rows } = await asUser(users.office, LESEN, [patients.max]);
      expect(rows.map((r) => r.record_kind)).toEqual(['consent_refused', 'consent_granted']);
    });

    it('weist eine Ablehnung ab, solange eingewilligt ist - das waere ein Widerruf', async () => {
      await vermerken('consent_granted', 'patient_photos', null, GESTERN);
      const fehler = await fehlerBeim(users.office, [
        patients.max,
        'consent_refused',
        'patient_photos',
        null,
        HEUTE,
      ]);
      expect(fehler?.message).toMatch(/consent is granted/);
    });

    it('weist eine doppelte Ablehnung ab', async () => {
      await vermerken('consent_refused', 'patient_photos', null, GESTERN);
      const fehler = await fehlerBeim(users.office, [
        patients.max,
        'consent_refused',
        'patient_photos',
        null,
        HEUTE,
      ]);
      expect(fehler?.message).toMatch(/already refused/);
    });

    it('erlaubt die Ablehnung nach einem Widerruf', async () => {
      await vermerken('consent_granted', 'patient_photos', null, VORGESTERN);
      await vermerken('consent_withdrawn', 'patient_photos', null, GESTERN);
      await vermerken('consent_refused', 'patient_photos', null, HEUTE);

      const { rows } = await asUser(users.office, LESEN, [patients.max]);
      expect(rows.map((r) => r.record_kind)).toEqual([
        'consent_granted',
        'consent_withdrawn',
        'consent_refused',
      ]);
    });

    it('verlangt bei der Ablehnung einen Zweck', async () => {
      const fehler = await fehlerBeim(users.office, [
        patients.max,
        'consent_refused',
        null,
        null,
        HEUTE,
      ]);
      expect(fehler?.code).toBe('23514');
    });
  });

  it('kennt nur die Zwecke aus ANN-093', async () => {
    const fehler = await fehlerBeim(users.office, [
      patients.max,
      'consent_granted',
      'marketing',
      null,
      HEUTE,
    ]);
    expect(fehler?.code).toBe('23514');

    const ohneZweck = await fehlerBeim(users.office, [
      patients.max,
      'consent_granted',
      null,
      null,
      HEUTE,
    ]);
    expect(ohneZweck?.code).toBe('23514');
  });

  it('schreibt einen Auditeintrag ohne Inhalt', async () => {
    const id = await vermerken('consent_granted', 'email_contact', null, HEUTE);

    const { rows } = await asPostgres<{
      actor_user_id: string;
      subject_id: string;
      outcome: string;
      context: Record<string, unknown>;
    }>(
      `select actor_user_id, subject_id, outcome, context
         from public.audit_log where action = 'patient_privacy.recorded'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: users.office,
      subject_id: patients.max,
      outcome: 'success',
    });
    expect(rows[0]!.context).toEqual({
      surface: 'web',
      record_id: id,
      record_kind: 'consent_granted',
      purpose: 'email_contact',
    });
  });

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['office', users.office],
  ])('laesst %s vermerken', async (_rolle, userId) => {
    await expect(
      vermerken('treatment_contract_signed', null, null, HEUTE, userId),
    ).resolves.toBeTruthy();
  });

  it.each([
    ['ein Patientenkonto', users.patientMax],
    ['die Trainingsbetreuung', users.trainer],
  ])('weist %s beim Schreiben ab', async (_wer, userId) => {
    const fehler = await fehlerBeim(userId, [
      patients.max,
      'treatment_contract_signed',
      null,
      null,
      HEUTE,
    ]);
    expect(fehler?.code).toBe('42501');
  });

  it.each([
    ['ein Patientenkonto', users.patientMax],
    ['die Trainingsbetreuung', users.trainer],
  ])('zeigt %s keine Zeile', async (_wer, userId) => {
    await vermerken('consent_granted', 'email_contact', null, HEUTE);
    const { rows } = await asUser(userId, LESEN, [patients.max]);
    expect(rows).toEqual([]);
  });

  it('weist ohne Anmeldung ab', async () => {
    const fehler = await fehlerBeim(null, [
      patients.max,
      'treatment_contract_signed',
      null,
      null,
      HEUTE,
    ]);
    expect(fehler?.code).toBe('42501');
  });

  it('gibt anon weder Lesen noch Schreiben', async () => {
    await expect(asAnon(LESEN, [patients.max])).rejects.toThrow(/permission denied/);
    await expect(
      asAnon(VERMERKEN, [patients.max, 'treatment_contract_signed', null, null, HEUTE]),
    ).rejects.toThrow(/permission denied/);
  });

  it('haelt die Mandantengrenze beim Schreiben und Lesen', async () => {
    const fremd = await fremdeOrganisation();

    const fehler = await fehlerBeim(fremd.owner, [
      patients.max,
      'treatment_contract_signed',
      null,
      null,
      HEUTE,
    ]);
    expect(fehler?.code).toBe('P0002');

    await vermerken('consent_granted', 'email_contact', null, HEUTE);
    const { rows } = await asUser(fremd.owner, LESEN, [patients.max]);
    expect(rows).toEqual([]);
  });

  it('erlaubt keiner Anwendungsrolle Aendern oder Loeschen', async () => {
    await vermerken('consent_granted', 'email_contact', null, HEUTE);

    await expect(
      asUser(users.ownerTherapist, `update public.patient_privacy_records set occurred_on = $1`, [
        GESTERN,
      ]),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(users.ownerTherapist, 'delete from public.patient_privacy_records'),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(
        users.office,
        `insert into public.patient_privacy_records
           (organization_id, patient_id, record_kind, occurred_on)
         values ($1::uuid, $2::uuid, 'treatment_contract_signed', $3::date)`,
        [SEED.organizationId, patients.max, HEUTE],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('gehoert zur Auskunft nach Art. 15', async () => {
    await vermerken('privacy_notice_handed_out', null, '2026-09', HEUTE);

    const { rows } = await asUser<{ daten: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.max],
    );
    expect(rows[0]!.daten.tabellen['patient_privacy_records']).toEqual([
      expect.objectContaining({
        record_kind: 'privacy_notice_handed_out',
        notice_version: '2026-09',
        occurred_on: HEUTE,
      }),
    ]);
  });
});
