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
 * Ins Zeitkonto eintragen, geführt (G9, ZK-001): Budget ≤ 6 Tipps -
 * Überstunden von heute ab Dienstende 5 (mit dem Einstieg; jede andere Dauer
 * ein Zug am Regler mehr, ANN-606), Freizeitausgleich am Plan des Tages
 * ebenso. Was nicht geht, sagt die Vorschau des Servers vor dem Eintragen
 * (ANN-593).
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
            : testPreview({ minutes: 30, balance_after: 120 }),
      ),
    );
  recordEntry
    .mockReset()
    .mockResolvedValue({ id: 'neu-1', minutes: 30, balance_minutes: 120, appointments: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RecordTimeAccountPage', () => {
  it('trägt Überstunden von heute ab Dienstende in vier Tipps ein - mit dem Einstieg fünf', async () => {
    const nutzer = userEvent.setup();
    rendern();
    let tipps = 0;
    const tippe = async (ziel: HTMLElement) => {
      tipps += 1;
      await nutzer.click(ziel);
    };

    const art = await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' });
    // Je Seite eine Frage, kein Erklärsatz (Design-Review Überholung 9).
    expect(within(art).getByText('Schritt 1 von 4')).toBeInTheDocument();
    expect(within(art).queryByText(/gilt sofort/)).toBeNull();
    // Minusstunden im eigenen Konto bucht nur owner.
    expect(within(art).queryByRole('button', { name: 'Minusstunden' })).toBeNull();
    expect(within(art).queryByRole('button', { name: 'Mehrarbeit' })).toBeNull();
    await tippe(within(art).getByRole('button', { name: 'Überstunden' }));

    const datum = screen.getByRole('dialog', { name: 'An welchem Tag?' });
    // Überstunden nie im Voraus: morgen ist gesperrt.
    expect(tag(datum, 'Samstag, 17. Oktober 2026')).toBeDisabled();
    await tippe(within(datum).getByRole('button', { name: 'Heute' }));

    const zeiten = await screen.findByRole('dialog', { name: 'Wie lange?' });
    // Beginn am Dienstende, die Dauer am Regler (30 min vorgestellt), das
    // Ende darunter (ANN-606).
    expect(await within(zeiten).findByLabelText('Beginn')).toHaveValue('18:00');
    const regler = within(zeiten).getByRole('slider', { name: 'Dauer' });
    expect(regler).toHaveAttribute('aria-valuetext', '30 Minuten');
    expect(within(zeiten).getByText('18:00–18:30')).toBeInTheDocument();
    expect(within(zeiten).queryByLabelText('Ende')).toBeNull();
    await tippe(within(zeiten).getByRole('button', { name: 'Weiter' }));

    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(await within(abschluss).findByText('Saldo danach +2:00 Std.')).toBeInTheDocument();
    expect(within(abschluss).getByText('Der Eintrag gilt sofort.')).toBeInTheDocument();
    expect(within(abschluss).getByText(/18:00–18:30 · \+0:30/)).toBeInTheDocument();
    await pruefeBarrierefreiheit(document.body);
    await tippe(within(abschluss).getByRole('button', { name: 'Eintragen' }));

    expect(recordEntry).toHaveBeenCalledWith({
      staffMemberId: null,
      kind: 'overtime',
      onDate: '2026-10-16',
      von: '18:00',
      bis: '18:30',
      minutes: null,
      note: null,
    });
    expect(
      await screen.findByText(/^Ziel \/betrieb\/zeitkonto: Eingetragen: Überstunden/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Saldo \+2:00/)).toBeInTheDocument();
    expect(tipps).toBe(4);
  });

  it('stellt die Dauer am Regler, den Beginn von Hand - das Ende folgt (ANN-606)', async () => {
    const nutzer = userEvent.setup();
    rendern();
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' })).getByRole(
        'button',
        { name: 'Überstunden' },
      ),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Gestern',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Wie lange?' });
    const beginn = await within(zeiten).findByLabelText('Beginn');
    const regler = within(zeiten).getByRole('slider', { name: 'Dauer' });
    // Ein Zug: 1 h 15 min - Minuten und Stunden ohne Umschalten.
    fireEvent.change(regler, { target: { value: '12' } });
    expect(within(zeiten).getByText('18:00–19:15')).toBeInTheDocument();
    await nutzer.click(within(zeiten).getByRole('button', { name: '5 Minuten mehr' }));
    expect(within(zeiten).getByText('18:00–19:20')).toBeInTheDocument();
    fireEvent.change(beginn, { target: { value: '06:30' } });
    expect(within(zeiten).getByText('06:30–07:50')).toBeInTheDocument();
    // Nie über Mitternacht: ab 23:00 reicht der Regler eine Stunde.
    fireEvent.change(beginn, { target: { value: '23:00' } });
    expect(within(zeiten).getByText('23:00–24:00')).toBeInTheDocument();
    expect(regler).toHaveAttribute('aria-valuetext', '1 Stunde');
    fireEvent.change(beginn, { target: { value: '17:00' } });
    await nutzer.click(within(zeiten).getByRole('button', { name: 'Weiter' }));
    await nutzer.click(
      await within(screen.getByRole('dialog', { name: 'Eintragen?' })).findByRole('button', {
        name: 'Eintragen',
      }),
    );
    expect(recordEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'overtime',
        onDate: '2026-10-15',
        von: '17:00',
        bis: '18:20',
        minutes: null,
      }),
    );
  });

  it('beginnt Überstunden an einem freien Tag um 08:00', async () => {
    const nutzer = userEvent.setup();
    previewEntry.mockResolvedValue(testPreview({ day: { kind: 'plan', blocks: [] } }));
    rendern();
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' })).getByRole(
        'button',
        { name: 'Überstunden' },
      ),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Heute',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Wie lange?' });
    expect(await within(zeiten).findByLabelText('Beginn')).toHaveValue('08:00');
    expect(within(zeiten).getByText('08:00–08:30')).toBeInTheDocument();
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

  it('lädt den Tag nach einem Funkloch mit „Erneut versuchen“ (Regel 8, Design-Review Überholung 9)', async () => {
    const nutzer = userEvent.setup();
    let fehler = true;
    previewEntry.mockImplementation(() => {
      if (fehler) {
        fehler = false;
        return Promise.reject(new Error(PREVIEW_ERROR));
      }
      return Promise.resolve(testPreview());
    });
    rendern();
    await nutzer.click(
      within(await screen.findByRole('dialog', { name: 'Was tragen Sie ein?' })).getByRole(
        'button',
        { name: 'Überstunden' },
      ),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Heute',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Wie lange?' });
    expect(
      await within(zeiten).findByText('Der Tag konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeDisabled();
    await nutzer.click(within(zeiten).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await within(zeiten).findByLabelText('Beginn')).toHaveValue('18:00');
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeEnabled();
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
    expect(within(fertig).getByText('2 Termine in der freien Zeit')).toBeInTheDocument();
    // „Tag umplanen“ ist der nächste Schritt - Hauptknopf im Fuß, „Fertig“
    // leise; vorgewählt sind dort genau die Termine in der freien Zeit
    // (Praxis-Review Überholung 9, Runde 2).
    const umplanen = within(fertig).getByRole('link', { name: 'Tag umplanen' });
    expect(umplanen.getAttribute('href')).toContain('&zeiten=00:00-16:00,18:00-23:59');
    expect(within(fertig).getByRole('button', { name: 'Fertig' })).toBeInTheDocument();
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
        { name: 'Überstunden' },
      ),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Gestern',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Wie lange?' });
    fireEvent.change(await within(zeiten).findByLabelText('Beginn'), {
      target: { value: '17:00' },
    });
    fireEvent.change(within(zeiten).getByRole('slider', { name: 'Dauer' }), {
      target: { value: '11' },
    });
    await nutzer.click(within(zeiten).getByRole('button', { name: 'Weiter' }));
    const abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    // Der Grund, keine Bestätigung (Praxis-Review Überholung 9).
    expect(
      await within(abschluss).findByText(
        'Die Zeit liegt in der Arbeitszeit – Überstunden nur davor oder danach.',
      ),
    ).toBeInTheDocument();
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
      ).getByRole('button', { name: 'Überstunden' }),
    );
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'An welchem Tag?' })).getByRole('button', {
        name: 'Gestern',
      }),
    );
    const zeiten = await screen.findByRole('dialog', { name: 'Wie lange?' });
    expect(previewEntry).toHaveBeenCalledWith(
      expect.objectContaining({ staffMemberId: TIM, onDate: '2026-10-15', von: null }),
    );
    expect(await within(zeiten).findByText('Do., 15. Okt.')).toBeInTheDocument();
    expect(within(zeiten).queryByText(/Plan:/)).toBeNull();
    // Ohne Plan kein Beginn vorbelegt - von Hand, dann erst weiter.
    expect(within(zeiten).getByLabelText('Beginn')).toHaveValue('');
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeDisabled();
    fireEvent.change(within(zeiten).getByLabelText('Beginn'), { target: { value: '18:30' } });
    expect(within(zeiten).getByText('18:30–19:00')).toBeInTheDocument();
    expect(within(zeiten).getByRole('button', { name: 'Weiter' })).toBeEnabled();
  });

  it('lässt das Büro für eine andere Person Minusstunden mit Grund buchen - nur abziehen (ANN-606)', async () => {
    const nutzer = userEvent.setup();
    fetchTimeAccount.mockResolvedValue(
      testTimeAccount({
        my_staff_member_id: '55555555-5555-4555-8555-000000000003',
        can_book_others: true,
        account: { staff_member_id: TIM, name: 'Tim Teamleitung', balance_minutes: 0, entries: [] },
      }),
    );
    previewEntry.mockResolvedValue(testPreview({ minutes: -90, balance_after: -90 }));
    recordEntry.mockResolvedValue({
      id: 'neu-3',
      minutes: -90,
      balance_minutes: -90,
      appointments: 0,
    });
    rendern(['office'], `?person=${TIM}`);

    const art = await screen.findByRole('dialog', {
      name: 'Was tragen Sie für Tim Teamleitung ein?',
    });
    expect(within(art).queryByRole('button', { name: 'Korrektur' })).toBeNull();
    await nutzer.click(within(art).getByRole('button', { name: 'Minusstunden' }));
    // Dauer und Grund je auf einer Seite - vier Schritte wie jeder Weg
    // (Design-Review Überholung 9); die Dauer am Regler, ohne Vorzeichen.
    const stunden = screen.getByRole('dialog', { name: 'Wie viele Minusstunden?' });
    expect(within(stunden).getByText('Schritt 2 von 4')).toBeInTheDocument();
    const regler = within(stunden).getByRole('slider', { name: 'Minusstunden' });
    expect(regler).toHaveAttribute('aria-valuetext', '30 Minuten');
    expect(within(stunden).getByText('Saldo danach −0:30 Std.')).toBeInTheDocument();
    // 1 h 30 min: Viertelstunden über einer Stunde.
    fireEvent.change(regler, { target: { value: '13' } });
    expect(regler).toHaveAttribute('aria-valuetext', '1 Stunde 30 Minuten');
    expect(within(stunden).getByText('Saldo danach −1:30 Std.')).toBeInTheDocument();
    await nutzer.click(within(stunden).getByRole('button', { name: 'Weiter' }));
    const grund = screen.getByRole('dialog', { name: 'Warum die Minusstunden?' });
    expect(within(grund).getByText('Schritt 3 von 4')).toBeInTheDocument();
    // Ohne Grund geht es nicht weiter.
    const weiterGrund = within(grund).getByRole('button', { name: 'Weiter' });
    expect(weiterGrund).toBeDisabled();
    await nutzer.type(within(grund).getByLabelText('Grund'), 'Übertrag aus der Stundenliste');
    await nutzer.click(weiterGrund);
    let abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(within(abschluss).getByText('−1:30 Std.')).toBeInTheDocument();
    expect(within(abschluss).getByRole('button', { name: 'Grund ändern' })).toBeInTheDocument();
    // „Ändern“ an der Dauer führt mit Grund direkt zurück zum Abschluss
    // (Design-Review Überholung 9, Runde 2); der Regler steht noch.
    await nutzer.click(within(abschluss).getByRole('button', { name: 'Minusstunden ändern' }));
    const wieder = screen.getByRole('dialog', { name: 'Wie viele Minusstunden?' });
    expect(within(wieder).getByRole('slider', { name: 'Minusstunden' })).toHaveAttribute(
      'aria-valuetext',
      '1 Stunde 30 Minuten',
    );
    await nutzer.click(within(wieder).getByRole('button', { name: 'Weiter' }));
    abschluss = screen.getByRole('dialog', { name: 'Eintragen?' });
    expect(screen.queryByRole('dialog', { name: 'Warum die Minusstunden?' })).toBeNull();
    await nutzer.click(await within(abschluss).findByRole('button', { name: 'Eintragen' }));
    expect(recordEntry).toHaveBeenCalledWith({
      staffMemberId: TIM,
      kind: 'correction',
      onDate: '2026-10-16',
      von: null,
      bis: null,
      minutes: -90,
      note: 'Übertrag aus der Stundenliste',
    });
    expect(
      await screen.findByText((text) => text.startsWith(`Ziel /betrieb/zeitkonto?person=${TIM}`)),
    ).toBeInTheDocument();
  });
});
