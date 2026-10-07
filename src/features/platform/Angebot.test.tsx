import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Buchungsbestaetigung, Plattformzugang, Trainingsangebot } from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { VERTRAGSFASSUNG } from './vertragstexte';

/**
 * „Training nach Ihrer Behandlung" (KND-003): Paket, Bedingungen,
 * Widerrufsbelehrung, Einwilligung, Freigaben einzeln und „Zahlungspflichtig
 * buchen" mit sofortiger Bestätigung (ANN-288, ANN-289).
 */

const ladeTrainingsangebot = vi.fn();
const angebotAnnehmen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTrainingsangebot: (...args: unknown[]) =>
    ladeTrainingsangebot(...args) as Promise<Trainingsangebot | null>,
  angebotAnnehmen: (...args: unknown[]) =>
    angebotAnnehmen(...args) as Promise<Buchungsbestaetigung>,
}));

const { Angebot } = await import('./Angebot');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: '2026-11-06',
  access_kind: 'self',
  represented_name: null,
};

const ANGEBOT: Trainingsangebot = {
  id: 'abababab-abab-4bab-8bab-000000000009',
  label: 'Trainingspaket 3 Monate, eine Einheit je Woche',
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  tax_rate_permille: 190,
  vat_included: true,
  starts_on: '2026-10-27',
  ends_on: '2027-01-26',
  valid_until: '2026-10-21',
  offered_on: '2026-10-07',
  handover_items: [
    { title: 'Belastungsgrenzen', body: 'Keine Sprünge bis Dezember.' },
    { title: 'Vorgeschichte', body: 'Kreuzbandplastik links im März.' },
  ],
  contact: {
    date_of_birth: '1963-09-17',
    street: 'Testweg',
    house_number: '7',
    postal_code: '72072',
    city: 'Tuebingen',
    phone: '+49 160 0000006',
    email: 'erika.beispiel@patient.invalid',
  },
  early_start: false,
  withdrawal_days: 14,
  wording_version: VERTRAGSFASSUNG,
  blocker: null,
  can_accept: true,
  practice: {
    name: 'Test Praxis Tuebingen',
    street: 'Praxisweg',
    house_number: '1',
    postal_code: '72070',
    city: 'Tübingen',
    phone: null,
    email: null,
  },
};

const GEBUCHT: Buchungsbestaetigung = {
  contract_id: 'abababab-abab-4bab-8bab-000000000010',
  training_access_id: 'cafecafe-cafe-4afe-8afe-000000000099',
  concluded_at: '2026-10-07T10:15:00Z',
  label: ANGEBOT.label,
  package_months: 3,
  price_cents: 39000,
  currency: 'EUR',
  starts_on: '2026-10-27',
  ends_on: '2027-01-26',
  withdrawal_ends_on: '2026-10-21',
  early_start_requested: false,
  contact_released: true,
  health_consent_granted: true,
  released_titles: ['Belastungsgrenzen'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Trainingsangebot auf der Plattform (KND-003)', () => {
  it('zeigt Paket, Zeitraum, Gesamtpreis, Belehrung und Angaben', async () => {
    ladeTrainingsangebot.mockResolvedValue(ANGEBOT);
    const { container } = renderWithProviders(<Angebot zugang={ZUGANG} />);
    expect(await screen.findByText(ANGEBOT.label)).toBeInTheDocument();
    expect(screen.getByText('27.10.2026 bis 26.01.2027')).toBeInTheDocument();
    expect(screen.getByText(/inklusive 19 % Umsatzsteuer/)).toBeInTheDocument();
    expect(screen.getByText('Widerrufsrecht')).toBeInTheDocument();
    expect(screen.getByText(/Um Ihr Widerrufsrecht auszuüben/)).toHaveTextContent(
      'Praxisweg 1, 72070 Tübingen',
    );
    expect(screen.getByLabelText('Belastungsgrenzen')).not.toBeChecked();
    expect(screen.getByLabelText('Kontaktdaten')).not.toBeChecked();
    expect(
      screen.getByText(/In Ihrer Behandlungsakte steht nicht, ob Sie gebucht haben/),
    ).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('bucht mit den einzeln gewählten Freigaben und zeigt die Bestätigung', async () => {
    ladeTrainingsangebot.mockResolvedValue(ANGEBOT);
    angebotAnnehmen.mockResolvedValue(GEBUCHT);
    renderWithProviders(<Angebot zugang={ZUGANG} />);
    await userEvent.click(await screen.findByLabelText('Belastungsgrenzen'));
    await userEvent.click(screen.getByLabelText('Kontaktdaten'));
    await userEvent.click(screen.getByLabelText('Ich willige ein.'));
    await userEvent.click(screen.getByRole('button', { name: 'Zahlungspflichtig buchen' }));
    expect(angebotAnnehmen).toHaveBeenCalledWith(ZUGANG.access_id, {
      angebotId: ANGEBOT.id,
      freigaben: [1],
      kontakt: true,
      einwilligung: true,
      fruehBeginnen: false,
      fassung: VERTRAGSFASSUNG,
    });
    expect(await screen.findByText('Ihr Trainingsvertrag ist geschlossen')).toBeInTheDocument();
    expect(screen.getByText(/bis zum/)).toHaveTextContent('21.10.2026');
    expect(
      screen.getByText(/Ins Training übernommen: Belastungsgrenzen, Kontaktdaten/),
    ).toBeInTheDocument();
  });

  it('bucht ohne Freigaben und ohne Einwilligung', async () => {
    ladeTrainingsangebot.mockResolvedValue(ANGEBOT);
    angebotAnnehmen.mockResolvedValue({
      ...GEBUCHT,
      released_titles: [],
      contact_released: false,
      health_consent_granted: false,
    });
    renderWithProviders(<Angebot zugang={ZUGANG} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Zahlungspflichtig buchen' }));
    expect(angebotAnnehmen).toHaveBeenCalledWith(
      ZUGANG.access_id,
      expect.objectContaining({ freigaben: [], kontakt: false, einwilligung: false }),
    );
    expect(await screen.findByText(/wurde nichts ins Training übernommen/)).toBeInTheDocument();
  });

  it('verlangt die Einwilligung, wenn Angaben zur Gesundheit freigegeben sind', async () => {
    ladeTrainingsangebot.mockResolvedValue(ANGEBOT);
    renderWithProviders(<Angebot zugang={ZUGANG} />);
    await userEvent.click(await screen.findByLabelText('Vorgeschichte'));
    await userEvent.click(screen.getByRole('button', { name: 'Zahlungspflichtig buchen' }));
    expect(await screen.findByText(/gehen nur mit dieser Einwilligung/)).toBeInTheDocument();
    expect(angebotAnnehmen).not.toHaveBeenCalled();
  });

  it('verlangt den frühen Beginn ausdrücklich (ANN-288)', async () => {
    ladeTrainingsangebot.mockResolvedValue({ ...ANGEBOT, early_start: true });
    angebotAnnehmen.mockResolvedValue({ ...GEBUCHT, early_start_requested: true });
    renderWithProviders(<Angebot zugang={ZUGANG} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Zahlungspflichtig buchen' }));
    expect(
      await screen.findByText(/innerhalb der Widerrufsfrist. Bitte bestätigen/),
    ).toBeInTheDocument();
    expect(angebotAnnehmen).not.toHaveBeenCalled();
    await userEvent.click(screen.getByLabelText(/Ich verlange ausdrücklich/));
    await userEvent.click(screen.getByRole('button', { name: 'Zahlungspflichtig buchen' }));
    expect(angebotAnnehmen).toHaveBeenCalledWith(
      ZUGANG.access_id,
      expect.objectContaining({ fruehBeginnen: true }),
    );
  });

  it('sagt bei einer laufenden Behandlung, wann gebucht werden kann, und bietet keinen Knopf', async () => {
    ladeTrainingsangebot.mockResolvedValue({ ...ANGEBOT, blocker: 'care_open', can_accept: false });
    renderWithProviders(<Angebot zugang={ZUGANG} />);
    expect(await screen.findByText(/sobald Ihre Behandlung abgeschlossen ist/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zahlungspflichtig buchen' })).toBeNull();
  });

  it('lässt eine rechtliche Vertretung lesen, aber nicht buchen (ANN-289)', async () => {
    ladeTrainingsangebot.mockResolvedValue({ ...ANGEBOT, can_accept: false });
    renderWithProviders(
      <Angebot
        zugang={{
          ...ZUGANG,
          access_kind: 'legal_representative',
          represented_name: 'Erika Beispiel',
        }}
      />,
    );
    expect(await screen.findByText(/schließt Erika Beispiel selbst/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zahlungspflichtig buchen' })).toBeNull();
  });

  it('sagt, wenn kein Angebot vorliegt', async () => {
    ladeTrainingsangebot.mockResolvedValue(null);
    renderWithProviders(<Angebot zugang={ZUGANG} />);
    expect(
      await screen.findByText('Zurzeit liegt kein Angebot der Praxis vor.'),
    ).toBeInTheDocument();
  });
});
