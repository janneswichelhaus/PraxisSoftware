import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as FeedbackApi from './api';
import type { FeedbackStatus, FeedbackSummary } from './api';

/**
 * Das Barometer (ORG-006, ANN-607): eine Frage je Seite, jede überspringbar,
 * nichts vorbelegt; am Ende zwei gleichwertige Knöpfe. owner sieht die
 * Praxissumme oder „noch zu wenige“ - die Schwelle steht am Server.
 */

const fetchFeedbackStatus = vi.fn();
const fetchFeedbackSummary = vi.fn();
const submitBarometer = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FeedbackApi>();
  return {
    ...actual,
    fetchFeedbackStatus: () => fetchFeedbackStatus() as unknown,
    fetchFeedbackSummary: () => fetchFeedbackSummary() as unknown,
    submitBarometer: (...a: unknown[]) => submitBarometer(...a) as unknown,
  };
});

const { BarometerPage } = await import('./BarometerPage');

function stand(overrides: Partial<FeedbackStatus> = {}): FeedbackStatus {
  return {
    can_take_part: true,
    can_read: false,
    month: '2026-10-01',
    barometer_submitted: false,
    ...overrides,
  };
}

function Ziel() {
  const ort = useLocation();
  return <p>Ziel {ort.pathname}</p>;
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  const router = createMemoryRouter(
    [
      { path: '/betrieb/barometer', element: <BarometerPage user={testUser(rollen)} /> },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: ['/betrieb/barometer?zurueck=%2F'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchFeedbackStatus.mockReset().mockResolvedValue(stand());
  fetchFeedbackSummary.mockReset();
  submitBarometer.mockReset().mockResolvedValue({ month: '2026-10-01', named: false });
});

describe('Barometer abgeben', () => {
  it('führt Frage für Frage zum Senden ohne Namen - sechs Tipps ab der ersten Frage', async () => {
    const nutzer = userEvent.setup();
    rendern();
    let tipps = 0;
    const tippe = async (ziel: HTMLElement) => {
      tipps += 1;
      await nutzer.click(ziel);
    };

    const erste = await screen.findByRole('dialog', {
      name: 'Wie geht es dir diesen Monat insgesamt?',
    });
    expect(within(erste).getByText('Frage 1 von 5')).toBeInTheDocument();
    // 3×3 Knöpfe, nichts vorbelegt; die Enden tragen ihr Wort.
    const skala = within(erste).getByRole('group', {
      name: 'Wie geht es dir diesen Monat insgesamt?',
    });
    const knoepfe = within(skala).getAllByRole('button');
    expect(knoepfe).toHaveLength(9);
    expect(knoepfe.every((k) => k.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(within(skala).getByRole('button', { name: '1 – mies' })).toBeInTheDocument();
    expect(within(skala).getByRole('button', { name: '9 – richtig gut' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    await tippe(within(skala).getByRole('button', { name: '7' }));

    const zweite = screen.getByRole('dialog', {
      name: 'Wie gut passen Touren und Fahrzeiten für dich?',
    });
    await tippe(within(zweite).getByRole('button', { name: 'Überspringen' }));

    const dritte = screen.getByRole('dialog', { name: 'Wie erlebst du das Miteinander im Team?' });
    await tippe(within(dritte).getByRole('button', { name: '9 – sehr gut' }));

    const vierte = screen.getByRole('dialog', {
      name: 'Was würde dir die Arbeit leichter machen?',
    });
    await tippe(within(vierte).getByRole('button', { name: 'Überspringen' }));

    const fuenfte = screen.getByRole('dialog', { name: 'Möchtest du sonst noch etwas loswerden?' });
    await tippe(within(fuenfte).getByRole('button', { name: 'Überspringen' }));

    const abschluss = screen.getByRole('dialog', { name: 'Senden?' });
    expect(within(abschluss).getByText('7 von 9')).toBeInTheDocument();
    expect(within(abschluss).getByText('9 von 9')).toBeInTheDocument();
    expect(within(abschluss).getAllByText('übersprungen')).toHaveLength(3);
    expect(within(abschluss).getByText(/Nur die Praxisleitung sieht/)).toBeInTheDocument();
    // Zwei gleichwertige Knöpfe: gleiche Art, keiner vorgewählt.
    const mit = within(abschluss).getByRole('button', { name: 'Mit Namen senden' });
    const ohne = within(abschluss).getByRole('button', { name: 'Ohne Namen senden' });
    expect(mit.className).toBe(ohne.className);
    await pruefeBarrierefreiheit(document.body);
    await tippe(ohne);

    expect(submitBarometer).toHaveBeenCalledWith({
      named: false,
      answers: { mood: 7, tours: null, team: 9, easier: '', more: '' },
    });
    expect(await screen.findByRole('dialog', { name: 'Danke!' })).toBeInTheDocument();
    expect(screen.getByText(/Ohne Namen gesendet/)).toBeInTheDocument();
    // Mit „Jetzt“ im Fenster der Übersicht sind es sieben.
    expect(tipps).toBe(6);
    await nutzer.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText('Ziel /')).toBeInTheDocument();
  });

  it('ändert aus dem Abschluss und kehrt dorthin zurück; ohne Antwort kein Senden', async () => {
    const nutzer = userEvent.setup();
    submitBarometer.mockResolvedValue({ month: '2026-10-01', named: true });
    rendern();
    for (let i = 0; i < 5; i += 1) {
      const fenster = await screen.findByRole('dialog');
      await nutzer.click(within(fenster).getByRole('button', { name: 'Überspringen' }));
    }
    let abschluss = screen.getByRole('dialog', { name: 'Senden?' });
    expect(within(abschluss).getByText('Noch nichts beantwortet.')).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Mit Namen senden' })).toBeDisabled();
    expect(within(abschluss).getByRole('button', { name: 'Ohne Namen senden' })).toBeDisabled();

    await nutzer.click(
      within(abschluss).getByRole('button', {
        name: 'Was die Arbeit leichter machen würde ändern',
      }),
    );
    const text = screen.getByRole('dialog', { name: 'Was würde dir die Arbeit leichter machen?' });
    await nutzer.type(within(text).getByLabelText('Deine Antwort – freiwillig'), 'Mehr Pausen');
    await nutzer.click(within(text).getByRole('button', { name: 'Weiter' }));

    abschluss = screen.getByRole('dialog', { name: 'Senden?' });
    expect(within(abschluss).getByText('Mehr Pausen')).toBeInTheDocument();
    await nutzer.click(within(abschluss).getByRole('button', { name: 'Mit Namen senden' }));
    expect(submitBarometer).toHaveBeenCalledWith({
      named: true,
      answers: { mood: null, tours: null, team: null, easier: 'Mehr Pausen', more: '' },
    });
    expect(await screen.findByText(/Mit deinem Namen/)).toBeInTheDocument();
  });

  it('sagt, wenn der Monat schon abgegeben ist', async () => {
    fetchFeedbackStatus.mockResolvedValue(stand({ barometer_submitted: true }));
    rendern();
    expect(await screen.findByText('Für Oktober schon abgegeben')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zeigt einer Rolle ohne Teilnahme und ohne Lesen „Kein Zugang“', async () => {
    fetchFeedbackStatus.mockResolvedValue(stand({ can_take_part: false }));
    rendern(['therapist']);
    expect(await screen.findByRole('heading', { name: 'Kein Zugang' })).toBeInTheDocument();
  });
});

describe('Barometer für owner', () => {
  beforeEach(() => {
    fetchFeedbackStatus.mockResolvedValue(stand({ can_take_part: false, can_read: true }));
  });

  it('sagt nur „noch zu wenige“, wenn der Server keine Summe liefert', async () => {
    const zuWenige: FeedbackSummary = {
      barometer: { status: 'too_few' },
      messages: { status: 'too_few' },
    };
    fetchFeedbackSummary.mockResolvedValue(zuWenige);
    rendern(['owner', 'therapist']);
    expect(await screen.findAllByText('Noch zu wenige Antworten für eine Auswertung')).toHaveLength(
      2,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('zeigt die Praxissumme: Median, Verteilung, Texte', async () => {
    fetchFeedbackSummary.mockResolvedValue({
      barometer: {
        status: 'ready',
        from_month: '2026-08-01',
        to_month: '2026-09-01',
        answers: 6,
        mood: { enough: true, answered: 6, median: 6.5, distribution: [0, 0, 1, 0, 1, 1, 2, 1, 0] },
        tours: { enough: false },
        team: { enough: true, answered: 5, median: 7, distribution: [0, 0, 0, 0, 0, 1, 3, 1, 0] },
        easier_texts: ['Mehr Pausen'],
        more_texts: [],
      },
      messages: { status: 'too_few' },
    } satisfies FeedbackSummary);
    rendern(['owner', 'therapist']);
    expect(await screen.findByText('August bis September 2026 · 6 Antworten')).toBeInTheDocument();
    expect(
      screen.getByText('Median 6,5 von 9 · niedrig 1 · mittel 2 · hoch 3'),
    ).toBeInTheDocument();
    expect(screen.getByText('Zu wenige Antworten auf diese Frage')).toBeInTheDocument();
    expect(screen.getByText('Mehr Pausen')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
  });
});
