import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as VacationApi from './api';
import { STAFF, testKonto, testOffenerAntrag, testUrlaub } from './testdaten';

/**
 * Über einen Urlaubsantrag entscheiden (G7b, URL-001): Genehmigen zwei Tipps
 * (öffnen, Genehmigen), Ablehnen drei und der Grund. Die Notiz der Person
 * steht hier nicht (BEF-066, ANN-580); Termine werden genannt, nie still
 * abgesagt (ANN-578).
 */

const fetchUrlaub = vi.fn();
const decideLeaveRequest = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof VacationApi>();
  return {
    ...actual,
    fetchUrlaub: (...a: unknown[]) => fetchUrlaub(...a) as unknown,
    decideLeaveRequest: (...a: unknown[]) => decideLeaveRequest(...a) as unknown,
  };
});

const { UrlaubEntscheidenPage } = await import('./UrlaubEntscheidenPage');

const ANTRAG = testOffenerAntrag();

function Ziel() {
  const { pathname, search } = useLocation();
  return (
    <p>
      Ziel {pathname}
      {search}
    </p>
  );
}

function rendern(pfad = `/betrieb/urlaub/entscheiden/${ANTRAG.id}`) {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/urlaub/entscheiden/:antragId',
        element: <UrlaubEntscheidenPage user={testUser(['owner'], 'Jannes Test')} />,
      },
      { path: '*', element: <Ziel /> },
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
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  fetchUrlaub.mockReset().mockResolvedValue(
    testUrlaub({
      can_decide: true,
      self_entered: true,
      my_staff_member_id: STAFF.jannes,
      to_decide: [ANTRAG],
    }),
  );
  decideLeaveRequest.mockReset().mockResolvedValue({
    status: 'approved',
    appointments: 3,
    appointment_days: [
      { on_date: '2026-11-03', appointments: 2 },
      { on_date: '2026-11-10', appointments: 1 },
    ],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UrlaubEntscheidenPage', () => {
  it('zeigt auf einer Seite, was die Entscheidung braucht - ohne Notiz', async () => {
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Urlaub genehmigen?' });
    expect(within(seite).getByText('Urlaub von Anna Beispiel')).toBeInTheDocument();
    expect(within(seite).getByText('2.–13. Nov.')).toBeInTheDocument();
    expect(within(seite).getByText('10 Urlaubstage')).toBeInTheDocument();
    // Rest 12, davon gehen die 10 Tage ab.
    expect(within(seite).getByText('Danach 2 von 30 Tagen übrig')).toBeInTheDocument();
    expect(within(seite).getByText('Zur selben Zeit fehlt niemand')).toBeInTheDocument();
    expect(within(seite).getByText('3 Termine im Zeitraum')).toBeInTheDocument();
    expect(within(seite).getByText('Nach dem Genehmigen umplanen')).toBeInTheDocument();
    expect(within(seite).queryByText(/Notiz/)).toBeNull();
    await act(() => pruefeBarrierefreiheit(seite));
  });

  it('genehmigt mit einem Tipp und nennt die Tage mit Terminen zum Umplanen', async () => {
    const user = userEvent.setup();
    rendern(`/betrieb/urlaub/entscheiden/${ANTRAG.id}?zurueck=%2Foffen`);
    const seite = await screen.findByRole('dialog', { name: 'Urlaub genehmigen?' });
    await user.click(within(seite).getByRole('button', { name: 'Genehmigen' }));
    expect(decideLeaveRequest).toHaveBeenCalledWith({
      antragId: ANTRAG.id,
      genehmigen: true,
      grund: null,
    });

    const fertig = await screen.findByRole('dialog', { name: 'Genehmigt' });
    expect(
      within(fertig).getByText(
        'Urlaub von Anna Beispiel, 2.–13. Nov., ist genehmigt. Die Tage sind im Kalender gesperrt.',
      ),
    ).toBeInTheDocument();
    // Ohne Kasten im Fenster: Zwischentitel und je Tag „Tag umplanen“.
    expect(
      within(fertig).getByRole('heading', { name: 'Termine umplanen (3)' }),
    ).toBeInTheDocument();
    expect(within(fertig).getAllByRole('link', { name: /umplanen$/ })).toHaveLength(2);
    const umplanen = within(fertig).getByRole('link', { name: 'Dienstag, 3. November umplanen' });
    expect(umplanen).toHaveTextContent('Tag umplanen');
    expect(
      umplanen
        .getAttribute('href')
        ?.startsWith(`/kalender/tag-umplanen?person=${STAFF.anna}&datum=2026-11-03`),
    ).toBe(true);
    await act(() => pruefeBarrierefreiheit(fertig));
    await user.click(within(fertig).getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText('Ziel /offen')).toBeInTheDocument();
  });

  it('lehnt nur mit Grund ab', async () => {
    const user = userEvent.setup();
    decideLeaveRequest.mockResolvedValue({
      status: 'rejected',
      appointments: 0,
      appointment_days: [],
    });
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Urlaub genehmigen?' });
    await user.click(within(seite).getByRole('button', { name: 'Ablehnen' }));
    const grund = await screen.findByRole('dialog', { name: 'Warum nicht?' });
    const knopf = within(grund).getByRole('button', { name: 'Ablehnen' });
    expect(knopf).toBeDisabled();
    await user.type(
      within(grund).getByLabelText('Grund – Anna Beispiel sieht ihn'),
      'Zu viele zugleich weg',
    );
    await user.click(knopf);
    expect(decideLeaveRequest).toHaveBeenCalledWith({
      antragId: ANTRAG.id,
      genehmigen: false,
      grund: 'Zu viele zugleich weg',
    });
    const fertig = await screen.findByRole('dialog', { name: 'Abgelehnt' });
    expect(
      within(fertig).getByText('Anna Beispiel sieht die Ablehnung mit Ihrem Grund.'),
    ).toBeInTheDocument();
  });

  it('zeigt einen Storno mit den Tagen, die wieder frei werden', async () => {
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        can_decide: true,
        to_decide: [
          testOffenerAntrag({
            kind: 'cancellation',
            refers_to: 'urlaub-1',
            balance: testKonto({ approved: 28, rest: 2 }),
          }),
        ],
      }),
    );
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Storno genehmigen?' });
    expect(within(seite).getByText('Storno von Anna Beispiel')).toBeInTheDocument();
    expect(within(seite).getByText('Storno · 10 Tage wieder frei')).toBeInTheDocument();
    expect(within(seite).getByText('Danach 12 von 30 Tagen übrig')).toBeInTheDocument();
    expect(within(seite).getByRole('button', { name: 'Storno genehmigen' })).toBeInTheDocument();
    expect(within(seite).queryByText(/Termine im Zeitraum/)).toBeNull();
  });

  it('sagt es, wenn kein offener Antrag da ist - mit dem Weg zurück in der Karte', async () => {
    fetchUrlaub.mockResolvedValue(testUrlaub({ can_decide: true, to_decide: [] }));
    rendern();
    expect(await screen.findByText('Kein offener Antrag')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück' })).toHaveAttribute('href', '/betrieb/urlaub');
  });

  it('zieht über den Jahreswechsel nur die Tage des Beginnjahrs ab (Praxis-Review)', async () => {
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        can_decide: true,
        to_decide: [
          testOffenerAntrag({
            starts_on: '2026-12-28',
            ends_on: '2027-01-08',
            days: 8,
            days_following_year: 4,
            balance: testKonto({ requested: 4 }),
          }),
        ],
      }),
    );
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Urlaub genehmigen?' });
    // Rest 12, im Jahr 2026 gehen 4 der 8 Tage ab.
    expect(within(seite).getByText('Danach 8 von 30 Tagen übrig')).toBeInTheDocument();
    expect(within(seite).queryByText(/weitere beantragt/)).toBeNull();
  });

  it('nennt abweichende Arbeitszeiten vor dem Genehmigen und den Weg zur Planung', async () => {
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        can_decide: true,
        to_decide: [testOffenerAntrag({ exception_days: ['2026-11-03'] })],
      }),
    );
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Urlaub genehmigen?' });
    expect(
      within(seite).getByText(
        'Abweichende Arbeitszeiten am 3. Nov. – erst in der Planung ändern, dann genehmigen.',
      ),
    ).toBeInTheDocument();
    expect(within(seite).getByRole('button', { name: 'Genehmigen' })).toBeDisabled();
    expect(within(seite).getByRole('button', { name: 'Ablehnen' })).toBeEnabled();
    expect(within(seite).getByRole('link', { name: 'Zur Planung' })).toHaveAttribute(
      'href',
      `/praxis/planung?person=${STAFF.anna}`,
    );
  });

  it('zeigt einen Fehler des Servers und bleibt auf der Seite', async () => {
    const user = userEvent.setup();
    decideLeaveRequest.mockRejectedValue(
      new Error('Im Zeitraum stehen abweichende Arbeitszeiten. Bitte erst in der Planung ändern.'),
    );
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Urlaub genehmigen?' });
    await user.click(within(seite).getByRole('button', { name: 'Genehmigen' }));
    expect(await within(seite).findByText(/abweichende Arbeitszeiten/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Genehmigt' })).toBeNull();
  });
});
