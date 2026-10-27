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

const { users, trainingRelationships, patients, organizationId } = SEED;
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
    // Mit Commit, wo es ein Konto gibt: Ein Protokolleintrag vor der
    // Abweisung bliebe so stehen (Zweitreview).
    if (konto === null) await asUser(konto, AUSKUNFT, [id]);
    else await asUserCommitted(konto, AUSKUNFT, [id]);
    return undefined;
  } catch (cause) {
    return (cause as { code?: string }).code;
  }
}

// Welche Tabellen in die Kopie gehören, verschachtelt stehen oder bewusst fehlen, hält das Register
// der Querschnittsfunktionen fest (supabase/tests/data-registry.test.ts, ANN-751).

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

  it('nimmt Messwerte, Nachträge und Verfasser mit - ohne Kennungen von Konten und Zugängen', async () => {
    // Zweitreview: Zeilen in den Tabellen, die der Seed leer lässt.
    const tina = trainingRelationships.tina;
    const { rows: protokoll } = await asPostgres<{ id: string }>(
      `insert into public.training_protocols
         (organization_id, training_relationship_id, appointment_id, status, content,
          created_by, updated_by, finalized_at, finalized_by)
       values ($1, $2, 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009', 'final', 'Synthetische Einheit',
               $3, $3, now(), $3) returning id`,
      [organizationId, tina, users.trainer],
    );
    await asPostgres(
      `insert into public.training_protocol_addenda
         (organization_id, protocol_id, content, reason, created_by)
       values ($1, $2, 'Gewicht war 20 kg.', 'Zahl vertippt', $3)`,
      [organizationId, protokoll[0]!.id, users.trainer],
    );
    const { rows: assessment } = await asPostgres<{ id: string }>(
      `insert into public.training_assessments
         (organization_id, training_relationship_id, title, performed_on, created_by)
       values ($1, $2, 'Sprungtest', current_date, $3) returning id`,
      [organizationId, tina, users.trainer],
    );
    await asPostgres(
      `insert into public.training_assessment_results
         (organization_id, assessment_id, position, label, unit, value, value_left, value_right)
       values ($1, $2, 1, 'Einbeinsprung weit', 'cm', null, 112, 140),
              ($1, $2, 2, 'Kniebeugen in 30 s', null, 18, null, null)`,
      [organizationId, assessment[0]!.id],
    );
    await asPostgres(
      `insert into public.training_course_events
         (organization_id, training_relationship_id, occurred_on, kind, created_by)
       values ($1, $2, current_date, 'urlaub', $3)`,
      [organizationId, tina, users.trainer],
    );

    const daten = await kopie(users.ownerTherapist, tina);
    const [protokollZeile] = daten.tabellen['training_protocols'] as {
      author: string | null;
      addenda: { content: string; reason: string; author: string | null }[];
    }[];
    expect(protokollZeile!.author).toBeTruthy();
    expect(protokollZeile!.addenda).toEqual([
      expect.objectContaining({ content: 'Gewicht war 20 kg.', reason: 'Zahl vertippt' }),
    ]);
    expect(protokollZeile!.addenda[0]!.author).toBe(protokollZeile!.author);
    const [assessmentZeile] = daten.tabellen['training_assessments'] as {
      results: Record<string, unknown>[];
    }[];
    expect(assessmentZeile!.results).toEqual([
      {
        position: 1,
        label: 'Einbeinsprung weit',
        unit: 'cm',
        value: null,
        value_left: 112,
        value_right: 140,
      },
      {
        position: 2,
        label: 'Kniebeugen in 30 s',
        unit: null,
        value: 18,
        value_left: null,
        value_right: null,
      },
    ]);
    expect(daten.tabellen['training_course_events']).toEqual([
      expect.objectContaining({ kind: 'urlaub', author: expect.any(String) as unknown }),
    ]);

    // Keine Kennung eines Kontos, eines Zugangs oder des Mandanten - und kein
    // Schlüssel `*_by`.
    const text = JSON.stringify(daten.tabellen);
    for (const kennung of [
      ...Object.values(users),
      ...Object.values(SEED.platformAccesses),
      organizationId,
    ]) {
      expect(text, kennung).not.toContain(kennung);
    }
    expect(text).not.toMatch(/_by"/);
  });

  it('entfernt Kennungen nach Muster; jede übrige Kennungsspalte ist entschieden', async () => {
    const { rows } = await asPostgres<{ zeile: unknown }>(
      `select app.auskunft_ohne_kennungen(
         '{"organization_id": 1, "person_id": 2, "training_relationship_id": 3, "later_by": 4,
           "withdrawn_platform_access_id": 5, "platform_access_id": 6, "behalten": 7}'::jsonb) as zeile`,
    );
    expect(rows[0]!.zeile).toEqual({ behalten: 7 });
    // Eine neue Spalte `*_id` an einer Tabelle, die Zeile für Zeile mitgeht,
    // fällt hier auf und verlangt eine Entscheidung.
    const { rows: spalten } = await asPostgres<{ spalte: string }>(
      `select c.table_name || '.' || c.column_name as spalte
         from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name in ('training_relationships', 'training_contact_details',
                               'training_profiles', 'training_assessments', 'training_bases',
                               'training_consent_records', 'training_contracts',
                               'training_course_events', 'training_protocols',
                               'training_takeovers')
          and c.column_name like '%\\_id'
          and c.column_name not in ('organization_id', 'training_relationship_id', 'person_id')
          and c.column_name not like '%platform\\_access\\_id'
        order by 1`,
    );
    expect(spalten.map((z) => z.spalte)).toEqual([
      // Wird ausdrücklich entfernt: das Paket steht mit Namen in `training_packages`.
      'training_contracts.training_package_id',
      // Verweis auf den Termin in `appointments` derselben Kopie.
      'training_protocols.appointment_id',
    ]);
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
       where p.proname in ('export_training_record', 'auskunft_organisation_training',
                           'auskunft_ohne_kennungen')
       order by 1`,
    );
    expect(rows).toHaveLength(3);
    for (const fn of rows) expect(fn.proconfig, fn.proname).toContain('search_path=""');
    const { rows: rechte } = await asPostgres<{ anon: boolean; angemeldet: boolean }>(
      `select has_function_privilege('anon', f, 'EXECUTE') as anon,
              has_function_privilege('authenticated', f, 'EXECUTE') as angemeldet
         from unnest(array['app.auskunft_organisation_training(uuid)',
                           'app.auskunft_ohne_kennungen(jsonb)']) f`,
    );
    expect(rechte).toEqual([
      { anon: false, angemeldet: false },
      { anon: false, angemeldet: false },
    ]);
  });
});
