import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { KatalogPosition, KatalogVersion } from '@/features/billing/api';
import { CatalogPage } from '@/features/billing/CatalogPage';
import { InvoicePrintPage } from '@/features/billing/InvoicePrintPage';
import { rechnungsansicht } from '@/features/billing/testdaten';
import { Trainingspaket } from '@/features/billing/Trainingspaket';
import {
  paketSchluessel,
  type Paketposition,
  type Paketsicht,
} from '@/features/billing/trainingspaket-api';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `trainingspaket.html` (ANG-EPIC-002).
 *
 * `?seite=verhaeltnis` (Standard: laufendes und früheres Paket am
 * Trainingsverhältnis), `?seite=anlegen` (noch kein Paket, Formular über den
 * Knopf), `?seite=behandlung` (die Person ist noch in Behandlung, ANN-278),
 * `?seite=blatt` (Rechnung über ein Paket mit Zeitraum und Steuer) und
 * `?seite=preisliste` (Entwurf einer Preisliste mit Paketposition). Die Daten
 * liegen vorab im Cache; gesprochen wird mit keinem Server. Alles ist
 * synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'verhaeltnis';

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const RECHNUNG = 'dddddddd-dddd-4ddd-8ddd-0000000000b1';
const ENTWURF = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000003',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000003',
    display_name: 'Olivia Office',
    is_active: true,
  },
  roles: ['owner'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};

const LANG = 'Trainingspaket 6 Monate (eine Einheit je Woche, Plattform inklusive)';
const KURZ = 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)';

const mitPaketen: Paketsicht = {
  today: '2026-10-07',
  start_blocker: null,
  packages: [
    {
      id: 'k2',
      code: 'TP6',
      label: LANG,
      package_months: 6,
      price_cents: 72000,
      currency: 'EUR',
      starts_on: '2026-10-01',
      ends_on: '2027-03-31',
      state: 'running',
      created_at: '2026-09-30T10:00:00Z',
      created_by_name: 'Olivia Office',
      invoiced: false,
    },
    {
      id: 'k1',
      code: 'TP3',
      label: KURZ,
      package_months: 3,
      price_cents: 39000,
      currency: 'EUR',
      starts_on: '2026-06-15',
      ends_on: '2026-09-14',
      state: 'ended',
      created_at: '2026-06-14T10:00:00Z',
      created_by_name: 'Olivia Office',
      invoiced: true,
    },
  ],
};

const positionen: Paketposition[] = [
  {
    catalog_item_id: 'cccccccc-cccc-4ccc-8ccc-000000000014',
    code: 'TP3',
    label: KURZ,
    package_months: 3,
    unit_price_cents: 39000,
    currency: 'EUR',
    tax_rate_permille: 190,
  },
  {
    catalog_item_id: 'cccccccc-cccc-4ccc-8ccc-000000000015',
    code: 'TP6',
    label: LANG,
    package_months: 6,
    unit_price_cents: 72000,
    currency: 'EUR',
    tax_rate_permille: 190,
  },
];

const entwurf: KatalogVersion = {
  id: ENTWURF,
  label: 'Preisliste 2027 (Entwurf)',
  valid_from: '2027-01-01',
  published_at: null,
  session_fee_cents: 14500,
};

const katalog: KatalogPosition[] = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-000000000011',
    catalog_version_id: ENTWURF,
    sort_order: 1,
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    remedy: 'Krankengymnastik',
    unit_price_cents: 4800,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
    package_months: null,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-000000000016',
    catalog_version_id: ENTWURF,
    sort_order: 2,
    code: 'TP3',
    label: KURZ,
    item_kind: 'training_package',
    remedy: null,
    unit_price_cents: 41000,
    currency: 'EUR',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    service_area: 'training',
    package_months: 3,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(
  paketSchluessel(TINA),
  seite === 'anlegen'
    ? { ...mitPaketen, packages: [] }
    : seite === 'behandlung'
      ? { ...mitPaketen, packages: [], start_blocker: 'care_open' }
      : mitPaketen,
);
client.setQueryData(['trainingspaket-positionen', '2026-10-07'], positionen);
client.setQueryData(['katalog-versionen'], [entwurf]);
client.setQueryData(['katalog-positionen', ENTWURF], katalog);
client.setQueryData(
  ['rechnung', RECHNUNG],
  rechnungsansicht(
    {
      id: RECHNUNG,
      status: 'issued',
      invoice_number: 'TR-2026-0004',
      issued_on: '2026-10-01',
      due_on: '2026-10-15',
      outstanding_cents: 72000,
    },
    {
      schema_version: 5,
      period_month: '2026-10-01',
      service_period: { from: '2026-10-01', to: '2027-03-31' },
      service_area: 'training',
      // ANN-182: an die Kund:in selbst, ohne Geburtsdatum.
      recipient: {
        kind: 'self',
        name: 'Tina Training',
        street: 'Neckarhalde',
        house_number: '12',
        postal_code: '72070',
        city: 'Tuebingen',
        reference: null,
      },
      patient: { name: 'Tina Training', date_of_birth: null },
      invoice_number: 'TR-2026-0004',
      issued_on: '2026-10-01',
      treatment_bases: [],
      items: [
        {
          performed_on: '2026-10-01',
          code: 'TP6',
          label: LANG,
          item_kind: 'training_package',
          quantity: 1,
          unit_price_cents: 72000,
          line_total_cents: 72000,
          currency: 'EUR',
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          session_fee: false,
          period_until: '2027-03-31',
        },
      ],
      tax_groups: [
        {
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          exemption_reason: null,
          gross_cents: 72000,
          tax_cents: 11496,
          net_cents: 60504,
        },
      ],
      totals: { total_cents: 72000, tax_total_cents: 11496 },
    },
  ),
);

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const start =
  seite === 'blatt'
    ? `/abrechnung/rechnungen/${RECHNUNG}/blatt`
    : seite === 'preisliste'
      ? '/abrechnung/katalog'
      : '/training';

const router = createMemoryRouter(
  [
    { path: '/training', element: rahmen(<Trainingspaket verhaeltnisId={TINA} />) },
    { path: '/abrechnung/katalog', element: rahmen(<CatalogPage user={nutzer} />) },
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
