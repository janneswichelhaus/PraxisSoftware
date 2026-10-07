import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Datenexport der Plattform (POR-018; IDEA-QSN-003; ADR-023 Punkte 12, 13,
 * 22, 23, 24; ANN-261, ANN-265).
 *
 * Der Export setzt die Plattformprojektionen zusammen und hat keine eigene
 * Feldliste; dazu die eigenen Stammdaten. Die Person selbst und ihre
 * rechtliche Vertretung, nie die Begleitung, nur in der Lesezeit. Jeder
 * Export steht als `patient_record.exported` im Protokoll.
 */

const { users, platformAccesses, patients, organizationId, trainingRelationships } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const PAULA = platformAccesses.paulaBegleitungMax;
const TINA = platformAccesses.tinaTraining;
const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e1';
const KONTO_BERND = '99999999-9999-4999-8999-0000000000e1';

const EXPORT = 'select public.platform_export($1::uuid) as daten';

async function exportieren(konto: string, zugang: string): Promise<Record<string, unknown>> {
  const { rows } = await asUserCommitted<{ daten: Record<string, unknown> }>(konto, EXPORT, [
    zugang,
  ]);
  return rows[0]!.daten;
}

async function protokoll() {
  return (
    await asPostgres<{
      actor_user_id: string;
      actor_kind: string;
      subject_type: string;
      subject_id: string;
      context: Record<string, unknown>;
    }>(
      `select actor_user_id, actor_kind, subject_type, subject_id, context from public.audit_log
        where action = 'patient_record.exported' order by occurred_at`,
    )
  ).rows;
}

describe('Datenexport der Plattform (POR-018)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('liefert die Daten der Plattform aus den Projektionen und protokolliert den Export', async () => {
    const daten = await exportieren(users.plattformErika, ERIKA);
    expect(daten).toEqual(
      expect.objectContaining({
        format: 'plattform-export',
        format_version: 1,
        relationship: 'treatment',
        exported_by: 'self',
        organization: expect.any(String) as unknown,
      }),
    );
    // Feste Schlüssel: nichts darüber hinaus.
    expect(Object.keys(daten).sort()).toEqual(
      [
        'appointment_requests',
        'appointments',
        'consents',
        'documents',
        'exported_at',
        'exported_by',
        'format',
        'format_version',
        'invoices',
        'organization',
        'person',
        'questionnaires',
        'relationship',
      ].sort(),
    );
    expect(Object.keys(daten.person as object).sort()).toEqual(
      [
        'city',
        'date_of_birth',
        'email',
        'family_name',
        'given_name',
        'house_number',
        'phone',
        'phone_mobile',
        'phone_work',
        'postal_code',
        'street',
      ].sort(),
    );
    expect((daten.person as { family_name: string }).family_name).toBe('Beispiel');
    // Dieselben Termine wie die Projektion.
    const termine = await asUser<{ id: string }>(
      users.plattformErika,
      'select id from public.platform_appointments($1::uuid)',
      [ERIKA],
    );
    expect((daten.appointments as { id: string }[]).map((t) => t.id)).toEqual(
      termine.rows.map((t) => t.id),
    );
    expect((daten.consents as { purpose: string }[]).map((c) => c.purpose)).toEqual([
      'email_contact',
      'prescriber_report',
      'patient_photos',
    ]);
    // Keine Akte: weder Dokumentation noch Koordinaten noch interne Felder.
    const text = JSON.stringify(daten);
    for (const verboten of ['"lat"', '"lon"', 'institution', 'internal_note', 'treatment_note']) {
      expect(text).not.toContain(verboten);
    }

    expect(await protokoll()).toEqual([
      {
        actor_user_id: users.plattformErika,
        actor_kind: 'platform',
        subject_type: 'patient',
        subject_id: patients.erika,
        context: {
          surface: 'platform',
          purpose: 'platform_export',
          platform_access_id: ERIKA,
          access_kind: 'self',
        },
      },
    ]);
  });

  it('Training: eigene Stammdaten, keine Dokumente, Gegenstand das Trainingsverhältnis', async () => {
    const daten = await exportieren(users.plattformTina, TINA);
    expect(daten.relationship).toBe('training');
    expect(daten.documents).toEqual([]);
    expect(Object.keys(daten.person as object)).not.toContain('phone_mobile');
    expect(await protokoll()).toEqual([
      expect.objectContaining({
        subject_type: 'training_relationship',
        subject_id: trainingRelationships.tina,
      }),
    ]);
  });

  it('rechtliche Vertretung: exportiert für die Person, protokolliert als Vertretung', async () => {
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'bernd.e@patient.invalid')`,
      [KONTO_BERND],
    );
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
          health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
       values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
               'guardianship', 'Bernd Betreuer', array['identity_document', 'guardianship_certificate'],
               true, false, $5, now(), $5)`,
      [BERND, organizationId, patients.max, KONTO_BERND, users.office],
    );
    const daten = await exportieren(KONTO_BERND, BERND);
    expect((daten.person as { family_name: string }).family_name).toBe('Mustermann');
    expect(daten.exported_by).toBe('legal_representative');
    // Ohne Vermögenssorge keine Rechnungen - die Projektion entscheidet.
    expect(daten.invoices).toEqual([]);
    expect(await protokoll()).toEqual([
      expect.objectContaining({ actor_user_id: KONTO_BERND, actor_kind: 'representative' }),
    ]);
  });

  it('Begleitung, fremde Person, Praxiskonto, andere Organisation: abgewiesen, nichts im Protokoll', async () => {
    const fremd = await fremdeOrganisation();
    for (const [konto, zugang] of [
      [users.plattformPaula, PAULA],
      [users.plattformTina, ERIKA],
      [users.office, ERIKA],
      [users.ownerTherapist, ERIKA],
      [fremd.owner, ERIKA],
    ] as const) {
      const fehler = await abgefangen(asUser(konto, EXPORT, [zugang]));
      expect(fehler?.message).toContain('not allowed');
    }
    expect(await protokoll()).toEqual([]);
  });

  it('gesperrt, entzogen, eingeladen, nach der Lesefrist: abgewiesen (ANN-261)', async () => {
    const faelle = [
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      `update public.platform_accesses set status = 'revoked', revoked_at = now(),
              revoked_reason = 'practice', revoked_by = created_by where id = $1`,
      `update public.platform_accesses set status = 'invited', account_user_id = null where id = $1`,
    ];
    for (const fall of faelle) {
      await resetDatabase();
      await asPostgres(fall, [ERIKA]);
      const fehler = await abgefangen(asUser(users.plattformErika, EXPORT, [ERIKA]));
      expect(fehler?.message).toContain('not allowed');
    }
    await resetDatabase();
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.erika, users.ownerTherapist],
    );
    const fehler = await abgefangen(asUser(users.plattformErika, EXPORT, [ERIKA]));
    expect(fehler?.message).toContain('not allowed');
  }, 360_000);
});
