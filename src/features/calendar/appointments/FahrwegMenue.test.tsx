import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as NavigationModul from '@/lib/location/navigation';
import { renderWithProviders } from '@/test-utils';

/** UBK-016: Menü am Fahrweg - Handoff nur auf Tipp, nur mit Koordinate (ANN-241). */

const { navigationOeffnen } = vi.hoisted(() => ({ navigationOeffnen: vi.fn() }));
vi.mock('@/lib/location/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof NavigationModul>()),
  navigationOeffnen: (url: string) => navigationOeffnen(url) as unknown,
}));

const { FahrwegMenue } = await import('./FahrwegMenue');

const WEG = {
  von: 'Max Mustermann',
  nach: 'Garage',
  minuten: 18,
  meter: 4500,
  ziel: { kind: 'coordinate' as const, position: { lat: 48.49, lon: 9.04 } },
  rueckweg: true,
  tourZiel: '/touren?tag=2027-05-12&person=anna',
};

describe('FahrwegMenue', () => {
  it('nennt den Weg und uebergibt erst auf Tipp nur das Ziel', async () => {
    const schliessen = vi.fn();
    renderWithProviders(<FahrwegMenue weg={WEG} onSchliessen={schliessen} />);

    const menue = screen.getByRole('group', { name: 'Rückweg' });
    expect(menue).toHaveTextContent('Max Mustermann → nach Garage');
    expect(menue).toHaveTextContent('≈ 18 Min. · 4,5 km');
    // Kein Link mit fertiger Adresse im Quelltext (ADR-019 Punkt 20).
    expect(menue.querySelector('a[href*="google"]')).toBeNull();
    expect(navigationOeffnen).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Navigation starten' }));
    expect(navigationOeffnen).toHaveBeenCalledTimes(1);
    const url = navigationOeffnen.mock.calls[0]![0] as string;
    expect(url).toContain('48.49');
    expect(url).not.toMatch(/Mustermann|Garage/);

    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(schliessen).toHaveBeenCalled();
  });

  it('bietet ohne Ziel keine Navigation, aber den Weg in die Tour', () => {
    renderWithProviders(
      <FahrwegMenue weg={{ ...WEG, ziel: null, meter: null }} onSchliessen={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Navigation starten' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Zur Tour' })).toHaveAttribute('href', WEG.tourZiel);
    expect(screen.getByRole('button', { name: 'Schließen' })).toHaveFocus();
  });
});
