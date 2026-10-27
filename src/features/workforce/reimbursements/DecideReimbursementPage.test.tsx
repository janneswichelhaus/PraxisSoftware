import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as ReimbursementsApi from './api';
import { testOldElectricity, testOverview, testPurchase, testReimbursement } from './testdata';

/**
 * Über eine Erstattung entscheiden (G10b, ERS-001): Genehmigen zwei Tipps
 * (öffnen, Genehmigen), Ablehnen drei und der Grund; genehmigt heißt nicht
 * ausgezahlt, danach „Jetzt auszahlen“.
 */

const fetchReimbursements = vi.fn();
const decideReimbursement = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ReimbursementsApi>();
  return {
    ...actual,
    fetchReimbursements: (...a: unknown[]) => fetchReimbursements(...a) as unknown,
    decideReimbursement: (...a: unknown[]) => decideReimbursement(...a) as unknown,
  };
});

const { DecideReimbursementPage } = await import('./DecideReimbursementPage');

function Ziel() {
  const ort = useLocation();
  return (
    <p>
      Ziel {ort.pathname}
      {ort.search}
    </p>
  );
}

function rendern(pfad = '/betrieb/erstattungen/entscheiden/erstattung-1?zurueck=%2Foffen') {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/erstattungen/entscheiden/:reimbursementId',
        element: <DecideReimbursementPage user={testUser(['owner'], 'Jannes Test')} />,
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
  fetchReimbursements
    .mockReset()
    .mockResolvedValue(
      testOverview({ can_decide: true, to_decide: [testReimbursement(), testPurchase()] }),
    );
  decideReimbursement.mockReset().mockResolvedValue({ status: 'approved' });
});

describe('DecideReimbursementPage', () => {
  it('genehmigt mit einem Tipp und bietet danach das Auszahlen an', async () => {
    const user = userEvent.setup();
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Erstattung genehmigen?' });
    expect(within(seite).getByText('Erstattung von Anna Beispiel')).toBeInTheDocument();
    expect(within(seite).getByText('Ladestrom September 2026')).toBeInTheDocument();
    expect(within(seite).getByText('160 h × 6 km/h × 18 Wh/km × 0,37 €/kWh')).toBeInTheDocument();
    expect(within(seite).getByText('6,39 €')).toBeInTheDocument();
    await act(() => pruefeBarrierefreiheit(seite));
    await user.click(within(seite).getByRole('button', { name: 'Genehmigen' }));
    expect(decideReimbursement).toHaveBeenCalledWith({
      reimbursementId: 'erstattung-1',
      approve: true,
      note: null,
    });

    const fertig = await screen.findByRole('dialog', { name: 'Genehmigt' });
    expect(
      within(fertig).getByText(
        'Erstattung für Anna Beispiel genehmigt: 6,39 €. Noch nicht ausgezahlt.',
      ),
    ).toBeInTheDocument();
    expect(within(fertig).getByRole('link', { name: 'Jetzt auszahlen' })).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/auszahlen/erstattung-1?zurueck=%2Foffen',
    );
    await user.click(within(fertig).getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText('Ziel /offen')).toBeInTheDocument();
  });

  it('zeigt einen Ladestrom vor ORG-008 mit seinen Tagen, seiner Ladung und seinem Satz', async () => {
    fetchReimbursements.mockResolvedValue(
      testOverview({ can_decide: true, to_decide: [testOldElectricity()] }),
    );
    rendern('/betrieb/erstattungen/entscheiden/erstattung-alt');
    const seite = await screen.findByRole('dialog', { name: 'Erstattung genehmigen?' });
    expect(within(seite).getByText('Ladestrom August 2026')).toBeInTheDocument();
    expect(within(seite).getByText('18 × 0,5 kWh × 0,37 €')).toBeInTheDocument();
    expect(within(seite).getByText('3,33 €')).toBeInTheDocument();
  });

  it('zeigt die Belege eines Einkaufs zum Ansehen', async () => {
    rendern('/betrieb/erstattungen/entscheiden/erstattung-2');
    const seite = await screen.findByRole('dialog', { name: 'Erstattung genehmigen?' });
    expect(within(seite).getByText('Einkauf: Massageöl')).toBeInTheDocument();
    expect(
      within(seite).getByRole('button', { name: /^Massageöl, 12,90\s€: Beleg ansehen$/ }),
    ).toBeInTheDocument();
  });

  it('lehnt nur mit Grund ab', async () => {
    const user = userEvent.setup();
    decideReimbursement.mockResolvedValue({ status: 'rejected' });
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Erstattung genehmigen?' });
    await user.click(within(seite).getByRole('button', { name: 'Ablehnen' }));
    const grund = screen.getByRole('dialog', { name: 'Warum nicht?' });
    const knopf = within(grund).getByRole('button', { name: 'Ablehnen' });
    expect(knopf).toBeDisabled();
    await user.type(within(grund).getByLabelText(/Grund/), 'Monat schon erstattet');
    await user.click(knopf);
    expect(decideReimbursement).toHaveBeenCalledWith({
      reimbursementId: 'erstattung-1',
      approve: false,
      note: 'Monat schon erstattet',
    });
    expect(await screen.findByRole('dialog', { name: 'Abgelehnt' })).toBeInTheDocument();
  });

  it('sagt, wenn nichts mehr zu entscheiden ist, und führt zurück', async () => {
    fetchReimbursements.mockResolvedValue(testOverview({ can_decide: true }));
    rendern();
    expect(await screen.findByText('Keine offene Erstattung')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück' })).toHaveAttribute('href', '/offen');
  });
});
