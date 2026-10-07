import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as PlattformApi from './api';
import type { MeinPaket, Paketangebote, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * „Ich → Trainingspaket" (ANG-008, IDEA-ANG-004): das eigene Paket, die
 * Pakete der Preisliste mit Gesamtpreis und die Bedingungen - ohne Kaufknopf,
 * abgeschlossen wird in der Praxis (ANN-281).
 */

const ladeMeinePakete = vi.fn();
const ladeAngebote = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeMeinePakete: (...args: unknown[]) => ladeMeinePakete(...args) as Promise<MeinPaket[] | null>,
  ladeAngebote: (...args: unknown[]) => ladeAngebote(...args) as Promise<Paketangebote | null>,
}));

const { Paket } = await import('./Paket');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000001',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'training',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

const ANGEBOTE: Paketangebote = {
  vat_included: true,
  offers: [
    {
      code: 'TP3',
      label: 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)',
      package_months: 3,
      price_cents: 39000,
      currency: 'EUR',
      tax_rate_permille: 190,
    },
    {
      code: 'TP6',
      label: 'Trainingspaket 6 Monate (eine Einheit je Woche, Plattform inklusive)',
      package_months: 6,
      price_cents: 72000,
      currency: 'EUR',
      tax_rate_permille: 190,
    },
  ],
};

const LAUFEND: MeinPaket = {
  label: 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)',
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  starts_on: '2026-10-01',
  ends_on: '2026-12-31',
  state: 'running',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Trainingspaket auf der Plattform (ANG-008)', () => {
  it('zeigt das eigene Paket, die Preise mit Umsatzsteuer und die Bedingungen', async () => {
    ladeMeinePakete.mockResolvedValue([LAUFEND]);
    ladeAngebote.mockResolvedValue(ANGEBOTE);
    const { container } = renderWithProviders(<Paket zugang={ZUGANG} />);

    expect(await screen.findByText('Läuft seit 01.10.2026 bis 31.12.2026.')).toBeInTheDocument();
    expect(screen.getByText(/390,00 €, einmal zu Beginn berechnet/)).toBeInTheDocument();
    expect(screen.getByText('720,00 €')).toBeInTheDocument();
    expect(screen.getByText(/für 6 Monate/)).toBeInTheDocument();
    expect(screen.getAllByText('inklusive 19 % Umsatzsteuer')).toHaveLength(2);
    // Die Bedingungen: nicht pausierbar, Rückfall in die Behandlung (ANN-277, ANN-280).
    expect(screen.getByText(/nicht pausieren und nicht vorzeitig kündigen/)).toBeInTheDocument();
    expect(screen.getByText(/läuft das Paket weiter/)).toBeInTheDocument();
    // Kein Kaufknopf (ANN-281).
    expect(screen.queryByRole('button')).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('nennt ohne Paket die Preise trotzdem', async () => {
    ladeMeinePakete.mockResolvedValue([]);
    ladeAngebote.mockResolvedValue(ANGEBOTE);
    renderWithProviders(<Paket zugang={ZUGANG} />);
    expect(await screen.findByText('Sie haben zurzeit kein Paket.')).toBeInTheDocument();
    expect(screen.getByText('390,00 €')).toBeInTheDocument();
  });

  it('zeigt einer Begleitung ohne Rechnungen nur die Preise', async () => {
    ladeMeinePakete.mockResolvedValue(null);
    ladeAngebote.mockResolvedValue(ANGEBOTE);
    renderWithProviders(<Paket zugang={{ ...ZUGANG, access_kind: 'companion' }} />);
    expect(await screen.findByText('Pakete und Preise')).toBeInTheDocument();
    expect(screen.queryByText('Ihr Paket')).toBeNull();
  });

  it('sagt unter der Kleinunternehmerregelung, dass keine Umsatzsteuer ausgewiesen wird', async () => {
    ladeMeinePakete.mockResolvedValue([]);
    ladeAngebote.mockResolvedValue({ ...ANGEBOTE, vat_included: false });
    renderWithProviders(<Paket zugang={ZUGANG} />);
    expect(
      await screen.findAllByText('Ohne Ausweis der Umsatzsteuer (Kleinunternehmerregelung).'),
    ).toHaveLength(2);
  });
});
