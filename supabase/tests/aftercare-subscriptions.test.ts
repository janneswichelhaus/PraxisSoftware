import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Das Nachsorge-Abo an der Akte (ANG-001, ADR-009 Punkt 21,
 * PROJECT_PRINCIPLES.md 4.6 und 19).
 *
 *   * Es beginnt frühestens mit dem Abschluss der Versorgung (ANN-268).
 *   * Je Person höchstens ein laufendes, kein neues über einem früheren.
 *   * Anlegen, lesen und entfernen dürfen owner und office; andere Rollen,
 *     eine andere Praxis und Plattformkonten nicht.
 *   * Die Abo-Monate laufen vom Beginn aus (ANN-270).
 */

const { users, patients } = SEED;

const ANLEGEN = 'select public.create_aftercare_subscription($1::uuid, $2::date) as id';
const ENTFERNEN = 'select public.delete_aftercare_subscription($1::uuid)';
const SICHT = 'select public.get_patient_aftercare($1::uuid) as sicht';

async function abschliessen(patientId: string, tag: string | null) {
  await asPostgres(
    `update public.patients
        set care_concluded_on = $2::date,
            care_concluded_at = case when $2::date is null then null else now() end,
            care_concluded_by = case when $2::date is null then null else $3::uuid end
      where id = $1`,
    [patientId, tag, users.ownerTherapist],
  );
}

async function anlegen(
  beginn: string,
  konto: string = users.office,
  patient: string = patients.erika,
) {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ANLEGEN, [patient, beginn]);
  return rows[0]!.id;
}

describe('Nachsorge-Abo anlegen (ANG-001)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.aftercare_subscriptions');
    await abschliessen(patients.erika, '2026-09-30');
  });

  it('legt ein Abo ab dem Abschluss an, mit Urheber', async () => {
    const id = await anlegen('2026-09-30');
    const { rows } = await asPostgres<{
      starts_on: string;
      ends_on: string | null;
      created_by: string;
      patient_id: string;
    }>(
      `select to_char(starts_on, 'YYYY-MM-DD') as starts_on, ends_on, created_by, patient_id
         from public.aftercare_subscriptions where id = $1`,
      [id],
    );
    expect(rows[0]).toEqual({
      starts_on: '2026-09-30',
      ends_on: null,
      created_by: users.office,
      patient_id: patients.erika,
    });
  });

  it('weist einen Beginn vor dem Abschluss ab (ANN-268)', async () => {
    await expect(anlegen('2026-09-29')).rejects.toThrow(/before care is concluded/);
  });

  it('weist ein Abo ab, solange die Behandlung läuft', async () => {
    await abschliessen(patients.erika, null);
    await expect(anlegen('2026-10-01')).rejects.toThrow(/care is not concluded/);
  });

  it('erlaubt je Person nur ein laufendes Abo', async () => {
    await anlegen('2026-10-01');
    await expect(anlegen('2027-01-01')).rejects.toThrow(/already covers/);
  });

  it('beginnt ein neues Abo erst nach dem Ende des früheren', async () => {
    const alt = await anlegen('2026-10-01');
    await asPostgres(
      `update public.aftercare_subscriptions
          set ends_on = '2026-11-30', cancelled_at = now(), cancelled_on = '2026-11-10',
              cancelled_via = 'practice', cancelled_by = $2
        where id = $1`,
      [alt, users.office],
    );
    await expect(anlegen('2026-11-30')).rejects.toThrow(/already covers/);
    await expect(anlegen('2026-12-01')).resolves.toBeTruthy();
  });

  it('lässt owner und office anlegen, die übrigen Rollen nicht', async () => {
    await expect(anlegen('2026-10-01', users.ownerTherapist)).resolves.toBeTruthy();
    await asPostgres('delete from public.aftercare_subscriptions');
    for (const konto of [users.therapist, users.teamLead, users.trainer, users.patientMax]) {
      await expect(asUser(konto, ANLEGEN, [patients.erika, '2026-10-01'])).rejects.toThrow(
        /not allowed/,
      );
    }
    // Plattformkonten haben kein Profil und keine Rolle (ADR-023 Punkt 2).
    for (const konto of [users.plattformErika, users.plattformTina]) {
      await expect(asUser(konto, ANLEGEN, [patients.erika, '2026-10-01'])).rejects.toThrow(
        /not allowed/,
      );
    }
    const { rows } = await asPostgres('select 1 from public.aftercare_subscriptions');
    expect(rows).toHaveLength(0);
  });

  it('kennt keine Akte einer anderen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    await abschliessen(fremd.patient, '2026-09-01');
    await expect(asUser(users.office, ANLEGEN, [fremd.patient, '2026-10-01'])).rejects.toThrow(
      /patient not found/,
    );
    await expect(asUser(fremd.owner, ANLEGEN, [patients.erika, '2026-10-01'])).rejects.toThrow(
      /patient not found/,
    );
  });

  it('hat kein Tabellenrecht für Praxis- und Plattformkonten (ADR-004)', async () => {
    await anlegen('2026-10-01');
    for (const konto of [users.ownerTherapist, users.office, users.plattformErika]) {
      await expect(asUser(konto, 'select * from public.aftercare_subscriptions')).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('entfernt eine Fehlanlage, aber nur in der eigenen Praxis', async () => {
    const id = await anlegen('2026-10-01');
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, ENTFERNEN, [id])).rejects.toThrow(/not found/);
    await expect(asUser(users.therapist, ENTFERNEN, [id])).rejects.toThrow(/not allowed/);
    await asUserCommitted(users.office, ENTFERNEN, [id]);
    const { rows } = await asPostgres('select 1 from public.aftercare_subscriptions');
    expect(rows).toHaveLength(0);
  });

  describe('Mit der Akte', () => {
    it('steht in der Auskunft (Art. 15)', async () => {
      await anlegen('2026-10-01');
      const { rows } = await asUser<{
        daten: { tabellen: { aftercare_subscriptions: Array<{ starts_on: string }> } };
      }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
        patients.erika,
      ]);
      expect(rows[0]!.daten.tabellen.aftercare_subscriptions).toEqual([
        expect.objectContaining({ starts_on: '2026-10-01' }),
      ]);
    });

    it('zieht beim Zusammenführen mit und sperrt sich überschneidende Abos', async () => {
      await abschliessen(patients.petra, '2026-09-01');
      await anlegen('2026-09-01', users.office, patients.petra);
      await anlegen('2026-10-01');
      const plan = async () =>
        (
          await asPostgres<{ plan: { blockers: string[]; counts: Record<string, number> } }>(
            'select app.patient_merge_plan($1::uuid, $2::uuid, $3::uuid) as plan',
            [SEED.organizationId, patients.petra, patients.erika],
          )
        ).rows[0]!.plan;
      expect((await plan()).blockers).toContain('aftercare_overlap');
      expect((await plan()).counts['aftercare_subscriptions']).toBe(1);

      await asPostgres(
        `update public.aftercare_subscriptions
            set ends_on = '2026-09-30', cancelled_at = now(), cancelled_on = '2026-09-15',
                cancelled_via = 'practice'
          where patient_id = $1`,
        [patients.petra],
      );
      expect((await plan()).blockers).not.toContain('aftercare_overlap');
      await asUserCommitted(
        users.ownerTherapist,
        'select public.merge_patients($1::uuid, $2::uuid)',
        [patients.petra, patients.erika],
      );
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.aftercare_subscriptions where patient_id = $1',
        [patients.erika],
      );
      expect(rows[0]!.n).toBe(2);
    });
  });

  describe('Sicht der Akte', () => {
    it('zeigt frühesten Beginn und Stand für office', async () => {
      await anlegen('2026-09-30');
      const { rows } = await asUser<{ sicht: Record<string, unknown> }>(users.office, SICHT, [
        patients.erika,
      ]);
      const sicht = rows[0]!.sicht as {
        earliest_start: string;
        subscriptions: Array<Record<string, unknown>>;
      };
      expect(sicht.earliest_start).toBe('2026-09-30');
      expect(sicht.subscriptions).toHaveLength(1);
      expect(sicht.subscriptions[0]).toMatchObject({ starts_on: '2026-09-30', ends_on: null });
      expect(sicht.subscriptions[0]!['created_by_name']).toBe('Olivia Office');
    });

    it('weist andere Rollen mit Eintrag ab', async () => {
      await erwarteAbgewiesenenLeseversuch(
        users.therapist,
        `select s from public.get_patient_aftercare($1::uuid) s where s is not null`,
        [patients.erika],
        'aftercare.read',
      );
    });

    it('liefert für eine fremde Akte nichts', async () => {
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<{ sicht: unknown }>(users.office, SICHT, [fremd.patient]);
      expect(rows[0]!.sicht).toBeNull();
    });
  });
});

describe('Abo-Monate (ANN-270)', () => {
  it('rechnet vom Beginn aus, auch am Monatsende', async () => {
    const { rows } = await asPostgres<{ n: number; von: string; bis: string }>(
      `select n,
              to_char(app.aftercare_month_start('2027-01-31', n), 'YYYY-MM-DD') as von,
              to_char(app.aftercare_month_end('2027-01-31', n), 'YYYY-MM-DD') as bis
         from generate_series(0, 2) n`,
    );
    expect(rows).toEqual([
      { n: 0, von: '2027-01-31', bis: '2027-02-27' },
      { n: 1, von: '2027-02-28', bis: '2027-03-30' },
      { n: 2, von: '2027-03-31', bis: '2027-04-29' },
    ]);
  });

  it('findet den Abo-Monat eines Tages', async () => {
    const { rows } = await asPostgres<{ tag: string; n: number }>(
      `select tag, app.aftercare_month_index('2026-10-15', tag::date) as n
         from unnest(array['2026-10-14', '2026-10-15', '2026-11-14', '2026-11-15', '2027-10-14']) tag`,
    );
    expect(rows.map((r) => [r.tag, r.n])).toEqual([
      ['2026-10-14', -1],
      ['2026-10-15', 0],
      ['2026-11-14', 0],
      ['2026-11-15', 1],
      ['2027-10-14', 11],
    ]);
  });
});
