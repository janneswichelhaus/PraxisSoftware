import { Client } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  resetDatabase,
  tagInTagen,
  testDatabaseUrl,
} from './helpers/db';
import { erwarteAbgewiesenenSchreibversuch } from './helpers/abgewiesen';

/**
 * Einsicht der Praxisinhaber:in in die Plattform einer Person (E-001, Befund
 * B11; DSN-001 D7; ADR-023 Punkt 24 letzter Satz).
 *
 * Nur owner, nur der eigene aktive Zugang der Person, nur lesend: Der Verteiler
 * `platform_preview` ruft eine feste Liste von Projektionen, liefert dasselbe
 * wie der Person, schreibt den Lesezugriff wie beim Öffnen der Akte und
 * schaltet die Transaktion auf nur lesend. Kein Schreibweg der Person lässt
 * sich darüber oder danach aufrufen.
 *
 * Die Buchstaben vor den Fällen folgen dem Auftrag: (a) dieselben Zeilen wie
 * die Person, (b) Rollen, (c) Zugänge, (d) Funktionen außerhalb der Liste,
 * (e) Schreibwege, (f) Protokoll, (g) gesperrte Sitzung, (h) die Person selbst.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;

const EINSICHT = 'select public.platform_preview($1::uuid, $2, $3::jsonb) as daten';
const OPERATION = 'platform_preview.read';

/** Die feste Liste - ein neuer Eintrag ist Teil des Reviews (ADR-023 Punkt 21). */
const LISTE = [
  'platform_context',
  'platform_onboarding',
  'platform_appointments',
  'platform_appointment_requests',
  'platform_questionnaire',
  'platform_invoices',
  'platform_invoice',
  'platform_files',
  'platform_consents',
  'platform_representatives',
  'platform_aftercare',
  'platform_training_offer',
  'platform_training_contract',
  'platform_training_packages',
  'platform_training_offers',
  'platform_exercise_plans',
  'platform_messages',
  'platform_checkins',
  'platform_habits',
] as const;

/** Projektionen mit Zeilen (`returns table`); die übrigen liefern `jsonb`. */
const MIT_ZEILEN = new Set([
  'platform_onboarding',
  'platform_appointments',
  'platform_appointment_requests',
  'platform_questionnaire',
  'platform_invoices',
  'platform_files',
  'platform_consents',
  'platform_representatives',
]);

/** Max' eigenes Plattformkonto mit eigenem Zugang; Paula begleitet ihn schon (Seed). */
const MAX_KONTO = '99999999-9999-4999-8999-0000000000e1';
const MAX_ZUGANG = 'cafecafe-cafe-4afe-8afe-0000000000e1';
/** Ein Konto und ein Zugang der fremden Praxis. */
const FREMD_KONTO = '99999999-9999-4999-8999-0000000000e2';
const FREMD_ZUGANG = 'cafecafe-cafe-4afe-8afe-0000000000e2';
const ARZTBRIEF = 'abababab-abab-4bab-8bab-0000000000e1';
const PLAN_ERIKA = 'aeaeaeae-aeae-4eae-8eae-000000000001';
/** Dienstag und Donnerstag - von Erika selbst gewählt (ANN-307). */
const TAGE_ERIKA = [2, 4];
const RUECKFRAGE_ERIKA = 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001';
const UNBEKANNT = '0b0b0b0b-0b0b-4b0b-8b0b-0b0b0b0b0b0b';
/** Eine ausgestellte Behandlungsrechnung Erikas: Die Einsicht zeigt sie wie Erika (Zweitreview E). */
const RECHNUNG_ERIKA = 'ffffffff-ffff-4fff-8fff-0000000000e1';

interface Vorbereitet {
  wunsch: string;
  gewohnheit: string;
  abo: string;
}

/** Eine Fehlerkennung (SQLSTATE) oder `null`, wenn die Anweisung gelang. */
async function fehler(versprechen: Promise<unknown>): Promise<string | null> {
  try {
    await versprechen;
    return null;
  } catch (grund) {
    return (grund as { code?: string }).code ?? 'unbekannt';
  }
}

/**
 * Synthetische Daten, damit möglichst jede Projektion etwas zu zeigen hat:
 * ein freigegebenes Dokument, ein fälliger Check-in, eine Gewohnheit, ein
 * Terminwunsch der Person, ein Nachsorge-Abo und Max' eigener Zugang neben
 * seiner Begleitung.
 */
async function vorbereiten(): Promise<Vorbereitet> {
  await resetDatabase();
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values
       ($1, 'authenticated', 'authenticated', 'max.plattform@patient.invalid')`,
    [MAX_KONTO],
  );
  await asPostgres(
    `insert into public.platform_accesses
       (id, organization_id, relationship_kind, relationship_id, patient_id,
        account_user_id, status, created_by, activated_at)
     values ($1, $2, 'treatment', $3, $3, $4, 'active', $5, now())`,
    [MAX_ZUGANG, organizationId, patients.max, MAX_KONTO, users.office],
  );
  await asPostgres(
    `insert into public.patient_files
       (id, organization_id, patient_id, document_type, display_name, mime_type, byte_size,
        checksum_sha256, status, confirmed_at, uploaded_by)
     values ($1, $2, $3, 'arztbrief', 'Arztbrief Orthopaedie.pdf', 'application/pdf', 12345,
             $4, 'ready', now(), $5)`,
    [ARZTBRIEF, organizationId, patients.erika, 'a'.repeat(64), users.therapist],
  );
  await asPostgres(
    `insert into storage.objects (bucket_id, name, metadata)
     select 'patientenakte', f.object_key, jsonb_build_object('size', 12345, 'mimetype', f.mime_type)
     from public.patient_files f where f.id = $1`,
    [ARZTBRIEF],
  );
  await asUserCommitted(users.therapist, 'select public.set_patient_file_release($1::uuid, true)', [
    ARZTBRIEF,
  ]);
  await asUserCommitted(
    users.therapist,
    'select public.set_checkin_schedule($1, $2::uuid, $3, $4::text[])',
    ['treatment', patients.erika, 7, ['pain_rest']],
  );
  await asPostgres(`update public.checkin_schedules set starts_on = app.training_today($1) - 30`, [
    organizationId,
  ]);
  const gewohnheit = await asUserCommitted<{ id: string }>(
    users.therapist,
    'select public.add_habit($1, $2::uuid, $3, $4, $5) as id',
    ['treatment', patients.erika, 'Kniebeugen am Stuhl', 'Nach dem Zähneputzen', 'im Bad'],
  );
  const wunsch = await asUserCommitted<{ id: string }>(
    users.plattformErika,
    'select public.request_platform_appointment($1::uuid, $2::date[], $3::text[], $4) as id',
    [platformAccesses.erikaBehandlung, [tagInTagen(3)], ['morning'], 'Gern vormittags'],
  );
  const abo = await asPostgres<{ id: string }>(
    `insert into public.aftercare_subscriptions (organization_id, patient_id, starts_on, created_by)
     values ($1, $2, current_date - 5, $3) returning id`,
    [organizationId, patients.erika, users.office],
  );
  // ANN-307: Erika wählt ihre Übungstage über ihren eigenen Weg - die sieht
  // nur sie, nicht die Praxis und nicht die Einsicht.
  await asUserCommitted(
    users.plattformErika,
    'select public.set_platform_exercise_days($1::uuid, $2::uuid, $3::integer[])',
    [platformAccesses.erikaBehandlung, PLAN_ERIKA, TAGE_ERIKA],
  );
  await asPostgres(
    `insert into public.invoices
       (id, organization_id, patient_id, training_relationship_id, service_area, status, period_month,
        invoice_number, issued_on, issued_at, issued_by, due_on, total_cents, tax_total_cents, currency,
        snapshot, created_by)
     values ($1, $2, $3, null, 'therapy', 'issued', '2026-09-01', 'RG-2026-0101',
             '2026-09-25', now(), $4, current_date + 10, 14000, 0, 'EUR', $5::jsonb, $4)`,
    [
      RECHNUNG_ERIKA,
      organizationId,
      patients.erika,
      users.office,
      JSON.stringify({
        schema_version: 5,
        period_month: '2026-09-01',
        service_period: { from: '2026-09-02', to: '2026-09-23' },
        currency: 'EUR',
        issuer: { legal_name: 'Test Praxis Tuebingen' },
        recipient: { kind: 'self', name: 'Erika Beispiel' },
        patient: { name: 'Erika Beispiel', date_of_birth: null },
        treatment_bases: [],
        items: [
          {
            performed_on: '2026-09-02',
            code: 'KG',
            label: 'Krankengymnastik',
            item_kind: 'treatment',
            quantity: 1,
            unit_price_cents: 14000,
            line_total_cents: 14000,
            currency: 'EUR',
            tax_treatment: 'exempt_healthcare',
            tax_rate_permille: 0,
          },
        ],
        tax_groups: [],
        totals: { total_cents: 14000, tax_total_cents: 0 },
      }),
    ],
  );
  await asPostgres(
    `insert into public.payments (organization_id, invoice_id, direction, amount_cents, paid_on, method, currency, created_by)
     values ($1, $2, 'incoming', 4000, current_date, 'bank_transfer', 'EUR', $3)`,
    [organizationId, RECHNUNG_ERIKA, users.office],
  );
  return { wunsch: wunsch.rows[0]!.id, gewohnheit: gewohnheit.rows[0]!.id, abo: abo.rows[0]!.id };
}

interface Plaene {
  plans: ({ id: string; weekdays: number[] } & Record<string, unknown>)[];
}

/**
 * ANN-307 (Jannes): Die Übungstage sieht nur die Person, die Praxis nicht -
 * die Einsicht bekommt sie leer. Die einzige Stelle, an der die Einsicht von
 * der Sicht der Person abweicht.
 */
function ohneUebungstage(funktion: string, daten: unknown): unknown {
  if (funktion !== 'platform_exercise_plans' || daten === null) return daten;
  const plaene = daten as Plaene;
  return { ...plaene, plans: plaene.plans.map((plan) => ({ ...plan, weekdays: [] })) };
}

/** Was die Person selbst bekommt - in derselben Form, wie der Verteiler es liefert. */
async function alsPerson(
  konto: string,
  zugang: string,
  funktion: string,
  argumente: Record<string, unknown> = {},
): Promise<unknown> {
  // Die Namen stammen aus LISTE, nicht aus einer Eingabe.
  const sql =
    funktion === 'platform_invoice'
      ? 'select public.platform_invoice($1::uuid, $2::uuid) as daten'
      : MIT_ZEILEN.has(funktion)
        ? `select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) as daten from public.${funktion}($1::uuid) t`
        : `select public.${funktion}($1::uuid) as daten`;
  const params = funktion === 'platform_invoice' ? [zugang, argumente.p_invoice_id] : [zugang];
  const { rows } = await asUser<{ daten: unknown }>(konto, sql, params);
  return rows[0]?.daten ?? null;
}

async function inDerEinsicht(
  konto: string,
  zugang: string,
  funktion: string | null,
  argumente: Record<string, unknown> = {},
): Promise<unknown> {
  const { rows } = await asUser<{ daten: unknown }>(konto, EINSICHT, [
    zugang,
    funktion,
    JSON.stringify(argumente),
  ]);
  return rows[0]?.daten ?? null;
}

/**
 * Eine Verbindung für mehrere Transaktionen nacheinander in derselben
 * Sitzung; angemeldet wird je Transaktion (`anmelden`).
 */
async function sitzung<T>(arbeit: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await arbeit(client);
  } finally {
    await client.end();
  }
}

async function anmelden(
  client: Client,
  konto: string,
  zusatz: Record<string, unknown> = {},
): Promise<void> {
  await client.query("select set_config('role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    jwtClaims(konto, zusatz),
  ]);
}

async function protokoll(aktion: string, akteur: string) {
  const { rows } = await asPostgres<{
    subject_type: string;
    subject_id: string;
    context: Record<string, unknown>;
  }>(
    `select subject_type, subject_id, context from public.audit_log
      where action = $1 and actor_user_id = $2 order by occurred_at, id`,
    [aktion, akteur],
  );
  return rows;
}

// -----------------------------------------------------------------------------
// Die Schreibwege der Person - jeder mit Werten, mit denen er für die Person
// gelänge (Gegenprobe). `null` heißt: ohne passende Zeile im Seed, geprüft
// wird dann nur, dass nichts gelingt.
// -----------------------------------------------------------------------------
interface Schreibweg {
  sql: string;
  params: (v: Vorbereitet, fassung: string) => unknown[];
  /** Gelingt der Aufruf für die Person selbst? Dann muss die Einsicht 25006 zeigen. */
  gelingtDerPerson: boolean;
  /** Der Zugang, über den geschrieben wird (Standard: Erikas Behandlung). */
  zugang?: string;
  konto?: string;
}

const E = platformAccesses.erikaBehandlung;

const SCHREIBWEGE: Record<string, Schreibweg> = {
  request_platform_appointment: {
    sql: 'select public.request_platform_appointment($1::uuid, $2::date[], $3::text[], $4)',
    params: () => [E, [tagInTagen(4)], ['midday'], null],
    gelingtDerPerson: true,
  },
  withdraw_platform_appointment_request: {
    sql: 'select public.withdraw_platform_appointment_request($1::uuid, $2::uuid)',
    params: (v) => [E, v.wunsch],
    gelingtDerPerson: true,
  },
  request_platform_appointment_change: {
    sql: `select public.request_platform_appointment_change($1::uuid, $2::uuid, 'cancel',
            '{}'::date[], '{}'::text[], null)`,
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  save_platform_questionnaire_response: {
    sql: `select public.save_platform_questionnaire_response($1::uuid, null, 'anamnese_v8',
            '1.0.0', '{}'::jsonb)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  complete_platform_questionnaire_response: {
    sql: 'select public.complete_platform_questionnaire_response($1::uuid, $2::uuid)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  discard_platform_questionnaire_response: {
    sql: 'select public.discard_platform_questionnaire_response($1::uuid, $2::uuid)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  record_platform_consent: {
    sql: "select public.record_platform_consent($1::uuid, 'email_contact', true, $2)",
    params: (_v, fassung) => [E, fassung],
    gelingtDerPerson: true,
  },
  end_platform_companion: {
    sql: 'select public.end_platform_companion($1::uuid, $2::uuid)',
    params: () => [MAX_ZUGANG, platformAccesses.paulaBegleitungMax],
    gelingtDerPerson: true,
    zugang: MAX_ZUGANG,
    konto: MAX_KONTO,
  },
  finish_platform_onboarding: {
    sql: 'select public.finish_platform_onboarding($1::uuid)',
    params: () => [E],
    gelingtDerPerson: true,
  },
  cancel_platform_aftercare: {
    sql: 'select public.cancel_platform_aftercare($1::uuid, $2::uuid)',
    params: (v) => [E, v.abo],
    gelingtDerPerson: true,
  },
  accept_platform_training_offer: {
    sql: `select public.accept_platform_training_offer($1::uuid, $2::uuid, '{}'::integer[],
            false, false, false, 'x')`,
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  withdraw_platform_training_contract: {
    sql: 'select public.withdraw_platform_training_contract($1::uuid, $2::uuid)',
    params: () => [platformAccesses.erikaTraining, UNBEKANNT],
    gelingtDerPerson: false,
    zugang: platformAccesses.erikaTraining,
  },
  start_platform_exercise_session: {
    sql: 'select public.start_platform_exercise_session($1::uuid, $2::uuid)',
    params: () => [E, PLAN_ERIKA],
    gelingtDerPerson: true,
  },
  mark_platform_exercise_set: {
    sql: 'select public.mark_platform_exercise_set($1::uuid, $2::uuid, $2::uuid, 1, true)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  finish_platform_exercise_session: {
    sql: "select public.finish_platform_exercise_session($1::uuid, $2::uuid, null, '{}'::jsonb)",
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  sync_platform_exercise_session: {
    sql: `select public.sync_platform_exercise_session($1::uuid, $2::uuid, $3::uuid,
            app_heute.tag, now(), '[]'::jsonb)
          from (select (now() at time zone 'Europe/Berlin')::date as tag) app_heute`,
    params: () => [E, PLAN_ERIKA, '5e5e5e5e-5e5e-4e5e-8e5e-0000000000e1'],
    gelingtDerPerson: true,
  },
  set_platform_exercise_days: {
    sql: "select public.set_platform_exercise_days($1::uuid, $2::uuid, '{1,3}'::integer[])",
    params: () => [E, PLAN_ERIKA],
    gelingtDerPerson: true,
  },
  start_platform_message: {
    sql: "select public.start_platform_message($1::uuid, 'other', 'Eine Frage', null, null)",
    params: () => [E],
    gelingtDerPerson: true,
  },
  add_platform_message_entry: {
    sql: "select public.add_platform_message_entry($1::uuid, $2::uuid, 'Noch etwas')",
    params: () => [E, RUECKFRAGE_ERIKA],
    gelingtDerPerson: true,
  },
  close_platform_message: {
    sql: 'select public.close_platform_message($1::uuid, $2::uuid)',
    params: () => [E, RUECKFRAGE_ERIKA],
    gelingtDerPerson: true,
  },
  prepare_message_attachment_upload: {
    sql: `select * from public.prepare_message_attachment_upload($1::uuid, $2::uuid, 'image/jpeg',
            1234, $3, null)`,
    params: () => [E, RUECKFRAGE_ERIKA, 'b'.repeat(64)],
    gelingtDerPerson: false,
  },
  confirm_message_attachment_upload: {
    sql: 'select public.confirm_message_attachment_upload($1::uuid, $2::uuid)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  discard_message_attachment_upload: {
    sql: 'select public.discard_message_attachment_upload($1::uuid, $2::uuid)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  delete_platform_message_attachment: {
    sql: 'select public.delete_platform_message_attachment($1::uuid, $2::uuid)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  issue_platform_message_attachment_link: {
    sql: 'select * from public.issue_platform_message_attachment_link($1::uuid, $2::uuid)',
    params: () => [E, UNBEKANNT],
    gelingtDerPerson: false,
  },
  issue_platform_file_link: {
    sql: 'select * from public.issue_platform_file_link($1::uuid, $2::uuid)',
    params: () => [E, ARZTBRIEF],
    gelingtDerPerson: true,
  },
  set_platform_notification_settings: {
    sql: `select public.set_platform_notification_settings($1::uuid, '{}'::text[], '{}'::text[],
            22::smallint, 7::smallint)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  register_platform_push_subscription: {
    // Synthetische Schlüssel in der verlangten Form; angesprochen wird nichts.
    sql: `select public.register_platform_push_subscription($1::uuid,
            'https://fcm.googleapis.com/fcm/send/einsicht-test', $2, $3)`,
    params: () => [E, 'p'.repeat(87), 'a'.repeat(22)],
    gelingtDerPerson: true,
  },
  submit_platform_checkin: {
    sql: `select public.submit_platform_checkin($1::uuid, '{"pain_rest": 3}'::jsonb)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  mark_platform_habit: {
    sql: `select public.mark_platform_habit($1::uuid, $2::uuid,
            (now() at time zone 'Europe/Berlin')::date, true)`,
    params: (v) => [E, v.gewohnheit],
    gelingtDerPerson: true,
  },
  pause_platform_habit: {
    sql: 'select public.pause_platform_habit($1::uuid, $2::uuid, true)',
    params: (v) => [E, v.gewohnheit],
    gelingtDerPerson: true,
  },
  platform_export: {
    sql: 'select public.platform_export($1::uuid)',
    params: () => [E],
    gelingtDerPerson: true,
  },
  // ERN-002: die Ernährung an Erikas Akte (Seed: laufend, mit Einwilligung).
  record_platform_nutrition_weight: {
    sql: `select public.record_platform_nutrition_weight($1::uuid,
            (now() at time zone 'Europe/Berlin')::date, 72.4)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  set_platform_nutrition_target_weight: {
    sql: 'select public.set_platform_nutrition_target_weight($1::uuid, 66)',
    params: () => [E],
    gelingtDerPerson: true,
  },
  set_platform_nutrition_diary: {
    sql: 'select public.set_platform_nutrition_diary($1::uuid, true)',
    params: () => [E],
    gelingtDerPerson: true,
  },
  record_platform_nutrition_consent: {
    sql: 'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
    params: (_v, f) => [E, f],
    gelingtDerPerson: true,
  },
  // ERN-005: eigene Lebensmittel (Seed: Erikas „Omas Dinkelbrot“).
  save_platform_food: {
    sql: `select public.save_platform_food($1::uuid, null, '{"name": "Probe", "energy_kcal": 1,
            "protein_g": 1, "fat_g": 1, "carbohydrate_g": 1}'::jsonb)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  delete_platform_food: {
    sql: `select public.delete_platform_food($1::uuid, 'f1f1f1f1-f1f1-4f1f-8f1f-000000000002')`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  // ERN-007: das Tagebuch (Seed: eingeschaltet, Erikas Frühstück heute).
  add_platform_diary_entry: {
    sql: `select public.add_platform_diary_entry($1::uuid,
            (now() at time zone 'Europe/Berlin')::date, 'snack', 'person',
            'f1f1f1f1-f1f1-4f1f-8f1f-000000000002', 45)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  update_platform_diary_entry: {
    sql: `select public.update_platform_diary_entry($1::uuid,
            'f2f2f2f2-f2f2-4f2f-8f2f-000000000001', 'snack', null, 2)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  delete_platform_diary_entry: {
    sql: `select public.delete_platform_diary_entry($1::uuid, 'f2f2f2f2-f2f2-4f2f-8f2f-000000000001')`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  // ERN-008: Favorit, kopieren (Seed: gestern drei Mahlzeiten), Zahlen ausblenden.
  set_platform_diary_favorite: {
    sql: `select public.set_platform_diary_favorite($1::uuid, 'person',
            'f1f1f1f1-f1f1-4f1f-8f1f-000000000002', true)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  copy_platform_diary: {
    sql: `select public.copy_platform_diary($1::uuid,
            (now() at time zone 'Europe/Berlin')::date - 1, null,
            (now() at time zone 'Europe/Berlin')::date, null)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
  set_platform_diary_hide_numbers: {
    sql: 'select public.set_platform_diary_hide_numbers($1::uuid, true)',
    params: () => [E],
    gelingtDerPerson: true,
  },
  add_platform_water: {
    sql: `select public.add_platform_water($1::uuid,
            (now() at time zone 'Europe/Berlin')::date, 250)`,
    params: () => [E],
    gelingtDerPerson: true,
  },
};

/**
 * Funktionen mit `p_access_id`, die keine Schreibwege der Person sind: die
 * Liste der Einsicht, die Praxisseite (eigene Rollenprüfung) und eine
 * Projektion außerhalb der Liste.
 */
const KEIN_SCHREIBWEG_DER_PERSON: Readonly<Record<string, string>> = {
  platform_preview: 'der Verteiler selbst',
  platform_notification_settings: 'lesend, aber nicht in der Einsicht (Gerät der Person)',
  get_platform_onboarding: 'Praxisseite, eigene Rollenprüfung',
  skip_platform_onboarding: 'Praxisseite, eigene Rollenprüfung',
  set_platform_access_locked: 'Praxisseite, eigene Rollenprüfung',
  revoke_platform_access: 'Praxisseite, eigene Rollenprüfung',
  renew_platform_representation_code: 'Praxisseite, eigene Rollenprüfung',
  record_companion_consent_withdrawn: 'Praxisseite, eigene Rollenprüfung',
  platform_nutrition:
    'lesend, aber nicht in der Einsicht: die Ernährung liest in der Praxis nur die Beratung (ERN-002, ADR-027 Punkt 4)',
  search_platform_foods:
    'lesend, Bezugsdaten ohne Personenbezug; nicht in der Einsicht wie platform_nutrition (ERN-004)',
  platform_nutrition_diary:
    'lesend, aber nicht in der Einsicht: das Tagebuch liest in der Praxis nur die Beratung (ERN-007, ADR-027 Punkt 4)',
};

describe('Einsicht der Praxisinhaber:in (E-001)', () => {
  let v: Vorbereitet;
  let fassung: string;

  beforeAll(async () => {
    v = await vorbereiten();
    fassung = (
      await asPostgres<{ f: string }>('select app.platform_consent_wording_version() as f')
    ).rows[0]!.f;
  }, 120_000);

  it('führt genau die feste Liste lesender Projektionen', async () => {
    const { rows } = await asPostgres<{ liste: string[] }>(
      'select app.platform_preview_functions() as liste',
    );
    expect(rows[0]!.liste).toEqual([...LISTE]);
  });

  describe('(a) dieselben Zeilen wie die Person', () => {
    for (const [name, konto, zugang] of [
      ['Erikas Behandlung', users.plattformErika, platformAccesses.erikaBehandlung],
      ['Erikas Training', users.plattformErika, platformAccesses.erikaTraining],
      ['Max mit Begleitung', MAX_KONTO, MAX_ZUGANG],
    ] as const) {
      it(`liefert für jede Projektion der Liste dasselbe wie der Person (${name})`, async () => {
        for (const funktion of LISTE.filter((f) => f !== 'platform_context')) {
          // Eine echte Rechnung und eine unbekannte Kennung (Zweitreview E).
          for (const rechnung of funktion === 'platform_invoice'
            ? [RECHNUNG_ERIKA, UNBEKANNT]
            : [null]) {
            const argumente = rechnung ? { p_invoice_id: rechnung } : {};
            const person = await alsPerson(konto, zugang, funktion, argumente);
            const einsicht = await inDerEinsicht(users.ownerTherapist, zugang, funktion, argumente);
            expect(einsicht, `${funktion} ${rechnung ?? ''}`).toEqual(
              ohneUebungstage(funktion, person),
            );
          }
        }
      });
    }

    it('zeigt Erikas ausgestellte Rechnung in der Einsicht wie bei ihr', async () => {
      const argumente = { p_invoice_id: RECHNUNG_ERIKA };
      const blatt = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_invoice',
        argumente,
      )) as { invoice_number?: string } | null;
      expect(blatt).not.toBeNull();
      expect(JSON.stringify(blatt)).toContain('RG-2026-0101');
      // Am Zugang einer anderen Person ist sie nicht da.
      expect(
        await inDerEinsicht(users.ownerTherapist, MAX_ZUGANG, 'platform_invoice', argumente),
      ).toBeNull();
    });

    it('zeigt, was die Person sieht: Nachrichten als „Sie“, Fähigkeiten wie bei ihr', async () => {
      const nachrichten = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_messages',
      )) as { can_write: boolean; messages: { entries: { author: string }[] }[] };
      // Die Einsicht hat dieselben Rechte wie die Person - geschrieben wird
      // trotzdem nichts (e). Die Oberfläche blendet die Knöpfe aus.
      expect(nachrichten.can_write).toBe(true);
      expect(nachrichten.messages.flatMap((m) => m.entries.map((e) => e.author))).toContain('you');

      const checkins = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_checkins',
      )) as { due: boolean; can_answer: boolean };
      expect(checkins).toMatchObject({ due: true, can_answer: true });

      const plaene = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_exercise_plans',
      )) as { plans: { id: string; can_choose_days: boolean }[] };
      expect(plaene.plans.map((p) => [p.id, p.can_choose_days])).toEqual([[PLAN_ERIKA, true]]);

      const dokumente = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_files',
      )) as { id: string }[];
      expect(dokumente.map((d) => d.id)).toEqual([ARZTBRIEF]);

      const vertretungen = (await inDerEinsicht(
        users.ownerTherapist,
        MAX_ZUGANG,
        'platform_representatives',
      )) as {
        access_id: string;
        can_end: boolean;
      }[];
      expect(vertretungen).toEqual([
        expect.objectContaining({
          access_id: platformAccesses.paulaBegleitungMax,
          can_end: true,
        }),
      ]);
    });

    it('liefert die Übungstage leer - die sieht nur die Person (ANN-307)', async () => {
      const person = (await alsPerson(
        users.plattformErika,
        platformAccesses.erikaBehandlung,
        'platform_exercise_plans',
      )) as Plaene;
      const einsicht = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_exercise_plans',
      )) as Plaene;
      // Bestätigt: Die Person sieht die Tage, die sie selbst gewählt hat.
      expect(person.plans.find((p) => p.id === PLAN_ERIKA)?.weekdays).toEqual(TAGE_ERIKA);
      // Die Einsicht bekommt für denselben Plan keine - und sonst alles gleich.
      expect(einsicht.plans.find((p) => p.id === PLAN_ERIKA)?.weekdays).toEqual([]);
      expect(einsicht).toEqual(ohneUebungstage('platform_exercise_plans', person));
      expect(JSON.stringify(einsicht)).not.toContain(JSON.stringify(TAGE_ERIKA));
      // Auch an der Tabelle vorbei liest owner die Tage nicht.
      expect(
        await fehler(
          asUser(users.ownerTherapist, 'select weekdays from public.exercise_plan_days'),
        ),
      ).toBe('42501');
    });

    it('liefert den Kontext in der Form von platform_context(), dazu Name und Verhältnis', async () => {
      const { rows } = await asUser<{ zeile: Record<string, unknown> }>(
        users.plattformErika,
        'select to_jsonb(t) as zeile from public.platform_context() t where t.access_id = $1',
        [platformAccesses.erikaBehandlung],
      );
      const einsicht = (await inDerEinsicht(
        users.ownerTherapist,
        platformAccesses.erikaBehandlung,
        'platform_context',
      )) as Record<string, unknown>[];
      expect(einsicht).toHaveLength(1);
      const { relationship_id: verhaeltnis, person_name: name, ...form } = einsicht[0]!;
      expect(form).toEqual(rows[0]!.zeile);
      expect(verhaeltnis).toBe(patients.erika);
      expect(name).toBe('Erika Beispiel');
    });

    it('zeigt nach der Lesefrist, was der Person bleibt: nur die Einwilligungen (D2)', async () => {
      await asPostgres(
        'update public.training_relationships set contract_ended_on = current_date - 40 where id = $1',
        [trainingRelationships.erika],
      );
      try {
        const zugang = platformAccesses.erikaTraining;
        for (const funktion of [
          'platform_appointments',
          'platform_consents',
          'platform_messages',
        ]) {
          const person = await alsPerson(users.plattformErika, zugang, funktion);
          expect(await inDerEinsicht(users.ownerTherapist, zugang, funktion), funktion).toEqual(
            person,
          );
        }
        expect(await inDerEinsicht(users.ownerTherapist, zugang, 'platform_appointments')).toEqual(
          [],
        );
        const einwilligungen = (await inDerEinsicht(
          users.ownerTherapist,
          zugang,
          'platform_consents',
        )) as { can_grant: boolean }[];
        expect(einwilligungen.length).toBeGreaterThan(0);
        expect(einwilligungen.every((e) => !e.can_grant)).toBe(true);
      } finally {
        await asPostgres(
          'update public.training_relationships set contract_ended_on = null where id = $1',
          [trainingRelationships.erika],
        );
      }
    });
  });

  describe('(b) nur owner', () => {
    it.each([
      ['therapist', users.therapist],
      ['team_lead', users.teamLead],
      ['office', users.office],
      ['trainer', users.trainer],
    ] as const)('weist %s ab, mit access.denied und HTTP 403', async (_rolle, konto) => {
      await erwarteAbgewiesenenSchreibversuch(
        konto,
        EINSICHT,
        [platformAccesses.erikaBehandlung, 'platform_appointments', '{}'],
        OPERATION,
      );
    });

    it('weist ein Plattformkonto ab, ohne Organisation ohne Eintrag (42501)', async () => {
      for (const konto of [users.plattformErika, users.plattformTina, users.plattformPaula]) {
        expect(
          await fehler(
            asUser(konto, EINSICHT, [platformAccesses.erikaBehandlung, 'platform_messages', '{}']),
          ),
        ).toBe('42501');
        expect(await protokoll('access.denied', konto)).toEqual([]);
      }
    });

    it('ist für anon nicht aufrufbar', async () => {
      const client = new Client({ connectionString: testDatabaseUrl() });
      await client.connect();
      try {
        await client.query('begin');
        await client.query("select set_config('role', 'anon', true)");
        expect(
          await fehler(
            client.query(EINSICHT, [platformAccesses.erikaBehandlung, 'platform_messages', '{}']),
          ),
        ).toBe('42501');
        await client.query('rollback');
      } finally {
        await client.end();
      }
    });
  });

  describe('(c) nur der eigene, aktive Zugang der Person', () => {
    beforeEach(async () => {
      await fremdeOrganisation();
      await asPostgres(
        `insert into auth.users (id, aud, role, email) values
           ($1, 'authenticated', 'authenticated', 'peter.fremd@patient.invalid')
         on conflict (id) do nothing`,
        [FREMD_KONTO],
      );
      await asPostgres(
        `insert into public.platform_accesses
           (id, organization_id, relationship_kind, relationship_id, patient_id,
            account_user_id, status, created_by, activated_at)
         values ($1, $2, 'treatment', $3, $3, $4, 'active', $5, now())
         on conflict (id) do nothing`,
        [
          FREMD_ZUGANG,
          FREMDE_ORGANISATION.organizationId,
          FREMDE_ORGANISATION.patient,
          FREMD_KONTO,
          FREMDE_ORGANISATION.owner,
        ],
      );
    });

    it('weist den Zugang einer anderen Organisation ab - in beide Richtungen', async () => {
      await erwarteAbgewiesenenSchreibversuch(
        users.ownerTherapist,
        EINSICHT,
        [FREMD_ZUGANG, 'platform_messages', '{}'],
        OPERATION,
      );
      await erwarteAbgewiesenenSchreibversuch(
        FREMDE_ORGANISATION.owner,
        EINSICHT,
        [platformAccesses.erikaBehandlung, 'platform_messages', '{}'],
        OPERATION,
      );
    });

    it.each([
      ['eingeladen', `status = 'invited', account_user_id = null, activated_at = null`],
      ['gesperrt', `status = 'locked', locked_at = now()`],
      ['entzogen', `status = 'revoked', revoked_at = now(), revoked_reason = 'practice'`],
    ] as const)('weist einen Zugang ab, der %s ist', async (_zustand, aenderung) => {
      const vorher = await asPostgres<Record<string, unknown>>(
        'select status, account_user_id, activated_at, locked_at, revoked_at, revoked_reason from public.platform_accesses where id = $1',
        [platformAccesses.erikaTraining],
      );
      await asPostgres(`update public.platform_accesses set ${aenderung} where id = $1`, [
        platformAccesses.erikaTraining,
      ]);
      try {
        await erwarteAbgewiesenenSchreibversuch(
          users.ownerTherapist,
          EINSICHT,
          [platformAccesses.erikaTraining, 'platform_appointments', '{}'],
          OPERATION,
        );
      } finally {
        const z = vorher.rows[0]!;
        await asPostgres(
          `update public.platform_accesses
              set status = $2, account_user_id = $3, activated_at = $4, locked_at = $5,
                  revoked_at = $6, revoked_reason = $7
            where id = $1`,
          [
            platformAccesses.erikaTraining,
            z.status,
            z.account_user_id,
            z.activated_at,
            z.locked_at,
            z.revoked_at,
            z.revoked_reason,
          ],
        );
      }
    });

    it('weist einen Vertretungszugang und eine unbekannte Kennung ab', async () => {
      for (const zugang of [platformAccesses.paulaBegleitungMax, UNBEKANNT]) {
        await erwarteAbgewiesenenSchreibversuch(
          users.ownerTherapist,
          EINSICHT,
          [zugang, 'platform_messages', '{}'],
          OPERATION,
        );
      }
    });
  });

  describe('(d) nur die feste Liste', () => {
    it.each([
      'request_platform_appointment',
      'platform_export',
      'issue_platform_file_link',
      'issue_platform_message_attachment_link',
      'platform_notification_settings',
      'finish_platform_onboarding',
      'platform_preview',
      'list_patient_files',
      'platform_context; select 1',
      '',
    ])('weist „%s“ ab, ohne die Akte zu protokollieren', async (funktion) => {
      const vorher = await protokoll('patient_record.viewed', users.ownerTherapist);
      await erwarteAbgewiesenenSchreibversuch(
        users.ownerTherapist,
        EINSICHT,
        [platformAccesses.erikaBehandlung, funktion, '{}'],
        OPERATION,
      );
      expect(await protokoll('patient_record.viewed', users.ownerTherapist)).toEqual(vorher);
    });

    it('weist auch ohne Funktionsnamen ab', async () => {
      await erwarteAbgewiesenenSchreibversuch(
        users.ownerTherapist,
        EINSICHT,
        [platformAccesses.erikaBehandlung, null, '{}'],
        OPERATION,
      );
    });

    it('nimmt nur ein Objekt als Argumente und nur typisierte Werte', async () => {
      expect(
        await fehler(
          asUser(users.ownerTherapist, EINSICHT, [
            platformAccesses.erikaBehandlung,
            'platform_invoice',
            '[]',
          ]),
        ),
      ).toBe('22023');
      expect(
        await fehler(
          asUser(users.ownerTherapist, EINSICHT, [
            platformAccesses.erikaBehandlung,
            'platform_invoice',
            JSON.stringify({ p_invoice_id: "x'; drop table public.invoices; --" }),
          ]),
        ),
      ).toBe('22P02');
    });
  });

  describe('(e) nichts geschieht im Namen der Person', () => {
    it('kennt jeden Schreibweg der Person (eine neue Funktion fällt hier auf)', async () => {
      const { rows } = await asPostgres<{ name: string }>(
        `select distinct p.proname as name
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and pg_get_function_identity_arguments(p.oid) like 'p_access_id uuid%'
          order by 1`,
      );
      const unbekannt = rows
        .map((r) => r.name)
        .filter(
          (name) =>
            !(name in SCHREIBWEGE) &&
            !(name in KEIN_SCHREIBWEG_DER_PERSON) &&
            !(LISTE as readonly string[]).includes(name),
        );
      expect(unbekannt).toEqual([]);
    });

    it('Gegenprobe: dieselben Aufrufe gelingen der Person selbst', async () => {
      for (const [name, weg] of Object.entries(SCHREIBWEGE)) {
        if (!weg.gelingtDerPerson) continue;
        expect(
          await fehler(asUser(weg.konto ?? users.plattformErika, weg.sql, weg.params(v, fassung))),
          name,
        ).toBeNull();
      }
    });

    it('sperrt jeden Schreibweg, solange die Einsicht gilt (Wächter mit gesetzter Einstellung)', async () => {
      await sitzung(async (client) => {
        for (const [name, weg] of Object.entries(SCHREIBWEGE)) {
          await client.query('begin');
          await anmelden(client, users.ownerTherapist);
          await client.query("select set_config('app.platform_preview_access', $1, true)", [
            weg.zugang ?? E,
          ]);
          const code = await fehler(client.query(weg.sql, weg.params(v, fassung)));
          await client.query('rollback');
          if (weg.gelingtDerPerson) {
            // Die Transaktion ist nur lesend: Der Weg kam bis zum Schreiben.
            expect(code, name).toBe('25006');
          } else {
            expect(code, name).not.toBeNull();
          }
        }
      });
    });

    it('lässt nach einer Einsicht keinen Schreibweg zu - in derselben Transaktion und danach', async () => {
      await sitzung(async (client) => {
        await client.query('begin');
        await anmelden(client, users.ownerTherapist);
        await client.query(EINSICHT, [E, 'platform_messages', '{}']);
        const stand = await client.query<{ zugang: string; lesend: string }>(
          `select coalesce(current_setting('app.platform_preview_access', true), '') as zugang,
                  current_setting('transaction_read_only') as lesend`,
        );
        // Die Einstellung ist zurückgesetzt, die Transaktion bleibt nur lesend.
        expect(stand.rows[0]).toEqual({ zugang: '', lesend: 'on' });
        expect(
          await fehler(client.query(SCHREIBWEGE.start_platform_message!.sql, [E])),
        ).not.toBeNull();
        await client.query('rollback');

        // Eine neue Transaktion in derselben Sitzung: keine Einstellung, kein
        // Zugang - owner ist wieder ein Praxiskonto ohne Plattformzugang.
        for (const [name, weg] of Object.entries(SCHREIBWEGE)) {
          await client.query('begin');
          await anmelden(client, users.ownerTherapist);
          const leer = await client.query<{ zugang: string | null }>(
            "select current_setting('app.platform_preview_access', true) as zugang",
          );
          expect(leer.rows[0]!.zugang ?? '', name).toBe('');
          let ergebnis: unknown[] = [];
          const code = await fehler(
            client.query(weg.sql, weg.params(v, fassung)).then((r) => {
              ergebnis = r.rows.flatMap((zeile: Record<string, unknown>) => Object.values(zeile));
            }),
          );
          await client.query('rollback');
          if (code === null) {
            // Ohne Ausnahme bleibt nur „nichts": false, null oder keine Zeile.
            expect(
              ergebnis.every((wert) => wert === null || wert === false),
              name,
            ).toBe(true);
          } else {
            expect(code, name).not.toBe('25006');
          }
        }
      });
      // Nichts ist geschrieben worden: Der Wunsch ist offen, das Abo läuft,
      // die Rückfrage ist offen, der Einstieg steht aus.
      const { rows } = await asPostgres<Record<string, unknown>>(
        `select (select status from public.platform_appointment_requests where id = $1) as wunsch,
                (select ends_on from public.aftercare_subscriptions where id = $2) as abo,
                (select status from public.platform_messages where id = $3) as rueckfrage,
                (select onboarding_finished_at from public.platform_accesses where id = $4) as einstieg,
                (select status from public.platform_accesses where id = $5) as begleitung`,
        [v.wunsch, v.abo, RUECKFRAGE_ERIKA, E, platformAccesses.paulaBegleitungMax],
      );
      expect(rows[0]).toEqual({
        wunsch: 'open',
        abo: null,
        rueckfrage: 'open',
        einstieg: null,
        begleitung: 'active',
      });
    });

    it('gibt den Zugang nur für owner frei und nur für den eigenen Zugang', async () => {
      const lesbar = `select count(*)::int as n from app.platform_readable_access($1::uuid)`;
      const pruefen = async (konto: string, zugang: string, abgefragt: string = zugang) =>
        sitzung(async (client) => {
          await client.query('begin');
          await client.query("select set_config('request.jwt.claims', $1, true)", [
            jwtClaims(konto),
          ]);
          await client.query("select set_config('app.platform_preview_access', $1, true)", [
            zugang,
          ]);
          const { rows } = await client.query<{ n: number }>(lesbar, [abgefragt]);
          const lesend = await client.query<{ v: string }>(
            "select current_setting('transaction_read_only') as v",
          );
          await client.query('rollback');
          return { lesbar: rows[0]!.n === 1, lesend: lesend.rows[0]!.v };
        });
      expect(await pruefen(users.ownerTherapist, E)).toEqual({ lesbar: true, lesend: 'on' });
      // Vertretung, fremde Organisation, andere Rolle: nichts frei, nichts gesperrt.
      expect(await pruefen(users.ownerTherapist, platformAccesses.paulaBegleitungMax)).toEqual({
        lesbar: false,
        lesend: 'off',
      });
      expect(await pruefen(users.office, E)).toEqual({ lesbar: false, lesend: 'off' });
      expect(await pruefen(users.therapist, E)).toEqual({ lesbar: false, lesend: 'off' });
      expect(await pruefen(FREMDE_ORGANISATION.owner, E)).toEqual({ lesbar: false, lesend: 'off' });
      // Frei ist genau der gesetzte Zugang: nicht Erikas Training (anderer
      // Leistungsbereich), nicht der Zugang einer anderen Person (Zweitreview E).
      for (const anderer of [platformAccesses.erikaTraining, MAX_ZUGANG]) {
        expect(await pruefen(users.ownerTherapist, E, anderer)).toEqual({
          lesbar: false,
          lesend: 'off',
        });
      }
    });

    it('gibt auch den Weg nach der Lesefrist nur owner und nur am eigenen Zugang frei', async () => {
      // app.platform_own_access_after_reading: Widerrufen nach der Lesefrist
      // (D2, ANN-261) - mit derselben Freigabe wie der Wächter.
      const nachDerLesefrist = 'select app.platform_own_access_after_reading($1::uuid) as frei';
      const pruefen = async (konto: string, zugang: string, abgefragt: string = zugang) =>
        sitzung(async (client) => {
          await client.query('begin');
          await client.query("select set_config('request.jwt.claims', $1, true)", [
            jwtClaims(konto),
          ]);
          await client.query("select set_config('app.platform_preview_access', $1, true)", [
            zugang,
          ]);
          const { rows } = await client.query<{ frei: boolean }>(nachDerLesefrist, [abgefragt]);
          const lesend = await client.query<{ v: string }>(
            "select current_setting('transaction_read_only') as v",
          );
          await client.query('rollback');
          return { frei: rows[0]!.frei, lesend: lesend.rows[0]!.v };
        });
      expect(await pruefen(users.ownerTherapist, E)).toEqual({ frei: true, lesend: 'on' });
      // Vertretung, fremde Organisation, andere Rolle: nichts frei, nichts gesperrt.
      expect(await pruefen(users.ownerTherapist, platformAccesses.paulaBegleitungMax)).toEqual({
        frei: false,
        lesend: 'off',
      });
      expect(await pruefen(users.office, E)).toEqual({ frei: false, lesend: 'off' });
      expect(await pruefen(FREMDE_ORGANISATION.owner, E)).toEqual({ frei: false, lesend: 'off' });
      for (const anderer of [platformAccesses.erikaTraining, MAX_ZUGANG]) {
        expect(await pruefen(users.ownerTherapist, E, anderer)).toEqual({
          frei: false,
          lesend: 'off',
        });
      }
    });
  });

  describe('(f) protokolliert wie das Öffnen der Akte', () => {
    beforeEach(async () => {
      await asPostgres(
        `delete from public.audit_log
          where action in ('patient_record.viewed', 'training_relationship.viewed')`,
      );
    });

    it('schreibt patient_record.viewed höchstens einmal je Tag', async () => {
      for (const funktion of ['platform_context', 'platform_messages', 'platform_appointments']) {
        await asUserCommitted(users.ownerTherapist, EINSICHT, [E, funktion, '{}']);
      }
      expect(await protokoll('patient_record.viewed', users.ownerTherapist)).toEqual([
        {
          subject_type: 'patient',
          subject_id: patients.erika,
          context: { surface: 'web', view: 'platform_preview' },
        },
      ]);
      expect(await protokoll('training_relationship.viewed', users.ownerTherapist)).toEqual([]);
    });

    it('schreibt training_relationship.viewed für einen Zugang zum Training', async () => {
      await asUserCommitted(users.ownerTherapist, EINSICHT, [
        platformAccesses.erikaTraining,
        'platform_habits',
        '{}',
      ]);
      await asUserCommitted(users.ownerTherapist, EINSICHT, [
        platformAccesses.erikaTraining,
        'platform_training_packages',
        '{}',
      ]);
      expect(await protokoll('training_relationship.viewed', users.ownerTherapist)).toEqual([
        {
          subject_type: 'training_relationship',
          subject_id: trainingRelationships.erika,
          context: { surface: 'web', view: 'platform_preview' },
        },
      ]);
    });

    it('kennt keine neue Aktion und protokolliert nicht im Namen der Person', async () => {
      await asPostgres('delete from public.audit_log');
      await asUserCommitted(users.ownerTherapist, EINSICHT, [
        MAX_ZUGANG,
        'platform_messages',
        '{}',
      ]);
      await asUserCommitted(users.ownerTherapist, EINSICHT, [
        MAX_ZUGANG,
        'platform_representatives',
        '{}',
      ]);
      const { rows } = await asPostgres<{ action: string; actor_user_id: string }>(
        'select action, actor_user_id from public.audit_log order by occurred_at, id',
      );
      expect(rows).toEqual([
        { action: 'patient_record.viewed', actor_user_id: users.ownerTherapist },
      ]);
    });
  });

  describe('(g) gesperrte Sitzung', () => {
    it('weist ab, ohne Eintrag (ADR-025 Punkt 6)', async () => {
      const vorher = await protokoll('access.denied', users.ownerTherapist);
      const alt = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
      const code = await sitzung(async (client) => {
        await client.query('begin');
        await anmelden(client, users.ownerTherapist, {
          amr: [{ method: 'password', timestamp: alt }],
        });
        const ergebnis = await fehler(client.query(EINSICHT, [E, 'platform_messages', '{}']));
        await client.query('rollback');
        return ergebnis;
      });
      expect(code).toBe('42501');
      expect(await protokoll('access.denied', users.ownerTherapist)).toEqual(vorher);
    });

    it('gibt den Zugang im Wächter bei gesperrter Sitzung nicht frei', async () => {
      const alt = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
      const ergebnis = await sitzung(async (client) => {
        await client.query('begin');
        await client.query("select set_config('request.jwt.claims', $1, true)", [
          jwtClaims(users.ownerTherapist, { amr: [{ method: 'password', timestamp: alt }] }),
        ]);
        await client.query("select set_config('app.platform_preview_access', $1, true)", [E]);
        const { rows } = await client.query<{ n: number }>(
          'select count(*)::int as n from app.platform_readable_access($1::uuid)',
          [E],
        );
        await client.query('rollback');
        return rows[0]!.n;
      });
      expect(ergebnis).toBe(0);
    });
  });

  describe('(h) die Person selbst', () => {
    it('sieht weiter nur ihre eigenen Zugänge', async () => {
      const { rows } = await asUser<{ access_id: string }>(
        users.plattformErika,
        'select access_id from public.platform_context() order by access_id',
      );
      expect(rows.map((r) => r.access_id)).toEqual(
        [platformAccesses.erikaBehandlung, platformAccesses.erikaTraining].sort(),
      );
    });

    it('bekommt über die Einstellung keinen fremden Zugang frei', async () => {
      // Selbst wenn ein Plattformkonto die Einstellung setzen könnte: Der
      // Wächter verlangt owner der Organisation.
      const ergebnis = await sitzung(async (client) => {
        await client.query('begin');
        await anmelden(client, users.plattformErika);
        await client.query("select set_config('app.platform_preview_access', $1, true)", [
          platformAccesses.tinaTraining,
        ]);
        const { rows } = await client.query(
          'select * from public.platform_appointments($1::uuid)',
          [platformAccesses.tinaTraining],
        );
        const lesend = await client.query<{ v: string }>(
          "select current_setting('transaction_read_only') as v",
        );
        await client.query('rollback');
        return { zeilen: rows.length, lesend: lesend.rows[0]!.v };
      });
      expect(ergebnis).toEqual({ zeilen: 0, lesend: 'off' });
    });

    it('liest und schreibt wie bisher', async () => {
      expect(
        await alsPerson(users.plattformErika, platformAccesses.erikaBehandlung, 'platform_files'),
      ).toEqual([expect.objectContaining({ id: ARZTBRIEF })]);
      expect(
        await fehler(asUser(users.plattformErika, SCHREIBWEGE.start_platform_message!.sql, [E])),
      ).toBeNull();
    });
  });
});
