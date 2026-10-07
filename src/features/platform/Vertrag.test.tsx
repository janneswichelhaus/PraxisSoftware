import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Plattformzugang, Trainingsvertrag, Widerrufseingang } from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * „Ich → Trainingsvertrag" (KND-003, KND-004): die Bestätigung zum Drucken
 * und die Widerrufsfunktion nach § 356a BGB – Knopf, Bestätigung,
 * Eingang mit Zeitpunkt.
 */

const ladeVertrag = vi.fn();
const vertragWiderrufen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeVertrag: (...args: unknown[]) => ladeVertrag(...args) as Promise<Trainingsvertrag | null>,
  vertragWiderrufen: (...args: unknown[]) =>
    vertragWiderrufen(...args) as Promise<Widerrufseingang>,
}));

const { Vertrag } = await import('./Vertrag');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000099',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'training',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

const VERTRAG: Trainingsvertrag = {
  id: 'abababab-abab-4bab-8bab-000000000010',
  concluded_at: '2026-10-07T10:15:00Z',
  label: 'Trainingspaket 3 Monate',
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  tax_rate_permille: 190,
  vat_included: true,
  starts_on: '2026-10-27',
  ends_on: '2027-01-26',
  offered_on: '2026-10-07',
  wording_version: '2026-10',
  early_start_requested: false,
  contact_released: true,
  health_consent_granted: true,
  withdrawal_ends_on: '2026-10-21',
  released_titles: ['Belastungsgrenzen'],
  withdrawn_at: null,
  can_withdraw: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Trainingsvertrag auf der Plattform (KND-003, KND-004)', () => {
  it('zeigt die Buchung mit Fassung, Übernahmen und Widerrufsfrist', async () => {
    ladeVertrag.mockResolvedValue(VERTRAG);
    const { container } = renderWithProviders(<Vertrag zugang={ZUGANG} />);
    expect(await screen.findByText('Trainingspaket 3 Monate')).toBeInTheDocument();
    expect(screen.getByText(/in der Fassung 2026-10/)).toBeInTheDocument();
    expect(screen.getByText(/übernommen: Belastungsgrenzen, Kontaktdaten/)).toBeInTheDocument();
    expect(screen.getByText(/bis zum/)).toHaveTextContent('21.10.2026');
    await pruefeBarrierefreiheit(container);
  });

  it('widerruft in zwei Schritten und bestätigt den Eingang (§ 356a BGB)', async () => {
    ladeVertrag.mockResolvedValue(VERTRAG);
    vertragWiderrufen.mockResolvedValue({
      withdrawn_at: '2026-10-08T09:00:00Z',
      withdrawn_on: '2026-10-08',
      label: 'Trainingspaket 3 Monate',
      concluded_at: '2026-10-07T10:15:00Z',
    });
    renderWithProviders(<Vertrag zugang={ZUGANG} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Vertrag widerrufen' }));
    expect(vertragWiderrufen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Widerruf bestätigen' }));
    expect(vertragWiderrufen).toHaveBeenCalledWith(ZUGANG.access_id, VERTRAG.id);
    expect(await screen.findByText('Widerruf eingegangen')).toBeInTheDocument();
    expect(screen.getByText(/am 08.10.2026 um/)).toBeInTheDocument();
  });

  it('bietet nach dem Widerruf oder ohne Recht keinen Knopf', async () => {
    ladeVertrag.mockResolvedValue({
      ...VERTRAG,
      withdrawn_at: '2026-10-08T09:00:00Z',
      can_withdraw: false,
    });
    renderWithProviders(<Vertrag zugang={ZUGANG} />);
    expect(await screen.findByText(/Sie haben diesen Vertrag am 08.10.2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vertrag widerrufen' })).toBeNull();
  });

  it('sagt, wenn kein Vertrag im Konto geschlossen wurde', async () => {
    ladeVertrag.mockResolvedValue(null);
    renderWithProviders(<Vertrag zugang={ZUGANG} />);
    expect(await screen.findByText(/kein Vertrag, den Sie in Ihrem Konto/)).toBeInTheDocument();
  });
});
