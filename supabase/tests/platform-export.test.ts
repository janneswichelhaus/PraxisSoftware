import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
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

/** Erikas Ernährungsberatung aus dem Seed (ERN-001). */
async function beratungVonErika(): Promise<{ id: string; started_on: string }> {
  const { rows } = await asPostgres<{ id: string; started_on: string }>(
    `select id, to_char(started_on, 'YYYY-MM-DD') as started_on from public.nutrition_profiles
      where relationship_kind = 'treatment' and relationship_id = $1`,
    [patients.erika],
  );
  return rows[0]!;
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
        // ANG-008: die eigenen Trainingspakete (in der Behandlung leer).
        'training_packages',
        // KND-003: der im Konto geschlossene Trainingsvertrag (sonst null).
        'training_contract',
        // UEB-009 bis UEB-011: die eigenen Pläne, wie die Plattform sie zeigt.
        'exercise_plans',
        // KOM-004: die eigenen Nachrichten, wie die Plattform sie zeigt.
        'messages',
        // TRK-003: die eigenen Check-ins mit Takt und Angaben.
        'checkins',
        // ALT-003: die eigenen Gewohnheiten mit vermerkten Tagen.
        'habits',
        // ERN-002: die eigene Ernährungsberatung, ohne Notizen der Beratung.
        'nutrition',
        // BEF-147: die eigene Wahl zu Benachrichtigungen, Geräte, Zustellaufträge.
        'notifications',
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
      // KOM-005: Fotos und Videos an Rückfragen (ADR-017 Punkt 61).
      'message_attachments',
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

  it('nimmt die eigene Wahl zu Benachrichtigungen, Erinnerungen, Geräte ohne Schlüssel und Zustellaufträge mit (BEF-147)', async () => {
    const endpunkt = 'https://fcm.googleapis.com/fcm/send/geraet-export';
    const p256dh = 'B'.padEnd(87, 'Q');
    const schluessel = 'Z'.repeat(22);
    // ERN-009: eine Erinnerung ans Ernährungstagebuch (Erika hat im Seed ein Profil).
    await asUserCommitted(
      users.plattformErika,
      'select public.set_platform_diary_reminders($1::uuid, $2::jsonb, $3, $4)',
      [ERIKA, JSON.stringify([{ meal: 'breakfast', time: '07:30' }]), true, false],
    );
    await asUserCommitted(
      users.plattformErika,
      'select public.set_platform_notification_settings($1::uuid, $2::text[], $3::text[], $4::smallint, $5::smallint)',
      [ERIKA, ['appointment_cancelled'], ['plan_assigned'], 21, 7],
    );
    await asUserCommitted(
      users.plattformErika,
      'select public.register_platform_push_subscription($1::uuid, $2, $3, $4)',
      [ERIKA, endpunkt, p256dh, schluessel],
    );
    await asPostgres(
      `insert into public.notification_deliveries
         (organization_id, access_id, kind, channel, due_at, state, finished_at)
       values ($1, $2, 'plan_assigned', 'push', now(), 'sent', now())`,
      [organizationId, ERIKA],
    );

    const daten = await exportieren(users.plattformErika, ERIKA);
    const zeit = expect.any(String) as unknown;
    const beratung = await beratungVonErika();
    expect(daten.notifications).toEqual({
      settings: {
        email_kinds: ['appointment_cancelled'],
        push_kinds: ['plan_assigned'],
        quiet_from: 21,
        quiet_until: 7,
        chosen_at: zeit,
      },
      // Je Gerät nur „seit wann" - Endpunkt und Schlüssel sind Zugangsdaten
      // zum Push-Dienst, keine Angabe über die Person.
      devices: [{ registered_at: zeit }],
      // Mit der Beratung, zu der die Erinnerung gehört (Zweitreview).
      diary_reminders: [
        {
          meal: 'breakfast',
          remind_at: '07:30:00',
          chosen_at: zeit,
          profile_started_on: beratung.started_on,
          profile_ended_on: null,
        },
      ],
      deliveries: [
        {
          kind: 'plan_assigned',
          channel: 'push',
          created_at: zeit,
          due_at: zeit,
          subject_at: null,
          state: 'sent',
          finished_at: zeit,
          drop_reason: null,
        },
      ],
    });
    const text = JSON.stringify(daten);
    for (const verboten of [endpunkt, p256dh, schluessel, 'subject_id', 'attempts']) {
      expect(text).not.toContain(verboten);
    }
    // Je Zugang: Tina exportiert nur ihre eigene (leere) Wahl - und Erikas
    // Zugang zum Training nicht die ihres Zugangs zur Behandlung (Zweitreview).
    const leer = { settings: null, devices: [], diary_reminders: [], deliveries: [] };
    expect((await exportieren(users.plattformTina, TINA)).notifications).toEqual(leer);
    expect(
      (await exportieren(users.plattformErika, platformAccesses.erikaTraining)).notifications,
    ).toEqual(leer);
  });

  it('Vertretung am selben Verhältnis: jeder Zugang exportiert nur die eigene Wahl (ANN-669)', async () => {
    // Eine rechtliche Vertretung für Erikas Behandlung wählt eigene
    // Erinnerungen und Benachrichtigungen; Erikas Export trägt sie nicht und
    // umgekehrt.
    const konto = '99999999-9999-4999-8999-0000000000e2';
    const vertretung = 'cafecafe-cafe-4afe-8afe-0000000000e2';
    await asPostgres(
      `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'vera.v@patient.invalid')`,
      [konto],
    );
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
          status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
          health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
       values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
               'guardianship', 'Vera Vertretung', array['identity_document', 'guardianship_certificate'],
               true, false, $5, now(), $5)`,
      [vertretung, organizationId, patients.erika, konto, users.office],
    );
    const beratung = await beratungVonErika();
    await asPostgres(
      `insert into public.nutrition_diary_reminders
         (organization_id, profile_id, access_id, meal, remind_at, chosen_by)
       values ($1, $2, $3, 'dinner', '18:00', $4)`,
      [organizationId, beratung.id, vertretung, konto],
    );
    await asPostgres(
      `insert into public.platform_notification_settings
         (access_id, organization_id, email_kinds, push_kinds, chosen_by)
       values ($1, $2, array['plan_assigned'], '{}', $3)`,
      [vertretung, organizationId, konto],
    );
    await asUserCommitted(
      users.plattformErika,
      'select public.set_platform_diary_reminders($1::uuid, $2::jsonb, $3, $4)',
      [ERIKA, JSON.stringify([{ meal: 'breakfast', time: '07:30' }]), true, false],
    );

    type Benachrichtigungen = {
      settings: { email_kinds: string[] } | null;
      diary_reminders: { meal: string }[];
    };
    const eigene = (await exportieren(users.plattformErika, ERIKA))
      .notifications as Benachrichtigungen;
    expect(eigene.diary_reminders.map((r) => r.meal)).toEqual(['breakfast']);
    // Ihre Wahl entstand mit der Erinnerung per Mail, nicht die der Vertretung.
    expect(eigene.settings?.email_kinds).toEqual(['nutrition_diary_reminder']);
    const ihre = (await exportieren(konto, vertretung)).notifications as Benachrichtigungen;
    expect(ihre.diary_reminders.map((r) => r.meal)).toEqual(['dinner']);
    expect(ihre.settings?.email_kinds).toEqual(['plan_assigned']);
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

/**
 * Der Export einer Begleitung (BEF-189, ADR-023 Punkt 13 Fassung 6): nur ihre
 * eigene Wahl zu Benachrichtigungen, nichts von der Person, für die sie
 * begleitet. Negativfälle nach Punkt 23.
 */
describe('Export der Begleitung (BEF-189)', () => {
  const EIGENE = 'select public.platform_export_notifications($1::uuid) as daten';

  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('gibt der Begleitung nur ihre eigene Wahl und protokolliert den Export', async () => {
    await asUserCommitted(
      users.plattformPaula,
      'select public.set_platform_notification_settings($1::uuid, $2::text[], $3::text[], $4::smallint, $5::smallint)',
      [PAULA, ['appointment_cancelled'], [], 20, 8],
    );
    const { rows } = await asUserCommitted<{ daten: Record<string, unknown> }>(
      users.plattformPaula,
      EIGENE,
      [PAULA],
    );
    const daten = rows[0]!.daten;
    expect(Object.keys(daten).sort()).toEqual([
      'exported_at',
      'exported_by',
      'format',
      'format_version',
      'notifications',
      'organization',
      'relationship',
    ]);
    expect(daten['exported_by']).toBe('companion');
    expect(daten['notifications']).toEqual({
      settings: expect.objectContaining({
        email_kinds: ['appointment_cancelled'],
        push_kinds: [],
        quiet_from: 20,
        quiet_until: 8,
      }) as unknown,
      devices: [],
      diary_reminders: [],
      deliveries: [],
    });
    // Nichts von Max: kein Name, keine Kennung der Akte, keine Termine.
    const text = JSON.stringify(daten);
    for (const verboten of ['Mustermann', patients.max, '"appointments"', '"person"']) {
      expect(text, verboten).not.toContain(verboten);
    }
    expect(await protokoll()).toEqual([
      {
        actor_user_id: users.plattformPaula,
        actor_kind: 'representative',
        subject_type: 'patient',
        subject_id: patients.max,
        context: {
          surface: 'platform',
          purpose: 'platform_export',
          platform_access_id: PAULA,
          access_kind: 'companion',
          part: 'notifications',
        },
      },
    ]);
  });

  it('nur die Begleitung, nur ihr eigener Zugang: Person, fremde Konten, Praxis abgewiesen', async () => {
    const fremd = await fremdeOrganisation();
    for (const [konto, zugang] of [
      // Die Person selbst und die rechtliche Vertretung haben den ganzen Export.
      [users.plattformErika, ERIKA],
      [users.plattformTina, TINA],
      // Fremder Zugang, Praxis, andere Organisation.
      [users.plattformTina, PAULA],
      [users.plattformErika, PAULA],
      [users.office, PAULA],
      [users.ownerTherapist, PAULA],
      [fremd.owner, PAULA],
    ] as const) {
      const fehler = await abgefangen(asUserCommitted(konto, EIGENE, [zugang]));
      expect(fehler?.message, `${konto} ${zugang}`).toContain('not allowed');
    }
    expect((await abgefangen(asAnon(EIGENE, [PAULA])))?.message).toMatch(/permission denied/i);
    expect(await protokoll()).toEqual([]);
  });

  it('gesperrt, entzogen, nach der Lesefrist: abgewiesen (ANN-261)', async () => {
    const faelle = [
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      `update public.platform_accesses set status = 'revoked', revoked_at = now(),
              revoked_reason = 'practice', revoked_by = created_by where id = $1`,
    ];
    for (const fall of faelle) {
      await resetDatabase();
      await asPostgres(fall, [PAULA]);
      const fehler = await abgefangen(asUserCommitted(users.plattformPaula, EIGENE, [PAULA]));
      expect(fehler?.message).toContain('not allowed');
    }
    await resetDatabase();
    await asPostgres(
      `update public.patients
          set care_started_on = least(care_started_on, current_date - 90),
              care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.max, users.ownerTherapist],
    );
    const fehler = await abgefangen(asUserCommitted(users.plattformPaula, EIGENE, [PAULA]));
    expect(fehler?.message).toContain('not allowed');
    expect(await protokoll()).toEqual([]);
  }, 360_000);

  it('liefert dieselbe Liste wie der ganze Export (eine Stelle, app.platform_notifications_json)', async () => {
    await asUserCommitted(
      users.plattformErika,
      'select public.set_platform_notification_settings($1::uuid, $2::text[], $3::text[], $4::smallint, $5::smallint)',
      [ERIKA, ['plan_assigned'], ['plan_assigned'], 21, 7],
    );
    const ganz = await exportieren(users.plattformErika, ERIKA);
    const { rows } = await asPostgres<{ liste: unknown }>(
      'select app.platform_notifications_json($1::uuid) as liste',
      [ERIKA],
    );
    expect(ganz['notifications']).toEqual(rows[0]!.liste);
    const { rows: rechte } = await asPostgres<{ anon: boolean; angemeldet: boolean }>(
      `select has_function_privilege('anon', 'app.platform_notifications_json(uuid)', 'EXECUTE') as anon,
              has_function_privilege('authenticated', 'app.platform_notifications_json(uuid)', 'EXECUTE') as angemeldet`,
    );
    expect(rechte).toEqual([{ anon: false, angemeldet: false }]);
  });
});
