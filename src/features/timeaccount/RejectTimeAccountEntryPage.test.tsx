import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as TimeAccountApi from './api';
import { TIM, testEntry, testTimeAccount } from './testdata';

/**
 * Einen Eintrag zurückweisen (G9b, ZK-001): Budget 3 Tipps und der Grund -
 * hier ab der Seite des Eintrags zwei. Nur owner, nie im eigenen Konto
 * (ANN-594); das entscheidet der Server.
 */

const fetchTimeAccount = vi.fn();
const rejectEntry = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TimeAccountApi>();
  return {
    ...actual,
    fetchTimeAccount: (...a: unknown[]) => fetchTimeAccount(...a) as unknown,
    rejectEntry: (...a: unknown[]) => rejectEntry(...a) as unknown,
  };
});

const { RejectTimeAccountEntryPage } = await import('./RejectTimeAccountEntryPage');

function rendern() {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/zeitkonto/zurueckweisen/:entryId',
        element: <RejectTimeAccountEntryPage />,
      },
      { path: '*', element: <p>Ziel</p> },
    ],
    { initialEntries: [`/betrieb/zeitkonto/zurueckweisen/eintrag-1?person=${TIM}`] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function konto(eintrag = testEntry({ can_withdraw: false, can_reject: true })) {
  return testTimeAccount({
    my_staff_member_id: '55555555-5555-4555-8555-000000000001',
    can_book_others: true,
    can_reject: true,
    account: {
      staff_member_id: TIM,
      name: 'Tim Teamleitung',
      balance_minutes: 45,
      entries: [eintrag],
    },
  });
}

beforeEach(() => {
  fetchTimeAccount.mockReset();
  rejectEntry.mockReset().mockResolvedValue({ status: 'rejected', freed: true });
});

describe('RejectTimeAccountEntryPage', () => {
  it('weist einen Freizeitausgleich mit Grund zurück und gibt die Zeit frei', async () => {
    const nutzer = userEvent.setup();
    fetchTimeAccount.mockResolvedValue(
      konto(
        testEntry({
          kind: 'time_off',
          starts_at: '16:00',
          ends_at: '18:00',
          minutes: -120,
          note: 'Arzttermin',
          can_withdraw: false,
          can_reject: true,
        }),
      ),
    );
    rendern();
    const eintrag = await screen.findByRole('dialog', { name: 'Eintrag zurückweisen?' });
    expect(fetchTimeAccount).toHaveBeenCalledWith(TIM);
    expect(within(eintrag).getByText(/^Freizeitausgleich .*16:00–18:00$/)).toBeInTheDocument();
    expect(within(eintrag).getByText('Arzttermin')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    await nutzer.click(within(eintrag).getByRole('button', { name: 'Zurückweisen' }));

    const grund = screen.getByRole('dialog', { name: 'Warum nicht?' });
    const knopf = within(grund).getByRole('button', { name: 'Zurückweisen' });
    expect(knopf).toBeDisabled();
    await nutzer.type(
      within(grund).getByLabelText('Grund – Tim Teamleitung sieht ihn'),
      'Teamsitzung',
    );
    await nutzer.click(knopf);
    expect(rejectEntry).toHaveBeenCalledWith({ entryId: 'eintrag-1', note: 'Teamsitzung' });

    const fertig = await screen.findByRole('dialog', { name: 'Zurückgewiesen' });
    expect(within(fertig).getByText(/Die Zeit ist wieder Arbeitszeit\./)).toBeInTheDocument();
  });

  it('sagt, wenn nichts mehr zurückzuweisen ist', async () => {
    fetchTimeAccount.mockResolvedValue(
      konto(testEntry({ can_reject: false, can_withdraw: false })),
    );
    rendern();
    expect(await screen.findByText('Nichts mehr zurückzuweisen')).toBeInTheDocument();
    expect(rejectEntry).not.toHaveBeenCalled();
  });
});
