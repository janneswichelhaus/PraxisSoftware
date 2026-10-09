import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as BibliothekApi from '@/features/exercises/api';
import { renderWithProviders, testUser } from '@/test-utils';
import { dosierungAlltag, dosierungFachlich, unterschiede } from './dosierung';

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
  };
});

const { PlanAbschnitt } = await import('./PlanAbschnitt');
const { PlanPage } = await import('./PlanPage');
const { PlanWiedervorlage } = await import('./Wiedervorlage');
const { PlanblattSeite } = await import('./PlanblattSeite');

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
        {
          id: 'v1',
          name: 'Kniebeuge am Geländer',
          lay_name: 'Am Geländer in die Hocke',
          instruction: 'Festhalten.',
          equipment: ['Geländer'],
          common_faults: null,
          practice_notes: null,
          archived: false,
        },
        {
          id: 'v2',
          name: 'Kniebeuge frei',
          lay_name: 'Frei in die Hocke',
          instruction: null,
          equipment: [],
          common_faults: null,
          practice_notes: null,
          archived: false,
        },
      ],
    },
    {
      id: 'u2',
      name: 'Rudern mit Band',
      lay_name: 'Arme zum Körper ziehen',
      body_region: 'bws',
      archived: false,
      variants: [
        {
          id: 'v3',
          name: 'Rudern, Theraband gelb',
          lay_name: 'Gelbes Band heranziehen',
          instruction: null,
          equipment: ['Theraband gelb'],
          common_faults: null,
          practice_notes: null,
          archived: false,
        },
      ],
    },
  ],
  links: [{ id: 'l1', easier_variant_id: 'v1', harder_variant_id: 'v2', axis: 'unterstuetzung' }],
};

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
});

describe('Dosierung in Worten (ANN-299)', () => {
  it('schreibt fachlich und in Alltagssprache', () => {
    expect(dosierungFachlich(position())).toBe(
      '3 × 8–12 Wdh. · 5 kg · Pause 60 s · doppelte Progression',
    );
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
    expect(await screen.findByText('Noch kein Plan.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trainingspläne' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neuer Plan' })).not.toBeInTheDocument();
  });
});

describe('PlanPage: Entwurf (UEB-004)', () => {
  it('zeigt die Positionen mit Dosierung', async () => {
    renderWithProviders(<PlanPage />);
    const karte = await screen.findByRole('article');
    expect(karte).toHaveTextContent('1. Kniebeuge am Geländer');
    expect(karte).toHaveTextContent('3 × 8–12 Wdh. · 5 kg · Pause 60 s · doppelte Progression');
    expect(screen.getByRole('heading', { name: 'Heimprogramm Knie' })).toBeInTheDocument();
  });

  it('fügt eine Übung aus der Bibliothek hinzu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Übung hinzufügen' }));
    const formular = screen.getByRole('form', { name: 'Übung zum Plan hinzufügen' });

    await user.click(within(formular).getByRole('button', { name: 'Hinzufügen' }));
    expect(within(formular).getAllByText('Bitte eine Übung wählen.').length).toBeGreaterThan(0);
    expect(savePosition).not.toHaveBeenCalled();

    await user.type(within(formular).getByLabelText('Übung suchen'), 'gelbes');
    await user.click(within(formular).getByRole('button', { name: /Rudern, Theraband gelb/ }));
    await user.clear(within(formular).getByLabelText('Sätze *'));
    await user.type(within(formular).getByLabelText('Sätze *'), '2');
    await user.click(within(formular).getByRole('button', { name: 'Hinzufügen' }));

    await waitFor(() =>
      expect(savePosition).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'p1',
          variantId: 'v3',
          saetze: 2,
          wdhVon: 10,
          wdhBis: 12,
          dauer: null,
          doppelt: false,
          achse: null,
          richtung: null,
        }),
      ),
    );
  });

  it('verlangt für die doppelte Progression einen Bereich und eine Last', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Ändern' }));
    const formular = screen.getByRole('form', { name: 'Übung im Plan ändern' });
    await user.clear(within(formular).getByLabelText('Last'));
    await user.click(within(formular).getByRole('button', { name: 'Speichern' }));
    expect(
      within(formular).getAllByText('Doppelte Progression braucht eine Last.').length,
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
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Kniebeuge frei nach oben' }));
    await waitFor(() => expect(movePosition).toHaveBeenCalledWith('i2', 'up'));
    expect(screen.getByRole('button', { name: 'Kniebeuge am Geländer nach oben' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Kniebeuge frei entfernen' }));
    await waitFor(() => expect(deletePosition).toHaveBeenCalledWith('i2'));

    await user.click(screen.getByRole('button', { name: 'Entwurf verwerfen' }));
    await user.click(screen.getByRole('button', { name: 'Verwerfen' }));
    await waitFor(() => expect(discardPlan).toHaveBeenCalledWith('p1'));
  });

  it('zeigt einen Entwurf ohne Schreibrecht nur an (ANN-298)', async () => {
    fetchPlan.mockResolvedValue(plan({ can_write: false }));
    renderWithProviders(<PlanPage />);
    expect(await screen.findByRole('article')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übung hinzufügen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf verwerfen' })).not.toBeInTheDocument();
  });

  it('meldet einen Plan, den es nicht gibt', async () => {
    fetchPlan.mockResolvedValue(null);
    renderWithProviders(<PlanPage />);
    expect(await screen.findByText('Plan nicht gefunden')).toBeInTheDocument();
  });
});

describe('PlanPage: Zuweisen und Schnappschuss (UEB-005)', () => {
  it('weist mit sechs Wochen als Vorschlag zu, nach Rückfrage (ANN-302)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanPage />);
    const feld = await screen.findByLabelText('Läuft bis *');
    expect(feld).toHaveValue('2026-11-18');
    expect(feld).toHaveAttribute('max', '2027-04-07');
    await user.click(screen.getByRole('button', { name: 'Zuweisen' }));
    expect(screen.getByText(/Danach lässt er sich nicht mehr ändern/)).toBeInTheDocument();
    const knoepfe = screen.getAllByRole('button', { name: 'Zuweisen' });
    await user.click(knoepfe[knoepfe.length - 1]!);
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
    renderWithProviders(<PlanPage />);
    expect(await screen.findByText(/von Anna Beispiel/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Übung hinzufügen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ändern' })).not.toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveTextContent('Kniebeuge am Geländer');

    await user.click(screen.getByRole('button', { name: 'In Alltagssprache' }));
    const karte = screen.getByRole('article');
    expect(karte).toHaveTextContent('1. Am Geländer in die Hocke');
    expect(karte).toHaveTextContent('3 Durchgänge mit je 8 bis 12 Wiederholungen.');
    expect(karte).toHaveTextContent('Sie brauchen: Geländer');
    expect(karte).toHaveTextContent('Langsam runter.');
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
    renderWithProviders(<PlanPage />);
    expect(await screen.findByText(/– abgelaufen/)).toBeInTheDocument();
  });
});

describe('PlanPage: Progression von Hand (UEB-006)', () => {
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
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Neue Fassung' }));
    await waitFor(() => expect(createVersion).toHaveBeenCalledWith('p1'));
  });

  it('bietet ohne Schreibrecht keine neue Fassung an, zeigt aber den Weg zur vorhandenen', async () => {
    fetchPlan.mockResolvedValue({
      ...zugewiesen(),
      can_write: false,
      follow_up: { id: 'p2', status: 'draft' },
    });
    renderWithProviders(<PlanPage />);
    expect(await screen.findByRole('link', { name: 'Neue Fassung (Entwurf)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neue Fassung' })).not.toBeInTheDocument();
  });

  it('zeigt Schritt und Unterschied zur vorigen Fassung', async () => {
    fetchPlan.mockResolvedValue(
      fassung({ load: '7 kg', step_axis: 'last', step_direction: 'harder' }),
    );
    renderWithProviders(<PlanPage />);
    const karte = await screen.findByRole('article');
    expect(karte).toHaveTextContent('Schwerer: Last');
    expect(karte).toHaveTextContent('Last: 5 kg → 7 kg');
    expect(screen.getByRole('link', { name: 'Vorige Fassung' })).toBeInTheDocument();
  });

  it('wählt den Schritt von Hand - die Nachbarn erst nach Richtung und Achse (ADR-006 Punkt 10)', async () => {
    fetchPlan.mockResolvedValue(fassung());
    const user = userEvent.setup();
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Ändern' }));
    const formular = screen.getByRole('form', { name: 'Übung im Plan ändern' });
    expect(
      within(formular).queryByRole('button', { name: 'Kniebeuge frei' }),
    ).not.toBeInTheDocument();
    expect(
      within(formular).queryByRole('button', { name: 'Andere Übung wählen' }),
    ).not.toBeInTheDocument();

    await user.click(within(formular).getByLabelText('Schwerer'));
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
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Ändern' }));
    await user.click(screen.getByLabelText('Schwerer'));
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

  it('fordert zur Entscheidung auf und verlängert um sechs Wochen ab dem bisherigen Ende', async () => {
    fetchPlan.mockResolvedValue(auslaufend());
    const user = userEvent.setup();
    renderWithProviders(<PlanPage />);
    expect(await screen.findByText(/Die Laufzeit endet am/)).toHaveTextContent(
      'Bitte entscheiden: verlängern, als neue Fassung ändern oder beenden.',
    );
    expect(screen.getByLabelText('Verlängern bis')).toHaveValue('2026-11-21');
    await user.click(screen.getByRole('button', { name: 'Verlängern' }));
    await waitFor(() => expect(extendPlan).toHaveBeenCalledWith('p1', '2026-11-21'));
  });

  it('beendet nach Rückfrage', async () => {
    fetchPlan.mockResolvedValue(auslaufend());
    const user = userEvent.setup();
    renderWithProviders(<PlanPage />);
    await user.click(await screen.findByRole('button', { name: 'Plan beenden' }));
    await user.click(screen.getByRole('button', { name: 'Beenden' }));
    await waitFor(() => expect(endPlan).toHaveBeenCalledWith('p1'));
  });

  it('bietet ohne Schreibrecht nichts zu entscheiden an (ANN-298)', async () => {
    fetchPlan.mockResolvedValue({ ...auslaufend(), can_write: false });
    renderWithProviders(<PlanPage />);
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
      items: [position({ note: 'Langsam ablassen.' })],
    });

  it('druckt den Schnappschuss in Alltagssprache, ohne fachliche Bezeichnung', async () => {
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
    renderWithProviders(<PlanPage />);
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
            difficulty_note: 'Knie zieht',
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
            difficulty_note: null,
            recorded_by_kind: 'legal_representative',
            finished_by_kind: null,
          },
        ],
      }),
    );
    renderWithProviders(<PlanPage />);
    const abschnitt = (await screen.findByRole('heading', { name: 'Durchgeführt' })).closest(
      'section',
    )!;
    expect(abschnitt).toHaveTextContent('08.10.2026 · 3 von 3 Durchgängen');
    expect(abschnitt).toHaveTextContent('Schwierig, weil: Knie zieht');
    expect(abschnitt).toHaveTextContent(
      '07.10.2026 · 1 von 3 Durchgängen · nicht beendet · erfasst von der Vertretung',
    );
  });

  it('zeigt im Entwurf keinen Abschnitt', async () => {
    renderWithProviders(<PlanPage />);
    await screen.findByRole('heading', { name: 'Heimprogramm Knie' });
    expect(screen.queryByText('Durchgeführt')).not.toBeInTheDocument();
  });
});
