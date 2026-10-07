import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import {
  BIBLIOTHEK_SCHLUESSEL,
  type Bibliothek,
  type Uebung,
  type Variante,
} from '@/features/exercises/api';
import { UebungenPage } from '@/features/exercises/UebungenPage';
import { UebungPage } from '@/features/exercises/UebungPage';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `uebungen.html` (UEB-EPIC-001).
 *
 * `?seite=liste` (Standard) oder `?seite=uebung` (Kniebeuge mit Varianten und
 * Verbindungen); `?rolle=owner` zeigt die Pflege, sonst liest eine
 * Therapeut:in. Die Daten liegen vorab im Cache; gesprochen wird mit keinem
 * Server. Alles ist synthetisch.
 */
const suche = new URLSearchParams(window.location.search);
const seite = suche.get('seite') ?? 'liste';
const rolle: RoleKey = suche.get('rolle') === 'owner' ? 'owner' : 'therapist';

function variante(
  id: string,
  name: string,
  laie: string,
  anleitung: string | null,
  ausruestung: string[],
  zusatz: Partial<Variante> = {},
): Variante {
  return {
    id,
    name,
    lay_name: laie,
    instruction: anleitung,
    equipment: ausruestung,
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...zusatz,
  };
}

const KNIEBEUGE: Uebung = {
  id: 'u-kniebeuge',
  name: 'Kniebeuge',
  lay_name: 'In die Hocke gehen',
  body_region: 'knie',
  archived: false,
  variants: [
    variante(
      'v-gelaender',
      'Kniebeuge am Geländer, halbe Tiefe',
      'Am Geländer halb in die Hocke',
      'Mit beiden Händen am Geländer festhalten. Langsam halb in die Hocke gehen, kurz halten, wieder aufrichten.',
      ['Geländer'],
      {
        common_faults: 'Knie fallen nach innen; Fersen heben ab.',
        practice_notes: 'Höhe des Griffs vor Ort zeigen.',
      },
    ),
    variante(
      'v-frei',
      'Kniebeuge freistehend, halbe Tiefe',
      'Frei halb in die Hocke',
      'Füße hüftbreit. Arme nach vorn, langsam halb in die Hocke, wieder aufrichten.',
      [],
    ),
    variante(
      'v-tief',
      'Kniebeuge freistehend, volle Tiefe',
      'Frei tief in die Hocke',
      'So tief in die Hocke, wie es ruhig geht, dann wieder aufrichten.',
      [],
    ),
    variante(
      'v-wackel',
      'Kniebeuge auf dem Wackelbrett',
      'Auf dem Wackelbrett in die Hocke',
      null,
      ['Wackelbrett'],
      { archived: true },
    ),
  ],
};

const uebungen: Uebung[] = [
  {
    id: 'u-ausfall',
    name: 'Ausfallschritt',
    lay_name: 'Großer Schritt nach vorn',
    body_region: 'knie',
    archived: false,
    variants: [
      variante(
        'v-ausfall',
        'Ausfallschritt am Stuhl',
        'Großer Schritt nach vorn, Hand am Stuhl',
        'Eine Hand an der Stuhllehne. Großen Schritt nach vorn, hinteres Knie Richtung Boden.',
        ['Stuhl'],
      ),
    ],
  },
  {
    id: 'u-aussenrotation',
    name: 'Außenrotation mit Band und einer bewusst sehr langen Bezeichnung zum Umbrechen',
    lay_name: 'Arm nach außen drehen',
    body_region: 'schulter',
    archived: false,
    variants: [
      variante(
        'v-aussen',
        'Außenrotation im Stehen, Theraband gelb',
        'Im Stehen den Arm mit dem gelben Band nach außen drehen',
        'Ellenbogen am Körper, Unterarm nach vorn. Band nach außen ziehen, langsam zurück.',
        ['Theraband gelb'],
      ),
    ],
  },
  {
    id: 'u-beinpresse',
    name: 'Beinpresse',
    lay_name: 'Beine gegen die Platte drücken',
    body_region: 'knie',
    archived: true,
    variants: [],
  },
  {
    id: 'u-bruecke',
    name: 'Brücke',
    lay_name: 'Becken heben',
    body_region: 'lws',
    archived: false,
    variants: [
      variante('v-bruecke', 'Brücke beidbeinig', 'Becken anheben, beide Füße am Boden', null, [
        'Matte',
      ]),
    ],
  },
  KNIEBEUGE,
  {
    id: 'u-rudern',
    name: 'Rudern mit Band',
    lay_name: 'Arme zum Körper ziehen',
    body_region: 'bws',
    archived: false,
    variants: [
      variante('v-gelb', 'Rudern im Sitzen, Theraband gelb', 'Gelbes Band heranziehen', null, [
        'Theraband gelb',
      ]),
    ],
  },
];

const bibliothek: Bibliothek = {
  can_manage: rolle === 'owner',
  exercises: uebungen,
  links: [
    {
      id: 'l1',
      easier_variant_id: 'v-gelaender',
      harder_variant_id: 'v-frei',
      axis: 'unterstuetzung',
    },
    {
      id: 'l2',
      easier_variant_id: 'v-frei',
      harder_variant_id: 'v-tief',
      axis: 'bewegungsausmass',
    },
    { id: 'l3', easier_variant_id: 'v-tief', harder_variant_id: 'v-ausfall', axis: 'komplexitaet' },
  ],
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(BIBLIOTHEK_SCHLUESSEL, bibliothek);

const user: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: rolle === 'owner' ? 'Jannes Test' : 'Anna Beispiel',
    is_active: true,
  },
  roles: [rolle],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000002',
  revenueShare: false,
};

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const router = createMemoryRouter(
  [
    { path: '/uebungen', element: rahmen(<UebungenPage user={user} />) },
    { path: '/uebungen/:uebungId', element: rahmen(<UebungPage user={user} />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [seite === 'uebung' ? `/uebungen/${KNIEBEUGE.id}` : '/uebungen'] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
