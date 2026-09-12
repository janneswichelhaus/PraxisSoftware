import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

const navigate = vi.fn();
const searchPatients = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    searchPatients: (begriff: string) =>
      searchPatients(begriff) as Promise<PatientsApi.PatientSearchHit[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useNavigate: () => navigate };
});

const { NewAppointmentStartPage } = await import('./NewAppointmentStartPage');

const MAX = {
  id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  status: 'active' as const,
};

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
    searchPatients.mockReset();
    searchPatients.mockResolvedValue([MAX]);
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

  it('zeigt die vorbelegte Zeit, damit sie vor der Auswahl prüfbar ist', () => {
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);

    expect(screen.getByText('2027-05-12')).toBeInTheDocument();
    expect(screen.getByText('09:00–10:00 Uhr')).toBeInTheDocument();
    expect(screen.getByText('Hausbesuch')).toBeInTheDocument();
  });

  it('reicht die Vorbelegung unveraendert an das Terminformular weiter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'mus');
    await user.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    const ziel = new URL(String(navigate.mock.calls.at(-1)?.[0]), 'http://test');
    expect(ziel.pathname).toBe(`/patienten/${MAX.id}/termine/neu`);
    expect(ziel.searchParams.get('datum')).toBe('2027-05-12');
    expect(ziel.searchParams.get('beginn')).toBe('09:00');
    expect(ziel.searchParams.get('ende')).toBe('10:00');
    expect(ziel.searchParams.get('art')).toBe('home_visit');
    expect(ziel.searchParams.get('person')).toBe(STAFF_ANNA);
  });

  it('kommt auch ganz ohne Vorbelegung zurecht', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewAppointmentStartPage />, '/termine/neu');

    expect(screen.getAllByText('noch offen').length).toBeGreaterThan(0);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'mus');
    await user.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    expect(navigate).toHaveBeenCalledWith(`/patienten/${MAX.id}/termine/neu`);
  });

  it('beschriftet das Suchfeld sichtbar - hier ist es das Hauptfeld der Seite', () => {
    renderWithProviders(<NewAppointmentStartPage />, VORBELEGT);
    const label = screen.getByText('Patient:in suchen');
    expect(label.tagName).toBe('LABEL');
    expect(label).not.toHaveClass('sr-only');
  });
});
