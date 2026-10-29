import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneErnaehrung, EigenesTagebuch, Plattformzugang } from './api';

/**
 * Ernährung auf der Plattform (Handoff 2026-10-29, 5.6): das Tagebuch von heute als Hero-Karte,
 * Gewicht mit den letzten drei Einträgen, Zielwerte als Zeilen, Seltenes unter „Mehr“.
 */

const ladeErnaehrung = vi.fn();
const ladeTagebuch = vi.fn();
const ernaehrungGewichtEintragen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeErnaehrung: (...a: unknown[]) => ladeErnaehrung(...a) as Promise<EigeneErnaehrung | null>,
  ladeTagebuch: (...a: unknown[]) => ladeTagebuch(...a) as Promise<EigenesTagebuch | null>,
  ernaehrungGewichtEintragen: (...a: unknown[]) =>
    ernaehrungGewichtEintragen(...a) as Promise<void>,
}));

const { Ernaehrung } = await import('./Ernaehrung');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

const HEUTE = '2026-10-29';
const ADRESSE = '/p/ernaehrung?bereich=treatment';

const ZIELWERTE: EigeneErnaehrung['profile']['targets'] = {
  status: 'ok',
  inputs: {
    pal: 1.4,
    sex: 'female',
    goal: 'lose',
    formula: 'standard',
    age_years: 63,
    height_cm: 168,
    weight_kg: 73.5,
    in_training: false,
    body_fat_percent: null,
  },
  bmr: {
    kcal: 1309,
    formula: 'mifflin_st_jeor',
    averaged: false,
    variants: [
      {
        sex: 'female',
        kcal: 1309,
        terms: [
          { input: 'weight_kg', factor: 10 },
          { input: 'height_cm', factor: 6.25 },
          { input: 'age_years', factor: -5 },
        ],
        constant: -161,
      },
    ],
    lean_mass_kg: null,
  },
  tee: { pal: 1.4, kcal: 1833 },
  energy: {
    kcal: 1466,
    rule: 'deficit_capped',
    below_bmr: false,
    overridden: false,
    change_kcal: -367,
    computed_kcal: 1466,
    floor_applied: false,
    deficit_max_kcal: 500,
    deficit_max_share: 0.2,
  },
  protein: {
    g: 59,
    basis: 'standard',
    g_per_kg: 0.8,
    computed_g: 59,
    kcal_per_g: 4,
    overridden: false,
  },
  fat: { g: 49, share: 0.3, computed_g: 49, kcal_per_g: 9, overridden: true },
  carbohydrate: { g: 197, computed_g: 197, kcal_per_g: 4, overridden: false },
  water: {
    ml: 2570,
    ml_per_kg: 35,
    minimum_ml: 1500,
    overridden: false,
    computed_ml: 2570,
    floor_applied: false,
  },
  target_weight: {
    kg: 68,
    weeks: 15,
    floor_kg: 52.3,
    bmi_floor: 18.5,
    below_floor: false,
    kcal_per_kg: 7000,
  },
};

function ernaehrung(
  teil: Partial<EigeneErnaehrung> = {},
  profil: Partial<EigeneErnaehrung['profile']> = {},
): EigeneErnaehrung {
  return {
    today: HEUTE,
    can_write: true,
    can_grant: false,
    wording_version: '2026-10',
    target_weight_floor_kg: 52.3,
    profile: {
      started_on: '2026-09-27',
      ended_on: null,
      height_cm: 168,
      formula_sex: 'female',
      body_fat_percent: null,
      activity_pal: 1.4,
      goal: 'lose',
      target_weight_kg: 68,
      target_weight_source: 'counsellor',
      diary_enabled: true,
      diary_changed_at: null,
      consent: { state: 'granted', occurred_on: '2026-10-08', source: 'practice' },
      weights: [
        { measured_on: '2026-10-01', weight_kg: 74.9, source: 'practice' },
        { measured_on: '2026-10-22', weight_kg: 73.5, source: 'practice' },
        { measured_on: '2026-10-15', weight_kg: 74.1, source: 'platform' },
        { measured_on: '2026-10-08', weight_kg: 74.6, source: 'practice' },
        { measured_on: '2025-12-30', weight_kg: 76.2, source: 'practice' },
      ],
      targets: ZIELWERTE,
      own_foods: [],
      ...profil,
    },
    ...teil,
  };
}

const EIGENES_LEBENSMITTEL: EigeneErnaehrung['profile']['own_foods'][number] = {
  kind: 'person',
  id: 'f00df00d-f00d-4f00-8f00-000000000009',
  source: 'person',
  name: 'Eigenes Müsli',
  brand: null,
  base_unit: 'g',
  per_100: {
    energy_kcal: 380,
    protein_g: 10,
    fat_g: 8,
    carbohydrate_g: 60,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [],
};

const NULL = { energy_kcal: 0, protein_g: 0, fat_g: 0, carbohydrate_g: 0 };

function tagebuch(teil: Partial<EigenesTagebuch> = {}): EigenesTagebuch {
  return {
    today: HEUTE,
    started_on: '2026-09-27',
    enabled: true,
    can_write: true,
    can_delete: true,
    glass_ml: 250,
    hide_numbers: false,
    recent: [],
    favorites: [],
    targets: { energy_kcal: 1466, protein_g: 59, fat_g: 49, carbohydrate_g: 197, water_ml: 2570 },
    day: {
      day: HEUTE,
      meals: [
        { meal: 'breakfast', entries: [], totals: NULL },
        { meal: 'lunch', entries: [], totals: NULL },
        { meal: 'dinner', entries: [], totals: NULL },
        { meal: 'snack', entries: [], totals: NULL },
      ],
      totals: { energy_kcal: 297, protein_g: 8.1, fat_g: 3.7, carbohydrate_g: 54.6 },
      water_ml: 500,
    },
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeErnaehrung.mockResolvedValue(ernaehrung());
  ladeTagebuch.mockResolvedValue(tagebuch());
  ernaehrungGewichtEintragen.mockResolvedValue(undefined);
});

describe('Ernährung auf der Plattform (Handoff 2026-10-29, 5.6)', () => {
  it('stellt das Tagebuch von heute als Hero-Karte voran, mit dem Stand des Tages', async () => {
    const { container } = renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const heute = await screen.findByRole('region', { name: 'Heute' });
    expect(within(heute).getByText('Tagebuch')).toBeVisible();
    expect(await within(heute).findByText('297 von 1466 kcal')).toBeVisible();
    expect(within(heute).getByText('Wasser 0,5 von 2,6 l')).toBeVisible();
    // Von hier ins Tagebuch: Dort heißt der Rückweg „Ernährung“.
    expect(within(heute).getByRole('link', { name: 'Heute eintragen' })).toHaveAttribute(
      'href',
      '/p/ernaehrung/tagebuch?bereich=treatment',
    );
    expect(ladeTagebuch).toHaveBeenCalledWith(ZUGANG.access_id, null);
    expect(screen.getByRole('link', { name: '← Ich' })).toHaveAttribute('href', '/p/ich');
    await pruefeBarrierefreiheit(container);
  });

  it('zeigt im Hero mit „Zahlen ausblenden“ nur das Wasser, ohne Zielwerte ohne „von“', async () => {
    ladeTagebuch.mockResolvedValue(tagebuch({ hide_numbers: true }));
    const { unmount } = renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const heute = await screen.findByRole('region', { name: 'Heute' });
    expect(await within(heute).findByText('Wasser 0,5 von 2,6 l')).toBeVisible();
    expect(heute).not.toHaveTextContent('kcal');
    unmount();

    ladeTagebuch.mockResolvedValue(tagebuch({ targets: null }));
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const ohneZiel = await screen.findByRole('region', { name: 'Heute' });
    expect(await within(ohneZiel).findByText('297 kcal')).toBeVisible();
    expect(within(ohneZiel).getByText('Wasser 0,5 l')).toBeVisible();
  });

  it('ohne Schreibrecht keine Hero-Karte; das Tagebuch steht dann unter „Mehr“', async () => {
    ladeErnaehrung.mockResolvedValue(ernaehrung({ can_write: false }));
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const mehr = await screen.findByRole('region', { name: 'Mehr' });
    expect(screen.queryByRole('region', { name: 'Heute' })).toBeNull();
    expect(within(mehr).getByRole('link', { name: /^Tagebuch/ })).toHaveAttribute(
      'href',
      '/p/ernaehrung/tagebuch?bereich=treatment',
    );
    expect(ladeTagebuch).not.toHaveBeenCalled();
    // Ohne Schreibrecht auch kein Feld für das Gewicht.
    expect(screen.queryByLabelText('Gewicht heute')).toBeNull();
  });

  it('Gewicht: Beschriftung ohne Einheit, „kg“ im Feld, drei Einträge offen, ältere dahinter', async () => {
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const feld = await screen.findByLabelText('Gewicht heute');
    expect(feld).toHaveAccessibleDescription('kg');
    expect(screen.getByRole('button', { name: 'Eintragen' })).toBeVisible();
    const verlauf = screen.getByRole('list', { name: 'Ihr Gewichtsverlauf' });
    // Die jüngsten zuerst, der Tag in Worten, das Jahr nur, wenn es nicht das laufende ist.
    expect(
      within(verlauf)
        .getAllByRole('listitem')
        .map((z) => z.textContent),
    ).toEqual([
      '22.\u00a0Oktober · in der Praxis 73,5 kg',
      '15.\u00a0Oktober 74,1 kg',
      '8.\u00a0Oktober · in der Praxis 74,6 kg',
    ]);
    const aeltere = screen.getByText('Ältere Einträge').closest('details')!;
    expect(aeltere).toHaveTextContent('(2)');
    expect(within(aeltere).getAllByRole('listitem', { hidden: true })).toHaveLength(2);
    expect(aeltere).toHaveTextContent('30. Dezember 2025');
  });

  it('trägt das Gewicht von heute ein; steht schon eines da, heißt der Knopf „Ersetzen“', async () => {
    const nutzer = userEvent.setup();
    const { unmount } = renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    await nutzer.type(await screen.findByLabelText('Gewicht heute'), '73,1');
    await nutzer.click(screen.getByRole('button', { name: 'Eintragen' }));
    await waitFor(() =>
      expect(ernaehrungGewichtEintragen).toHaveBeenCalledWith(ZUGANG.access_id, HEUTE, 73.1),
    );
    expect(await screen.findByText('Eingetragen.')).toBeVisible();
    unmount();

    ladeErnaehrung.mockResolvedValue(
      ernaehrung({}, { weights: [{ measured_on: HEUTE, weight_kg: 73.1, source: 'platform' }] }),
    );
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    expect(await screen.findByRole('button', { name: 'Ersetzen' })).toBeVisible();
    expect(screen.getByLabelText('Gewicht heute')).toHaveAccessibleDescription(
      'kg Heute steht schon 73,1 kg. Eintragen ersetzt es.',
    );
  });

  it('Zielwerte als Zeilen mit Abzeichen, der Satz zur Zeit bis zum Zielgewicht, der Rechenweg', async () => {
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const ziele = await screen.findByRole('region', { name: 'Ihre Zielwerte' });
    // Die erste Liste sind die Zielwerte; der Rechenweg darunter hat eine eigene.
    const zeilen = within(ziele.querySelector('dl')!)
      .getAllByRole('term')
      .map((name) => `${name.textContent}: ${name.nextElementSibling?.textContent}`);
    expect(zeilen).toEqual([
      'Energie: 1466\u00a0kcal',
      'Eiweiß: 59\u00a0g',
      'Kohlenhydrate: 197\u00a0g',
      'Fett: 49\u00a0gvon der Beratung gesetzt',
      'Wasser: 2,6\u00a0l',
      'Zielgewicht: 68,0 kg',
    ]);
    expect(
      within(ziele).getByText('Rechnerisch etwa 15 Wochen bis zum Zielgewicht.'),
    ).toBeVisible();
    expect(ziele).not.toHaveTextContent('· rechnerisch');
    expect(within(ziele).getByText('Rechenweg')).toBeVisible();
  });

  it('„Mehr“: Lebensmittel, Zielgewicht, Tagebuch und Einwilligung mit dem Tag in Worten', async () => {
    ladeErnaehrung.mockResolvedValue(ernaehrung({}, { own_foods: [EIGENES_LEBENSMITTEL] }));
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const mehr = await screen.findByRole('region', { name: 'Mehr' });
    expect(within(mehr).getByRole('link', { name: /^Lebensmittel/ })).toHaveTextContent(
      'LebensmittelNachschlagen · 1 eigenes',
    );
    expect(mehr).toHaveTextContent('Zielgewicht · 68,0 kg');
    expect(mehr).toHaveTextContent('Ernährungs\u00ADtagebuch · an');
    expect(mehr).toHaveTextContent('Einwilligung · erteilt am 8. Oktober');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Heute',
      'Gewicht',
      'Ihre Zielwerte',
      'Mehr',
    ]);
  });

  it('ohne Beratung der Leerzustand mit Markenform und Satz, beim Laden die Form der Seite', async () => {
    ladeErnaehrung.mockResolvedValue(null);
    const { unmount } = renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    expect(await screen.findByText('Zurzeit keine Ernährungsberatung')).toBeVisible();
    expect(
      screen.getByText(
        'Vereinbaren Sie eine Ernährungsberatung mit Ihrer Praxis, finden Sie sie hier.',
      ),
    ).toBeVisible();
    unmount();

    ladeErnaehrung.mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<Ernaehrung zugang={ZUGANG} />, ADRESSE);
    const laden = screen.getByText('Ihre Ernährung wird geladen');
    expect(laden).toHaveClass('sr-only');
    expect(laden.parentElement).toHaveAttribute('aria-busy', 'true');
  });
});
