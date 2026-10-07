import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { SessionContext } from '@/features/auth/sessionContext';
import type {
  Vertretung,
  Plattformzugang as ZugangDerPraxis,
} from '@/features/platform-access/api';
import { EinladungVorOrt, PlattformAbschnitt } from '@/features/platform-access/PlattformAbschnitt';
import {
  aboSchluessel,
  angeboteSchluessel,
  befundbogenSchluessel,
  dokumenteSchluessel,
  einstiegSchluessel,
  einwilligungenSchluessel,
  paketeSchluessel,
  rechnungSchluessel,
  rechnungenSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type Dokument,
  type Einwilligung,
  type MeinPaket,
  type Nachsorgeabo,
  type Paketangebote,
  type Plattformzugang,
  type Rechnungsblatt,
  type Rechnungszeile,
  type Termin,
  type Terminwunsch,
} from '@/features/platform/api';
import { EinladungPage } from '@/features/platform/EinladungPage';
import { PlattformApp } from '@/features/platform/PlattformApp';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `plattform.html` (POR-EPIC-001).
 *
 * `?seite=abschnitt` (Standard, ohne Zugang), `abschnitt-aktiv`, `qr`,
 * `einladung` (mit `#code=…`), `geruest` (zwei Bereiche), `ich`,
 * `gesperrt`; seit POR-EPIC-001b `handeln-fuer` (eigener Bereich und eine
 * Begleitung). `abschnitt-aktiv` und `ich` zeigen Vertretungen. Seit
 * POR-EPIC-002: `termine`, `wunsch`, `termin`, `rechnungen`, `rechnung`,
 * `dokumente`, `befundbogen`; die Übersicht (`geruest`) trägt Befundbogen,
 * nächsten Termin und offene Rechnung. Seit POR-EPIC-003 `einwilligungen`,
 * `daten`, `einstellungen`, `einstieg` (Einstieg steht aus) und
 * `ende` (Lesefrist vorbei, „Ich"). Seit ANG-EPIC-001 `abo` (laufendes
 * Nachsorge-Abo mit Kündigungsknopf) und `abo-gekuendigt` (Übersicht nach
 * der Kündigung). Seit ANG-EPIC-002 `paket` (laufendes Trainingspaket mit
 * Preisen) und `preise` (Preise ohne Paket). Die Daten liegen vorab im Cache;
 * gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'abschnitt';

const MAX = '66666666-6666-4666-8666-000000000001';

const ohneZugang: ZugangDerPraxis = {
  id: null,
  status: null,
  created_at: null,
  activated_at: null,
  locked_at: null,
  revoked_at: null,
  revoked_reason: null,
  invitation_id: null,
  invitation_purpose: null,
  invitation_channel: null,
  invitation_expires_at: null,
  invitation_sent_at: null,
  relationship_email: 'maximilian.mustermann-mit-langer-adresse@patient.invalid',
  ended_at: null,
};

const aktiv: ZugangDerPraxis = {
  ...ohneZugang,
  id: 'cafecafe-cafe-4afe-8afe-000000000009',
  status: 'active',
  created_at: '2026-09-28T08:00:00+00:00',
  activated_at: '2026-09-28T08:05:00+00:00',
  invitation_id: '99999999-9999-4999-8999-0000000000e1',
  invitation_purpose: 'reset',
  invitation_channel: 'on_site',
  invitation_expires_at: '2026-10-12T08:00:00+00:00',
};

const zugaenge: Plattformzugang[] = [
  {
    access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
    organization_name: 'Test Praxis Tuebingen',
    relationship_kind: 'treatment',
    status: 'active',
    readable: true,
    read_until: null,
    access_kind: 'self',
    represented_name: null,
  },
  {
    access_id: 'cafecafe-cafe-4afe-8afe-000000000003',
    organization_name: 'Test Praxis Tuebingen',
    relationship_kind: 'training',
    status: 'active',
    readable: true,
    read_until: null,
    access_kind: 'self',
    represented_name: null,
  },
];

/** POR-005: eine aktive Begleitung und eine eingeladene Betreuung. */
const vertretungen: Vertretung[] = [
  {
    id: 'cafecafe-cafe-4afe-8afe-000000000004',
    access_kind: 'companion',
    legal_basis: null,
    representative_name: 'Paula Mustermann-Langenscheidt',
    status: 'active',
    created_at: '2026-10-01T08:00:00+00:00',
    activated_at: '2026-10-01T08:05:00+00:00',
    locked_at: null,
    revoked_at: null,
    revoked_reason: null,
    proof_documents: ['identity_document'],
    health_scope: null,
    finance_scope: false,
    proof_recorded_at: '2026-10-01T08:00:00+00:00',
    proof_recorded_by_name: 'Olivia Office',
    consent_recorded_at: '2026-10-01T08:00:00+00:00',
    consent_earlier_messages: false,
    invitation_purpose: null,
    invitation_expires_at: null,
    ended_at: null,
  },
  {
    id: 'cafecafe-cafe-4afe-8afe-000000000005',
    access_kind: 'legal_representative',
    legal_basis: 'guardianship',
    representative_name: 'Bernd Betreuer',
    status: 'invited',
    created_at: '2026-10-02T08:00:00+00:00',
    activated_at: null,
    locked_at: null,
    revoked_at: null,
    revoked_reason: null,
    proof_documents: ['guardianship_certificate', 'identity_document'],
    health_scope: true,
    finance_scope: false,
    proof_recorded_at: '2026-10-02T08:00:00+00:00',
    proof_recorded_by_name: 'Olivia Office',
    consent_recorded_at: null,
    consent_earlier_messages: null,
    invitation_purpose: 'activate',
    invitation_expires_at: '2026-10-16T08:00:00+00:00',
    ended_at: null,
  },
];

/** POR-006: Erika mit eigenem Bereich, dazu begleitet sie Max. */
const begleitung: Plattformzugang = {
  ...zugaenge[0]!,
  access_id: 'cafecafe-cafe-4afe-8afe-000000000004',
  access_kind: 'companion',
  represented_name: 'Maximilian Mustermann-Langenscheidt',
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(
  ['platform-access', 'treatment', MAX],
  seite === 'abschnitt-aktiv' ? aktiv : ohneZugang,
);
client.setQueryData(
  ['platform-representations', 'treatment', MAX],
  seite === 'abschnitt-aktiv' ? vertretungen : [],
);
// POR-007: unter „Ich" für Erikas Behandlung eine Begleitung und eine Betreuung.
client.setQueryData(
  ['platform-representatives', zugaenge[0]!.access_id],
  [
    {
      access_id: vertretungen[0]!.id,
      access_kind: 'companion',
      legal_basis: null,
      representative_name: 'Paula Mustermann-Langenscheidt',
      status: 'active',
      since: '2026-10-01T08:05:00+00:00',
      can_end: true,
    },
    {
      access_id: vertretungen[1]!.id,
      access_kind: 'legal_representative',
      legal_basis: 'guardianship',
      representative_name: 'Bernd Betreuer',
      status: 'invited',
      since: '2026-10-02T08:00:00+00:00',
      can_end: false,
    },
  ],
);
client.setQueryData(['platform-representatives', zugaenge[1]!.access_id], []);

// POR-EPIC-002: Termine, Wünsche, Rechnungen, Dokumente und der Befundbogen
// hinter Erikas Behandlungszugang; im Training nur ein Trainingstermin.
function inTagen(tage: number, stunde: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, minute, 0, 0);
  return d.toISOString();
}
const TERMIN_HAUSBESUCH = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f1';
const termine: Termin[] = [
  {
    id: TERMIN_HAUSBESUCH,
    starts_at: inTagen(3, 9, 30),
    ends_at: inTagen(3, 10, 30),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    late_notice: false,
    open_request_kind: null,
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2',
    starts_at: inTagen(10, 14),
    ends_at: inTagen(10, 15),
    appointment_type: 'practice',
    status: 'confirmed',
    staff_name: 'Jannes Test',
    location_name: 'Hauptstandort Tuebingen',
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    late_notice: false,
    open_request_kind: 'change',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f3',
    starts_at: inTagen(-7, 9),
    ends_at: inTagen(-7, 10),
    appointment_type: 'home_visit',
    status: 'completed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    late_notice: null,
    open_request_kind: null,
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f4',
    starts_at: inTagen(-21, 9),
    ends_at: inTagen(-21, 10),
    appointment_type: 'home_visit',
    status: 'cancelled',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    late_notice: null,
    open_request_kind: null,
  },
];
const wuensche: Terminwunsch[] = [
  {
    id: 'dddddddd-dddd-4ddd-8ddd-0000000000f1',
    kind: 'change',
    appointment_id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2',
    preferred_days: [inTagen(12, 12).slice(0, 10), inTagen(13, 12).slice(0, 10)],
    preferred_times: ['morning'],
    note: 'Lieber eine Woche später, wenn es geht.',
    status: 'open',
    created_at: inTagen(-1, 18),
    resolved_at: null,
    answer: null,
  },
  {
    id: 'dddddddd-dddd-4ddd-8ddd-0000000000f2',
    kind: 'new',
    appointment_id: null,
    preferred_days: [inTagen(-6, 12).slice(0, 10)],
    preferred_times: ['afternoon'],
    note: null,
    status: 'done',
    created_at: inTagen(-9, 18),
    resolved_at: inTagen(-8, 9),
    answer: 'Termin am Dienstag eingetragen – bis dann!',
  },
];
const RECHNUNG = 'ffffffff-ffff-4fff-8fff-0000000000f1';
const rechnungen: Rechnungszeile[] = [
  {
    id: RECHNUNG,
    invoice_number: 'RG-2026-0007',
    issued_on: inTagen(-12, 12).slice(0, 10),
    due_on: inTagen(2, 12).slice(0, 10),
    total_cents: 42000,
    currency: 'EUR',
    paid_cents: 0,
    outstanding_cents: 42000,
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    cancelled_on: null,
    recipient_kind: 'aid_authority',
    recipient_name: 'Beihilfestelle Tuebingen',
    service_from: inTagen(-40, 12).slice(0, 10),
    service_to: inTagen(-14, 12).slice(0, 10),
  },
  {
    id: 'ffffffff-ffff-4fff-8fff-0000000000f2',
    invoice_number: 'RG-2026-0003',
    issued_on: inTagen(-60, 12).slice(0, 10),
    due_on: inTagen(-46, 12).slice(0, 10),
    total_cents: 28000,
    currency: 'EUR',
    paid_cents: 28000,
    outstanding_cents: 0,
    payment_state: 'paid',
    overdue: false,
    cancelled: false,
    cancelled_on: null,
    recipient_kind: 'self',
    recipient_name: 'Erika Beispiel',
    service_from: null,
    service_to: null,
  },
];
const blatt: Rechnungsblatt = {
  id: RECHNUNG,
  invoice_number: 'RG-2026-0007',
  issued_on: rechnungen[0]!.issued_on,
  due_on: rechnungen[0]!.due_on,
  paid_cents: 0,
  outstanding_cents: 42000,
  payment_state: 'unpaid',
  cancellation: null,
  replaces_invoice_number: null,
  correction_invoice_number: null,
  document: {
    schema_version: 5,
    currency: 'EUR',
    service_period: { from: rechnungen[0]!.service_from!, to: rechnungen[0]!.service_to! },
    period_month: `${rechnungen[0]!.service_from!.slice(0, 7)}-01`,
    issuer: {
      legal_name: 'Test Praxis Tuebingen',
      street: 'Praxisplatz',
      house_number: '1',
      postal_code: '72072',
      city: 'Tuebingen',
      tax_number: '86123/45678',
      iban: 'DE02120300000000202051',
      bank_name: 'Testbank',
      account_holder: 'Test Praxis Tuebingen',
    },
    recipient: {
      kind: 'aid_authority',
      name: 'Beihilfestelle Tuebingen',
      street: 'Amtsweg',
      house_number: '2',
      postal_code: '72070',
      city: 'Tuebingen',
    },
    patient: { name: 'Erika Beispiel', date_of_birth: '1961-04-12' },
    treatment_bases: [
      {
        kind: 'follow_up',
        issued_on: inTagen(-48, 12).slice(0, 10),
        prescriber: 'Dr. med. Petra Probst',
        diagnosis_icd10: 'M54.2',
        diagnosis: 'Zervikalsyndrom',
      },
    ],
    items: [0, 1, 2]
      .map((i) => ({
        performed_on: inTagen(-40 + i * 13, 12).slice(0, 10),
        code: 'KG',
        label: 'Krankengymnastik',
        item_kind: 'treatment',
        quantity: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
      }))
      .concat(
        [0, 1, 2].map((i) => ({
          performed_on: inTagen(-40 + i * 13, 12).slice(0, 10),
          code: 'HB',
          label: 'Hausbesuchspauschale',
          item_kind: 'treatment',
          quantity: 1,
          unit_price_cents: 4000,
          line_total_cents: 4000,
          currency: 'EUR',
          tax_treatment: 'exempt_healthcare',
          tax_rate_permille: 0,
        })),
      ),
    tax_groups: [
      {
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
        exemption_reason: 'Umsatzsteuerfrei nach § 4 Nr. 14 Buchst. a UStG (Heilbehandlung).',
        gross_cents: 42000,
        tax_cents: 0,
        net_cents: 42000,
      },
    ],
    totals: { total_cents: 42000, tax_total_cents: 0 },
  },
};
const dokumente: Dokument[] = [
  {
    id: 'abababab-abab-4bab-8bab-0000000000f1',
    document_type: 'arztbrief',
    display_name: 'Arztbrief_Orthopaedie_Dr_Beispiel_2026-09.pdf',
    mime_type: 'application/pdf',
    byte_size: 204_800,
    released_at: inTagen(-2, 10),
  },
  {
    id: 'abababab-abab-4bab-8bab-0000000000f2',
    document_type: 'klinisches_bild',
    display_name: 'Roentgen_Schulter.jpg',
    mime_type: 'image/jpeg',
    byte_size: 1_400_000,
    released_at: inTagen(-2, 10),
  },
];
for (const z of zugaenge) {
  const behandlung = z.relationship_kind === 'treatment';
  client.setQueryData(termineSchluessel(z.access_id), behandlung ? termine : [termine[1]!]);
  client.setQueryData(wuenscheSchluessel(z.access_id), behandlung ? wuensche : []);
  client.setQueryData(rechnungenSchluessel(z.access_id), behandlung ? rechnungen : []);
  client.setQueryData(dokumenteSchluessel(z.access_id), behandlung ? dokumente : []);
  client.setQueryData(befundbogenSchluessel(z.access_id), []);
}
client.setQueryData(rechnungSchluessel(zugaenge[0]!.access_id, RECHNUNG), blatt);
// POR-016 bis POR-019: Einwilligungen, Einstieg.
const einwilligungenBehandlung: Einwilligung[] = [
  {
    purpose: 'email_contact',
    state: 'granted',
    occurred_on: inTagen(-3, 12).slice(0, 10),
    source: 'platform',
    can_grant: true,
  },
  { purpose: 'prescriber_report', state: 'open', occurred_on: null, source: null, can_grant: true },
  {
    purpose: 'patient_photos',
    state: 'refused',
    occurred_on: inTagen(-30, 12).slice(0, 10),
    source: 'practice',
    can_grant: true,
  },
];
client.setQueryData(einwilligungenSchluessel(zugaenge[0]!.access_id), einwilligungenBehandlung);
client.setQueryData(einwilligungenSchluessel(zugaenge[1]!.access_id), [
  {
    purpose: 'training_health_data',
    state: 'open',
    occurred_on: null,
    source: null,
    can_grant: true,
  },
]);
client.setQueryData(einstiegSchluessel(zugaenge[0]!.access_id), {
  pending: seite === 'einstieg',
  finished_at: null,
  skipped_at: seite === 'einstieg' ? null : inTagen(-5, 9),
});
client.setQueryData(einstiegSchluessel(zugaenge[1]!.access_id), {
  pending: false,
  finished_at: inTagen(-4, 9),
  skipped_at: null,
});
client.setQueryData(einstiegSchluessel(begleitung.access_id), {
  pending: false,
  finished_at: inTagen(-4, 9),
  skipped_at: null,
});
client.setQueryData(['platform-access-onboarding', aktiv.id], {
  finished_at: null,
  skipped_at: inTagen(-5, 9),
  skipped_by_name: 'Olivia Office',
});
// ANG-EPIC-001: das Nachsorge-Abo der Behandlung - laufend, oder gekündigt.
const abo: Nachsorgeabo = {
  id: 'abababab-abab-4bab-8bab-000000000001',
  starts_on: inTagen(-32, 0).slice(0, 10),
  ends_on: null,
  state: 'running',
  next_month_start: inTagen(-1, 0).slice(0, 10),
  next_month_price_cents: 3900,
  cancel_effective_on: inTagen(-2, 0).slice(0, 10),
  cancelled_at: null,
  cancelled_via: null,
  can_cancel: true,
};
client.setQueryData(
  aboSchluessel(zugaenge[0]!.access_id),
  seite === 'abo-gekuendigt'
    ? {
        ...abo,
        state: 'ending',
        ends_on: inTagen(27, 0).slice(0, 10),
        next_month_start: null,
        cancel_effective_on: null,
        cancelled_at: inTagen(-1, 9),
        cancelled_via: 'platform',
        can_cancel: false,
      }
    : abo,
);
client.setQueryData(aboSchluessel(begleitung.access_id), null);
// ANG-EPIC-002: das Trainingspaket und die Preise im Training.
const paket: MeinPaket = {
  label: 'Trainingspaket 6 Monate (eine Einheit je Woche, Plattform inklusive)',
  package_months: 6,
  price_cents: 72000,
  currency: 'EUR',
  starts_on: inTagen(-20, 0).slice(0, 10),
  ends_on: inTagen(160, 0).slice(0, 10),
  state: 'running',
};
const angebote: Paketangebote = {
  vat_included: true,
  offers: [
    {
      code: 'TP3',
      label: 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)',
      package_months: 3,
      price_cents: 39000,
      currency: 'EUR',
      tax_rate_permille: 190,
    },
    {
      code: 'TP6',
      label: 'Trainingspaket 6 Monate (eine Einheit je Woche, Plattform inklusive)',
      package_months: 6,
      price_cents: 72000,
      currency: 'EUR',
      tax_rate_permille: 190,
    },
  ],
};
client.setQueryData(paketeSchluessel(zugaenge[1]!.access_id), seite === 'paket' ? [paket] : []);
client.setQueryData(angeboteSchluessel(zugaenge[1]!.access_id), angebote);
client.setQueryData(termineSchluessel(begleitung.access_id), [termine[0]!]);
client.setQueryData(wuenscheSchluessel(begleitung.access_id), []);
client.setQueryData(rechnungenSchluessel(begleitung.access_id), []);
client.setQueryData(befundbogenSchluessel(begleitung.access_id), []);

const sitzung = {
  session: null,
  initialising: false,
  signOut: () => Promise.resolve(),
};

function praxisrahmen(inhalt: ReactNode): ReactNode {
  return <div className="mx-auto max-w-2xl px-5 py-6">{inhalt}</div>;
}

function inhalt(): { pfad: string; element: ReactNode } {
  switch (seite) {
    case 'abschnitt-aktiv':
    case 'abschnitt':
      return {
        pfad: '/',
        element: praxisrahmen(
          <PlattformAbschnitt
            art="treatment"
            verhaeltnisId={MAX}
            darfVerwalten
            zeitzone="Europe/Berlin"
            praxis="Test Praxis Tuebingen"
          />,
        ),
      };
    case 'qr':
      return {
        pfad: '/',
        element: praxisrahmen(
          <EinladungVorOrt
            einladung={{
              access_id: 'cafecafe-cafe-4afe-8afe-000000000009',
              invitation_id: '99999999-9999-4999-8999-0000000000e1',
              purpose: 'activate',
              code: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
              expires_at: '2026-10-14T08:00:00+00:00',
            }}
            onFertig={() => undefined}
          />,
        ),
      };
    case 'einladung':
      return { pfad: '/einladung', element: <EinladungPage /> };
    case 'ich':
      return {
        pfad: '/p/ich',
        element: (
          <PlattformApp
            zugaenge={zugaenge}
            email="erika.plattform-mit-langer-adresse@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'handeln-fuer':
      return {
        pfad: `/p?zugang=${begleitung.access_id}`,
        element: (
          <PlattformApp
            zugaenge={[zugaenge[0]!, begleitung]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'einwilligungen':
    case 'daten':
    case 'einstellungen':
    case 'einstieg':
    case 'termine':
    case 'wunsch':
    case 'termin':
    case 'rechnungen':
    case 'rechnung':
    case 'dokumente':
    case 'befundbogen':
    case 'paket':
    case 'preise':
    case 'abo': {
      const pfade: Record<string, string> = {
        abo: '/p/abo?bereich=treatment',
        paket: '/p/paket?bereich=training',
        preise: '/p/paket?bereich=training',
        termine: '/p/termine?bereich=treatment',
        wunsch: '/p/termine/wunsch?bereich=treatment',
        termin: `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment`,
        rechnungen: '/p/rechnungen?bereich=treatment',
        rechnung: `/p/rechnungen/${RECHNUNG}?bereich=treatment`,
        dokumente: '/p/dokumente?bereich=treatment',
        befundbogen: '/p/befundbogen?bereich=treatment',
        einwilligungen: '/p/einwilligungen?bereich=treatment',
        daten: '/p/daten?bereich=treatment',
        einstellungen: '/p/einstellungen',
        einstieg: '/p?bereich=treatment',
      };
      return {
        pfad: pfade[seite]!,
        element: (
          <PlattformApp
            zugaenge={zugaenge}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    }
    case 'ende':
      return {
        pfad: '/p/ich',
        element: (
          <PlattformApp
            zugaenge={[{ ...zugaenge[0]!, readable: false, read_until: inTagen(-2, 12) }]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'abo-gekuendigt':
      return {
        pfad: '/p?bereich=treatment',
        element: (
          <PlattformApp
            zugaenge={[{ ...zugaenge[0]!, read_until: inTagen(58, 0) }]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'gesperrt':
      return {
        pfad: '/p',
        element: (
          <PlattformApp
            zugaenge={[{ ...zugaenge[1]!, status: 'locked', readable: false }]}
            email="tina.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    default:
      return {
        pfad: '/p',
        element: (
          <PlattformApp
            zugaenge={zugaenge}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
  }
}

const { pfad, element } = inhalt();
const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [pfad] });

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <SessionContext.Provider value={sitzung}>
      <RouterProvider router={router} />
    </SessionContext.Provider>
  </QueryClientProvider>,
);
