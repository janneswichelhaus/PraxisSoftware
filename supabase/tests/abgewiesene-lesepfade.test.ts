import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asUser, resetDatabase } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * G6b Teil 1: die übrigen Lesepfade mit protokollierter Abweisung (ADR-010).
 *
 * Jeder Pfad wird einmal mit einer Rolle aufgerufen, die er abweist und für
 * die die Oberfläche ihn nie aufruft. Erwartet sind null Zeilen, keine
 * Ausnahme und genau ein `denied`-Eintrag, der die Transaktion überlebt. Die
 * Kennungen im Aufruf sind beliebig: Die Rollenprüfung kommt vor jedem Zugriff
 * auf Daten.
 *
 * Skalare Pfade liefern bei Abweisung `null`; der Filter macht daraus die
 * leere Zeilenmenge, die der Helfer prüft.
 */

const { users, patients } = SEED;
const IRGENDEINE = '66666666-6666-4666-8666-0000000000ff';

type Fall = [pfad: string, konto: string, sql: string, params: unknown[], aktion: string];

const FAELLE: Fall[] = [
  // Termine: alle vier Praxisrollen dürfen, das Patientenkonto nicht.
  [
    'list_appointments',
    users.patientMax,
    `select * from public.list_appointments($1::date, $2::date, null, null, 'all')`,
    ['2027-01-04', '2027-01-04'],
    'appointments.read',
  ],
  [
    'list_day_plan',
    users.patientMax,
    'select * from public.list_day_plan($1::date, $2::uuid)',
    ['2027-01-04', IRGENDEINE],
    'appointments.read',
  ],
  [
    'list_event_participants',
    users.patientMax,
    'select * from public.list_event_participants($1::uuid)',
    [IRGENDEINE],
    'appointments.read',
  ],
  [
    'list_event_series',
    users.patientMax,
    'select * from public.list_event_series($1::uuid)',
    [IRGENDEINE],
    'appointments.read',
  ],
  [
    'list_patient_appointments',
    users.patientMax,
    'select * from public.list_patient_appointments($1::uuid)',
    [patients.max],
    'appointments.read',
  ],
  [
    'list_patient_upcoming_appointments',
    users.patientMax,
    'select * from public.list_patient_upcoming_appointments($1::uuid)',
    [patients.max],
    'appointments.read',
  ],
  [
    'check_appointment_slots',
    users.patientMax,
    'select * from public.check_appointment_slots($1::uuid, $2::jsonb)',
    [IRGENDEINE, '[]'],
    'appointments.read',
  ],
  [
    'list_staff_future_appointments',
    users.office,
    'select * from public.list_staff_future_appointments($1::uuid)',
    [IRGENDEINE],
    'appointments.read',
  ],
  [
    'list_patient_appointment_slip',
    users.patientMax,
    'select * from public.list_patient_appointment_slip($1::uuid)',
    [patients.max],
    'patient_record.viewed',
  ],
  // Akte.
  [
    'search_patients',
    users.patientMax,
    'select * from public.search_patients($1)',
    ['Mustermann'],
    'patient_directory.read',
  ],
  [
    'list_patient_treatment_bases',
    users.patientMax,
    'select * from public.list_patient_treatment_bases($1::uuid)',
    [patients.max],
    'treatment_bases.read',
  ],
  [
    'list_patient_treatment_basis_slots',
    users.patientMax,
    'select * from public.list_patient_treatment_basis_slots($1::uuid)',
    [patients.max],
    'treatment_bases.read',
  ],
  [
    'get_treatment_basis_slots',
    users.patientMax,
    'select * from public.get_treatment_basis_slots($1::uuid)',
    [IRGENDEINE],
    'treatment_bases.read',
  ],
  [
    'list_patient_treatment_evidence',
    users.patientMax,
    'select * from public.list_patient_treatment_evidence($1::uuid)',
    [patients.max],
    'treatment_evidence.read',
  ],
  [
    'list_patient_files',
    users.trainer,
    'select * from public.list_patient_files($1::uuid)',
    [patients.max],
    'patient_files.read',
  ],
  // Textbausteine: nur wer dokumentiert.
  [
    'list_text_snippets',
    users.office,
    'select * from public.list_text_snippets()',
    [],
    'text_snippets.read',
  ],
  // Abrechnung: owner und office (ANN-076).
  ['list_invoices', users.therapist, 'select * from public.list_invoices()', [], 'invoicing.read'],
  [
    'list_open_items',
    users.therapist,
    'select * from public.list_open_items()',
    [],
    'invoicing.read',
  ],
  [
    'list_invoice_candidates',
    users.therapist,
    'select * from public.list_invoice_candidates()',
    [],
    'invoicing.read',
  ],
  [
    'get_invoice',
    users.therapist,
    'select r from public.get_invoice($1::uuid) as r where r is not null',
    [IRGENDEINE],
    'invoicing.read',
  ],
  [
    'list_invoice_recipients',
    users.therapist,
    'select * from public.list_invoice_recipients($1::uuid)',
    [patients.petra],
    'invoicing.read',
  ],
  [
    'list_invoice_reminders',
    users.therapist,
    'select * from public.list_invoice_reminders($1::uuid)',
    [IRGENDEINE],
    'invoicing.read',
  ],
  [
    'get_payment_reminder',
    users.therapist,
    'select r from public.get_payment_reminder($1::uuid) as r where r is not null',
    [IRGENDEINE],
    'invoicing.read',
  ],
  [
    'list_invoice_payments',
    users.therapist,
    'select * from public.list_invoice_payments($1::uuid)',
    [IRGENDEINE],
    'invoicing.read',
  ],
  ['list_payments', users.therapist, 'select * from public.list_payments()', [], 'invoicing.read'],
  [
    'list_revenue_by_service_area',
    users.trainer,
    `select * from public.list_revenue_by_service_area('accrual', null)`,
    [],
    'invoicing.read',
  ],
  [
    'list_revenue_years',
    users.trainer,
    'select * from public.list_revenue_years()',
    [],
    'invoicing.read',
  ],
  [
    'list_billable_services',
    users.teamLead,
    'select * from public.list_billable_services()',
    [],
    'billable_services.read',
  ],
  [
    'list_open_billable_appointments',
    users.teamLead,
    'select * from public.list_open_billable_appointments()',
    [],
    'billable_services.read',
  ],
  [
    'get_billable_service_draft',
    users.teamLead,
    'select * from public.get_billable_service_draft($1::uuid)',
    [IRGENDEINE],
    'billable_services.read',
  ],
  // Nachweise der Praxisleitung: nur owner.
  [
    'list_legal_holds',
    users.office,
    'select * from public.list_legal_holds()',
    [],
    'legal_holds.read',
  ],
  [
    'list_storage_deletion_orders',
    users.therapist,
    'select * from public.list_storage_deletion_orders()',
    [],
    'storage_deletion.read',
  ],
  [
    'list_missing_patient_file_objects',
    users.teamLead,
    'select * from public.list_missing_patient_file_objects()',
    [],
    'storage_deletion.read',
  ],
  [
    'count_orphaned_patient_file_objects',
    users.office,
    'select n from public.count_orphaned_patient_file_objects() as n where n is not null',
    [],
    'storage_deletion.read',
  ],
];

describe('G6b: abgewiesene Lesezugriffe bleiben nachweisbar', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  it.each(FAELLE)('%s', async (_pfad, konto, sql, params, aktion) => {
    await erwarteAbgewiesenenLeseversuch(konto, sql, params, aktion);
  });

  it('weist ohne Organisation weiterhin mit Ausnahme ab (wie OPS-004)', async () => {
    // Ein Konto ohne Profil gehört zu keiner Praxis, in deren Log der
    // Versuch stünde.
    await expect(
      asUser('11111111-1111-4111-8111-0000000000ff', 'select * from public.list_invoices()'),
    ).rejects.toThrow(/not allowed to read invoices/);
  });

  it('weist ohne Sitzung weiterhin mit Ausnahme ab', async () => {
    await expect(asUser(null, 'select * from public.list_legal_holds()')).rejects.toThrow(
      /not authenticated/,
    );
  });
});
