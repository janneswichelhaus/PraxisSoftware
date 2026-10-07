import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PaketApi from './trainingspaket-api';
import { renderWithProviders } from '@/test-utils';

const fetchPakete = vi.fn();
const fetchPaketpositionen = vi.fn();
const createPaket = vi.fn();
const deletePaket = vi.fn();

vi.mock('./trainingspaket-api', async (importOriginal) => {
  const actual = await importOriginal<typeof PaketApi>();
  return {
    ...actual,
    fetchPakete: (id: string) => fetchPakete(id) as Promise<PaketApi.Paketsicht | null>,
    fetchPaketpositionen: (tag: string) =>
      fetchPaketpositionen(tag) as Promise<PaketApi.Paketposition[]>,
    createPaket: (...args: unknown[]) => createPaket(...args) as Promise<void>,
    deletePaket: (id: string) => deletePaket(id) as Promise<void>,
  };
});

const { Trainingspaket } = await import('./Trainingspaket');

const LAUFEND: PaketApi.Trainingspaket = {
  id: 'k1',
  code: 'TP3',
  label: 'Trainingspaket 3 Monate',
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  starts_on: '2026-10-01',
  ends_on: '2026-12-31',
  state: 'running',
  created_at: '2026-10-01T08:00:00Z',
  created_by_name: 'Olivia Office',
  invoiced: false,
};

const POSITIONEN: PaketApi.Paketposition[] = [
  {
    catalog_item_id: 'c3',
    code: 'TP3',
    label: 'Trainingspaket 3 Monate',
    package_months: 3,
    unit_price_cents: 39000,
    currency: 'EUR',
    tax_rate_permille: 190,
  },
  {
    catalog_item_id: 'c6',
    code: 'TP6',
    label: 'Trainingspaket 6 Monate',
    package_months: 6,
    unit_price_cents: 72000,
    currency: 'EUR',
    tax_rate_permille: 190,
  },
];

function sicht(teil: Partial<PaketApi.Paketsicht> = {}): PaketApi.Paketsicht {
  return { today: '2026-10-07', start_blocker: null, packages: [], ...teil };
}

describe('Trainingspaket am Trainingsverhältnis (ANG-006)', () => {
  beforeEach(() => {
    fetchPakete.mockReset();
    fetchPaketpositionen.mockReset();
    createPaket.mockReset();
    deletePaket.mockReset();
  });

  it('zeigt ein laufendes Paket mit Zeitraum, Laufzeit und Preis', async () => {
    fetchPakete.mockResolvedValue(sicht({ packages: [LAUFEND] }));
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    expect(await screen.findByText('Trainingspaket 3 Monate')).toBeInTheDocument();
    expect(screen.getByText('Läuft')).toBeInTheDocument();
    expect(
      screen.getByText(/01\.10\.2026 bis 31\.12\.2026 · 3 Monate · 390,00/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Noch nicht abgerechnet/)).toBeInTheDocument();
  });

  it('legt ein Paket aus der Preisliste des Beginns an', async () => {
    fetchPakete.mockResolvedValue(sicht());
    fetchPaketpositionen.mockResolvedValue(POSITIONEN);
    createPaket.mockResolvedValue(undefined);
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);

    await userEvent.click(await screen.findByRole('button', { name: 'Paket anlegen' }));
    expect(screen.getByLabelText('Beginn')).toHaveValue('2026-10-07');
    // Ohne Wahl kein Absenden.
    await userEvent.click(screen.getAllByRole('button', { name: 'Paket anlegen' }).at(-1)!);
    expect(await screen.findByText('Bitte ein Paket wählen.')).toBeInTheDocument();
    expect(createPaket).not.toHaveBeenCalled();

    await userEvent.selectOptions(await screen.findByLabelText('Paket'), 'c6');
    await userEvent.click(screen.getAllByRole('button', { name: 'Paket anlegen' }).at(-1)!);
    expect(fetchPaketpositionen).toHaveBeenCalledWith('2026-10-07');
    expect(createPaket).toHaveBeenCalledWith('t1', 'c6', '2026-10-07');
    expect(await screen.findByText(/Paket angelegt/)).toBeInTheDocument();
  });

  it('sagt während einer laufenden Behandlung, warum es kein Paket gibt (ANN-278)', async () => {
    fetchPakete.mockResolvedValue(sicht({ start_blocker: 'care_open' }));
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    expect(await screen.findByText(/noch in Behandlung/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Paket anlegen' })).not.toBeInTheDocument();
  });

  it('zeigt die Meldung des Servers beim Anlegen', async () => {
    fetchPakete.mockResolvedValue(sicht());
    fetchPaketpositionen.mockResolvedValue(POSITIONEN);
    createPaket.mockRejectedValue(new Error('In diesem Zeitraum läuft schon ein Paket.'));
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Paket anlegen' }));
    await userEvent.selectOptions(await screen.findByLabelText('Paket'), 'c3');
    await userEvent.click(screen.getAllByRole('button', { name: 'Paket anlegen' }).at(-1)!);
    expect(
      await screen.findByText('In diesem Zeitraum läuft schon ein Paket.'),
    ).toBeInTheDocument();
  });

  it('sagt, was zu tun ist, wenn im Zeitraum schon eine Stunde erfasst ist (ANN-279)', async () => {
    fetchPakete.mockResolvedValue(sicht());
    fetchPaketpositionen.mockResolvedValue(POSITIONEN);
    createPaket.mockRejectedValue(
      new Error('Im Zeitraum ist schon eine Trainingsstunde als Leistung erfasst.'),
    );
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Paket anlegen' }));
    await userEvent.selectOptions(await screen.findByLabelText('Paket'), 'c3');
    await userEvent.click(screen.getAllByRole('button', { name: 'Paket anlegen' }).at(-1)!);
    expect(await screen.findByText(/schon eine Trainingsstunde/)).toBeInTheDocument();
  });

  it('entfernt eine Fehlanlage nur ohne Rechnung', async () => {
    fetchPakete.mockResolvedValue(
      sicht({ packages: [LAUFEND, { ...LAUFEND, id: 'k2', invoiced: true, state: 'ended' }] }),
    );
    deletePaket.mockResolvedValue(undefined);
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    const knoepfe = await screen.findAllByRole('button', { name: /Irrtümlich angelegt/ });
    expect(knoepfe).toHaveLength(1);
    await userEvent.click(knoepfe[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Ja, entfernen' }));
    expect(deletePaket).toHaveBeenCalledWith('k1');
  });

  it('zeigt für andere Rollen nichts', async () => {
    fetchPakete.mockResolvedValue(null);
    const { container } = renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    await vi.waitFor(() => expect(fetchPakete).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
