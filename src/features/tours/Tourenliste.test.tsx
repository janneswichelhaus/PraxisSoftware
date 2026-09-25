import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Navigation from '@/lib/location/navigation';
import type { DayPlanEntry } from '@/features/today/api';
import { renderWithProviders } from '@/test-utils';
import type { Stopp } from './tagesroute';

/**
 * Tourenliste (MAP-006b/d): Namen stehen in der Liste, die Navigation bekommt
 * die Koordinate — und erst beim Tippen.
 */

const oeffnen = vi.fn();
const baue = vi.fn();

vi.mock('@/lib/location/navigation', async (importOriginal) => {
  const actual = await importOriginal<typeof Navigation>();
  return {
    ...actual,
    navigationOeffnen: (url: string) => oeffnen(url) as void,
    buildNavigationUrl: (...args: Parameters<typeof actual.buildNavigationUrl>) => {
      baue(...args);
      return actual.buildNavigationUrl(...args);
    },
  };
});

const { Tourenliste } = await import('./Tourenliste');

function termin(id: string, typ: 'home_visit' | 'practice' = 'home_visit'): DayPlanEntry {
  return {
    id,
    patient_id: 'p',
    staff_member_id: 's',
    appointment_type: typ,
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2026-09-10T07:00:00Z',
    ends_at: '2026-09-10T08:00:00Z',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: typ === 'practice' ? 'Hauptstandort' : null,
    visit_street: typ === 'home_visit' ? 'Testweg' : null,
    visit_house_number: typ === 'home_visit' ? '7' : null,
    visit_postal_code: typ === 'home_visit' ? '72072' : null,
    visit_city: typ === 'home_visit' ? 'Tübingen' : null,
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: null,
    organization_time_zone: 'Europe/Berlin',
  };
}

const STOPPS: Stopp[] = [
  {
    nummer: 1,
    termin: termin('a'),
    position: { lat: 48.5164, lon: 9.0349 },
    genauigkeit: 'address',
  },
  { nummer: 2, termin: termin('b'), position: null, genauigkeit: null },
  {
    nummer: 3,
    termin: termin('c', 'practice'),
    position: { lat: 48.52, lon: 9.05 },
    genauigkeit: 'address',
  },
];

beforeEach(() => {
  oeffnen.mockReset();
  baue.mockReset();
});

describe('Tourenliste', () => {
  it('zeigt Name und Anschrift in der Liste, kennzeichnet fehlende Position', () => {
    renderWithProviders(<Tourenliste stopps={STOPPS} zeitzone="Europe/Berlin" startGewaehlt />);
    expect(screen.getAllByText('Erika Beispiel')).toHaveLength(3);
    expect(screen.getByText(/Testweg 7, 72072 Tübingen · ohne Kartenposition/)).toBeInTheDocument();
    expect(screen.getByText('Start an der Praxis')).toBeInTheDocument();
  });

  it('baut vor dem Tippen keine URL', () => {
    renderWithProviders(
      <Tourenliste stopps={STOPPS} zeitzone="Europe/Berlin" startGewaehlt={false} />,
    );
    expect(baue).not.toHaveBeenCalled();
    expect(document.querySelector('a[href*="google"], a[href^="geo:"]')).toBeNull();
  });

  it('uebergibt die Koordinate, wenn es eine gibt - sonst die Anschrift ohne Namen', async () => {
    renderWithProviders(
      <Tourenliste stopps={STOPPS} zeitzone="Europe/Berlin" startGewaehlt={false} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Navigation zu Stopp 1 starten' }));
    expect(oeffnen.mock.calls[0]![0]).toContain('destination=48.5164%2C9.0349');

    await userEvent.click(screen.getByRole('button', { name: 'Navigation zu Stopp 2 starten' }));
    const zweite = oeffnen.mock.calls[1]![0] as string;
    expect(decodeURIComponent(zweite.replace(/\+/g, ' '))).toContain('Testweg 7');
    expect(zweite).not.toMatch(/Erika|Beispiel/);
  });

  it('bietet fuer einen Praxistermin keine Navigation an', () => {
    renderWithProviders(
      <Tourenliste stopps={STOPPS} zeitzone="Europe/Berlin" startGewaehlt={false} />,
    );
    expect(screen.queryByRole('button', { name: 'Navigation zu Stopp 3 starten' })).toBeNull();
  });
});
