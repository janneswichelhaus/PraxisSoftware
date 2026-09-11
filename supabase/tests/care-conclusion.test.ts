import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';

const { users, patients } = SEED;

const ABSCHLIESSEN = 'select public.conclude_patient_care($1::uuid, $2::date)';
const ZURUECKNEHMEN = 'select public.reopen_patient_care($1::uuid)';

/**
 * Abschluss der Versorgung (LOE-001b).
 *
 * Der Vorgang startet die zehnjaehrige Aufbewahrung nach ADR-008. Er ist
 * deshalb kein gewoehnlicher Statuswechsel: Rollenschnitt, Datumsgrenzen und
 * Auditpfad werden hier einzeln festgehalten.
 */
async function abschlussVon(patientId: string) {
  const { rows } = await asPostgres<{
    care_concluded_on: string | null;
    care_concluded_at: string | null;
    care_concluded_by: string | null;
  }>(
    `select care_concluded_on::text as care_concluded_on,
            care_concluded_at::text as care_concluded_at,
            care_concluded_by::text as care_concluded_by
     from public.patients where id = $1`,
    [patientId],
  );
  return rows[0];
}

async function letzteEreignisse(patientId: string) {
  const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
    `select action, context from public.audit_log
     where subject_type = 'patient' and subject_id = $1
       and action in ('patient.care_concluded', 'patient.care_reopened')
     order by occurred_at`,
    [patientId],
  );
  return rows;
}

describe('conclude_patient_care: berechtigte Rollen', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['owner', users.ownerTherapist],
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('erlaubt %s den Abschluss', async (_rolle, userId) => {
    await asUserCommitted(userId, ABSCHLIESSEN, [patients.max, null]);

    const abschluss = await abschlussVon(patients.max);
    expect(abschluss?.care_concluded_on).not.toBeNull();
    expect(abschluss?.care_concluded_by).toBe(userId);
  });

  it('nimmt den Abschluss zurueck und setzt alle drei Felder zurueck', async () => {
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, '2026-09-01']);
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [patients.max]);

    expect(await abschlussVon(patients.max)).toEqual({
      care_concluded_on: null,
      care_concluded_at: null,
      care_concluded_by: null,
    });
  });

  it('protokolliert Abschluss und Ruecknahme mit dem Tag im Kontext (ADR-010)', async () => {
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, '2026-09-01']);
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [patients.max]);

    const ereignisse = await letzteEreignisse(patients.max);
    expect(ereignisse.map((e) => e.action)).toEqual([
      'patient.care_concluded',
      'patient.care_reopened',
    ]);
    expect(ereignisse[0]?.context).toMatchObject({ concluded_on: '2026-09-01' });
    expect(ereignisse[1]?.context).toMatchObject({ previous_concluded_on: '2026-09-01' });
  });

  it('schreibt bei einer Ruecknahme ohne Abschluss weder Daten noch Auditeintrag', async () => {
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [patients.max]);
    expect(await letzteEreignisse(patients.max)).toEqual([]);
  });

  it('laesst die Frist nach einer Ruecknahme neu beginnen, statt sie fortzusetzen', async () => {
    // Der Seed fuehrt Max seit dem 10.02.2026; ein frueherer Abschluss waere
    // ein anderer Fehlerfall.
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, '2026-04-01']);
    await asUserCommitted(users.therapist, ZURUECKNEHMEN, [patients.max]);
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, '2026-09-01']);

    expect((await abschlussVon(patients.max))?.care_concluded_on).toBe('2026-09-01');
  });
});

describe('conclude_patient_care: Grenzen des Datums', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('setzt ohne Angabe den heutigen Tag in der Zeitzone der Praxis', async () => {
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, null]);

    const { rows } = await asPostgres<{ gleich: boolean }>(
      `select p.care_concluded_on = (now() at time zone o.time_zone)::date as gleich
       from public.patients p join public.organizations o on o.id = p.organization_id
       where p.id = $1`,
      [patients.max],
    );
    expect(rows[0]?.gleich).toBe(true);
  });

  it('weist einen Tag in der Zukunft zurueck', async () => {
    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [patients.max, '2099-01-01']),
    ).rejects.toThrow(/conclusion date is in the future/);
  });

  it('weist einen Tag vor dem Beginn der Versorgung zurueck', async () => {
    await asPostgres(`update public.patients set care_started_on = '2026-05-01' where id = $1`, [
      patients.max,
    ]);

    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [patients.max, '2026-04-30']),
    ).rejects.toThrow(/before the start of care/);
  });

  it('datiert einen bereits abgeschlossenen Fall nicht stillschweigend um', async () => {
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, '2026-09-01']);

    await expect(
      asUser(users.therapist, ABSCHLIESSEN, [patients.max, '2026-01-01']),
    ).rejects.toThrow(/already concluded/);
  });
});

describe('conclude_patient_care: unberechtigte Aufrufer', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('verweigert office den Abschluss, obwohl die Kartei lesbar ist', async () => {
    // Bewusst ein anderer Rollenschnitt als beim organisatorischen Status
    // (ANN-002): dort ist office dabei, hier nicht.
    await expect(asUser(users.office, ABSCHLIESSEN, [patients.max, null])).rejects.toThrow(
      /not allowed to conclude patient care/,
    );
    await expect(asUser(users.office, ZURUECKNEHMEN, [patients.max])).rejects.toThrow(
      /not allowed to conclude patient care/,
    );
  });

  it('verweigert einem Patientenkonto den Abschluss der eigenen Akte', async () => {
    await expect(asUser(users.patientMax, ABSCHLIESSEN, [patients.max, null])).rejects.toThrow(
      /not allowed to conclude patient care/,
    );
  });

  it('verweigert den Aufruf ohne Anmeldung', async () => {
    await expect(asAnon(ABSCHLIESSEN, [patients.max, null])).rejects.toThrow(/permission denied/i);
  });

  it('unterscheidet eine fremde Kennung nicht von einer unbekannten', async () => {
    await expect(
      asUser(users.therapist, ABSCHLIESSEN, ['66666666-6666-4666-8666-0000000000ff', null]),
    ).rejects.toThrow(/patient not found/);
  });
});

describe('Abschluss der Versorgung: Schema und Lesepfad', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('laesst keinen halben Abschluss zu', async () => {
    await expect(
      asPostgres(`update public.patients set care_concluded_on = '2026-09-01' where id = $1`, [
        patients.max,
      ]),
    ).rejects.toThrow(/patients_care_conclusion_complete/);
  });

  it('laesst keinen Abschluss vor dem Beginn der Versorgung zu', async () => {
    await expect(
      asPostgres(
        `update public.patients
            set care_started_on = '2026-05-01',
                care_concluded_on = '2026-04-01',
                care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.max, users.therapist],
      ),
    ).rejects.toThrow(/patients_care_conclusion_after_start/);
  });

  it('liefert den Abschluss ueber patient_directory mit', async () => {
    await asUserCommitted(users.therapist, ABSCHLIESSEN, [patients.max, '2026-09-01']);

    const { rows } = await asUser<{ care_concluded_on: string | null }>(
      users.office,
      `select care_concluded_on::text as care_concluded_on
       from public.patient_directory where id = $1`,
      [patients.max],
    );
    expect(rows[0]?.care_concluded_on).toBe('2026-09-01');
  });

  it('verankert den Anker im Retention Schedule (ADR-008)', async () => {
    const { rows } = await asPostgres<{ anchor: string; retention_interval: string }>(
      `select anchor, retention_interval::text from public.retention_classes where key = 'patientenakte'`,
    );
    expect(rows[0]?.anchor).toBe('care_concluded');
    expect(rows[0]?.retention_interval).toContain('10 years');
  });
});
