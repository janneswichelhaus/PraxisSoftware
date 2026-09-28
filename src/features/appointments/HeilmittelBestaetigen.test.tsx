import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as LeistungenApi from './leistungenAmTermin';
import type * as BillingApi from '@/features/billing/api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const WAERME = 'cccccccc-cccc-4ccc-8ccc-000000000002';

const offen: LeistungenApi.LeistungenAmTermin = {
  appointment_id: TERMIN_ID,
  can_record: true,
  services: [],
  recorded_at: null,
  recorded_by_name: null,
  basis_items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 7 }],
};

function vorschlag(id: string, label: string, suggested: boolean): BillingApi.Vorschlag {
  return {
    catalog_item_id: id,
    code: label.slice(0, 2).toUpperCase(),
    label,
    item_kind: 'treatment',
    unit_price_cents: 4500,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
    suggested,
  };
}

const fetchLeistungenAmTermin = vi.fn();
vi.mock('./leistungenAmTermin', async (importOriginal) => {
  const actual = await importOriginal<typeof LeistungenApi>();
  return {
    ...actual,
    fetchLeistungenAmTermin: (id: string) =>
      fetchLeistungenAmTermin(id) as Promise<LeistungenApi.LeistungenAmTermin | null>,
  };
});

const fetchVorschlag = vi.fn();
const recordLeistungen = vi.fn();
vi.mock('@/features/billing/api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchVorschlag: (id: string) => fetchVorschlag(id) as Promise<BillingApi.Vorschlag[]>,
    recordLeistungen: (id: string, positionen: unknown) =>
      recordLeistungen(id, positionen) as Promise<void>,
  };
});

const { HeilmittelBestaetigen } = await import('./HeilmittelBestaetigen');

function rendern(status: 'documented' | 'completed' | 'invoiced' = 'documented') {
  return renderWithProviders(
    <HeilmittelBestaetigen
      appointment={testAppointment({ status })}
      user={testUser(['therapist'])}
    />,
  );
}

describe('Termin abhaken: Heilmittel bestätigen (PRX-009)', () => {
  beforeEach(() => {
    fetchLeistungenAmTermin.mockReset();
    fetchVorschlag.mockReset();
    recordLeistungen.mockReset();
    fetchLeistungenAmTermin.mockResolvedValue(offen);
    fetchVorschlag.mockResolvedValue([
      vorschlag(KG, 'Krankengymnastik', true),
      vorschlag(WAERME, 'Wärmetherapie', false),
    ]);
    recordLeistungen.mockResolvedValue(undefined);
  });

  it('belegt aus der Verordnung vor und zeigt das Kontingent', async () => {
    rendern();
    expect(await screen.findByRole('checkbox', { name: 'Krankengymnastik' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Wärmetherapie' })).not.toBeChecked();
    expect(screen.getByText('Krankengymnastik: 7 von 10 genutzt')).toBeInTheDocument();
    // Am Termin keine Preise.
    expect(screen.queryByText(/45,00/)).toBeNull();
  });

  it('bestätigt erst nach der Rückfrage und schreibt die Auswahl', async () => {
    const user = userEvent.setup();
    rendern();

    await user.click(await screen.findByRole('checkbox', { name: 'Wärmetherapie' }));
    await user.click(screen.getByRole('button', { name: 'Heilmittel bestätigen' }));
    expect(recordLeistungen).not.toHaveBeenCalled();

    const kasten = screen.getByRole('group', { name: 'Heilmittel bestätigen' });
    expect(kasten).toHaveTextContent('Korrigieren lässt sich das danach nur im Büro');
    await user.click(within(kasten).getByRole('button', { name: 'Ja, so bestätigen' }));

    await waitFor(() =>
      expect(recordLeistungen).toHaveBeenCalledWith(TERMIN_ID, [
        { catalog_item_id: KG, quantity: 1 },
        { catalog_item_id: WAERME, quantity: 1 },
      ]),
    );
    expect(await screen.findByText('Heilmittel bestätigt.')).toBeInTheDocument();
  });

  it('bietet ohne Auswahl keinen Knopf an', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await screen.findByRole('checkbox', { name: 'Krankengymnastik' }));
    expect(screen.queryByRole('button', { name: 'Heilmittel bestätigen' })).toBeNull();
    expect(screen.getByText('Mindestens ein Heilmittel auswählen.')).toBeInTheDocument();
  });

  it('meldet eine ausgeschöpfte Grundlage in der Rückfrage', async () => {
    const { KontingentAusgeschoepft } = await import('@/features/billing/api');
    recordLeistungen.mockRejectedValue(new KontingentAusgeschoepft());
    const user = userEvent.setup();
    rendern();

    await user.click(await screen.findByRole('button', { name: 'Heilmittel bestätigen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, so bestätigen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/bereits ausgeschöpft/);
  });

  it('zeigt eine Bestätigung ohne Knopf zum Zurücknehmen und sagt, wenn die Grundlage verbraucht ist', async () => {
    fetchLeistungenAmTermin.mockResolvedValue({
      ...offen,
      services: [{ code: 'KG', label: 'Krankengymnastik', quantity: 1, status: 'billable' }],
      recorded_by_name: 'Anna Beispiel',
      basis_items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 10 }],
    });
    rendern();

    expect(await screen.findByText('Krankengymnastik')).toBeInTheDocument();
    expect(screen.getByText('Bestätigt von Anna Beispiel.')).toBeInTheDocument();
    expect(screen.getByText(/Die Grundlage ist damit ausgeschöpft/)).toBeInTheDocument();
    expect(screen.getByText(/Eine Rechnung entsteht dabei nicht/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    // Der Weg zur Abrechnung nur für die Rollen der Abrechnung.
    expect(screen.queryByRole('link', { name: 'Zur Abrechnung' })).toBeNull();
  });

  it('sagt vor der Dokumentation, wann bestätigt wird - ohne zu laden', async () => {
    rendern('completed');
    expect(await screen.findByText(/sobald die Dokumentation finalisiert ist/)).toBeInTheDocument();
    expect(fetchLeistungenAmTermin).not.toHaveBeenCalled();
  });
});
