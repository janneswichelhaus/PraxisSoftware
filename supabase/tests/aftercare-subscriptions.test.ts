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

/**
 * Ein Kalendertag relativ zu heute, als `YYYY-MM-DD` (die Tests veralten nicht).
 * Heute ist der Tag der Praxis, nicht der UTC-Tag der Sitzung (BEF-130).
 */
async function tag(tage: number): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char(app.training_today($2::uuid) + $1::int, 'YYYY-MM-DD') as tag`,
    [tage, SEED.organizationId],
  );
  return rows[0]!.tag;
}

let ABSCHLUSS = '';
let DANACH = '';
let SPAETER = '';

describe('Nachsorge-Abo anlegen (ANG-001)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
    ABSCHLUSS = await tag(-3);
    DANACH = await tag(-2);
    SPAETER = await tag(90);
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.aftercare_subscriptions');
    await abschliessen(patients.erika, ABSCHLUSS);
  });

  it('legt ein Abo ab dem Abschluss an, mit Urheber', async () => {
    const id = await anlegen(ABSCHLUSS);
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
      starts_on: ABSCHLUSS,
      ends_on: null,
      created_by: users.office,
      patient_id: patients.erika,
    });
  });

  it('weist einen Beginn vor dem Abschluss ab (ANN-268)', async () => {
    await expect(anlegen(await tag(-4))).rejects.toThrow(/before care is concluded/);
  });

  it('legt ein Abo höchstens 14 Tage rückwirkend an (ANN-268)', async () => {
    await abschliessen(patients.erika, await tag(-30));
    await expect(anlegen(await tag(-15))).rejects.toThrow(/more than 14 days ago/);
    await expect(anlegen(await tag(-14))).resolves.toBeTruthy();
  });

  it('weist ein Abo ab, solange die Behandlung läuft', async () => {
    await abschliessen(patients.erika, null);
    await expect(anlegen(DANACH)).rejects.toThrow(/care is not concluded/);
  });

  it('erlaubt je Person nur ein laufendes Abo', async () => {
    await anlegen(DANACH);
    await expect(anlegen(SPAETER)).rejects.toThrow(/already covers/);
  });

  it('beginnt ein neues Abo erst nach dem Ende des früheren', async () => {
    const alt = await anlegen(DANACH);
    await asPostgres(
      `update public.aftercare_subscriptions
          set ends_on = app.training_today(organization_id) + 40, cancelled_at = now(),
              cancelled_on = app.training_today(organization_id),
              cancelled_via = 'practice', cancelled_by = $2
        where id = $1`,
      [alt, users.office],
    );
    await expect(anlegen(await tag(40))).rejects.toThrow(/already covers/);
    await expect(anlegen(await tag(41))).resolves.toBeTruthy();
  });

  it('lässt owner und office anlegen, die übrigen Rollen nicht', async () => {
    await expect(anlegen(DANACH, users.ownerTherapist)).resolves.toBeTruthy();
    await asPostgres('delete from public.aftercare_subscriptions');
    for (const konto of [users.therapist, users.teamLead, users.trainer, users.patientMax]) {
      await expect(asUser(konto, ANLEGEN, [patients.erika, DANACH])).rejects.toThrow(/not allowed/);
    }
    // Plattformkonten haben kein Profil und keine Rolle (ADR-023 Punkt 2).
    for (const konto of [users.plattformErika, users.plattformTina]) {
      await expect(asUser(konto, ANLEGEN, [patients.erika, DANACH])).rejects.toThrow(/not allowed/);
    }
    const { rows } = await asPostgres('select 1 from public.aftercare_subscriptions');
    expect(rows).toHaveLength(0);
  });

  it('kennt keine Akte einer anderen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    await abschliessen(fremd.patient, ABSCHLUSS);
    await expect(asUser(users.office, ANLEGEN, [fremd.patient, DANACH])).rejects.toThrow(
      /patient not found/,
    );
    await expect(asUser(fremd.owner, ANLEGEN, [patients.erika, DANACH])).rejects.toThrow(
      /patient not found/,
    );
  });

  it('hat kein Tabellenrecht für Praxis- und Plattformkonten (ADR-004)', async () => {
    await anlegen(DANACH);
    for (const konto of [users.ownerTherapist, users.office, users.plattformErika]) {
      await expect(asUser(konto, 'select * from public.aftercare_subscriptions')).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it('entfernt eine Fehlanlage, aber nur in der eigenen Praxis', async () => {
    const id = await anlegen(DANACH);
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, ENTFERNEN, [id])).rejects.toThrow(/not found/);
    await expect(asUser(users.therapist, ENTFERNEN, [id])).rejects.toThrow(/not allowed/);
    await asUserCommitted(users.office, ENTFERNEN, [id]);
    const { rows } = await asPostgres('select 1 from public.aftercare_subscriptions');
    expect(rows).toHaveLength(0);
  });

  it('entfernt ein gekündigtes Abo nicht – die Kündigung ist ein Nachweis (ANN-272)', async () => {
    const id = await anlegen(await tag(10));
    await asUserCommitted(users.office, 'select public.cancel_aftercare_subscription($1::uuid)', [
      id,
    ]);
    await expect(asUser(users.office, ENTFERNEN, [id])).rejects.toThrow(/is cancelled/);
    // Eine fremde Praxis erfährt den Zustand nicht (Zweitreview H5).
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, ENTFERNEN, [id])).rejects.toThrow(/not found/);
  });

  describe('Mit der Akte', () => {
    it('steht in der Auskunft (Art. 15)', async () => {
      await anlegen(DANACH);
      const { rows } = await asUser<{
        daten: { tabellen: { aftercare_subscriptions: Array<{ starts_on: string }> } };
      }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
        patients.erika,
      ]);
      expect(rows[0]!.daten.tabellen.aftercare_subscriptions).toEqual([
        expect.objectContaining({ starts_on: DANACH }),
      ]);
    });

    it('zieht beim Zusammenführen mit und sperrt sich überschneidende Abos', async () => {
      await abschliessen(patients.petra, ABSCHLUSS);
      await anlegen(ABSCHLUSS, users.office, patients.petra);
      await anlegen(DANACH);
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
            set ends_on = starts_on, cancelled_at = now(), cancelled_on = starts_on,
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
      await anlegen(ABSCHLUSS);
      const { rows } = await asUser<{ sicht: Record<string, unknown> }>(users.office, SICHT, [
        patients.erika,
      ]);
      const sicht = rows[0]!.sicht as {
        earliest_start: string;
        subscriptions: Array<Record<string, unknown>>;
      };
      expect(sicht.earliest_start).toBe(ABSCHLUSS);
      expect(sicht.subscriptions).toHaveLength(1);
      expect(sicht.subscriptions[0]).toMatchObject({ starts_on: ABSCHLUSS, ends_on: null });
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
  it('rechnet vom Beginn aus, am Monatsende nach § 188 Abs. 3 BGB', async () => {
    const { rows } = await asPostgres<{ n: number; von: string; bis: string }>(
      `select n,
              to_char(app.aftercare_month_start('2027-01-31', n), 'YYYY-MM-DD') as von,
              to_char(app.aftercare_month_end('2027-01-31', n), 'YYYY-MM-DD') as bis
         from generate_series(0, 2) n`,
    );
    expect(rows).toEqual([
      { n: 0, von: '2027-01-31', bis: '2027-02-28' },
      { n: 1, von: '2027-03-01', bis: '2027-03-30' },
      { n: 2, von: '2027-03-31', bis: '2027-04-30' },
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

  it('findet den Abo-Monat auch bei einem Beginn am 31.', async () => {
    const { rows } = await asPostgres<{ tag: string; n: number }>(
      `select tag, app.aftercare_month_index('2027-01-31', tag::date) as n
         from unnest(array['2027-02-28', '2027-03-01', '2027-03-30', '2027-03-31']) tag`,
    );
    expect(rows.map((r) => [r.tag, r.n])).toEqual([
      ['2027-02-28', 0],
      ['2027-03-01', 1],
      ['2027-03-30', 1],
      ['2027-03-31', 2],
    ]);
  });
});
