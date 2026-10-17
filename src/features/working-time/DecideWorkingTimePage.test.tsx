import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as WorkingTimeApi from './api';
import { testOpenRequest, testWorkingTime } from './testdata';

/**
 * Über eine Arbeitszeitänderung entscheiden (G8b, AZ-001): Genehmigen zwei
 * Tipps, Ablehnen drei und der Grund (ANN-590). Danach die Tage mit Terminen
 * außerhalb, je mit „Tag umplanen“ - nie still verschoben.
 */

const fetchWorkingTime = vi.fn();
const decideRequest = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof WorkingTimeApi>();
  return {
    ...actual,
    fetchWorkingTime: (...a: unknown[]) => fetchWorkingTime(...a) as unknown,
    decideRequest: (...a: unknown[]) => decideRequest(...a) as unknown,
  };
});

const { DecideWorkingTimePage } = await import('./DecideWorkingTimePage');

function rendern() {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/arbeitszeit/entscheiden/:requestId',
        element: <DecideWorkingTimePage user={testUser(['owner'])} />,
      },
      { path: '*', element: <p>anderswo</p> },
    ],
    { initialEntries: ['/betrieb/arbeitszeit/entscheiden/antrag-1'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchWorkingTime
    .mockReset()
    .mockResolvedValue(
      testWorkingTime({ can_decide: true, self_entered: true, to_decide: [testOpenRequest()] }),
    );
  decideRequest.mockReset().mockResolvedValue({
    status: 'approved',
    appointment_days: [{ on_date: '2026-12-01', appointments: 2 }],
  });
});

describe('DecideWorkingTimePage', () => {
  it('genehmigt mit einem Tipp und nennt danach die Tage zum Umplanen', async () => {
    const user = userEvent.setup();
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Änderung genehmigen?' });
    expect(within(seite).getByText('Arbeitszeit von Anna Beispiel')).toBeInTheDocument();
    expect(within(seite).getByText('Wochenplan ab Dienstag, 1. Dezember')).toBeInTheDocument();
    expect(
      within(seite).getByText('Dienstag: 08:00–12:30, 13:30–18:00 · 9:00 Std.'),
    ).toBeInTheDocument();
    expect(
      within(seite).getByText('bisher 08:00–12:00, 13:00–18:00 · 9:00 Std.'),
    ).toBeInTheDocument();
    expect(within(seite).getByText('45:00 Std., gleich wie bisher')).toBeInTheDocument();
    // Der Grund geht an die Praxisleitung (ANN-590).
    expect(within(seite).getByText('Dienstags hole ich die Kinder später ab.')).toBeInTheDocument();
    expect(within(seite).getByText('2 Termine außerhalb der neuen Zeiten')).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);

    await user.click(within(seite).getByRole('button', { name: 'Genehmigen' }));
    expect(decideRequest).toHaveBeenCalledWith({
      requestId: 'antrag-1',
      approve: true,
      note: null,
    });
    const fertig = await screen.findByRole('dialog', { name: 'Genehmigt' });
    expect(
      within(fertig).getByText(
        'Arbeitszeit von Anna Beispiel ist geändert: Wochenplan ab Dienstag, 1. Dezember.',
      ),
    ).toBeInTheDocument();
    const umplanen = within(fertig).getByRole('link', { name: /Dienstag, 1. Dezember/ });
    expect(umplanen.getAttribute('href')).toContain(
      '/kalender/tag-umplanen?person=55555555-5555-4555-8555-000000000002&datum=2026-12-01',
    );
  });

  it('lehnt nur mit Grund ab', async () => {
    const user = userEvent.setup();
    decideRequest.mockResolvedValue({ status: 'rejected', appointment_days: [] });
    rendern();
    const seite = await screen.findByRole('dialog', { name: 'Änderung genehmigen?' });
    await user.click(within(seite).getByRole('button', { name: 'Ablehnen' }));
    const grund = await screen.findByRole('dialog', { name: 'Warum nicht?' });
    const knopf = within(grund).getByRole('button', { name: 'Ablehnen' });
    expect(knopf).toBeDisabled();
    await user.type(
      within(grund).getByLabelText('Grund – Anna Beispiel sieht ihn'),
      'Dienstags fehlt sonst die Spätschicht',
    );
    await user.click(knopf);
    expect(decideRequest).toHaveBeenCalledWith({
      requestId: 'antrag-1',
      approve: false,
      note: 'Dienstags fehlt sonst die Spätschicht',
    });
    expect(await screen.findByRole('dialog', { name: 'Abgelehnt' })).toBeInTheDocument();
  });

  it('sagt, wenn nichts mehr zu entscheiden ist', async () => {
    fetchWorkingTime.mockResolvedValue(testWorkingTime({ can_decide: true, to_decide: [] }));
    rendern();
    expect(await screen.findByText('Kein offener Antrag')).toBeInTheDocument();
  });
});
