import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test-utils';
import type { Lebensmittel, Quelle } from './lebensmittel';
import { LebensmittelSuche, Quellenangabe } from './LebensmittelSuche';

/** Synthetische Quellen in der Form von `public.food_sources` (ANN-657). */
const QUELLEN: Quelle[] = [
  {
    source: 'bls',
    title: 'Bundeslebensmittelschlüssel (BLS), Version 4.0',
    license: 'CC BY 4.0',
    license_url: 'https://creativecommons.org/licenses/by/4.0/deed.de',
    attribution: 'Max Rubner-Institut (2025): BLS 4.0. DOI: 10.0000/beispiel. Lizenz CC BY 4.0.',
    source_url: 'https://www.blsdb.de',
    version: null,
  },
  {
    source: 'off',
    title: 'Open Food Facts, Auszug Deutschland',
    license: 'ODbL 1.0',
    license_url: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: 'Enthält Daten von Open Food Facts (ODbL 1.0).',
    source_url: 'https://world.openfoodfacts.org',
    version: '2026-10',
  },
];

describe('Quellenangabe (ANN-657, DR-146)', () => {
  it('nennt Titel und Lizenz einmal als Kopf, die Zitierung mit Lizenztext auf Abruf', async () => {
    renderWithProviders(<Quellenangabe laden={() => Promise.resolve(QUELLEN)} />);
    const kopf = await screen.findByText(
      'Nährwerte: Bundeslebensmittelschlüssel (BLS), Version 4.0 (CC BY 4.0) · Open Food Facts, Auszug Deutschland (ODbL 1.0)',
    );
    expect(kopf.closest('summary')).not.toBeNull();
    // Keine zweite Zeile mit denselben Namen und kein Aufklapper „Quellenangabe“.
    expect(screen.queryByText('Quellenangabe')).toBeNull();
    expect(screen.getAllByText(/Bundeslebensmittelschlüssel \(BLS\), Version 4\.0/)).toHaveLength(
      1,
    );
    const lizenzen = screen.getAllByText('Lizenz im Wortlaut');
    expect(lizenzen.map((link) => link.getAttribute('href'))).toEqual([
      QUELLEN[0]!.license_url,
      QUELLEN[1]!.license_url,
    ]);
    expect(screen.getByText(/DOI: 10\.0000\/beispiel/)).toBeInTheDocument();
    expect(screen.getByText(/Stand: 2026-10\./)).toBeInTheDocument();
  });
});

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

  it('hält den Suchbegriff aus der Adresse heraus (ADR-011, ADR-027 Punkt 8)', async () => {
    renderWithProviders(
      <>
        <LebensmittelSuche suchen={vi.fn().mockResolvedValue([HAFER])} schluessel={['test4']} />
        <Adresse />
      </>,
      '/praxis/lebensmittel?bereich=treatment',
    );
    await userEvent.type(screen.getByLabelText('Lebensmittel suchen'), 'Schokolade');
    await screen.findByRole('heading', { name: 'Treffer (1)' });
    expect(screen.getByTestId('adresse').textContent).toBe(
      '/praxis/lebensmittel?bereich=treatment',
    );
  });
});

function Adresse() {
  const ort = useLocation();
  return <output data-testid="adresse">{`${ort.pathname}${ort.search}`}</output>;
}
