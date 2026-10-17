import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter, useLocation } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as TimeAccountApi from './api';
import { PREVIEW_ERROR } from './api';
import { TIM, testPreview, testTimeAccount } from './testdata';

/**
 * Ins Zeitkonto eintragen, geführt (G9, ZK-001): Budget ≤ 6 Tipps - Mehrarbeit
 * von heute mit Schnellwahl 5 (mit dem Einstieg), Freizeitausgleich am Plan
 * des Tages ebenso. Was nicht geht, sagt die Vorschau des Servers vor dem
 * Eintragen (ANN-593).
 */

const fetchTimeAccount = vi.fn();
const previewEntry = vi.fn();
const recordEntry = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TimeAccountApi>();
  return {
    ...actual,
    fetchTimeAccount: (...a: unknown[]) => fetchTimeAccount(...a) as unknown,
    previewEntry: (...a: unknown[]) => previewEntry(...a) as unknown,
    recordEntry: (...a: unknown[]) => recordEntry(...a) as unknown,
  };
});

const { RecordTimeAccountPage } = await import('./RecordTimeAccountPage');

function Ziel() {
  const ort = useLocation();
  const zustand = ort.state as { meldung?: string } | null;
  return (
    <p>
      Ziel {ort.pathname}
      {ort.search}: {zustand?.meldung ?? ''}
    </p>
  );
}

function rendern(rollen: Parameters<typeof testUser>[0] = ['therapist'], suche = '') {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/zeitkonto/eintragen',
        element: <RecordTimeAccountPage user={testUser(rollen)} />,
      },
      { path: '*', element: <Ziel /> },
    ],
    { initialEntries: [`/betrieb/zeitkonto/eintragen${suche}`] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function tag(fenster: HTMLElement, name: string) {
  return within(fenster).getByRole('button', { name: (n) => n.startsWith(name) });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
  fetchTimeAccount.mockReset().mockResolvedValue(testTimeAccount());
  previewEntry
    .mockReset()
    .mockImplementation((input: { von: string | null; kind: string }) =>
      Promise.resolve(
        input.von === null
          ? testPreview()
          : input.kind === 'time_off'
            ? testPreview({ minutes: -120, balance_after: -30, appointments: 2 })
            : testPreview({ minutes: 45, balance_after: 135 }),
      ),
    );
  recordEntry
    .mockReset()
    .mockResolvedValue({ id: 'neu-1', minutes: 45, balance_minutes: 135, appointments: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RecordTimeAccountPage', () => {
  it('trägt Mehrarbeit von heute in vier Tipps ein - mit dem Einstieg fünf', async () => {
    const nutzer = userEvent.setup();
    rendern();
    let tipps = 0;
    const tippe = async (ziel: HTMLElement) => {
      tipps += 1;
      await nutzer.click(ziel);
    };

    const art = await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' });
    expect(within(art).getByText(/jetzt \+1:30/)).toBeInTheDocument();
    // Eine Korrektur im eigenen Konto bucht nur owner.
    expect(within(art).queryByRole('button', { name: 'Korrektur' })).toBeNull();
    await tippe(within(art).getByRole('button', { name: 'Mehrarbeit' }));

    const datum = screen.getByRole('dialog', { name: 'An welchem Tag?' });
    // Mehrarbeit nie im Voraus: morgen ist gesperrt.
    expect(tag(datum, 'Samstag, 17. Oktober 2026')).toBeDisabled();
    await tippe(within(datum).getByRole('button', { name: 'Heute' }));

    const zeiten = await screen.findByRole('dialog', { name: 'Von wann bis wann?' });
    await tippe(await within(zeiten).findByRole('button', { name: '+0:45: 18:00–18:45' }));

    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(await within(abschluss).findByText('Saldo danach +2:15 Std.')).toBeInTheDocument();
    expect(within(abschluss).getByText(/18:00–18:45 · \+0:45/)).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    await tippe(within(abschluss).getByRole('button', { name: 'Eintragen' }));

    expect(recordEntry).toHaveBeenCalledWith({
      staffMemberId: null,
      kind: 'overtime',
      onDate: '2026-10-16',
      von: '18:00',
      bis: '18:45',
      minutes: null,
      note: null,
    });
    expect(
      await screen.findByText(/^Ziel \/betrieb\/zeitkonto: Eingetragen: Mehrarbeit/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Saldo \+2:15/)).toBeInTheDocument();
    expect(tipps).toBe(4);
  });

  it('ein Fehler der Vorschau ist nie „keine Termine“ - mit „Erneut versuchen“ (Regel 8)', async () => {
    const nutzer = userEvent.setup();
    let fehler = true;
    previewEntry.mockImplementation((input: { von: string | null }) => {
      if (input.von !== null && fehler) {
        fehler = false;
        return Promise.reject(new Error(PREVIEW_ERROR));
      }
      return Promise.resolve(
        input.von === null
          ? testPreview()
          : testPreview({ minutes: -120, balance_after: -30, appointments: 0 }),
      );
    });
    rendern();
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' })).getByRole(
        'button',
        { name: 'Freizeitausgleich' },
      ),
    );
    await nutzer.click(
      tag(screen.getByRole('dialog', { name: 'An welchem Tag?' }), 'Dienstag, 20. Oktober 2026'),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Welche Zeit nehmen Sie frei?' });
    await nutzer.click(
      await within(zeiten).findByRole('button', { name: /^2 Std\. früher gehen/ }),
    );

    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(await within(abschluss).findByText(PREVIEW_ERROR)).toBeInTheDocument();
    expect(within(abschluss).queryByText(/Keine Termine/)).toBeNull();
    expect(within(abschluss).queryByText(/^Saldo danach/)).toBeNull();
    expect(within(abschluss).getByRole('button', { name: 'Eintragen' })).toBeDisabled();
    await nutzer.click(within(abschluss).getByRole('button', { name: 'Erneut versuchen' }));
    expect(
      await within(abschluss).findByText('Keine Termine in der freien Zeit'),
    ).toBeInTheDocument();
    expect(within(abschluss).getByText('Saldo danach −0:30 Std.')).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Eintragen' })).toBeEnabled();
  });

  it('nimmt Freizeitausgleich am Plan des Tages und nennt danach die Termine darin', async () => {
    const nutzer = userEvent.setup();
    recordEntry.mockResolvedValue({
      id: 'neu-2',
      minutes: -120,
      balance_minutes: -30,
      appointments: 2,
    });
    rendern();
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' })).getByRole(
        'button',
        { name: 'Freizeitausgleich' },
      ),
    );
    const datum = screen.getByRole('dialog', { name: 'An welchem Tag?' });
    await nutzer.click(tag(datum, 'Freitag, 23. Oktober 2026'));
    const zeiten = await screen.findByRole('dialog', { name: 'Welche Zeit nehmen Sie frei?' });
    expect(within(zeiten).getByText(/Plan: 08:00–12:00, 13:00–18:00/)).toBeInTheDocument();
    await nutzer.click(
      await within(zeiten).findByRole('button', { name: '2 Std. früher gehen: 16:00–18:00' }),
    );
    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(await within(abschluss).findByText('2 Termine in der freien Zeit')).toBeInTheDocument();
    expect(within(abschluss).getByText('Saldo danach −0:30 Std.')).toBeInTheDocument();
    await nutzer.click(within(abschluss).getByRole('button', { name: 'Eintragen' }));

    expect(recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'time_off',
        onDate: '2026-10-23',
        von: '16:00',
        bis: '18:00',
      }),
    );
    const fertig = await screen.findByRole('dialog', { name: 'Eingetragen' });
    expect(within(fertig).getByRole('heading', { name: /^Termine umplanen/ })).toBeInTheDocument();
  });

  it('sperrt das Eintragen, wenn der Server einen Grund nennt', async () => {
    const nutzer = userEvent.setup();
    previewEntry.mockImplementation((input: { von: string | null }) =>
      Promise.resolve(
        input.von === null
          ? testPreview()
          : testPreview({ minutes: 60, balance_after: 150, problems: ['overlaps_working_hours'] }),
      ),
    );
    rendern();
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' })).getByRole(
        'button',
        { name: 'Mehrarbeit' },
      ),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Gestern',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Von wann bis wann?' });
    fireEvent.change(within(zeiten).getByLabelText('Beginn'), { target: { value: '17:00' } });
    fireEvent.change(within(zeiten).getByLabelText('Ende'), { target: { value: '18:00' } });
    await nutzer.click(within(zeiten).getByRole('button', { name: 'Weiter' }));
    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(await within(abschluss).findByText(/außerhalb Ihrer Arbeitszeit/)).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Eintragen' })).toBeDisabled();
    expect(recordEntry).not.toHaveBeenCalled();
  });

  it('bietet für eine andere Person vor heute keine Schnellwahl - der Server nennt keinen Plan', async () => {
    const nutzer = userEvent.setup();
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        my_staff_member_id: '55555555-5555-4555-8555-000000000003',
        can_book_others: true,
        account: { staff_member_id: TIM, name: 'Tim Teamleitung', balance_minutes: 0, entries: [] },
      }),
    );
    previewEntry.mockResolvedValue(testPreview({ day: { kind: 'plan', blocks: null } }));
    rendern(['office'], `?person=${TIM}`);
    await nutzer.click(
      within(
        await screen.findByRole('dialog', { name: 'Was tragen Sie für Tim Teamleitung ein?' }),
      ).getByRole('button', { name: 'Mehrarbeit' }),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Gestern',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Von wann bis wann?' });
    expect(previewEntry).toHaveBeenCalledWith(
      expect.objectContaining({ staffMemberId: TIM, onDate: '2026-10-15', von: null }),
    );
    expect(await within(zeiten).findByText('Do., 15. Okt.')).toBeInTheDocument();
    expect(within(zeiten).queryByRole('group', { name: 'Schnellwahl' })).toBeNull();
    expect(within(zeiten).queryByText(/Plan:/)).toBeNull();
    expect(within(zeiten).getByLabelText('Beginn')).toBeInTheDocument();
  });

  it('lässt das Büro für eine andere Person eine Korrektur mit Grund buchen', async () => {
    const nutzer = userEvent.setup();
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        my_staff_member_id: '55555555-5555-4555-8555-000000000003',
        can_book_others: true,
        account: { staff_member_id: TIM, name: 'Tim Teamleitung', balance_minutes: 0, entries: [] },
      }),
    );
    previewEntry.mockResolvedValue(testPreview({ minutes: 750, balance_after: 750 }));
    recordEntry.mockResolvedValue({
      id: 'neu-3',
      minutes: 750,
      balance_minutes: 750,
      appointments: 0,
    });
    rendern(['office'], `?person=${TIM}`);

    const art = await screen.findByRole('dialog', {
      name: 'Was tragen Sie für Tim Teamleitung ein?',
    });
    await nutzer.click(within(art).getByRole('button', { name: 'Korrektur' }));
    const stunden = screen.getByRole('dialog', { name: 'Wie viele Stunden?' });
    const weiter = within(stunden).getByRole('button', { name: 'Weiter' });
    await nutzer.type(within(stunden).getByLabelText(/^Stunden/), '12:30');
    // Ohne Grund geht es nicht weiter.
    expect(weiter).toBeDisabled();
    await nutzer.type(within(stunden).getByLabelText(/^Grund/), 'Übertrag aus der Stundenliste');
    await nutzer.click(weiter);
    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(within(abschluss).getByText('+12:30 Std.')).toBeInTheDocument();
    await nutzer.click(await within(abschluss).findByRole('button', { name: 'Eintragen' }));
    expect(recordEntry).toHaveBeenCalledWith({
      staffMemberId: TIM,
      kind: 'correction',
      onDate: '2026-10-16',
      von: null,
      bis: null,
      minutes: 750,
      note: 'Übertrag aus der Stundenliste',
    });
    expect(
      await screen.findByText((text) => text.startsWith(`Ziel /betrieb/zeitkonto?person=${TIM}`)),
    ).toBeInTheDocument();
  });
});
