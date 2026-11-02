import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
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

const offenePunkte = vi.fn(() => Promise.resolve([]));

/** Liest wie Offene Punkte unter `open-points`; ohne Erneuerung fragt sie nie ein zweites Mal. */
function OffenePunkteSonde() {
  useQuery({ queryKey: ['open-points', 'sonde'], queryFn: offenePunkte, staleTime: Infinity });
  return null;
}

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

  it('zeigt ein laufendes Paket mit Zeitraum, Laufzeit und Preis; offen ist die Abrechnung', async () => {
    fetchPakete.mockResolvedValue(sicht({ packages: [LAUFEND] }));
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    expect(await screen.findByText('Trainingspaket 3 Monate')).toBeInTheDocument();
    expect(
      screen.getByText(/01\.10\.2026 bis 31\.12\.2026 · 3 Monate · 390,00/),
    ).toBeInTheDocument();
    // Zeichen und Wort für die offene Abrechnung; „Läuft“ ist der Regelfall (DESIGN.md Regel 5).
    expect(screen.getByText('Noch nicht abgerechnet')).toBeInTheDocument();
    expect(screen.getByText('–')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByText('Läuft')).toBeNull();
  });

  it('lässt den Regelfall ohne Abzeichen; ein geplantes Paket heißt „Beginnt bald“', async () => {
    fetchPakete.mockResolvedValue(
      sicht({
        packages: [
          {
            ...LAUFEND,
            id: 'k3',
            starts_on: '2027-01-01',
            ends_on: '2027-03-31',
            state: 'planned',
          },
          { ...LAUFEND, id: 'k2', invoiced: true },
          {
            ...LAUFEND,
            id: 'k0',
            starts_on: '2026-07-01',
            ends_on: '2026-09-30',
            state: 'ended',
            invoiced: true,
          },
        ],
      }),
    );
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    expect(await screen.findByText('Beginnt bald')).toBeInTheDocument();
    // Geplant wird erst ab dem Beginn abgerechnet; laufend und abgerechnet trägt nichts.
    expect(screen.queryByText('Noch nicht abgerechnet')).toBeNull();
    expect(screen.queryByText(/abgerechnet|Rechnung/i)).toBeNull();
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

  it('schlägt für ein Folgepaket den Tag nach dem letzten Ende vor (ANN-834)', async () => {
    fetchPakete.mockResolvedValue(
      sicht({
        packages: [
          LAUFEND,
          { ...LAUFEND, id: 'k0', starts_on: '2026-07-01', ends_on: '2026-09-30', state: 'ended' },
        ],
      }),
    );
    fetchPaketpositionen.mockResolvedValue(POSITIONEN);
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Paket anlegen' }));
    expect(screen.getByLabelText('Beginn')).toHaveValue('2027-01-01');
    expect(fetchPaketpositionen).toHaveBeenCalledWith('2027-01-01');
  });

  it('erneuert Offene Punkte nach dem Anlegen, damit die Zeile ohne Anschluss geht (ANN-834)', async () => {
    fetchPakete.mockResolvedValue(sicht({ packages: [LAUFEND] }));
    fetchPaketpositionen.mockResolvedValue(POSITIONEN);
    createPaket.mockResolvedValue(undefined);
    offenePunkte.mockClear();
    renderWithProviders(
      <>
        <OffenePunkteSonde />
        <Trainingspaket verhaeltnisId="t1" />
      </>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Paket anlegen' }));
    await userEvent.selectOptions(await screen.findByLabelText('Paket'), 'c3');
    expect(offenePunkte).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getAllByRole('button', { name: 'Paket anlegen' }).at(-1)!);
    expect(await screen.findByText(/Paket angelegt/)).toBeInTheDocument();
    expect(offenePunkte).toHaveBeenCalledTimes(2);
  });

  it('rollt mit dem Sprungziel aus Offene Punkte zum Abschnitt, sobald er steht (ANN-834)', async () => {
    const rollen = vi.fn();
    Element.prototype.scrollIntoView = rollen;
    fetchPakete.mockResolvedValue(sicht({ packages: [LAUFEND] }));
    try {
      renderWithProviders(
        <Trainingspaket verhaeltnisId="t1" />,
        '/?bereich=vertraege#trainingspaket',
      );
      expect(await screen.findByText('Trainingspaket 3 Monate')).toBeInTheDocument();
      await vi.waitFor(() => expect(rollen).toHaveBeenCalledWith({ block: 'start' }));
      expect((rollen.mock.contexts[0] as HTMLElement).id).toBe('trainingspaket');
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it('schlägt heute vor, wenn jedes Paket schon geendet hat', async () => {
    fetchPakete.mockResolvedValue(
      sicht({ packages: [{ ...LAUFEND, ends_on: '2026-10-06', state: 'ended' }] }),
    );
    fetchPaketpositionen.mockResolvedValue(POSITIONEN);
    renderWithProviders(<Trainingspaket verhaeltnisId="t1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Paket anlegen' }));
    expect(screen.getByLabelText('Beginn')).toHaveValue('2026-10-07');
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
