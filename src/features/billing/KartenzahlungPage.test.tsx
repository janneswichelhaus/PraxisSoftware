import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as BillingApi from './api';
import type * as TerminalApi from './kartenterminal-api';
import { renderWithProviders } from '@/test-utils';

const PERSON = '66666666-6666-4666-8666-000000000002';
const ZURUECK = '/kalender?termin=aaaaaaaa-aaaa-4aaa-8aaa-000000000002';

const fetchRechnungenDerAkte = vi.fn();
const kassiereMitKarte = vi.fn();
const bucheKartenzahlungNach = vi.fn();

interface Terminalabfrage {
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  data: TerminalApi.Kartenterminal | undefined;
  refetch: () => void;
}
function terminalMit(teil: Partial<Terminalabfrage>): Terminalabfrage {
  return {
    isPending: false,
    isError: false,
    isFetching: false,
    data: { verfuegbar: true, nachbildung: true },
    refetch: () => undefined,
    ...teil,
  };
}
let terminal = terminalMit({});

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof BillingApi>()),
  fetchRechnungenDerAkte: (id: string) =>
    fetchRechnungenDerAkte(id) as Promise<BillingApi.RechnungDerAkte[]>,
}));
vi.mock('./kartenterminal-api', async (importOriginal) => ({
  ...(await importOriginal<typeof TerminalApi>()),
  useKartenterminal: () => terminal,
  kassiereMitKarte: (id: string, cent: number) =>
    kassiereMitKarte(id, cent) as Promise<TerminalApi.Kassierergebnis>,
  bucheKartenzahlungNach: (id: string, cent: number, transaktion: string) =>
    bucheKartenzahlungNach(id, cent, transaktion) as Promise<boolean>,
}));

const { KartenzahlungPage } = await import('./KartenzahlungPage');
const { offeneRechnungen } = await import('./offeneRechnungen');

function rechnung(teil: Partial<BillingApi.RechnungDerAkte> = {}): BillingApi.RechnungDerAkte {
  return {
    id: 'r1',
    status: 'issued',
    invoice_number: 'RG-2026-0012',
    period_month: '2026-10-01',
    issued_on: '2026-10-31',
    due_on: '2026-11-14',
    total_cents: 14000,
    paid_cents: 0,
    outstanding_cents: 14000,
    currency: 'EUR',
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    reminder_due: false,
    last_reminder_on: null,
    treatment_basis_id: null,
    ...teil,
  };
}

function oeffnen() {
  return renderWithProviders(
    <Routes>
      <Route path="/abrechnung/kartenzahlung/:patientId" element={<KartenzahlungPage />} />
    </Routes>,
    `/abrechnung/kartenzahlung/${PERSON}?zurueck=${encodeURIComponent(ZURUECK)}`,
  );
}

describe('Mit Karte zahlen (ANN-837)', () => {
  beforeEach(() => {
    fetchRechnungenDerAkte.mockReset();
    kassiereMitKarte.mockReset();
    bucheKartenzahlungNach.mockReset();
    terminal = terminalMit({});
  });

  it('nimmt nur ausgestellte, nicht stornierte Rechnungen mit offenem Betrag, die älteste zuerst', () => {
    expect(
      offeneRechnungen([
        rechnung({ id: 'neu', issued_on: '2026-11-01' }),
        rechnung({ id: 'alt', issued_on: '2026-09-30' }),
        rechnung({ id: 'bezahlt', outstanding_cents: 0 }),
        rechnung({ id: 'storniert', cancelled: true }),
        rechnung({ id: 'entwurf', status: 'draft', invoice_number: null, issued_on: null }),
      ]).map((r) => r.id),
    ).toEqual(['alt', 'neu']);
  });

  it('kassiert die eine offene Rechnung mit dem offenen Betrag in zwei Tipps', async () => {
    const nutzer = userEvent.setup();
    // Nach dem Buchen lädt die Liste neu und hat nichts Offenes mehr; die Bestätigung bleibt.
    fetchRechnungenDerAkte
      .mockResolvedValueOnce([rechnung()])
      .mockResolvedValue([rechnung({ paid_cents: 14000, outstanding_cents: 0 })]);
    kassiereMitKarte.mockResolvedValue({ ok: true, transaktion: 'mock-1', nachbildung: true });
    oeffnen();

    expect(await screen.findByText('RG-2026-0012')).toBeInTheDocument();
    expect(screen.getByText('vom 31.10.2026')).toBeInTheDocument();
    expect(screen.getByText('Nachbildung ohne Terminal: Es fließt kein Geld.')).toBeInTheDocument();
    expect(screen.queryByText(/13 Cent/)).toBeNull();
    expect(screen.getByLabelText('Betrag')).toHaveValue('140,00');
    await nutzer.click(screen.getByRole('button', { name: 'Am Terminal zahlen' }));

    expect(kassiereMitKarte).toHaveBeenCalledWith('r1', 14000);
    expect(await screen.findByText('140,00 € mit Karte bezahlt und gebucht.')).toBeInTheDocument();
    expect(screen.getByText('Nachbildung ohne Terminal: Es floss kein Geld.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nächste Rechnung kassieren' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fertig' })).toHaveAttribute('href', ZURUECK);
    await waitFor(() => expect(fetchRechnungenDerAkte).toHaveBeenCalledTimes(2));
    expect(screen.getByText('140,00 € mit Karte bezahlt und gebucht.')).toBeInTheDocument();
    expect(screen.queryByText('Keine offene Rechnung')).toBeNull();
    expect(fetchRechnungenDerAkte).toHaveBeenCalledWith(PERSON);
  });

  it('lässt bei mehreren Rechnungen wählen und belegt dann den Betrag vor', async () => {
    const nutzer = userEvent.setup();
    fetchRechnungenDerAkte.mockResolvedValue([
      rechnung(),
      rechnung({
        id: 'r2',
        invoice_number: 'RG-2026-0013',
        outstanding_cents: 9000,
        issued_on: '2026-11-01',
      }),
    ]);
    oeffnen();

    const knopf = await screen.findByRole('button', { name: 'Am Terminal zahlen' });
    expect(knopf).toBeDisabled();
    expect(screen.getByText('Welche Rechnung?')).toBeVisible();
    // Der Betrag steht mit geschütztem Leerzeichen vor dem Euro.
    await nutzer.click(
      screen.getByRole('radio', { name: /^RG-2026-0013 · vom 01\.11\.2026 · 90,00\s€ offen$/ }),
    );
    expect(screen.getByLabelText('Betrag')).toHaveValue('90,00');
    expect(knopf).toBeEnabled();
  });

  it('nimmt am Terminal nie mehr als offen', async () => {
    const nutzer = userEvent.setup();
    fetchRechnungenDerAkte.mockResolvedValue([rechnung()]);
    oeffnen();

    const betrag = await screen.findByLabelText('Betrag');
    await nutzer.clear(betrag);
    await nutzer.type(betrag, '150,00');
    await nutzer.click(screen.getByRole('button', { name: 'Am Terminal zahlen' }));
    expect(betrag).toHaveAccessibleDescription(/^Höchstens 140,00\s€\.$/);
    expect(kassiereMitKarte).not.toHaveBeenCalled();
  });

  it('sagt bei Ablehnung, dass nichts gebucht ist, und lässt es erneut versuchen', async () => {
    const nutzer = userEvent.setup();
    fetchRechnungenDerAkte.mockResolvedValue([rechnung()]);
    kassiereMitKarte.mockResolvedValue({
      ok: false,
      art: 'nichts_gebucht',
      satz: 'Die Karte wurde abgelehnt. Nichts gebucht.',
    });
    oeffnen();

    await nutzer.click(await screen.findByRole('button', { name: 'Am Terminal zahlen' }));
    expect(
      await screen.findByText('Die Karte wurde abgelehnt. Nichts gebucht.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Am Terminal zahlen' })).toBeEnabled();
  });

  it('bucht nach einer Abbuchung ohne Buchung nur nach, mit derselben Kennung, und kassiert nicht neu', async () => {
    const nutzer = userEvent.setup();
    fetchRechnungenDerAkte.mockResolvedValue([rechnung()]);
    kassiereMitKarte.mockResolvedValue({
      ok: false,
      art: 'nicht_gebucht',
      satz: 'Am Terminal bezahlt, aber nicht gebucht.',
      transaktion: 'mock-9',
    });
    bucheKartenzahlungNach.mockResolvedValue(true);
    oeffnen();

    await nutzer.click(await screen.findByRole('button', { name: 'Am Terminal zahlen' }));
    expect(await screen.findByText(/Kennung am Terminal: mock-9\./)).toBeInTheDocument();
    expect(screen.getByLabelText('Betrag')).toBeDisabled();
    await nutzer.click(screen.getByRole('button', { name: 'Buchung wiederholen' }));

    expect(bucheKartenzahlungNach).toHaveBeenCalledWith('r1', 14000, 'mock-9');
    expect(kassiereMitKarte).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('140,00 € mit Karte bezahlt und gebucht.')).toBeInTheDocument();
  });

  it('verlangt bei unklarem Ausgang ein ausdrückliches „nicht bezahlt“ und lädt die Rechnung neu', async () => {
    const nutzer = userEvent.setup();
    fetchRechnungenDerAkte.mockResolvedValue([rechnung()]);
    kassiereMitKarte.mockResolvedValue({
      ok: false,
      art: 'unklar',
      satz: 'Unklar, ob bezahlt wurde. Bitte am Terminal nachsehen, bevor Sie es erneut versuchen.',
    });
    oeffnen();

    await nutzer.click(await screen.findByRole('button', { name: 'Am Terminal zahlen' }));
    expect(await screen.findByText(/Unklar, ob bezahlt wurde/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nicht bezahlt, erneut zahlen' })).toBeEnabled();
    await waitFor(() => expect(fetchRechnungenDerAkte).toHaveBeenCalledTimes(2));
  });

  it('bietet nach dem Buchen die nächste offene Rechnung an', async () => {
    const nutzer = userEvent.setup();
    const zweite = rechnung({ id: 'r2', invoice_number: 'RG-2026-0013', issued_on: '2026-11-01' });
    fetchRechnungenDerAkte.mockResolvedValueOnce([rechnung(), zweite]).mockResolvedValue([zweite]);
    kassiereMitKarte.mockResolvedValue({ ok: true, transaktion: 'mock-1', nachbildung: false });
    oeffnen();

    await nutzer.click(await screen.findByRole('radio', { name: /^RG-2026-0012/ }));
    await nutzer.click(screen.getByRole('button', { name: 'Am Terminal zahlen' }));
    expect(await screen.findByText('140,00 € mit Karte bezahlt und gebucht.')).toBeInTheDocument();
    expect(screen.queryByText(/Nachbildung/)).toBeNull();
    await nutzer.click(await screen.findByRole('button', { name: 'Nächste Rechnung kassieren' }));
    expect(await screen.findByText('RG-2026-0013')).toBeInTheDocument();
    expect(screen.getByLabelText('Betrag')).toHaveValue('140,00');
  });

  it('sagt, wenn nichts offen ist oder die Kartenzahlung hier nicht eingerichtet ist', async () => {
    fetchRechnungenDerAkte.mockResolvedValue([rechnung({ outstanding_cents: 0 })]);
    const { unmount } = oeffnen();
    expect(await screen.findByText('Keine offene Rechnung')).toBeInTheDocument();
    unmount();

    fetchRechnungenDerAkte.mockClear();
    terminal = terminalMit({ data: { verfuegbar: false, nachbildung: false } });
    const ohne = oeffnen();
    expect(
      await screen.findByText('Die Kartenzahlung ist hier nicht eingerichtet.'),
    ).toBeInTheDocument();
    ohne.unmount();

    // Ein Ausfall ist kein „nicht eingerichtet“: Er sagt es und lässt erneut fragen.
    terminal = terminalMit({ isError: true, data: undefined });
    oeffnen();
    expect(
      await screen.findByText('Das Terminal konnte nicht gefragt werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    await waitFor(() => expect(fetchRechnungenDerAkte).not.toHaveBeenCalled());
  });
});
