import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

const navigate = vi.fn();
const searchPatients = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    searchPatients: (begriff: string, limit?: number) =>
      searchPatients(begriff, limit) as Promise<PatientsApi.PatientSearchHit[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useNavigate: () => navigate };
});

const { Patientensuche } = await import('./Patientensuche');

const MAX = {
  id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  status: 'active' as const,
};

const PETRA = {
  id: '66666666-6666-4666-8666-000000000003',
  given_name: 'Petra',
  family_name: 'Platzhalter',
  date_of_birth: '1971-12-05',
  status: 'inactive' as const,
};

/**
 * Die Suche ist der Weg von jeder Seite in eine Akte (UX-004). Geprüft wird
 * dreierlei: dass sie nicht vor drei Zeichen anfängt zu fragen, dass sie mit
 * der Tastatur bedienbar ist, und dass ein leeres Ergebnis als Text dasteht
 * statt als leere Fläche.
 */
describe('Patientensuche', () => {
  beforeEach(() => {
    navigate.mockReset();
    searchPatients.mockReset();
    searchPatients.mockResolvedValue([MAX]);
    vi.useRealTimers();
  });

  it('fragt unter drei Zeichen gar nicht erst und sagt warum', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'mu');

    expect(await screen.findByText('Mindestens 3 Zeichen.')).toBeInTheDocument();
    expect(searchPatients).not.toHaveBeenCalled();
  });

  it('sucht ab drei Zeichen serverseitig und zeigt die Treffer', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'mus');

    expect(await screen.findByRole('option', { name: /Max Mustermann/ })).toBeInTheDocument();
    await waitFor(() => expect(searchPatients).toHaveBeenCalledWith('mus', undefined));
  });

  it('nennt das Geburtsdatum zur Unterscheidung Namensgleicher', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'mus');
    expect(await screen.findByText('geboren 30.04.1957')).toBeInTheDocument();
  });

  it('kennzeichnet eine nicht laufende Versorgung als Text', async () => {
    searchPatients.mockResolvedValue([PETRA]);
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'pla');
    expect(await screen.findByText('Nicht in Versorgung')).toBeInTheDocument();
  });

  it('sagt "Kein Treffer" statt eine leere Flaeche zu zeigen', async () => {
    searchPatients.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'xyz');
    expect(await screen.findByText('Kein Treffer.')).toBeInTheDocument();
  });

  it('oeffnet die Akte per Mausklick', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    await user.type(screen.getByRole('combobox', { name: 'Patient:in suchen' }), 'mus');
    await user.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    // Mit Rueckweg auf die Seite, von der aus gesucht wurde (UX-012).
    expect(navigate).toHaveBeenCalledWith(
      `/patienten/${MAX.id}?zurueck=${encodeURIComponent('/')}`,
    );
  });

  it('ist mit der Tastatur bedienbar: Pfeil runter, Eingabe', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    const feld = screen.getByRole('combobox', { name: 'Patient:in suchen' });
    await user.type(feld, 'mus');
    await screen.findByRole('option', { name: /Max Mustermann/ });

    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Max Mustermann/ })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );

    await user.keyboard('{Enter}');
    // Mit Rueckweg auf die Seite, von der aus gesucht wurde (UX-012).
    expect(navigate).toHaveBeenCalledWith(
      `/patienten/${MAX.id}?zurueck=${encodeURIComponent('/')}`,
    );
  });

  it('schliesst die Liste mit Escape, ohne zu navigieren', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    const feld = screen.getByRole('combobox', { name: 'Patient:in suchen' });
    await user.type(feld, 'mus');
    await screen.findByRole('option', { name: /Max Mustermann/ });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('option')).toBeNull());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leert das Feld nach der Auswahl - die naechste Suche faengt vorn an', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Patientensuche />);

    const feld = screen.getByRole('combobox', { name: 'Patient:in suchen' });
    await user.type(feld, 'mus');
    await user.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    expect(feld).toHaveValue('');
  });
});
