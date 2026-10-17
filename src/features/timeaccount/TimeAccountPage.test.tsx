import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as TimeAccountApi from './api';
import { ANNA, TIM, testEntry, testTimeAccount } from './testdata';

/**
 * Zeitkonto (ZK-001): das eigene Konto mit Saldo und Einträgen, für owner und
 * Büro die Konten aller je Person - ohne Summe über alle (ANN-596).
 */

const fetchTimeAccount = vi.fn();
const withdrawEntry = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TimeAccountApi>();
  return {
    ...actual,
    fetchTimeAccount: (...a: unknown[]) => fetchTimeAccount(...a) as unknown,
    withdrawEntry: (...a: unknown[]) => withdrawEntry(...a) as unknown,
  };
});

const { TimeAccountPage } = await import('./TimeAccountPage');

function rendern(pfad = '/betrieb/zeitkonto') {
  const router = createMemoryRouter(
    [{ path: '/betrieb/zeitkonto', element: <TimeAccountPage user={testUser(['therapist'])} /> }],
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
  fetchTimeAccount.mockReset();
  withdrawEntry.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimeAccountPage', () => {
  it('zeigt das eigene Konto mit Saldo und Einträgen, Zurückgewiesenes mit Grund', async () => {
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        account: {
          staff_member_id: ANNA,
          name: 'Anna Beispiel',
          balance_minutes: 135,
          entries: [
            testEntry({ note: 'Besuch dauerte länger' }),
            testEntry({
              id: 'eintrag-2',
              kind: 'time_off',
              on_date: '2026-10-09',
              starts_at: '16:00',
              ends_at: '18:00',
              minutes: -120,
              status: 'rejected',
              rejection_note: 'Teamsitzung',
              rejected_by_name: 'Jannes Test',
              can_withdraw: false,
            }),
            testEntry({ id: 'eintrag-3', status: 'withdrawn', can_withdraw: false }),
          ],
        },
      }),
    );
    const { container } = rendern();
    expect(await screen.findByText('+2:15 Std.')).toBeInTheDocument();
    expect(fetchTimeAccount).toHaveBeenCalledWith(null);
    const eintraege = screen.getByRole('heading', { name: /^Einträge/ }).closest('section')!;
    // Zurückgenommenes steht nicht da.
    expect(within(eintraege).getAllByRole('listitem')).toHaveLength(2);
    expect(within(eintraege).getByText(/18:00–18:45 · Besuch dauerte länger/)).toBeInTheDocument();
    expect(within(eintraege).getByText('Zurückgewiesen')).toBeInTheDocument();
    expect(
      within(eintraege).getByText(/Zurückgewiesen von Jannes Test: Teamsitzung/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Zeitkonten/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Eintragen' })).toHaveAttribute(
      'href',
      '/betrieb/zeitkonto/eintragen?zurueck=%2Fbetrieb%2Fzeitkonto',
    );
    await pruefeBarrierefreiheit(container);
  });

  it('nennt das Jahr früherer Einträge und den Übertrag eines gelöschten Jahres (ANN-597)', async () => {
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        account: {
          staff_member_id: ANNA,
          name: 'Anna Beispiel',
          balance_minutes: 105,
          entries: [
            testEntry(),
            testEntry({ id: 'eintrag-2', on_date: '2025-12-30', can_withdraw: false }),
            testEntry({
              id: 'uebertrag-2022',
              kind: 'carryover',
              on_date: '2022-12-31',
              starts_at: null,
              ends_at: null,
              minutes: 15,
              entered_at: '2026-01-01T02:00:00Z',
              can_withdraw: false,
            }),
          ],
        },
      }),
    );
    rendern();
    const eintraege = (await screen.findByRole('heading', { name: /^Einträge/ })).closest(
      'section',
    )!;
    expect(within(eintraege).getByText('Mehrarbeit · Do., 15. Okt.')).toBeInTheDocument();
    expect(within(eintraege).getByText('Mehrarbeit · Di., 30. Dez. 2025')).toBeInTheDocument();
    const uebertrag = within(eintraege).getByText('Übertrag aus 2022').closest('li')!;
    expect(uebertrag).toHaveTextContent('+0:15 Std.');
    expect(within(uebertrag).queryByRole('button')).toBeNull();
    expect(within(uebertrag).queryByRole('link')).toBeNull();
  });

  it('nimmt einen eigenen Eintrag mit Rückfrage zurück', async () => {
    const nutzer = userEvent.setup();
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        account: {
          staff_member_id: ANNA,
          name: 'Anna Beispiel',
          balance_minutes: 45,
          entries: [testEntry()],
        },
      }),
    );
    rendern();
    await nutzer.click(await screen.findByRole('button', { name: 'Zurücknehmen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, zurücknehmen' }));
    expect(withdrawEntry).toHaveBeenCalledWith('eintrag-1');
  });

  it('zeigt owner und Büro die Konten aller je Person, ohne Summe', async () => {
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        can_book_others: true,
        accounts: [
          { staff_member_id: ANNA, name: 'Anna Beispiel', balance_minutes: 90 },
          { staff_member_id: TIM, name: 'Tim Teamleitung', balance_minutes: -30 },
        ],
      }),
    );
    rendern();
    const konten = (await screen.findByRole('heading', { name: /^Zeitkonten/ })).closest(
      'section',
    )!;
    // Das eigene Konto steht oben, nicht noch einmal in der Liste.
    const tim = within(konten).getByRole('link', { name: /Tim Teamleitung/ });
    expect(within(konten).queryByRole('link', { name: /Anna Beispiel/ })).toBeNull();
    expect(tim).toHaveAttribute('href', `/betrieb/zeitkonto?person=${TIM}`);
    expect(tim).toHaveTextContent('−0:30 Std.');
    expect(screen.queryByText(/Summe|Gesamt|alle Personen/)).toBeNull();
  });

  it('nennt ohne weitere Personen einen Leerzustand statt einer leeren Liste (Regel 8)', async () => {
    fetchTimeAccount.mockResolvedValue(testTimeAccount({ can_book_others: true, accounts: [] }));
    rendern();
    const konten = (await screen.findByRole('heading', { name: /^Zeitkonten/ })).closest(
      'section',
    )!;
    expect(within(konten).getByText('Keine weiteren Zeitkonten')).toBeInTheDocument();
  });

  it('öffnet das Konto einer Person mit Rückweg, Eintragen und Zurückweisen', async () => {
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        can_book_others: true,
        can_reject: true,
        my_staff_member_id: '55555555-5555-4555-8555-000000000001',
        account: {
          staff_member_id: TIM,
          name: 'Tim Teamleitung',
          balance_minutes: 45,
          entries: [
            testEntry({ can_withdraw: false, can_reject: true, entered_by_name: 'Olivia Office' }),
          ],
        },
      }),
    );
    rendern(`/betrieb/zeitkonto?person=${TIM}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Zeitkonto von Tim Teamleitung' }),
    ).toBeInTheDocument();
    expect(fetchTimeAccount).toHaveBeenCalledWith(TIM);
    expect(screen.getByRole('link', { name: '← Zurück zu den Zeitkonten' })).toHaveAttribute(
      'href',
      '/betrieb/zeitkonto',
    );
    expect(screen.getByText(/eingetragen von Olivia Office/)).toBeInTheDocument();
    const zurueckweisen = screen.getByRole('link', { name: 'Zurückweisen' }).getAttribute('href');
    expect(
      zurueckweisen?.startsWith(
        `/betrieb/zeitkonto/zurueckweisen/eintrag-1?person=${TIM}&zurueck=`,
      ),
    ).toBe(true);
    const eintragen = screen.getByRole('link', { name: 'Eintragen' }).getAttribute('href');
    expect(eintragen?.startsWith(`/betrieb/zeitkonto/eintragen?person=${TIM}&zurueck=`)).toBe(true);
  });
});
