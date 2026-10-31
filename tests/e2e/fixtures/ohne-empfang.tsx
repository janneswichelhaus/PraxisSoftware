import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { fachAendern } from '@/lib/geraeteablage';
import { offlineschluesselAus } from '@/features/core/auth/freigabeOhneNetz';
import { entwurfSchreiben } from '@/features/clinical/documentation/offline/entwuerfe';
import { einrichten } from '@/features/clinical/documentation/offline/servicePhone';
import { tagesplanAblegen } from '@/features/clinical/documentation/offline/tagesplan';
import { Pruefseite } from './ohne-empfang-seite';
import '@/index.css';
import type { DayPlanEntry } from '@/features/calendar/day-plan/api';

/**
 * Einstieg der Prüfseite aus `ohne-empfang.html` (OFF-EPIC-001).
 *
 * `?seite=sperre` (Standard): die Sperre ohne Verbindung für ein Praxiskonto;
 * nach der Freigabe per Passkey die lokale Ansicht mit Tagesplan und
 * Schreibfeld. `?seite=geraet`: „Auf dem Gerät" in offener Sitzung, mit
 * `PraxisAblage`, die überträgt (die Prüfung fängt den RPC ab).
 * `?seite=einrichtung`: der Abschnitt unter „Mein Konto". `?schluessel=1`
 * legt mit dem Authenticator des Browsers einen Passkey an, `?entwurf=1`
 * einen wartenden Entwurf. Alles ist synthetisch.
 */
const suche = new URLSearchParams(window.location.search);
const seite = suche.get('seite') ?? 'sperre';
const BESITZER = 'eeeeeeee-0000-4000-8000-0000000000a2';
const ZONE = 'Europe/Berlin';
const HEUTE = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date());

function termin(nummer: number, uhr: string, teil: Partial<DayPlanEntry> = {}): DayPlanEntry {
  return {
    id: `aaaaaaaa-0000-4000-8000-00000000010${nummer}`,
    patient_id: `bbbbbbbb-0000-4000-8000-00000000010${nummer}`,
    staff_member_id: 'cccccccc-0000-4000-8000-000000000101',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: new Date(`${HEUTE}T${uhr}:00+02:00`).toISOString(),
    ends_at: new Date(new Date(`${HEUTE}T${uhr}:00+02:00`).getTime() + 45 * 60_000).toISOString(),
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Hinterhofgasse',
    visit_house_number: '12b',
    visit_postal_code: '72070',
    visit_city: 'Tübingen',
    patient_phone: '07071 000000',
    patient_phone_mobile: '0170 0000000',
    home_visit_access_note: 'Klingel defekt',
    special_note: null,
    documentation_status: null,
    organization_time_zone: ZONE,
    ...teil,
  };
}

const TAGESPLAN = [
  termin(1, '08:00'),
  termin(2, '09:15', {
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann-Langenbach',
    visit_street: 'Am langen Weinberg über der Neckarhalde',
  }),
  termin(3, '10:30', { status: 'cancelled', patient_given_name: 'Paula' }),
  termin(4, '12:00', {
    kind: 'internal',
    title: 'Teamrunde',
    patient_id: null,
    patient_given_name: null,
    patient_family_name: null,
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    patient_phone: null,
    patient_phone_mobile: null,
  }),
];

async function passkeyAnlegen(): Promise<void> {
  const angelegt = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Prüfseite', id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(BESITZER),
        name: 'anna@praxis.invalid',
        displayName: 'Anna',
      },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    },
  });
  const schluessel = offlineschluesselAus(angelegt);
  if (!schluessel) throw new Error('Kein Schlüssel aus dem Authenticator.');
  await fachAendern(BESITZER, 'passkeys', () => [schluessel], true);
}

async function vorbereiten(): Promise<void> {
  if (seite === 'einrichtung') return;
  await einrichten(BESITZER);
  await tagesplanAblegen(BESITZER, ZONE, HEUTE, TAGESPLAN);
  if (suche.get('entwurf') === '1') {
    const t = TAGESPLAN[0]!;
    await entwurfSchreiben(
      BESITZER,
      t.id,
      {
        beginn: t.starts_at,
        ende: t.ends_at,
        zeitzone: ZONE,
        name: 'Erika Beispiel',
        terminart: 'home_visit',
      },
      'Synthetisch: Gangschule im Treppenhaus, 3 x 10 Stufen mit Geländer.',
    );
  }
  if (suche.get('schluessel') === '1') await passkeyAnlegen();
}

const router = createMemoryRouter([
  {
    path: '*',
    element: <Pruefseite seite={seite} besitzer={BESITZER} zone={ZONE} />,
  },
]);
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

void vorbereiten().then(() => {
  createRoot(document.getElementById('wurzel')!).render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
});
