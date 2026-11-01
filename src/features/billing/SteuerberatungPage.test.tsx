import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DatevApi from './datev-api';
import type { DatevBuchung, DatevLauf } from './datev';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchDatevEinstellungen = vi.fn();
const fetchDatevOffen = vi.fn();
const fetchDatevLaeufe = vi.fn();
const erstelleDatevLauf = vi.fn();
const fetchDatevLauf = vi.fn();

vi.mock('./datev-api', async (importOriginal) => {
  const actual = await importOriginal<typeof DatevApi>();
  return {
    ...actual,
    fetchDatevEinstellungen: () => fetchDatevEinstellungen() as Promise<unknown>,
    fetchDatevOffen: (...a: unknown[]) => fetchDatevOffen(...a) as Promise<DatevBuchung[]>,
    fetchDatevLaeufe: (...a: unknown[]) => fetchDatevLaeufe(...a) as Promise<unknown>,
    erstelleDatevLauf: (...a: unknown[]) => erstelleDatevLauf(...a) as Promise<string>,
    fetchDatevLauf: (...a: unknown[]) => fetchDatevLauf(...a) as Promise<DatevLauf>,
  };
});

const { SteuerberatungPage } = await import('./SteuerberatungPage');
const { belegdrucke, zusammenfassung } = await import('./datev');

const EINSTELLUNGEN = {
  consultant_number: 1001,
  client_number_therapy: 1,
  client_number_training: null,
  chart_of_accounts: 'SKR03',
};

function buchung(teil: Partial<DatevBuchung> = {}): DatevBuchung {
  return {
    kind: 'invoice',
    document_date: '2026-10-03',
    invoice_number: 'RG-2026-0101',
    document_number: null,
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    small_business: false,
    amount_cents: 14000,
    direction: null,
    method: null,
    currency: 'EUR',
    ...teil,
  };
}

function seite(rollen: Parameters<typeof testUser>[0] = ['office']) {
  return renderWithProviders(
    <SteuerberatungPage user={testUser(rollen)} />,
    '/abrechnung/steuerberatung',
  );
}

describe('SteuerberatungPage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-01T10:00:00Z') });
    for (const f of [fetchDatevEinstellungen, fetchDatevOffen, fetchDatevLaeufe]) f.mockReset();
    erstelleDatevLauf.mockReset();
    fetchDatevLauf.mockReset();
    fetchDatevEinstellungen.mockResolvedValue(EINSTELLUNGEN);
    fetchDatevOffen.mockResolvedValue([]);
    fetchDatevLaeufe.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('beginnt mit dem Vormonat der Behandlung und zählt, was neu ist', async () => {
    fetchDatevOffen.mockResolvedValue([
      buchung(),
      buchung({ tax_treatment: 'taxable', tax_rate_permille: 190, amount_cents: 2380 }),
      buchung({ kind: 'payment', direction: 'incoming', method: 'bank_transfer' }),
    ]);
    seite();

    expect(await screen.findByText('1 Rechnung · 1 Zahlung')).toBeInTheDocument();
    expect(fetchDatevOffen).toHaveBeenCalledWith('therapy', '2026-10-01');
    expect(screen.getByRole('button', { name: 'Buchungsstapel erstellen' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Behandlung' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('erstellt den Stapel, lädt die Datei und meldet ihren Namen', async () => {
    fetchDatevOffen.mockResolvedValue([buchung()]);
    erstelleDatevLauf.mockResolvedValue('lauf-1');
    fetchDatevLauf.mockResolvedValue({
      id: 'lauf-1',
      service_area: 'therapy',
      period_month: '2026-10-01',
      sequence: 1,
      consultant_number: 1001,
      client_number: 1,
      chart_of_accounts: 'SKR03',
      created_stamp: '20261101110000000',
      bookings: [buchung()],
    } satisfies DatevLauf);
    const erzeugt = vi.fn(() => 'blob:datei');
    const freigegeben = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: erzeugt, revokeObjectURL: freigegeben });
    const klick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    seite();

    await userEvent.click(await screen.findByRole('button', { name: 'Buchungsstapel erstellen' }));

    expect(
      await screen.findByText('Heruntergeladen: EXTF_Buchungsstapel_Behandlung_2026-10_1.csv'),
    ).toBeInTheDocument();
    expect(erstelleDatevLauf).toHaveBeenCalledWith('therapy', '2026-10-01');
    expect(klick).toHaveBeenCalledTimes(1);
    const datei = (erzeugt.mock.calls[0] as unknown as [Blob])[0];
    expect(datei.type).toBe('text/csv;charset=windows-1252');
    klick.mockRestore();
    vi.unstubAllGlobals();
  });

  it('nennt nach einem Export den nächsten Lauf einen Nachtrag und listet die Läufe', async () => {
    fetchDatevOffen.mockResolvedValue([buchung({ kind: 'payment', direction: 'incoming' })]);
    fetchDatevLaeufe.mockResolvedValue([
      {
        id: 'lauf-1',
        sequence: 1,
        created_at: '2026-11-01T09:15:00Z',
        document_count: 3,
        invoice_ids: ['a'],
        cancelled_invoice_ids: [],
      },
    ]);
    seite();

    expect(await screen.findByRole('button', { name: 'Nachtrag erstellen' })).toBeInTheDocument();
    const exporte = screen.getByRole('list');
    expect(within(exporte).getByText('Erster Export')).toBeInTheDocument();
    expect(within(exporte).getByText(/01\.11\.2026, 10:15 Uhr · 3 Dokumente/)).toBeInTheDocument();
    expect(within(exporte).getByRole('link', { name: 'Belege drucken' })).toHaveAttribute(
      'href',
      '/abrechnung/druck?rechnungen=a&zurueck=%2Fabrechnung%2Fsteuerberatung',
    );
  });

  it('warnt ohne Mandantennummer des Bereichs und bietet dann keinen Export an', async () => {
    fetchDatevOffen.mockResolvedValue([buchung()]);
    seite(['office']);
    await userEvent.click(await screen.findByRole('button', { name: 'Training' }));

    expect(await screen.findByText('Für diesen Bereich fehlt die Mandantennummer.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /erstellen/ })).not.toBeInTheDocument();
  });

  it('zeigt ohne Angaben die Warnung und der Inhaberin den Weg zum Eintragen', async () => {
    fetchDatevEinstellungen.mockResolvedValue(null);
    seite(['owner']);

    expect(await screen.findByText('Es sind noch keine DATEV-Angaben erfasst.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Eintragen' })).toHaveAttribute(
      'href',
      '/abrechnung/steuerberatung/angaben',
    );
  });

  it('zeigt dem Office die Angaben ohne Knopf zum Ändern', async () => {
    seite(['office']);
    expect(await screen.findByText('Beraternummer')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ändern' })).not.toBeInTheDocument();
  });

  it('meldet den Fehler des Servers in deutschen Worten', async () => {
    fetchDatevOffen.mockResolvedValue([buchung()]);
    erstelleDatevLauf.mockRejectedValue(
      new Error('In diesem Monat ist nichts Neues zu exportieren.'),
    );
    seite(['owner']);

    await userEvent.click(await screen.findByRole('button', { name: 'Buchungsstapel erstellen' }));
    expect(
      await screen.findByText('In diesem Monat ist nichts Neues zu exportieren.'),
    ).toBeInTheDocument();
  });
});

describe('Hilfen der Seite', () => {
  it('zählt Rechnungen je Nummer und Zahlungen je Zeile', () => {
    expect(
      zusammenfassung([
        buchung(),
        buchung({ amount_cents: 100, tax_treatment: 'taxable', tax_rate_permille: 190 }),
        buchung({ kind: 'cancellation', document_number: 'RG-2026-0102' }),
        buchung({ kind: 'payment', direction: 'incoming' }),
        buchung({ kind: 'payment', direction: 'incoming' }),
        buchung({ kind: 'payment_void', direction: 'incoming' }),
      ]),
    ).toBe('1 Rechnung · 1 Storno · 2 Zahlungen · 1 Zahlungsstorno');
  });

  it('teilt die Belege in Druckaufträge zu höchstens hundert Blättern', () => {
    const ids = Array.from({ length: 150 }, (_, i) => `r${i}`);
    const drucke = belegdrucke({ invoice_ids: ids, cancelled_invoice_ids: ['s1'] });
    expect(drucke.map((d) => [d.von, d.bis])).toEqual([
      [1, 100],
      [101, 151],
    ]);
    expect(drucke[1]!.to).toContain('stornos=s1');
    expect(belegdrucke({ invoice_ids: [], cancelled_invoice_ids: [] })).toEqual([]);
  });
});
