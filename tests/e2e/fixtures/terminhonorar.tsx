import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import type {
  Honorarstand,
  Kandidat,
  KatalogPosition,
  KatalogVersion,
  Rechnung,
} from '@/features/billing/api';
import { CatalogPage } from '@/features/billing/CatalogPage';
import { Honorarvereinbarung } from '@/features/billing/Honorarvereinbarung';
import { InvoicePrintPage } from '@/features/billing/InvoicePrintPage';
import { InvoicesPage } from '@/features/billing/InvoicesPage';
import { rechnungsansicht } from '@/features/billing/testdaten';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `terminhonorar.html` (ABR-EPIC-007).
 *
 * `?seite=katalog` (Standard: Preisliste in Kraft und Entwurf mit
 * Terminhonorar), `?seite=akte` (Honorar in der Akte, als owner),
 * `?seite=rechnungen` (Arbeitsliste je Verordnung) und `?seite=blatt`
 * (Rechnung mit Positionen und Behandlungstagen). Die Daten liegen vorab im
 * Cache; gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'katalog';

const ERIKA = '66666666-6666-4666-8666-000000000002';
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';
const AUSGESTELLT = 'dddddddd-dddd-4ddd-8ddd-000000000003';

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

function position(id: string, code: string, label: string, preis: number): KatalogPosition {
  return {
    id,
    catalog_version_id: 'v1',
    sort_order: 1,
    code,
    label,
    item_kind: 'treatment',
    remedy: label,
    unit_price_cents: preis,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
  };
}

const positionen = [
  position('p1', 'X0501', 'Krankengymnastik', 4500),
  position('p2', 'X0709', 'Krankengymnastik ZNS', 5500),
  position('p3', 'HB', 'Hausbesuchspauschale', 1800),
];

const honorar: Honorarstand = {
  current_cents: 12000,
  current_source: 'agreement',
  current_valid_from: '2026-05-01',
  agreements: [
    {
      id: 'a1',
      valid_from: '2026-05-01',
      session_fee_cents: 12000,
      created_at: '2026-04-20T10:00:00Z',
      created_by_name: 'Jannes Test',
    },
  ],
};

const kandidaten: Kandidat[] = [
  {
    patient_id: ERIKA,
    training_relationship_id: null,
    patient_name: 'Erika Beispiel',
    period_month: '2026-07-01',
    service_area: 'therapy',
    service_count: 20,
    total_cents: 140_000,
    currency: 'EUR',
    has_draft: false,
    draft_id: null,
    treatment_basis_id: GRUNDLAGE,
    basis_kind: 'follow_up',
    basis_issued_on: '2026-07-15',
    first_performed_on: '2026-07-22',
    last_performed_on: '2026-08-27',
  },
];

const rechnungen: Rechnung[] = [
  {
    id: AUSGESTELLT,
    status: 'issued',
    invoice_number: 'RG-2026-0007',
    period_month: '2026-07-01',
    service_area: 'therapy',
    issued_on: '2026-08-28',
    due_on: '2026-09-11',
    patient_id: ERIKA,
    training_relationship_id: null,
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    recipient_kind: 'self',
    total_cents: 42_000,
    currency: 'EUR',
    item_count: 6,
    paid_cents: 0,
    outstanding_cents: 42_000,
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    treatment_basis_id: GRUNDLAGE,
    basis_kind: 'first',
    basis_issued_on: '2026-07-01',
  },
];

function zeile(tag: string, code: string, label: string, preis: number) {
  return {
    performed_on: tag,
    code,
    label,
    item_kind: 'treatment' as const,
    quantity: 1,
    unit_price_cents: preis,
    line_total_cents: preis,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare' as const,
    tax_rate_permille: 0,
    session_fee: true,
  };
}

// Terminhonorar 140,00 € je Termin, aufgeteilt nach 4500 : 5500 : 1800.
const tage = ['2026-07-22', '2026-07-29', '2026-08-27'];
const dokument = {
  schema_version: 5,
  period_month: '2026-07-01',
  service_period: { from: '2026-07-22', to: '2026-08-27' },
  service_area: 'therapy' as const,
  treatment_bases: [
    {
      kind: 'first',
      issued_on: '2026-07-01',
      prescriber: 'Dr. Ida Beispiel',
      diagnosis_icd10: 'G20.0',
      diagnosis: 'Synthetisch: Bewegungsstörung.',
    },
  ],
  items: tage.flatMap((tag) => [
    zeile(tag, 'X0501', 'Krankengymnastik', 5339),
    zeile(tag, 'X0709', 'Krankengymnastik ZNS', 6525),
    zeile(tag, 'HB', 'Hausbesuchspauschale', 2136),
  ]),
  tax_groups: [
    {
      tax_treatment: 'exempt_healthcare' as const,
      tax_rate_permille: 0,
      exemption_reason: 'Umsatzsteuerfrei nach § 4 Nr. 14 Buchst. a UStG',
      gross_cents: 42_000,
      tax_cents: 0,
      net_cents: 42_000,
    },
  ],
  totals: { total_cents: 42_000, tax_total_cents: 0 },
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['katalog-versionen'], versionen);
client.setQueryData(['katalog-positionen', 'v1'], positionen);
client.setQueryData(
  ['katalog-positionen', 'v2'],
  positionen.map((p) => ({ ...p, catalog_version_id: 'v2' })),
);
client.setQueryData(['honorar', ERIKA], honorar);
client.setQueryData(['rechnungs-kandidaten'], kandidaten);
client.setQueryData(['rechnungen'], rechnungen);
client.setQueryData(['offene-posten'], []);
client.setQueryData(
  ['rechnung', AUSGESTELLT],
  rechnungsansicht(
    {
      id: AUSGESTELLT,
      status: 'issued',
      invoice_number: 'RG-2026-0007',
      issued_on: '2026-08-28',
      due_on: '2026-09-11',
      outstanding_cents: 42_000,
    },
    { ...dokument, invoice_number: 'RG-2026-0007', issued_on: '2026-08-28' },
  ),
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

const start =
  seite === 'akte'
    ? '/akte'
    : seite === 'rechnungen'
      ? '/abrechnung/rechnungen'
      : seite === 'blatt'
        ? `/abrechnung/rechnungen/${AUSGESTELLT}/blatt`
        : '/abrechnung/katalog';

const router = createMemoryRouter(
  [
    { path: '/abrechnung/katalog', element: rahmen(<CatalogPage user={user} />) },
    {
      path: '/akte',
      element: rahmen(
        <Section titel="Abrechnung" rahmen>
          <Honorarvereinbarung patientId={ERIKA} darfFestlegen heute="2026-10-05" />
        </Section>,
      ),
    },
    { path: '/abrechnung/rechnungen', element: rahmen(<InvoicesPage user={user} />) },
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
