import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as PlattformApi from './api';
import type { Plattformzugang, Rechnungsblatt, Rechnungszeile } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Eigene Rechnungen (POR-013, DSN-001 D3): Liste mit Zahlungsstand als Wort,
 * Adressat, wenn es jemand anderes ist, und das Blatt aus dem Snapshot.
 */

const ladeRechnungen = vi.fn();
const ladeRechnung = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeRechnungen: (...args: unknown[]) => ladeRechnungen(...args) as Promise<Rechnungszeile[]>,
  ladeRechnung: (...args: unknown[]) => ladeRechnung(...args) as Promise<Rechnungsblatt | null>,
}));

const { Rechnungen, Rechnung } = await import('./Rechnungen');
const { zahlungsstand, positionen } = await import('./zahlungsstand');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

const ZEILE: Rechnungszeile = {
  id: 'ffffffff-ffff-4fff-8fff-000000000001',
  invoice_number: 'RG-2026-0001',
  issued_on: '2026-09-25',
  due_on: '2026-10-09',
  total_cents: 14000,
  currency: 'EUR',
  paid_cents: 4000,
  outstanding_cents: 10000,
  payment_state: 'partially_paid',
  overdue: true,
  cancelled: false,
  cancelled_on: null,
  recipient_kind: 'aid_authority',
  recipient_name: 'Beihilfestelle Tuebingen',
  service_from: '2026-09-02',
  service_to: '2026-09-23',
};

const BLATT: Rechnungsblatt = {
  id: ZEILE.id,
  invoice_number: 'RG-2026-0001',
  issued_on: '2026-09-25',
  due_on: '2026-10-09',
  paid_cents: 4000,
  outstanding_cents: 10000,
  payment_state: 'partially_paid',
  cancellation: null,
  replaces_invoice_number: null,
  correction_invoice_number: null,
  document: {
    schema_version: 5,
    currency: 'EUR',
    service_period: { from: '2026-09-02', to: '2026-09-23' },
    period_month: '2026-09-01',
    issuer: {
      legal_name: 'Test Praxis Tuebingen',
      street: 'Musterallee',
      house_number: '1',
      postal_code: '72070',
      city: 'Tuebingen',
      iban: 'DE02120300000000202051',
      bank_name: 'Testbank',
      account_holder: 'Test Praxis Tuebingen',
    },
    recipient: {
      kind: 'aid_authority',
      name: 'Beihilfestelle Tuebingen',
      street: 'Amtsweg',
      house_number: '2',
      postal_code: '72070',
      city: 'Tuebingen',
    },
    patient: { name: 'Erika Beispiel', date_of_birth: '1961-04-12' },
    treatment_bases: [
      {
        kind: 'follow_up',
        issued_on: '2026-08-20',
        prescriber: 'Dr. med. Petra Probst',
        diagnosis_icd10: 'M54.2',
        diagnosis: 'Zervikalsyndrom',
      },
    ],
    items: [
      {
        performed_on: '2026-09-02',
        code: 'KG',
        label: 'Krankengymnastik',
        item_kind: 'treatment',
        quantity: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
      },
      {
        performed_on: '2026-09-23',
        code: 'KG',
        label: 'Krankengymnastik',
        item_kind: 'treatment',
        quantity: 1,
        unit_price_cents: 10000,
        line_total_cents: 10000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
      },
      {
        performed_on: '2026-09-02',
        code: 'HB',
        label: 'Hausbesuchspauschale',
        item_kind: 'treatment',
        quantity: 1,
        unit_price_cents: 4000,
        line_total_cents: 4000,
        currency: 'EUR',
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
      },
    ],
    tax_groups: [
      {
        tax_treatment: 'exempt_healthcare',
        tax_rate_permille: 0,
        exemption_reason: 'Umsatzsteuerfrei nach § 4 Nr. 14 UStG.',
        gross_cents: 24000,
        tax_cents: 0,
        net_cents: 24000,
      },
    ],
    totals: { total_cents: 24000, tax_total_cents: 0 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Rechnungen (POR-013)', () => {
  it('listet Rechnungen mit Zahlungsstand als Wort und nennt einen anderen Adressaten', async () => {
    ladeRechnungen.mockResolvedValue([
      ZEILE,
      {
        ...ZEILE,
        id: 'ffffffff-ffff-4fff-8fff-000000000002',
        invoice_number: 'RG-2026-0002',
        paid_cents: 14000,
        outstanding_cents: 0,
        payment_state: 'paid',
        overdue: false,
        recipient_kind: 'self',
        recipient_name: 'Erika Beispiel',
      },
    ]);
    renderWithProviders(<Rechnungen zugang={ZUGANG} />, '/p/rechnungen?bereich=treatment');
    expect(await screen.findByText(/Rechnung RG-2026-0001 · 140,00 €/)).toBeInTheDocument();
    expect(screen.getByText('überfällig')).toBeInTheDocument();
    expect(screen.getByText(/an Beihilfestelle Tuebingen/)).toBeInTheDocument();
    expect(screen.getByText(/noch offen 100,00 €/)).toBeInTheDocument();
    expect(screen.getByText('bezahlt')).toBeInTheDocument();
    expect(screen.queryByText(/an Erika Beispiel/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /RG-2026-0001/ })).toHaveAttribute(
      'href',
      `/p/rechnungen/${ZEILE.id}?bereich=treatment`,
    );
  });

  it('sagt einer Begleitung ohne Einwilligung, warum nichts da ist', async () => {
    ladeRechnungen.mockResolvedValue([]);
    renderWithProviders(
      <Rechnungen
        zugang={{ ...ZUGANG, access_kind: 'companion', represented_name: 'Max Mustermann' }}
      />,
      '/p/rechnungen',
    );
    expect(
      await screen.findByText(/nur, wenn die Person Ihnen das erlaubt hat/),
    ).toBeInTheDocument();
  });

  it('zeigt das Blatt aus dem Snapshot mit Positionen, Tagen, Summe und Zahlung', async () => {
    ladeRechnung.mockResolvedValue(BLATT);
    renderWithProviders(
      <Rechnung zugang={ZUGANG} />,
      `/p/rechnungen/${ZEILE.id}?bereich=treatment`,
    );
    expect(
      await screen.findByRole('heading', { name: 'Rechnung RG-2026-0001' }),
    ).toBeInTheDocument();
    expect(ladeRechnung).toHaveBeenCalledWith(ZUGANG.access_id, ZEILE.id);
    expect(screen.getByText(/Offen sind 100,00 €, fällig am 09\.10\.2026/)).toBeInTheDocument();
    // Zwei Krankengymnastiken werden eine Position mit zwei Tagen.
    const zeile = screen.getByText('Krankengymnastik').closest('tr')!;
    expect(zeile).toHaveTextContent('Tage: 02.09.2026, 23.09.2026');
    expect(zeile).toHaveTextContent('2');
    expect(screen.getByText('240,00 €')).toBeInTheDocument();
    expect(screen.getByText(/IBAN DE02 1203 0000 0000 2020 51/)).toBeInTheDocument();
    expect(screen.getByText(/Umsatzsteuerfrei nach § 4 Nr. 14 UStG/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Drucken/ })).toBeInTheDocument();
    // Geburtsdatum und Behandlungsgrundlage wie auf dem Druck der Praxis (Zweitreview).
    expect(screen.getByText('12.04.1961')).toBeInTheDocument();
    expect(
      screen.getByText('Folgeverordnung vom 20.08.2026 · Dr. med. Petra Probst'),
    ).toBeInTheDocument();
    expect(screen.getByText('Diagnose: M54.2 Zervikalsyndrom')).toBeInTheDocument();
  });

  it('sagt bei einer fremden oder fehlenden Rechnung, dass es sie nicht gibt', async () => {
    ladeRechnung.mockResolvedValue(null);
    renderWithProviders(
      <Rechnung zugang={ZUGANG} />,
      '/p/rechnungen/ffffffff-ffff-4fff-8fff-000000000009',
    );
    expect(await screen.findByText('Diese Rechnung wurde nicht gefunden.')).toBeInTheDocument();
  });

  it('formt Zahlungsstand und Positionen', () => {
    expect(zahlungsstand({ payment_state: 'unpaid', overdue: false, cancelled: false })).toEqual({
      wort: 'offen',
      ton: 'warnung',
    });
    expect(zahlungsstand({ payment_state: 'unpaid', overdue: true, cancelled: true })).toEqual({
      wort: 'storniert',
      ton: 'neutral',
    });
    expect(positionen(BLATT.document.items).map((g) => [g.code, g.menge, g.summe_cents])).toEqual([
      ['KG', 2, 20000],
      ['HB', 1, 4000],
    ]);
  });
});
