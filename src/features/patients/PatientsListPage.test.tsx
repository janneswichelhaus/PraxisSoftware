import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSearchParams } from 'react-router-dom';
import type * as PatientsApi from './api';
import type { Patient } from './api';
import { renderWithProviders, testPatient } from '@/test-utils';

/** Macht die aktuelle URL innerhalb des MemoryRouter fuer Assertions sichtbar. */
function SearchParamsProbe() {
  const [params] = useSearchParams();
  return <span data-testid="search-params">{params.toString()}</span>;
}

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
  overrides: Partial<Patient> = {},
): Patient {
  return testPatient({
    id,
    status,
    given_name: given,
    family_name: family,
    city: 'Tuebingen',
    ...overrides,
  });
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

  it('filtert ueber die Suche auch nach Ort, Telefon und E-Mail', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active', { city: 'Koeln' }),
      patient('2', 'Erika', 'Beispiel', 'active', {
        city: 'Hamburg',
        phone: '0221 555123',
        email: 'erika@example.test',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Max Mustermann/ });

    await user.type(screen.getByLabelText('Suche'), '555123');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Max Mustermann/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Suche'));
    await user.type(screen.getByLabelText('Suche'), 'hamburg');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Max Mustermann/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
  });

  it('filtert nach Status aktiv/inaktiv', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Max Mustermann/ });
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'active');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Erika Beispiel/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Max Mustermann/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Max Mustermann/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
  });

  it('zeigt "Keine Treffer" statt der Leerlauf-Meldung, wenn ein Filter alles ausblendet', async () => {
    fetchPatients.mockResolvedValue([patient('1', 'Max', 'Mustermann', 'active')]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Max Mustermann/ });

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive');

    expect(await screen.findByText('Keine Treffer')).toBeInTheDocument();
    expect(screen.queryByText('Noch keine Patient:innen')).toBeNull();
  });

  it('spiegelt Suche und Status in der URL, damit die Ansicht teilbar/bookmarkbar ist', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);
    const user = userEvent.setup();

    renderWithProviders(
      <>
        <PatientsListPage />
        <SearchParamsProbe />
      </>,
    );
    await screen.findByRole('link', { name: /Max Mustermann/ });
    expect(screen.getByTestId('search-params')).toHaveTextContent('');

    await user.type(screen.getByLabelText('Suche'), 'erika');
    await waitFor(() => {
      expect(screen.getByTestId('search-params')).toHaveTextContent('q=erika');
    });

    await user.selectOptions(screen.getByLabelText('Status'), 'inactive');
    await waitFor(() => {
      const params = screen.getByTestId('search-params').textContent ?? '';
      expect(params).toContain('q=erika');
      expect(params).toContain('status=inactive');
    });

    await user.selectOptions(screen.getByLabelText('Status'), 'all');
    await waitFor(() => {
      const params = screen.getByTestId('search-params').textContent ?? '';
      expect(params).toContain('q=erika');
      expect(params).not.toContain('status');
    });
  });

  it('stellt Suche und Status beim Aufruf einer geteilten URL wieder her', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?q=erika&status=inactive');

    expect(await screen.findByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Max Mustermann/ })).toBeNull();
    expect(screen.getByLabelText('Suche')).toHaveValue('erika');
    expect(screen.getByLabelText('Status')).toHaveValue('inactive');
  });

  it('ignoriert einen ungueltigen Status-Wert aus der URL statt abzustuerzen', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?status=geloescht');

    expect(await screen.findByRole('link', { name: /Max Mustermann/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toHaveValue('all');
  });
});
