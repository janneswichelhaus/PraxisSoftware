import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils';
import type { Lebensmittel } from './lebensmittel';
import { LebensmittelSuche } from './LebensmittelSuche';

/**
 * Lebensmittel suchen und nachschlagen (ERN-EPIC-002): erst ab zwei
 * Zeichen, eigene über den Treffern, Nährwerte und Portionen im Fenster.
 */

const HAFER: Lebensmittel = {
  kind: 'catalog',
  id: 'h',
  source: 'bls',
  name: 'Haferflocken',
  brand: null,
  base_unit: 'g',
  per_100: {
    energy_kcal: 370,
    protein_g: 13.5,
    fat_g: 7,
    carbohydrate_g: 58.7,
    sugar_g: 1.2,
    fibre_g: 10,
    saturated_fat_g: 1.3,
    salt_g: 0,
  },
  portions: [{ label: '1 Esslöffel', amount: 10 }],
};

const EIGENES: Lebensmittel = {
  ...HAFER,
  kind: 'person',
  source: 'person',
  id: 'e',
  name: 'Haferbrei nach Oma',
};

describe('LebensmittelSuche (ERN-EPIC-002)', () => {
  it('fragt erst ab zwei Zeichen und zeigt eigene über den Treffern', async () => {
    const suchen = vi.fn().mockResolvedValue([HAFER]);
    renderWithProviders(
      <LebensmittelSuche
        suchen={suchen}
        schluessel={['test']}
        eigene={[EIGENES]}
        ohneBegriff={<p>Ohne Begriff</p>}
      />,
    );
    expect(screen.getByText('Ohne Begriff')).toBeInTheDocument();
    const feld = screen.getByLabelText('Lebensmittel suchen');
    await userEvent.type(feld, 'h');
    await new Promise((r) => setTimeout(r, 300));
    expect(suchen).not.toHaveBeenCalled();

    await userEvent.type(feld, 'afer');
    await waitFor(() => expect(suchen).toHaveBeenCalledWith('hafer'));
    const eigene = await screen.findByRole('heading', { name: 'Eigene (1)' });
    expect(eigene).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Treffer (1)' })).toBeInTheDocument();
    expect(screen.getByText('370 kcal je 100 g · BLS')).toBeInTheDocument();
  });

  it('zeigt Nährwerte je 100 g und Portionen mit Energie im Fenster', async () => {
    renderWithProviders(
      <LebensmittelSuche suchen={vi.fn().mockResolvedValue([HAFER])} schluessel={['test2']} />,
    );
    await userEvent.type(screen.getByLabelText('Lebensmittel suchen'), 'Haferflocken');
    await userEvent.click(await screen.findByRole('button', { name: /Haferflocken/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Haferflocken' });
    expect(within(fenster).getByText('Je 100 g')).toBeInTheDocument();
    expect(within(fenster).getByText('13,5 g')).toBeInTheDocument();
    expect(within(fenster).getByText('1 Esslöffel · 10 g')).toBeInTheDocument();
    expect(within(fenster).getByText('37 kcal')).toBeInTheDocument();
  });

  it('sagt, wenn nichts gefunden wurde', async () => {
    renderWithProviders(
      <LebensmittelSuche suchen={vi.fn().mockResolvedValue([])} schluessel={['test3']} />,
    );
    await userEvent.type(screen.getByLabelText('Lebensmittel suchen'), 'Xyzzy');
    expect(await screen.findByText('Nichts gefunden für „Xyzzy“.')).toBeInTheDocument();
  });
});
