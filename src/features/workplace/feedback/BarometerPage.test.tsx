import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as FeedbackApi from './api';
import type { FeedbackStatus, NamedFeedback } from './api';

/**
 * Das Barometer (ANN-607): eine Frage je Seite, jede überspringbar, nichts vorbelegt; am Ende
 * „Mit Namen senden“. owner liest die Antworten einzeln mit Namen, eine Summe gibt es nicht.
 */

const fetchFeedbackStatus = vi.fn();
const fetchNamedFeedback = vi.fn();
const submitBarometer = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FeedbackApi>();
  return {
    ...actual,
    fetchFeedbackStatus: () => fetchFeedbackStatus() as unknown,
    fetchNamedFeedback: () => fetchNamedFeedback() as unknown,
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
  fetchNamedFeedback.mockReset();
  submitBarometer.mockReset().mockResolvedValue({ month: '2026-10-01' });
});

describe('Barometer abgeben', () => {
  it('führt Frage für Frage zum Senden mit Namen - sechs Tipps ab der ersten Frage', async () => {
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
    // Vor dem Senden steht da, dass es mit Namen geht - eine Wahl gibt es nicht.
    expect(
      within(abschluss).getByText(/Nur die Praxisleitung sieht deine Antworten, mit deinem Namen/),
    ).toBeInTheDocument();
    expect(within(abschluss).queryByRole('button', { name: 'Ohne Namen senden' })).toBeNull();
    await pruefeBarrierefreiheit(document.body);
    await tippe(within(abschluss).getByRole('button', { name: 'Mit Namen senden' }));

    expect(submitBarometer).toHaveBeenCalledWith({
      mood: 7,
      tours: null,
      team: 9,
      easier: '',
      more: '',
    });
    expect(await screen.findByRole('dialog', { name: 'Danke!' })).toBeInTheDocument();
    expect(screen.getByText('Mit deinem Namen an die Praxisleitung gesendet.')).toBeInTheDocument();
    // Mit „Jetzt“ im Fenster der Übersicht sind es sieben.
    expect(tipps).toBe(6);
    await nutzer.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText('Ziel /')).toBeInTheDocument();
  });

  it('ändert aus dem Abschluss und kehrt dorthin zurück; ohne Antwort kein Senden', async () => {
    const nutzer = userEvent.setup();
    rendern();
    for (let i = 0; i < 5; i += 1) {
      const fenster = await screen.findByRole('dialog');
      await nutzer.click(within(fenster).getByRole('button', { name: 'Überspringen' }));
    }
    let abschluss = screen.getByRole('dialog', { name: 'Senden?' });
    expect(within(abschluss).getByText('Noch nichts beantwortet.')).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Mit Namen senden' })).toBeDisabled();

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
      mood: null,
      tours: null,
      team: null,
      easier: 'Mehr Pausen',
      more: '',
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
  const ANTWORTEN: NamedFeedback[] = [
    {
      id: 'b1',
      kind: 'barometer',
      month: '2026-09-01',
      name: 'Tim Teamleitung',
      mood: 8,
      tours: null,
      team: 6,
      easier_text: 'Mehr Pausen',
      more_text: null,
      message_text: null,
    },
    {
      id: 'r1',
      kind: 'message',
      month: '2026-10-01',
      name: 'Olivia Office',
      mood: null,
      tours: null,
      team: null,
      easier_text: null,
      more_text: null,
      message_text: 'Der Drucker klemmt',
    },
  ];

  beforeEach(() => {
    fetchFeedbackStatus.mockResolvedValue(stand({ can_take_part: false, can_read: true }));
  });

  it('zeigt jede Antwort einzeln mit Namen, ohne Summe', async () => {
    fetchNamedFeedback.mockResolvedValue(ANTWORTEN);
    rendern(['owner', 'therapist']);
    expect(await screen.findByText('Tim Teamleitung · Barometer')).toBeInTheDocument();
    expect(
      screen.getByText('Insgesamt 8 · Touren und Fahrzeiten – · Miteinander im Team 6'),
    ).toBeInTheDocument();
    // Rückmeldungen stehen unter „Rückmeldungen“, nicht hier.
    expect(screen.queryByText('Der Drucker klemmt')).toBeNull();
    expect(screen.queryByText(/Median/)).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await pruefeBarrierefreiheit(document.body);
  });

  it('sagt, wenn es noch keine Antworten gibt', async () => {
    fetchNamedFeedback.mockResolvedValue([ANTWORTEN[1]]);
    rendern(['owner', 'therapist']);
    expect(await screen.findByText('Noch keine Antworten')).toBeInTheDocument();
  });
});
