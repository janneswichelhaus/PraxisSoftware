import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PlattformApi from './api';
import type { EigeneGewohnheiten, Plattformzugang } from './api';

/**
 * Gewohnheiten auf der Plattform (ANN-370): die letzten Tage als Leiste mit Datum zum Antippen,
 * Pausieren bei Krankheit, keine Serie und kein Zählwerk.
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
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

const TITEL = 'Nach dem Zähneputzen: zwei Minuten Mobilität';

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gewohnheiten auf der Plattform', () => {
  it('führt zurück, woher man kam: aus „Ich“ nach „Ich“, sonst zur Übersicht', async () => {
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
    expect(await screen.findByRole('link', { name: '← Übersicht' })).toHaveAttribute(
      'href',
      '/p?bereich=treatment',
    );
  });

  it('zeigt je Gewohnheit Titel, Ort und die Tage ab dem Beginn mit Datum, ohne Zählwerk', async () => {
    const { container } = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    const tage = await screen.findByRole('group', { name: TITEL });
    expect(screen.getByRole('heading', { level: 2, name: TITEL })).toHaveClass('text-abschnitt');
    expect(screen.getByText('im Bad · mit Ihrer Praxis vereinbart')).toBeInTheDocument();
    // Der Abschnittstitel über allen Gewohnheiten entfällt.
    expect(screen.queryByRole('heading', { name: 'Mit Ihrer Praxis vereinbart' })).toBeNull();
    // Seit dem 08.10.: fünf Tage, nicht sieben, der älteste links.
    const knoepfe = within(tage).getAllByRole('button');
    expect(knoepfe.map((k) => k.textContent)).toEqual([
      'Do8Donnerstag, 8. Oktober',
      'FrFreitag, 9. Oktober',
      'Sa10Samstag, 10. Oktober',
      'So11Sonntag, 11. Oktober',
      'Moheute, Montag, 12. Oktober',
    ]);
    expect(
      within(tage).getByRole('button', { name: 'heute, Montag, 12. Oktober' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(within(tage).getByRole('button', { name: 'Samstag, 10. Oktober' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(document.body).toHaveTextContent('es gibt keine Serie, die abreißt');
    expect(document.body).not.toHaveTextContent(
      /in Folge|Tage am Stück|%|geschafft|von 7|Serie von/,
    );
    expect(screen.getByRole('button', { name: 'Pausieren, etwa bei Krankheit' })).toBeEnabled();
    await pruefeBarrierefreiheit(container);
  });

  it('vermerkt einen Tag mit einem Tipp, sofort sichtbar, und nimmt ihn mit einem zweiten zurück', async () => {
    const nutzer = userEvent.setup();
    // Der Server kennt den Tag danach.
    ladeGewohnheiten
      .mockResolvedValueOnce(daten())
      .mockResolvedValue(
        daten({ habits: [{ ...GEWOHNHEIT, marks: [...GEWOHNHEIT.marks, '2026-10-10'] }] }),
      );
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    const samstag = await screen.findByRole('button', { name: 'Samstag, 10. Oktober' });
    await nutzer.click(samstag);
    expect(samstag).toHaveAttribute('aria-pressed', 'true');
    expect(gewohnheitVermerken).toHaveBeenCalledWith(
      ZUGANG.access_id,
      GEWOHNHEIT.id,
      '2026-10-10',
      true,
    );
    await waitFor(() => expect(ladeGewohnheiten).toHaveBeenCalledTimes(2));
    expect(samstag).toHaveAttribute('aria-pressed', 'true');

    await nutzer.click(screen.getByRole('button', { name: 'heute, Montag, 12. Oktober' }));
    await waitFor(() =>
      expect(gewohnheitVermerken).toHaveBeenCalledWith(
        ZUGANG.access_id,
        GEWOHNHEIT.id,
        '2026-10-12',
        false,
      ),
    );
  });

  it('nimmt einen Tipp zurück, wenn das Vermerken scheitert, und sagt es unter den Tagen', async () => {
    const nutzer = userEvent.setup();
    gewohnheitVermerken.mockRejectedValue(new Error('Nicht gespeichert. Bitte erneut versuchen.'));
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    const samstag = await screen.findByRole('button', { name: 'Samstag, 10. Oktober' });
    await nutzer.click(samstag);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nicht gespeichert. Bitte erneut versuchen.',
    );
    expect(samstag).toHaveAttribute('aria-pressed', 'false');
  });

  it('pausiert; pausiert steht eine ruhige Zeile mit „Fortsetzen“ statt der Tage', async () => {
    const nutzer = userEvent.setup();
    const { unmount } = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    await nutzer.click(
      await screen.findByRole('button', { name: 'Pausieren, etwa bei Krankheit' }),
    );
    await waitFor(() =>
      expect(gewohnheitPausieren).toHaveBeenCalledWith(ZUGANG.access_id, GEWOHNHEIT.id, true),
    );
    unmount();

    ladeGewohnheiten.mockResolvedValue(
      daten({ habits: [{ ...GEWOHNHEIT, place: null, paused: true }] }),
    );
    const { container } = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    const zeile = await screen.findByText('Pausiert. Setzen Sie fort, wenn es wieder geht.');
    expect(zeile.parentElement).toHaveClass('bg-surface-sunken', 'rounded-card');
    expect(zeile.parentElement!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('mit Ihrer Praxis vereinbart')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: TITEL })).not.toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Fortsetzen' }));
    await waitFor(() =>
      expect(gewohnheitPausieren).toHaveBeenCalledWith(ZUGANG.access_id, GEWOHNHEIT.id, false),
    );
    await pruefeBarrierefreiheit(container);
  });

  it('die Begleitung sieht die Tage gesperrt und tippt nichts an', async () => {
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
    const tage = screen.getByRole('group', { name: TITEL });
    expect(tage).toHaveClass('border-dashed');
    for (const knopf of within(tage).getAllByRole('button')) expect(knopf).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Pausieren/ })).not.toBeInTheDocument();
  });

  it('ohne Einwilligung im Training: der Satz und der Weg zu den Einwilligungen', async () => {
    ladeGewohnheiten.mockResolvedValue(daten({ can_mark: false, consent_needed: true }));
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten?bereich=training');
    expect(await screen.findByText(/braucht es Ihre\s+Einwilligung/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Einwilligungen ansehen' })).toHaveAttribute(
      'href',
      '/p/einwilligungen?bereich=training',
    );
    expect(screen.getByRole('group', { name: TITEL })).toHaveClass('border-dashed');
  });

  it('ohne Netz: Tage und Pausieren gesperrt, der Satz sagt, wann es wieder geht', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    const tage = await screen.findByRole('group', { name: TITEL });
    for (const knopf of within(tage).getAllByRole('button')) expect(knopf).toBeDisabled();
    const satz = screen.getByText('Vermerken geht wieder mit Verbindung.');
    const pausieren = screen.getByRole('button', { name: 'Pausieren, etwa bei Krankheit' });
    expect(pausieren).toBeDisabled();
    expect(pausieren).toHaveAttribute('aria-describedby', satz.id);
  });

  it('leer, beim Laden und mit Fehler', async () => {
    ladeGewohnheiten.mockResolvedValue(daten({ habits: [] }));
    const { container, unmount } = renderWithProviders(
      <Gewohnheiten zugang={ZUGANG} />,
      '/p/gewohnheiten',
    );
    expect(await screen.findByText('Zurzeit keine Gewohnheit')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Vereinbaren Sie mit Ihrer Praxis eine kleine Gewohnheit, steht sie hier zum Abhaken.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Tippen Sie die Tage an/)).toBeNull();
    await pruefeBarrierefreiheit(container);
    unmount();

    ladeGewohnheiten.mockReturnValue(new Promise(() => undefined));
    const laden = renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    expect(screen.getByRole('heading', { level: 1, name: 'Gewohnheiten' })).toBeInTheDocument();
    expect(laden.container.querySelector('[aria-busy="true"]')).toHaveTextContent(
      'Ihre Gewohnheiten werden geladen',
    );
    expect(laden.container.querySelector('[data-skelett="tage"]')).not.toBeNull();
    laden.unmount();

    ladeGewohnheiten.mockRejectedValue(
      new Error('Ihre Gewohnheiten konnten nicht geladen werden.'),
    );
    renderWithProviders(<Gewohnheiten zugang={ZUGANG} />, '/p/gewohnheiten');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ihre Gewohnheiten konnten nicht geladen werden.',
    );
  });
});
