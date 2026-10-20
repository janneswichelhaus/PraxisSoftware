import { beforeEach, describe, expect, it } from 'vitest';
import { TRAINING_KATEGORIEN } from '@/features/datenschutz/kategorien';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Auskunft nach Art. 15 je Trainingsverhältnis (BEF-182).
 *
 * Die Auskunft der Praxis ging nur von der Akte aus; Training ist ein eigenes
 * Rechtsverhältnis (ADR-021) und bekommt seine eigene Kopie - wie
 * `export_patient_record`: nur `owner`, nur die eigene Praxis, ein
 * Protokolleintrag je Kopie. Geprüft werden Inhalt, Vollständigkeit gegen den
 * Aufbewahrungsplan, die Trennung von der Akte und die Rechte (ADR-013
 * Punkt 9 Nr. 1).
 */

const { users, trainingRelationships, patients } = SEED;
const AUSKUNFT = 'select public.export_training_record($1::uuid) as daten';

interface Kopie {
  training_relationship_id: string;
  rechtsgrundlage: string;
  tabellen: Record<string, unknown[]>;
  nicht_enthalten: { was: string; grund: string }[];
}

async function kopie(konto: string, id: string): Promise<Kopie> {
  const { rows } = await asUser<{ daten: Kopie }>(konto, AUSKUNFT, [id]);
  return rows[0]!.daten;
}

async function fehlercode(konto: string | null, id: string): Promise<string | undefined> {
  try {
    await asUser(konto, AUSKUNFT, [id]);
    return undefined;
  } catch (cause) {
    return (cause as { code?: string }).code;
  }
}

/**
 * Was ueber einen Elterndatensatz haengt und als Teil seines Abschnitts in
 * der Kopie steht, oder was bewusst nicht hineingehoert - mit Grund.
 */
const BEWUSST_AUSSEN = new Map<string, string>([
  ['exercise_plan_items', 'Die Positionen stehen als `items` an ihrem Plan in `exercise_plans`.'],
]);

describe('export_training_record (BEF-182)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('gibt owner eine Kopie des Verhältnisses mit Namen, Angaben und Rechtsgrundlage', async () => {
    const daten = await kopie(users.ownerTherapist, trainingRelationships.tina);
    expect(daten.training_relationship_id).toBe(trainingRelationships.tina);
    expect(daten.rechtsgrundlage).toBe('Art. 15 Abs. 3 DSGVO');
    expect(daten.tabellen['persons']).toEqual([expect.objectContaining({ given_name: 'Tina' })]);
    expect(daten.tabellen['training_relationships']).toHaveLength(1);
    // Nichts Internes: kein Mandant, keine Kennung bearbeitender Konten.
    const text = JSON.stringify(daten.tabellen);
    for (const verboten of [
      '"organization_id"',
      '"created_by"',
      '"updated_by"',
      '"recorded_by"',
      '"platform_access_id"',
    ]) {
      expect(text, verboten).not.toContain(verboten);
    }
    expect(daten.nicht_enthalten.map((h) => h.was)).toContain('Daten einer Behandlung');
  });

  it('enthält jede Tabelle des Aufbewahrungsplans am Trainingsverhältnis', async () => {
    const { rows } = await asPostgres<{ table_name: string }>(
      `select distinct ra.table_name from public.retention_assignments ra
       where exists (
         select 1 from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = ra.table_name
           and c.column_name in ('training_relationship_id', 'relationship_kind'))
       order by 1`,
    );
    const daten = await kopie(users.ownerTherapist, trainingRelationships.tina);
    const fehlend = rows
      .map((z) => z.table_name)
      .filter((name) => !(name in daten.tabellen) && !BEWUSST_AUSSEN.has(name));
    expect(fehlend).toEqual([]);
  });

  it('beschriftet jeden Abschnitt der Kopie und keinen, den es nicht gibt', async () => {
    const daten = await kopie(users.ownerTherapist, trainingRelationships.tina);
    expect(Object.keys(TRAINING_KATEGORIEN).sort()).toEqual(Object.keys(daten.tabellen).sort());
  });

  it('trennt das Training von der Behandlung derselben Person (ADR-021)', async () => {
    // Erika hat beides; ihre Kopie zum Training trägt keinen Termin der Akte.
    const daten = await kopie(users.ownerTherapist, trainingRelationships.erika);
    const { rows: akte } = await asPostgres<{ id: string }>(
      'select id from public.appointments where patient_id = $1',
      [patients.erika],
    );
    const termine = (daten.tabellen['appointments'] as { id: string }[]).map((t) => t.id);
    for (const termin of akte) expect(termine).not.toContain(termin.id);
  });

  it('protokolliert jede Kopie wie die Auskunft zur Akte', async () => {
    await asUserCommitted(users.ownerTherapist, AUSKUNFT, [trainingRelationships.tina]);
    const { rows } = await asPostgres<{ action: string; subject_type: string; context: unknown }>(
      `select action, subject_type, context from public.audit_log
        where subject_id = $1 and action = 'patient_record.exported'`,
      [trainingRelationships.tina],
    );
    expect(rows).toEqual([
      {
        action: 'patient_record.exported',
        subject_type: 'training_relationship',
        context: { surface: 'web', purpose: 'auskunft_art_15' },
      },
    ]);
  });

  it('nur owner, nur die eigene Praxis - ohne zu verraten, ob es das Verhältnis gibt', async () => {
    for (const konto of [users.therapist, users.office, users.teamLead, users.trainer]) {
      expect(await fehlercode(konto, trainingRelationships.tina), konto).toBe('42501');
    }
    for (const konto of [users.patientMax, users.plattformTina]) {
      expect(await fehlercode(konto, trainingRelationships.tina), konto).toBe('42501');
    }
    expect(await fehlercode(null, trainingRelationships.tina)).toBe('42501');
    const fremd = await fremdeOrganisation();
    expect(await fehlercode(fremd.owner, trainingRelationships.tina)).toBe('42501');
    // Unbekannt und fremd sehen gleich aus.
    expect(await fehlercode(users.ownerTherapist, 'eeeeeeee-eeee-4eee-8eee-0000000009ff')).toBe(
      '42501',
    );
    await expect(asAnon(AUSKUNFT, [trainingRelationships.tina])).rejects.toThrow(
      /permission denied/i,
    );
    // Abgewiesen bleibt ohne Protokolleintrag einer Kopie.
    const { rows } = await asPostgres<{ n: string }>(
      `select count(*) n from public.audit_log where action = 'patient_record.exported'`,
    );
    expect(Number(rows[0]!.n)).toBe(0);
  });

  it('läuft mit leerem search_path; die Prüfung ist für niemanden direkt aufrufbar', async () => {
    const { rows } = await asPostgres<{ proname: string; proconfig: string[] | null }>(
      `select p.proname, p.proconfig from pg_proc p
       where p.proname in ('export_training_record', 'auskunft_organisation_training')
       order by 1`,
    );
    expect(rows).toHaveLength(2);
    for (const fn of rows) expect(fn.proconfig, fn.proname).toContain('search_path=""');
    const { rows: rechte } = await asPostgres<{ anon: boolean; angemeldet: boolean }>(
      `select has_function_privilege('anon', 'app.auskunft_organisation_training(uuid)', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'app.auskunft_organisation_training(uuid)', 'EXECUTE') as angemeldet`,
    );
    expect(rechte).toEqual([{ anon: false, angemeldet: false }]);
  });
});
