import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as FeedbackApi from './api';
import type { FeedbackStatus, NamedFeedback } from './api';

/**
 * Rückmeldung an die Praxisleitung (ORG-006, ANN-608) und der Eingang:
 * Beschäftigte schreiben, owner liest die namentlichen einzeln.
 */

const fetchFeedbackStatus = vi.fn();
const fetchNamedFeedback = vi.fn();
const submitMessage = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof FeedbackApi>();
  return {
    ...actual,
    fetchFeedbackStatus: () => fetchFeedbackStatus() as unknown,
    fetchNamedFeedback: () => fetchNamedFeedback() as unknown,
    submitMessage: (...a: unknown[]) => submitMessage(...a) as unknown,
  };
});

const { RueckmeldungPage } = await import('./RueckmeldungPage');
const { RueckmeldungenImEingang } = await import('./RueckmeldungenImEingang');

function stand(overrides: Partial<FeedbackStatus> = {}): FeedbackStatus {
  return {
    can_take_part: true,
    can_read: false,
    month: '2026-10-01',
    barometer_submitted: false,
    ...overrides,
  };
}

const NAMENTLICH: NamedFeedback[] = [
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
  {
    id: 'r2',
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
];

function rendern(element: React.ReactNode, pfad = '/betrieb/rueckmeldung') {
  const router = createMemoryRouter(
    [
      { path: pfad, element },
      { path: '*', element: <p>anderswo</p> },
    ],
    { initialEntries: [pfad] },
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
  fetchNamedFeedback.mockReset().mockResolvedValue(NAMENTLICH);
  submitMessage.mockReset().mockResolvedValue({ month: '2026-10-01', named: true });
});

describe('Rückmeldung an die Praxisleitung', () => {
  it('sendet einen Freitext mit Namen - zwei gleichwertige Knöpfe, leer gesperrt', async () => {
    const nutzer = userEvent.setup();
    rendern(<RueckmeldungPage user={testUser(['therapist'])} />);
    const fenster = await screen.findByRole('dialog', {
      name: 'Was möchtest du der Praxisleitung sagen?',
    });
    const mit = within(fenster).getByRole('button', { name: 'Mit Namen senden' });
    const ohne = within(fenster).getByRole('button', { name: 'Ohne Namen senden' });
    expect(mit).toBeDisabled();
    expect(ohne).toBeDisabled();
    expect(mit.className).toBe(ohne.className);
    await nutzer.type(within(fenster).getByLabelText('Deine Rückmeldung'), 'Danke fürs Team');
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(mit);
    expect(submitMessage).toHaveBeenCalledWith({ named: true, text: 'Danke fürs Team' });
    expect(await screen.findByRole('dialog', { name: 'Danke!' })).toBeInTheDocument();
  });

  it('zeigt owner die namentlichen Rückmeldungen einzeln statt eines Formulars', async () => {
    fetchFeedbackStatus.mockResolvedValue(stand({ can_take_part: false, can_read: true }));
    rendern(<RueckmeldungPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Olivia Office · Rückmeldung')).toBeInTheDocument();
    expect(screen.getByText('Der Drucker klemmt')).toBeInTheDocument();
    expect(screen.getByText('Tim Teamleitung · Barometer')).toBeInTheDocument();
    expect(
      screen.getByText('Insgesamt 8 · Touren und Fahrzeiten – · Miteinander im Team 6'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Was die Arbeit leichter machen würde: Mehr Pausen'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(submitMessage).not.toHaveBeenCalled();
    await pruefeBarrierefreiheit(document.body);
  });
});

describe('Rückmeldungen im Eingang', () => {
  it('zeigt Beschäftigten das Barometer des Monats, solange es offen ist', async () => {
    rendern(<RueckmeldungenImEingang />, '/betrieb');
    expect(await screen.findByText('Barometer Oktober')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Barometer Oktober ausfüllen' }).getAttribute('href'),
    ).toBe('/betrieb/barometer?zurueck=%2Fbetrieb');
    expect(screen.getByText('Rückmeldung an die Praxisleitung')).toBeInTheDocument();
  });

  it('nimmt das Barometer nach der Abgabe weg, die Rückmeldung bleibt', async () => {
    fetchFeedbackStatus.mockResolvedValue(stand({ barometer_submitted: true }));
    rendern(<RueckmeldungenImEingang />, '/betrieb');
    expect(await screen.findByText('Rückmeldung an die Praxisleitung')).toBeInTheDocument();
    expect(screen.queryByText('Barometer Oktober')).toBeNull();
  });

  it('zeigt owner die namentlichen Rückmeldungen und den Weg zur Summe', async () => {
    fetchFeedbackStatus.mockResolvedValue(stand({ can_take_part: false, can_read: true }));
    rendern(<RueckmeldungenImEingang />, '/betrieb');
    expect(await screen.findByText('Olivia Office · Rückmeldung')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Barometer ohne Namen' })).toHaveAttribute(
      'href',
      '/betrieb/barometer',
    );
    expect(screen.queryByText('Barometer Oktober')).toBeNull();
  });
});
