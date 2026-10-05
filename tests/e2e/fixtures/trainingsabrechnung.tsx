import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type {
  Kandidat,
  Leistung,
  OffenerPosten,
  OffenerTermin,
  Rechnung,
  Vorschlag,
} from '@/features/billing/api';
import { InvoiceDetailPage } from '@/features/billing/InvoiceDetailPage';
import { InvoicePrintPage } from '@/features/billing/InvoicePrintPage';
import { InvoicesPage } from '@/features/billing/InvoicesPage';
import { ServicesPage } from '@/features/billing/ServicesPage';
import { rechnungsansicht } from '@/features/billing/testdaten';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `trainingsabrechnung.html` (TRN-EPIC-003).
 *
 * `?seite=leistungen` (Standard), `?seite=rechnungen`, `?seite=rechnung`
 * (Entwurf einer Trainingsrechnung) und `?seite=blatt` (ausgestellte
 * Trainingsrechnung als Blatt). Die Daten liegen vorab im Cache; gesprochen
 * wird mit keinem Server. Alles ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'leistungen';

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const ERIKA_TRAINING = 'eeeeeeee-eeee-4eee-8eee-000000000002';
const ERIKA_AKTE = '66666666-6666-4666-8666-000000000002';
const ENTWURF = 'dddddddd-dddd-4ddd-8ddd-000000000001';
const AUSGESTELLT = 'dddddddd-dddd-4ddd-8ddd-000000000002';

const offeneTermine: OffenerTermin[] = [
  {
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
    patient_id: null,
    training_relationship_id: TINA,
    service_area: 'training',
    patient_name: 'Tina Trainingskundin',
    performed_on: '2026-09-28',
    starts_at: '2026-09-28T08:00:00Z',
    status: 'completed',
    fee_basis: null,
    appointment_type: 'practice',
    suggestion_count: 0,
  },
  {
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    patient_id: ERIKA_AKTE,
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-27',
    starts_at: '2026-09-27T08:00:00Z',
    status: 'documented',
    fee_basis: null,
    appointment_type: 'home_visit',
    suggestion_count: 1,
  },
];

const vorschlag: Vorschlag[] = [
  {
    catalog_item_id: 'cccccccc-cccc-4ccc-8ccc-000000000009',
    code: 'PT',
    label: 'Personal Training (Einzelstunde)',
    item_kind: 'treatment',
    unit_price_cents: 7500,
    currency: 'EUR',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    service_area: 'training',
    suggested: false,
    in_session_fee: false,
  },
];

const leistungen: Leistung[] = [
  {
    id: 'l1',
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000010',
    patient_id: null,
    training_relationship_id: ERIKA_TRAINING,
    service_area: 'training',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-21',
    code: 'PT',
    label: 'Personal Training (Einzelstunde)',
    item_kind: 'treatment',
    quantity: 1,
    unit_price_cents: 7500,
    currency: 'EUR',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    status: 'billable',
    session_fee: false,
  },
];

const kandidaten: Kandidat[] = [
  {
    patient_id: ERIKA_AKTE,
    training_relationship_id: null,
    patient_name: 'Erika Beispiel',
    period_month: '2026-09-01',
    service_area: 'therapy',
    service_count: 3,
    total_cents: 13_500,
    currency: 'EUR',
    has_draft: false,
    draft_id: null,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
    first_performed_on: null,
    last_performed_on: null,
  },
  {
    patient_id: null,
    training_relationship_id: ERIKA_TRAINING,
    patient_name: 'Erika Beispiel',
    period_month: '2026-09-01',
    service_area: 'training',
    service_count: 1,
    total_cents: 7_500,
    currency: 'EUR',
    has_draft: false,
    draft_id: null,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
    first_performed_on: null,
    last_performed_on: null,
  },
];

const rechnungen: Rechnung[] = [
  {
    id: ENTWURF,
    status: 'draft',
    invoice_number: null,
    period_month: '2026-09-01',
    service_area: 'training',
    issued_on: null,
    due_on: null,
    patient_id: null,
    training_relationship_id: TINA,
    patient_name: 'Tina Trainingskundin',
    recipient_name: 'Tina Trainingskundin',
    recipient_kind: 'self',
    total_cents: 7500,
    currency: 'EUR',
    item_count: 1,
    paid_cents: 0,
    outstanding_cents: 0,
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
  },
  {
    id: AUSGESTELLT,
    status: 'issued',
    invoice_number: 'TR-2026-0001',
    period_month: '2026-08-01',
    service_area: 'training',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    patient_id: null,
    training_relationship_id: TINA,
    patient_name: 'Tina Trainingskundin',
    recipient_name: 'Tina Trainingskundin',
    recipient_kind: 'self',
    total_cents: 15_000,
    currency: 'EUR',
    item_count: 2,
    paid_cents: 0,
    outstanding_cents: 15_000,
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    treatment_basis_id: null,
    basis_kind: null,
    basis_issued_on: null,
  },
];

const offenePosten: OffenerPosten[] = [
  {
    id: AUSGESTELLT,
    invoice_number: 'TR-2026-0001',
    patient_id: null,
    training_relationship_id: TINA,
    service_area: 'training',
    patient_name: 'Tina Trainingskundin',
    recipient_name: 'Tina Trainingskundin',
    period_month: '2026-08-01',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    total_cents: 15_000,
    paid_cents: 0,
    outstanding_cents: 15_000,
    currency: 'EUR',
    overdue: false,
    open_total_cents: 15_000,
  },
];

/** Das Dokument einer Trainingsrechnung, so wie `app.build_invoice_document` es baut (ANN-182). */
const trainingsdokument = {
  schema_version: 3,
  period_month: '2026-09-01',
  service_area: 'training' as const,
  recipient: {
    kind: 'self',
    name: 'Tina Trainingskundin',
    street: 'Trainingsweg 5',
    house_number: null,
    postal_code: '72076',
    city: 'Tuebingen',
    reference: null,
  },
  patient: { name: 'Tina Trainingskundin', date_of_birth: null },
  treatment_bases: [],
  items: [
    {
      performed_on: '2026-09-28',
      code: 'PT',
      label: 'Personal Training (Einzelstunde)',
      item_kind: 'treatment' as const,
      quantity: 1,
      unit_price_cents: 7500,
      line_total_cents: 7500,
      currency: 'EUR',
      tax_treatment: 'taxable' as const,
      tax_rate_permille: 190,
    },
  ],
  tax_groups: [
    {
      tax_treatment: 'taxable' as const,
      tax_rate_permille: 190,
      exemption_reason: null,
      gross_cents: 7500,
      tax_cents: 1197,
      net_cents: 6303,
    },
  ],
  totals: { total_cents: 7500, tax_total_cents: 1197 },
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['abrechnung-offene-termine'], offeneTermine);
client.setQueryData(['abrechnung-leistungen'], leistungen);
client.setQueryData(['abrechnung-vorschlag', offeneTermine[0]!.appointment_id], vorschlag);
client.setQueryData(['rechnungs-kandidaten'], kandidaten);
client.setQueryData(['rechnungen'], rechnungen);
client.setQueryData(['offene-posten'], offenePosten);
client.setQueryData(
  ['rechnung', ENTWURF],
  rechnungsansicht({ id: ENTWURF, patient_id: null }, trainingsdokument),
);
client.setQueryData(
  ['rechnung', AUSGESTELLT],
  rechnungsansicht(
    {
      id: AUSGESTELLT,
      patient_id: null,
      status: 'issued',
      invoice_number: 'TR-2026-0001',
      issued_on: '2026-10-01',
      due_on: '2026-10-15',
      outstanding_cents: 7500,
    },
    { ...trainingsdokument, invoice_number: 'TR-2026-0001', issued_on: '2026-10-01' },
  ),
);
for (const id of [ENTWURF, AUSGESTELLT]) {
  client.setQueryData(['rechnungszahlungen', id], []);
  client.setQueryData(['zahlungserinnerungen', id], []);
}

const user: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000003',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000003',
    display_name: 'Olivia Office',
    is_active: true,
  },
  roles: ['office'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};
const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const start =
  seite === 'rechnungen'
    ? '/abrechnung/rechnungen'
    : seite === 'rechnung'
      ? `/abrechnung/rechnungen/${ENTWURF}`
      : seite === 'blatt'
        ? `/abrechnung/rechnungen/${AUSGESTELLT}/blatt`
        : '/abrechnung/leistungen';

const router = createMemoryRouter(
  [
    { path: '/abrechnung/leistungen', element: rahmen(<ServicesPage />) },
    { path: '/abrechnung/rechnungen', element: rahmen(<InvoicesPage user={user} />) },
    {
      path: '/abrechnung/rechnungen/:invoiceId',
      element: rahmen(<InvoiceDetailPage user={user} />),
    },
    { path: '/abrechnung/rechnungen/:invoiceId/blatt', element: <InvoicePrintPage /> },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [start] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
