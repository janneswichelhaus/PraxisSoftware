import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders } from '@/test-utils';
import type * as ReimbursementsApi from './api';

/**
 * Ladestrom als Einstellung der Praxis (ORG-008): drei Werte, nur owner,
 * verbindlich am Server; ohne geladene Werte keine Eingabe.
 */

const fetchElectricitySettings = vi.fn();
const saveElectricitySettings = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ReimbursementsApi>();
  return {
    ...actual,
    fetchElectricitySettings: () => fetchElectricitySettings() as unknown,
    saveElectricitySettings: (...a: unknown[]) => saveElectricitySettings(...a) as unknown,
  };
});

const { LadestromEinstellung } = await import('./LadestromEinstellung');

beforeEach(() => {
  fetchElectricitySettings
    .mockReset()
    .mockResolvedValue({ centsPerKwh: 37, whPerKm: 18, kmPerHour: 6 });
  saveElectricitySettings.mockReset().mockResolvedValue(undefined);
});

describe('LadestromEinstellung', () => {
  it('zeigt die Werte der Praxis und die Rechnung an einem Beispielmonat', async () => {
    const { container } = renderWithProviders(<LadestromEinstellung />);
    expect(screen.getByRole('heading', { name: 'Ladestrom' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Strompreis in ct je kWh')).toHaveValue('37'));
    expect(screen.getByLabelText('Verbrauch bei höchster Stufe in Wh je km')).toHaveValue('18');
    expect(screen.getByLabelText('Strecke je Arbeitsstunde in km')).toHaveValue('6');
    expect(
      screen.getByText(
        'Bei 160 geplanten Stunden: 160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh = 6,39 €. Gilt für neue Anträge; gestellte behalten ihre Werte.',
      ),
    ).toBeInTheDocument();
    await act(() => pruefeBarrierefreiheit(container));
  });

  it('speichert geänderte Werte und rechnet das Beispiel mit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LadestromEinstellung />);
    const preis = screen.getByLabelText('Strompreis in ct je kWh');
    await waitFor(() => expect(preis).toHaveValue('37'));
    await user.clear(preis);
    await user.type(preis, '40');
    // 160 h × 6 × 18 Wh = 17,28 kWh × 40 ct = 691,2 ct.
    expect(screen.getByText(/= 6,91 €\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ladestrom speichern' }));
    expect(saveElectricitySettings).toHaveBeenCalledWith({
      centsPerKwh: 40,
      whPerKm: 18,
      kmPerHour: 6,
    });
    expect(
      await screen.findByText('Die Werte für den Ladestrom sind gespeichert.'),
    ).toBeInTheDocument();
  });

  it('nimmt nur Werte in ihren Grenzen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LadestromEinstellung />);
    const strecke = screen.getByLabelText('Strecke je Arbeitsstunde in km');
    await waitFor(() => expect(strecke).toHaveValue('6'));
    await user.clear(strecke);
    await user.type(strecke, '31');
    expect(screen.getByText('Eine ganze Zahl von 1 bis 30')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ladestrom speichern' })).toBeDisabled();
    await user.clear(strecke);
    await user.type(strecke, '0');
    expect(screen.getByRole('button', { name: 'Ladestrom speichern' })).toBeDisabled();
  });

  it('sperrt Felder und Speichern, solange die Werte nicht geladen sind', async () => {
    fetchElectricitySettings.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<LadestromEinstellung />);
    expect(
      await screen.findByText(/Die Werte für den Ladestrom konnten nicht geladen werden/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Strompreis in ct je kWh')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ladestrom speichern' })).toBeDisabled();
  });

  it('nennt einen Fehler beim Speichern mit dem nächsten Schritt', async () => {
    const user = userEvent.setup();
    saveElectricitySettings.mockRejectedValue(new Error('Dafür fehlt die Berechtigung.'));
    renderWithProviders(<LadestromEinstellung />);
    await waitFor(() => expect(screen.getByLabelText('Strompreis in ct je kWh')).toHaveValue('37'));
    await user.click(screen.getByRole('button', { name: 'Ladestrom speichern' }));
    expect(
      await screen.findByText(
        'Dafür fehlt die Berechtigung. Bitte die Verbindung prüfen und erneut speichern.',
      ),
    ).toBeInTheDocument();
  });
});
