import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneErnaehrung, EigenesTagebuch, Plattformzugang } from './api';

/**
 * Eintragen ins Tagebuch (Handoff 2026-10-29, 5.7 und 5.9): ohne Schreibrecht ein Leerzustand mit
 * Satz und Weg zurück, ohne Netz „+“, „Eintragen“ und „Favorit“ gesperrt, aber erreichbar.
 */

const ladeErnaehrung = vi.fn();
const ladeTagebuch = vi.fn();
const tagebuchEintragen = vi.fn();
const favoritSetzen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeErnaehrung: (...a: unknown[]) => ladeErnaehrung(...a) as Promise<EigeneErnaehrung | null>,
  ladeTagebuch: (...a: unknown[]) => ladeTagebuch(...a) as Promise<EigenesTagebuch | null>,
  lebensmittelQuellen: () => Promise.resolve([]),
  tagebuchEintragen: (...a: unknown[]) => tagebuchEintragen(...a) as Promise<void>,
  favoritSetzen: (...a: unknown[]) => favoritSetzen(...a) as Promise<void>,
}));

const { TagebuchEintragen } = await import('./TagebuchEintragen');

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

const HEUTE = '2026-10-29';
const TAGEBUCH = '/p/ernaehrung/tagebuch?bereich=treatment';
const ADRESSE = `/p/ernaehrung/tagebuch/eintragen?bereich=treatment&tag=${HEUTE}&mahlzeit=lunch&zurueck=${encodeURIComponent(TAGEBUCH)}`;
const NULL = { energy_kcal: 0, protein_g: 0, fat_g: 0, carbohydrate_g: 0 };

const HAFERFLOCKEN: EigenesTagebuch['recent'][number]['food'] = {
  kind: 'catalog',
  id: 'f00df00d-f00d-4f00-8f00-000000000001',
  source: 'bls',
  name: 'Haferflocken',
  brand: null,
  base_unit: 'g',
  per_100: {
    energy_kcal: 370,
    protein_g: 13.5,
    fat_g: 7,
    carbohydrate_g: 58.7,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
  portions: [{ label: 'Portion', amount: 50 }],
};

function tagebuch(teil: Partial<EigenesTagebuch> = {}): EigenesTagebuch {
  return {
    today: HEUTE,
    started_on: '2026-09-27',
    enabled: true,
    can_write: true,
    can_delete: true,
    glass_ml: 250,
    hide_numbers: false,
    recent: [{ food: HAFERFLOCKEN, amount: 50, portion_label: 'Portion', portion_count: 1 }],
    favorites: [],
    targets: null,
    day: {
      day: HEUTE,
      meals: [
        { meal: 'breakfast', entries: [], totals: NULL },
        { meal: 'lunch', entries: [], totals: NULL },
        { meal: 'dinner', entries: [], totals: NULL },
        { meal: 'snack', entries: [], totals: NULL },
      ],
      totals: NULL,
      water_ml: 0,
    },
    ...teil,
  };
}

function ernaehrung(teil: Partial<EigeneErnaehrung> = {}): EigeneErnaehrung {
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
      target_weight_kg: null,
      target_weight_source: null,
      diary_enabled: true,
      diary_changed_at: null,
      consent: { state: 'granted', occurred_on: '2026-10-08', source: 'practice' },
      weights: [],
      targets: { status: 'missing', missing: ['weight'] },
      own_foods: [],
    },
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeErnaehrung.mockResolvedValue(ernaehrung());
  ladeTagebuch.mockResolvedValue(tagebuch());
  tagebuchEintragen.mockResolvedValue(undefined);
  favoritSetzen.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('Eintragen ins Tagebuch (Handoff 2026-10-29, 5.7)', () => {
  it('trägt mit „+“ die Menge vom letzten Mal ein und bleibt für das Nächste auf der Seite', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<TagebuchEintragen zugang={ZUGANG} />, ADRESSE);
    await nutzer.click(
      await screen.findByRole('button', { name: /^Haferflocken eintragen \(Portion/ }),
    );
    await waitFor(() =>
      expect(tagebuchEintragen).toHaveBeenCalledWith(
        ZUGANG.access_id,
        HEUTE,
        'lunch',
        HAFERFLOCKEN,
        expect.anything(),
      ),
    );
    // Rückmeldung oben, mit dem Fokus; Zuletzt und Suche bleiben, zurück geht es über „← Tagebuch“.
    const meldung = await screen.findByText('„Haferflocken“ eingetragen.');
    expect(meldung.closest('[tabindex="-1"]') ?? meldung).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1, name: 'Mittagessen eintragen' })).toBeVisible();
    expect(screen.getByRole('searchbox')).toBeVisible();
    expect(screen.getByRole('link', { name: '← Tagebuch' })).toHaveAttribute(
      'href',
      expect.stringContaining('/p/ernaehrung/tagebuch?'),
    );
    // Ein zweites Lebensmittel ist eine neue Rückmeldung, auch wenn es dasselbe ist.
    await nutzer.click(screen.getByRole('button', { name: /^Haferflocken eintragen \(Portion/ }));
    await waitFor(() => expect(tagebuchEintragen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('„Haferflocken“ eingetragen.')).toBeVisible();
  });

  it('trägt aus dem Fenster ein, schließt es und bleibt auf der Seite', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<TagebuchEintragen zugang={ZUGANG} />, ADRESSE);
    await nutzer.click(await screen.findByRole('button', { name: /^Haferflocken(?! eintragen)/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Haferflocken' });
    await nutzer.click(within(fenster).getByRole('button', { name: 'Eintragen' }));
    await waitFor(() => expect(tagebuchEintragen).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('„Haferflocken“ eingetragen.')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Mittagessen eintragen' })).toBeVisible();
  });

  it('sperrt ohne Netz „+“, „Eintragen“ und „Favorit“, erreichbar und mit Satz', async () => {
    const nutzer = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { container } = renderWithProviders(<TagebuchEintragen zugang={ZUGANG} />, ADRESSE);
    const plus = await screen.findByRole('button', { name: /^Haferflocken eintragen \(/ });
    // Gesperrt, aber mit dem Fokus erreichbar, damit der Satz vorgelesen wird.
    expect(plus).toBeEnabled();
    expect(plus).toHaveAttribute('aria-disabled', 'true');
    expect(plus).toHaveAccessibleDescription('Eintragen geht wieder mit Verbindung.');
    await nutzer.click(plus);
    expect(tagebuchEintragen).not.toHaveBeenCalled();
    await pruefeBarrierefreiheit(container);

    // Die Menge lässt sich ansehen, eintragen erst wieder mit Verbindung.
    await nutzer.click(screen.getByRole('button', { name: /185\skcal$/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Haferflocken' });
    const eintragen = within(fenster).getByRole('button', { name: 'Eintragen' });
    expect(eintragen).toHaveAttribute('aria-disabled', 'true');
    expect(eintragen).toHaveAccessibleDescription('Eintragen geht wieder mit Verbindung.');
    await nutzer.click(eintragen);
    expect(tagebuchEintragen).not.toHaveBeenCalled();
    const favorit = within(fenster).getByRole('checkbox', { name: 'Favorit' });
    expect(favorit).toHaveAttribute('aria-disabled', 'true');
    expect(favorit).toHaveAccessibleDescription('Ändern geht wieder mit Verbindung.');
    await nutzer.click(favorit);
    expect(favorit).not.toBeChecked();
    expect(favoritSetzen).not.toHaveBeenCalled();
  });

  it('ohne Schreibrecht ein Leerzustand mit Markenform, Satz und dem Weg zum Tagebuch', async () => {
    ladeTagebuch.mockResolvedValue(tagebuch({ enabled: false, can_write: false }));
    const { container, unmount } = renderWithProviders(
      <TagebuchEintragen zugang={ZUGANG} />,
      ADRESSE,
    );
    expect(await screen.findByText('Hier lässt sich gerade nichts eintragen.')).toBeVisible();
    expect(screen.getByText('Ihr Tagebuch ist ausgeschaltet.')).toBeVisible();
    // Zurück zum selben Tag, mit dessen Herkunft.
    expect(screen.getByRole('link', { name: 'Zum Tagebuch' })).toHaveAttribute('href', TAGEBUCH);
    expect(screen.queryByRole('searchbox')).toBeNull();
    await pruefeBarrierefreiheit(container);
    unmount();

    ladeTagebuch.mockResolvedValue(tagebuch({ can_write: false }));
    ladeErnaehrung.mockResolvedValue(ernaehrung({ can_write: false, can_grant: true }));
    const zweite = renderWithProviders(<TagebuchEintragen zugang={ZUGANG} />, ADRESSE);
    expect(
      await screen.findByText('Ohne Ihre Einwilligung wird nichts eingetragen.'),
    ).toBeVisible();
    zweite.unmount();

    ladeTagebuch.mockResolvedValue(tagebuch({ can_write: false }));
    ladeErnaehrung.mockResolvedValue(ernaehrung({ can_write: false }));
    const dritte = renderWithProviders(<TagebuchEintragen zugang={ZUGANG} />, ADRESSE);
    expect(await screen.findByText('Ihr Zugang ist nur noch zum Lesen.')).toBeVisible();
    dritte.unmount();

    // Ohne Beratung gibt es kein Tagebuch, zu dem der Knopf führen könnte.
    ladeTagebuch.mockResolvedValue(null);
    ladeErnaehrung.mockResolvedValue(null);
    renderWithProviders(<TagebuchEintragen zugang={ZUGANG} />, ADRESSE);
    expect(await screen.findByText('Zurzeit läuft keine Ernährungsberatung.')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Zum Tagebuch' })).toBeNull();
  });
});
