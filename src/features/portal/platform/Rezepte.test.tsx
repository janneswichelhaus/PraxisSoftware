import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import type * as PlattformApi from './api';
import type { EigeneErnaehrung, Plattformzugang } from './api';

const ladeErnaehrung = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeErnaehrung: (...a: unknown[]) => ladeErnaehrung(...a) as Promise<EigeneErnaehrung | null>,
}));

const { Rezepte } = await import('./Rezepte');

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

function ernaehrung(canWrite: boolean, rezepte: EigeneErnaehrung['profile']['own_recipes']) {
  return {
    today: '2026-11-06',
    can_write: canWrite,
    can_grant: !canWrite,
    wording_version: '2026-11',
    target_weight_floor_kg: 52.3,
    profile: { own_foods: [], own_recipes: rezepte },
  } as unknown as EigeneErnaehrung;
}

const STULLE = {
  kind: 'recipe' as const,
  id: 'rezept-1',
  owner: 'person' as const,
  name: 'Stulle mit Hafer',
  servings: 2,
  instructions: null,
  base_unit: 'g' as const,
  ingredients: [],
  total_amount: 120,
  per_portion: { energy_kcal: 164, protein_g: 6, fat_g: 2, carbohydrate_g: 28 },
  per_100: {
    energy_kcal: 272.5,
    protein_g: 10,
    fat_g: 3,
    carbohydrate_g: 47,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [{ label: '1 Portion', amount: 60 }],
  starter_key: null,
  updated_at: '2026-11-06T10:00:00Z',
};

beforeEach(() => ladeErnaehrung.mockReset());

describe('Rezepte auf der Plattform (ADR-027 Punkt 9)', () => {
  it('listet die eigenen Rezepte mit Portionen und Energie; anlegen mit Schreibrecht', async () => {
    ladeErnaehrung.mockResolvedValue(ernaehrung(true, [STULLE]));
    renderWithProviders(<Rezepte zugang={ZUGANG} />, '/p/ernaehrung/rezepte?bereich=treatment');
    expect(await screen.findByRole('link', { name: /Stulle mit Hafer/ })).toHaveAttribute(
      'href',
      '/p/ernaehrung/rezepte/rezept-1?bereich=treatment',
    );
    expect(screen.getByText(/^2 Portionen · 164\skcal je Portion$/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Rezept anlegen' })).toBeVisible();
  });

  it('ohne Schreibrecht ohne „Rezept anlegen“, ohne Beratung ein Satz', async () => {
    ladeErnaehrung.mockResolvedValue(ernaehrung(false, []));
    renderWithProviders(<Rezepte zugang={ZUGANG} />, '/p/ernaehrung/rezepte');
    expect(await screen.findByText('Noch keine eigenen Rezepte.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Rezept anlegen' })).toBeNull();
  });
});
