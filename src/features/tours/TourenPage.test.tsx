import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as TodayApi from '@/features/today/api';
import type * as Tagesroute from './tagesroute';
import type * as Startort from './startort';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Tourenseite (MAP-006b): lädt Tagesliste und Tagesroute der gewählten
 * Person, zeigt die Liste und reicht der Karte nur Stopps weiter.
 */

const fetchDayPlan = vi.fn();
const fetchDayRoute = vi.fn();
const karte = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      Promise.resolve([
        { staff_member_id: 'anna', display_name: 'Anna Beispiel' },
        { staff_member_id: 'jannes', display_name: 'Jannes Test' },
      ]),
  };
});

vi.mock('@/features/today/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TodayApi>();
  return { ...actual, fetchDayPlan: (...a: unknown[]) => fetchDayPlan(...a) as unknown };
});

vi.mock('./tagesroute', async (importOriginal) => {
  const actual = await importOriginal<typeof Tagesroute>();
  return { ...actual, fetchDayRoute: (...a: unknown[]) => fetchDayRoute(...a) as unknown };
});

vi.mock('./startort', async (importOriginal) => {
  const actual = await importOriginal<typeof Startort>();
  return { ...actual, fetchStandorte: () => Promise.resolve([]) };
});

vi.mock('./TagesrouteKarte', () => ({
  default: (props: { stopps: unknown[] }) => {
    karte(props);
    return <div>Kartenattrappe</div>;
  },
}));

const { TourenPage } = await import('./TourenPage');

const TERMIN = {
  id: 't1',
  patient_id: 'p',
  staff_member_id: 'jannes',
  appointment_type: 'home_visit',
  kind: 'therapy',
  title: null,
  status: 'confirmed',
  starts_at: '2026-09-10T07:00:00Z',
  ends_at: '2026-09-10T08:00:00Z',
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  location_name: null,
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
  visit_postal_code: '72070',
  visit_city: 'Tuebingen',
  patient_phone: null,
  patient_phone_mobile: null,
  home_visit_access_note: null,
  special_note: null,
  documentation_status: null,
  organization_time_zone: 'Europe/Berlin',
};

beforeEach(() => {
  fetchDayPlan.mockReset();
  fetchDayRoute.mockReset();
  karte.mockReset();
  fetchDayPlan.mockResolvedValue([TERMIN]);
  fetchDayRoute.mockResolvedValue([
    {
      id: 't1',
      kind: 'therapy',
      appointment_type: 'home_visit',
      status: 'confirmed',
      starts_at: TERMIN.starts_at,
      ends_at: TERMIN.ends_at,
      lat: 48.53,
      lon: 9.05,
      geocode_precision: 'address',
      position_source: 'visit',
    },
  ]);
});

describe('TourenPage', () => {
  it('waehlt die eigene Person vor und zeigt den Tag als Liste mit Karte', async () => {
    const user = { ...testUser(['therapist']), staffMemberId: 'jannes' };
    renderWithProviders(<TourenPage user={user} />, '/touren?tag=2026-09-10');

    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
    expect(fetchDayPlan).toHaveBeenCalledWith('2026-09-10', 'jannes');
    expect(fetchDayRoute).toHaveBeenCalledWith('2026-09-10', 'jannes');
    expect(await screen.findByText('Kartenattrappe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drucken' })).toBeInTheDocument();
  });

  it('nimmt die Person aus der Adresse', async () => {
    renderWithProviders(
      <TourenPage user={testUser(['office'])} />,
      '/touren?person=anna&tag=2026-09-10',
    );
    await screen.findByText('Max Mustermann');
    expect(fetchDayPlan).toHaveBeenCalledWith('2026-09-10', 'anna');
  });

  it('sagt es, wenn der Tag keinen Besuch mit Ort hat', async () => {
    fetchDayRoute.mockResolvedValue([]);
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');
    expect(await screen.findByText(/keine Besuche mit Ort/)).toBeInTheDocument();
  });

  it('bietet die Praxis als Start nicht an, solange sie nicht verortet ist', async () => {
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');
    const option = await screen.findByRole('option', { name: /Praxis \(noch nicht verortet\)/ });
    expect(option).toBeDisabled();
  });
});
