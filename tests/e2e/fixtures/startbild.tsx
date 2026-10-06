import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { Startbild } from '@/app/Startbild';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `startbild.html` (RAH-009).
 *
 * Der Rahmen einer Therapeutin auf der Übersicht, darüber das Startbild.
 * `?uhrzeit=1.2` hält das Intro bei dieser Sekunde an; ohne Parameter läuft es
 * durch und landet auf der Marke des Rahmens.
 */
const uhrzeitWert = new URLSearchParams(window.location.search).get('uhrzeit');
const uhrzeit = uhrzeitWert === null ? undefined : Number(uhrzeitWert);

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: 'Anna Beispiel',
    is_active: true,
  },
  roles: ['therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000002',
  revenueShare: false,
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});

export function Pruefseite() {
  const [intro, setIntro] = useState(true);
  return (
    <>
      {intro ? <Startbild onFertig={() => setIntro(false)} uhrzeit={uhrzeit} /> : null}
      <AppShell user={nutzer} onSignOut={() => undefined}>
        <PageHeader title="Übersicht" description="Prüfseite ohne Daten." />
        <p className="text-ink-muted mt-4 max-w-prose text-sm">
          Der Inhalt blendet nach dem Intro gestaffelt ein.
        </p>
        <p className="text-ink-muted mt-4 max-w-prose text-sm">Zweiter Absatz, 70 ms später.</p>
      </AppShell>
    </>
  );
}

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/']}>
      <Pruefseite />
    </MemoryRouter>
  </QueryClientProvider>,
);
