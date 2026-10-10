import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { AppointmentSlipPage } from '@/features/appointments/AppointmentSlipPage';
import type { AppointmentSlipEntry } from '@/features/appointments/api';
import { AufnahmeblaetterPage } from '@/features/datenschutz/AufnahmeblaetterPage';
import { PRAXIS_ABSENDER_KEY, type PraxisAbsender } from '@/features/datenschutz/absender';
import type { Patient } from '@/features/patients/api';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `blaetter.html` (UX-009a, BEF-052).
 *
 * `?blatt=aufnahme` zeigt die Aufnahmeblätter, sonst den Terminzettel.
 * `?absender=ohne` liefert nur den Namen der Organisation - so, wie die
 * Serverfunktion antwortet, wenn die Praxis-Stammdaten fehlen (ANN-323).
 * Alle Angaben sind erfunden.
 */
const suche = new URLSearchParams(window.location.search);
const blatt = suche.get('blatt');
const ohneStammdaten = suche.get('absender') === 'ohne';
const PATIENT = '66666666-6666-4666-8666-000000000001';

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

const absender: PraxisAbsender = ohneStammdaten
  ? { name: 'Test Praxis Tuebingen' }
  : {
      name: 'Test Praxis Tuebingen',
      street: 'Musterallee',
      house_number: '1',
      postal_code: '72070',
      city: 'Tuebingen',
      phone: '+49 7071 0000000',
      email: 'rechnung@praxis.invalid',
    };

const patient: Patient = {
  id: PATIENT,
  status: 'active',
  care_started_on: '2026-09-01',
  care_concluded_on: null,
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  email: 'max@example.invalid',
  phone: null,
  phone_work: null,
  phone_mobile: null,
  institution: null,
  street: 'Beispielstrasse',
  house_number: '12',
  postal_code: '72070',
  city: 'Tuebingen',
  primary_therapist_staff_member_id: null,
  primary_therapist_name: null,
  home_visit_access_note: null,
  special_note: null,
  remark: null,
  geocode_precision: null,
  treatment_table_required: false,
  take_along_items: [],
};

const termine: AppointmentSlipEntry[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    appointment_type: 'home_visit',
    location_name: null,
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    starts_at: '2027-05-19T12:00:00.000Z',
    ends_at: '2027-05-19T13:00:00.000Z',
    appointment_type: 'practice',
    location_name: 'Hauptstandort Tuebingen',
    location_street: 'Praxisplatz',
    location_house_number: '1',
    location_postal_code: '72072',
    location_city: 'Tuebingen',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(PRAXIS_ABSENDER_KEY, absender);
client.setQueryData(['patient', PATIENT], patient);
client.setQueryData(['appointment-slip', PATIENT], termine);

const wurzel = document.getElementById('wurzel');
if (!wurzel) throw new Error('Wurzelelement der Prüfseite fehlt.');

createRoot(wurzel).render(
  <QueryClientProvider client={client}>
    <MemoryRouter
      initialEntries={[
        `/patienten/${PATIENT}/${blatt === 'aufnahme' ? 'aufnahmeblaetter' : 'terminzettel'}`,
      ]}
    >
      <VorschauProvider>
        <AppShell user={nutzer} onSignOut={() => undefined}>
          <Routes>
            <Route
              path="/patienten/:patientId/aufnahmeblaetter"
              element={<AufnahmeblaetterPage user={nutzer} />}
            />
            <Route
              path="/patienten/:patientId/terminzettel"
              element={<AppointmentSlipPage user={nutzer} />}
            />
          </Routes>
        </AppShell>
      </VorschauProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
