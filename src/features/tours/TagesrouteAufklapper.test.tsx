import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DayPlanEntry } from '@/features/today/api';
import type * as Tagesroute from './tagesroute';
import type * as Startort from './startort';
import { renderWithProviders } from '@/test-utils';

/**
 * Die Tagesroute in der Übersicht (MAP-006b): zugeklappt, erst beim
 * Aufklappen geladen - seit UXR-003 mit Aufklappzeichen und einem Weg aus dem
 * Ladefehler, der die Seite stehen lässt.
 */

const fetchDayRoute = vi.fn();

vi.mock('./tagesroute', async (importOriginal) => {
  const actual = await importOriginal<typeof Tagesroute>();
  return { ...actual, fetchDayRoute: (...a: unknown[]) => fetchDayRoute(...a) as unknown };
});

vi.mock('./startort', async (importOriginal) => {
  const actual = await importOriginal<typeof Startort>();
  return { ...actual, fetchStandorte: () => Promise.resolve([]) };
});

vi.mock('./TagesrouteKarte', () => ({
  default: () => <div>Kartenattrappe</div>,
}));

const { TagesrouteAufklapper } = await import('./TagesrouteAufklapper');

const TERMIN: DayPlanEntry = {
  id: 't1',
  patient_id: 'p1',
  staff_member_id: 'anna',
  appointment_type: 'home_visit',
  kind: 'therapy',
  title: null,
  status: 'confirmed',
  starts_at: '2026-09-28T07:00:00Z',
  ends_at: '2026-09-28T08:00:00Z',
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
  documentation_status: 'none',
  organization_time_zone: 'Europe/Berlin',
};

const PUNKT = {
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
};

function zeige() {
  return renderWithProviders(
    <TagesrouteAufklapper datum="2026-09-28" staffMemberId="anna" plan={[TERMIN]} />,
  );
}

/** Klappt auf, wie es der Browser beim Tippen auf die Zeile tut. */
function aufklappen() {
  const details = screen.getByText('Tagesroute auf der Karte').closest('details')!;
  act(() => {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  });
}

beforeEach(() => {
  fetchDayRoute.mockReset();
  fetchDayRoute.mockResolvedValue([PUNKT]);
});

describe('TagesrouteAufklapper', () => {
  it('traegt ein Aufklappzeichen und laedt erst beim Aufklappen (UEB-03)', () => {
    zeige();
    const kopf = screen.getByText('Tagesroute auf der Karte');
    expect(kopf.tagName).toBe('SUMMARY');
    expect(kopf.querySelector('[data-aufklappzeichen]')).not.toBeNull();
    expect(kopf).toHaveClass('min-h-11');
    expect(fetchDayRoute).not.toHaveBeenCalled();
  });

  it('bietet nach einem Ladefehler „Erneut versuchen" an (WRT-01, ZST-04)', async () => {
    const user = userEvent.setup();
    fetchDayRoute.mockRejectedValueOnce(new Error('Funkloch'));
    zeige();
    aufklappen();

    const fehler = (await screen.findByText('Die Tagesroute konnte nicht geladen werden.')).closest(
      '[role="alert"]',
    )!;
    expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText('Kartenattrappe')).toBeInTheDocument();
    expect(fetchDayRoute).toHaveBeenCalledTimes(2);
  });

  it('fuehrt zur Tour mit einem Textlink, dessen Pfeil nicht mitgelesen wird (WRT-08)', async () => {
    zeige();
    aufklappen();

    const link = await screen.findByRole('link', { name: 'Zur Tour mit Fahrzeiten' });
    expect(link).toHaveAttribute('href', '/touren?person=anna&tag=2026-09-28');
    expect(link).toHaveClass('underline', 'min-h-11');
    expect(link.querySelector('[aria-hidden="true"]')).toHaveTextContent('→');
  });
});
