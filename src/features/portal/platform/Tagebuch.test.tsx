import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type { Eintrag } from '@/features/nutrition/tagebuch';
import type * as PlattformApi from './api';
import type { EigenesTagebuch, Plattformzugang } from './api';

/**
 * Das Tagebuch der Plattform (Handoff 2026-10-29, 5.7 und Abschnitt 8): „x von y“ statt „noch
 * übrig“, Wasser in Litern, leere Mahlzeiten als Pillen, der Rückweg nach Herkunft, ohne Netz
 * gesperrt, was schreibt.
 */

const ladeTagebuch = vi.fn();
const wasserZaehlen = vi.fn();
const zahlenAusblenden = vi.fn();
const tagebuchKopieren = vi.fn();
const ladeErinnerungen = vi.fn();
const erinnerungenSpeichern = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTagebuch: (...a: unknown[]) => ladeTagebuch(...a) as Promise<EigenesTagebuch | null>,
  wasserZaehlen: (...a: unknown[]) => wasserZaehlen(...a) as Promise<void>,
  zahlenAusblenden: (...a: unknown[]) => zahlenAusblenden(...a) as Promise<void>,
  tagebuchKopieren: (...a: unknown[]) => tagebuchKopieren(...a) as Promise<number>,
  ladeErinnerungen: (...a: unknown[]) => ladeErinnerungen(...a) as Promise<unknown>,
  erinnerungenSpeichern: (...a: unknown[]) => erinnerungenSpeichern(...a) as Promise<void>,
}));

const { Tagebuch } = await import('./Tagebuch');

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
/** Der Name des Knopfs, mit „+“ für Vorlesesoftware; „250 ml“ bricht nicht. */
const GLAS = /^\+ 1 Glas \(250\sml\)$/;
const ADRESSE = '/p/ernaehrung/tagebuch?bereich=treatment';
const NULL = { energy_kcal: 0, protein_g: 0, fat_g: 0, carbohydrate_g: 0 };

function eintrag(teil: Partial<Eintrag>): Eintrag {
  return {
    id: 'e1e1e1e1-e1e1-4e1e-8e1e-000000000001',
    eaten_on: HEUTE,
    meal: 'breakfast',
    food_kind: 'catalog',
    food_id: null,
    name: 'Haferflocken',
    brand: null,
    base_unit: 'g',
    amount: 50,
    portion_label: null,
    portion_amount: null,
    portion_count: null,
    energy_kcal: 185,
    protein_g: 6.7,
    fat_g: 3.5,
    carbohydrate_g: 29.3,
    ...teil,
  };
}

const HAFER = eintrag({});
const BANANE = eintrag({
  id: 'e1e1e1e1-e1e1-4e1e-8e1e-000000000002',
  name: 'Banane roh',
  amount: 120,
  portion_label: '1 Stück',
  portion_amount: 120,
  portion_count: 1,
  energy_kcal: 112,
  protein_g: 1.4,
  fat_g: 0.2,
  carbohydrate_g: 25.3,
});

function tagebuch(teil: Partial<EigenesTagebuch> = {}, tag: Partial<EigenesTagebuch['day']> = {}) {
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
        {
          meal: 'breakfast',
          entries: [HAFER, BANANE],
          totals: { energy_kcal: 297, protein_g: 8.1, fat_g: 3.7, carbohydrate_g: 54.6 },
        },
        { meal: 'lunch', entries: [], totals: NULL },
        { meal: 'dinner', entries: [], totals: NULL },
        { meal: 'snack', entries: [], totals: NULL },
      ],
      totals: { energy_kcal: 297, protein_g: 8.1, fat_g: 3.7, carbohydrate_g: 54.6 },
      water_ml: 500,
      ...tag,
    },
    ...teil,
  } satisfies EigenesTagebuch;
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeTagebuch.mockResolvedValue(tagebuch());
  wasserZaehlen.mockResolvedValue(undefined);
});

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

async function energie() {
  return screen.findByRole('region', { name: 'Energie und Nährstoffe' });
}

describe('Tagebuch auf der Plattform (Handoff 2026-10-29, 5.7)', () => {
  it('zeigt Energie und Nährstoffe als „x von y“, ohne „noch übrig“', async () => {
    const { container } = renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const bereich = await energie();
    expect(bereich).toHaveTextContent('Energie 297 von 1466 kcal');
    expect(bereich).toHaveTextContent('Eiweiß 8,1 von 59 g');
    expect(bereich).toHaveTextContent('Kohlenhydrate 54,6 von 197 g');
    expect(bereich).toHaveTextContent('Fett 3,7 von 49 g');
    expect(document.body).not.toHaveTextContent(/noch übrig|über dem Ziel/i);
    // Vier Balken mit Kante, für Vorlesesoftware ausgeblendet: Die Zahl steht daneben.
    expect(bereich.querySelectorAll('[data-fortschritt]')).toHaveLength(4);
    await pruefeBarrierefreiheit(container);
  });

  it('über dem Ziel dieselbe Form, der Balken bleibt voll, kein Wort dazu (Frage 4)', async () => {
    ladeTagebuch.mockResolvedValue(
      tagebuch(
        {},
        { totals: { energy_kcal: 1586, protein_g: 70, fat_g: 60, carbohydrate_g: 180 } },
      ),
    );
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const bereich = await energie();
    expect(bereich).toHaveTextContent('Energie 1586 von 1466 kcal');
    const balken = bereich.querySelector<HTMLElement>('[data-fortschritt]');
    expect(balken?.style.width).toBe('100%');
    expect(bereich).not.toHaveTextContent(/über|zu viel|überschritten/i);
  });

  it('ohne Zielwerte nur die Energie, ohne Balken; Wasser ohne Ziel in Litern', async () => {
    ladeTagebuch.mockResolvedValue(tagebuch({ targets: null }));
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const bereich = await energie();
    expect(bereich).toHaveTextContent(/^Energie und NährstoffeEnergie 297 kcal$/);
    expect(bereich.querySelector('[data-fortschritt]')).toBeNull();
    const wasser = screen.getByRole('region', { name: 'Wasser' });
    expect(within(wasser).getByRole('status')).toHaveTextContent(/^0,5 l$/);
  });

  it('schreibt das Wasser in Litern mit bis zu zwei Stellen und zählt mit einem Tipp', async () => {
    const nutzer = userEvent.setup();
    ladeTagebuch.mockResolvedValue(tagebuch({}, { water_ml: 750 }));
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const wasser = await screen.findByRole('region', { name: 'Wasser' });
    expect(within(wasser).getByRole('status')).toHaveTextContent(/^0,75 von 2,6 l$/);
    expect(wasser).not.toHaveTextContent('ml von');
    await nutzer.click(within(wasser).getByRole('button', { name: GLAS }));
    await waitFor(() => expect(wasserZaehlen).toHaveBeenCalledWith(ZUGANG.access_id, HEUTE, 250));
    await nutzer.click(within(wasser).getByRole('button', { name: 'Ein Glas weniger' }));
    await waitFor(() => expect(wasserZaehlen).toHaveBeenCalledWith(ZUGANG.access_id, HEUTE, -250));
  });

  it('stellt volle Mahlzeiten als Block mit „+“ und die leeren als Pillen in eine Zeile', async () => {
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const mahlzeiten = await screen.findByRole('region', { name: 'Mahlzeiten' });
    expect(within(mahlzeiten).getAllByRole('heading', { level: 3 })).toHaveLength(1);
    expect(within(mahlzeiten).getByRole('heading', { level: 3 })).toHaveTextContent(
      'Frühstück · 297 kcal',
    );
    expect(within(mahlzeiten).getByRole('link', { name: 'Frühstück eintragen' })).toBeVisible();
    expect(
      within(mahlzeiten).getByRole('button', { name: /^Haferflocken · 50\sg\s+185\skcal$/ }),
    ).toBeVisible();
    expect(
      within(mahlzeiten).getByRole('button', {
        name: /^Banane roh · 1\sStück · 120\sg\s+112\skcal$/,
      }),
    ).toBeVisible();
    const leer = within(mahlzeiten).getByRole('list', { name: 'Noch nichts eingetragen:' });
    const pillen = within(leer).getAllByRole('link');
    expect(pillen.map((p) => p.textContent)).toEqual(['Mittagessen', 'Abendessen', 'Snacks']);
    expect(pillen.map((p) => p.getAttribute('aria-label'))).toEqual([
      'Mittagessen eintragen',
      'Abendessen eintragen',
      'Snacks eintragen',
    ]);
    expect(mahlzeiten).not.toHaveTextContent('Nichts eingetragen.');
    // Die Pille führt zum Eintragen am selben Tag; zurück geht es zu diesem Tag.
    const ziel = new URL(pillen[0]!.getAttribute('href')!, 'https://plattform.invalid');
    expect(ziel.pathname).toBe('/p/ernaehrung/tagebuch/eintragen');
    expect(ziel.searchParams.get('mahlzeit')).toBe('lunch');
    expect(ziel.searchParams.get('tag')).toBe(HEUTE);
    expect(ziel.searchParams.get('zurueck')).toBe(ADRESSE);
  });

  it('führt zurück, woher man kam: von der Übersicht „Übersicht“, sonst „Ernährung“', async () => {
    const { unmount } = renderWithProviders(
      <Tagebuch zugang={ZUGANG} />,
      `${ADRESSE}&zurueck=${encodeURIComponent('/p?bereich=treatment')}`,
    );
    expect(await screen.findByRole('link', { name: '← Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
    // Auch der Weg über das Eintragen behält die Herkunft.
    const pille = await screen.findByRole('link', { name: 'Abendessen eintragen' });
    const zurueck = new URL(pille.getAttribute('href')!, 'https://plattform.invalid');
    expect(zurueck.searchParams.get('zurueck')).toBe(
      `${ADRESSE}&zurueck=${encodeURIComponent('/p?bereich=treatment')}`,
    );
    unmount();

    renderWithProviders(<Tagebuch zugang={ZUGANG} />, `${ADRESSE}&tag=2026-10-27`);
    expect(await screen.findByRole('link', { name: '← Ernährung' })).toHaveAttribute(
      'href',
      '/p/ernaehrung?bereich=treatment',
    );
    expect(screen.queryByText(/Zur Ernährung/)).toBeNull();
  });

  it('sperrt ohne Netz, was schreibt, erreichbar und mit Satz; die Einträge bleiben lesbar', async () => {
    const nutzer = userEvent.setup();
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    const { container } = renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    // Der Satz steht über den Mahlzeiten, dem ersten, was gesperrt ist.
    const mahlzeiten = await screen.findByRole('region', { name: 'Mahlzeiten' });
    expect(within(mahlzeiten).getByText('Eintragen geht wieder mit Verbindung.')).toBeVisible();
    for (const name of [
      GLAS,
      'Ein Glas weniger',
      'Frühstück eintragen',
      'Mittagessen eintragen',
      'Abendessen eintragen',
      'Snacks eintragen',
    ]) {
      const knopf = screen.getByRole('button', { name });
      // Gesperrt, aber mit dem Fokus erreichbar, damit der Satz vorgelesen wird.
      expect(knopf).toBeEnabled();
      expect(knopf).toHaveAttribute('aria-disabled', 'true');
      expect(knopf).toHaveAccessibleDescription('Eintragen geht wieder mit Verbindung.');
    }
    await nutzer.click(screen.getByRole('button', { name: GLAS }));
    await nutzer.click(screen.getByRole('button', { name: 'Ein Glas weniger' }));
    expect(wasserZaehlen).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /eintragen$/ })).toBeNull();

    await nutzer.click(screen.getByText('Von einem anderen Tag kopieren'));
    const kopieren = screen.getByRole('button', { name: 'Hierher kopieren' });
    expect(kopieren).toHaveAttribute('aria-disabled', 'true');
    expect(kopieren).toHaveAccessibleDescription('Kopieren geht wieder mit Verbindung.');
    await nutzer.click(kopieren);
    expect(tagebuchKopieren).not.toHaveBeenCalled();

    await nutzer.click(screen.getByText('Einstellungen'));
    const zahlen = screen.getByRole('checkbox', { name: 'Zahlen ausblenden' });
    expect(zahlen).toHaveAttribute('aria-disabled', 'true');
    expect(zahlen).toHaveAccessibleDescription(
      'Mahlzeiten ohne Kalorien und Nährwerte. Ändern geht wieder mit Verbindung.',
    );
    await nutzer.click(zahlen);
    expect(zahlen).not.toBeChecked();
    expect(zahlenAusblenden).not.toHaveBeenCalled();

    ladeErinnerungen.mockResolvedValue({
      reminders: [{ meal: 'breakfast', time: '08:00' }],
      email: true,
      push: false,
      switched_off: false,
      quiet_from: 22,
      quiet_until: 22,
    });
    await nutzer.click(screen.getByText(/^Erinnerungen/));
    const speichern = await screen.findByRole('button', { name: 'Speichern' });
    expect(speichern).toHaveAttribute('aria-disabled', 'true');
    expect(speichern).toHaveAccessibleDescription('Speichern geht wieder mit Verbindung.');
    await nutzer.click(speichern);
    expect(erinnerungenSpeichern).not.toHaveBeenCalled();
    expect(screen.getByText('Haferflocken')).toBeVisible();
    expect(screen.queryByRole('button', { name: /Haferflocken/ })).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('blendet mit „Zahlen ausblenden“ jede Kalorie aus', async () => {
    ladeTagebuch.mockResolvedValue(tagebuch({ hide_numbers: true }));
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    expect(await screen.findByRole('region', { name: 'Mahlzeiten' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Energie und Nährstoffe' })).toBeNull();
    expect(document.body).not.toHaveTextContent('kcal');
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(/^Frühstück$/);
  });

  it('zeigt ohne Schreibrecht nichts zum Antippen, die leeren Mahlzeiten als Satz', async () => {
    ladeTagebuch.mockResolvedValue(tagebuch({ can_write: false, can_delete: false }));
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const mahlzeiten = await screen.findByRole('region', { name: 'Mahlzeiten' });
    expect(within(mahlzeiten).queryByRole('link')).toBeNull();
    expect(within(mahlzeiten).queryByRole('button')).toBeNull();
    expect(mahlzeiten).toHaveTextContent(
      'Noch nichts eingetragen: Mittagessen, Abendessen, Snacks',
    );
    expect(screen.queryByRole('button', { name: /1 Glas/ })).toBeNull();
  });

  it('nennt den Tag auch heute mit Datum; der Folgetag ist gesperrt, der Vortag ein Tipp', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const leiste = await screen.findByRole('navigation', { name: 'Tag wählen' });
    expect(leiste).toHaveTextContent('Heute');
    expect(leiste).toHaveTextContent('Donnerstag, 29. Oktober');
    expect(within(leiste).getByRole('button', { name: 'Folgetag' })).toBeDisabled();
    await nutzer.click(within(leiste).getByRole('button', { name: 'Vortag' }));
    await waitFor(() => expect(ladeTagebuch).toHaveBeenCalledWith(ZUGANG.access_id, '2026-10-28'));
  });

  it('zeigt beim Laden die Form der Seite und bei einem Fehler den Weg zurück', async () => {
    ladeTagebuch.mockReturnValue(new Promise(() => undefined));
    const { unmount } = renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    expect(screen.getByRole('heading', { level: 1, name: 'Tagebuch' })).toBeVisible();
    const laden = screen.getByText('Ihr Tagebuch wird geladen');
    expect(laden).toHaveClass('sr-only');
    expect(laden.parentElement).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    ladeTagebuch.mockRejectedValue(new Error('Ihr Tagebuch konnte nicht geladen werden.'));
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    const fehler = await screen.findByRole('alert');
    expect(fehler).toHaveTextContent('Ihr Tagebuch konnte nicht geladen werden.');
    expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    expect(within(fehler).getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();
  });

  it('ohne Beratung der Leerzustand mit Markenform und Satz', async () => {
    ladeTagebuch.mockResolvedValue(null);
    renderWithProviders(<Tagebuch zugang={ZUGANG} />, ADRESSE);
    expect(await screen.findByText('Zurzeit keine Ernährungsberatung')).toBeVisible();
    expect(
      screen.getByText(
        'Vereinbaren Sie eine Ernährungsberatung mit Ihrer Praxis, finden Sie sie hier.',
      ),
    ).toBeVisible();
  });
});
