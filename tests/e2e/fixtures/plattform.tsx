import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { SessionContext } from '@/features/auth/sessionContext';
import type { Plattformzugang as ZugangDerPraxis } from '@/features/platform-access/api';
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
 * `gesperrt`. Die Daten liegen vorab im Cache; gesprochen wird mit keinem
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
  },
  {
    access_id: 'cafecafe-cafe-4afe-8afe-000000000003',
    organization_name: 'Test Praxis Tuebingen',
    relationship_kind: 'training',
    status: 'active',
    readable: true,
    read_until: null,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(
  ['platform-access', 'treatment', MAX],
  seite === 'abschnitt-aktiv' ? aktiv : ohneZugang,
);

const sitzung = {
  session: null,
  initialising: false,
  signOut: () => Promise.resolve(),
};

function Praxisrahmen({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-2xl px-5 py-6">{children}</div>;
}

function inhalt(): { pfad: string; element: ReactNode } {
  switch (seite) {
    case 'abschnitt-aktiv':
    case 'abschnitt':
      return {
        pfad: '/',
        element: (
          <Praxisrahmen>
            <PlattformAbschnitt
              art="treatment"
              verhaeltnisId={MAX}
              darfVerwalten
              zeitzone="Europe/Berlin"
            />
          </Praxisrahmen>
        ),
      };
    case 'qr':
      return {
        pfad: '/',
        element: (
          <Praxisrahmen>
            <EinladungVorOrt
              einladung={{
                access_id: 'cafecafe-cafe-4afe-8afe-000000000009',
                invitation_id: '99999999-9999-4999-8999-0000000000e1',
                purpose: 'activate',
                code: 'AbCdEfGhIjKlMnOpQrStUvWxYz012345',
                expires_at: '2026-10-14T08:00:00+00:00',
              }}
              onFertig={() => undefined}
            />
          </Praxisrahmen>
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
