import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as ReimbursementsApi from './api';
import { testPayout } from './testdata';

/**
 * Auszahlung vermerken (G10b, ERS-001): öffnen, „Ausgezahlt“ - zwei Tipps.
 * Die volle IBAN steht nur hier, mit dem Tag ihrer Hinterlegung (ANN-601).
 */

const fetchPayoutDetails = vi.fn();
const markPaid = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ReimbursementsApi>();
  return {
    ...actual,
    fetchPayoutDetails: (...a: unknown[]) => fetchPayoutDetails(...a) as unknown,
    markPaid: (...a: unknown[]) => markPaid(...a) as unknown,
  };
});

const { PayReimbursementPage } = await import('./PayReimbursementPage');

function Ziel() {
  return <p>Ziel {useLocation().pathname}</p>;
}

function rendern() {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/erstattungen/auszahlen/:reimbursementId',
        element: <PayReimbursementPage user={testUser(['owner'], 'Jannes Test')} />,
      },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: ['/betrieb/erstattungen/auszahlen/erstattung-3?zurueck=%2Foffen'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchPayoutDetails.mockReset().mockResolvedValue(testPayout());
  markPaid.mockReset().mockResolvedValue(undefined);
});

describe('PayReimbursementPage', () => {
  it('zeigt Name, Betrag und die volle IBAN und vermerkt mit einem Tipp', async () => {
    const user = userEvent.setup();
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Ausgezahlt?' });
    expect(fetchPayoutDetails).toHaveBeenCalledWith('erstattung-3');
    expect(within(seite).getByText('Tim Teamleitung')).toBeInTheDocument();
    expect(within(seite).getByText('3,33 €')).toBeInTheDocument();
    expect(within(seite).getByText('DE02 1203 0000 0000 2020 51')).toBeInTheDocument();
    expect(within(seite).getByText('IBAN, hinterlegt am 14. Okt. 2026')).toBeInTheDocument();
    expect(within(seite).getByText('Erstattung Ladestrom September 2026')).toBeInTheDocument();
    await act(() => pruefeBarrierefreiheit(seite));
    await user.click(within(seite).getByRole('button', { name: 'Ausgezahlt' }));
    expect(markPaid).toHaveBeenCalledWith('erstattung-3');
    const fertig = await screen.findByRole('dialog', { name: 'Vermerkt' });
    expect(
      within(fertig).getByText('Auszahlung an Tim Teamleitung vermerkt: 3,33 €.'),
    ).toBeInTheDocument();
    await user.click(within(fertig).getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText('Ziel /offen')).toBeInTheDocument();
  });

  it('sagt endgültig, wenn nichts mehr auszuzahlen ist', async () => {
    fetchPayoutDetails.mockRejectedValue(
      new Error('Diese Erstattung ist nicht (mehr) zum Auszahlen offen.'),
    );
    rendern();
    expect(
      await screen.findByText('Diese Erstattung ist nicht (mehr) zum Auszahlen offen.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
  });

  it('nennt eine Erstattung, die es nicht mehr gibt, endgültig - mit dem Weg zurück (Design-Review)', async () => {
    const user = userEvent.setup();
    // `reimbursement not found` (P0002) - kein Verbindungsfehler.
    fetchPayoutDetails.mockRejectedValue(new Error('Diese Erstattung gibt es nicht mehr.'));
    rendern();
    expect(await screen.findByText('Diese Erstattung gibt es nicht mehr.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Zurück' }));
    expect(await screen.findByText('Ziel /offen')).toBeInTheDocument();
  });

  it('bietet im Funkloch einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchPayoutDetails
      .mockRejectedValueOnce(new Error('Die Angaben zur Auszahlung konnten nicht geladen werden.'))
      .mockResolvedValueOnce(testPayout());
    rendern();
    await user.click(await screen.findByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('dialog', { name: 'Ausgezahlt?' })).toBeInTheDocument();
  });
});
