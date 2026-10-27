import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';

/** UBK-010: Fahrzeitfaktor unter Planung, neben dem Startort (ANN-237). */

const { fetchFahrzeitfaktor, saveFahrzeitfaktor } = vi.hoisted(() => ({
  fetchFahrzeitfaktor: vi.fn(),
  saveFahrzeitfaktor: vi.fn(),
}));

vi.mock('./fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => fetchFahrzeitfaktor() as Promise<number>,
  saveFahrzeitfaktor: (wert: number) => saveFahrzeitfaktor(wert) as Promise<void>,
}));

const { FahrzeitfaktorEinstellung } = await import('./FahrzeitfaktorEinstellung');

beforeEach(() => {
  fetchFahrzeitfaktor.mockReset();
  saveFahrzeitfaktor.mockReset();
  saveFahrzeitfaktor.mockResolvedValue(undefined);
});

describe('FahrzeitfaktorEinstellung', () => {
  it('zeigt den Wert der Praxis und speichert einen neuen', async () => {
    fetchFahrzeitfaktor.mockResolvedValue(1.5);
    renderWithProviders(<FahrzeitfaktorEinstellung />);

    const feld = await screen.findByLabelText('Faktor');
    await waitFor(() => expect(feld).toHaveValue('1.5'));
    expect(screen.getByRole('option', { name: '1,5 (≈ 15 km/h)' })).toBeInTheDocument();
    // 1,0 bis 2,5 in Schritten von 0,1.
    expect(screen.getAllByRole('option')).toHaveLength(16);

    await userEvent.selectOptions(feld, '2');
    await userEvent.click(screen.getByRole('button', { name: 'Faktor speichern' }));
    await waitFor(() => expect(saveFahrzeitfaktor).toHaveBeenCalledWith(2));
    expect(await screen.findByText('Der Fahrzeitfaktor ist gespeichert.')).toBeInTheDocument();
  });

  it('sperrt die Auswahl, solange der Wert nicht geladen ist', async () => {
    fetchFahrzeitfaktor.mockRejectedValue(new Error('weg'));
    renderWithProviders(<FahrzeitfaktorEinstellung />);

    expect(
      await screen.findByText(/Fahrzeitfaktor konnte nicht geladen werden/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Faktor')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Faktor speichern' })).toBeDisabled();
    expect(saveFahrzeitfaktor).not.toHaveBeenCalled();
  });

  it('sagt es, wenn der Server ablehnt', async () => {
    fetchFahrzeitfaktor.mockResolvedValue(1.5);
    saveFahrzeitfaktor.mockRejectedValue(
      new Error('Der Fahrzeitfaktor konnte nicht gespeichert werden.'),
    );
    renderWithProviders(<FahrzeitfaktorEinstellung />);
    await waitFor(() => expect(screen.getByLabelText('Faktor')).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Faktor speichern' }));
    expect(
      await screen.findByText(/Der Fahrzeitfaktor konnte nicht gespeichert werden\./),
    ).toBeInTheDocument();
  });
});
