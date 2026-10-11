import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnmeldungEinrichten } from '@/features/auth/einrichtung/AnmeldungEinrichten';
import {
  PASSKEYS_SCHLUESSEL,
  PIN_SCHLUESSEL,
  PasskeyAbschnitt,
  PinAbschnitt,
} from '@/features/auth/einrichtung/AnmeldungVerwalten';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `anmeldung.html` (SEC-EPIC-002): die Einrichtung
 * nach der Einladung und die Abschnitte aus „Mein Konto“, ohne Anmeldedienst.
 * Die Daten stehen vorab im Abfragespeicher; Knöpfe, die den Dienst bräuchten,
 * schlagen hier fehl - geprüft wird die Seite, nicht der Dienst.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'einrichten';

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(PASSKEYS_SCHLUESSEL, [
  {
    id: 'p1',
    name: 'iPhone',
    angelegtAm: '2026-10-10T08:00:00Z',
    zuletztAm: '2026-10-10T09:30:00Z',
    freigegeben: true,
  },
]);
client.setQueryData(PIN_SCHLUESSEL, true);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    {seite === 'verwalten' ? (
      <main className="mx-auto max-w-xl p-4">
        <PasskeyAbschnitt />
        <PinAbschnitt />
      </main>
    ) : (
      <AnmeldungEinrichten
        stand={{ passkeys: seite === 'pin' ? 1 : 0, pin: false }}
        onFertig={() => undefined}
        onAbmelden={() => undefined}
        onSpaeter={() => undefined}
      />
    )}
  </QueryClientProvider>,
);
