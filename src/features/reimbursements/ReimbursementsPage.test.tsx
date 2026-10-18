import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as ReimbursementsApi from './api';
import { ANNA, TIM, testOverview, testPurchase, testReimbursement } from './testdata';

/**
 * Erstattungen (ERS-001): die eigenen mit Zustand als Zeichen und Wort und
 * maskierter IBAN; für owner zu entscheiden und auszuzahlen; für owner und
 * Büro die Personen, ohne Summe über alle (ANN-598, ANN-601).
 */

const fetchReimbursements = vi.fn();
const withdrawReimbursement = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ReimbursementsApi>();
  return {
    ...actual,
    fetchReimbursements: (...a: unknown[]) => fetchReimbursements(...a) as unknown,
    withdrawReimbursement: (...a: unknown[]) => withdrawReimbursement(...a) as unknown,
  };
});

const { ReimbursementsPage } = await import('./ReimbursementsPage');

function rendern(
  rollen: Parameters<typeof testUser>[0] = ['therapist'],
  pfad = '/betrieb/erstattungen',
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[pfad]}>
        <ReimbursementsPage user={testUser(rollen)} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ANNAS = testOverview({
  person: {
    ...testOverview().person!,
    reimbursements: [
      testReimbursement(),
      testPurchase({
        status: 'approved',
        decided_at: '2026-10-05T09:00:00Z',
        decided_by_name: 'Jannes Test',
      }),
      testReimbursement({
        id: 'erstattung-4',
        period_month: '2026-08-01',
        status: 'rejected',
        decided_at: '2026-10-06T09:00:00Z',
        decision_note: 'Monat schon erstattet',
      }),
      testReimbursement({
        id: 'erstattung-5',
        period_month: '2026-07-01',
        status: 'paid',
        paid_at: '2026-08-05T10:00:00Z',
      }),
      testReimbursement({
        id: 'erstattung-7',
        period_month: '2026-06-01',
        status: 'withdrawn',
        withdrawn_at: '2026-10-03T08:00:00Z',
      }),
    ],
  },
});

beforeEach(() => {
  fetchReimbursements.mockReset().mockResolvedValue(ANNAS);
  withdrawReimbursement.mockReset().mockResolvedValue(undefined);
});

describe('ReimbursementsPage', () => {
  it('zeigt die eigenen Erstattungen mit Zustand und Daten - genehmigt heißt nicht ausgezahlt', async () => {
    rendern();
    const liste = (await screen.findByRole('heading', { name: /Meine Erstattungen/ })).closest(
      'section',
    )!;
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen).toHaveLength(5);
    expect(zeilen[0]).toHaveTextContent('Ladestrom September 2026');
    expect(zeilen[0]).toHaveTextContent('Beantragt');
    // Antrag und Entscheidung je mit Datum (Design-Review Überholung 10).
    expect(zeilen[1]).toHaveTextContent(
      'beantragt am 2. Okt. 2026 · genehmigt am 5. Okt. 2026 von Jannes Test, noch nicht ausgezahlt',
    );
    // Der Betrag je Beleg steht sichtbar am Beleg.
    expect(within(zeilen[1]!).getByRole('button', { name: /^Massageöl, 12,90/ })).toHaveTextContent(
      'Massageöl · 12,90 €',
    );
    expect(zeilen[2]).toHaveTextContent(
      'beantragt am 2. Okt. 2026 · abgelehnt am 6. Okt. 2026: Monat schon erstattet',
    );
    expect(zeilen[3]).toHaveTextContent('ausgezahlt am 5. Aug. 2026');
    // Zeichen und Wort auch ohne eigenen Ton (Regel 5).
    expect(zeilen[4]).toHaveTextContent('×Zurückgezogen');
    expect(zeilen[4]).toHaveTextContent('zurückgezogen am 3. Okt. 2026');
    expect(screen.getByText('Auf DE89 •••• 3000')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ändern: IBAN' })).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/konto?zurueck=%2Fbetrieb%2Ferstattungen',
    );
    expect(screen.getAllByRole('link', { name: 'Erstattung beantragen' })[0]).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/beantragen?zurueck=%2Fbetrieb%2Ferstattungen',
    );
    await act(() => pruefeBarrierefreiheit(document.body));
  });

  it('zieht einen beantragten Antrag nach Rückfrage zurück', async () => {
    const user = userEvent.setup();
    rendern();
    const liste = (await screen.findByRole('heading', { name: /Meine Erstattungen/ })).closest(
      'section',
    )!;
    // Nur der beantragte trägt das Zurückziehen.
    expect(within(liste).getAllByRole('button', { name: 'Zurückziehen' })).toHaveLength(1);
    await user.click(within(liste).getByRole('button', { name: 'Zurückziehen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, zurückziehen' }));
    expect(withdrawReimbursement).toHaveBeenCalledWith('erstattung-1');
  });

  it('zeigt owner, was zu entscheiden und was auszuzahlen ist', async () => {
    fetchReimbursements.mockResolvedValue(
      testOverview({
        can_decide: true,
        can_read_all: true,
        to_decide: [testPurchase({ staff_member_id: TIM, name: 'Tim Teamleitung' })],
        to_pay: [
          {
            ...testReimbursement({
              id: 'erstattung-6',
              staff_member_id: TIM,
              name: 'Tim Teamleitung',
              status: 'approved',
            }),
            iban_masked: 'DE02 •••• 2051',
          },
        ],
        people: [{ staff_member_id: TIM, name: 'Tim Teamleitung', open: 2 }],
      }),
    );
    rendern(['owner']);
    const entscheiden = (await screen.findByRole('heading', { name: /Zu entscheiden/ })).closest(
      'section',
    )!;
    expect(within(entscheiden).getByRole('link', { name: /Tim Teamleitung/ })).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/entscheiden/erstattung-2?zurueck=%2Fbetrieb%2Ferstattungen',
    );
    const auszahlen = screen.getByRole('heading', { name: /Auszuzahlen/ }).closest('section')!;
    expect(within(auszahlen).getByText(/DE02 •••• 2051/)).toBeInTheDocument();
    const personen = screen.getByRole('heading', { name: /Personen/ }).closest('section')!;
    expect(within(personen).getByRole('link', { name: /Tim Teamleitung/ })).toHaveAttribute(
      'href',
      `/betrieb/erstattungen?person=${TIM}`,
    );
    expect(within(personen).getByText('2 offen')).toBeInTheDocument();
  });

  it('zeigt Büro die Erstattungen einer Person - ohne Ändern und Zurückziehen', async () => {
    fetchReimbursements.mockResolvedValue({
      ...ANNAS,
      my_staff_member_id: 'buero',
      can_read_all: true,
    });
    rendern(['office'], `/betrieb/erstattungen?person=${ANNA}`);
    expect(
      await screen.findByRole('heading', { name: 'Erstattungen von Anna Beispiel' }),
    ).toBeInTheDocument();
    expect(fetchReimbursements).toHaveBeenCalledWith(ANNA);
    expect(screen.getByText('Auf DE89 •••• 3000')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurückziehen' })).toBeNull();
    expect(screen.queryByRole('link', { name: /IBAN/ })).toBeNull();
    expect(
      screen.getByRole('button', { name: /^Massageöl, 12,90\s€: Beleg ansehen$/ }),
    ).toBeInTheDocument();
  });

  it('zeigt Büro bei einem Antrag aus Touren weder Kilometer noch Betrag (ANN-616)', async () => {
    fetchReimbursements.mockResolvedValue(
      testOverview({
        my_staff_member_id: 'buero',
        can_read_all: true,
        person: {
          staff_member_id: ANNA,
          name: 'Anna Beispiel',
          account: null,
          reimbursements: [
            {
              ...testReimbursement({
                km_per_hour: null,
                wh_per_km: null,
                rate_cents_per_kwh: null,
              }),
              amount_cents: null,
            },
          ],
        },
      }),
    );
    rendern(['office'], `/betrieb/erstattungen?person=${ANNA}`);
    expect(
      await screen.findByText(/sehen den Betrag nur die Person selbst und wer entscheidet/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/km/)).toBeNull();
    expect(screen.queryByText(/€/)).toBeNull();
  });

  it('nennt der Person die Rechnung aus den Kilometern ihrer Touren (BEF-181)', async () => {
    fetchReimbursements.mockResolvedValue(
      testOverview({
        person: {
          staff_member_id: ANNA,
          name: 'Anna Beispiel',
          account: null,
          reimbursements: [
            testReimbursement({ km_per_hour: null, tour_km: 412, amount_cents: 274 }),
          ],
        },
      }),
    );
    rendern();
    expect(await screen.findByText(/412 km × 18 Wh\/km × 0,37\s€\/kWh/)).toBeInTheDocument();
    expect(screen.getByText('2,74 €')).toBeInTheDocument();
  });
});
