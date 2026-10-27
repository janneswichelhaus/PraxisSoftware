import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as VacationApi from './api';
import type { EigenerAntrag } from './api';
import { STAFF, testFremdesKonto, testKonto, testOffenerAntrag, testUrlaub } from './testdaten';

/**
 * Die Urlaubsseite (URL-001) ersetzt die Vorschau. Geprüft wird, was jede
 * Rolle sieht - eigene Anträge mit allem, wer im Team fehlt nur mit Name und
 * Zeitraum, offene Anträge und Konten anderer nur für owner (BEF-066,
 * ANN-580) - und dass Zurückziehen und Stornieren nachfragen.
 */

const fetchUrlaub = vi.fn();
const withdrawLeaveRequest = vi.fn();
const requestLeaveCancellation = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof VacationApi>();
  return {
    ...actual,
    fetchUrlaub: (...a: unknown[]) => fetchUrlaub(...a) as unknown,
    withdrawLeaveRequest: (...a: unknown[]) => withdrawLeaveRequest(...a) as unknown,
    requestLeaveCancellation: (...a: unknown[]) => requestLeaveCancellation(...a) as unknown,
  };
});

const { VacationPage } = await import('./VacationPage');

function eigener(overrides: Partial<EigenerAntrag>): EigenerAntrag {
  return {
    id: 'eigen-1',
    kind: 'leave',
    refers_to: null,
    starts_on: '2026-11-02',
    ends_on: '2026-11-06',
    days: 5,
    message: null,
    status: 'requested',
    requested_at: '2026-10-10T08:00:00Z',
    decided_at: null,
    decided_by_name: null,
    decision_note: null,
    self_entered: false,
    open_cancellation: false,
    ...overrides,
  };
}

function rendern(
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  eintrag: string | { pathname: string; state: unknown } = '/betrieb/urlaub',
) {
  const router = createMemoryRouter(
    [{ path: '*', element: <VacationPage user={testUser(rollen)} /> }],
    { initialEntries: [eintrag] },
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
  fetchUrlaub.mockReset();
  withdrawLeaveRequest.mockReset().mockResolvedValue(undefined);
  requestLeaveCancellation.mockReset().mockResolvedValue('storno-1');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Urlaub', () => {
  it('zeigt der Person ihr Konto und ihre Anträge mit Stand und Grund', async () => {
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        balance: testKonto({ approved: 13, requested: 5, rest: 17 }),
        own: [
          eigener({ id: 'a', message: 'Familienfeier' }),
          eigener({
            id: 'b',
            starts_on: '2026-12-21',
            ends_on: '2026-12-23',
            days: 3,
            status: 'approved',
          }),
          eigener({
            id: 'c',
            starts_on: '2027-01-11',
            ends_on: '2027-01-15',
            status: 'rejected',
            decision_note: 'Zu viele zugleich weg',
          }),
          eigener({ id: 'd', status: 'withdrawn' }),
        ],
      }),
    );
    const { container } = rendern();
    expect(await screen.findByRole('heading', { name: 'Mein Urlaub 2026' })).toBeInTheDocument();
    expect(screen.getByText('17 Tage')).toBeInTheDocument();
    expect(screen.getByText('von 30 Tagen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Meine Anträge (3)' })).toBeInTheDocument();
    expect(screen.getByText('Beantragt', { selector: 'span *, span' })).toBeInTheDocument();
    expect(screen.getByText(/Grund: Zu viele zugleich weg/)).toBeInTheDocument();
    // Die eigene Notiz sieht die Person selbst.
    expect(screen.getByText(/Notiz: Familienfeier/)).toBeInTheDocument();
    // Ohne Entscheidungsrecht weder offene Anträge anderer noch Konten.
    expect(screen.queryByRole('heading', { name: /Zu entscheiden/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Urlaubskonten/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Urlaub beantragen' })).toHaveAttribute(
      'href',
      '/betrieb/urlaub/beantragen',
    );
    await act(() => pruefeBarrierefreiheit(container));
  });

  it('zieht einen offenen Antrag nach einer Rückfrage zurück', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(testUrlaub({ own: [eigener({ id: 'offen-1' })] }));
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Zurückziehen' }));
    expect(withdrawLeaveRequest).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    expect(withdrawLeaveRequest).toHaveBeenCalledWith('offen-1');
  });

  it('storniert genehmigten Urlaub vor Beginn als Antrag, laufenden nicht', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        own: [
          eigener({ id: 'kuenftig', status: 'approved' }),
          eigener({
            id: 'laufend',
            starts_on: '2026-10-14',
            ends_on: '2026-10-20',
            status: 'approved',
          }),
          eigener({
            id: 'mit-storno',
            starts_on: '2026-12-01',
            ends_on: '2026-12-02',
            status: 'approved',
            open_cancellation: true,
          }),
        ],
      }),
    );
    rendern();
    const knoepfe = await screen.findAllByRole('button', { name: 'Stornieren' });
    expect(knoepfe).toHaveLength(1);
    expect(screen.getByText('Storno beantragt')).toBeInTheDocument();
    await user.click(knoepfe[0]!);
    await user.click(screen.getByRole('button', { name: 'Storno beantragen' }));
    expect(requestLeaveCancellation).toHaveBeenCalledWith('kuenftig');
  });

  it('zeigt owner offene Anträge, die Konten je Person und „Urlaub eintragen“', async () => {
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        my_staff_member_id: STAFF.jannes,
        can_decide: true,
        self_entered: true,
        can_manage_entitlements: true,
        to_decide: [testOffenerAntrag()],
        balances: [
          testFremdesKonto(),
          testFremdesKonto({
            staff_member_id: STAFF.tim,
            name: 'Tim Teamleitung',
            balance: testKonto({ entitlement: null, carryover: null, approved: 0, rest: null }),
          }),
        ],
      }),
    );
    rendern(['owner']);
    expect(await screen.findByRole('heading', { name: 'Zu entscheiden (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anna Beispiel.*2\.–13\. Nov\./ })).toHaveAttribute(
      'href',
      '/betrieb/urlaub/entscheiden/abababab-abab-4bab-8bab-000000000001',
    );
    const konten = screen
      .getByRole('heading', { name: 'Urlaubskonten 2026 (2)' })
      .closest('section')!;
    expect(within(konten).getByText('Anspruch fehlt')).toBeInTheDocument();
    expect(within(konten).getByText('12 übrig')).toBeInTheDocument();
    expect(within(konten).getByRole('link', { name: /Tim Teamleitung/ })).toHaveAttribute(
      'href',
      `/betrieb/urlaub/anspruch/${STAFF.tim}`,
    );
    expect(screen.getByRole('link', { name: 'Urlaub eintragen' })).toBeInTheDocument();
  });

  it('klappt ein, wer im Team fehlt - nur Name und Zeitraum', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        team: [
          {
            staff_member_id: STAFF.tim,
            name: 'Tim Teamleitung',
            starts_on: '2026-11-05',
            ends_on: '2026-11-06',
          },
        ],
      }),
    );
    rendern();
    const aufklapper = await screen.findByText('Abwesend im Team');
    expect(screen.getByText('Tim Teamleitung')).not.toBeVisible();
    await user.click(aufklapper);
    expect(screen.getByText('Tim Teamleitung')).toBeVisible();
    expect(screen.getByText('5.–6. Nov.')).toBeInTheDocument();
  });

  it('zeigt die Rückmeldung nach dem Beantragen', async () => {
    fetchUrlaub.mockResolvedValue(testUrlaub());
    rendern(['therapist'], {
      pathname: '/betrieb/urlaub',
      state: { meldung: 'Urlaub beantragt: 2.–13. Nov. (9 Urlaubstage).' },
    });
    expect(
      await screen.findByText('Urlaub beantragt: 2.–13. Nov. (9 Urlaubstage).'),
    ).toBeInTheDocument();
  });
});
