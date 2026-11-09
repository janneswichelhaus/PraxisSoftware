import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import type { Plan as Ernaehrungsplan } from '@/features/nutrition/plaene';
import type * as PlattformApi from './api';
import type { EigeneErnaehrung, EigenesTagebuch, Plattformzugang } from './api';

const ladeErnaehrung = vi.fn();
const ladeTagebuch = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeErnaehrung: (...a: unknown[]) => ladeErnaehrung(...a) as Promise<EigeneErnaehrung | null>,
  ladeTagebuch: (...a: unknown[]) => ladeTagebuch(...a) as Promise<EigenesTagebuch | null>,
}));

const { Plan } = await import('./Plan');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

const JE100 = {
  energy_kcal: 100,
  protein_g: 4,
  fat_g: 2,
  carbohydrate_g: 16,
  sugar_g: null,
  fibre_g: null,
  saturated_fat_g: null,
  salt_g: null,
};

const PLAN: Ernaehrungsplan = {
  id: 'plan-1',
  title: 'Woche 1',
  day_count: 2,
  starts_on: '2026-11-06',
  ended_on: null,
  updated_at: '2026-11-06T10:00:00Z',
  days: [
    {
      day: 1,
      meals: [
        {
          meal: 'breakfast',
          items: [
            {
              kind: 'recipe',
              id: 'rezept-1',
              name: 'Haferbrei mit Beeren',
              amount: 300,
              portion_label: '1 Portion',
              portion_count: 1,
              energy_kcal: 311,
              food: {
                kind: 'recipe',
                id: 'rezept-1',
                source: 'recipe',
                name: 'Haferbrei mit Beeren',
                brand: null,
                base_unit: 'g',
                per_100: JE100,
                portions: [{ label: '1 Portion', amount: 300 }],
              },
            },
          ],
        },
      ],
    },
    { day: 2, meals: [] },
  ],
  recipes: [
    {
      kind: 'recipe',
      id: 'rezept-1',
      owner: 'practice',
      name: 'Haferbrei mit Beeren',
      servings: 2,
      instructions: 'Haferflocken in der Milch aufkochen.',
      base_unit: 'g',
      ingredients: [
        {
          food_kind: 'catalog',
          food_id: 'hafer',
          name: 'Haferflocken',
          brand: null,
          base_unit: 'g',
          amount: 80,
          portion_label: null,
          portion_count: null,
          per_100: JE100,
          energy_kcal: 296,
        },
      ],
      total_amount: 600,
      per_portion: { energy_kcal: 311, protein_g: 12, fat_g: 6, carbohydrate_g: 49 },
      per_100: JE100,
      portions: [{ label: '1 Portion', amount: 300 }],
      starter_key: null,
      updated_at: '2026-11-06T10:00:00Z',
    },
  ],
};

beforeEach(() => {
  ladeErnaehrung.mockReset().mockResolvedValue({
    today: '2026-11-06',
    can_write: true,
    profile: { plans: [PLAN], own_foods: [], own_recipes: [] },
  });
  ladeTagebuch.mockReset().mockResolvedValue({ hide_numbers: false });
});

describe('Plan auf der Plattform (ADR-027 Punkt 14)', () => {
  it('zeigt den Tag von heute und ein Rezept mit Zutaten und Zubereitung', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Plan zugang={ZUGANG} />, '/p/ernaehrung/plan');
    expect(await screen.findByRole('heading', { name: 'Woche 1', level: 1 })).toBeVisible();
    expect(screen.getByText('Heute Tag 1 von 2')).toBeVisible();
    await nutzer.click(screen.getByRole('button', { name: /^Haferbrei mit Beeren/ }));
    const fenster = screen.getByRole('dialog', { name: 'Haferbrei mit Beeren' });
    expect(within(fenster).getByText('Haferflocken')).toBeVisible();
    expect(within(fenster).getByText('Haferflocken in der Milch aufkochen.')).toBeVisible();
    expect(within(fenster).getByRole('heading', { name: 'Je Portion', level: 3 })).toBeVisible();
    await nutzer.click(within(fenster).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('am leeren Tag ein Satz; ohne Zahlen keine Energie', async () => {
    const nutzer = userEvent.setup();
    ladeTagebuch.mockResolvedValue({ hide_numbers: true });
    renderWithProviders(<Plan zugang={ZUGANG} />, '/p/ernaehrung/plan');
    expect(await screen.findByText(/^1 Portion$/)).toBeVisible();
    expect(screen.getByText('Tag 1 von 2 · heute')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Vorheriger Tag' })).toBeDisabled();
    await nutzer.click(screen.getByRole('button', { name: 'Nächster Tag' }));
    expect(screen.getByText('Tag 2 von 2')).toBeVisible();
    expect(screen.getByText('Nichts an diesem Tag.')).toBeVisible();
  });

  it('beginnt ein neuer Plan erst später, zeigt es den, der heute gilt', async () => {
    ladeErnaehrung.mockResolvedValue({
      today: '2026-11-06',
      profile: {
        plans: [
          { ...PLAN, id: 'neu', title: 'Woche 2', starts_on: '2026-11-10' },
          { ...PLAN, ended_on: '2026-11-09' },
        ],
        own_foods: [],
        own_recipes: [],
      },
    });
    renderWithProviders(<Plan zugang={ZUGANG} />, '/p/ernaehrung/plan');
    expect(await screen.findByRole('heading', { name: 'Woche 1', level: 1 })).toBeVisible();
  });

  it('ohne offenen Plan ein Leerzustand', async () => {
    ladeErnaehrung.mockResolvedValue({
      today: '2026-11-06',
      profile: { plans: [], own_foods: [], own_recipes: [] },
    });
    renderWithProviders(<Plan zugang={ZUGANG} />, '/p/ernaehrung/plan');
    expect(await screen.findByText('Zurzeit kein Plan')).toBeVisible();
    // Die Seite hat auch leer ihre Überschrift.
    expect(screen.getByRole('heading', { name: 'Ihr Plan', level: 1 })).toBeVisible();
  });
});
