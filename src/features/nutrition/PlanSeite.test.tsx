import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import type * as ErnaehrungApi from './api';
import type { Ernaehrungssicht } from './api';
import type * as PlaeneApi from './plaeneApi';
import type { Plan } from './plaene';
import type * as RezepteApi from './rezepteApi';
import { PlanSeite } from './PlanSeite';

const fetchErnaehrung = vi.fn<() => Promise<Ernaehrungssicht | null>>();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ErnaehrungApi>()),
  fetchErnaehrung: () => fetchErnaehrung(),
}));
const planvorlagen = vi.fn<() => Promise<Plan[]>>();
const planZuweisen = vi.fn();
const planBeenden = vi.fn();
vi.mock('./plaeneApi', async (importOriginal) => ({
  ...(await importOriginal<typeof PlaeneApi>()),
  planvorlagen: () => planvorlagen(),
  planZuweisen: (...a: unknown[]) => planZuweisen(...a) as unknown,
  planBeenden: (...a: unknown[]) => planBeenden(...a) as unknown,
}));
vi.mock('./rezepteApi', async (importOriginal) => ({
  ...(await importOriginal<typeof RezepteApi>()),
  praxisRezepte: () => Promise.resolve([]),
}));

const PATIENT = '66666666-6666-4666-8666-000000000002';
const HEUTE = '2026-11-06';

const APFEL = {
  kind: 'catalog' as const,
  id: 'apfel',
  source: 'bls' as const,
  name: 'Apfel roh',
  brand: null,
  base_unit: 'g' as const,
  per_100: {
    energy_kcal: 54,
    protein_g: 0.3,
    fat_g: 0.1,
    carbohydrate_g: 12,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [{ label: '1 Stück (mittel)', amount: 150 }],
};

function plan(zusatz: Partial<Plan> = {}): Plan {
  return {
    id: 'vorlage-1',
    title: 'Woche mit Obst',
    day_count: 1,
    starts_on: null,
    ended_on: null,
    updated_at: '2026-11-06T10:00:00Z',
    days: [
      {
        day: 1,
        meals: [
          {
            meal: 'snack',
            items: [
              {
                kind: 'catalog',
                id: 'apfel',
                name: 'Apfel roh',
                amount: 150,
                portion_label: '1 Stück (mittel)',
                portion_count: 1,
                energy_kcal: 81,
                food: APFEL,
              },
            ],
          },
        ],
      },
    ],
    recipes: [],
    ...zusatz,
  };
}

function sicht(plaene: Plan[]): Ernaehrungssicht {
  return {
    today: HEUTE,
    relationship_open: true,
    birth_date_known: true,
    running_elsewhere: null,
    earlier_count: 0,
    profile: {
      id: 'profil-1',
      ended_on: null,
      targets: { status: 'missing', missing: ['weight'] },
      plans: plaene,
    },
  } as unknown as Ernaehrungssicht;
}

function Ort() {
  const { pathname } = useLocation();
  return <output aria-label="Ort">{pathname}</output>;
}

function zeige() {
  const router = createMemoryRouter(
    [
      { path: '/patienten/:patientId/ernaehrung/plan', element: <PlanSeite art="treatment" /> },
      { path: '*', element: <Ort /> },
    ],
    { initialEntries: [`/patienten/${PATIENT}/ernaehrung/plan`] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchErnaehrung.mockReset();
  planvorlagen.mockReset().mockResolvedValue([plan()]);
  planZuweisen.mockReset().mockResolvedValue('plan-1');
  planBeenden.mockReset().mockResolvedValue(undefined);
});

describe('Plan an der Beratung (ANN-845)', () => {
  it('weist aus einer Vorlage in zwei Tipps zu, ab heute', async () => {
    const nutzer = userEvent.setup();
    fetchErnaehrung.mockResolvedValue(sicht([]));
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Woche mit Obst/ }));
    expect(screen.getByDisplayValue('Woche mit Obst')).toBeVisible();
    expect(screen.getByLabelText('Beginn')).toHaveValue(HEUTE);
    await nutzer.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(planZuweisen).toHaveBeenCalledWith(
      'profil-1',
      {
        title: 'Woche mit Obst',
        days: [
          {
            snack: [
              { kind: 'catalog', id: 'apfel', portion_label: '1 Stück (mittel)', portion_count: 1 },
            ],
          },
        ],
      },
      HEUTE,
    );
    expect(await screen.findByLabelText('Ort')).toHaveTextContent(
      `/patienten/${PATIENT}/ernaehrung`,
    );
  });

  it('beginnt leer als Tagesvorschlag', async () => {
    const nutzer = userEvent.setup();
    fetchErnaehrung.mockResolvedValue(sicht([]));
    zeige();
    await nutzer.click(await screen.findByRole('button', { name: /^Leer beginnen/ }));
    expect(screen.getByDisplayValue('Tagesvorschlag')).toBeVisible();
  });

  it('ändert den offenen Plan und beendet ihn mit Rückfrage', async () => {
    const nutzer = userEvent.setup();
    fetchErnaehrung.mockResolvedValue(
      sicht([plan({ id: 'plan-1', title: 'Offen', starts_on: HEUTE })]),
    );
    zeige();
    expect(await screen.findByDisplayValue('Offen')).toBeVisible();
    expect(screen.queryByLabelText('Beginn')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Plan beenden' }));
    await nutzer.click(screen.getAllByRole('button', { name: 'Plan beenden' }).at(-1)!);
    expect(planBeenden).toHaveBeenCalledWith('plan-1');
  });
});
