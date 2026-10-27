import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fachAendern } from '@/lib/geraeteablage';
import { offlineschluesselAus } from '@/features/core/auth/freigabeOhneNetz';
import { plaeneAblegen, ereignisAblegen, geraetetag } from '@/features/portal/platform/ablage';
import { Pruefseite } from './ohne-netz-seite';
import type { EigenerPlan } from '@/features/portal/platform/api';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `ohne-netz.html` (TRK-EPIC-003).
 *
 * `?seite=sperre` (Standard): die Sperre ohne Verbindung; nach der Freigabe
 * per Passkey die lokale Ansicht. `?seite=lokal`: gleich die lokale Ansicht.
 * `?schluessel=1`: legt vorher mit dem Authenticator des Browsers (in der
 * Prüfung ein virtueller) einen Passkey an und legt seinen öffentlichen
 * Schlüssel ab - wie es die Anwendung beim Einrichten und Laden tut. Gesprochen
 * wird mit keinem Server. Alles ist synthetisch.
 */
const suche = new URLSearchParams(window.location.search);
const seite = suche.get('seite') ?? 'sperre';
const BESITZER = 'eeeeeeee-0000-4000-8000-000000000001';
const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';

function position(
  nummer: number,
  name: string,
  teil: Partial<EigenerPlan['items'][number]> = {},
): EigenerPlan['items'][number] {
  return {
    id: `bbbbbbbb-0000-4000-8000-00000000000${nummer}`,
    position: nummer,
    variant_lay_name: name,
    instruction: 'Langsam und ruhig, ohne Schwung.',
    equipment: [],
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    duration_seconds: null,
    hold_seconds: null,
    per_side: false,
    times_per_day: null,
    load: null,
    tempo: null,
    rest_seconds: 45,
    double_progression: false,
    note: null,
    ...teil,
  };
}

const plan: EigenerPlan = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  service_area: 'therapy',
  title: 'Heimprogramm nach Knie-Totalendoprothese, Phase zwei mit Treppensteigen',
  status: 'assigned',
  sessions_per_week: 3,
  assigned_on: '2026-10-01',
  runs_from: '2026-10-01',
  runs_until: '2099-11-12',
  ended_on: null,
  can_exercise: true,
  can_choose_days: true,
  note_allowed: true,
  open_session: null,
  weekdays: [],
  recent_sessions: [],
  items: [
    position(1, 'Am Treppengeländer festhalten und langsam in die Hocke gehen'),
    position(2, 'Gelbes Band zum Körper heranziehen', { load: 'Theraband gelb', sets: 2 }),
  ],
};

async function passkeyAnlegen(): Promise<void> {
  const angelegt = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Prüfseite', id: window.location.hostname },
      user: {
        id: new TextEncoder().encode(BESITZER),
        name: 'erika.plattform@patient.invalid',
        displayName: 'Erika',
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
  await plaeneAblegen(BESITZER, ZUGANG, null, { today: geraetetag(), plans: [plan] });
  if (suche.get('wartend') === '1') {
    await ereignisAblegen(
      BESITZER,
      {
        id: 'dddddddd-0000-4000-8000-000000000001',
        zugangId: ZUGANG,
        planId: plan.id,
        tag: geraetetag(),
        begonnenAm: new Date().toISOString(),
      },
      {
        id: 'dddddddd-0000-4000-8000-000000000002',
        kind: 'set',
        at: new Date().toISOString(),
        item_id: plan.items[0]!.id,
        set_number: 1,
        done: true,
      },
    );
  }
  if (suche.get('schluessel') === '1') await passkeyAnlegen();
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

void vorbereiten().then(() => {
  createRoot(document.getElementById('wurzel')!).render(
    <QueryClientProvider client={client}>
      <Pruefseite besitzer={BESITZER} lokal={seite === 'lokal'} />
    </QueryClientProvider>,
  );
});
