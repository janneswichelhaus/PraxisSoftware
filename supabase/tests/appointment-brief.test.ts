import { beforeEach, describe, expect, it } from 'vitest';
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
 * Vertretungs-Kurzblick am Termin (PRX-006, ANN-137).
 *
 * Geprüft werden: was der Blick zeigt (Zugangshinweis, Besonderheit, feste
 * Therapeut:in, Grundlage, letzter Eintrag im Wortlaut), welcher Eintrag der
 * „letzte" ist, dass jedes Lesen protokolliert wird, wer abgewiesen wird und
 * dass Trainings- und Fehlzeittermine keinen Kurzblick haben.
 */

const { users, patients, organizationId } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
/** Max, Folgeverordnung: 10 Termine, Krankengymnastik 7 genutzt (supabase/seed.sql). */
const GRUNDLAGE_MAX = '88888888-8888-4888-8888-000000000002';

const BLICK = 'select * from public.get_appointment_brief($1::uuid)';

interface Blick {
  appointment_id: string;
  patient_id: string;
  home_visit_access_note: string | null;
  special_note: string | null;
  primary_therapist_name: string | null;
  treatment_basis_id: string | null;
  treatment_basis_kind: string | null;
  basis_appointment_count: number | null;
  basis_used: number | null;
  basis_planned: number | null;
  basis_items: { remedy: string; prescribed_quantity: number; used_quantity: number }[] | null;
  last_note_id: string | null;
  last_note_status: string | null;
  last_note_content: string | null;
  last_note_author_name: string | null;
}

async function termin(opts: {
  tage: number;
  kind?: 'therapy' | 'training' | 'internal';
  patient?: string;
  grundlage?: string | null;
  status?: string;
}): Promise<string> {
  const kind = opts.kind ?? 'therapy';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, training_relationship_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id, kind, title,
       completed_at, completed_by, event_group_id
     ) values (
       $1, $2, $9, $3, $4, 'practice', $5,
       date_trunc('hour', now()) + make_interval(days => $6::int),
       date_trunc('hour', now()) + make_interval(days => $6::int, hours => 1),
       $7, $8, case when $8 = 'internal' then 'Teambesprechung' end,
       case when $5 in ('completed', 'documented') then now() end,
       case when $5 in ('completed', 'documented') then $10::uuid end,
       case when $8 = 'internal' then gen_random_uuid() end
     ) returning id`,
    [
      organizationId,
      kind === 'therapy' ? (opts.patient ?? patients.max) : null,
      ANNA,
      LOCATION,
      opts.status ?? 'confirmed',
      opts.tage,
      kind === 'therapy' ? (opts.grundlage === undefined ? GRUNDLAGE_MAX : opts.grundlage) : null,
      kind,
      kind === 'training' ? SEED.trainingRelationships.erika : null,
      users.therapist,
    ],
  );
  return rows[0]!.id;
}

async function eintrag(
  appointmentId: string,
  inhalt: string,
  status: 'draft' | 'final' = 'final',
  nachtragZu: string | null = null,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.treatment_notes
       (organization_id, appointment_id, status, content, created_by, updated_by,
        addendum_to_note_id, finalized_at, finalized_by, finalisation_kind)
     values ($1, $2, $3, $4, $5, $5, $6,
             case when $3 = 'final' then now() end,
             case when $3 = 'final' then $5::uuid end,
             case when $3 = 'final' then 'manual' end)
     returning id`,
    [organizationId, appointmentId, status, inhalt, users.therapist, nachtragZu],
  );
  return rows[0]!.id;
}

async function protokoll(action: string, actor: string) {
  const { rows } = await asPostgres<{
    subject_type: string;
    subject_id: string;
    outcome: string;
    context: Record<string, unknown>;
  }>(
    `select subject_type, subject_id, outcome, context from public.audit_log
      where action = $1 and actor_user_id = $2 order by occurred_at, id`,
    [action, actor],
  );
  return rows;
}

describe('Vertretungs-Kurzblick (PRX-006)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('zeigt Zugang, Besonderheit, feste Therapeut:in und die Grundlage', async () => {
    const heute = await termin({ tage: 1 });
    const { rows } = await asUser<Blick>(users.teamLead, BLICK, [heute]);

    expect(rows).toHaveLength(1);
    const blick = rows[0]!;
    expect(blick.patient_id).toBe(patients.max);
    expect(blick.home_visit_access_note).toContain('Klingel');
    expect(blick.special_note).toContain('Hund');
    expect(blick.primary_therapist_name).toBe('Anna Beispiel');
    expect(blick.treatment_basis_id).toBe(GRUNDLAGE_MAX);
    expect(blick.treatment_basis_kind).toBe('follow_up');
    expect(blick.basis_appointment_count).toBe(10);
    expect(blick.basis_used).toBe(7);
    expect(blick.basis_items).toEqual([
      { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 7 },
    ]);
    expect(blick.last_note_id).toBeNull();
  });

  it('nimmt den letzten Haupteintrag vor diesem Termin, im Wortlaut', async () => {
    const alt = await termin({ tage: -14, status: 'documented' });
    const vorher = await termin({ tage: -7, status: 'documented' });
    const heute = await termin({ tage: 1 });
    const spaeter = await termin({ tage: 8 });

    await eintrag(alt, 'Synthetisch: alter Eintrag.');
    const letzter = await eintrag(vorher, 'Synthetisch: Übungen angeleitet, Hund war im Flur.');
    // Ein Nachtrag, ein Eintrag am Termin selbst und einer danach zählen nicht.
    await eintrag(vorher, 'Synthetisch: Nachtrag.', 'final', letzter);
    await eintrag(heute, 'Synthetisch: Entwurf von heute.', 'draft');
    await eintrag(spaeter, 'Synthetisch: Entwurf aus der Zukunft.', 'draft');

    const { rows } = await asUser<Blick>(users.office, BLICK, [heute]);
    expect(rows[0]!.last_note_id).toBe(letzter);
    expect(rows[0]!.last_note_content).toBe('Synthetisch: Übungen angeleitet, Hund war im Flur.');
    expect(rows[0]!.last_note_status).toBe('final');
    expect(rows[0]!.last_note_author_name).toBe('Anna Beispiel');
  });

  it('zeigt auch einen Entwurf - als Entwurf gekennzeichnet', async () => {
    const vorher = await termin({ tage: -2, status: 'completed' });
    const heute = await termin({ tage: 1 });
    await eintrag(vorher, 'Synthetisch: noch nicht finalisiert.', 'draft');

    const { rows } = await asUser<Blick>(users.therapist, BLICK, [heute]);
    expect(rows[0]!.last_note_status).toBe('draft');
  });

  it('protokolliert jedes Aufklappen, den gezeigten Eintrag zusätzlich', async () => {
    const vorher = await termin({ tage: -7, status: 'documented' });
    const heute = await termin({ tage: 1 });
    const letzter = await eintrag(vorher, 'Synthetisch: Eintrag.');

    await asUserCommitted(users.office, BLICK, [heute]);

    const blicke = await protokoll('appointment_brief.viewed', users.office);
    expect(blicke).toHaveLength(1);
    expect(blicke[0]).toMatchObject({
      subject_type: 'appointment',
      subject_id: heute,
      outcome: 'success',
      context: { surface: 'web', patient_id: patients.max, treatment_note_id: letzter },
    });
    const gelesen = await protokoll('treatment_note.viewed', users.office);
    expect(gelesen).toHaveLength(1);
    expect(gelesen[0]).toMatchObject({
      subject_type: 'treatment_note',
      subject_id: letzter,
      context: { surface: 'appointment_brief', appointment_id: heute, patient_id: patients.max },
    });
    // Kein Freitext im Protokoll (ADR-010 Punkt 3).
    expect(JSON.stringify([...blicke, ...gelesen])).not.toContain('Synthetisch');
  });

  it('schreibt ohne gezeigten Eintrag nur den Blick ins Protokoll', async () => {
    const heute = await termin({ tage: 1 });
    await asUserCommitted(users.therapist, BLICK, [heute]);
    expect(await protokoll('appointment_brief.viewed', users.therapist)).toHaveLength(1);
    expect(await protokoll('treatment_note.viewed', users.therapist)).toHaveLength(0);
  });

  it('weist Trainingsbetreuung und Patientenkonto protokolliert ab', async () => {
    const heute = await termin({ tage: 1 });
    await erwarteAbgewiesenenLeseversuch(users.trainer, BLICK, [heute], 'appointment_brief.viewed');
    await erwarteAbgewiesenenLeseversuch(
      users.patientMax,
      BLICK,
      [heute],
      'appointment_brief.viewed',
    );
  });

  it('hat für Trainings- und Fehlzeittermine keinen Kurzblick', async () => {
    const training = await termin({ tage: 1, kind: 'training' });
    const fehlzeit = await termin({ tage: 2, kind: 'internal' });
    await expect(asUser(users.office, BLICK, [training])).rejects.toThrow(/only for treatment/);
    await expect(asUser(users.office, BLICK, [fehlzeit])).rejects.toThrow(/only for treatment/);
  });

  it('liefert nichts zu einem Termin einer fremden Organisation', async () => {
    const f = await fremdeOrganisation();
    const { rows: fremd } = await asPostgres<{ id: string }>(
      `insert into public.appointments (organization_id, patient_id, staff_member_id,
         appointment_type, status, starts_at, ends_at)
       values ($1, $2, $3, 'video', 'confirmed', now() + interval '1 day',
               now() + interval '1 day 1 hour') returning id`,
      [f.organizationId, f.patient, f.staffMember],
    );
    const { rows } = await asUser(users.office, BLICK, [fremd[0]!.id]);
    expect(rows).toEqual([]);
    expect(await protokoll('appointment_brief.viewed', users.office)).toHaveLength(0);
  });

  it('kommt ohne Grundlage aus', async () => {
    const heute = await termin({ tage: 1, grundlage: null });
    const { rows } = await asUser<Blick>(users.office, BLICK, [heute]);
    expect(rows[0]!.treatment_basis_id).toBeNull();
    expect(rows[0]!.basis_items).toBeNull();
    expect(rows[0]!.basis_appointment_count).toBeNull();
  });

  it('behandelt einen Trainingstermin für die Therapeutin wie einen unbekannten (Zweitreview)', async () => {
    const training = await termin({ tage: 1, kind: 'training' });
    const { rows } = await asUser(users.therapist, BLICK, [training]);
    expect(rows).toEqual([]);
    expect(await protokoll('appointment_brief.viewed', users.therapist)).toHaveLength(0);
  });
});
