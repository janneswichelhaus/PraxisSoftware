import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import type { AuditEvent } from '@/features/audit/api';
import type { Loeschauftrag } from '@/features/files/api';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { AufbewahrungPage } from '@/features/retention/AufbewahrungPage';
import type { Datenklasse } from '@/features/retention/api';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `nachweise.html` (UX-009b, BEF-065).
 *
 * `?seite=aufbewahrung` zeigt Aufbewahrung und Löschung, sonst das Protokoll.
 * `?offen=ja` legt bei der Aufbewahrung einen offenen Löschauftrag an, sonst
 * ist nichts zu tun. Alle Angaben sind erfunden.
 */
const suche = new URLSearchParams(window.location.search);
const seite = suche.get('seite');
const mitAuftrag = suche.get('offen') === 'ja';

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000001',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000001',
    display_name: 'Jannes Test',
    is_active: true,
  },
  roles: ['owner', 'therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000001',
  revenueShare: false,
};

function eintrag(nummer: number, teil: Partial<AuditEvent>): AuditEvent {
  return {
    id: `eeeeeeee-eeee-4eee-8eee-0000000000${String(nummer).padStart(2, '0')}`,
    occurred_at: new Date(Date.UTC(2026, 9, 10, 12, 60 - nummer)).toISOString(),
    actor_user_id: '11111111-1111-4111-8111-000000000002',
    actor_kind: 'user',
    actor_display_name: 'Anna Beispiel',
    action: 'patient_record.viewed',
    subject_type: 'patient',
    subject_id: '66666666-6666-4666-8666-000000000001',
    outcome: 'success',
    total_count: 40,
    ...teil,
  };
}

const ereignisse: AuditEvent[] = [
  eintrag(1, {
    action: 'access.denied',
    actor_display_name: 'Tom Training',
    subject_type: 'organization',
    subject_id: '22222222-2222-4222-8222-000000000001',
    outcome: 'denied',
    denied_operation: 'appointments.read',
    denied_count: 3,
  }),
  ...Array.from({ length: 24 }, (_, index) => eintrag(index + 2, {})),
];

const plan: Datenklasse[] = [
  {
    key: 'patientenakte',
    basis: 'gesetzlich',
    legal_reference: 'Par. 630f Abs. 3 BGB',
    anchor: 'care_concluded',
    retention_interval: '10 years',
    upper_bound_anchor: null,
    upper_bound_interval: null,
    assumption_key: null,
    note: 'Zehn Jahre nach Abschluss der Behandlung.',
    sort_order: 10,
    tabellen: [{ name: 'patients', modus: 'automatisch' }],
  },
  {
    key: 'patientenfoto',
    basis: 'intern',
    legal_reference: 'Art. 9 Abs. 2 lit. a DSGVO',
    anchor: 'event_time',
    retention_interval: '1 year',
    upper_bound_anchor: 'care_concluded_recorded',
    upper_bound_interval: '3 mons',
    assumption_key: 'ANN-126',
    note: 'Zwölf Monate nach der Aufnahme.',
    sort_order: 12,
    tabellen: [{ name: 'patient_files', modus: 'automatisch' }],
  },
];

const auftraege: Loeschauftrag[] = mitAuftrag
  ? [
      {
        id: 'o1',
        bucket_id: 'patientenakte',
        ordered_at: '2026-10-09T07:00:00.000Z',
        object_present: true,
      },
    ]
  : [];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['audit-events', { page: 0, pageSize: 25 }], {
  events: ereignisse,
  totalCount: 40,
});
client.setQueryData(
  ['organization-members'],
  [{ id: '11111111-1111-4111-8111-000000000002', display_name: 'Anna Beispiel' }],
);
client.setQueryData(['retention', 'schedule'], plan);
client.setQueryData(['retention', 'legal-holds'], []);
client.setQueryData(['retention', 'runs'], []);
client.setQueryData(['storage-deletion-orders'], auftraege);
client.setQueryData(['patient-file-reconciliation', 'missing'], []);
client.setQueryData(['patient-file-reconciliation', 'orphaned'], 0);

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <QueryClientProvider client={client}>
    <MemoryRouter
      initialEntries={[
        seite === 'aufbewahrung' ? '/praxis/sicherheit/aufbewahrung' : '/praxis/sicherheit/audit',
      ]}
    >
      <VorschauProvider>
        <AppShell user={nutzer} onSignOut={() => undefined}>
          {seite === 'aufbewahrung' ? <AufbewahrungPage user={nutzer} /> : <AuditLogPage />}
        </AppShell>
      </VorschauProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
