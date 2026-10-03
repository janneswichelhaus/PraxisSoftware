import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const fetchAssignableTherapists = vi.fn();
const fetchStandorte = vi.fn();
const karte = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () => fetchAssignableTherapists() as unknown,
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
  return { ...actual, fetchStandorte: () => fetchStandorte() as unknown };
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

beforeEach(() => {
  fetchDayPlan.mockReset();
  fetchDayRoute.mockReset();
  fetchAssignableTherapists.mockReset();
  fetchStandorte.mockReset();
  karte.mockReset();
  fetchDayPlan.mockResolvedValue([TERMIN]);
  fetchDayRoute.mockResolvedValue([PUNKT]);
  fetchAssignableTherapists.mockResolvedValue([
    { staff_member_id: 'anna', display_name: 'Anna Beispiel' },
    { staff_member_id: 'jannes', display_name: 'Jannes Test' },
  ]);
  fetchStandorte.mockResolvedValue([]);
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
    // Das Wort der Praxis: Fehlzeiten, nicht „interne Termine" (TER-22).
    expect(
      screen.getByText(
        'Videotermine und Fehlzeiten haben keinen Weg und stehen deshalb nicht in der Tour.',
      ),
    ).toBeInTheDocument();
  });

  it('bietet die Praxis als Start nicht an, solange sie keine Kartenposition hat', async () => {
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');
    const option = await screen.findByRole('option', { name: 'Praxis (ohne Kartenposition)' });
    expect(option).toBeDisabled();
  });
});

describe('TourenPage nach dem UX-Review (UXR-003)', () => {
  const jannes = { ...testUser(['therapist']), staffMemberId: 'jannes' };

  it('druckt das Datum mit - im Titel der Liste, ohne Routensumme (TER-12)', async () => {
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');

    const titel = await screen.findByRole('heading', {
      name: 'Tourenliste · Jannes Test · 10.09.2026',
    });
    // Routensumme und ihre Meldungen gehören zur Bedienung, nicht aufs Papier.
    const summe = within(titel.closest('section')!).getByText(
      'Route und Fahrzeiten werden berechnet …',
    );
    expect(summe.closest('.print\\:hidden')).not.toBeNull();
  });

  it('fuehrt vom Stopp in den Termin und zurueck in diese Tour, mit Tag und Person (TER-03)', async () => {
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');

    const stopp = await screen.findByRole('link', { name: 'Max Mustermann' });
    expect(stopp).toHaveAttribute(
      'href',
      `/kalender?termin=t1&zurueck=${encodeURIComponent('/touren?tag=2026-09-10&person=jannes')}`,
    );
  });

  it('bietet nach einem Ladefehler „Erneut versuchen" an, ohne Ratefrage (WRT-01, ZST-04)', async () => {
    const user = userEvent.setup();
    fetchDayRoute.mockRejectedValueOnce(new Error('Funkloch'));
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');

    const fehler = (await screen.findByText('Die Tagesroute konnte nicht geladen werden.')).closest(
      '[role="alert"]',
    )!;
    expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(fehler).not.toHaveTextContent(/angemeldet/);

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
  });

  it('sagt es, wenn keine behandelnde Person hinterlegt ist (TER-11)', async () => {
    fetchAssignableTherapists.mockResolvedValue([]);
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');
    expect(await screen.findByText('Keine behandelnde Person hinterlegt')).toBeInTheDocument();
  });

  it('zeigt, dass die Personen noch geladen werden (TER-11)', () => {
    fetchAssignableTherapists.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');
    expect(screen.getByRole('status')).toHaveTextContent('Personen werden geladen …');
  });

  it('bietet nach einem Fehler der Personenliste „Erneut versuchen" an (ZST-07)', async () => {
    const user = userEvent.setup();
    fetchAssignableTherapists.mockRejectedValueOnce(new Error('Funkloch'));
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');

    const fehler = (
      await screen.findByText('Die behandelnden Personen konnten nicht geladen werden.')
    ).closest('[role="alert"]')!;
    expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('link', { name: 'Max Mustermann' })).toBeInTheDocument();
  });

  it('behauptet vor dem Laden der Standorte nichts ueber den Startort (TER-11, ZST-09)', async () => {
    fetchStandorte.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');
    expect(await screen.findByRole('option', { name: 'Praxis' })).toBeDisabled();
    unmount();

    fetchStandorte.mockRejectedValue(new Error('Funkloch'));
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');
    expect(
      await screen.findByRole('option', { name: 'Praxis (Startort nicht geladen)' }),
    ).toBeDisabled();
  });

  it('erklaert den Datenweg ohne Projekt- und Technikwoerter (WRT-03, TER-07)', async () => {
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');
    const fussnote = await screen.findByText(/Zur Route gehen nur Koordinaten/);
    expect(fussnote).toHaveTextContent(
      'erst, wenn Vertrag, Schweigepflicht (§ 203 StGB) und Datenschutz-Folgenabschätzung geklärt sind.',
    );
    expect(fussnote).not.toHaveTextContent(/ADR|Gate|Server/);
  });
});
