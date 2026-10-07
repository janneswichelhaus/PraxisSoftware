import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Kuendigungsbestaetigung, Nachsorgeabo, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * „Ich → Nachsorge-Abo" (ANG-003): Stand, nächste Monatsrechnung und der
 * Kündigungsknopf nach dem Muster des § 312k BGB (ANN-272) - Knopf, Seite zur
 * Bestätigung, „Jetzt kündigen", Bestätigung mit Zeitpunkt.
 */

const ladeAbo = vi.fn();
const aboKuendigen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeAbo: (...args: unknown[]) => ladeAbo(...args) as Promise<Nachsorgeabo | null>,
  aboKuendigen: (...args: unknown[]) => aboKuendigen(...args) as Promise<Kuendigungsbestaetigung>,
}));

const { Abo } = await import('./Abo');

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

const LAUFEND: Nachsorgeabo = {
  id: 'abababab-abab-4bab-8bab-000000000001',
  starts_on: '2026-10-05',
  ends_on: null,
  state: 'running',
  next_month_start: '2026-11-05',
  next_month_price_cents: 3900,
  cancel_effective_on: '2026-11-04',
  cancelled_at: null,
  cancelled_via: null,
  can_cancel: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Nachsorge-Abo auf der Plattform (ANG-003)', () => {
  it('zeigt Stand und nächste Monatsrechnung', async () => {
    ladeAbo.mockResolvedValue(LAUFEND);
    const { container } = renderWithProviders(<Abo zugang={ZUGANG} />);
    expect(await screen.findByText('Läuft seit 05.10.2026.')).toBeInTheDocument();
    expect(screen.getByText(/Nächste Monatsrechnung ab 05.11.2026: 39,00/)).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('kündigt erst nach der Seite zur Bestätigung und zeigt die Bestätigung', async () => {
    const nutzer = userEvent.setup();
    ladeAbo.mockResolvedValue(LAUFEND);
    aboKuendigen.mockResolvedValue({
      ends_on: '2026-11-04',
      cancelled_at: '2026-10-07T09:30:00Z',
      cancelled_on: '2026-10-07',
    });
    renderWithProviders(<Abo zugang={ZUGANG} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Abo kündigen' }));
    expect(aboKuendigen).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Kündigung bestätigen' })).toBeInTheDocument();
    expect(screen.getByText('04.11.2026')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Jetzt kündigen' }));
    expect(aboKuendigen).toHaveBeenCalledWith(ZUGANG.access_id, LAUFEND.id);
    expect(
      await screen.findByRole('heading', { name: 'Kündigung eingegangen' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/am 07.10.2026 um/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bestätigung drucken' })).toBeInTheDocument();
  });

  it('kehrt mit „Abbrechen" ohne Kündigung zurück', async () => {
    const nutzer = userEvent.setup();
    ladeAbo.mockResolvedValue(LAUFEND);
    renderWithProviders(<Abo zugang={ZUGANG} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Abo kündigen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.getByRole('button', { name: 'Abo kündigen' })).toBeInTheDocument();
    expect(aboKuendigen).not.toHaveBeenCalled();
  });

  it('bietet ohne Recht keinen Knopf an (Begleitung, ANN-273)', async () => {
    ladeAbo.mockResolvedValue({ ...LAUFEND, can_cancel: false });
    renderWithProviders(
      <Abo zugang={{ ...ZUGANG, access_kind: 'companion', represented_name: 'Max Mustermann' }} />,
    );
    expect(await screen.findByText(/Kündigen können Max Mustermann selbst/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abo kündigen' })).toBeNull();
  });

  it('nennt nach der Kündigung Ende und Lesezeit', async () => {
    ladeAbo.mockResolvedValue({
      ...LAUFEND,
      state: 'ending',
      ends_on: '2026-11-04',
      next_month_start: null,
      cancel_effective_on: null,
      cancelled_at: '2026-10-07T09:30:00Z',
      cancelled_via: 'practice',
      can_cancel: false,
    });
    renderWithProviders(<Abo zugang={ZUGANG} />);
    expect(await screen.findByText('Gekündigt. Ihr Abo endet am 04.11.2026.')).toBeInTheDocument();
    expect(screen.getByText(/eingetragen von der Praxis/)).toBeInTheDocument();
    expect(screen.getByText('Danach können Sie hier noch 30 Tage lesen.')).toBeInTheDocument();
  });

  it('sagt ohne Abo, dass es keins gibt', async () => {
    ladeAbo.mockResolvedValue(null);
    renderWithProviders(<Abo zugang={ZUGANG} />);
    expect(await screen.findByText('Sie haben kein Nachsorge-Abo.')).toBeInTheDocument();
  });
});
