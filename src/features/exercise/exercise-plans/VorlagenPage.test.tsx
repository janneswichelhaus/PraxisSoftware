import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Api from './api';
import type * as BibliothekApi from '@/features/exercise/exercises/api';
import { renderWithProviders, testUser } from '@/test-utils';
import { OHNE_KATALOG } from '@/features/exercise/exercises/testdaten';

const fetchPraxisvorlagen = vi.fn();
const savePraxisvorlage = vi.fn();
const deletePraxisvorlage = vi.fn();
const fetchBibliothek = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchPraxisvorlagen: () => fetchPraxisvorlagen() as Promise<Api.Praxisvorlagen>,
    savePraxisvorlage: (...a: unknown[]) => savePraxisvorlage(...a) as Promise<string>,
    deletePraxisvorlage: (...a: unknown[]) => deletePraxisvorlage(...a) as Promise<void>,
  };
});

vi.mock('@/features/exercise/exercises/api', async (importOriginal) => {
  const actual = await importOriginal<typeof BibliothekApi>();
  return {
    ...actual,
    fetchBibliothek: () => fetchBibliothek() as Promise<BibliothekApi.Bibliothek>,
  };
});

const { VorlagenPage } = await import('./VorlagenPage');

/** Die Vorlagen der Praxis verwalten (UEB-014, ANN-560). */

function variante(id: string, name: string): BibliothekApi.Variante {
  return {
    id,
    name,
    lay_name: name,
    instruction: null,
    equipment: [],
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...OHNE_KATALOG,
  };
}

const BIBLIOTHEK: BibliothekApi.Bibliothek = {
  can_manage: false,
  links: [],
  exercises: [
    {
      id: 'u1',
      name: 'Kniebeuge',
      lay_name: 'In die Hocke',
      body_region: 'knie',
      archived: false,
      variants: [variante('v1', 'Kniebeuge am Geländer')],
    },
    {
      id: 'u2',
      name: 'Rudern',
      lay_name: 'Ziehen',
      body_region: 'bws',
      archived: false,
      variants: [variante('v3', 'Rudern, Theraband gelb')],
    },
  ],
};

const DOSIS = {
  sets: 3,
  reps_min: 10,
  reps_max: 10,
  duration_seconds: null,
  hold_seconds: null,
  per_side: true,
  times_per_day: null,
  load: null,
  tempo: null,
  rest_seconds: null,
  double_progression: false,
};

function vorlagen(can_edit: boolean): Api.Praxisvorlagen {
  return {
    can_create: true,
    templates: [
      {
        id: 't1',
        name: 'Knie, Woche 1',
        goal: 'Kraft',
        can_edit,
        created_by_name: 'Anna Beispiel',
        updated_on: '2026-10-15',
        items: [
          { variant_id: 'v1', ...DOSIS },
          { variant_id: 'v3', ...DOSIS, sets: 2 },
        ],
      },
    ],
  };
}

beforeEach(() => {
  for (const f of [fetchPraxisvorlagen, savePraxisvorlage, deletePraxisvorlage, fetchBibliothek]) {
    f.mockReset();
  }
  fetchPraxisvorlagen.mockResolvedValue(vorlagen(true));
  fetchBibliothek.mockResolvedValue(BIBLIOTHEK);
  savePraxisvorlage.mockResolvedValue('t1');
  deletePraxisvorlage.mockResolvedValue(undefined);
});

describe('VorlagenPage (UEB-014)', () => {
  it('zeigt die Vorlagen der Praxis und ihre Übungen mit Dosierung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VorlagenPage user={testUser(['therapist'])} />);
    await user.click(await screen.findByRole('button', { name: /^Knie, Woche 1/ }));
    const fenster = await screen.findByRole('dialog', { name: 'Knie, Woche 1' });
    await waitFor(() =>
      expect(within(fenster).getByText('1. Kniebeuge am Geländer')).toBeInTheDocument(),
    );
    expect(within(fenster).getByText('2. Rudern, Theraband gelb')).toBeInTheDocument();
    expect(within(fenster).getAllByText(/× 10 · je Seite/)).toHaveLength(2);
  });

  it('benennt um, ohne die Übungen mitzuschicken', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VorlagenPage user={testUser(['therapist'])} />);
    await user.click(await screen.findByRole('button', { name: /^Knie, Woche 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Name und Ziel' }));
    const feld = await screen.findByRole('textbox', { name: /^Name/ });
    await user.clear(feld);
    await user.type(feld, 'Knie, Woche 2');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(savePraxisvorlage).toHaveBeenCalledWith({
        id: 't1',
        name: 'Knie, Woche 2',
        ziel: 'Kraft',
      }),
    );
    expect(await screen.findByText('Vorlage „Knie, Woche 2“ gespeichert.')).toBeInTheDocument();
  });

  it('löscht nach Rückfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VorlagenPage user={testUser(['therapist'])} />);
    await user.click(await screen.findByRole('button', { name: /^Knie, Woche 1/ }));
    await user.click(await screen.findByRole('button', { name: 'Vorlage löschen' }));
    await user.click(await screen.findByRole('button', { name: 'Ja, löschen' }));
    await waitFor(() => expect(deletePraxisvorlage).toHaveBeenCalledWith('t1'));
    expect(await screen.findByText('Vorlage „Knie, Woche 1“ gelöscht.')).toBeInTheDocument();
  });

  it('ändert nichts, wer die Vorlage nicht angelegt hat', async () => {
    const user = userEvent.setup();
    fetchPraxisvorlagen.mockResolvedValue(vorlagen(false));
    renderWithProviders(<VorlagenPage user={testUser(['team_lead'])} />);
    await user.click(await screen.findByRole('button', { name: /^Knie, Woche 1/ }));
    await screen.findByRole('dialog', { name: 'Knie, Woche 1' });
    expect(screen.queryByRole('button', { name: 'Name und Ziel' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Vorlage löschen' })).toBeNull();
  });

  it('sagt ohne eigene Vorlage, wo sie entsteht', async () => {
    fetchPraxisvorlagen.mockResolvedValue({ can_create: true, templates: [] });
    renderWithProviders(<VorlagenPage user={testUser(['therapist'])} />);
    expect(await screen.findByText('Noch keine eigene Vorlage')).toBeInTheDocument();
    expect(screen.getByText(/Mitgelieferte Vorlagen/)).toBeInTheDocument();
  });
});
