import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { focusManager } from '@tanstack/react-query';
import { Route, Routes } from 'react-router-dom';
import type * as Api from './api';
import type * as BibliothekApi from '../api';
import { katalogeintrag } from '../katalog';
import type { Katalogeintrag, Katalogvorlage } from '../katalog/typen';
import type * as KatalogLaden from '../katalogLaden';
import type * as ZugangApi from '@/features/portal/platform-access/api';
import { renderWithProviders, testUser } from '@/test-utils';
import {
  dosierungAlltag,
  dosierungFachlich,
  dosierungKurz,
  dosierungZeile,
  steigerungsregel,
  unterschiede,
} from './dosierung';
import { OHNE_KATALOG } from '../testdaten';
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
const addCatalogExercises = vi.fn();
const ladeKatalog = vi.fn();
const getPlatformAccess = vi.fn();
const fetchPraxisvorlagen = vi.fn();
const savePraxisvorlage = vi.fn();

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
    addCatalogExercises: (...a: unknown[]) =>
      addCatalogExercises(...a) as Promise<Api.KatalogUebernahme>,
    fetchPraxisvorlagen: () => fetchPraxisvorlagen() as Promise<Api.Praxisvorlagen>,
    savePraxisvorlage: (...a: unknown[]) => savePraxisvorlage(...a) as Promise<string>,
  };
});

// Ein kleiner synthetischer Katalog statt der 196 Einträge - aus echten
// Einträgen zusammengestellt, damit Namen und Dosierungen stimmen.
vi.mock('../katalogLaden', async (importOriginal) => {
  const actual = await importOriginal<typeof KatalogLaden>();
  return {
    ...actual,
    ladeKatalog: () => ladeKatalog() as Promise<readonly Katalogeintrag[]>,
  };
});

// Der Plattformzugang der Person - für die Bestätigung nach dem Zuweisen (B9).
vi.mock('@/features/portal/platform-access/api', async (importOriginal) => {
  const actual = await importOriginal<typeof ZugangApi>();
  return {
    ...actual,
    getPlatformAccess: (...a: unknown[]) =>
      getPlatformAccess(...a) as Promise<ZugangApi.Plattformzugang | null>,
  };
});

vi.mock('../api', async (importOriginal) => {
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
    version_number: 1,
    updated_on: '2026-10-07',
    updated_by_name: 'Anna Beispiel',
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

/**
 * Der Entwurf, mit den synthetischen Vorlagen oder ohne - unter seiner
 * Adresse wie in der Anwendung: Die Seite lädt den Plan unter der Kennung aus
 * der Adresse, und Titel und Häufigkeit lesen ihn dort (kopfdaten.ts).
 */
function planseite(vorlagen: readonly Katalogvorlage[] = []) {
  return renderWithProviders(
    <VorlagenKontext.Provider value={vorlagen}>
      <Routes>
        <Route path="/patienten/:patientId/plaene/:planId" element={<PlanPage />} />
        <Route path="*" element={<p>Andere Seite</p>} />
      </Routes>
    </VorlagenKontext.Provider>,
    '/patienten/pat1/plaene/p1',
  );
}

/** Ein Aufruf, den der Test selbst beendet - auf oder zu. */
interface Tor {
  versprechen: Promise<void>;
  auf: () => void;
  zu: (fehler: Error) => void;
}

function tor(): Tor {
  let auf!: () => void;
  let zu!: (fehler: Error) => void;
  const versprechen = new Promise<void>((ja, nein) => {
    auf = ja;
    zu = nein;
  });
  return { versprechen, auf, zu };
}

/**
 * Titel und Häufigkeit am Server nachgebaut: Gespeichertes kommt beim
 * Nachladen zurück. Liegt ein Tor bereit, wartet der nächste Aufruf darauf;
 * geht es zu, bleibt der Stand, wie er war.
 */
function kopfNachbau(start: Api.Plan = plan()) {
  const server = { plan: start, tore: [] as Tor[] };
  fetchPlan.mockImplementation(() => Promise.resolve(server.plan));
  savePlan.mockImplementation(async (_id: string, titel: string, einheiten: number | null) => {
    await server.tore.shift()?.versprechen;
    server.plan = { ...server.plan, title: titel, sessions_per_week: einheiten };
  });
  return server;
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
    addCatalogExercises,
    ladeKatalog,
    getPlatformAccess,
    fetchPraxisvorlagen,
    savePraxisvorlage,
  ]) {
    f.mockReset();
  }
  // UEB-014: ohne eigene Vorlagen, anlegen darf die Person.
  fetchPraxisvorlagen.mockResolvedValue({ can_create: true, templates: [] });
  savePraxisvorlage.mockResolvedValue('vorlage-neu');
  // Ohne Zugang liefert der Server eine leere Zeile; `null` steht für dasselbe.
  getPlatformAccess.mockResolvedValue(null);
  ladeKatalog.mockResolvedValue(
    ['KN-01', 'KN-02', 'KN-03', 'KN-04', 'HU-01'].map((k) => katalogeintrag(k)!),
  );
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

  it('setzt die Dosierung für das Planblatt in eine Zeile (Handoff 2026-10-24, 5.7)', () => {
    expect(dosierungZeile(position({ load: 'Rucksack 3 kg' }))).toBe(
      '3 Durchgänge mit je 8 bis 12 Wiederholungen\u00a0· 60 Sekunden Pause\u00a0· mit Rucksack 3 kg',
    );
    expect(
      dosierungZeile(
        position({
          sets: 2,
          reps_min: null,
          reps_max: null,
          duration_seconds: 30,
          load: null,
          rest_seconds: 45,
        }),
      ),
    ).toBe('2 Durchgänge von je 30 Sekunden\u00a0· 45 Sekunden Pause');
    expect(
      dosierungZeile(
        position({
          reps_min: 10,
          reps_max: 10,
          hold_seconds: 5,
          per_side: true,
          times_per_day: 2,
          load: null,
          tempo: '3-0-1',
          rest_seconds: 0,
        }),
      ),
    ).toBe(
      '3 Durchgänge mit je 10 Wiederholungen, jede 5 Sekunden halten, je Seite\u00a0· 2-mal am Tag\u00a0· Tempo 3-0-1',
    );
    expect(
      dosierungZeile(position({ sets: 1, times_per_day: 1, load: null, rest_seconds: null })),
    ).toBe('1 Durchgang mit je 8 bis 12 Wiederholungen\u00a0· einmal am Tag');
  });

  it('nennt die Regel zur Steigerung nur mit Wiederholungen und doppelter Progression', () => {
    expect(steigerungsregel(position())).toBe(
      'Beginnen Sie mit 8 und steigern Sie bis 12 Wiederholungen. Schaffen Sie in allen Durchgängen 12, sagen Sie es uns – dann passen wir das Gewicht an.',
    );
    expect(steigerungsregel(position({ double_progression: false }))).toBeNull();
    expect(
      steigerungsregel(position({ reps_min: null, reps_max: null, duration_seconds: 30 })),
    ).toBeNull();
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
    // Befund B9: der Stand des Entwurfs - „Entwurf“ steht in ihm, kein Abzeichen.
    expect(
      screen.getByText('Entwurf · zuletzt geändert 07.10.2026 von Anna Beispiel'),
    ).toBeInTheDocument();
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

  it('zeigt die Häufigkeit pro Woche im Entwurf und ändert sie mit je einem Tipp (Befund B9)', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau();
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    const zeile = gruppe.closest('li')!;
    expect(zeile).toHaveTextContent('3-mal pro Woche');
    // Die Metazeile des Kopfes nennt sie auch.
    expect(screen.getByText(/Erika Beispiel · Übungsplan · 3-mal pro Woche/)).toBeInTheDocument();
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' }));
    await waitFor(() => expect(zeile).toHaveTextContent('4-mal pro Woche'));
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith('p1', 'Heimprogramm Knie', 4));
    expect(savePlan).toHaveBeenCalledTimes(1);
    // Nach dem Nachladen sagen Zeile und Kopf dasselbe wie der Server.
    expect(
      await screen.findByText(/Erika Beispiel · Übungsplan · 4-mal pro Woche/),
    ).toBeInTheDocument();
    expect(zeile).toHaveTextContent('4-mal pro Woche');
    expect(server.plan.sessions_per_week).toBe(4);
  });

  it('lässt die Häufigkeit ohne Angabe, bis die Fachperson eine wählt', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau(plan({ sessions_per_week: null }));
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    expect(gruppe.closest('li')).toHaveTextContent('ohne Angabe');
    expect(within(gruppe).getByRole('button', { name: 'Häufigkeit: weniger' })).toBeDisabled();
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' }));
    await waitFor(() => expect(gruppe.closest('li')).toHaveTextContent('Einmal pro Woche'));
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith('p1', 'Heimprogramm Knie', 1));
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: weniger' }));
    await waitFor(() => expect(savePlan).toHaveBeenLastCalledWith('p1', 'Heimprogramm Knie', null));
    await waitFor(() => expect(gruppe.closest('li')).toHaveTextContent('ohne Angabe'));
    expect(server.plan.sessions_per_week).toBeNull();
  });

  it('nimmt die Häufigkeit zurück, wenn das Speichern scheitert', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau();
    const scheitert = tor();
    server.tore.push(scheitert);
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' }));
    await waitFor(() => expect(gruppe.closest('li')).toHaveTextContent('4-mal pro Woche'));
    scheitert.zu(new Error('Bitte die Einheiten je Woche prüfen (1 bis 14).'));
    expect(
      await screen.findByText('Bitte die Einheiten je Woche prüfen (1 bis 14).'),
    ).toBeInTheDocument();
    await waitFor(() => expect(gruppe.closest('li')).toHaveTextContent('3-mal pro Woche'));
  });

  // Prüfung O-002: Bisher sprang die Zeile nach einem Fehler auf den vorigen
  // Tipp zurück, nicht auf den Stand am Server.
  it('zeigt nach zwei gescheiterten Tipps den gespeicherten Stand, nicht den vorigen Tipp', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau();
    const erster = tor();
    const zweiter = tor();
    server.tore.push(erster, zweiter);
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    const zeile = gruppe.closest('li')!;
    const mehr = within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' });
    await user.click(mehr);
    await waitFor(() => expect(zeile).toHaveTextContent('4-mal pro Woche'));
    await user.click(mehr);
    await waitFor(() => expect(zeile).toHaveTextContent('5-mal pro Woche'));
    // Der Reihe nach: Der zweite Tipp wartet, bis der erste fertig ist.
    expect(savePlan).toHaveBeenCalledTimes(1);
    expect(savePlan).toHaveBeenLastCalledWith('p1', 'Heimprogramm Knie', 4);

    erster.zu(new Error('Der Plan konnte nicht gespeichert werden.'));
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(2));
    expect(savePlan).toHaveBeenLastCalledWith('p1', 'Heimprogramm Knie', 5);
    expect(zeile).toHaveTextContent('5-mal pro Woche');

    zweiter.zu(new Error('Der Plan konnte nicht gespeichert werden.'));
    expect(
      await screen.findByText('Der Plan konnte nicht gespeichert werden.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(zeile).toHaveTextContent('3-mal pro Woche'));
    expect(screen.getByText(/Erika Beispiel · Übungsplan · 3-mal pro Woche/)).toBeInTheDocument();
    expect(server.plan.sessions_per_week).toBe(3);
  });

  it('zeigt nach gescheitertem ersten und gelungenem zweiten Tipp, was gespeichert ist', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau();
    const erster = tor();
    const zweiter = tor();
    server.tore.push(erster, zweiter);
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    const zeile = gruppe.closest('li')!;
    const mehr = within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' });
    await user.click(mehr);
    await waitFor(() => expect(zeile).toHaveTextContent('4-mal pro Woche'));
    await user.click(mehr);
    await waitFor(() => expect(zeile).toHaveTextContent('5-mal pro Woche'));

    erster.zu(new Error('Der Plan konnte nicht gespeichert werden.'));
    await waitFor(() => expect(savePlan).toHaveBeenCalledTimes(2));
    zweiter.auf();
    await waitFor(() =>
      expect(screen.getByText(/Erika Beispiel · Übungsplan · 5-mal pro Woche/)).toBeInTheDocument(),
    );
    expect(zeile).toHaveTextContent('5-mal pro Woche');
    expect(server.plan.sessions_per_week).toBe(5);
    expect(screen.queryByText('Der Plan konnte nicht gespeichert werden.')).toBeNull();
  });

  it('folgt dem Stand am Server, wenn sich die Häufigkeit anderswo ändert', async () => {
    const server = kopfNachbau();
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    expect(gruppe.closest('li')).toHaveTextContent('3-mal pro Woche');
    // Eine Kollegin ändert sie; beim Zurückkommen in die Anwendung lädt die
    // Seite den Plan neu.
    server.plan = { ...server.plan, sessions_per_week: 2 };
    try {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
      await waitFor(() => expect(gruppe.closest('li')).toHaveTextContent('2-mal pro Woche'));
    } finally {
      focusManager.setFocused(undefined);
    }
  });

  it('ändert den Titel im Fenster und lässt die Häufigkeit, wie sie ist', async () => {
    const user = userEvent.setup();
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Titel ändern' }));
    const fenster = screen.getByRole('dialog', { name: 'Titel ändern' });
    expect(within(fenster).queryByRole('group')).toBeNull();
    const feld = within(fenster).getByLabelText('Titel *');
    await user.clear(feld);
    await user.type(feld, 'Knie, Woche 2');
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith('p1', 'Knie, Woche 2', 3));
  });

  it('nimmt beim Titel die eben gewählte Häufigkeit, auch wenn sie noch gespeichert wird', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau();
    const langsam = tor();
    server.tore.push(langsam);
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' }));
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith('p1', 'Heimprogramm Knie', 4));

    await user.click(screen.getByRole('button', { name: 'Titel ändern' }));
    const fenster = screen.getByRole('dialog', { name: 'Titel ändern' });
    const feld = within(fenster).getByLabelText('Titel *');
    await user.clear(feld);
    await user.type(feld, 'Knie, Woche 2');
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    // Wartet auf die Häufigkeit, statt sie mit dem alten Stand zu überschreiben.
    expect(savePlan).toHaveBeenCalledTimes(1);
    langsam.auf();
    await waitFor(() => expect(savePlan).toHaveBeenLastCalledWith('p1', 'Knie, Woche 2', 4));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(server.plan).toEqual(
      expect.objectContaining({ title: 'Knie, Woche 2', sessions_per_week: 4 }),
    );
    expect(gruppe.closest('li')).toHaveTextContent('4-mal pro Woche');
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

describe('Eine Übungsliste: Bibliothek und Katalog (Befund B9, ANN-536)', () => {
  const KN03 = katalogeintrag('KN-03')!;
  const HU01 = katalogeintrag('HU-01')!;
  const name = (n: string) => (zugaenglich: string) => zugaenglich.startsWith(n);

  // Aus dem Katalog übernimmt nur, wer die Bibliothek pflegt (owner, ANN-293).
  beforeEach(() => {
    fetchBibliothek.mockResolvedValue({ ...BIBLIOTHEK, can_manage: true });
  });

  it('zeigt ohne Pflegerecht nur die Bibliothek (ANN-293)', async () => {
    const user = userEvent.setup();
    fetchBibliothek.mockResolvedValue(BIBLIOTHEK);
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = await screen.findByRole('dialog', { name: 'Übungen hinzufügen' });
    expect(
      within(blatt).getByRole('checkbox', { name: /Rudern, Theraband gelb/ }),
    ).toBeInTheDocument();
    expect(within(blatt).queryByRole('checkbox', { name: name(KN03.name) })).toBeNull();
    expect(within(blatt).queryByRole('checkbox', { name: name(HU01.name) })).toBeNull();
  });

  it('übernimmt eine Übung aus dem Katalog still und fügt sie mit ihrer Standarddosierung hinzu', async () => {
    const user = userEvent.setup();
    addCatalogExercises.mockResolvedValue({
      variants: { 'KN-03': 'k3-neu' },
      imported: ['KN-03'],
      conflicts: [],
    });
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = await screen.findByRole('dialog', { name: 'Übungen hinzufügen' });
    // Vorhandenes (KN-01, KN-02, archiviertes KN-04) steht nur einmal da.
    expect(
      within(blatt).getAllByRole('checkbox', { name: name('Kniestreckung im Sitz') }),
    ).toHaveLength(1);
    expect(
      within(blatt).queryByRole('checkbox', { name: name('Passive Kniestreckung') }),
    ).toBeNull();
    await user.click(within(blatt).getByRole('checkbox', { name: name(KN03.name) }));
    await user.click(within(blatt).getByRole('checkbox', { name: /Rudern, Theraband gelb/ }));
    await user.click(within(blatt).getByRole('button', { name: '2 hinzufügen' }));

    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(2));
    expect(addCatalogExercises).toHaveBeenCalledTimes(1);
    expect(addCatalogExercises.mock.calls[0]![0]).toBe('p1');
    expect(
      (addCatalogExercises.mock.calls[0]![1] as Katalogeintrag[]).map((e) => e.schluessel),
    ).toEqual(['KN-03']);
    // In der Reihenfolge der Wahl, mit der Variante, die der Server nennt.
    expect(savePosition.mock.calls.map((c) => (c[0] as Api.PositionEingabe).variantId)).toEqual([
      'k3-neu',
      'v3',
    ]);
    expect(await screen.findByText('2 Übungen hinzugefügt.')).toBeInTheDocument();
    // Die Bibliothek wird neu geladen: Die Übung steht jetzt dort.
    expect(fetchBibliothek.mock.calls.length).toBeGreaterThan(1);
  });

  it('sagt, was nicht in den Plan kam', async () => {
    const user = userEvent.setup();
    addCatalogExercises.mockResolvedValue({
      variants: { 'HU-01': 'h1-neu' },
      imported: ['HU-01'],
      conflicts: [{ catalog_key: 'KN-03', name: KN03.name, reason: 'archived' }],
    });
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = await screen.findByRole('dialog', { name: 'Übungen hinzufügen' });
    await user.click(within(blatt).getByRole('checkbox', { name: name(KN03.name) }));
    await user.click(within(blatt).getByRole('checkbox', { name: name(HU01.name) }));
    await user.click(within(blatt).getByRole('button', { name: '2 hinzufügen' }));
    expect(await screen.findByText('1 Übung hinzugefügt.')).toBeInTheDocument();
    expect(screen.getByText(`Nicht hinzugefügt: ${KN03.name} (archiviert).`)).toBeInTheDocument();
    expect(savePosition).toHaveBeenCalledTimes(1);
  });

  it('bleibt im Blatt und legt nichts an, wenn die Übernahme scheitert', async () => {
    const user = userEvent.setup();
    addCatalogExercises.mockRejectedValue(
      new Error('Die Übungen konnten nicht übernommen werden.'),
    );
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = await screen.findByRole('dialog', { name: 'Übungen hinzufügen' });
    await user.click(within(blatt).getByRole('checkbox', { name: name(KN03.name) }));
    await user.click(within(blatt).getByRole('button', { name: '1 hinzufügen' }));
    expect(
      await within(blatt).findByText('Die Übungen konnten nicht übernommen werden.'),
    ).toBeInTheDocument();
    expect(savePosition).not.toHaveBeenCalled();
    expect(within(blatt).getByRole('checkbox', { name: name(KN03.name) })).toBeChecked();
  });

  it('sagt vorher, wie viele Übungen noch in den Plan passen (höchstens 30)', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(
      plan({
        items: Array.from({ length: 29 }, (_, i) => position({ id: `i${i}`, position: i + 1 })),
      }),
    );
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Übungen hinzufügen' }));
    const blatt = await screen.findByRole('dialog', { name: 'Übungen hinzufügen' });
    await user.click(within(blatt).getByRole('checkbox', { name: name(KN03.name) }));
    await user.click(within(blatt).getByRole('checkbox', { name: /Rudern, Theraband gelb/ }));
    await user.click(within(blatt).getByRole('button', { name: '2 hinzufügen' }));
    expect(
      within(blatt).getByText('Ein Plan hat höchstens 30 Übungen – es passt noch eine.'),
    ).toBeInTheDocument();
    expect(addCatalogExercises).not.toHaveBeenCalled();
    expect(savePosition).not.toHaveBeenCalled();
  });
});

describe('Aus Vorlage mit Vorschau (Welle B, Befund B9, ANN-537)', () => {
  const name = (n: string) => (zugaenglich: string) => zugaenglich.startsWith(n);
  const KN03 = katalogeintrag('KN-03')!;

  // Was der Praxis fehlt, übernimmt nur owner (ANN-293) - eigener Test unten.
  beforeEach(() => {
    fetchBibliothek.mockResolvedValue({ ...BIBLIOTHEK, can_manage: true });
  });

  it('blendet Vorlagen aus, solange es keine gibt', async () => {
    fetchPlan.mockResolvedValue(plan({ items: [] }));
    planseite([]);
    expect(await screen.findByText('Noch keine Übung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aus Vorlage' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Aus Vorlage' })).not.toBeInTheDocument();
  });

  it('zeigt im leeren Entwurf die Vorlagen gleich als Zeilen, nach Name', async () => {
    fetchPlan.mockResolvedValue(plan({ items: [] }));
    planseite(VORLAGEN);
    expect(await screen.findByRole('heading', { name: 'Aus Vorlage' })).toBeInTheDocument();
    const zeilen = screen
      .getAllByRole('button')
      .filter((k) => /Übung(en)? · /.test(k.textContent ?? ''))
      .map((k) => k.textContent);
    expect(zeilen).toEqual([
      'Arme im Sitz1 Übung · Kraft der Arme',
      'Knie im Sitz4 Übungen · Kraft und Beweglichkeit im Sitz',
    ]);
    // Mit Übungen im Plan steht die Liste hinter „Aus Vorlage“.
    expect(screen.queryByRole('button', { name: 'Aus Vorlage' })).not.toBeInTheDocument();
  });

  it('zeigt die Übungen der Vorlage mit Haken - alle vorgewählt, archivierte ohne Haken', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(plan({ items: [], title: 'Übungsplan' }));
    planseite(VORLAGEN);
    await user.click(await screen.findByRole('button', { name: /^Knie im Sitz/ }));
    const vorschau = await screen.findByRole('dialog', { name: 'Knie im Sitz' });
    const haken = within(vorschau).getAllByRole('checkbox');
    expect(haken.map((k) => (k as HTMLInputElement).checked)).toEqual([true, true, true]);
    // Aus der Bibliothek, mit der Dosierung der Vorlage.
    expect(
      within(vorschau).getByRole('checkbox', { name: name('Kniebeugung im Sitz') }),
    ).toHaveAccessibleName(/1 × 8/);
    // Fehlt der Praxis: steht trotzdem zur Wahl, ungeprüft.
    expect(within(vorschau).getByRole('checkbox', { name: name(KN03.name) })).toHaveAccessibleName(
      /ungeprüft/,
    );
    // Archiviert: ohne Haken, mit Wort.
    const archiviert = within(vorschau).getByText('Passive Kniestreckung').closest('li')!;
    expect(within(archiviert).queryByRole('checkbox')).toBeNull();
    expect(within(archiviert).getByText('archiviert')).toBeInTheDocument();
    expect(within(vorschau).getByRole('button', { name: '3 hinzufügen' })).toBeEnabled();
    // Die alte Warnung und der Knopf für owner sind weg.
    expect(screen.queryByText(/Nicht in der Bibliothek der Praxis/)).toBeNull();
    expect(within(vorschau).queryByText(/übernimmt die Praxisinhaber:in/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Aus dem Katalog übernehmen und hinzufügen' }),
    ).toBeNull();
  });

  it('fügt die gewählten hinzu, übernimmt still, was fehlt, und benennt den Entwurf', async () => {
    const user = userEvent.setup();
    addCatalogExercises.mockResolvedValue({
      variants: { 'KN-03': 'k3-neu' },
      imported: ['KN-03'],
      conflicts: [],
    });
    fetchPlan.mockResolvedValue(plan({ items: [], title: 'Übungsplan' }));
    planseite(VORLAGEN);
    await user.click(await screen.findByRole('button', { name: /^Knie im Sitz/ }));
    const vorschau = await screen.findByRole('dialog', { name: 'Knie im Sitz' });
    // Einzeln wählbar: eine heraus.
    await user.click(
      within(vorschau).getByRole('checkbox', { name: name('Kniestreckung im Sitz') }),
    );
    await user.click(within(vorschau).getByRole('button', { name: '2 hinzufügen' }));

    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(2));
    expect(
      (addCatalogExercises.mock.calls[0]![1] as Katalogeintrag[]).map((e) => e.schluessel),
    ).toEqual(['KN-03']);
    // In der Reihenfolge der Vorlage; die Dosierung der Vorlage geht vor.
    expect(savePosition.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ variantId: 'k2', saetze: 1, wdhVon: 8, wdhBis: 8, amTag: null }),
    );
    expect(savePosition.mock.calls[1]![0]).toEqual(
      expect.objectContaining({ variantId: 'k3-neu' }),
    );
    // Ein leerer Entwurf heißt danach wie die Vorlage.
    await waitFor(() => expect(savePlan).toHaveBeenCalledWith('p1', 'Knie im Sitz', 3));
    expect(
      await screen.findByText('2 Übungen hinzugefügt aus „Knie im Sitz“.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('zeigt ohne Pflegerecht, was der Bibliothek fehlt, ohne Haken und übernimmt nichts (ANN-293)', async () => {
    const user = userEvent.setup();
    fetchBibliothek.mockResolvedValue(BIBLIOTHEK);
    fetchPlan.mockResolvedValue(plan({ items: [], title: 'Übungsplan' }));
    planseite(VORLAGEN);
    await user.click(await screen.findByRole('button', { name: /^Knie im Sitz/ }));
    const vorschau = await screen.findByRole('dialog', { name: 'Knie im Sitz' });
    const fehlt = within(vorschau).getByText(KN03.name).closest('li')!;
    expect(within(fehlt).queryByRole('checkbox')).toBeNull();
    // Zeichen und Wort als Nebenzeile (DESIGN.md Regel 5), kein Abzeichen;
    // nicht gedämpft - das meint Erledigtes (B9).
    const grund = within(fehlt).getByText('nicht in der Bibliothek');
    expect(grund).toHaveClass('text-warnung');
    expect(grund).toHaveTextContent(/^!/);
    expect(within(fehlt).getByText(KN03.name).parentElement).toHaveClass(
      'text-ink',
      'font-semibold',
    );
    expect(within(fehlt).getByText(KN03.name).parentElement).not.toHaveClass('text-ink-muted');
    expect(
      within(vorschau).getByText(
        'Was nicht in der Bibliothek steht, übernimmt die Praxisinhaber:in aus dem Katalog.',
      ),
    ).toBeInTheDocument();
    await user.click(within(vorschau).getByRole('button', { name: '2 hinzufügen' }));
    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(2));
    expect(addCatalogExercises).not.toHaveBeenCalled();
  });

  it('überschreibt beim Titel aus der Vorlage keine eben gewählte Häufigkeit', async () => {
    const user = userEvent.setup();
    addCatalogExercises.mockResolvedValue({
      variants: { 'KN-03': 'k3-neu' },
      imported: ['KN-03'],
      conflicts: [],
    });
    const server = kopfNachbau(plan({ items: [], title: 'Übungsplan', sessions_per_week: null }));
    const langsam = tor();
    server.tore.push(langsam);
    planseite(VORLAGEN);
    // Erst die Häufigkeit - ihr Speichern dauert -, gleich danach die Vorlage.
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' }));
    await user.click(screen.getByRole('button', { name: /^Knie im Sitz/ }));
    const vorschau = await screen.findByRole('dialog', { name: 'Knie im Sitz' });
    await user.click(within(vorschau).getByRole('button', { name: '3 hinzufügen' }));
    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(3));
    // Der Titel wartet auf die Häufigkeit und nimmt sie mit.
    expect(savePlan).toHaveBeenCalledTimes(1);
    langsam.auf();
    await waitFor(() => expect(savePlan).toHaveBeenLastCalledWith('p1', 'Knie im Sitz', 1));
    expect(
      await screen.findByText('3 Übungen hinzugefügt aus „Knie im Sitz“.'),
    ).toBeInTheDocument();
    expect(server.plan).toEqual(
      expect.objectContaining({ title: 'Knie im Sitz', sessions_per_week: 1 }),
    );
  });

  it('wählt nicht vor, was schon im Plan steht, und öffnet die Liste mit Übungen über „Aus Vorlage“', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(
      plan({ items: [position({ variant_id: 'k1', variant_name: 'Kniestreckung im Sitz' })] }),
    );
    planseite(VORLAGEN);
    await user.click(await screen.findByRole('button', { name: 'Aus Vorlage' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Aus Vorlage' })).getByRole('button', {
        name: /^Knie im Sitz/,
      }),
    );
    const vorschau = await screen.findByRole('dialog', { name: 'Knie im Sitz' });
    const kn01 = within(vorschau).getByRole('checkbox', { name: name('Kniestreckung im Sitz') });
    expect(kn01).not.toBeChecked();
    expect(kn01).toHaveAccessibleName(/schon im Plan/);
    expect(within(vorschau).getByRole('button', { name: '2 hinzufügen' })).toBeEnabled();
    // Ohne Plan zu verändern, wieder zu.
    await user.click(within(vorschau).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(savePosition).not.toHaveBeenCalled();
  });

  it('liest für Vorlagen und Vorschau nie Angaben der Person (ADR-006 Punkt 10)', async () => {
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

    // … und am Plan zweier verschiedener Personen gleich - Liste wie Vorschau.
    const user = userEvent.setup();
    const gesehen: (string | null)[][] = [];
    const vorgewaehlt: (string | null)[][] = [];
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
      await user.click(
        within(screen.getByRole('dialog', { name: 'Aus Vorlage' })).getByRole('button', {
          name: /^Knie im Sitz/,
        }),
      );
      const vorschau = await screen.findByRole('dialog', { name: 'Knie im Sitz' });
      vorgewaehlt.push(
        within(vorschau)
          .getAllByRole('checkbox')
          .filter((k) => (k as HTMLInputElement).checked)
          .map((k) => k.closest('label')?.textContent ?? null),
      );
      seite.unmount();
    }
    expect(gesehen[0]).toEqual(allein);
    expect(gesehen[1]).toEqual(allein);
    expect(vorgewaehlt[1]).toEqual(vorgewaehlt[0]);
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

  it('weist erst zu, wenn der letzte Tipp auf die Häufigkeit gespeichert ist', async () => {
    const user = userEvent.setup();
    const server = kopfNachbau();
    const langsam = tor();
    server.tore.push(langsam);
    let beimZuweisen: number | null = null;
    assignPlan.mockImplementation(() => {
      beimZuweisen = server.plan.sessions_per_week;
      return Promise.resolve();
    });
    planseite();
    const gruppe = await screen.findByRole('group', { name: 'Häufigkeit' });
    await user.click(within(gruppe).getByRole('button', { name: 'Häufigkeit: mehr' }));
    await user.click(screen.getByRole('button', { name: 'Zuweisen' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Plan zuweisen' })).getByRole('button', {
        name: 'Zuweisen',
      }),
    );
    expect(assignPlan).not.toHaveBeenCalled();
    langsam.auf();
    await waitFor(() => expect(assignPlan).toHaveBeenCalledWith('p1', '2026-11-18'));
    // Sonst ginge der Plan mit 3 statt 4 Einheiten zur Person.
    expect(beimZuweisen).toBe(4);
  });

  /** Zuweisen bis zum 18.11. und die Bestätigung danach. */
  async function zuweisenUndBestaetigung(): Promise<HTMLElement> {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValueOnce(plan()).mockResolvedValue(
      plan({
        status: 'assigned',
        assigned_at: '2026-10-07T09:00:00Z',
        assigned_by_name: 'Anna Beispiel',
        runs_from: '2026-10-07',
        runs_until: '2026-11-18',
        original_runs_until: '2026-11-18',
      }),
    );
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Zuweisen' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Plan zuweisen' })).getByRole('button', {
        name: 'Zuweisen',
      }),
    );
    const meldung = (await screen.findByText(/Zugewiesen bis 18\.11\.2026\./)).closest(
      '[role="status"]',
    );
    expect(meldung).not.toBeNull();
    return meldung as HTMLElement;
  }

  it('bestätigt das Zuweisen und bietet das Blatt an - der Plan nützt auch ohne Plattform (Befund B9)', async () => {
    const meldung = await zuweisenUndBestaetigung();
    // Ohne Plattformzugang ist das Blatt der Weg zur Person (Praxis-Review B9).
    await waitFor(() =>
      expect(meldung).toHaveTextContent(
        'Zugewiesen bis 18.11.2026. Ohne Plattformzugang: Als PDF oder drucken mitgeben.',
      ),
    );
    expect(within(meldung).getByRole('link', { name: 'Als PDF oder drucken' })).toHaveAttribute(
      'href',
      '/patienten/pat1/plaene/p1/blatt',
    );
    // Derselbe Zugang wie im Abschnitt „Plattform“ der Akte.
    expect(getPlatformAccess).toHaveBeenCalledWith('treatment', 'pat1');
    expect(screen.getByText('Fassung 1 · Stand 07.10.2026 · Anna Beispiel')).toBeInTheDocument();
  });

  it('sagt nach dem Zuweisen, dass die Person den Plan auf der Plattform sieht (B9)', async () => {
    getPlatformAccess.mockResolvedValue({
      id: '11111111-1111-4111-8111-000000000001',
      status: 'active',
      created_at: '2026-09-01T08:00:00Z',
      activated_at: '2026-09-02T08:00:00Z',
      locked_at: null,
      revoked_at: null,
      revoked_reason: null,
      invitation_id: null,
      invitation_purpose: null,
      invitation_channel: null,
      invitation_expires_at: null,
      invitation_sent_at: null,
      relationship_email: null,
      ended_at: null,
    } satisfies ZugangApi.Plattformzugang);
    const meldung = await zuweisenUndBestaetigung();
    await waitFor(() =>
      expect(meldung).toHaveTextContent(
        'Zugewiesen bis 18.11.2026. Erika sieht ihn auf der Plattform. Als PDF oder drucken',
      ),
    );
    expect(meldung).not.toHaveTextContent('Ohne Plattformzugang');
    // Das Blatt bleibt ein Weg, etwa zum Ausdrucken.
    expect(within(meldung).getByRole('link', { name: 'Als PDF oder drucken' })).toBeInTheDocument();
  });

  it('bleibt beim Weg zum Blatt, wenn der Zugang nicht zu laden ist (B9)', async () => {
    getPlatformAccess.mockRejectedValue(new Error('Failed to fetch'));
    const meldung = await zuweisenUndBestaetigung();
    await waitFor(() => expect(getPlatformAccess).toHaveBeenCalled());
    // Die Ablehnung ist verarbeitet (ohne erneuten Versuch) - es bleibt beim Blatt.
    await act(() => new Promise<void>((fertig) => setTimeout(fertig, 50)));
    expect(meldung).toHaveTextContent('Zugewiesen bis 18.11.2026. Als PDF oder drucken');
    expect(meldung).not.toHaveTextContent(/Plattform/);
  });

  it('zeigt die Bestätigung nur nach dem eigenen Zuweisen, nicht beim Öffnen', async () => {
    fetchPlan.mockResolvedValue(
      plan({
        status: 'assigned',
        runs_from: '2026-10-01',
        runs_until: '2026-11-12',
        original_runs_until: '2026-11-12',
      }),
    );
    planseite();
    expect(await screen.findByRole('link', { name: 'Als PDF oder drucken' })).toBeInTheDocument();
    expect(screen.queryByText(/Zugewiesen bis/)).toBeNull();
    // Den Zugang fragt die Seite erst für die Bestätigung.
    expect(getPlatformAccess).not.toHaveBeenCalled();
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
      version_number: 2,
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
      follow_up: { id: 'p2', status: 'draft', runs_from: null },
    });
    planseite();
    expect(
      await screen.findByRole('link', { name: /^Fassung 2\s*Neue Fassung · Entwurf$/ }),
    ).toBeInTheDocument();
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
    expect(
      screen.getByRole('link', { name: /^Fassung 1\s*Vorige Fassung · Stand 01\.10\.2026$/ }),
    ).toBeInTheDocument();
    // Der Kopf nennt die Fassung des Entwurfs.
    expect(
      screen.getByText('Fassung 2 · Entwurf · zuletzt geändert 07.10.2026 von Anna Beispiel'),
    ).toBeInTheDocument();
  });

  it('nennt am zugewiesenen Plan Fassung, Stand und wer zugewiesen hat (Befund B9, ANN-538)', async () => {
    fetchPlan.mockResolvedValue({
      ...zugewiesen(),
      version_number: 2,
      assigned_by_name: 'Anna Beispiel',
      previous_plan_id: 'p0',
      previous: null,
      follow_up: { id: 'p3', status: 'assigned', runs_from: '2026-10-20' },
    });
    planseite();
    expect(
      await screen.findByText('Fassung 2 · Stand 01.10.2026 · Anna Beispiel'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /^Fassung 3\s*Neue Fassung · Stand 20\.10\.2026$/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Fassung 1\s*Vorige Fassung$/ })).toBeInTheDocument();
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
      // Zugewiesen kurz nach Mitternacht in Berlin: in UTC noch der Vortag.
      assigned_at: '2026-10-06T22:30:00Z',
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
          load: null,
          double_progression: false,
        }),
      ],
    });

  it('druckt den Schnappschuss in Alltagssprache, mit Schritten, ohne fachliche Bezeichnung', async () => {
    fetchPlan.mockResolvedValue(zugewiesen());
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    renderWithProviders(<PlanblattSeite user={testUser(['therapist'])} />);
    const blatt = await screen.findByRole('article', { name: 'Planblatt' });
    expect(blatt).toHaveTextContent('Ihr Übungsplan für Erika Beispiel');
    expect(blatt).toHaveTextContent('1. Am Geländer in die Hocke');
    // Schritt 2d (Handoff 5.7): die Dosierung in einer Zeile, die Regel zur
    // Steigerung als eigener Satz; Stand wie im Plankopf, ohne Übungstage.
    expect(blatt).toHaveTextContent(
      '3 Durchgänge mit je 8 bis 12 Wiederholungen · 60 Sekunden Pause · mit 5 kg',
    );
    expect(blatt).toHaveTextContent('Beginnen Sie mit 8 und steigern Sie bis 12 Wiederholungen.');
    expect(blatt).toHaveTextContent('Sie brauchen: Geländer');
    expect(blatt).toHaveTextContent('Hinweis: Langsam ablassen.');
    expect(blatt).toHaveTextContent(
      'Gültig vom 7. Oktober bis 18. November 2026 · 3-mal pro Woche',
    );
    expect(blatt).toHaveTextContent('Stand 7. Oktober 2026');
    expect(blatt).not.toHaveTextContent('Ihre Übungstage');
    expect(blatt).not.toHaveTextContent('Kniebeuge am Geländer');
    // Die Anleitung in Schritten, ohne Zeichnung (ANN-539); ein Bild ist nur
    // die Wortmarke im Kopf (für Bildschirm und Druck je eine Größe).
    expect(
      new Set(
        within(blatt)
          .getAllByRole('img')
          .map((bild) => bild.getAttribute('alt')),
      ),
    ).toEqual(new Set(['Own Motion']));
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

describe('Vorlagen der Praxis (UEB-014, ANN-560)', () => {
  const EIGENE: Api.Praxisvorlagen = {
    can_create: true,
    templates: [
      {
        id: 't1',
        name: 'Zuhause nach dem Knie',
        goal: null,
        can_edit: true,
        created_by_name: 'Anna Beispiel',
        updated_on: '2026-10-15',
        items: [
          {
            variant_id: 'v3',
            sets: 2,
            reps_min: 15,
            reps_max: 15,
            duration_seconds: null,
            hold_seconds: null,
            per_side: false,
            times_per_day: 1,
            load: 'Theraband gelb',
            tempo: null,
            rest_seconds: null,
            double_progression: false,
          },
          {
            variant_id: 'k4',
            sets: 1,
            reps_min: 10,
            reps_max: 10,
            duration_seconds: null,
            hold_seconds: null,
            per_side: false,
            times_per_day: null,
            load: null,
            tempo: null,
            rest_seconds: null,
            double_progression: false,
          },
        ],
      },
    ],
  };

  it('zeigt die Vorlagen der Praxis vor den mitgelieferten und fügt mit ihrer Dosierung hinzu', async () => {
    const user = userEvent.setup();
    fetchPraxisvorlagen.mockResolvedValue(EIGENE);
    fetchPlan.mockResolvedValue(plan({ items: [], title: 'Übungsplan' }));
    planseite(VORLAGEN);
    await screen.findByRole('button', { name: /^Zuhause nach dem Knie/ });
    const zeilen = screen
      .getAllByRole('button')
      .filter((k) => /Übung(en)? ·|· \d+ Übung/.test(k.textContent ?? ''))
      .map((k) => k.textContent);
    expect(zeilen).toEqual([
      'Zuhause nach dem KnieVorlage der Praxis · 2 Übungen',
      'Arme im Sitz1 Übung · Kraft der Arme',
      'Knie im Sitz4 Übungen · Kraft und Beweglichkeit im Sitz',
    ]);
    await user.click(screen.getByRole('button', { name: /^Zuhause nach dem Knie/ }));
    const vorschau = await screen.findByRole('dialog', { name: 'Zuhause nach dem Knie' });
    // Der Katalog wird für eine Vorlage der Praxis nicht gebraucht.
    expect(ladeKatalog).not.toHaveBeenCalled();
    // Archiviert seit dem Speichern: ohne Haken, mit Wort.
    expect(within(vorschau).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(vorschau).getByText('archiviert')).toBeInTheDocument();
    await user.click(within(vorschau).getByRole('button', { name: '1 hinzufügen' }));
    await waitFor(() => expect(savePosition).toHaveBeenCalledTimes(1));
    expect(savePosition).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: 'p1',
        variantId: 'v3',
        saetze: 2,
        wdhVon: 15,
        wdhBis: 15,
        last: 'Theraband gelb',
        amTag: 1,
      }),
    );
    expect(addCatalogExercises).not.toHaveBeenCalled();
  });

  it('speichert die Übungen eines Plans als Vorlage - ohne Hinweise und ohne Archiviertes', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(
      plan({
        status: 'assigned',
        title: 'Knie, Kräftigung',
        runs_from: '2026-10-07',
        runs_until: '2026-11-04',
        items: [
          position({ note: 'Nur mit Begleitung.' }),
          position({ id: 'i2', position: 2, variant_id: 'v9', variant_archived: true }),
        ],
      }),
    );
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Als Vorlage speichern' }));
    const fenster = await screen.findByRole('dialog', { name: 'Als Vorlage speichern' });
    expect(within(fenster).getByRole('textbox', { name: /^Name/ })).toHaveValue('Knie, Kräftigung');
    expect(within(fenster).getByText('1 Übung mit Dosierung')).toBeInTheDocument();
    await user.type(within(fenster).getByRole('textbox', { name: /^Ziel/ }), 'Kraft');
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(savePraxisvorlage).toHaveBeenCalledTimes(1));
    const [eingabe] = savePraxisvorlage.mock.calls[0] as [Record<string, unknown>];
    expect(eingabe).toEqual({
      id: null,
      name: 'Knie, Kräftigung',
      ziel: 'Kraft',
      uebungen: [
        {
          variant_id: 'v1',
          sets: 3,
          reps_min: 8,
          reps_max: 12,
          duration_seconds: null,
          hold_seconds: null,
          per_side: false,
          times_per_day: null,
          load: '5 kg',
          tempo: null,
          rest_seconds: 60,
          double_progression: true,
        },
      ],
    });
    expect(JSON.stringify(eingabe)).not.toContain('Begleitung');
    expect(
      await screen.findByText(/Als Vorlage „Knie, Kräftigung“ gespeichert/),
    ).toBeInTheDocument();
  });

  it('lässt den Standardtitel nicht als Namen stehen und verlangt einen Namen', async () => {
    const user = userEvent.setup();
    fetchPlan.mockResolvedValue(plan({ title: 'Übungsplan' }));
    planseite();
    await user.click(await screen.findByRole('button', { name: 'Als Vorlage speichern' }));
    const fenster = await screen.findByRole('dialog', { name: 'Als Vorlage speichern' });
    expect(within(fenster).getByRole('textbox', { name: /^Name/ })).toHaveValue('');
    await user.click(within(fenster).getByRole('button', { name: 'Speichern' }));
    expect(await within(fenster).findByText('Bitte einen Namen angeben.')).toBeInTheDocument();
    expect(savePraxisvorlage).not.toHaveBeenCalled();
  });

  it('bietet das Speichern nicht an, wer keine Vorlagen anlegt', async () => {
    fetchPraxisvorlagen.mockResolvedValue({ can_create: false, templates: [] });
    fetchPlan.mockResolvedValue(plan({ status: 'assigned', can_write: false }));
    planseite();
    expect((await screen.findAllByText(/Kniebeuge am Geländer/)).length).toBeGreaterThan(0);
    await waitFor(() => expect(fetchPraxisvorlagen).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Als Vorlage speichern' })).toBeNull();
  });
});
