import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { Lebensmittel } from './lebensmittel';
import type * as LebensmittelApi from './lebensmittelApi';
import type { Rezept } from './rezepte';
import type * as RezepteApi from './rezepteApi';
import { MitgeliefertesRezept, RezeptePage } from './RezeptePage';
import { STARTREZEPTE } from './startrezepte';

const praxisRezepte = vi.fn<() => Promise<Rezept[]>>();
const praxisRezeptSpeichern = vi.fn();
vi.mock('./rezepteApi', async (importOriginal) => ({
  ...(await importOriginal<typeof RezepteApi>()),
  praxisRezepte: () => praxisRezepte(),
  praxisRezeptSpeichern: (...args: unknown[]) => praxisRezeptSpeichern(...args) as unknown,
}));

const lebensmittelSuchen = vi.fn<(begriff: string) => Promise<Lebensmittel[]>>();
vi.mock('./lebensmittelApi', async (importOriginal) => ({
  ...(await importOriginal<typeof LebensmittelApi>()),
  lebensmittelSuchen: (begriff: string) => lebensmittelSuchen(begriff),
}));

function essen(name: string, portionen: { label: string; amount: number }[] = []): Lebensmittel {
  return {
    kind: 'catalog',
    id: `00000000-0000-4000-8000-${String(name.length).padStart(12, '0')}`,
    source: 'bls',
    name,
    brand: null,
    base_unit: 'g',
    per_100: {
      energy_kcal: 100,
      protein_g: 3,
      fat_g: 2,
      carbohydrate_g: 15,
      sugar_g: null,
      fibre_g: null,
      saturated_fat_g: null,
      salt_g: null,
    },
    portions: portionen,
  };
}

const UEBERNOMMEN: Rezept = {
  kind: 'recipe',
  id: 'r-1',
  owner: 'practice',
  name: 'Haferbrei mit Beeren',
  servings: 2,
  instructions: null,
  base_unit: 'g',
  ingredients: [],
  total_amount: 608,
  per_portion: { energy_kcal: 311, protein_g: 12, fat_g: 5, carbohydrate_g: 49 },
  per_100: {
    energy_kcal: 100,
    protein_g: 4,
    fat_g: 2,
    carbohydrate_g: 16,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [{ label: '1 Portion', amount: 304 }],
  starter_key: 'haferbrei-beeren',
  updated_at: '2026-11-06T10:00:00Z',
};

function zeige(pfad: string) {
  const router = createMemoryRouter(
    [
      { path: '/praxis/rezepte', element: <RezeptePage /> },
      { path: '/praxis/rezepte/mitgeliefert/:starterKey', element: <MitgeliefertesRezept /> },
    ],
    { initialEntries: [pfad] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  praxisRezepte.mockReset().mockResolvedValue([UEBERNOMMEN]);
  praxisRezeptSpeichern.mockReset().mockResolvedValue('neu');
  lebensmittelSuchen.mockReset();
});

describe('Rezepte der Praxis mit den mitgelieferten (ANN-844)', () => {
  it('listet die Rezepte der Praxis und darunter nur die noch nicht übernommenen mitgelieferten', async () => {
    zeige('/praxis/rezepte');
    expect(await screen.findByRole('heading', { name: /Rezepte der Praxis/ })).toBeVisible();
    expect(screen.getByText('Haferbrei mit Beeren')).toBeVisible();
    expect(screen.getByText(/^2 Portionen · 311\skcal je Portion$/)).toBeVisible();
    await userEvent.click(screen.getByText('Mitgelieferte Rezepte'));
    const mitgeliefert = screen.getByRole('list', { name: 'Mitgelieferte Rezepte' });
    expect(within(mitgeliefert).getAllByRole('listitem')).toHaveLength(STARTREZEPTE.length - 1);
    expect(within(mitgeliefert).queryByText('Haferbrei mit Beeren')).toBeNull();
  });

  it('übernimmt ein mitgeliefertes Rezept mit den Treffern der Suche und seinem Schlüssel', async () => {
    const nutzer = userEvent.setup();
    lebensmittelSuchen.mockImplementation((begriff) =>
      Promise.resolve(
        begriff === 'Apfel roh'
          ? [essen('Apfel roh', [{ label: '1 Stück (mittel)', amount: 150 }])]
          : begriff === 'Walnüsse'
            ? [essen('Walnüsse')]
            : [],
      ),
    );
    zeige('/praxis/rezepte/mitgeliefert/apfel-walnuesse');
    expect(await screen.findByDisplayValue('Apfel mit Walnüssen')).toBeVisible();
    const zutaten = screen.getByRole('list', { name: 'Zutaten' });
    expect(within(zutaten).getByText('Apfel roh')).toBeVisible();
    expect(within(zutaten).getByText(/^1 Stück \(mittel\) · 150 g/)).toBeVisible();
    // Die Walnüsse kennen „1 Handvoll“ hier nicht: dann gilt die Menge.
    expect(within(zutaten).getByText(/^25 g/)).toBeVisible();
    await nutzer.click(screen.getByRole('button', { name: 'Übernehmen' }));
    expect(praxisRezeptSpeichern).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ name: 'Apfel mit Walnüssen', starter_key: 'apfel-walnuesse' }),
      null,
    );
  });

  it('nennt Zutaten, die der Katalog nicht kennt', async () => {
    lebensmittelSuchen.mockResolvedValue([]);
    zeige('/praxis/rezepte/mitgeliefert/apfel-walnuesse');
    expect(
      await screen.findByText(/Nicht im Katalog gefunden: Apfel roh, Walnüsse\./),
    ).toBeVisible();
  });
});
