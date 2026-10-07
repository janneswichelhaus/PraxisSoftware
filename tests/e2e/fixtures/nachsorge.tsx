import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import type { Leistung } from '@/features/billing/api';
import { InvoicePrintPage } from '@/features/billing/InvoicePrintPage';
import { Nachsorgeabo } from '@/features/billing/Nachsorgeabo';
import {
  FAELLIGE_MONATE_SCHLUESSEL,
  nachsorgeSchluessel,
  type FaelligerMonat,
  type Nachsorgesicht,
} from '@/features/billing/nachsorge-api';
import { ServicesPage } from '@/features/billing/ServicesPage';
import { rechnungsansicht } from '@/features/billing/testdaten';
import { AftercareCancellations } from '@/features/open-points/AftercareCancellations';
import { ABO_KUENDIGUNGEN_KEY } from '@/features/open-points/aftercare-cancellations-api';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `nachsorge.html` (ANG-EPIC-001).
 *
 * `?seite=akte` (Standard: laufendes Abo und ein beendetes in der Akte),
 * `?seite=anlegen` (Versorgung abgeschlossen, noch kein Abo),
 * `?seite=leistungen` (fällige Abo-Monate und ein erfasster),
 * `?seite=blatt` (Rechnung über einen Abo-Monat mit Zeitraum und Steuer) und
 * `?seite=offen` (Kündigung über die Plattform in Offene Punkte). Die Daten
 * liegen vorab im Cache; gesprochen wird mit keinem Server. Alles ist
 * synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'akte';

const ERIKA = '66666666-6666-4666-8666-000000000002';
const RECHNUNG = 'dddddddd-dddd-4ddd-8ddd-0000000000a1';

const laufend: Nachsorgesicht = {
  today: '2026-10-07',
  earliest_start: '2026-04-30',
  subscriptions: [
    {
      id: 'a2',
      starts_on: '2026-09-05',
      ends_on: null,
      created_at: '2026-09-04T10:00:00Z',
      created_by_name: 'Olivia Office',
      cancelled_on: null,
      cancelled_via: null,
      cancelled_access_kind: null,
      cancelled_representative_name: null,
      current_month_end: '2026-11-04',
      next_month_start: '2026-11-05',
      recorded_months: 2,
      next_month_price_cents: 3900,
    },
    {
      id: 'a1',
      starts_on: '2026-05-01',
      ends_on: '2026-07-31',
      created_at: '2026-04-30T10:00:00Z',
      created_by_name: 'Olivia Office',
      cancelled_on: '2026-07-12',
      cancelled_via: 'platform',
      cancelled_access_kind: 'legal_representative',
      cancelled_representative_name: 'Bernd Betreuer-Langenscheidt',
      current_month_end: null,
      next_month_start: null,
      recorded_months: 3,
      next_month_price_cents: null,
    },
  ],
};

const ohneAbo: Nachsorgesicht = {
  today: '2026-10-07',
  earliest_start: '2026-10-02',
  subscriptions: [],
};

const monate: FaelligerMonat[] = [
  {
    subscription_id: 'a2',
    patient_id: ERIKA,
    patient_name: 'Erika Beispiel',
    month_start: '2026-10-05',
    month_end: '2026-11-04',
    unit_price_cents: 3900,
    currency: 'EUR',
    blocker: null,
  },
  {
    subscription_id: 'a3',
    patient_id: '66666666-6666-4666-8666-000000000001',
    patient_name: 'Maximilian Mustermann-Langenscheidt',
    month_start: '2026-10-01',
    month_end: '2026-10-31',
    unit_price_cents: 3900,
    currency: 'EUR',
    blocker: 'care_open',
  },
];

const erfasst: Leistung[] = [
  {
    id: 'l1',
    appointment_id: null,
    patient_id: ERIKA,
    training_relationship_id: null,
    service_area: 'therapy',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-05',
    code: 'NSA',
    label: 'Nachsorge-Abo (Monat)',
    item_kind: 'aftercare_month',
    quantity: 1,
    unit_price_cents: 3900,
    currency: 'EUR',
    tax_treatment: 'taxable',
    tax_rate_permille: 190,
    status: 'billable',
    session_fee: false,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(nachsorgeSchluessel(ERIKA), seite === 'anlegen' ? ohneAbo : laufend);
client.setQueryData(FAELLIGE_MONATE_SCHLUESSEL, monate);
client.setQueryData(['abrechnung-offene-termine'], []);
client.setQueryData(['abrechnung-leistungen'], erfasst);
client.setQueryData(ABO_KUENDIGUNGEN_KEY, [
  {
    subscription_id: 'a1',
    patient_id: ERIKA,
    given_name: 'Erika',
    family_name: 'Beispiel',
    cancelled_on: '2026-10-06',
    ends_on: '2026-11-04',
    cancelled_access_kind: 'self',
    cancelled_representative_name: null,
  },
]);
client.setQueryData(
  ['rechnung', RECHNUNG],
  rechnungsansicht(
    {
      id: RECHNUNG,
      status: 'issued',
      invoice_number: 'RG-2026-0012',
      issued_on: '2026-09-06',
      due_on: '2026-09-20',
      outstanding_cents: 3900,
    },
    {
      schema_version: 5,
      period_month: '2026-09-01',
      service_period: { from: '2026-09-05', to: '2026-10-04' },
      service_area: 'therapy',
      invoice_number: 'RG-2026-0012',
      issued_on: '2026-09-06',
      treatment_bases: [],
      items: [
        {
          performed_on: '2026-09-05',
          code: 'NSA',
          label: 'Nachsorge-Abo (Monat)',
          item_kind: 'aftercare_month',
          quantity: 1,
          unit_price_cents: 3900,
          line_total_cents: 3900,
          currency: 'EUR',
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          session_fee: false,
          period_until: '2026-10-04',
        },
      ],
      tax_groups: [
        {
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          exemption_reason: null,
          gross_cents: 3900,
          tax_cents: 623,
          net_cents: 3277,
        },
      ],
      totals: { total_cents: 3900, tax_total_cents: 623 },
    },
  ),
);

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const start =
  seite === 'leistungen'
    ? '/abrechnung/leistungen'
    : seite === 'blatt'
      ? `/abrechnung/rechnungen/${RECHNUNG}/blatt`
      : seite === 'offen'
        ? '/offen'
        : '/akte';

const router = createMemoryRouter(
  [
    {
      path: '/akte',
      element: rahmen(
        <Section titel="Verwaltung" rahmen>
          <Nachsorgeabo patientId={ERIKA} />
        </Section>,
      ),
    },
    { path: '/abrechnung/leistungen', element: rahmen(<ServicesPage />) },
    { path: '/abrechnung/rechnungen/:invoiceId/blatt', element: <InvoicePrintPage /> },
    { path: '/offen', element: rahmen(<AftercareCancellations />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [start] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
