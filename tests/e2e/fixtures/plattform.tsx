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
  benachrichtigungSchluessel,
  befundbogenSchluessel,
  plaeneSchluessel,
  checkinsSchluessel,
  gewohnheitenSchluessel,
  dokumenteSchluessel,
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
} from '@/features/platform/api';
import { EinladungPage } from '@/features/platform/EinladungPage';
import { checkinsKey, type CheckinDaten } from '@/features/checkins/api';
import { ZwischenDenTerminen } from '@/features/checkins/ZwischenDenTerminen';
import { TrainingAssessments } from '@/features/training/TrainingAssessments';
import { assessmentsKey, type Assessmentsicht } from '@/features/training/assessments-api';
import {
  PASSKEYS_SCHLUESSEL,
  PIN_SCHLUESSEL,
} from '@/features/auth/einrichtung/AnmeldungVerwalten';
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
 * Preisen) und `preise` (Preise ohne Paket). Seit KND-EPIC-001 `angebot`
 * (Angebot der Praxis zum Buchen), `angebot-frueh` (Beginn in der
 * Widerrufsfrist), `angebot-wartet` (Behandlung läuft noch),
 * `angebot-uebersicht` (Kachel auf der Übersicht) und `vertrag` (eigener
 * Vertrag mit Widerrufsknopf). Seit KOM-EPIC-003 tragen `einstellungen`
 * und `einstieg` die Benachrichtigungen. Seit TRK-EPIC-001 `checkin` (die
 * Fragen), `checkin-uebersicht` (Kachel), `checkin-danke` (Satz nach dem
 * Absenden), `angaben` („Meine Angaben") und `zwischen` (Abschnitt der
 * Praxis). Seit OUT-EPIC-001 trägt `zwischen` das Verlaufsbild mit
 * Ereignissen und `angaben` die Punktbilder; `assessments` zeigt die
 * Assessments der Trainingsseite. Seit ALT-EPIC-001 `checkin-alltag`
 * (Schlafdauer, Schmerzmittel bei Bedarf, Belastung außerhalb der Übungen),
 * `gewohnheiten` (die Seite der Person) und in `zwischen` die Gewohnheiten
 * der Praxisseite. Seit Überholung 6 (G6) `termin-absagen` und
 * `termin-aendern` (der geführte Ablauf mit `?art=`), und `&kurzfristig`
 * legt den Hausbesuch in weniger als 24 Stunden (`late_notice`). Seit
 * DRP-EPIC-005 der Einstieg als geführter Ablauf: `einstieg` (zwei offene
 * Einwilligungen, der Fragebogen steht aus), `einstieg-eingerichtet` (nach
 * „PIN speichern“) und `einstieg-begleitung` (für Maximilian). Die Daten
 * liegen vorab im Cache; gesprochen wird mit keinem Server - was eine Seite
 * sendet, beantwortet der Test über abgefangene Anfragen. Alles ist
 * synthetisch.
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
    practice_phone: '+49 7071 0000000',
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
client.setQueryData(termineSchluessel(begleitung.access_id), [termine[0]!]);
client.setQueryData(wuenscheSchluessel(begleitung.access_id), []);
client.setQueryData(rechnungenSchluessel(begleitung.access_id), []);
client.setQueryData(befundbogenSchluessel(begleitung.access_id), []);

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
  history: checkinVerlauf,
  // OUT-004: die eigenen Angaben nach den Übungen.
  session_history: [
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
// ALT-003: eine laufende Gewohnheit mit Tagen, eine pausierte.
client.setQueryData(gewohnheitenSchluessel(zugaenge[0]!.access_id), {
  today: inTagen(0, 0).slice(0, 10),
  mark_days: 7,
  can_mark: true,
  consent_needed: false,
  habits: [
    {
      id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000001',
      action: 'zwei Minuten Mobilität',
      cue: 'Nach dem Zähneputzen',
      place: 'im Bad',
      starts_on: inTagen(-20, 0).slice(0, 10),
      paused: false,
      ended_at: null,
      marks: [0, -1, -2, -4, -5].map((t) => inTagen(t, 0).slice(0, 10)),
    },
    {
      id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000002',
      action: 'eine Treppe statt Aufzug',
      cue: 'Im Büro',
      place: null,
      starts_on: inTagen(-12, 0).slice(0, 10),
      paused: true,
      ended_at: null,
      marks: [],
    },
  ],
} satisfies EigeneGewohnheiten);
client.setQueryData(gewohnheitenSchluessel(zugaenge[1]!.access_id), null);
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
    diary_enabled: false,
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
client.setQueryData(ernaehrungSchluessel(zugaenge[1]!.access_id), null);
// Politurrunde 2026-10-20: das Tagebuch von heute - ein Frühstück, die übrigen
// Mahlzeiten leer, zwei Gläser Wasser (wie im Seed bei Erika).
const ohneSummen = { energy_kcal: 0, protein_g: 0, fat_g: 0, carbohydrate_g: 0 };
client.setQueryData(tagebuchSchluessel(zugaenge[0]!.access_id, 'heute'), {
  today: inTagen(0, 0).slice(0, 10),
  started_on: '2026-09-27',
  enabled: true,
  can_write: true,
  can_delete: true,
  glass_ml: 250,
  hide_numbers: false,
  recent: [],
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
        ],
        totals: { energy_kcal: 185, protein_g: 6.7, fat_g: 3.5, carbohydrate_g: 29.3 },
      },
      { meal: 'lunch', entries: [], totals: ohneSummen },
      { meal: 'dinner', entries: [], totals: ohneSummen },
      { meal: 'snack', entries: [], totals: ohneSummen },
    ],
    totals: { energy_kcal: 185, protein_g: 6.7, fat_g: 3.5, carbohydrate_g: 29.3 },
    water_ml: 500,
  },
} satisfies EigenesTagebuch);
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
            // E-001: die Inhaber:in sieht den Weg in die Einsicht.
            einsichtFuer="Maximilian"
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
    case 'einstieg-eingerichtet':
    case 'termine':
    case 'wunsch':
    case 'termin':
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
    case 'tagebuch':
    case 'lebensmittel':
    case 'lebensmittel-neu':
    case 'angaben':
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
        wunsch: '/p/termine/wunsch?bereich=treatment',
        termin: `/p/termine/${TERMIN_HAUSBESUCH}?bereich=treatment`,
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
        'checkin-alltag': '/p/checkin?bereich=treatment',
        gewohnheiten: '/p/gewohnheiten?bereich=treatment',
        ernaehrung: '/p/ernaehrung?bereich=treatment',
        tagebuch: '/p/ernaehrung/tagebuch?bereich=treatment',
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
