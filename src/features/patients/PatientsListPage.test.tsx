import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toHaveAttribute(
      'href',
      '/patienten/1',
    );
    // Das Etikett des Systems, groß geschrieben wie der Filter (PAT-14, WRT-16).
    const erika = screen.getByRole('link', { name: /Beispiel, Erika/ });
    expect(within(erika).getByText('Nicht in Versorgung')).toBeInTheDocument();
  });

  it('bietet das Anlegen unter demselben Namen wie die Kopfsuche an (PAT-21)', async () => {
    fetchPatients.mockResolvedValue([]);
    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByRole('link', { name: 'Patient:in anlegen' })).toHaveAttribute(
      'href',
      '/patienten/neu',
    );
  });

  // PAT-08: Die Akte führt zurück in die gefilterte Liste. Vorher stand sie
  // nach jeder geöffneten Akte wieder ungefiltert da.
  it('gibt der Akte Suchbegriff und Statusfilter als Rückweg mit', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?q=erika&status=inactive');

    const link = await screen.findByRole('link', { name: /Beispiel, Erika/ });
    const ziel = new URL(link.getAttribute('href') ?? '', 'http://liste.test');
    expect(ziel.pathname).toBe('/patienten/2');
    expect(ziel.searchParams.get('zurueck')).toBe('/patienten?q=erika&status=inactive');
  });

  it('nimmt den Statusfilter in das Auswahlfeld des Systems auf (PAT-14, UIK-19)', async () => {
    fetchPatients.mockResolvedValue([patient('1', 'Max', 'Mustermann', 'active')]);
    renderWithProviders(<PatientsListPage />);

    await screen.findByRole('link', { name: /Mustermann, Max/ });
    // 48 px wie das Filterfeld daneben, nicht 44.
    expect(screen.getByLabelText('Versorgung')).toHaveClass('h-12');
  });

  it('filtert die Anzeige ueber die Suche', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'active'),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    await user.type(screen.getByLabelText('Liste filtern'), 'erika');

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
  });

  it('zeigt bei einem Fehler eine verstaendliche Meldung statt einer leeren Liste', async () => {
    fetchPatients.mockRejectedValue(new Error('rls'));

    renderWithProviders(<PatientsListPage />);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Die Patientenliste konnte nicht geladen werden.');
    // Kein technisches Detail nach aussen (PROJECT_PRINCIPLES.md 13) - und
    // keine Ratefrage nach der Anmeldung, sondern ein Schritt (WRT-01).
    expect(meldung.textContent).not.toMatch(/rls/i);
    expect(meldung.textContent).not.toMatch(/angemeldet/);
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und später erneut versuchen.');
  });

  it('laedt die Liste nach einem Fehler auf Wunsch erneut (UIK-16)', async () => {
    // Die Datei setzt den Mock sonst nirgends zurück; gezählt werden hier nur
    // die Aufrufe dieses Tests.
    fetchPatients.mockReset();
    fetchPatients.mockRejectedValueOnce(new Error('offline'));
    fetchPatients.mockResolvedValueOnce([patient('1', 'Max', 'Mustermann', 'active')]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    const meldung = await screen.findByRole('alert');
    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toBeInTheDocument();
    expect(fetchPatients).toHaveBeenCalledTimes(2);
  });

  it('zeigt eine leere Kartei ohne Fehlermeldung', async () => {
    fetchPatients.mockResolvedValue([]);

    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByText('Noch keine Patient:innen')).toBeInTheDocument();
    // Der leere Zustand nennt den nächsten Schritt (PAT-22).
    expect(
      screen.getByText('Die erste Akte entsteht über „Patient:in anlegen“.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('filtert ueber die Suche auch nach Ort, Telefon und E-Mail', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active', { city: 'Tuebingen' }),
      patient('2', 'Erika', 'Beispiel', 'active', {
        city: 'Hamburg',
        phone: '0221 555123',
        email: 'erika@example.test',
      }),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    await user.type(screen.getByLabelText('Liste filtern'), '555123');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Liste filtern'));
    await user.type(screen.getByLabelText('Liste filtern'), 'hamburg');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
  });

  it('filtert nach Status aktiv/inaktiv', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Versorgung'), 'active');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Beispiel, Erika/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Mustermann, Max/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Versorgung'), 'inactive');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    });
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
  });

  it('zeigt "Keine Treffer" statt der Leerlauf-Meldung, wenn ein Filter alles ausblendet', async () => {
    fetchPatients.mockResolvedValue([patient('1', 'Max', 'Mustermann', 'active')]);
    const user = userEvent.setup();

    renderWithProviders(<PatientsListPage />);
    await screen.findByRole('link', { name: /Mustermann, Max/ });

    await user.selectOptions(screen.getByLabelText('Versorgung'), 'inactive');

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
    await screen.findByRole('link', { name: /Mustermann, Max/ });
    expect(screen.getByTestId('search-params')).toHaveTextContent('');

    await user.type(screen.getByLabelText('Liste filtern'), 'erika');
    await waitFor(() => {
      expect(screen.getByTestId('search-params')).toHaveTextContent('q=erika');
    });

    await user.selectOptions(screen.getByLabelText('Versorgung'), 'inactive');
    await waitFor(() => {
      const params = screen.getByTestId('search-params').textContent ?? '';
      expect(params).toContain('q=erika');
      expect(params).toContain('status=inactive');
    });

    await user.selectOptions(screen.getByLabelText('Versorgung'), 'all');
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

    expect(await screen.findByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mustermann, Max/ })).toBeNull();
    expect(screen.getByLabelText('Liste filtern')).toHaveValue('erika');
    expect(screen.getByLabelText('Versorgung')).toHaveValue('inactive');
  });

  it('ignoriert einen ungueltigen Status-Wert aus der URL statt abzustuerzen', async () => {
    fetchPatients.mockResolvedValue([
      patient('1', 'Max', 'Mustermann', 'active'),
      patient('2', 'Erika', 'Beispiel', 'inactive'),
    ]);

    renderWithProviders(<PatientsListPage />, '/patienten?status=geloescht');

    expect(await screen.findByRole('link', { name: /Mustermann, Max/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Beispiel, Erika/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Versorgung')).toHaveValue('all');
  });

  it('beherbergt die serverseitige Namenssuche des Bereichs (UX-013, E17)', async () => {
    // Die Suche aus der Kopfleiste wohnt seit UX-013 auch hier: Sie springt
    // aus dem gesamten Bestand in eine Akte. Der Filter darunter ist etwas
    // anderes - er engt die Liste ein, die schon geladen ist.
    fetchPatients.mockResolvedValue([patient('1', 'Max', 'Mustermann', 'active')]);
    renderWithProviders(<PatientsListPage />);

    expect(await screen.findByRole('combobox', { name: 'Patient:in suchen' })).toBeInTheDocument();
    expect(screen.getByLabelText('Liste filtern')).toBeInTheDocument();
  });
});
