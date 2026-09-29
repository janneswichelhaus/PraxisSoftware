import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Erstaufnahme-Checkliste (PRX-013, ANN-143).
 *
 * Die Liste ist abgeleitet - jeder Test legt an, was in der Akte steht, und
 * prüft, was die Liste daraus macht. Dazu die Rollen, die Mandantengrenze und
 * die Regionen gegen die Bausteine.
 */
const { users, patients, organizationId } = SEED;

const CHECKLISTE = 'select item, state from public.get_intake_checklist($1::uuid)';
const LISTE = 'select * from public.list_open_intakes()';

/** Eine frische Person ohne alles - die Seed-Akten tragen schon manches. */
const LENA = '66666666-6666-4666-8666-0000000000e1';
const LENA_PERSON = '44444444-4444-4444-8444-0000000000e1';

async function neuePerson(): Promise<void> {
  await asPostgres(`
    insert into public.persons (id, organization_id, given_name, family_name)
      values ('${LENA_PERSON}', '${organizationId}', 'Lena', 'Aufnahme');
    insert into public.patients (id, organization_id, person_id)
      values ('${LENA}', '${organizationId}', '${LENA_PERSON}');
  `);
}

async function checkliste(konto: string = users.office): Promise<Record<string, string>> {
  const { rows } = await asUser<{ item: string; state: string }>(konto, CHECKLISTE, [LENA]);
  return Object.fromEntries(rows.map((r) => [r.item, r.state]));
}

async function bogen(instrument: string, status: 'entwurf' | 'abgeschlossen'): Promise<void> {
  await asPostgres(
    `insert into public.patient_questionnaire_responses
       (organization_id, patient_id, instrument_id, definition_version, status, recorded_on,
        answers, completed_at)
     values ($1::uuid, $2::uuid, $3, '1.0.0', $4, current_date, '{}'::jsonb,
             case when $4 = 'abgeschlossen' then now() end)`,
    [organizationId, LENA, instrument, status],
  );
}

async function vermerk(art: string): Promise<void> {
  await asPostgres(
    `insert into public.patient_privacy_records
       (organization_id, patient_id, record_kind, occurred_on, notice_version)
     values ($1::uuid, $2::uuid, $3, current_date,
             case when $3 = 'privacy_notice_handed_out' then '2026-09' end)`,
    [organizationId, LENA, art],
  );
}

async function grundlage(art: 'first' | 'self_pay'): Promise<void> {
  await asPostgres(
    `insert into public.treatment_bases
       (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count)
     values ($1::uuid, $2::uuid,
             case when $3 = 'self_pay' then null else '77777777-7777-4777-8777-000000000001'::uuid end,
             $3, current_date, 10)`,
    [organizationId, LENA, art],
  );
}

describe('Erstaufnahme-Checkliste (PRX-013)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await neuePerson();
  }, 120_000);

  it('beginnt mit fuenf offenen Punkten in fester Reihenfolge', async () => {
    const { rows } = await asUser<{ item: string; state: string }>(users.office, CHECKLISTE, [
      LENA,
    ]);
    expect(rows).toEqual([
      { item: 'prescription_photo', state: 'open' },
      { item: 'anamnesis', state: 'open' },
      { item: 'privacy', state: 'open' },
      { item: 'finding', state: 'open' },
      { item: 'treatment_table', state: 'open' },
    ]);
  });

  it('erledigt den Anamnesebogen nur abgeschlossen', async () => {
    await bogen('anamnese_v8', 'entwurf');
    expect((await checkliste()).anamnesis).toBe('open');
    await bogen('anamnese_v8', 'abgeschlossen');
    expect((await checkliste()).anamnesis).toBe('done');
  });

  it('erledigt den Befund mit einem abgeschlossenen Bogen einer Region, nicht mit der Anamnese', async () => {
    await bogen('anamnese_v8', 'abgeschlossen');
    expect((await checkliste()).finding).toBe('open');
    await bogen('knie', 'entwurf');
    expect((await checkliste()).finding).toBe('open');
    await bogen('knie', 'abgeschlossen');
    expect((await checkliste()).finding).toBe('done');
  });

  it('verlangt Datenschutzinformation und Behandlungsvertrag', async () => {
    await vermerk('privacy_notice_handed_out');
    expect((await checkliste()).privacy).toBe('open');
    await vermerk('treatment_contract_signed');
    expect((await checkliste()).privacy).toBe('done');
  });

  it('erledigt die Liege mit einer Entscheidung - auch mit nein', async () => {
    // Bisher war „nein“ der Standard; jetzt ist es eine Entscheidung (ANN-143).
    await asUserCommitted(
      users.therapist,
      'select public.set_treatment_table_required($1::uuid, false)',
      [LENA],
    );
    expect((await checkliste()).treatment_table).toBe('done');
    const { rows } = await asPostgres<{ action: string }>(
      `select action from public.audit_log where subject_id = $1 and action = 'patient.updated'`,
      [LENA],
    );
    expect(rows).toHaveLength(1);
  });

  it('laesst die Liege offen, solange nur andere Versorgungsangaben stehen', async () => {
    await asPostgres(
      `insert into public.patient_care_details (patient_id, organization_id, home_visit_access_note)
       values ($1::uuid, $2::uuid, 'Synthetisch: Klingel links')`,
      [LENA, organizationId],
    );
    expect((await checkliste()).treatment_table).toBe('open');
  });

  it('erledigt das Verordnungsfoto mit einem Scan und laesst es beim Selbstzahler entfallen', async () => {
    await grundlage('self_pay');
    expect((await checkliste()).prescription_photo).toBe('not_needed');

    await grundlage('first');
    expect((await checkliste()).prescription_photo).toBe('open');

    await asPostgres(
      `insert into public.patient_files
         (organization_id, patient_id, document_type, display_name, mime_type, byte_size,
          checksum_sha256, status, confirmed_at)
       values ($1::uuid, $2::uuid, 'verordnungsscan', 'Verordnung', 'image/jpeg', 10, $3, 'ready', now())`,
      [organizationId, LENA, 'd'.repeat(64)],
    );
    expect((await checkliste()).prescription_photo).toBe('done');
  });

  it('fuehrt die Person mit ihren offenen Punkten in der Liste - und nimmt sie heraus, wenn alles erledigt ist', async () => {
    const vorher = await asUser<{ patient_id: string; open_items: string[] }>(users.office, LISTE);
    expect(vorher.rows.find((r) => r.patient_id === LENA)?.open_items).toEqual([
      'prescription_photo',
      'anamnesis',
      'privacy',
      'finding',
      'treatment_table',
    ]);

    await grundlage('self_pay');
    await bogen('anamnese_v8', 'abgeschlossen');
    await bogen('hws', 'abgeschlossen');
    await vermerk('privacy_notice_handed_out');
    await vermerk('treatment_contract_signed');
    await asPostgres(
      `insert into public.patient_care_details (patient_id, organization_id, treatment_table_required)
       values ($1::uuid, $2::uuid, true)`,
      [LENA, organizationId],
    );

    const nachher = await asUser<{ patient_id: string }>(users.office, LISTE);
    expect(nachher.rows.map((r) => r.patient_id)).not.toContain(LENA);
  });

  it('fuehrt nicht, wer nicht mehr in Versorgung ist oder abgeschlossen hat', async () => {
    await asPostgres(`update public.patients set status = 'inactive' where id = $1`, [LENA]);
    const { rows } = await asUser<{ patient_id: string }>(users.office, LISTE);
    expect(rows.map((r) => r.patient_id)).not.toContain(LENA);
  });

  it('zeigt die Liste allen vier Praxisrollen', async () => {
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      const { rows } = await asUser<{ patient_id: string }>(konto, LISTE);
      expect(
        rows.map((r) => r.patient_id),
        konto,
      ).toContain(LENA);
      expect(Object.keys(await checkliste(konto))).toHaveLength(5);
    }
  });

  it('weist Trainingsbetreuung und Patientenkonto protokolliert ab (G6b)', async () => {
    for (const konto of [users.trainer, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(konto, LISTE, [], 'patient_directory.read');
      await erwarteAbgewiesenenLeseversuch(konto, CHECKLISTE, [LENA], 'patient_directory.read');
    }
  });

  it('endet an der eigenen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    const liste = await asUser<{ patient_id: string }>(fremd.owner, LISTE);
    expect(liste.rows.map((r) => r.patient_id)).not.toContain(LENA);
    const einzeln = await asUser(fremd.owner, CHECKLISTE, [LENA]);
    expect(einzeln.rows).toEqual([]);
    // Und umgekehrt: die fremde Person nicht in der eigenen Praxis.
    const eigen = await asUser(users.office, CHECKLISTE, [fremd.patient]);
    expect(eigen.rows).toEqual([]);
  });

  it('ist ohne Session und fuer anon nicht aufrufbar', async () => {
    await expect(asUser(null, LISTE)).rejects.toThrow(/not authenticated/);
    await expect(asAnon(LISTE)).rejects.toThrow(/permission denied/i);
  });

  it('kennt dieselben neun Regionen wie die Bausteine des Befunds', async () => {
    const ordner = join(process.cwd(), 'src/features/assessments/definitionen/bausteine');
    const ids = readdirSync(ordner)
      .filter((datei) => datei.endsWith('.json'))
      .map((datei) => (JSON.parse(readFileSync(join(ordner, datei), 'utf8')) as { id: string }).id)
      .sort();
    const { rows } = await asPostgres<{ ids: string[] }>(
      'select app.intake_finding_instruments() as ids',
    );
    expect([...rows[0]!.ids].sort()).toEqual(ids);
  });
});

describe('Erstaufnahme der Seed-Akten', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('liefert fuer Max eine vollstaendige Liste', async () => {
    const { rows } = await asUser<{ item: string }>(users.office, CHECKLISTE, [patients.max]);
    expect(rows).toHaveLength(5);
  });
});
