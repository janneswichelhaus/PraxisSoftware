import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchOffeneTermine = vi.fn();
const fetchLeistungen = vi.fn();
const fetchVorschlag = vi.fn();
const recordLeistungen = vi.fn();
const deleteLeistungen = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchOffeneTermine: () => fetchOffeneTermine() as Promise<BillingApi.OffenerTermin[]>,
    fetchLeistungen: () => fetchLeistungen() as Promise<BillingApi.Leistung[]>,
    fetchVorschlag: (id: string) => fetchVorschlag(id) as Promise<BillingApi.Vorschlag[]>,
    recordLeistungen: (...args: unknown[]) => recordLeistungen(...args) as Promise<void>,
    deleteLeistungen: (id: string) => deleteLeistungen(id) as Promise<void>,
  };
});

const { ServicesPage } = await import('./ServicesPage');
const { KeinKatalog, KontingentAusgeschoepft } = await import('./api');

function termin(rest: Partial<BillingApi.OffenerTermin> = {}): BillingApi.OffenerTermin {
  return {
    appointment_id: 't1',
    patient_id: 'p1',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-15',
    starts_at: '2026-09-15T08:00:00Z',
    status: 'documented',
    fee_basis: null,
    appointment_type: 'practice',
    suggestion_count: 1,
    ...rest,
  };
}

function vorschlag(rest: Partial<BillingApi.Vorschlag> = {}): BillingApi.Vorschlag {
  return {
    catalog_item_id: 'k1',
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    unit_price_cents: 4500,
    currency: 'EUR',
    service_area: 'therapy',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    suggested: true,
    ...rest,
  };
}

function leistung(rest: Partial<BillingApi.Leistung> = {}): BillingApi.Leistung {
  return {
    id: 'l1',
    appointment_id: 't9',
    patient_id: 'p1',
    patient_name: 'Erika Beispiel',
    performed_on: '2026-09-10',
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    quantity: 1,
    unit_price_cents: 4500,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    status: 'billable',
    ...rest,
  };
}

describe('ServicesPage', () => {
  beforeEach(() => {
    fetchOffeneTermine.mockReset();
    fetchLeistungen.mockReset();
    fetchVorschlag.mockReset();
    recordLeistungen.mockReset();
    deleteLeistungen.mockReset();
    fetchOffeneTermine.mockResolvedValue([]);
    fetchLeistungen.mockResolvedValue([]);
  });

  it('sagt, dass ohne finalisierte Dokumentation nicht fakturiert wird', async () => {
    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    expect(
      await screen.findByText(/Ohne finalisierte Dokumentation wird nicht fakturiert/),
    ).toBeInTheDocument();
  });

  it('unterscheidet einen dokumentierten Termin von einem Gebuehrenanlass', async () => {
    fetchOffeneTermine.mockResolvedValue([
      termin(),
      termin({
        appointment_id: 't2',
        fee_basis: 'late_cancellation',
        patient_name: 'Max Mustermann',
        suggestion_count: 0,
      }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    expect(await screen.findByText('Dokumentiert')).toBeInTheDocument();
    expect(screen.getByText('Absage innerhalb der Frist')).toBeInTheDocument();
  });

  it('uebernimmt die Vorbelegung des Servers und erfasst die gewaehlten Positionen', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockResolvedValue([
      vorschlag(),
      vorschlag({
        catalog_item_id: 'k2',
        code: 'HB',
        label: 'Hausbesuchspauschale',
        suggested: false,
      }),
    ]);
    recordLeistungen.mockResolvedValue(undefined);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

    const kg = await screen.findByRole('checkbox', { name: /Krankengymnastik/ });
    const hb = screen.getByRole('checkbox', { name: /Hausbesuchspauschale/ });
    expect(kg).toBeChecked();
    expect(hb).not.toBeChecked();

    await nutzer.click(hb);
    await nutzer.click(screen.getByRole('button', { name: '2 Leistungen erfassen' }));

    expect(recordLeistungen).toHaveBeenCalledWith('t1', [
      { catalog_item_id: 'k1', quantity: 1 },
      { catalog_item_id: 'k2', quantity: 1 },
    ]);
  });

  it('nennt die Preisliste als fehlende Angabe, wenn es fuer den Tag keine gibt', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockRejectedValue(new KeinKatalog());

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));

    expect(await screen.findByText(/keine Preisliste in Kraft/)).toBeInTheDocument();
  });

  it('erklaert eine ausgeschoepfte Leistungsmenge statt sie zu verschweigen', async () => {
    const nutzer = userEvent.setup();
    fetchOffeneTermine.mockResolvedValue([termin()]);
    fetchVorschlag.mockResolvedValue([vorschlag()]);
    recordLeistungen.mockRejectedValue(new KontingentAusgeschoepft());

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Leistungen erfassen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Eine Leistung erfassen' }));

    expect(
      await screen.findByText(/Leistungsmenge der Behandlungsgrundlage ist ausgeschöpft/),
    ).toBeInTheDocument();
  });

  it('fasst die Leistungen eines Termins mit ihrer Summe zusammen', async () => {
    fetchLeistungen.mockResolvedValue([
      leistung({ quantity: 2 }),
      leistung({ id: 'l2', code: 'HB', label: 'Hausbesuchspauschale', unit_price_cents: 1800 }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    // 2 × 45,00 € + 1 × 18,00 €
    expect(await screen.findByText('108,00 €')).toBeInTheDocument();
  });

  it('nimmt eine Erfassung nach Rueckfrage zurueck', async () => {
    const nutzer = userEvent.setup();
    fetchLeistungen.mockResolvedValue([leistung()]);
    deleteLeistungen.mockResolvedValue(undefined);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Erfassung zurücknehmen' }));
    expect(
      screen.getByText(/genutzte Menge der Behandlungsgrundlage geht um denselben Betrag/),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Zurücknehmen' }));

    expect(deleteLeistungen).toHaveBeenCalledWith('t9');
  });

  it('bietet fuer eine abgerechnete Leistung kein Zuruecknehmen an', async () => {
    fetchLeistungen.mockResolvedValue([leistung({ status: 'invoiced' })]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    expect(await screen.findByText(/Storno und Neuausstellung/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Erfassung zurücknehmen' }),
    ).not.toBeInTheDocument();
  });

  it('zeigt das Steuerkennzeichen an jeder erfassten Zeile', async () => {
    fetchLeistungen.mockResolvedValue([
      leistung({
        tax_treatment: 'not_taxable',
        item_kind: 'absence_fee',
        code: 'AUS',
        label: 'Ausfallhonorar',
      }),
    ]);

    renderWithProviders(<ServicesPage />, '/abrechnung/leistungen');

    const zeile = (await screen.findByText('(AUS)')).closest('li');
    expect(within(zeile!).getByText(/Nicht steuerbar/)).toBeInTheDocument();
    // Das Ausfallhonorar traegt daneben sein eigenes Kennzeichen: Es ist
    // keine Behandlung, und das soll man der Zeile ansehen.
    expect(within(zeile!).getAllByText('Ausfallhonorar').length).toBeGreaterThan(0);
  });
});
