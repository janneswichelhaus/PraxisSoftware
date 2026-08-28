import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type { Patient } from './api';
import { renderWithProviders } from '@/test-utils';

const fetchPatients = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return { ...actual, fetchPatients: () => fetchPatients() as Promise<Patient[]> };
});

const { PatientsListPage } = await import('./PatientsListPage');

function patient(
  id: string,
  given: string,
  family: string,
  status: 'active' | 'inactive',
): Patient {
  return {
    id,
    status,
    care_started_on: '2026-02-10',
    given_name: given,
    family_name: family,
    date_of_birth: '1957-04-30',
    email: null,
    phone: null,
    street: null,
    postal_code: null,
    city: 'Tuebingen',
  };
}

describe('PatientsListPage', () => {
  it('listet die vom Server freigegebenen Patient:innen', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);

    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByRole('link', { name: /Max Mustermann/ })).toHaveAttribute(
      'href',
      '/patienten/1',
    );
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
    expect(screen.getByText('inaktiv')).toBeInTheDocument();
  });

  it('filtert die Anzeige ueber die Suche', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'active'),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Max Mustermann/ });

    await user.type(screen.getByLabelText('Suche'), 'erika');

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Max Mustermann/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
  });

  it('zeigt bei einem Fehler eine verstaendliche Meldung statt einer leeren Liste', async () => {
    fetchPatients.mockRejectedValue(new Error('rls'));

    renderWithProviders(<PatientsListPage />);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Patientenliste konnte nicht geladen werden.');
    // Kein technisches Detail nach aussen (PROJECT_PRINCIPLES.md 13).
    expect(meldung.textContent).not.toMatch(/rls/i);
  });

  it('zeigt eine leere Kartei ohne Fehlermeldung', async () => {
    fetchPatients.mockResolvedValue([]);

    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByText('Noch keine Patient:innen')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
