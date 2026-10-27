import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneGewohnheiten, Plattformzugang } from './api';

/**
 * Gewohnheiten auf der Plattform (ALT-003, IDEA-ALT-002, ANN-370): die
 * letzten sieben Tage zum Antippen, Pausieren bei Krankheit, keine Serie.
 */

const ladeGewohnheiten = vi.fn();
const gewohnheitVermerken = vi.fn();
const gewohnheitPausieren = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeGewohnheiten: (...a: unknown[]) =>
    ladeGewohnheiten(...a) as Promise<EigeneGewohnheiten | null>,
  gewohnheitVermerken: (...a: unknown[]) => gewohnheitVermerken(...a) as Promise<void>,
  gewohnheitPausieren: (...a: unknown[]) => gewohnheitPausieren(...a) as Promise<void>,
}));

const { Gewohnheiten } = await import('./Gewohnheiten');

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

const GEWOHNHEIT: EigeneGewohnheiten['habits'][number] = {
  id: 'b1b1b1b1-b1b1-4b1b-8b1b-000000000001',
  action: 'zwei Minuten Mobilität',
  cue: 'Nach dem Zähneputzen',
  place: 'im Bad',
  starts_on: '2026-10-08',
  paused: false,
  ended_at: null,
  marks: ['2026-10-12', '2026-10-09'],
};

function daten(teil: Partial<EigeneGewohnheiten> = {}): EigeneGewohnheiten {
  return {
    today: '2026-10-12',
    mark_days: 7,
    can_mark: true,
    consent_needed: false,
    habits: [GEWOHNHEIT],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeGewohnheiten.mockResolvedValue(daten());
  gewohnheitVermerken.mockResolvedValue(undefined);
  gewohnheitPausieren.mockResolvedValue(undefined);
});

describe('Gewohnheiten auf der Plattform (ALT-003)', () => {
  it('führt zurück, woher man kam: aus „Ich“ nach „Ich“, sonst zur Übersicht (DR-144)', async () => {
    const { unmount } = renderWithProviders(
      <Gewohnheiten zugang={ZUGANG} />,
      `/p/gewohnheiten?bereich=treatment&zurueck=${encodeURIComponent('/p/ich?bereich=treatment')}`,
    );
    expect(await screen.findByRole('link', { name: '← Ich' })).toHaveAttribute(
      'href',
      '/p/ich?bereich=treatment',
    );
    unmount();

    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten?bereich=treatment');
    expect(await screen.findByRole('link', { name: '← Zur Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
  });

  it('zeigt die Tage ab dem Beginn zum Antippen, ohne Serie oder Zählwerk', async () => {
    const { container } = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    const tage = await screen.findByRole('group', { name: 'Tage für „zwei Minuten Mobilität“' });
    // Seit dem 08.10.: fünf Tage, nicht sieben.
    const knoepfe = within(tage).getAllByRole('button');
    expect(knoepfe).toHaveLength(5);
    expect(within(tage).getByRole('button', { name: /heute/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(tage).getByRole('button', { name: /Sa\.?,? 10\.10/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(document.body).toHaveTextContent('es gibt keine Serie, die abreißt');
    expect(document.body).not.toHaveTextContent(/in Folge|Tage am Stück|%|geschafft/);
    await pruefeBarrierefreiheit(container);
  });

  it('vermerkt einen Tag und nimmt ihn zurück', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    await nutzer.click(await screen.findByRole('button', { name: /Sa\.?,? 10\.10/ }));
    await waitFor(() =>
      expect(gewohnheitVermerken).toHaveBeenCalledWith(
        ZUGANG.access_id,
        GEWOHNHEIT.id,
        '2026-10-10',
        true,
      ),
    );
    await nutzer.click(screen.getByRole('button', { name: /heute/ }));
    await waitFor(() =>
      expect(gewohnheitVermerken).toHaveBeenCalledWith(
        ZUGANG.access_id,
        GEWOHNHEIT.id,
        '2026-10-12',
        false,
      ),
    );
  });

  it('pausiert; pausiert gibt es nichts anzutippen, nur Fortsetzen', async () => {
    const nutzer = userEvent.setup();
    const { unmount } = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    await nutzer.click(
      await screen.findByRole('button', { name: 'Pausieren, etwa bei Krankheit' }),
    );
    await waitFor(() =>
      expect(gewohnheitPausieren).toHaveBeenCalledWith(ZUGANG.access_id, GEWOHNHEIT.id, true),
    );
    unmount();
    ladeGewohnheiten.mockResolvedValue(daten({ habits: [{ ...GEWOHNHEIT, paused: true }] }));
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    expect(await screen.findByText(/Pausiert\. Setzen Sie fort/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /Tage für/ })).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Fortsetzen' }));
    await waitFor(() =>
      expect(gewohnheitPausieren).toHaveBeenCalledWith(ZUGANG.access_id, GEWOHNHEIT.id, false),
    );
  });

  it('die Begleitung sieht die Tage, tippt aber nichts an', async () => {
    ladeGewohnheiten.mockResolvedValue(daten({ can_mark: false }));
    renderWithProviders(
      <Gewohnheiten zugang={{ ...ZUGANG, access_kind: 'companion', represented_name: 'Max' }} />,
      '/p/gewohnheiten',
    );
    expect(
      await screen.findByText(
        'Die Tage vermerkt die Person selbst oder ihre rechtliche Vertretung.',
      ),
    ).toBeInTheDocument();
    for (const knopf of screen.getAllByRole('button', { name: /\d|heute/ })) {
      expect(knopf).toBeDisabled();
    }
    expect(screen.queryByRole('button', { name: /Pausieren/ })).not.toBeInTheDocument();
  });

  it('ohne Einwilligung im Training: der Weg dorthin; ohne Gewohnheit ein Satz', async () => {
    ladeGewohnheiten.mockResolvedValue(daten({ can_mark: false, consent_needed: true }));
    const { unmount } = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    expect(await screen.findByText(/braucht es Ihre\s+Einwilligung/)).toBeInTheDocument();
    unmount();
    ladeGewohnheiten.mockResolvedValue(daten({ habits: [] }));
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    expect(
      await screen.findByText('Mit Ihrer Praxis ist zurzeit keine Gewohnheit vereinbart.'),
    ).toBeInTheDocument();
  });
});
