import type { Rechnungsansicht, Rechnungsdokument } from './api';

/**
 * Eine Rechnungsansicht für Komponententests (ABR-003, ABR-003b).
 *
 * Steht in einer eigenen Datei und nicht in einer der Testdateien: Die
 * Rechnungsseite und das Rechnungsblatt zeigen **dasselbe** Dokument, und
 * zwei Ausgangswerte dafür liefen beim nächsten Feld auseinander. Eine
 * `.test.`-Datei kommt als gemeinsame Quelle nicht in Frage — ihr Import
 * würde ihre Testfälle ein zweites Mal ausführen.
 *
 * Alle Angaben sind **synthetisch**: erfundene Personen, erfundene Anschrift,
 * erfundene Bankverbindung, erfundene Steuernummer.
 */
export function rechnungsansicht(
  rest: Partial<Rechnungsansicht> = {},
  dokument: Partial<Rechnungsdokument> = {},
): Rechnungsansicht {
  return {
    id: 'r1',
    status: 'draft',
    patient_id: 'p1',
    recipient_id: null,
    invoice_number: null,
    issued_on: null,
    due_on: null,
    paid_cents: 0,
    outstanding_cents: 0,
    payment_state: 'unpaid',
    overdue: false,
    cancellation: null,
    replaces_invoice_id: null,
    replaces_invoice_number: null,
    correction_invoice_id: null,
    correction_invoice_number: null,
    ...rest,
    document: {
      schema_version: 1,
      period_month: '2026-08-01',
      currency: 'EUR',
      issuer: {
        legal_name: 'Test Praxis Tuebingen',
        street: 'Musterallee',
        house_number: '1',
        postal_code: '72070',
        city: 'Tuebingen',
        phone: null,
        email: null,
        tax_number: '86123/45678',
        vat_id: null,
        small_business: false,
        bank_name: null,
        account_holder: null,
        iban: 'DE02120300000000202051',
        bic: null,
        payment_term_days: 14,
      },
      recipient: {
        kind: 'self',
        name: 'Erika Beispiel',
        street: 'Testweg',
        house_number: '7',
        postal_code: '72072',
        city: 'Tuebingen',
        reference: null,
      },
      patient: { name: 'Erika Beispiel', date_of_birth: '1963-09-17' },
      treatment_bases: [
        { kind: 'first', issued_on: '2026-07-01', prescriber: 'Dr. Fiktiv Beispiel' },
      ],
      items: [
        {
          performed_on: '2026-08-03',
          code: 'KG',
          label: 'Krankengymnastik',
          item_kind: 'treatment',
          quantity: 1,
          unit_price_cents: 4500,
          line_total_cents: 4500,
          currency: 'EUR',
          tax_treatment: 'exempt_healthcare',
          tax_rate_permille: 0,
        },
      ],
      tax_groups: [
        {
          tax_treatment: 'exempt_healthcare',
          tax_rate_permille: 0,
          gross_cents: 4500,
          tax_cents: 0,
          net_cents: 4500,
        },
      ],
      totals: { total_cents: 4500, tax_total_cents: 0 },
      ...dokument,
    },
  };
}
