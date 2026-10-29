import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { SessionContext } from '@/features/core/auth/sessionContext';
import type {
  Vertretung,
  Plattformzugang as ZugangDerPraxis,
} from '@/features/portal/platform-access/api';
import {
  EinladungVorOrt,
  PlattformAbschnitt,
} from '@/features/portal/platform-access/PlattformAbschnitt';
import {
  aboSchluessel,
  angeboteSchluessel,
  benachrichtigungSchluessel,
  befundbogenSchluessel,
  plaeneSchluessel,
  checkinsSchluessel,
  gewohnheitenSchluessel,
  dokumenteSchluessel,
  nachrichtenSchluessel,
  einstiegSchluessel,
  einwilligungenSchluessel,
  ernaehrungSchluessel,
  paketeSchluessel,
  rechnungSchluessel,
  rechnungenSchluessel,
  tagebuchSchluessel,
  termineSchluessel,
  trainingsangebotSchluessel,
  vertragSchluessel,
  wuenscheSchluessel,
  type Dokument,
  type EigeneCheckins,
  type EigeneErnaehrung,
  type EigeneGewohnheiten,
  type EigenesTagebuch,
  type EigenePlaene,
  type Nachrichten,
  type Einwilligung,
  type MeinPaket,
  type Nachsorgeabo,
  type Paketangebote,
  type Plattformzugang,
  type Rechnungsblatt,
  type Rechnungszeile,
  type Termin,
  type Terminwunsch,
  type Trainingsangebot,
  type Trainingsvertrag,
} from '@/features/portal/platform/api';
import { EinladungPage } from '@/features/portal/platform/EinladungPage';
import { checkinsKey, type CheckinDaten } from '@/features/exercise/checkins/api';
import { ZwischenDenTerminen } from '@/features/exercise/checkins/ZwischenDenTerminen';
import { TrainingAssessments } from '@/features/training/TrainingAssessments';
import { assessmentsKey, type Assessmentsicht } from '@/features/training/assessments-api';
import {
  PASSKEYS_SCHLUESSEL,
  PIN_SCHLUESSEL,
} from '@/features/core/auth/einrichtung/AnmeldungVerwalten';
import { PlattformApp } from '@/features/portal/platform/PlattformApp';
import '@/index.css';

/**
 * Prüfseite aus `plattform.html`: `?seite=` wählt die Ansicht (die Fälle von `seite` unten),
 * `&kurzfristig` legt den Hausbesuch in die nächsten 24 Stunden. Die Daten liegen vorab im Cache;
 * was eine Seite sendet, beantwortet der Test über abgefangene Anfragen. Alles ist synthetisch.
 */
const parameter = new URLSearchParams(window.location.search);
const seite = parameter.get('seite') ?? 'abschnitt';
const kurzfristig = parameter.has('kurzfristig');

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
    own_name: 'Erika Beispiel',
    // `&ohne-nummer`: Die Praxis hat keine Rufnummer hinterlegt.
    practice_phone: parameter.has('ohne-nummer') ? null : '+49 7071 0000000',
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
    own_name: 'Erika Beispiel',
    practice_phone: '+49 7071 0000000',
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
  // ANN-690: Eine Vertretung trägt ihren eigenen Namen, nie den der Person.
  own_name: 'Paula Mustermann-Langenscheidt',
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
// SEC-EPIC-002: Passkeys und PIN in den Einstellungen - ein Passkey, PIN gesetzt.
client.setQueryData(PASSKEYS_SCHLUESSEL, [
  {
    id: 'p1',
    name: 'iPhone',
    angelegtAm: '2026-10-10T08:00:00Z',
    zuletztAm: null,
    freigegeben: true,
  },
]);
client.setQueryData(PIN_SCHLUESSEL, true);

// POR-EPIC-002: Termine, Wünsche, Rechnungen, Dokumente und der Befundbogen
// hinter Erikas Behandlungszugang; im Training nur ein Trainingstermin.
function inTagen(tage: number, stunde: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, minute, 0, 0);
  return d.toISOString();
}
function inStunden(stunden: number): string {
  return new Date(Date.now() + stunden * 60 * 60 * 1000).toISOString();
}
const TERMIN_HAUSBESUCH = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f1';
const termine: Termin[] = [
  {
    id: TERMIN_HAUSBESUCH,
    starts_at: kurzfristig ? inStunden(20) : inTagen(3, 9, 30),
    ends_at: kurzfristig ? inStunden(21) : inTagen(3, 10, 30),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    // Gerechnet hat das in der Anwendung der Server (ADR-018 Punkt 8).
    late_notice: kurzfristig,
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
// Schritt 1e: In der Lesefrist liegt die Behandlung hinter der Person -
// zwei Termine, der erste vor neun Wochen, der letzte vor neun Tagen.
const vergangeneTermine: Termin[] = [
  {
    ...termine[0]!,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000e1',
    starts_at: inTagen(-63, 9, 30),
    ends_at: inTagen(-63, 10, 30),
    status: 'completed',
    late_notice: null,
  },
  {
    ...termine[0]!,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000e2',
    starts_at: inTagen(-9, 9, 30),
    ends_at: inTagen(-9, 10, 30),
    status: 'completed',
    late_notice: null,
  },
];
// Die Termine der Behandlung je Lage der Liste.
function termineDerBehandlung(): Termin[] {
  switch (seite) {
    case 'uebersicht-lesefrist':
    case 'termine-lesefrist':
    case 'termine-leer':
      return vergangeneTermine;
    case 'termine-nur-wunsch':
      return [];
    case 'termine-heute':
      return termine.map((t) =>
        t.id === TERMIN_HAUSBESUCH ? { ...t, starts_at: inStunden(2), ends_at: inStunden(3) } : t,
      );
    case 'termine-absage-angefragt':
      return termine.map((t) =>
        t.id === TERMIN_HAUSBESUCH ? { ...t, open_request_kind: 'cancel' as const } : t,
      );
    default:
      return termine;
  }
}
function wuenscheDerBehandlung(): Terminwunsch[] {
  if (seite === 'termine-leer' || seite === 'termine-lesefrist') return [];
  if (seite === 'termine-absage-angefragt') {
    return [
      {
        ...wuensche[0]!,
        id: 'dddddddd-dddd-4ddd-8ddd-0000000000f4',
        kind: 'cancel',
        appointment_id: TERMIN_HAUSBESUCH,
        preferred_days: [],
        preferred_times: [],
        note: null,
        created_at: inTagen(0, 7),
      },
      ...wuensche,
    ];
  }
  if (seite === 'termine-nur-wunsch') {
    return [
      {
        ...wuensche[1]!,
        id: 'dddddddd-dddd-4ddd-8ddd-0000000000f3',
        preferred_days: [inTagen(4, 12).slice(0, 10), inTagen(6, 12).slice(0, 10)],
        preferred_times: ['morning'],
        status: 'open',
        created_at: inTagen(0, 7),
        resolved_at: null,
        answer: null,
      },
    ];
  }
  return wuensche;
}
// Im Training zwei Termine in der Praxis und einer per Video: Unter dem
// Hero stehen Zeilen mit dem Zeichen „Training“ und „Video“.
const trainingstermine: Termin[] = [
  termine[1]!,
  {
    ...termine[1]!,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f5',
    starts_at: inTagen(12, 17),
    ends_at: inTagen(12, 18),
    appointment_type: 'video',
    staff_name: 'Tom Training',
    location_name: null,
    open_request_kind: null,
  },
  {
    ...termine[1]!,
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f6',
    starts_at: inTagen(17, 17),
    ends_at: inTagen(17, 18),
    staff_name: 'Tom Training',
    open_request_kind: null,
  },
];
for (const z of zugaenge) {
  const behandlung = z.relationship_kind === 'treatment';
  client.setQueryData(
    termineSchluessel(z.access_id),
    behandlung
      ? termineDerBehandlung()
      : seite === 'termine-training'
        ? trainingstermine
        : [termine[1]!],
  );
  client.setQueryData(wuenscheSchluessel(z.access_id), behandlung ? wuenscheDerBehandlung() : []);
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
// DRP-017: Der Einstieg fragt nur Offenes - dort sind beide noch offen.
const einstieg = seite.startsWith('einstieg');
client.setQueryData(
  einwilligungenSchluessel(zugaenge[0]!.access_id),
  einstieg
    ? einwilligungenBehandlung.map((e) =>
        e.purpose === 'email_contact'
          ? { ...e, state: 'open' as const, occurred_on: null, source: null }
          : e,
      )
    : einwilligungenBehandlung,
);
// DRP-019: „Alles bereit“ fragt nach den Übungen für heute - hier ohne Plan.
if (einstieg) {
  client.setQueryData(plaeneSchluessel(zugaenge[0]!.access_id), {
    today: inTagen(0, 0).slice(0, 10),
    plans: [],
  });
}
client.setQueryData(einwilligungenSchluessel(zugaenge[1]!.access_id), [
  {
    purpose: 'training_health_data',
    state: 'open',
    occurred_on: null,
    source: null,
    can_grant: true,
  },
]);
const eigenerEinstieg = seite === 'einstieg' || seite === 'einstieg-eingerichtet';
client.setQueryData(einstiegSchluessel(zugaenge[0]!.access_id), {
  pending: eigenerEinstieg,
  finished_at: null,
  skipped_at: eigenerEinstieg ? null : inTagen(-5, 9),
});
client.setQueryData(einstiegSchluessel(zugaenge[1]!.access_id), {
  pending: false,
  finished_at: inTagen(-4, 9),
  skipped_at: null,
});
client.setQueryData(einstiegSchluessel(begleitung.access_id), {
  pending: seite === 'einstieg-begleitung',
  finished_at: seite === 'einstieg-begleitung' ? null : inTagen(-4, 9),
  skipped_at: null,
});
// KOM-011: Benachrichtigungen unter „Ich → Einstellungen" und im Einstieg.
// `einstellungen`: Behandlung mit Mail für Termine, Training aus, die Praxis
// hat „Neuer Übungsplan" abgeschaltet. Kein Gerät eingetragen (kein Push im
// Prüfbrowser ohne VAPID-Schlüssel).
client.setQueryData(['push-endpoint'], null);
for (const z of [...zugaenge, begleitung]) {
  // Im Einstieg ist noch nichts gewählt (ADR-024 Punkt 15: von Anfang an aus).
  const behandlung = z.access_id === zugaenge[0]!.access_id && !einstieg;
  client.setQueryData(benachrichtigungSchluessel(z.access_id, null), {
    email_kinds: behandlung ? ['appointment_reminder', 'appointment_cancelled'] : [],
    push_kinds: [],
    quiet_from: 20,
    quiet_until: 8,
    chosen_at: behandlung ? inTagen(-2, 9) : null,
    disabled_kinds: ['plan_assigned'],
    device_registered: false,
  });
}
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
// Schritt 1e: In der Lesefrist läuft kein Abo mehr - mit laufendem Abo ist
// keine Lesefrist (ANN-274, `inLesefrist`).
client.setQueryData(
  aboSchluessel(zugaenge[0]!.access_id),
  seite === 'uebersicht-lesefrist' || seite === 'termine-lesefrist'
    ? null
    : seite === 'abo-gekuendigt'
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
client.setQueryData(
  paketeSchluessel(zugaenge[1]!.access_id),
  seite === 'paket' || seite === 'uebersicht-training' ? [paket] : [],
);
client.setQueryData(angeboteSchluessel(zugaenge[1]!.access_id), angebote);
// KND-EPIC-001: das Angebot aus der Akte und der eigene Vertrag im Training.
const trainingsangebot: Trainingsangebot = {
  id: 'abababab-abab-4bab-8bab-000000000020',
  label: 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)',
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  tax_rate_permille: 190,
  vat_included: true,
  starts_on: inTagen(seite === 'angebot-frueh' ? 5 : 20, 0).slice(0, 10),
  ends_on: inTagen(seite === 'angebot-frueh' ? 96 : 111, 0).slice(0, 10),
  valid_until: inTagen(seite === 'angebot-frueh' ? 5 : 14, 0).slice(0, 10),
  offered_on: inTagen(0, 0).slice(0, 10),
  handover_items: [
    { title: 'Belastungsgrenzen', body: 'Kniebeuge bis 90 Grad, keine Sprünge bis Dezember.' },
    { title: 'Vorgeschichte', body: 'Vordere Kreuzbandplastik links im März.' },
  ],
  contact: {
    date_of_birth: '1963-09-17',
    street: 'Testweg',
    house_number: '7',
    postal_code: '72072',
    city: 'Tuebingen',
    phone: '+49 160 0000006',
    email: 'erika.beispiel@patient.invalid',
  },
  early_start: seite === 'angebot-frueh',
  withdrawal_days: 14,
  wording_version: '2026-10',
  blocker: seite === 'angebot-wartet' ? 'care_open' : null,
  can_accept: seite !== 'angebot-wartet',
  practice: {
    name: 'Test Praxis Tuebingen',
    street: 'Praxisweg',
    house_number: '1',
    postal_code: '72070',
    city: 'Tübingen',
    phone: '+49 7071 000000',
    email: 'praxis@praxis.invalid',
  },
};
client.setQueryData(
  trainingsangebotSchluessel(zugaenge[0]!.access_id),
  seite.startsWith('angebot') ? trainingsangebot : null,
);
const trainingsvertrag: Trainingsvertrag = {
  id: 'abababab-abab-4bab-8bab-000000000021',
  concluded_at: inTagen(-2, 10),
  label: trainingsangebot.label,
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  tax_rate_permille: 190,
  vat_included: true,
  starts_on: inTagen(18, 0).slice(0, 10),
  ends_on: inTagen(109, 0).slice(0, 10),
  offered_on: inTagen(-3, 0).slice(0, 10),
  wording_version: '2026-10',
  early_start_requested: false,
  contact_released: true,
  health_consent_granted: true,
  withdrawal_ends_on: inTagen(12, 0).slice(0, 10),
  released_titles: ['Belastungsgrenzen'],
  withdrawn_at: null,
  can_withdraw: true,
};
client.setQueryData(
  vertragSchluessel(zugaenge[1]!.access_id),
  seite === 'vertrag' ? trainingsvertrag : null,
);
// Der Besuch bei Maximilian - an seiner Anschrift, nicht an Erikas.
client.setQueryData(termineSchluessel(begleitung.access_id), [
  {
    ...termine[0]!,
    visit_street: 'Lindenweg',
    visit_house_number: '3',
    visit_postal_code: '72070',
    visit_city: 'Tübingen',
  },
]);
client.setQueryData(wuenscheSchluessel(begleitung.access_id), []);
client.setQueryData(rechnungenSchluessel(begleitung.access_id), []);
client.setQueryData(befundbogenSchluessel(begleitung.access_id), []);

// Schritt 1e (DR-126): Die Übersicht liest alle Bereiche in einem Zustand -
// eine Abfrage ohne Stand wäre hier ein Fehler. Nachrichten mit einer Antwort
// der Praxis in der Behandlung; im Training ein Plan für zu Hause; für die
// Begleitung nichts davon.
const beantwortet: Nachrichten['messages'][number] = {
  id: 'dededede-dede-4ede-8ede-0000000000a1',
  topic: 'exercise',
  reference_label: 'Mini-Kniebeuge mit Halt',
  status: 'answered',
  due_on: null,
  created_at: inTagen(-2, 18),
  last_entry_at: inTagen(-1, 9),
  closed_at: null,
  closed_by_side: null,
  entries: [
    {
      id: 'dededede-dede-4ede-8ede-0000000000b1',
      side: 'person',
      body: 'Darf ich die Kniebeuge auch abends machen?',
      created_at: inTagen(-2, 18),
      author: 'you',
      author_label: null,
    },
    {
      id: 'dededede-dede-4ede-8ede-0000000000b2',
      side: 'practice',
      body: 'Ja, gern - nur nicht direkt vor dem Schlafen.',
      created_at: inTagen(-1, 9),
      author: 'practice',
      author_label: null,
    },
  ],
  attachment_count: 0,
  attachments: [],
};
for (const z of [...zugaenge, begleitung]) {
  client.setQueryData(nachrichtenSchluessel(z.access_id), {
    response_workdays: 2,
    can_write: true,
    health_topics: true,
    messages: z === zugaenge[0] ? [beantwortet] : [],
  } satisfies Nachrichten);
}
const trainingsplan: EigenePlaene = {
  today: inTagen(0, 0).slice(0, 10),
  plans: [
    {
      id: 'aeaeaeae-aeae-4eae-8eae-0000000000f2',
      service_area: 'training',
      title: 'Kraft für zu Hause',
      status: 'assigned',
      sessions_per_week: 2,
      assigned_on: inTagen(-14, 0).slice(0, 10),
      runs_from: inTagen(-14, 0).slice(0, 10),
      runs_until: null,
      ended_on: null,
      can_exercise: true,
      note_allowed: true,
      open_session: null,
      can_choose_days: true,
      weekdays: [],
      recent_sessions: [],
      items: ['Kniebeuge', 'Ausfallschritt', 'Brücke'].map((name, i) => ({
        id: `aeaeaeae-aeae-4eae-8eae-0000000001${i}0`,
        position: i + 1,
        variant_lay_name: name,
        instruction: null,
        equipment: [],
        sets: 3,
        reps_min: 10,
        reps_max: 12,
        duration_seconds: null,
        hold_seconds: null,
        per_side: false,
        times_per_day: null,
        load: null,
        tempo: null,
        rest_seconds: 60,
        double_progression: false,
        note: null,
      })),
    },
  ],
};
client.setQueryData(plaeneSchluessel(zugaenge[1]!.access_id), trainingsplan);
// In der Behandlung Übungen für heute: jeder Tag ist Übungstag, noch nicht
// geübt (im Einstieg ohne Plan, siehe oben).
if (!einstieg) {
  client.setQueryData(plaeneSchluessel(zugaenge[0]!.access_id), {
    ...trainingsplan,
    plans: [
      {
        ...trainingsplan.plans[0]!,
        id: 'aeaeaeae-aeae-4eae-8eae-000000000001',
        service_area: 'therapy',
        title: 'Heimübungen Knie',
        weekdays: [1, 2, 3, 4, 5, 6, 7],
      },
    ],
  } satisfies EigenePlaene);
}
client.setQueryData(plaeneSchluessel(begleitung.access_id), {
  today: inTagen(0, 0).slice(0, 10),
  plans: [],
});
client.setQueryData(checkinsSchluessel(begleitung.access_id), null);
client.setQueryData(gewohnheitenSchluessel(begleitung.access_id), null);
// `termine-laden` und `termin-laden`: Die Termine laden ohne Ende; `termine-fehler` und
// `termin-fehler`: Sie scheitern, auch beim Erscheinen nicht noch einmal versucht.
if (seite === 'termine-laden' || seite === 'termin-laden') {
  client.removeQueries({ queryKey: termineSchluessel(zugaenge[0]!.access_id) });
  void client.prefetchQuery({
    queryKey: termineSchluessel(zugaenge[0]!.access_id),
    queryFn: () => new Promise<Termin[]>(() => undefined),
  });
}
if (seite === 'termine-fehler' || seite === 'termin-fehler') {
  client.removeQueries({ queryKey: termineSchluessel(zugaenge[0]!.access_id) });
  client.setQueryDefaults(termineSchluessel(zugaenge[0]!.access_id), { retryOnMount: false });
  void client.prefetchQuery({
    queryKey: termineSchluessel(zugaenge[0]!.access_id),
    queryFn: () => Promise.reject(new Error('Ihre Termine konnten nicht geladen werden.')),
  });
}
// `uebersicht-laden`: Die Nachrichten laden ohne Ende; `uebersicht-fehler`:
// Sie scheitern, auch beim Erscheinen nicht noch einmal versucht.
if (seite === 'uebersicht-laden') {
  client.removeQueries({ queryKey: nachrichtenSchluessel(zugaenge[0]!.access_id) });
  void client.prefetchQuery({
    queryKey: nachrichtenSchluessel(zugaenge[0]!.access_id),
    queryFn: () => new Promise<Nachrichten>(() => undefined),
  });
}
if (seite === 'uebersicht-fehler') {
  client.removeQueries({ queryKey: nachrichtenSchluessel(zugaenge[0]!.access_id) });
  client.setQueryDefaults(nachrichtenSchluessel(zugaenge[0]!.access_id), { retryOnMount: false });
  void client.prefetchQuery({
    queryKey: nachrichtenSchluessel(zugaenge[0]!.access_id),
    queryFn: () => Promise.reject(new Error('Ihre Nachrichten konnten nicht geladen werden.')),
  });
}

// Schritt 4c: Antworten je Thema des Fragebogens. `fragebogen-thema` öffnet mit einem Entwurf beim
// Thema `&thema=` (ohne Angabe 3), der Abschluss mit drei offenen Themen, gesendet vor zwei Tagen.
const BOGEN_ANTWORTEN: readonly Record<string, unknown>[] = [
  { beruf: { text: 'Lehrerin' }, sport_hobby: { text: 'Radfahren, Garten' } },
  {
    beschwerden_ort: {
      markierungen: [
        { x: 0.185, y: 0.19, bereich: 'schulter_rechts' },
        { x: 0.726, y: 0.147, bereich: 'nacken' },
      ],
    },
  },
  { schmerzen_aktuell: { auswahl: 'ja' }, schmerzstaerke: { wert: 4 } },
  {
    schmerzart: { auswahl: ['nachtschmerzen'] },
    beweglichkeit_veraendert: { auswahl: 'ja' },
    kraft_vermindert: { auswahl: 'nein' },
  },
  {
    merkmale: { auswahl: ['kribbeln'] },
    weitere_beschwerden: { text: 'Morgens steif im Nacken.' },
  },
  {
    beschwerden_seit: { text: 'Seit etwa drei Monaten' },
    beschwerden_zeitlich: { auswahl: 'mit_unterbrechungen' },
    beschwerden_verlauf: { auswahl: 'gleichbleibend' },
  },
  {
    verbessert_durch: { auswahl: ['gehen', 'ruhe'] },
    verschlechtert_durch: { auswahl: ['sitzen', 'sonstiges'], freitext: 'Lange Autofahrten' },
  },
  {
    schmerz_durchschnitt: { wert: 5 },
    unsicher_umgang: { auswahl: 'nein' },
    stark_gestoert: { auswahl: 'ja' },
    kurze_wege: { auswahl: 'nein' },
    mehrere_koerperteile: { auswahl: 'nein' },
    lange_anhalten: { auswahl: 'nein' },
    andere_gesundheitsprobleme: { auswahl: 'nein' },
    niedergeschlagen: { auswahl: 'nein' },
  },
  { aktivitaet_schaedlich: { auswahl: 'nein' }, seit_sechs_monaten: { auswahl: 'nein' } },
  {
    symptome_neurologisch: { auswahl: ['nein'] },
    symptome_organisch: { auswahl: ['nein'] },
    symptome_allgemein: { auswahl: ['nein'] },
  },
  {
    tumor: { auswahl: 'nein' },
    erkrankungen: { auswahl: ['nein'] },
    ereignisse: { auswahl: ['nein'] },
    wechseljahre_schwangerschaft: { auswahl: ['nein'] },
  },
  { medikamente: { auswahl: ['schmerzmittel'] } },
  {
    rauchen: { auswahl: 'nein' },
    ernaehrung: { auswahl: 'ja' },
    bewegung: { auswahl: 'ja' },
    krafttraining: { auswahl: 'nein' },
    schlaf: { auswahl: 'ja' },
    stress_arbeit: { wert: 3 },
    stress_alltag: { wert: 2 },
  },
  {
    bisherige_massnahmen: { auswahl: ['roentgen', 'physiotherapie'] },
    erwartungen_ziele: { text: 'Wieder ohne Schmerzen Rad fahren.' },
  },
];
function bogen(antworten: Record<string, unknown>, abgeschlossen = false) {
  return {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-0000000000c4',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: abgeschlossen ? 'abgeschlossen' : 'entwurf',
    recorded_on: inTagen(-2, 0).slice(0, 10),
    source: 'platform',
    answers: abgeschlossen ? null : antworten,
    updated_at: inTagen(-2, 10),
    completed_at: abgeschlossen ? inTagen(-2, 10) : null,
  };
}
if (seite === 'fragebogen-thema') {
  const bisher = BOGEN_ANTWORTEN.slice(0, Number(parameter.get('thema') ?? '3') - 1);
  client.setQueryData(befundbogenSchluessel(zugaenge[0]!.access_id), [
    bogen(Object.assign({}, ...bisher) as Record<string, unknown>),
  ]);
}
if (seite === 'fragebogen-abschluss' || seite === 'fragebogen-ohne-netz') {
  // Offen: 12 a und b, die Medikamente und 39.
  const beantwortet = [...BOGEN_ANTWORTEN.slice(0, 6), ...BOGEN_ANTWORTEN.slice(7, 11)];
  const antworten = Object.assign({}, ...beantwortet, BOGEN_ANTWORTEN[12], {
    bisherige_massnahmen: BOGEN_ANTWORTEN[13]!.bisherige_massnahmen,
  }) as Record<string, unknown>;
  client.setQueryData(befundbogenSchluessel(zugaenge[0]!.access_id), [bogen(antworten)]);
}
if (seite === 'fragebogen-ohne-netz') {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
}
if (seite === 'fragebogen-gesendet') {
  client.setQueryData(befundbogenSchluessel(zugaenge[0]!.access_id), [bogen({}, true)]);
}
if (seite === 'fragebogen-laden') {
  client.removeQueries({ queryKey: befundbogenSchluessel(zugaenge[0]!.access_id) });
  void client.prefetchQuery({
    queryKey: befundbogenSchluessel(zugaenge[0]!.access_id),
    queryFn: () => new Promise<never>(() => undefined),
  });
}
if (seite === 'fragebogen-ladefehler') {
  client.removeQueries({ queryKey: befundbogenSchluessel(zugaenge[0]!.access_id) });
  client.setQueryDefaults(befundbogenSchluessel(zugaenge[0]!.access_id), { retryOnMount: false });
  void client.prefetchQuery({
    queryKey: befundbogenSchluessel(zugaenge[0]!.access_id),
    queryFn: () => Promise.reject(new Error('Ihr Fragebogen konnte nicht geladen werden.')),
  });
}

// TRK-EPIC-001: Check-in der Behandlung, im Training keiner eingestellt.
const checkinVerlauf: EigeneCheckins['history'] = [
  {
    answered_on: inTagen(-7, 0).slice(0, 10),
    recorded_by_kind: 'self',
    values: {
      pain_rest: 3,
      pain_load: 6,
      daily_impairment: 4,
      pain_quality: 2,
      movement_confidence: 5,
      painkiller_24h: 0,
    },
  },
  {
    answered_on: inTagen(-14, 0).slice(0, 10),
    recorded_by_kind: 'legal_representative',
    values: { pain_rest: 5, daily_impairment: 6, pain_recovery_hours: 24, painkiller_24h: 1 },
  },
];
const checkinFaellig =
  seite === 'checkin' || seite === 'checkin-uebersicht' || seite === 'checkin-alltag';
// „Meine Angaben“: vier Antworten je Frage wie auf der Leinwand, und ganz ohne Antwort.
const angabenLeer = seite === 'angaben-leer';
const angabenVerlauf: EigeneCheckins['history'] = seite.startsWith('angaben')
  ? [
      ...checkinVerlauf,
      {
        answered_on: inTagen(-29, 0).slice(0, 10),
        recorded_by_kind: 'self',
        values: { pain_rest: 6, pain_load: 7, daily_impairment: 5 },
      },
      {
        answered_on: inTagen(-43, 0).slice(0, 10),
        recorded_by_kind: 'self',
        values: { pain_rest: 5, pain_load: 6, daily_impairment: 5 },
      },
    ]
  : checkinVerlauf;
client.setQueryData(checkinsSchluessel(zugaenge[0]!.access_id), {
  today: inTagen(0, 0).slice(0, 10),
  // ALT-001, ALT-002: Schlafdauer, Schmerzmittel bei Bedarf und die Belastung
  // außerhalb der Übungen (ANN-368, ANN-369).
  schedule:
    seite === 'checkin-alltag'
      ? {
          interval_days: 7,
          parameter_keys: [
            'pain_rest',
            'sleep_hours',
            'painkiller_days_7d',
            'activity_kind',
            'activity_minutes',
            'activity_intensity',
          ],
        }
      : { interval_days: 7, parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'] },
  due_on: checkinFaellig ? inTagen(0, 0).slice(0, 10) : inTagen(3, 0).slice(0, 10),
  due: checkinFaellig,
  can_answer: checkinFaellig,
  consent_needed: false,
  last_values: { pain_rest: 3, pain_load: 6, daily_impairment: 4 },
  history: angabenLeer ? [] : angabenVerlauf,
  // OUT-004: die eigenen Angaben nach den Übungen.
  session_history: angabenLeer
    ? []
    : [
        {
          performed_on: inTagen(-2, 0).slice(0, 10),
          plan_title: 'Heimprogramm Knie',
          recorded_by_kind: 'self',
          values: { session_exertion: 6, session_pain: 2, session_confidence: 7 },
        },
        {
          performed_on: inTagen(-5, 0).slice(0, 10),
          plan_title: 'Heimprogramm Knie',
          recorded_by_kind: 'self',
          values: { session_exertion: 5, session_confidence: 5 },
        },
      ],
} satisfies EigeneCheckins);
client.setQueryData(checkinsSchluessel(zugaenge[1]!.access_id), null);
// Schritt 4b: der Check-in als geführter Ablauf und seine Zustände (Handoff 5.1) - fällig in der
// Behandlung, im Training mit der Belastung oder ohne Einwilligung, in der Lesefrist ohne Abo, beim
// Laden und mit Fehler ohne Antwort des Servers.
if (['checkin-frage', 'checkin-letzte', 'checkin-ohne-netz'].includes(seite)) {
  client.setQueryData<EigeneCheckins | null>(checkinsSchluessel(zugaenge[0]!.access_id), (alt) =>
    alt ? { ...alt, due: true, can_answer: true, due_on: inTagen(0, 0).slice(0, 10) } : alt,
  );
}
if (seite === 'checkin-ohne-netz') {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
}
if (seite === 'checkin-training' || seite === 'checkin-einwilligung') {
  const darf = seite === 'checkin-training';
  client.setQueryData(checkinsSchluessel(zugaenge[1]!.access_id), {
    today: inTagen(0, 0).slice(0, 10),
    schedule: {
      interval_days: 7,
      parameter_keys: [
        'pain_rest',
        'pain_load',
        'daily_impairment',
        'activity_kind',
        'activity_minutes',
        'activity_intensity',
      ],
    },
    due_on: inTagen(0, 0).slice(0, 10),
    due: true,
    can_answer: darf,
    consent_needed: !darf,
    last_values: darf ? { pain_rest: 3, pain_load: 6, daily_impairment: 4 } : {},
    history: darf ? checkinVerlauf.slice(0, 1) : [],
    session_history: [],
  } satisfies EigeneCheckins);
}
if (seite === 'checkin-lesefrist') {
  client.setQueryData(aboSchluessel(zugaenge[0]!.access_id), null);
  client.setQueryData<EigeneCheckins | null>(checkinsSchluessel(zugaenge[0]!.access_id), (alt) =>
    alt ? { ...alt, due: true, can_answer: false } : alt,
  );
}
if (seite === 'checkin-laden' || seite === 'checkin-fehler') {
  const schluessel = checkinsSchluessel(zugaenge[0]!.access_id);
  client.removeQueries({ queryKey: schluessel });
  client.setQueryDefaults(schluessel, { retryOnMount: false });
  void client.prefetchQuery({
    queryKey: schluessel,
    queryFn: () =>
      seite === 'checkin-laden'
        ? new Promise<EigeneCheckins | null>(() => undefined)
        : Promise.reject(new Error('Ihr Check-in konnte nicht geladen werden.')),
  });
}
/**
 * `checkin-letzte`, `checkin-ohne-netz` und `checkin-training`: der Ablauf auf seiner letzten Seite
 * mit einer Antwort, vorgespult wie mit dem Finger - einen Zwischenstand kennt er nicht.
 */
const checkinAntwort: string | undefined = (
  { 'checkin-letzte': '3', 'checkin-ohne-netz': '3', 'checkin-training': 'Sport' } as Record<
    string,
    string
  >
)[seite];
if (checkinAntwort) void zurLetztenFrage(checkinAntwort);

async function zurLetztenFrage(antwort: string) {
  const knopf = (text: string) =>
    [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (k) => k.textContent === text,
    );
  async function warte<T>(finde: () => T | undefined): Promise<T> {
    for (;;) {
      const fund = finde();
      if (fund) return fund;
      await new Promise((weiter) => setTimeout(weiter, 50));
    }
  }
  // Nach jedem „Weiter“ steht ein neuer Fuß da; die Seite davor ist dann weg.
  let vorher: HTMLButtonElement | undefined;
  for (;;) {
    const ziel = await warte(() => {
      const fund = knopf('Weiter') ?? knopf('Angaben senden');
      return fund === vorher ? undefined : fund;
    });
    if (ziel.textContent === 'Angaben senden') break;
    vorher = ziel;
    ziel.click();
  }
  (await warte(() => knopf(antwort))).click();
}
// Eine laufende Gewohnheit mit Tagen, eine pausierte; `gewohnheiten-pausiert` andersherum,
// `gewohnheiten-leer` ohne Gewohnheit.
const gewohnheitPausiert = seite === 'gewohnheiten-pausiert';
client.setQueryData(gewohnheitenSchluessel(zugaenge[0]!.access_id), {
  today: inTagen(0, 0).slice(0, 10),
  mark_days: 7,
  can_mark: true,
  consent_needed: false,
  habits:
    seite === 'gewohnheiten-leer'
      ? []
      : [
          {
            id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000001',
            action: 'zwei Minuten Mobilität',
            cue: 'Nach dem Zähneputzen',
            place: 'im Bad',
            starts_on: inTagen(-20, 0).slice(0, 10),
            paused: gewohnheitPausiert,
            ended_at: null,
            marks: [0, -1, -2, -4, -5].map((t) => inTagen(t, 0).slice(0, 10)),
          },
          {
            id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000002',
            action: 'eine Treppe statt Aufzug',
            cue: 'Im Büro',
            place: null,
            starts_on: inTagen(-12, 0).slice(0, 10),
            paused: !gewohnheitPausiert,
            ended_at: null,
            marks: gewohnheitPausiert ? [-1, -3].map((t) => inTagen(t, 0).slice(0, 10)) : [],
          },
        ],
} satisfies EigeneGewohnheiten);
client.setQueryData(gewohnheitenSchluessel(zugaenge[1]!.access_id), null);
// `angaben-laden` und `gewohnheiten-laden`: Die Abfrage lädt ohne Ende, das Skelett bleibt stehen.
if (seite === 'angaben-laden') {
  client.removeQueries({ queryKey: checkinsSchluessel(zugaenge[0]!.access_id) });
  void client.prefetchQuery({
    queryKey: checkinsSchluessel(zugaenge[0]!.access_id),
    queryFn: () => new Promise<EigeneCheckins>(() => undefined),
  });
}
if (seite === 'gewohnheiten-laden') {
  client.removeQueries({ queryKey: gewohnheitenSchluessel(zugaenge[0]!.access_id) });
  void client.prefetchQuery({
    queryKey: gewohnheitenSchluessel(zugaenge[0]!.access_id),
    queryFn: () => new Promise<EigeneGewohnheiten>(() => undefined),
  });
}
// ERN-002: die laufende Ernährungsberatung an der Akte - die Projektion von
// `platform_nutrition` aus dem Seed (Erika), im Training keine.
client.setQueryData(ernaehrungSchluessel(zugaenge[0]!.access_id), {
  today: inTagen(0, 0).slice(0, 10),
  profile: {
    goal: 'lose',
    own_foods: [],
    consent: {
      state: 'granted',
      source: 'practice',
      occurred_on: '2026-09-27',
    },
    targets: {
      bmr: {
        kcal: 1309,
        formula: 'mifflin_st_jeor',
        averaged: false,
        variants: [
          {
            sex: 'female',
            kcal: 1309,
            terms: [
              {
                input: 'weight_kg',
                factor: 10,
              },
              {
                input: 'height_cm',
                factor: 6.25,
              },
              {
                input: 'age_years',
                factor: -5,
              },
            ],
            constant: -161,
          },
        ],
        lean_mass_kg: null,
      },
      fat: {
        g: 49,
        share: 0.3,
        computed_g: 49,
        kcal_per_g: 9,
        overridden: false,
      },
      tee: {
        pal: 1.4,
        kcal: 1833,
      },
      water: {
        ml: 2570,
        ml_per_kg: 35,
        minimum_ml: 1500,
        overridden: false,
        computed_ml: 2570,
        floor_applied: false,
      },
      energy: {
        kcal: 1466,
        rule: 'deficit_capped',
        below_bmr: false,
        overridden: false,
        change_kcal: -367,
        computed_kcal: 1466,
        floor_applied: false,
        deficit_max_kcal: 500,
        deficit_max_share: 0.2,
      },
      inputs: {
        pal: 1.4,
        sex: 'female',
        goal: 'lose',
        formula: 'standard',
        age_years: 63,
        height_cm: 168,
        weight_kg: 73.5,
        in_training: false,
        body_fat_percent: null,
      },
      status: 'ok',
      protein: {
        g: 59,
        basis: 'standard',
        g_per_kg: 0.8,
        computed_g: 59,
        kcal_per_g: 4,
        overridden: false,
      },
      carbohydrate: {
        g: 197,
        computed_g: 197,
        kcal_per_g: 4,
        overridden: false,
      },
      target_weight: {
        kg: 68.0,
        weeks: 15,
        floor_kg: 52.3,
        bmi_floor: 18.5,
        below_floor: false,
        kcal_per_kg: 7000,
      },
    },
    weights: [
      {
        source: 'practice',
        weight_kg: 73.5,
        measured_on: '2026-10-11',
      },
      {
        source: 'practice',
        weight_kg: 74.1,
        measured_on: '2026-10-04',
      },
      {
        source: 'practice',
        weight_kg: 74.6,
        measured_on: '2026-09-27',
      },
    ],
    ended_on: null,
    height_cm: 168,
    started_on: '2026-09-27',
    formula_sex: 'female',
    activity_pal: 1.4,
    // Schritt 4e: In den Ansichten der Ernährung ist das Tagebuch an, die Hero-Karte „Heute“ steht.
    diary_enabled: seite === 'ernaehrung' || seite === 'ernaehrung-ohne-netz',
    body_fat_percent: null,
    diary_changed_at: null,
    target_weight_kg: 68.0,
    target_weight_source: 'counsellor',
  },
  can_grant: false,
  can_write: true,
  wording_version: '2026-10',
  target_weight_floor_kg: 52.3,
} satisfies EigeneErnaehrung);
// Schritt 1e: im Training dieselbe Beratung mit Tagebuch (ADR-027 Punkt 1:
// je Person eine, hier am Trainingsverhältnis).
const beratung = client.getQueryData<EigeneErnaehrung>(
  ernaehrungSchluessel(zugaenge[0]!.access_id),
);
client.setQueryData(
  ernaehrungSchluessel(zugaenge[1]!.access_id),
  seite === 'uebersicht-training' && beratung
    ? { ...beratung, profile: { ...beratung.profile, diary_enabled: true } }
    : null,
);
if (seite === 'uebersicht-training') {
  client.setQueryData(ernaehrungSchluessel(zugaenge[0]!.access_id), null);
}
// Politurrunde 2026-10-20: das Tagebuch von heute - ein Frühstück, die übrigen
// Mahlzeiten leer, zwei Gläser Wasser (wie im Seed bei Erika). Schritt 4e: zwei
// Einträge wie in der Leinwand, Haferflocken unter „Zuletzt“ für das Eintragen.
const ohneSummen = { energy_kcal: 0, protein_g: 0, fat_g: 0, carbohydrate_g: 0 };
const haferflocken = {
  kind: 'catalog' as const,
  id: 'f00df00d-f00d-4f00-8f00-000000000001',
  source: 'bls' as const,
  name: 'Haferflocken',
  brand: null,
  base_unit: 'g' as const,
  per_100: {
    energy_kcal: 370,
    protein_g: 13.5,
    fat_g: 7,
    carbohydrate_g: 58.7,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [{ label: 'Portion', amount: 50 }],
};
const tagebuchHeute: EigenesTagebuch = {
  today: inTagen(0, 0).slice(0, 10),
  started_on: '2026-09-27',
  enabled: true,
  can_write: true,
  can_delete: true,
  glass_ml: 250,
  hide_numbers: false,
  recent: [{ food: haferflocken, amount: 50, portion_label: 'Portion', portion_count: 1 }],
  favorites: [],
  targets: { energy_kcal: 1466, protein_g: 59, fat_g: 49, carbohydrate_g: 197, water_ml: 2570 },
  day: {
    day: inTagen(0, 0).slice(0, 10),
    meals: [
      {
        meal: 'breakfast',
        entries: [
          {
            id: 'e1e1e1e1-e1e1-4e1e-8e1e-000000000001',
            eaten_on: inTagen(0, 0).slice(0, 10),
            meal: 'breakfast',
            food_kind: 'catalog',
            food_id: null,
            name: 'Haferflocken',
            brand: null,
            base_unit: 'g',
            amount: 50,
            portion_label: 'Portion',
            portion_amount: 50,
            portion_count: 1,
            energy_kcal: 185,
            protein_g: 6.7,
            fat_g: 3.5,
            carbohydrate_g: 29.3,
          },
          {
            id: 'e1e1e1e1-e1e1-4e1e-8e1e-000000000002',
            eaten_on: inTagen(0, 0).slice(0, 10),
            meal: 'breakfast',
            food_kind: 'catalog',
            food_id: null,
            name: 'Banane roh',
            brand: null,
            base_unit: 'g',
            amount: 120,
            portion_label: '1 Stück (mittel)',
            portion_amount: 120,
            portion_count: 1,
            energy_kcal: 112,
            protein_g: 1.4,
            fat_g: 0.2,
            carbohydrate_g: 25.3,
          },
        ],
        totals: { energy_kcal: 297, protein_g: 8.1, fat_g: 3.7, carbohydrate_g: 54.6 },
      },
      { meal: 'lunch', entries: [], totals: ohneSummen },
      { meal: 'dinner', entries: [], totals: ohneSummen },
      { meal: 'snack', entries: [], totals: ohneSummen },
    ],
    totals: { energy_kcal: 297, protein_g: 8.1, fat_g: 3.7, carbohydrate_g: 54.6 },
    water_ml: 500,
  },
};
client.setQueryData(tagebuchSchluessel(zugaenge[0]!.access_id, 'heute'), tagebuchHeute);
// Das Eintragen fragt den Tag aus der Adresse ab, hier ausdrücklich heute.
client.setQueryData(tagebuchSchluessel(zugaenge[0]!.access_id, tagebuchHeute.today), tagebuchHeute);
// `tagebuch-laden`: Der Tag lädt ohne Ende; `tagebuch-fehler`: Er scheitert, auch beim
// Erscheinen nicht noch einmal versucht; `tagebuch-ohne-netz`: Das Gerät meldet keine Verbindung.
if (seite === 'tagebuch-laden') {
  client.removeQueries({ queryKey: tagebuchSchluessel(zugaenge[0]!.access_id, 'heute') });
  void client.prefetchQuery({
    queryKey: tagebuchSchluessel(zugaenge[0]!.access_id, 'heute'),
    queryFn: () => new Promise<EigenesTagebuch>(() => undefined),
  });
}
if (seite === 'tagebuch-fehler') {
  client.removeQueries({ queryKey: tagebuchSchluessel(zugaenge[0]!.access_id, 'heute') });
  client.setQueryDefaults(tagebuchSchluessel(zugaenge[0]!.access_id, 'heute'), {
    retryOnMount: false,
  });
  void client.prefetchQuery({
    queryKey: tagebuchSchluessel(zugaenge[0]!.access_id, 'heute'),
    queryFn: () => Promise.reject(new Error('Ihr Tagebuch konnte nicht geladen werden.')),
  });
}
if (seite === 'tagebuch-ohne-netz' || seite === 'ernaehrung-ohne-netz') {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
}
// `tagebuch-eintragen-aus`: Das Tagebuch ist ausgeschaltet, das Eintragen zeigt den Weg zurück.
if (seite === 'tagebuch-eintragen-aus') {
  client.setQueryData(tagebuchSchluessel(zugaenge[0]!.access_id, tagebuchHeute.today), {
    ...tagebuchHeute,
    enabled: false,
    can_write: false,
  });
}
client.setQueryData(checkinsKey('treatment', MAX), {
  today: inTagen(0, 0).slice(0, 10),
  can_write: true,
  relationship_open: true,
  schedule: {
    interval_days: 7,
    parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'],
    starts_on: inTagen(-21, 0).slice(0, 10),
    due_on: inTagen(3, 0).slice(0, 10),
    updated_at: inTagen(-21, 9),
    updated_by_name: 'Anna Beispiel',
  },
  checkins: checkinVerlauf.map((c) => ({ ...c, recorded_at: `${c.answered_on}T07:00:00Z` })),
  time_zone: 'Europe/Berlin',
  sessions: [
    {
      performed_on: inTagen(-2, 0).slice(0, 10),
      finished_at: inTagen(-2, 18),
      plan_title: 'Heimprogramm Knie',
      recorded_by_kind: 'self',
      values: { session_exertion: 6, session_pain: 2, session_confidence: 7 },
    },
    {
      performed_on: inTagen(-5, 0).slice(0, 10),
      finished_at: inTagen(-5, 18),
      plan_title: 'Heimprogramm Knie',
      recorded_by_kind: 'self',
      values: { session_exertion: 5, session_confidence: 5 },
    },
  ],
  // OUT-001: ein Ereignis der Akte, ein Planwechsel, zwei Termine.
  events: [
    {
      id: 'dededede-dede-4ede-8ede-000000000001',
      occurred_on: inTagen(-4, 0).slice(0, 10),
      kind: 'erkrankung',
      note: 'Erkältung',
      created_at: inTagen(-4, 9),
      author_name: 'Anna Beispiel',
    },
  ],
  plan_events: [
    { occurred_on: inTagen(-9, 0).slice(0, 10), kind: 'plan_assigned', title: 'Heimprogramm Knie' },
  ],
  appointment_days: [inTagen(-8, 0).slice(0, 10), inTagen(-1, 0).slice(0, 10)],
  events_writable: false,
  health_consent: null,
  // ALT-003: eine laufende, eine pausierte, eine beendete Gewohnheit.
  habits: [
    {
      id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000001',
      action: 'zwei Minuten Mobilität',
      cue: 'Nach dem Zähneputzen',
      place: 'im Bad',
      starts_on: inTagen(-20, 0).slice(0, 10),
      created_at: inTagen(-20, 9),
      paused: false,
      paused_at: null,
      ended_at: null,
      marks: [0, -1, -2, -4, -5, -8, -9, -10, -13].map((t) => inTagen(t, 0).slice(0, 10)),
      marks_by_representative: [],
      paused_by_kind: null,
    },
    {
      id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000002',
      action: 'eine Treppe statt Aufzug',
      cue: 'Im Büro',
      place: null,
      starts_on: inTagen(-12, 0).slice(0, 10),
      created_at: inTagen(-12, 9),
      paused: true,
      paused_at: inTagen(-3, 18),
      ended_at: null,
      marks: [-6, -7, -11].map((t) => inTagen(t, 0).slice(0, 10)),
      marks_by_representative: [inTagen(-7, 0).slice(0, 10)],
      paused_by_kind: 'self',
    },
    {
      id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000003',
      action: 'Wasserflasche auf den Schreibtisch',
      cue: 'Morgens im Büro',
      place: null,
      starts_on: inTagen(-60, 0).slice(0, 10),
      created_at: inTagen(-60, 9),
      paused: false,
      paused_at: null,
      ended_at: inTagen(-30, 10),
      marks: [],
      marks_by_representative: [],
      paused_by_kind: null,
    },
  ],
  habits_max: 3,
  habits_writable: true,
} satisfies CheckinDaten);

// OUT-002: zwei Assessments derselben Testbatterie, eine Wiederholung geplant.
const TINA_TRAINING = 'eeeeeeee-eeee-4eee-8eee-000000000001';
client.setQueryData(assessmentsKey(TINA_TRAINING), {
  today: inTagen(0, 0).slice(0, 10),
  can_write: true,
  relationship_open: true,
  health_consent: true,
  assessments: [
    {
      id: 'abababab-abab-4bab-8bab-000000000002',
      title: 'Sprungtests Knie',
      performed_on: inTagen(0, 0).slice(0, 10),
      conditions: 'Halle, barfuß, 10 Minuten Rad zum Aufwärmen',
      next_due_on: inTagen(42, 0).slice(0, 10),
      created_by_name: 'Tom Trainingsbetreuung',
      results: [
        { label: 'Einbeinsprung weit', unit: 'cm', value: null, left: 120, right: 140 },
        { label: 'Dreifachsprung weit', unit: 'cm', value: null, left: 380, right: 425.5 },
        { label: 'Kniebeugen in 30 Sekunden', unit: null, value: 18, left: null, right: null },
      ],
    },
    {
      id: 'abababab-abab-4bab-8bab-000000000001',
      title: 'Sprungtests Knie',
      performed_on: inTagen(-42, 0).slice(0, 10),
      conditions: 'Halle, Schuhe, 10 Minuten Rad zum Aufwärmen',
      next_due_on: inTagen(0, 0).slice(0, 10),
      created_by_name: 'Tom Trainingsbetreuung',
      results: [
        { label: 'Einbeinsprung weit', unit: 'cm', value: null, left: 98, right: 141 },
        { label: 'Kniebeugen in 30 Sekunden', unit: null, value: 14, left: null, right: null },
      ],
    },
  ],
} satisfies Assessmentsicht);

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
    case 'zwischen':
      return {
        pfad: '/',
        element: praxisrahmen(<ZwischenDenTerminen art="treatment" verhaeltnisId={MAX} />),
      };
    case 'assessments':
      return {
        pfad: '/',
        element: praxisrahmen(<TrainingAssessments verhaeltnisId={TINA_TRAINING} />),
      };
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
    case 'einstieg-begleitung':
    case 'termine-begleitung':
      return {
        pfad:
          seite === 'termine-begleitung'
            ? `/p/termine?zugang=${begleitung.access_id}`
            : `/p?zugang=${begleitung.access_id}`,
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
    case 'einstieg-eingerichtet':
    case 'termine':
    case 'termine-heute':
    case 'termine-absage-angefragt':
    case 'termine-gesendet':
    case 'termine-leer':
    case 'termine-nur-wunsch':
    case 'termine-laden':
    case 'termine-fehler':
    case 'termine-training':
    case 'wunsch':
    case 'termin':
    case 'termin-angefragt':
    case 'termin-vergangen':
    case 'termin-abgesagt':
    case 'termin-laden':
    case 'termin-fehler':
    case 'termin-absagen':
    case 'termin-aendern':
    case 'rechnungen':
    case 'rechnung':
    case 'dokumente':
    case 'befundbogen':
    case 'paket':
    case 'preise':
    case 'abo':
    case 'angebot':
    case 'angebot-frueh':
    case 'angebot-wartet':
    case 'angebot-uebersicht':
    case 'checkin':
    case 'checkin-uebersicht':
    case 'checkin-danke':
    case 'checkin-alltag':
    case 'gewohnheiten':
    case 'ernaehrung':
    case 'ernaehrung-ohne-netz':
    case 'tagebuch':
    case 'tagebuch-laden':
    case 'tagebuch-fehler':
    case 'tagebuch-ohne-netz':
    case 'tagebuch-eintragen':
    case 'tagebuch-eintragen-aus':
    case 'lebensmittel':
    case 'lebensmittel-neu':
    case 'angaben':
    case 'angaben-frage':
    case 'angaben-frage-uebungen':
    case 'angaben-tabelle':
    case 'angaben-leer':
    case 'angaben-laden':
    case 'gewohnheiten-pausiert':
    case 'gewohnheiten-leer':
    case 'gewohnheiten-laden':
    case 'vertrag': {
      const pfade: Record<string, string> = {
        angebot: '/p/angebot?bereich=treatment',
        'angebot-frueh': '/p/angebot?bereich=treatment',
        'angebot-wartet': '/p/angebot?bereich=treatment',
        'angebot-uebersicht': '/p?bereich=treatment',
        vertrag: '/p/vertrag?bereich=training',
        abo: '/p/abo?bereich=treatment',
        paket: '/p/paket?bereich=training',
        preise: '/p/paket?bereich=training',
        termine: '/p/termine?bereich=treatment',
        'termine-heute': '/p/termine?bereich=treatment',
        'termine-absage-angefragt': '/p/termine?bereich=treatment',
        'termine-gesendet': '/p/termine?bereich=treatment&gesendet=1',
        'termine-leer': '/p/termine?bereich=treatment',
        'termine-nur-wunsch': '/p/termine?bereich=treatment',
        'termine-laden': '/p/termine?bereich=treatment',
        'termine-fehler': '/p/termine?bereich=treatment',
        'termine-training': '/p/termine?bereich=training',
        wunsch: '/p/termine/wunsch?bereich=treatment',
        termin: `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment`,
        'termin-angefragt': '/p/termine/aaaaaaaa-aaaa-4aaa-8aaa-0000000000f2?bereich=treatment',
        'termin-vergangen': '/p/termine/aaaaaaaa-aaaa-4aaa-8aaa-0000000000f3?bereich=treatment',
        'termin-abgesagt': '/p/termine/aaaaaaaa-aaaa-4aaa-8aaa-0000000000f4?bereich=treatment',
        'termin-laden': `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment`,
        'termin-fehler': `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment`,
        'termin-absagen': `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment&art=cancel`,
        'termin-aendern': `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment&art=change`,
        rechnungen: '/p/rechnungen?bereich=treatment',
        rechnung: `/p/rechnungen/${RECHNUNG}?bereich=treatment`,
        dokumente: '/p/dokumente?bereich=treatment',
        befundbogen: '/p/befundbogen?bereich=treatment',
        einwilligungen: '/p/einwilligungen?bereich=treatment',
        daten: '/p/daten?bereich=treatment',
        einstellungen: '/p/einstellungen',
        einstieg: '/p?bereich=treatment',
        // DRP-016: nach „PIN speichern“ (Schritt 1c) einmal „Anmeldung eingerichtet“.
        'einstieg-eingerichtet': '/p?bereich=treatment&eingerichtet=1',
        checkin: '/p/checkin?bereich=treatment',
        'checkin-uebersicht': '/p?bereich=treatment',
        'checkin-danke': '/p?bereich=treatment&checkin=1',
        angaben: '/p/angaben?bereich=treatment',
        'angaben-frage': '/p/angaben/pain_rest?bereich=treatment',
        'angaben-frage-uebungen': '/p/angaben/session_exertion?bereich=treatment',
        'angaben-tabelle': '/p/angaben/tabelle?bereich=treatment',
        'angaben-leer': '/p/angaben?bereich=treatment',
        'angaben-laden': '/p/angaben?bereich=treatment',
        'checkin-alltag': '/p/checkin?bereich=treatment',
        gewohnheiten: '/p/gewohnheiten?bereich=treatment',
        'gewohnheiten-pausiert': '/p/gewohnheiten?bereich=treatment',
        'gewohnheiten-leer': '/p/gewohnheiten?bereich=treatment',
        'gewohnheiten-laden': '/p/gewohnheiten?bereich=treatment',
        ernaehrung: '/p/ernaehrung?bereich=treatment',
        'ernaehrung-ohne-netz': '/p/ernaehrung?bereich=treatment',
        tagebuch: '/p/ernaehrung/tagebuch?bereich=treatment',
        'tagebuch-laden': '/p/ernaehrung/tagebuch?bereich=treatment',
        'tagebuch-fehler': '/p/ernaehrung/tagebuch?bereich=treatment',
        'tagebuch-ohne-netz': '/p/ernaehrung/tagebuch?bereich=treatment',
        // Wie aus der Pille „Mittagessen“: Tag, Mahlzeit und der Rückweg zum Tag.
        'tagebuch-eintragen': `/p/ernaehrung/tagebuch/eintragen?bereich=treatment&tag=${inTagen(0, 0).slice(0, 10)}&mahlzeit=lunch&zurueck=${encodeURIComponent('/p/ernaehrung/tagebuch?bereich=treatment')}`,
        'tagebuch-eintragen-aus': `/p/ernaehrung/tagebuch/eintragen?bereich=treatment&tag=${inTagen(0, 0).slice(0, 10)}&mahlzeit=lunch&zurueck=${encodeURIComponent('/p/ernaehrung/tagebuch?bereich=treatment')}`,
        lebensmittel: '/p/ernaehrung/lebensmittel?bereich=treatment',
        'lebensmittel-neu': '/p/ernaehrung/lebensmittel/neu?bereich=treatment',
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
    // Schritt 4c: der Fragebogen in einem Thema, beim Abschluss und in seinen Lagen.
    case 'fragebogen-thema':
    case 'fragebogen-abschluss':
    case 'fragebogen-ohne-netz':
    case 'fragebogen-gesendet':
    case 'fragebogen-training':
    case 'fragebogen-laden':
    case 'fragebogen-ladefehler':
      return {
        pfad: `/p/befundbogen?bereich=${seite === 'fragebogen-training' ? 'training' : 'treatment'}`,
        element: (
          <PlattformApp
            zugaenge={zugaenge}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'fragebogen-begleitung':
      return {
        pfad: `/p/befundbogen?zugang=${begleitung.access_id}`,
        element: (
          <PlattformApp
            zugaenge={[zugaenge[0]!, begleitung]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
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
    case 'ende-uebersicht':
      return {
        pfad: '/p',
        element: (
          <PlattformApp
            zugaenge={[{ ...zugaenge[0]!, readable: false, read_until: inTagen(-2, 12) }]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    // Schritt 1e: die Übersicht im Training, in der Lesefrist, beim Laden
    // und mit einem Fehler (Handoff 2026-10-22, 5.1).
    case 'uebersicht-training':
    case 'uebersicht-laden':
    case 'uebersicht-fehler':
      return {
        pfad: seite === 'uebersicht-training' ? '/p?bereich=training' : '/p?bereich=treatment',
        element: (
          <PlattformApp
            zugaenge={zugaenge}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'uebersicht-lesefrist':
    case 'termine-lesefrist':
      return {
        pfad: seite === 'termine-lesefrist' ? '/p/termine?bereich=treatment' : '/p',
        element: (
          <PlattformApp
            zugaenge={[{ ...zugaenge[0]!, read_until: inTagen(20, 0) }]}
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
    // Schritt 4b: der Check-in als geführter Ablauf und seine Zustände (Handoff 5.1).
    case 'checkin-frage':
    case 'checkin-letzte':
    case 'checkin-ohne-netz':
    case 'checkin-beantwortet':
    case 'checkin-laden':
    case 'checkin-fehler':
    case 'checkin-training':
    case 'checkin-einwilligung':
    case 'checkin-leer':
      return {
        pfad: ['checkin-training', 'checkin-einwilligung', 'checkin-leer'].includes(seite)
          ? '/p/checkin?bereich=training'
          : '/p/checkin?bereich=treatment',
        element: (
          <PlattformApp
            zugaenge={zugaenge}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'checkin-lesefrist':
      return {
        pfad: '/p/checkin?bereich=treatment',
        element: (
          <PlattformApp
            zugaenge={[{ ...zugaenge[0]!, read_until: inTagen(29, 0) }]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      };
    case 'checkin-begleitung':
      return {
        pfad: `/p/checkin?zugang=${begleitung.access_id}`,
        element: (
          <PlattformApp
            zugaenge={[zugaenge[0]!, begleitung]}
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
