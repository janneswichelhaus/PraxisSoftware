import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as UebersichtApi from '@/features/patients/uebersicht';
import type * as AppointmentsApi from './api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

const navigate = vi.fn();
const fetchPatientOverview = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchAssignableTherapists: () =>
    fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
}));

vi.mock('@/features/patients/uebersicht', async (importOriginal) => ({
  ...(await importOriginal<typeof UebersichtApi>()),
  fetchPatientOverview: () => fetchPatientOverview() as Promise<UebersichtApi.Patienteneintrag[]>,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { NewAppointmentStartPage } = await import('./NewAppointmentStartPage');

function eintrag(
  id: string,
  given: string,
  family: string,
  zuletzt: string | null,
): UebersichtApi.Patienteneintrag {
  return {
    id,
    given_name: given,
    family_name: family,
    date_of_birth: '1957-04-30',
    email: null,
    phone: null,
    postal_code: null,
    city: 'Tuebingen',
    last_visit_on: zuletzt,
    next_appointment_at: null,
    open_bases: 0,
    bases_need_appointments: 0,
    bases_need_followup: 0,
    bases_ready: 0,
    bases_in_billing: 0,
    billing_visible: false,
    invoices_issued: null,
    invoices_paid: null,
    outstanding_cents: null,
    invoices_overdue: null,
    reminders_due: null,
  };
}

const MAX = eintrag('66666666-6666-4666-8666-000000000001', 'Max', 'Mustermann', '2026-10-01');
const ERIKA = eintrag('66666666-6666-4666-8666-000000000002', 'Erika', 'Beispiel', '2026-10-12');

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const VORBELEGT = `/termine/neu?datum=2027-05-12&beginn=09%3A00&ende=10%3A00&art=home_visit&person=${STAFF_ANNA}`;

/**
 * Der Tap auf eine freie Stelle im Kalender kennt die Zeit und fragt nach der
 * Person - die Umkehrung des Einstiegs über die Akte (UX-005). Geprüft wird,
 * dass dabei nichts von der Vorbelegung verloren geht.
 */
describe('NewAppointmentStartPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    fetchPatientOverview.mockReset();
    fetchPatientOverview.mockResolvedValue([MAX, ERIKA]);
    fetchAssignableTherapists
      .mockReset()
      .mockResolvedValue([{ staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' }]);
  });

  // ---------------------------------------------------------------------------
  // UX-012: Die Person ist noch gar nicht in der Kartei - der haeufigste Grund
  // fuer einen leeren Treffer. Vorher war das hier eine Sackgasse.
  // ---------------------------------------------------------------------------
  describe('Abstecher: Patient:in anlegen', () => {
    it('bietet den Weg an und nimmt die Vorbelegung als Rueckweg mit', () => {
      renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);

      const link = screen.getByRole('link', { name: 'Patient:in anlegen' });
      const zurueck = new URL(link.getAttribute('href')!, 'http://x').searchParams.get('zurueck');
      expect(link.getAttribute('href')!.startsWith('/patienten/neu?')).toBe(true);
      expect(zurueck).toContain('/termine/neu?');
      expect(zurueck).toContain('datum=2027-05-12');
      expect(zurueck).toContain(`person=${STAFF_ANNA}`);
    });

    it('geht mit der neu angelegten Person direkt ins Terminformular', () => {
      renderWithProviders(<NewAppointmentStartPage />, `${VORBELEGT}&patient=${MAX.id}`);

      expect(navigate).toHaveBeenCalledWith(
        `/patienten/${MAX.id}/termine/neu?datum=2027-05-12&beginn=09%3A00&ende=10%3A00&art=home_visit&person=${STAFF_ANNA}`,
        { replace: true },
      );
    });

    it('ignoriert eine verstellte Kennung still', () => {
      renderWithProviders(<NewAppointmentStartPage />, `${VORBELEGT}&patient=kein-uuid`);

      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('zeigt die vorbelegte Zeit, damit sie vor der Auswahl prüfbar ist', async () => {
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);

    // Eine Zeile (UX-005g): als Datum, nicht als Kennung (KAL-10), mit der
    // Person der Spalte - und ohne „Hausbesuch", den Regelfall (ANN-192).
    expect(await screen.findByText('12.05.2027 · 09:00–10:00 Uhr · Anna Beispiel')).toBeVisible();
    expect(screen.queryByText(/Hausbesuch/)).toBeNull();
    expect(screen.queryByText('Aus dem Kalender übernommen')).toBeNull();
  });

  it('nennt eine abweichende Terminart in der Zeile', async () => {
    renderWithProviders(
      <NewAppointmentStartPage />,
      `/termine/neu?datum=2027-05-12&beginn=09%3A00&ende=10%3A00&art=practice&person=${STAFF_ANNA}`,
    );

    expect(
      await screen.findByText('12.05.2027 · 09:00–10:00 Uhr · Anna Beispiel · Praxis'),
    ).toBeVisible();
  });

  it('verspricht nur, was wirklich vorbelegt ist (KAL-10)', async () => {
    // Der Weg über „Termin anlegen" unter „Ansicht und Filter": ohne Uhrzeit.
    renderWithProviders(
      <NewAppointmentStartPage />,
      `/termine/neu?datum=2027-05-12&art=home_visit&person=${STAFF_ANNA}`,
    );

    expect(screen.getByText('Zuerst die Patient:in wählen.')).toBeInTheDocument();
    // Was fehlt, steht nicht da - kein „noch offen" (UX-005g).
    expect(await screen.findByText('12.05.2027 · Anna Beispiel')).toBeVisible();
    expect(screen.queryByText(/noch offen/)).toBeNull();
  });

  it('fuehrt ueber den Rueckweg in den Kalenderstand zurueck (KAL-19)', () => {
    renderWithProviders(
      <NewAppointmentStartPage />,
      `${VORBELEGT}&zurueck=%2Fkalender%3Fansicht%3Dtag%26datum%3D2027-05-12`,
    );

    expect(screen.getByRole('link', { name: '← Zurück zum Kalender' })).toHaveAttribute(
      'href',
      '/kalender?ansicht=tag&datum=2027-05-12',
    );
  });

  it('reicht die Vorbelegung unveraendert an das Terminformular weiter', async () => {
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);

    const zeile = await screen.findByRole('link', { name: /Mustermann, Max/ });
    const ziel = new URL(zeile.getAttribute('href')!, 'http://test');
    expect(ziel.pathname).toBe(`/patienten/${MAX.id}/termine/neu`);
    expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
    expect(ziel.searchParams.get('beginn')).toBe('09:00');
    expect(ziel.searchParams.get('ende')).toBe('10:00');
    expect(ziel.searchParams.get('art')).toBe('home_visit');
    expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
  });

  it('kommt auch ganz ohne Vorbelegung zurecht', async () => {
    renderWithProviders(<NewAppointmentStartPage />, '/termine/neu');

    // Nichts übernommen - dann steht auch nichts da, und nichts wird versprochen.
    expect(screen.getByText('Zuerst die Patient:in wählen.')).toBeInTheDocument();
    expect(screen.queryByText(/\d{2}\.\d{2}\.\d{4}/)).toBeNull();
    expect(fetchAssignableTherapists).not.toHaveBeenCalled();

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toHaveAttribute(
      'href',
      `/patienten/${MAX.id}/termine/neu`,
    );
  });

  // B10 (BEF-160): statt der Suche ab drei Zeichen eine Liste - zuletzt
  // behandelt zuerst, filter- und sortierbar, die Suche ab dem ersten Zeichen.
  it('zeigt eine Liste statt der Suche ab drei Zeichen, zuletzt behandelt zuerst (B10)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);

    await screen.findByRole('link', { name: /Mustermann, Max/ });
    expect(screen.queryByRole('combobox', { name: 'Patient:in suchen' })).toBeNull();
    const namen = screen.getAllByRole('link', { name: /, / }).map((link) => link.textContent ?? '');
    expect(namen[0]).toMatch(/^Beispiel, Erika/);
    expect(namen[1]).toMatch(/^Mustermann, Max/);

    await user.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(
      screen.getAllByRole('link', { name: /, / }).map((link) => link.textContent ?? '')[0],
    ).toMatch(/^Beispiel, Erika/);

    await user.type(screen.getByLabelText('Patient:in suchen'), 'm');
    expect(screen.queryByRole('link', { name: /Beispiel, Erika/ })).toBeNull();
    // Die Vorbelegung bleibt in der Adresse, auch mit Suche und Sortierung.
    const ziel = new URL(
      screen.getByRole('link', { name: /Mustermann, Max/ }).getAttribute('href')!,
      'http://test',
    );
    expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
    // Der Suchbegriff - meist ein Name - wandert nicht mit (ANN-061).
    expect(ziel.searchParams.get('q')).toBeNull();
  });

  it('beschriftet das Suchfeld sichtbar - hier ist es das Hauptfeld der Seite', () => {
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);
    const label = screen.getByText('Patient:in suchen');
    expect(label.tagName).toBe('LABEL');
    expect(label).not.toHaveClass('sr-only');
  });
});
