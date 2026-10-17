import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { testUser } from '@/test-utils';
import type * as VacationApi from './api';
import { STAFF, testFremdesKonto, testKonto, testUrlaub } from './testdaten';

/**
 * Urlaubsanspruch eintragen (URL-001): nur owner, Tage und Übertrag je Jahr.
 * Verbindlich prüft der Server (`app.can_manage_staff_employment`).
 */

const fetchUrlaub = vi.fn();
const setLeaveEntitlement = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof VacationApi>();
  return {
    ...actual,
    fetchUrlaub: (...a: unknown[]) => fetchUrlaub(...a) as unknown,
    setLeaveEntitlement: (...a: unknown[]) => setLeaveEntitlement(...a) as unknown,
  };
});

const { AnspruchPage } = await import('./AnspruchPage');

function Ziel() {
  const zustand = useLocation().state as { meldung?: string } | null;
  return <p>Zurück: {zustand?.meldung}</p>;
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['owner']) {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/urlaub/anspruch/:staffMemberId',
        element: <AnspruchPage user={testUser(rollen, 'Jannes Test')} />,
      },
      { path: '/betrieb/urlaub', element: <Ziel /> },
    ],
    { initialEntries: [`/betrieb/urlaub/anspruch/${STAFF.anna}`] },
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
      my_staff_member_id: STAFF.jannes,
      can_decide: true,
      can_manage_entitlements: true,
      balances: [testFremdesKonto()],
    }),
  );
  setLeaveEntitlement.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AnspruchPage', () => {
  it('trägt Tage und Übertrag für das gewählte Jahr ein', async () => {
    const user = userEvent.setup();
    rendern();
    const tage = await screen.findByLabelText('Urlaubstage im Jahr');
    expect(tage).toHaveValue('30');
    await user.clear(tage);
    await user.type(tage, '28');
    const uebertrag = screen.getByLabelText('Übertrag aus dem Vorjahr');
    await user.clear(uebertrag);
    await user.type(uebertrag, '2');
    await user.click(screen.getByRole('button', { name: 'Anspruch speichern' }));
    expect(setLeaveEntitlement).toHaveBeenCalledWith({
      staffMemberId: STAFF.anna,
      jahr: 2026,
      tage: 28,
      uebertrag: 2,
    });
    expect(
      await screen.findByText(
        'Zurück: Urlaubsanspruch 2026 für Anna Beispiel: 28 Tage und 2 Übertrag.',
      ),
    ).toBeInTheDocument();
  });

  it('belegt das nächste Jahr mit dem schon eingetragenen Anspruch vor', async () => {
    const user = userEvent.setup();
    fetchUrlaub.mockResolvedValue(
      testUrlaub({
        my_staff_member_id: STAFF.jannes,
        can_decide: true,
        can_manage_entitlements: true,
        balances: [
          testFremdesKonto({
            next_balance: testKonto({ year: 2027, entitlement: 28, carryover: 3, approved: 0 }),
          }),
        ],
      }),
    );
    rendern();
    await screen.findByLabelText('Urlaubstage im Jahr');
    await user.click(screen.getByRole('button', { name: '2027' }));
    expect(screen.getByLabelText('Urlaubstage im Jahr')).toHaveValue('28');
    expect(screen.getByLabelText('Übertrag aus dem Vorjahr')).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: '2026' }));
    expect(screen.getByLabelText('Urlaubstage im Jahr')).toHaveValue('30');
  });

  it('prüft jedes Feld für sich und nennt die Fehler beim Speichern', async () => {
    const user = userEvent.setup();
    rendern();
    await screen.findByLabelText('Urlaubstage im Jahr');
    await user.click(screen.getByRole('button', { name: '2027' }));
    expect(screen.getByLabelText('Urlaubstage im Jahr')).toHaveValue('');
    await user.type(screen.getByLabelText('Übertrag aus dem Vorjahr'), '70');
    await user.click(screen.getByRole('button', { name: 'Anspruch speichern' }));
    const zusammenfassung = screen.getByRole('alert');
    expect(zusammenfassung).toHaveTextContent('Urlaubstage im Jahr: Bitte die Tage angeben.');
    expect(zusammenfassung).toHaveTextContent(
      'Übertrag aus dem Vorjahr: Bitte zwischen 0 und 60 Tagen.',
    );
    // Der Fehler steht am Feld, das ihn hat.
    expect(screen.getByLabelText('Übertrag aus dem Vorjahr')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(setLeaveEntitlement).not.toHaveBeenCalled();
  });

  it('sagt anderen Rollen, dass owner den Anspruch einträgt', async () => {
    fetchUrlaub.mockResolvedValue(testUrlaub());
    rendern(['therapist']);
    expect(await screen.findByText('Nicht verfügbar')).toBeInTheDocument();
    expect(screen.queryByLabelText('Urlaubstage im Jahr')).toBeNull();
  });
});
