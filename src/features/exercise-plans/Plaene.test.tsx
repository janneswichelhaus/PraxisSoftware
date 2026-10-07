import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as BibliothekApi from '@/features/exercises/api';
import { renderWithProviders } from '@/test-utils';
import { dosierungAlltag, dosierungFachlich, unterschiede } from './dosierung';

const fetchPlanliste = vi.fn();
const fetchPlan = vi.fn();
const createPlan = vi.fn();
const savePlan = vi.fn();
const savePosition = vi.fn();
const movePosition = vi.fn();
const deletePosition = vi.fn();
const discardPlan = vi.fn();
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
    ended_by_name: null,
    created_at: '2026-10-07T08:00:00Z',
    created_by_name: 'Anna Beispiel',
    today: '2026-10-07',
    can_write: true,
    relationship_open: true,
    previous: null,
    items: [position()],
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
