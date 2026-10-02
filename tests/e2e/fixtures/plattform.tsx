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
import type { Plattformzugang } from '@/features/platform/api';
import { EinladungPage } from '@/features/platform/EinladungPage';
import { PlattformApp } from '@/features/platform/PlattformApp';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `plattform.html` (POR-EPIC-001).
 *
 * `?seite=abschnitt` (Standard, ohne Zugang), `abschnitt-aktiv`, `qr`,
 * `einladung` (mit `#code=…`), `geruest` (zwei Bereiche), `ich`,
 * `gesperrt`; seit POR-EPIC-001b `handeln-fuer` (eigener Bereich und eine
 * Begleitung). `abschnitt-aktiv` und `ich` zeigen Vertretungen. Die Daten liegen vorab im Cache; gesprochen wird mit keinem
 * Server. Alles ist synthetisch.
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
