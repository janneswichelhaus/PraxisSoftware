import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as BibliothekApi from '@/features/exercises/api';
import { katalogeintrag } from '@/features/exercises/katalog';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { renderWithProviders, testUser } from '@/test-utils';
import { dosierungAlltag, dosierungFachlich, dosierungKurz, unterschiede } from './dosierung';
import { OHNE_KATALOG } from '@/features/exercises/testdaten';
import { OHNE_ZUSATZ } from './testdaten';
import { VorlagenKontext } from './vorlagen';

const fetchPlanliste = vi.fn();
const fetchPlan = vi.fn();
const createPlan = vi.fn();
const savePlan = vi.fn();
const savePosition = vi.fn();
const movePosition = vi.fn();
const deletePosition = vi.fn();
const discardPlan = vi.fn();
const assignPlan = vi.fn();
const createVersion = vi.fn();
const extendPlan = vi.fn();
const endPlan = vi.fn();
const fetchFaellige = vi.fn();
const fetchBibliothek = vi.fn();
const importiereKatalog = vi.fn();
const saveUebung = vi.fn();
const saveVariante = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchPlanliste: (...a: unknown[]) => fetchPlanliste(...a) as Promise<Api.Planliste | null>,
    fetchPlan: (...a: unknown[]) => fetchPlan(...a) as Promise<Api.Plan | null>,
    createPlan: (...a: unknown[]) => createPlan(...a) as Promise<string>,
    savePlan: (...a: unknown[]) => savePlan(...a) as Promise<void>,
    savePosition: (...a: unknown[]) => savePosition(...a) as Promise<string>,
    movePosition: (...a: unknown[]) => movePosition(...a) as Promise<void>,
    deletePosition: (...a: unknown[]) => deletePosition(...a) as Promise<void>,
    discardPlan: (...a: unknown[]) => discardPlan(...a) as Promise<void>,
    assignPlan: (...a: unknown[]) => assignPlan(...a) as Promise<void>,
    createVersion: (...a: unknown[]) => createVersion(...a) as Promise<string>,
    extendPlan: (...a: unknown[]) => extendPlan(...a) as Promise<void>,
    endPlan: (...a: unknown[]) => endPlan(...a) as Promise<void>,
    fetchFaellige: () => fetchFaellige() as Promise<Api.Faellige | null>,
  };
});

vi.mock('@/features/exercises/api', async (importOriginal) => {
  const actual = await importOriginal<typeof BibliothekApi>();
  return {
    ...actual,
    fetchBibliothek: () => fetchBibliothek() as Promise<BibliothekApi.Bibliothek>,
    importiereKatalog: (...a: unknown[]) =>
      importiereKatalog(...a) as Promise<BibliothekApi.Uebernahme>,
    saveUebung: (...a: unknown[]) => saveUebung(...a) as Promise<string>,
    saveVariante: (...a: unknown[]) => saveVariante(...a) as Promise<string>,
  };
});

const { PlanAbschnitt } = await import('./PlanAbschnitt');
const { PlanPage } = await import('./PlanPage');
const { PlanWiedervorlage } = await import('./Wiedervorlage');
const { PlanblattSeite } = await import('./PlanblattSeite');
const { Vorlagenauswahl } = await import('./Vorlagenauswahl');

function variante(
  id: string,
  name: string,
  laie: string,
  zusatz: Partial<BibliothekApi.Variante> = {},
): BibliothekApi.Variante {
  return {
    id,
    name,
    lay_name: laie,
    instruction: null,
    equipment: [],
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...OHNE_KATALOG,
    ...zusatz,
  };
}

/** UEB-012: zwei übernommene Katalogübungen (ANN-382) mit Standarddosierung (ANN-384). */
const KN01 = variante('k1', 'Kniestreckung im Sitz', 'Im Sitz das Knie strecken', {
  catalog_key: 'KN-01',
  catalog_version: '1.0.0',
  goal: 'kraft',
  starting_position: 'sitz',
  level: 1,
  default_dosage: {
    sets: 3,
    reps_min: 10,
    reps_max: 10,
    duration_seconds: null,
    hold_seconds: 3,
    per_side: true,
    times_per_day: 1,
  },
  illustration: katalogeintrag('KN-01')?.bild ?? null,
});
const KN02 = variante('k2', 'Kniebeugung im Sitz', 'Fuß unter den Stuhl ziehen', {
  catalog_key: 'KN-02',
  catalog_version: '1.0.0',
  default_dosage: {
    sets: 2,
    reps_min: 10,
    reps_max: 10,
    duration_seconds: null,
    hold_seconds: null,
    per_side: false,
    times_per_day: 3,
  },
});
/** Archiviert: zählt für eine Vorlage nicht als vorhanden. */
const KN04 = variante('k4', 'Passive Kniestreckung', 'Ferse hochlegen', {
  catalog_key: 'KN-04',
  archived: true,
});

export const BIBLIOTHEK: BibliothekApi.Bibliothek = {
  can_manage: false,
  exercises: [
    {
      id: 'u1',
      name: 'Kniebeuge',
      lay_name: 'In die Hocke gehen',
      body_region: 'knie',
      archived: false,
      variants: [
        variante('v1', 'Kniebeuge am Geländer', 'Am Geländer in die Hocke', {
          instruction: 'Festhalten.',
          equipment: ['Geländer'],
        }),
        variante('v2', 'Kniebeuge frei', 'Frei in die Hocke'),
      ],
    },
    {
      id: 'u2',
      name: 'Rudern mit Band',
      lay_name: 'Arme zum Körper ziehen',
      body_region: 'bws',
      archived: false,
      variants: [
        variante('v3', 'Rudern, Theraband gelb', 'Gelbes Band heranziehen', {
          equipment: ['Theraband gelb'],
        }),
      ],
    },
    {
      id: 'u3',
      name: 'Kniestreckung im Sitz',
      lay_name: 'Im Sitz das Knie strecken',
      body_region: 'knie',
      archived: false,
      variants: [KN01],
    },
    {
      id: 'u4',
      name: 'Kniebeugung im Sitz',
      lay_name: 'Fuß unter den Stuhl ziehen',
      body_region: 'knie',
      archived: false,
      variants: [KN02, KN04],
    },
  ],
  links: [{ id: 'l1', easier_variant_id: 'v1', harder_variant_id: 'v2', axis: 'unterstuetzung' }],
};

/** Synthetische Vorlagen - nach Thema benannt, ohne Person. */
const VORLAGEN: Katalogvorlage[] = [
  {
    schluessel: 'V91',
    name: 'Knie im Sitz',
    ziel: 'Kraft und Beweglichkeit im Sitz',
    uebungen: [
      { schluessel: 'KN-01' },
      { schluessel: 'KN-02', dosierung: { saetze: 1, wiederholungen: 8 } },
      { schluessel: 'KN-03' },
      { schluessel: 'KN-04' },
    ],
  },
  {
    schluessel: 'V90',
    name: 'Arme im Sitz',
    ziel: 'Kraft der Arme',
    uebungen: [{ schluessel: 'KN-01' }],
  },
];

export function position(teil: Partial<Api.Position> = {}): Api.Position {
  return {
    id: 'i1',
    position: 1,
    variant_id: 'v1',
    exercise_name: 'Kniebeuge',
    exercise_lay_name: 'In die Hocke gehen',
    variant_name: 'Kniebeuge am Geländer',
    variant_lay_name: 'Am Geländer in die Hocke',
    body_region: 'knie',
    instruction: 'Festhalten.',
    equipment: ['Geländer'],
    variant_archived: false,
    ...OHNE_ZUSATZ,
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    duration_seconds: null,
    load: '5 kg',
    tempo: null,
    rest_seconds: 60,
    double_progression: true,
    note: null,
    previous_item_id: null,
    step_axis: null,
    step_direction: null,
    ...teil,
  };
}

export function plan(teil: Partial<Api.Plan> = {}): Api.Plan {
  return {
    id: 'p1',
    service_area: 'therapy',
    relationship_id: 'pat1',
    given_name: 'Erika',
    family_name: 'Beispiel',
    title: 'Heimprogramm Knie',
    sessions_per_week: 3,
    status: 'draft',
    previous_plan_id: null,
    follow_up: null,
    assigned_at: null,
    assigned_by_name: null,
    runs_from: null,
    runs_until: null,
    original_runs_until: null,
    extended_at: null,
    ended_at: null,
    ended_on: null,
    ended_by_name: null,
    created_at: '2026-10-07T08:00:00Z',
    created_by_name: 'Anna Beispiel',
    today: '2026-10-07',
    can_write: true,
    review_due: false,
    relationship_open: true,
    previous: null,
    items: [position()],
    sessions: [],
    ...teil,
  };
}

/** Der Entwurf, mit den synthetischen Vorlagen oder ohne. */
function planseite(vorlagen: readonly Katalogvorlage[] = []) {
  return renderWithProviders(
    <VorlagenKontext.Provider value={vorlagen}>
      <PlanPage />
    </VorlagenKontext.Provider>,
  );
}

beforeEach(() => {
  for (const f of [
    fetchPlanliste,
    fetchPlan,
    createPlan,
    savePlan,
    savePosition,
    movePosition,
    deletePosition,
    discardPlan,
    assignPlan,
    createVersion,
    extendPlan,
    endPlan,
    fetchFaellige,
    fetchBibliothek,
    importiereKatalog,
    saveUebung,
    saveVariante,
  ]) {
    f.mockReset();
  }
  fetchBibliothek.mockResolvedValue(BIBLIOTHEK);
  fetchPlan.mockResolvedValue(plan());
  createPlan.mockResolvedValue('neu');
  savePlan.mockResolvedValue(undefined);
  savePosition.mockResolvedValue('i2');
  movePosition.mockResolvedValue(undefined);
  deletePosition.mockResolvedValue(undefined);
  discardPlan.mockResolvedValue(undefined);
  assignPlan.mockResolvedValue(undefined);
  createVersion.mockResolvedValue('p2');
  extendPlan.mockResolvedValue(undefined);
  endPlan.mockResolvedValue(undefined);
  importiereKatalog.mockResolvedValue({ imported: ['KN-03'], skipped: [], conflicts: [] });
});

describe('Dosierung in Worten (ANN-299)', () => {
  it('schreibt fachlich, kurz und in Alltagssprache', () => {
    expect(dosierungFachlich(position())).toBe(
      '3 × 8–12 Wdh. · 5 kg · Pause 60 s · doppelte Progression',
    );
    expect(
      dosierungKurz(
        position({
          sets: 3,
          reps_min: 10,
          reps_max: 10,
          load: null,
          per_side: true,
          hold_seconds: 5,
          times_per_day: 2,
        }),
      ),
    ).toBe('3 × 10 · je Seite · 5 s halten · 2× täglich');
    expect(
      dosierungKurz(
        position({ reps_min: null, reps_max: null, duration_seconds: 240, load: null }),
      ),
    ).toBe('3 × 4 min');
    expect(dosierungAlltag(position({ double_progression: false }))).toBe(
      '3 Durchgänge mit je 8 bis 12 Wiederholungen. Mit: 5 kg. Pause dazwischen: 60 Sekunden.',
    );
    expect(
      dosierungAlltag(
        position({
          sets: 1,
          reps_min: null,
          reps_max: null,
          duration_seconds: 30,
          load: null,
          rest_seconds: null,
          double_progression: false,
        }),
      ),
    ).toBe('1 Durchgang von je 30 Sekunden.');
  });

  it('erklärt die doppelte Progression, ohne selbst zu steigern (IDEA-TRN-007)', () => {
    expect(dosierungAlltag(position())).toContain(
      'Beginnen Sie mit 8 und steigern Sie bis 12 Wiederholungen.',
    );
  });

  it('nennt die Unterschiede zur vorigen Fassung', () => {
    expect(unterschiede(position(), position({ load: '7 kg' }))).toEqual(['Last: 5 kg → 7 kg']);
    expect(
      unterschiede(position(), position({ variant_id: 'v2', variant_name: 'Kniebeuge frei' })),
    ).toEqual(['Übung: Kniebeuge am Geländer → Kniebeuge frei']);
  });
});

describe('PlanAbschnitt (UEB-004)', () => {
  it('listet die Pläne und legt einen neuen Entwurf an', async () => {
    fetchPlanliste.mockResolvedValue({
      can_write: true,
      today: '2026-10-07',
      plans: [
        {
          id: 'p1',
          title: 'Heimprogramm Knie',
          status: 'draft',
          sessions_per_week: null,
          previous_plan_id: null,
          assigned_at: null,
          runs_from: null,
          runs_until: null,
          ended_at: null,
          created_at: '2026-10-07T08:00:00Z',
          item_count: 2,
          review_due: false,
        },
      ],
    });
    const user = userEvent.setup();
    renderWithProviders(
      <PlanAbschnitt bereich="therapy" verhaeltnisId="pat1" rueckweg="/patienten/pat1/doku" />,
    );
    const zeile = await screen.findByRole('link', { name: /Heimprogramm Knie/ });
    expect(zeile).toHaveTextContent('Entwurf · 2 Übungen');
    expect(zeile.getAttribute('href')).toContain('/patienten/pat1/plaene/p1');

    await user.click(screen.getByRole('button', { name: 'Neuer Plan' }));
    await waitFor(() => expect(createPlan).toHaveBeenCalledWith('therapy', 'pat1', 'Übungsplan'));
  });

  it('bietet ohne Schreibrecht keinen neuen Plan an (ANN-298)', async () => {
    fetchPlanliste.mockResolvedValue({ can_write: false, today: '2026-10-07', plans: [] });
    renderWithProviders(
      <PlanAbschnitt bereich="training" verhaeltnisId="t1" rueckweg="/training/t1" />,
    );
    expect(await screen.findByText('Noch kein Plan')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trainingspläne' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neuer Plan' })).not.toBeInTheDocument();
  });
});

describe('Planeditor: Entwurf als Arbeitsseite (UEB-004, Welle B)', () => {
  it('zeigt die Positionen als Zeilen mit kurzer Dosierung', async () => {
    planseite();
    const zeile = await screen.findByRole('button', { name: /1\. Kniebeuge am Geländer/ });
    expect(zeile).toHaveTextContent('3 × 8–12 · 5 kg');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Heimprogramm Knie' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
  });

  it('fügt mehrere Übungen in einem Zug mit ihrer Standarddosierung hinzu', async () => {
    const user = userEvent.setup();
    savePosition.mockResolvedValueOnce('n1').mockResolvedValueOnce('n2');
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = screen.getByRole('dialog', { name: 'Übungen hinzufügen' });
    // Nichts ist vorausgewählt (ADR-006 Punkt 10).
    expect(
      within(blatt)
        .getAllByRole('checkbox')
        .filter((k) => (k as HTMLInputElement).checked),
    ).toEqual([]);
    expect(within(blatt).getByRole('button', { name: 'Hinzufügen' })).toBeDisabled();

    await user.type(within(blatt).getByRole('searchbox', { name: 'Übung suchen' }), 'sitz');
    await user.click(within(blatt).getByRole('checkbox', { name: /Kniebeugung im Sitz/ }));
    await user.click(within(blatt).getByRole('checkbox', { name: /Kniestreckung im Sitz/ }));
    await user.click(within(blatt).getByRole('button', { name: '2 hinzufügen' }));

    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(2));
    // In der Reihenfolge der Wahl, je mit der Standarddosierung (ANN-384).
    expect(savePosition.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        planId: 'p1',
        variantId: 'k2',
        saetze: 2,
        wdhVon: 10,
        wdhBis: 10,
        dauer: null,
        halten: null,
        jeSeite: false,
        amTag: 3,
        hinweis: '',
        achse: null,
      }),
    );
    expect(savePosition.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ variantId: 'k1', saetze: 3, halten: 3, jeSeite: true, amTag: 1 }),
    );
    expect(await screen.findByText('2 Übungen hinzugefügt.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nimmt für eine eigene Übung ohne Standarddosierung die bisherige Vorbelegung', async () => {
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = screen.getByRole('dialog');
    await user.click(within(blatt).getByRole('checkbox', { name: /Rudern, Theraband gelb/ }));
    await user.click(within(blatt).getByRole('button', { name: '1 hinzufügen' }));
    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(
        expect.objectContaining({ variantId: 'v3', saetze: 3, wdhVon: 10, wdhBis: 12 }),
      ),
    );
  });

  it('sagt, wie viele angekommen sind, wenn eine scheitert', async () => {
    const user = userEvent.setup();
    savePosition
      .mockResolvedValueOnce('n1')
      .mockRejectedValueOnce(new Error('Ein Plan hat höchstens 30 Übungen.'));
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = screen.getByRole('dialog');
    await user.click(within(blatt).getByRole('checkbox', { name: /Kniebeuge frei/ }));
    await user.click(within(blatt).getByRole('checkbox', { name: /Rudern, Theraband gelb/ }));
    await user.click(within(blatt).getByRole('button', { name: '2 hinzufügen' }));
    expect(
      await screen.findByText('1 von 2 Übungen hinzugefügt. Ein Plan hat höchstens 30 Übungen.'),
    ).toBeInTheDocument();
  });

  it('ändert die Dosierung mit Zahlschritten statt Feldern', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(
      plan({ items: [position({ double_progression: false, load: null, rest_seconds: null })] }),
    );
    planseite();
    await user.click(await screen.findByRole('button', { name: /1\. Kniebeuge am Geländer/ }));
    const fenster = screen.getByRole('dialog', { name: '1. Kniebeuge am Geländer' });
    await user.click(within(fenster).getByRole('button', { name: 'Sätze: mehr' }));
    await user.click(within(fenster).getByRole('button', { name: 'Halten: mehr' }));
    await user.click(within(fenster).getByRole('button', { name: 'Halten: mehr' }));
    await user.click(within(fenster).getByRole('button', { name: 'Am Tag: mehr' }));
    await user.click(within(fenster).getByLabelText('Je Seite'));
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'i1',
          saetze: 4,
          wdhVon: 8,
          wdhBis: 12,
          halten: 2,
          jeSeite: true,
          amTag: 1,
          achse: null,
          richtung: null,
        }),
      ),
    );
  });

  it('verlangt für die doppelte Progression eine Last', async () => {
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: /1\. Kniebeuge am Geländer/ }));
    const fenster = screen.getByRole('dialog');
    await user.clear(within(fenster).getByLabelText('Last'));
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    expect(
      within(fenster).getAllByText('Doppelte Progression braucht eine Last.').length,
    ).toBeGreaterThan(0);
    expect(savePosition).not.toHaveBeenCalled();
  });

  it('verschiebt, entfernt und verwirft', async () => {
    fetchPlan.mockResolvedValue(
      plan({
        items: [position(), position({ id: 'i2', position: 2, variant_name: 'Kniebeuge frei' })],
      }),
    );
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: /2\. Kniebeuge frei/ }));
    await user.click(screen.getByRole('button', { name: 'Kniebeuge frei nach oben' }));
    await waitFor(() => expect(movePosition).toHaveBeenCalledWith('i2', 'up'));
    expect(screen.getByRole('button', { name: 'Kniebeuge frei nach unten' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Kniebeuge frei entfernen' }));
    await waitFor(() => expect(deletePosition).toHaveBeenCalledWith('i2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(discardPlan).toHaveBeenCalledWith('p1'));
  });

  it('zeigt einen Entwurf ohne Schreibrecht nur an (ANN-298)', async () => {
    fetchPlan.mockResolvedValue(plan({ can_write: false }));
    planseite();
    expect(await screen.findByText('1. Kniebeuge am Geländer')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /1\. Kniebeuge am Geländer/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übungen hinzufügen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf verwerfen' })).not.toBeInTheDocument();
  });

  it('meldet einen Plan, den es nicht gibt', async () => {
    fetchPlan.mockResolvedValue(null);
    planseite();
    expect(await screen.findByText('Plan nicht gefunden')).toBeInTheDocument();
  });

  it('lässt owner eine fehlende Übung im Auswahlblatt anlegen; sie ist danach gewählt', async () => {
    const user = userEvent.setup();
    const NEU = variante('neu-v', 'Seitstütz', 'Seitlich stützen');
    fetchBibliothek.mockResolvedValueOnce({ ...BIBLIOTHEK, can_manage: true }).mockResolvedValue({
      ...BIBLIOTHEK,
      can_manage: true,
      exercises: [
        ...BIBLIOTHEK.exercises,
        {
          id: 'neu',
          name: 'Seitstütz',
          lay_name: 'Seitlich stützen',
          body_region: 'rumpf',
          archived: false,
          variants: [NEU],
        },
      ],
    });
    saveUebung.mockResolvedValue('neu');
    saveVariante.mockResolvedValue('neu-v');
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Nicht dabei? Übung anlegen' }));
    const fenster = screen.getByRole('dialog', { name: 'Übung anlegen' });
    await user.type(within(fenster).getByLabelText('Bezeichnung *'), 'Seitstütz');
    await user.type(
      within(fenster).getByLabelText('Bezeichnung in Alltagssprache *'),
      'Seitlich stützen',
    );
    await user.selectOptions(within(fenster).getByLabelText('Körperregion *'), 'rumpf');
    await user.click(within(fenster).getByRole('button', { name: 'Anlegen und wählen' }));

    const blatt = await screen.findByRole('dialog', { name: 'Übungen hinzufügen' });
    expect(await within(blatt).findByRole('checkbox', { name: /Seitstütz/ })).toBeChecked();
    await user.click(within(blatt).getByRole('button', { name: '1 hinzufügen' }));
    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'neu-v' })),
    );
  });

  it('bietet das Anlegen im Auswahlblatt ohne Pflegerecht nicht an (ANN-293)', async () => {
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    expect(screen.queryByRole('button', { name: /Übung anlegen/ })).not.toBeInTheDocument();
  });
});

describe('Aus Vorlage (Welle B)', () => {
  it('blendet „Aus Vorlage“ aus, solange es keine Vorlage gibt', async () => {
    fetchPlan.mockResolvedValue(plan({ items: [] }));
    planseite([]);
    expect(await screen.findByText('Noch keine Übung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aus Vorlage' })).not.toBeInTheDocument();
  });

  it('fügt die Übungen einer Vorlage über den Katalogschlüssel hinzu und nennt, was fehlt', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(plan({ items: [], title: 'Übungsplan' }));
    planseite(VORLAGEN);
    await user.click(await screen.findByRole('button', { name: 'Aus Vorlage' }));
    const fenster = screen.getByRole('dialog', { name: 'Aus Vorlage' });
    await user.click(within(fenster).getByRole('button', { name: /Knie im Sitz/ }));

    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(2));
    expect(savePosition.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ variantId: 'k1', saetze: 3, halten: 3, jeSeite: true, amTag: 1 }),
    );
    // Die Dosierung der Vorlage geht der Standarddosierung vor.
    expect(savePosition.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ variantId: 'k2', saetze: 1, wdhVon: 8, wdhBis: 8, amTag: null }),
    );
    // Ein leerer Entwurf heißt danach wie die Vorlage.
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith('p1', 'Knie im Sitz', 3));
    expect(
      await screen.findByText('2 Übungen hinzugefügt aus „Knie im Sitz“.'),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'Nicht in der Bibliothek der Praxis: Fußgleiten im Sitz. Übernehmen kann die Praxisinhaber:in.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('In der Bibliothek archiviert: Passive Kniestreckung, Ferse hochgelagert.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aus dem Katalog übernehmen und hinzufügen' }),
    ).not.toBeInTheDocument();
  });

  it('bietet owner an, was fehlt, aus dem Katalog zu übernehmen und hinzuzufügen (ANN-385)', async () => {
    const user = userEvent.setup();
    const KN03 = variante('k3', 'Fußgleiten im Sitz', 'Fuß auf dem Handtuch', {
      catalog_key: 'KN-03',
    });
    const mitPflege = { ...BIBLIOTHEK, can_manage: true };
    fetchBibliothek.mockResolvedValueOnce(mitPflege).mockResolvedValue({
      ...mitPflege,
      exercises: [
        ...mitPflege.exercises,
        {
          id: 'u9',
          name: 'Fußgleiten im Sitz',
          lay_name: 'Fuß auf dem Handtuch',
          body_region: 'knie',
          archived: false,
          variants: [KN03],
        },
      ],
    });
    planseite(VORLAGEN);
    await user.click(await screen.findByRole('button', { name: 'Aus Vorlage' }));
    await user.click(screen.getByRole('button', { name: /Knie im Sitz/ }));
    await user.click(
      await screen.findByRole('button', { name: 'Aus dem Katalog übernehmen und hinzufügen' }),
    );
    await waitFor(() => expect(importiereKatalog).toHaveBeenCalledTimes(1));
    const uebernommen = importiereKatalog.mock.calls[0]![0] as { schluessel: string }[];
    expect(uebernommen.map((e) => e.schluessel)).toEqual(['KN-03']);
    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(expect.objectContaining({ variantId: 'k3' })),
    );
    expect(
      await screen.findByText(/1 Übung übernommen und hinzugefügt\. Sie gelten bis zur Durchsicht/),
    ).toBeInTheDocument();
  });

  it('liest für die Vorlagenliste nie Angaben der Person (ADR-006 Punkt 10)', async () => {
    // Die Liste bekommt nur die Vorlagen - sie entsteht ohne Plan und ohne Person …
    const ohnePerson = renderWithProviders(
      <Vorlagenauswahl
        vorlagen={VORLAGEN}
        onWaehlen={() => undefined}
        onSchliessen={() => undefined}
      />,
    );
    const zeilen = () =>
      within(screen.getByRole('dialog', { name: 'Aus Vorlage' }))
        .getAllByRole('button')
        .map((knopf) => knopf.textContent);
    const allein = zeilen();
    // … nach Name geordnet, nicht nach der Reihenfolge im Katalog.
    expect(allein[0]).toContain('Arme im Sitz');
    expect(allein[1]).toContain('Knie im Sitz');
    ohnePerson.unmount();

    // … und am Plan zweier verschiedener Personen gleich.
    const user = userEvent.setup();
    const gesehen: (string | null)[][] = [];
    for (const person of [
      plan({ given_name: 'Erika', family_name: 'Beispiel', title: 'Knie nach Operation' }),
      plan({
        id: 'p7',
        relationship_id: 'pat7',
        given_name: 'Hans',
        family_name: 'Muster',
        title: 'Schulter',
      }),
    ]) {
      fetchPlan.mockResolvedValue(person);
      const seite = planseite(VORLAGEN);
      await user.click(await screen.findByRole('button', { name: 'Aus Vorlage' }));
      gesehen.push(zeilen());
      seite.unmount();
    }
    expect(gesehen[0]).toEqual(allein);
    expect(gesehen[1]).toEqual(allein);
    // Keine Abfrage zur Person außer dem Plan selbst.
    expect(fetchPlanliste).not.toHaveBeenCalled();
  });
});

describe('Zuweisen und Schnappschuss (UEB-005)', () => {
  it('weist mit sechs Wochen als Vorschlag zu, nach Rückfrage im Fenster (ANN-302)', async () => {
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Zuweisen' }));
    const fenster = screen.getByRole('dialog', { name: 'Plan zuweisen' });
    const feld = within(fenster).getByLabelText('Läuft bis *');
    expect(feld).toHaveValue('2026-11-18');
    expect(feld).toHaveAttribute('max', '2027-04-07');
    expect(within(fenster).getByText(/Danach lässt er sich nicht mehr ändern/)).toBeInTheDocument();
    await user.click(within(fenster).getByRole('button', { name: 'Zuweisen' }));
    await waitFor(() => expect(assignPlan).toHaveBeenCalledWith('p1', '2026-11-18'));
  });

  it('zeigt den zugewiesenen Plan ohne Bearbeitung, fachlich und in Alltagssprache', async () => {
    fetchPlan.mockResolvedValue(
      plan({
        status: 'assigned',
        runs_from: '2026-10-01',
        runs_until: '2026-11-12',
        original_runs_until: '2026-11-12',
        assigned_by_name: 'Anna Beispiel',
        items: [position({ note: 'Langsam runter.' })],
      }),
    );
    const user = userEvent.setup();
    planseite();
    expect(await screen.findByText('von Anna Beispiel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übungen hinzufügen' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /1\. Kniebeuge am Geländer/ }),
    ).not.toBeInTheDocument();
    const liste = screen.getByRole('heading', { name: 'Übungen (1)' }).closest('section')!;
    expect(liste).toHaveTextContent('1. Kniebeuge am Geländer');
    expect(liste).toHaveTextContent('3 × 8–12 Wdh. · 5 kg');

    await user.click(screen.getByRole('button', { name: 'In Alltagssprache' }));
    expect(liste).toHaveTextContent('1. Am Geländer in die Hocke');
    expect(liste).toHaveTextContent('3 Durchgänge mit je 8 bis 12 Wiederholungen.');
    expect(liste).toHaveTextContent('Sie brauchen: Geländer');
    expect(liste).toHaveTextContent('Langsam runter.');
  });

  it('kennzeichnet einen abgelaufenen Plan', async () => {
    fetchPlan.mockResolvedValue(
      plan({
        status: 'assigned',
        runs_from: '2026-08-01',
        runs_until: '2026-10-01',
        original_runs_until: '2026-10-01',
      }),
    );
    planseite();
    const laeuftBis = (await screen.findByText('Läuft bis')).closest('div')!;
    expect(laeuftBis).toHaveTextContent('abgelaufen');
  });
});

describe('Progression von Hand (UEB-006)', () => {
  const zugewiesen = () =>
    plan({
      status: 'assigned',
      runs_from: '2026-10-01',
      runs_until: '2026-11-12',
      original_runs_until: '2026-11-12',
    });

  const fassung = (teil: Partial<Api.Position> = {}) =>
    plan({
      id: 'p2',
      previous_plan_id: 'p1',
      previous: {
        id: 'p1',
        title: 'Heimprogramm Knie',
        sessions_per_week: 3,
        runs_from: '2026-10-01',
        runs_until: '2026-11-12',
        items: [position({ id: 'alt1' })],
      },
      items: [position({ id: 'i2', previous_item_id: 'alt1', ...teil })],
    });

  it('legt aus einem zugewiesenen Plan eine neue Fassung an', async () => {
    fetchPlan.mockResolvedValue(zugewiesen());
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Neue Fassung' }));
    await waitFor(() => expect(createVersion).toHaveBeenCalledWith('p1'));
  });

  it('bietet ohne Schreibrecht keine neue Fassung an, zeigt aber den Weg zur vorhandenen', async () => {
    fetchPlan.mockResolvedValue({
      ...zugewiesen(),
      can_write: false,
      follow_up: { id: 'p2', status: 'draft' },
    });
    planseite();
    expect(await screen.findByRole('link', { name: 'Neue Fassung (Entwurf)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neue Fassung' })).not.toBeInTheDocument();
  });

  it('zeigt Schritt und Unterschied zur vorigen Fassung', async () => {
    fetchPlan.mockResolvedValue(
      fassung({ load: '7 kg', step_axis: 'last', step_direction: 'harder' }),
    );
    planseite();
    const zeile = await screen.findByRole('button', { name: /1\. Kniebeuge am Geländer/ });
    expect(zeile).toHaveTextContent('Schwerer: Last');
    expect(zeile).toHaveTextContent('Last: 5 kg → 7 kg');
    expect(screen.getByRole('link', { name: 'Vorige Fassung' })).toBeInTheDocument();
  });

  it('wählt den Schritt von Hand - die Nachbarn erst nach Richtung und Achse (ADR-006 Punkt 10)', async () => {
    fetchPlan.mockResolvedValue(fassung());
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: /1\. Kniebeuge am Geländer/ }));
    const formular = screen.getByRole('form', { name: 'Übung im Plan ändern' });
    expect(
      within(formular).queryByRole('button', { name: 'Kniebeuge frei' }),
    ).not.toBeInTheDocument();

    await user.click(within(formular).getByRole('button', { name: 'Schwerer' }));
    await user.click(within(formular).getByRole('button', { name: 'Speichern' }));
    expect(within(formular).getAllByText('Bitte die Achse wählen.').length).toBeGreaterThan(0);

    await user.selectOptions(within(formular).getByLabelText('Achse'), 'unterstuetzung');
    await user.click(within(formular).getByRole('button', { name: 'Kniebeuge frei' }));
    await user.click(within(formular).getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'i2',
          variantId: 'v2',
          achse: 'unterstuetzung',
          richtung: 'harder',
        }),
      ),
    );
  });

  it('nennt ohne Verbindung den Weg über den Wert', async () => {
    fetchPlan.mockResolvedValue(fassung());
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: /1\. Kniebeuge am Geländer/ }));
    await user.click(screen.getByRole('button', { name: 'Schwerer' }));
    await user.selectOptions(screen.getByLabelText('Achse'), 'last');
    expect(screen.getByText(/keine Variante verbunden/)).toBeInTheDocument();
  });
});

describe('Laufzeit und Wiedervorlage (UEB-007)', () => {
  const auslaufend = () =>
    plan({
      status: 'assigned',
      runs_from: '2026-08-27',
      runs_until: '2026-10-10',
      original_runs_until: '2026-10-10',
      review_due: true,
    });

  it('fordert im Kopf zur Entscheidung auf und verlängert um sechs Wochen ab dem bisherigen Ende', async () => {
    fetchPlan.mockResolvedValue(auslaufend());
    const user = userEvent.setup();
    planseite();
    expect(await screen.findByText(/Die Laufzeit endet am/)).toHaveTextContent(
      'Bitte entscheiden: verlängern, als neue Fassung ändern oder beenden.',
    );
    // Die Warnzeile sagt es; ein Abzeichen „läuft aus“ daneben wäre doppelt.
    expect(screen.queryByText('läuft aus')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Verlängern bis')).toHaveValue('2026-11-21');
    await user.click(screen.getByRole('button', { name: 'Verlängern' }));
    await waitFor(() => expect(extendPlan).toHaveBeenCalledWith('p1', '2026-11-21'));
  });

  it('beendet nach Rückfrage', async () => {
    fetchPlan.mockResolvedValue(auslaufend());
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Plan beenden' }));
    await user.click(screen.getByRole('button', { name: 'Beenden' }));
    await waitFor(() => expect(endPlan).toHaveBeenCalledWith('p1'));
  });

  it('bietet ohne Schreibrecht nichts zu entscheiden an (ANN-298)', async () => {
    fetchPlan.mockResolvedValue({ ...auslaufend(), can_write: false });
    planseite();
    expect(await screen.findByText('Läuft bis')).toBeInTheDocument();
    expect(screen.queryByText(/Bitte entscheiden/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verlängern' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan beenden' })).not.toBeInTheDocument();
  });

  it('listet auslaufende Pläne der eigenen Bereiche, abgelaufene gekennzeichnet', async () => {
    fetchFaellige.mockResolvedValue({
      today: '2026-10-07',
      plans: [
        {
          id: 'p1',
          service_area: 'therapy',
          relationship_id: 'pat1',
          given_name: 'Erika',
          family_name: 'Beispiel',
          title: 'Heimprogramm Knie',
          runs_until: '2026-10-01',
          follow_up_draft: true,
        },
        {
          id: 'p9',
          service_area: 'training',
          relationship_id: 't1',
          given_name: 'Tina',
          family_name: 'Training',
          title: 'Kraft',
          runs_until: '2026-10-10',
          follow_up_draft: false,
        },
      ],
    });
    renderWithProviders(<PlanWiedervorlage bereiche={['therapy']} rueckweg="/offen" />);
    const zeile = await screen.findByRole('link', { name: /Beispiel, Erika/ });
    expect(zeile).toHaveTextContent('Heimprogramm Knie · Behandlung · bis');
    expect(zeile).toHaveTextContent('neue Fassung im Entwurf');
    expect(zeile).toHaveTextContent('abgelaufen');
    expect(screen.queryByText(/Training, Tina/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pläne laufen aus (1)' })).toBeInTheDocument();
  });

  it('bleibt auf einer Gastseite ohne Eintrag unsichtbar', async () => {
    fetchFaellige.mockResolvedValue({ today: '2026-10-07', plans: [] });
    const { container } = renderWithProviders(
      <PlanWiedervorlage bereiche={['training']} rueckweg="/training" nurWennVorhanden />,
    );
    await waitFor(() => expect(fetchFaellige).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('meldet einen Ladefehler auf einer Gastseite als Zeile, ohne zweiten Knopf', async () => {
    fetchFaellige.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(
      <PlanWiedervorlage bereiche={['training']} rueckweg="/training" nurWennVorhanden />,
    );
    expect(
      await screen.findByText('Die auslaufenden Pläne konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).not.toBeInTheDocument();
  });
});

describe('Plan als Blatt (UEB-008, ANN-303)', () => {
  const zugewiesen = () =>
    plan({
      status: 'assigned',
      runs_from: '2026-10-07',
      runs_until: '2026-11-18',
      items: [
        position({ note: 'Langsam ablassen.' }),
        position({
          id: 'i2',
          position: 2,
          variant_lay_name: 'Im Sitz das Knie strecken',
          variant_name: 'Kniestreckung im Sitz',
          instruction: 'Aufrecht sitzen.\nKnie strecken.\nLangsam ablassen.',
          illustration: katalogeintrag('KN-01')?.bild ?? null,
          load: null,
          double_progression: false,
        }),
      ],
    });

  it('druckt den Schnappschuss in Alltagssprache, mit Bild und Schritten, ohne fachliche Bezeichnung', async () => {
    fetchPlan.mockResolvedValue(zugewiesen());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(<PlanblattSeite user={testUser(['therapist'])} />);
    const blatt = await screen.findByRole('article', { name: 'Planblatt' });
    expect(blatt).toHaveTextContent('Ihr Übungsplan für Erika Beispiel');
    expect(blatt).toHaveTextContent('1. Am Geländer in die Hocke');
    expect(blatt).toHaveTextContent('3 Durchgänge mit je 8 bis 12 Wiederholungen.');
    expect(blatt).toHaveTextContent('Sie brauchen: Geländer');
    expect(blatt).toHaveTextContent('Hinweis: Langsam ablassen.');
    expect(blatt).toHaveTextContent('3-mal pro Woche');
    expect(blatt).not.toHaveTextContent('Kniebeuge am Geländer');
    // UEB-012: das eingefrorene Bild, Start und Ende, und die Anleitung in Schritten.
    expect(
      within(blatt).getByRole('img', { name: 'Im Sitz das Knie strecken: Ausgangsstellung' }),
    ).toBeInTheDocument();
    expect(
      within(blatt).getByRole('img', { name: 'Im Sitz das Knie strecken: Endstellung' }),
    ).toBeInTheDocument();
    expect(within(blatt).getByText('Knie strecken.').tagName).toBe('LI');
    await user.click(screen.getByRole('button', { name: 'Drucken oder als PDF sichern' }));
    expect(print).toHaveBeenCalled();
    print.mockRestore();
  });

  it('hat für einen Entwurf kein Blatt', async () => {
    renderWithProviders(<PlanblattSeite user={testUser(['therapist'])} />);
    expect(await screen.findByText('Kein Blatt')).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Planblatt' })).not.toBeInTheDocument();
  });

  it('bietet das Blatt am zugewiesenen Plan an, nicht im Entwurf', async () => {
    fetchPlan.mockResolvedValue(zugewiesen());
    planseite();
    expect(await screen.findByRole('link', { name: 'Als PDF oder drucken' })).toHaveAttribute(
      'href',
      '/patienten/pat1/plaene/p1/blatt',
    );
  });
});

describe('Durchgeführt (UEB-010)', () => {
  it('zeigt die Einheiten der Person am zugewiesenen Plan', async () => {
    fetchPlan.mockResolvedValue(
      plan({
        status: 'assigned',
        runs_from: '2026-10-07',
        runs_until: '2026-11-18',
        sessions: [
          {
            id: 's1',
            performed_on: '2026-10-08',
            started_at: '2026-10-08T07:00:00Z',
            finished_at: '2026-10-08T07:20:00Z',
            sets_done: 3,
            sets_total: 3,
            sets_by_item: { i1: 3 },
            difficulty_note: 'Knie zieht',
            values: { session_exertion: 6, session_pain: 2 },
            recorded_by_kind: 'self',
            finished_by_kind: 'self',
          },
          {
            id: 's2',
            performed_on: '2026-10-07',
            started_at: '2026-10-07T07:00:00Z',
            finished_at: null,
            sets_done: 1,
            sets_total: 3,
            sets_by_item: { i1: 1 },
            difficulty_note: null,
            values: {},
            recorded_by_kind: 'legal_representative',
            finished_by_kind: null,
          },
        ],
      }),
    );
    planseite();
    const abschnitt = (await screen.findByRole('heading', { name: 'Durchgeführt' })).closest(
      'section',
    )!;
    expect(abschnitt).toHaveTextContent('08.10.2026 · 3 von 3 Durchgängen');
    expect(abschnitt).toHaveTextContent('Schwierig, weil: Knie zieht');
    // TRK-001: die Angaben mit ihrem Wert, ohne Einordnung.
    expect(abschnitt).toHaveTextContent('Angaben: Anstrengung 6 · Schmerz 2');
    expect(abschnitt).toHaveTextContent(
      '07.10.2026 · 1 von 3 Durchgängen · nicht beendet · erfasst von der Vertretung',
    );
    // OUT-003: je Übung gezählt, nur beendete Einheiten, ohne Deutung.
    const jeUebung = within(abschnitt).getByRole('list', { name: /Je Übung/ });
    const zeile = within(jeUebung).getAllByRole('listitem')[0]!;
    expect(zeile).toHaveTextContent('1. Kniebeuge am Geländer');
    expect(zeile).toHaveTextContent('Alle Sätze: 1');
    expect(zeile).toHaveTextContent('Ein Teil: 0');
    expect(zeile).toHaveTextContent('Ausgelassen: 0');
    expect(zeile).toHaveTextContent('08.10.2026 alle Sätze');
    expect(abschnitt).toHaveTextContent('In einer beendeten Einheit abgehakt.');
    expect(abschnitt).not.toHaveTextContent(/zu schwer|ersetzen|Quote|%/);
  });

  it('zeigt im Entwurf keinen Abschnitt', async () => {
    planseite();
    await screen.findByRole('heading', { name: 'Heimprogramm Knie' });
    expect(screen.queryByText('Durchgeführt')).not.toBeInTheDocument();
  });
});
