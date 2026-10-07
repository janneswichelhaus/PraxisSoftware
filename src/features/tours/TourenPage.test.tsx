import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

// UBK-015: Route über die eigene Function; ohne Angabe bleibt sie offen.
const rufeFunktionAuf = vi.fn((): Promise<unknown> => new Promise(() => {}));
vi.mock('@/lib/location/funktion', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  rufeFunktionAuf: () => rufeFunktionAuf(),
}));
vi.mock('./fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => Promise.resolve(1),
  saveFahrzeitfaktor: () => Promise.resolve(),
}));

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
  rufeFunktionAuf.mockReset();
  rufeFunktionAuf.mockImplementation(() => new Promise(() => {}));
});

describe('TourenPage', () => {
  it('waehlt die eigene Person vor und zeigt den Tag als Liste mit Karte', async () => {
    const user = { ...testUser(['therapist']), staffMemberId: 'jannes' };
    renderWithProviders(<TourenPage user={user} />, '/touren?tag=2026-09-10');

    expect(await screen.findByText('Max Mustermann')).toBeInTheDocument();
    expect(fetchDayPlan).toHaveBeenCalledWith('2026-09-10', 'jannes');
    expect(fetchDayRoute).toHaveBeenCalledWith('2026-09-10', 'jannes');
    // UBK-009: Am Telefon steht die Karte zugeklappt - die Liste zuerst. Sie
    // wird erst gezeichnet, wenn jemand sie aufklappt.
    expect(screen.queryByText('Kartenattrappe')).toBeNull();
    fireEvent.click(screen.getByText('Karte'));
    expect(await screen.findByText('Kartenattrappe')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Drucken' })).toBeInTheDocument();
  });

  it('fasst am Handy Person, Tag und Orte in einer Zeile mit „ändern" zusammen (Runde 3)', async () => {
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-10-06');
    await screen.findByText('Max Mustermann');
    expect(screen.getByText(/· Di, 06\.10\.$/)).toBeInTheDocument();
    expect(screen.getByText(/^Start und Ende: |^Start: /)).toBeInTheDocument();

    const aendern = screen.getByRole('button', { name: 'ändern' });
    expect(aendern).toHaveAttribute('aria-expanded', 'false');
    const felder = document.getElementById(aendern.getAttribute('aria-controls')!)!;
    // Zu am Handy, offen ab 640 px; Person, Tag, Start und Ende in einem Bereich.
    expect(felder).toHaveClass('hidden', 'sm:grid');
    for (const name of ['Person', 'Tag', 'Start', 'Ende']) {
      expect(felder).toContainElement(screen.getByLabelText(name));
    }
    fireEvent.click(aendern);
    expect(aendern).toHaveAttribute('aria-expanded', 'true');
    expect(felder).toHaveClass('grid');
    expect(felder).not.toHaveClass('hidden');
    expect(screen.queryByText(/Die Besuche eines Tages in Fahrtreihenfolge/)).toBeNull();
  });

  it('stellt die Liste vor die Karte und das Drucken am Handy darunter (Runde 3, ANN-254)', async () => {
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');
    await screen.findByText('Max Mustermann');
    const liste = screen.getByRole('heading', { name: /^Tourenliste/ });
    const karte = screen.getByRole('heading', { name: 'Karte' });
    expect(liste.compareDocumentPosition(karte) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const drucken = screen.getByRole('button', { name: 'Tourenliste drucken' });
    expect(drucken).toHaveClass('sm:hidden');
    expect(
      screen
        .getByRole('list', { name: 'Stopps in Fahrtreihenfolge' })
        .compareDocumentPosition(drucken) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Ab 640 px steht „Drucken" oben rechts.
    expect(screen.getByRole('button', { name: 'Drucken' })).toHaveClass('max-sm:hidden');
  });

  it('teilt ab 1024 px in zwei Spalten, die Karte rechts und mitlaufend (Runde 3)', async () => {
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');
    await screen.findByText('Max Mustermann');
    const karte = screen.getByRole('heading', { name: 'Karte' }).closest('details')!.parentElement!;
    expect(karte).toHaveClass('lg:col-start-2', 'lg:sticky');
    expect(karte.parentElement).toHaveClass('lg:grid', 'lg:grid-cols-[5fr_6fr]');
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
    // Start und Ende (UBK-015) - beide bieten sie nicht an.
    const optionen = await screen.findAllByRole('option', { name: 'Praxis (ohne Kartenposition)' });
    expect(optionen).toHaveLength(2);
    for (const option of optionen) expect(option).toBeDisabled();
  });
});

describe('TourenPage: Garage und Rueckweg (UBK-015, ANN-240)', () => {
  const PRAXIS = {
    id: 'ort',
    name: 'Praxis',
    street: 'Praxisweg',
    house_number: '1',
    postal_code: '72070',
    city: 'Tuebingen',
    lat: 48.5,
    lon: 9.05,
    geocode_precision: 'address',
  };

  it('beginnt und endet voreingestellt an der Garage und zeigt den Rueckweg', async () => {
    fetchStandorte.mockResolvedValue([
      { ...PRAXIS, garage_street: 'Radweg', garage_lat: 48.49, garage_lon: 9.04 },
    ]);
    rufeFunktionAuf.mockResolvedValue({
      ok: true,
      quelle: 'anbieter',
      value: {
        distanceMeters: 7000,
        durationSeconds: 28 * 60,
        legs: [
          { distanceMeters: 3000, durationSeconds: 10 * 60 },
          { distanceMeters: 4000, durationSeconds: 18 * 60 },
        ],
        geometry: [],
      },
    });
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');

    await screen.findByText('Max Mustermann');
    expect(screen.getByLabelText('Start')).toHaveValue('garage');
    expect(screen.getByLabelText('Ende')).toHaveValue('garage');
    expect(screen.getByText('Start an der Garage')).toBeInTheDocument();
    const ende = await screen.findByTestId('tour-ende');
    expect(ende).toHaveTextContent('Ende an der Garage');
    expect(ende).toHaveTextContent(/Rückweg 18 Min\. · 4,0 km/);
  });

  it('zeigt keinen Rueckweg, wenn der letzte Besuch an der Garage liegt - nur das Ende', async () => {
    fetchStandorte.mockResolvedValue([
      { ...PRAXIS, garage_street: 'Radweg', garage_lat: 48.49, garage_lon: 9.04 },
    ]);
    rufeFunktionAuf.mockResolvedValue({
      ok: true,
      quelle: 'anbieter',
      value: {
        distanceMeters: 3000,
        durationSeconds: 10 * 60,
        legs: [
          { distanceMeters: 3000, durationSeconds: 10 * 60 },
          { distanceMeters: 0, durationSeconds: 0 },
        ],
        geometry: [],
      },
    });
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');

    const ende = await screen.findByTestId('tour-ende');
    // Erst wenn die Route da ist, steht fest, dass kein Rückweg kommt.
    await waitFor(() => expect(rufeFunktionAuf).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText('Route und Fahrzeiten werden berechnet …')).toBeNull(),
    );
    expect(ende).toHaveTextContent('Ende an der Garage');
    expect(ende).not.toHaveTextContent('Gleicher Ort');
  });

  it('nimmt ohne Garage die Praxis und laesst das Ende am letzten Besuch zu', async () => {
    const user = userEvent.setup();
    fetchStandorte.mockResolvedValue([PRAXIS]);
    renderWithProviders(<TourenPage user={testUser(['therapist'])} />, '/touren?tag=2026-09-10');
    await screen.findByText('Max Mustermann');
    expect(screen.getByLabelText('Start')).toHaveValue('standort');
    expect(screen.getAllByRole('option', { name: 'Garage (nicht gesetzt)' })[0]).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Ende'), 'besuch');
    expect(screen.queryByTestId('tour-ende')).toBeNull();
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
    for (const option of await screen.findAllByRole('option', { name: 'Praxis' })) {
      expect(option).toBeDisabled();
    }
    unmount();

    fetchStandorte.mockRejectedValue(new Error('Funkloch'));
    renderWithProviders(<TourenPage user={jannes} />, '/touren?tag=2026-09-10');
    for (const option of await screen.findAllByRole('option', {
      name: 'Praxis (Startort nicht geladen)',
    })) {
      expect(option).toBeDisabled();
    }
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
