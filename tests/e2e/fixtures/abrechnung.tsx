import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type {
  Einnahmenzeile,
  Erinnerung,
  Erinnerungsdokument,
  KatalogPosition,
  KatalogVersion,
  Leistung,
  OffenerTermin,
  PraxisStammdaten,
  Zahlung,
  ZahlungMitRechnung,
} from '@/features/billing/api';
import { CancellationPrintPage } from '@/features/billing/CancellationPrintPage';
import { CatalogPage } from '@/features/billing/CatalogPage';
import { InvoiceDetailPage } from '@/features/billing/InvoiceDetailPage';
import { InvoicePrintPage } from '@/features/billing/InvoicePrintPage';
import { PaymentsPage } from '@/features/billing/PaymentsPage';
import { PracticeProfilePage } from '@/features/billing/PracticeProfilePage';
import { ReminderPrintPage } from '@/features/billing/ReminderPrintPage';
import { RevenuePage } from '@/features/billing/RevenuePage';
import { ServicesPage } from '@/features/billing/ServicesPage';
import { rechnungsansicht } from '@/features/billing/testdaten';
import { FAELLIGE_MONATE_SCHLUESSEL } from '@/features/billing/nachsorge-api';
import type { CurrentUser } from '@/features/core/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `abrechnung.html` (Design-Rollout B6).
 *
 * Die Seiten der Abrechnung mit Inhalt - in der Bildstrecke haben Rechnung,
 * Storno und Erinnerung keine Daten (der Seed hat keine Rechnung):
 *
 *   * `?seite=rechnung` (Standard): ausgestellt, teilweise bezahlt, überfällig,
 *     zwei Zahlungen (eine storniert) und eine Erinnerung - Reiter „Zahlungen“;
 *   * `?seite=positionen`: dieselbe Rechnung, Reiter „Positionen“;
 *   * `?seite=guthaben`: storniert, mit Eingang und Korrekturrechnung;
 *   * `?seite=zahlungen`, `leistungen`, `katalog`, `stammdaten`, `auswertung`;
 *   * `?seite=blatt`, `storno`, `erinnerung`: die drei Druckblätter.
 *
 * Die Daten liegen vorab im Cache; gesprochen wird mit keinem Server. Alles
 * ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'rechnung';

const OFFEN = 'dddddddd-dddd-4ddd-8ddd-00000000b601';
const STORNIERT = 'dddddddd-dddd-4ddd-8ddd-00000000b602';
const KORREKTUR = 'dddddddd-dddd-4ddd-8ddd-00000000b603';
const ERINNERUNG = 'cccccccc-cccc-4ccc-8ccc-00000000b601';

const dokument = {
  schema_version: 5,
  period_month: '2026-09-01',
  service_period: { from: '2026-09-02', to: '2026-09-23' },
  service_area: 'therapy' as const,
  items: ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23'].map((tag) => ({
    performed_on: tag,
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment' as const,
    quantity: 1,
    unit_price_cents: 4800,
    line_total_cents: 4800,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare' as const,
    tax_rate_permille: 0,
  })),
  tax_groups: [
    {
      tax_treatment: 'exempt_healthcare' as const,
      tax_rate_permille: 0,
      exemption_reason: 'Steuerfreie Heilbehandlung nach § 4 Nr. 14 Buchstabe a UStG',
      gross_cents: 19_200,
      tax_cents: 0,
      net_cents: 19_200,
    },
  ],
  totals: { total_cents: 19_200, tax_total_cents: 0 },
};

const zahlungen: Zahlung[] = [
  {
    id: 'z1',
    direction: 'incoming',
    amount_cents: 9600,
    currency: 'EUR',
    paid_on: '2026-10-02',
    method: 'bank_transfer',
    note: 'Teilzahlung laut Verwendungszweck',
    voided_at: null,
    void_reason: null,
  },
  {
    id: 'z2',
    direction: 'incoming',
    amount_cents: 4800,
    currency: 'EUR',
    paid_on: '2026-09-30',
    method: 'other',
    note: null,
    voided_at: '2026-10-01T09:00:00Z',
    void_reason: 'Doppelt erfasst',
  },
];

const erinnerungen: Erinnerung[] = [
  {
    id: ERINNERUNG,
    reminder_on: '2026-10-09',
    due_on: '2026-10-23',
    outstanding_cents: 9600,
    currency: 'EUR',
  },
];

const zahlungsliste: ZahlungMitRechnung[] = [
  {
    ...zahlungen[0]!,
    invoice_id: OFFEN,
    invoice_number: 'RG-2026-0012',
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    total_count: 3,
  },
  {
    ...zahlungen[1]!,
    invoice_id: OFFEN,
    invoice_number: 'RG-2026-0012',
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    total_count: 3,
  },
  {
    id: 'z3',
    direction: 'refund',
    amount_cents: 4800,
    currency: 'EUR',
    paid_on: '2026-09-25',
    method: 'bank_transfer',
    note: null,
    voided_at: null,
    void_reason: null,
    invoice_id: STORNIERT,
    invoice_number: 'RG-2026-0009',
    patient_name: 'Max Mustermann',
    recipient_name: 'Beihilfestelle Testland',
    total_count: 3,
  },
];

const versionen: KatalogVersion[] = [
  {
    id: 'v2',
    label: 'Preisliste 2027 (Entwurf)',
    valid_from: '2027-01-01',
    published_at: null,
    session_fee_cents: 14500,
  },
  {
    id: 'v1',
    label: 'Preisliste 2026',
    valid_from: '2026-01-01',
    published_at: '2025-12-20T08:00:00Z',
    session_fee_cents: 14000,
  },
];

function position(
  id: string,
  code: string,
  label: string,
  preis: number,
  rest: Partial<KatalogPosition> = {},
): KatalogPosition {
  return {
    id,
    catalog_version_id: 'v1',
    sort_order: 1,
    code,
    label,
    item_kind: 'treatment',
    remedy: null,
    unit_price_cents: preis,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
    package_months: null,
    ...rest,
  };
}

const positionen = [
  position('p1', 'KG', 'Krankengymnastik', 4800, { remedy: 'Krankengymnastik (KG)' }),
  position('p2', 'AUS', 'Ausfallhonorar', 4800, {
    item_kind: 'absence_fee',
    tax_treatment: 'not_taxable',
  }),
  position('p3', 'NSA', 'Nachsorge-Abo (Monat)', 4200, {
    item_kind: 'aftercare_month',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
  }),
  position('p4', 'TP3', 'Trainingspaket 3 Monate (eine Einheit je Woche)', 41_000, {
    item_kind: 'training_package',
    service_area: 'training',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    package_months: 3,
  }),
];

const offeneTermine: OffenerTermin[] = [
  {
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-00000000b601',
    patient_id: '66666666-6666-4666-8666-000000000002',
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-10-07',
    starts_at: '2026-10-07T08:00:00Z',
    status: 'completed',
    fee_basis: null,
    appointment_type: 'home_visit',
    suggestion_count: 1,
  },
  {
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-00000000b602',
    patient_id: '66666666-6666-4666-8666-000000000001',
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Max Mustermann',
    performed_on: '2026-10-08',
    starts_at: '2026-10-08T09:00:00Z',
    status: 'cancelled',
    fee_basis: 'late_cancellation',
    appointment_type: 'home_visit',
    suggestion_count: 1,
  },
  {
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-00000000b603',
    patient_id: null,
    training_relationship_id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
    service_area: 'training',
    patient_name: 'Tina Trainingskundin',
    performed_on: '2026-10-10',
    starts_at: '2026-10-10T15:00:00Z',
    status: 'completed',
    fee_basis: null,
    appointment_type: 'training',
    suggestion_count: 1,
  },
];

function leistung(
  id: string,
  termin: string | null,
  name: string,
  tag: string,
  rest: Partial<Leistung> = {},
): Leistung {
  return {
    id,
    appointment_id: termin,
    patient_id: '66666666-6666-4666-8666-000000000002',
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: name,
    performed_on: tag,
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    quantity: 1,
    unit_price_cents: 4800,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    status: 'billable',
    session_fee: false,
    ...rest,
  };
}

const leistungen: Leistung[] = [
  leistung('l1', 't1', 'Erika Beispiel', '2026-10-01', {
    session_fee: true,
    unit_price_cents: 9667,
  }),
  leistung('l2', 't1', 'Erika Beispiel', '2026-10-01', {
    code: 'HB',
    label: 'Hausbesuchspauschale',
    session_fee: true,
    unit_price_cents: 4333,
  }),
  leistung('l3', 't2', 'Max Mustermann', '2026-10-02', {
    code: 'AUS',
    label: 'Ausfallhonorar',
    item_kind: 'absence_fee',
    tax_treatment: 'not_taxable',
  }),
  leistung('l4', null, 'Erika Beispiel', '2026-10-05', {
    code: 'NSA',
    label: 'Nachsorge-Abo (Monat)',
    item_kind: 'aftercare_month',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    unit_price_cents: 4200,
  }),
  leistung('l5', 't3', 'Erika Beispiel', '2026-09-02', { status: 'invoiced' }),
];

const stammdaten: PraxisStammdaten = {
  legal_name: 'Test Praxis Tuebingen',
  street: 'Musterallee',
  house_number: '1',
  postal_code: '72070',
  city: 'Tuebingen',
  phone: '+49 7071 0000000',
  email: 'rechnung@praxis.invalid',
  tax_number: '86123/45678',
  vat_id: null,
  small_business: false,
  bank_name: 'Testbank Tuebingen',
  account_holder: 'Test Praxis Tuebingen',
  iban: 'DE02120300000000202051',
  bic: 'TESTDEFFXXX',
  invoice_number_prefix: 'RG',
  training_invoice_number_prefix: 'TR',
  payment_term_days: 14,
};

function einnahme(
  basis: Einnahmenzeile['basis'],
  bereich: Einnahmenzeile['service_area'],
  steuer: Einnahmenzeile['tax_treatment'],
  brutto: number,
  rest: Partial<Einnahmenzeile> = {},
): Einnahmenzeile {
  const satz = steuer === 'taxable' ? 190 : 0;
  const ust = Math.round((brutto * satz) / (1000 + satz));
  return {
    basis,
    year: 2026,
    service_area: bereich,
    tax_treatment: steuer,
    tax_rate_permille: satz,
    currency: 'EUR',
    gross_cents: brutto,
    tax_cents: ust,
    net_cents: brutto - ust,
    document_count: 12,
    ...rest,
  };
}

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});

client.setQueryData(
  ['rechnung', OFFEN],
  rechnungsansicht(
    {
      id: OFFEN,
      status: 'issued',
      invoice_number: 'RG-2026-0012',
      issued_on: '2026-09-24',
      due_on: '2026-10-08',
      paid_cents: 9600,
      outstanding_cents: 9600,
      payment_state: 'partially_paid',
      overdue: true,
    },
    { ...dokument, invoice_number: 'RG-2026-0012', issued_on: '2026-09-24' },
  ),
);
client.setQueryData(['rechnungszahlungen', OFFEN], zahlungen);
client.setQueryData(['zahlungserinnerungen', OFFEN], erinnerungen);

client.setQueryData(
  ['rechnung', STORNIERT],
  rechnungsansicht(
    {
      id: STORNIERT,
      status: 'issued',
      invoice_number: 'RG-2026-0009',
      issued_on: '2026-08-28',
      due_on: '2026-09-11',
      paid_cents: 4800,
      outstanding_cents: 0,
      payment_state: 'paid',
      cancellation: {
        cancellation_number: 'RG-2026-0010',
        reason: 'Falscher Empfänger',
        cancelled_on: '2026-09-02',
      },
      correction_invoice_id: KORREKTUR,
      correction_invoice_number: 'RG-2026-0011',
    },
    {
      ...dokument,
      invoice_number: 'RG-2026-0009',
      issued_on: '2026-08-28',
      recipient: {
        kind: 'aid_authority',
        name: 'Beihilfestelle Testland',
        street: 'Amtsweg',
        house_number: '1',
        postal_code: '72072',
        city: 'Tuebingen',
        reference: 'BH-2026-0042',
      },
      patient: { name: 'Max Mustermann', date_of_birth: '1958-03-02' },
    },
  ),
);
client.setQueryData(['rechnungszahlungen', STORNIERT], [zahlungen[0]!]);
client.setQueryData(['zahlungserinnerungen', STORNIERT], []);

const erinnerungsblatt: Erinnerungsdokument = {
  ...erinnerungen[0]!,
  invoice_id: OFFEN,
  invoice_number: 'RG-2026-0012',
  issued_on: '2026-09-24',
  invoice_due_on: '2026-10-08',
  document: (client.getQueryData(['rechnung', OFFEN]) as ReturnType<typeof rechnungsansicht>)
    .document,
};
client.setQueryData(['zahlungserinnerung', ERINNERUNG], erinnerungsblatt);

client.setQueryData(['zahlungen'], zahlungsliste);
client.setQueryData(['katalog-versionen'], versionen);
client.setQueryData(['katalog-positionen', 'v1'], positionen);
client.setQueryData(
  ['katalog-positionen', 'v2'],
  positionen.map((p) => ({ ...p, catalog_version_id: 'v2' })),
);
client.setQueryData(['abrechnung-offene-termine'], offeneTermine);
client.setQueryData(['abrechnung-leistungen'], leistungen);
client.setQueryData(FAELLIGE_MONATE_SCHLUESSEL, []);
client.setQueryData(['praxis-stammdaten'], stammdaten);
client.setQueryData(['einnahmen-jahre'], [2026, 2025]);
client.setQueryData(
  ['einnahmen', 'accrual', 2026],
  [
    einnahme('accrual', 'therapy', 'exempt_healthcare', 1_843_200),
    einnahme('accrual', 'therapy', 'taxable', 50_400, { document_count: 4 }),
    einnahme('accrual', 'therapy', 'not_taxable', 14_400, { document_count: 3 }),
    einnahme('accrual', 'training', 'taxable', 246_000, { document_count: 6 }),
  ],
);

const user: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000001',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000001',
    display_name: 'Jannes Test',
    is_active: true,
  },
  roles: ['owner', 'therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};
const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const START: Record<string, string> = {
  rechnung: `/abrechnung/rechnungen/${OFFEN}`,
  positionen: `/abrechnung/rechnungen/${OFFEN}?teil=positionen`,
  guthaben: `/abrechnung/rechnungen/${STORNIERT}`,
  zahlungen: '/abrechnung/zahlungen',
  leistungen: '/abrechnung/leistungen',
  katalog: '/abrechnung/katalog',
  stammdaten: '/abrechnung/stammdaten',
  auswertung: '/abrechnung/auswertung',
  blatt: `/abrechnung/rechnungen/${OFFEN}/druck`,
  storno: `/abrechnung/rechnungen/${STORNIERT}/storno`,
  erinnerung: `/abrechnung/erinnerungen/${ERINNERUNG}`,
};

const router = createMemoryRouter(
  [
    {
      path: '/abrechnung/rechnungen/:invoiceId',
      element: rahmen(<InvoiceDetailPage user={user} />),
    },
    { path: '/abrechnung/rechnungen/:invoiceId/druck', element: rahmen(<InvoicePrintPage />) },
    {
      path: '/abrechnung/rechnungen/:invoiceId/storno',
      element: rahmen(<CancellationPrintPage />),
    },
    { path: '/abrechnung/erinnerungen/:reminderId', element: rahmen(<ReminderPrintPage />) },
    { path: '/abrechnung/zahlungen', element: rahmen(<PaymentsPage user={user} />) },
    { path: '/abrechnung/leistungen', element: rahmen(<ServicesPage />) },
    { path: '/abrechnung/katalog', element: rahmen(<CatalogPage user={user} />) },
    { path: '/abrechnung/stammdaten', element: rahmen(<PracticeProfilePage user={user} />) },
    { path: '/abrechnung/auswertung', element: rahmen(<RevenuePage />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [START[seite] ?? START.rechnung!] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
