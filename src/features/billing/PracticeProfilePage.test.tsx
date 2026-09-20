import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchPraxisStammdaten = vi.fn();
const savePraxisStammdaten = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchPraxisStammdaten: () =>
      fetchPraxisStammdaten() as Promise<BillingApi.PraxisStammdaten | null>,
    savePraxisStammdaten: (...args: unknown[]) => savePraxisStammdaten(...args) as Promise<void>,
  };
});

const { PracticeProfilePage } = await import('./PracticeProfilePage');

function stammdaten(rest: Partial<BillingApi.PraxisStammdaten> = {}): BillingApi.PraxisStammdaten {
  return {
    legal_name: 'Test Praxis Tuebingen',
    street: 'Musterallee',
    house_number: '1',
    postal_code: '72070',
    city: 'Tuebingen',
    phone: null,
    email: null,
    tax_number: '86123/45678',
    vat_id: null,
    small_business: false,
    bank_name: null,
    account_holder: null,
    iban: 'DE02120300000000202051',
    bic: null,
    invoice_number_prefix: 'RG',
    payment_term_days: 14,
    ...rest,
  };
}

describe('PracticeProfilePage', () => {
  beforeEach(() => {
    fetchPraxisStammdaten.mockReset();
    savePraxisStammdaten.mockReset();
    savePraxisStammdaten.mockResolvedValue(undefined);
  });

  it('zeigt dem Office die Angaben als Auskunft, ohne Formular (ANN-074)', async () => {
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['office'])} />,
      '/abrechnung/stammdaten',
    );

    expect(await screen.findByText('Test Praxis Tuebingen')).toBeInTheDocument();
    expect(screen.getByText('Regelbesteuerung')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
  });

  it('sagt dem Office, dass ohne Stammdaten keine Rechnung entsteht', async () => {
    fetchPraxisStammdaten.mockResolvedValue(null);

    renderWithProviders(
      <PracticeProfilePage user={testUser(['office'])} />,
      '/abrechnung/stammdaten',
    );

    expect(await screen.findByText(/noch keine Praxis-Stammdaten erfasst/)).toBeInTheDocument();
  });

  it('belegt den Umsatzsteuerstatus nicht vor, wenn es noch keine Angabe gibt', async () => {
    fetchPraxisStammdaten.mockResolvedValue(null);

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const auswahl = await screen.findByLabelText(/Umsatzsteuerlicher Status/);
    expect(auswahl).toHaveValue('');
  });

  it('weist das Speichern ohne Umsatzsteuerstatus ab, statt ihn zu raten', async () => {
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const auswahl = await screen.findByLabelText(/Umsatzsteuerlicher Status/);
    await nutzer.selectOptions(auswahl, '');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByText('Der umsatzsteuerliche Status fehlt.')).toBeInTheDocument();
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('weist eine unvollstaendige IBAN ab, bevor gespeichert wird', async () => {
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const iban = await screen.findByLabelText('IBAN');
    await nutzer.clear(iban);
    await nutzer.type(iban, 'DE02');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByText('Die IBAN ist unvollständig.')).toBeInTheDocument();
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('weist eine IBAN mit falscher Pruefziffer ab (R3-010)', async () => {
    // Vollständig, aber vertippt: Die Form stimmt, die Prüfziffer nicht. Der
    // Server weist dasselbe ab — hier fällt es auf, bevor die Nummer in den
    // Snapshot der nächsten Rechnung wandert.
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten());

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const iban = await screen.findByLabelText('IBAN');
    await nutzer.clear(iban);
    await nutzer.type(iban, 'DE00123456780000000000');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByText('Die IBAN stimmt nicht — bitte Ziffern prüfen.')).toBeInTheDocument();
    expect(savePraxisStammdaten).not.toHaveBeenCalled();
  });

  it('speichert die Angaben und sagt, dass ausgestellte Rechnungen unberuehrt bleiben', async () => {
    const nutzer = userEvent.setup();
    fetchPraxisStammdaten.mockResolvedValue(stammdaten({ small_business: true }));

    renderWithProviders(
      <PracticeProfilePage user={testUser(['owner'])} />,
      '/abrechnung/stammdaten',
    );

    const name = await screen.findByLabelText('Praxis');
    await nutzer.clear(name);
    await nutzer.type(name, 'Praxis Neu');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(savePraxisStammdaten).toHaveBeenCalledWith(
      expect.objectContaining({ legal_name: 'Praxis Neu', small_business: true }),
    );
    expect(
      await screen.findByText(/Ausgestellte Rechnungen bleiben davon unberührt/),
    ).toBeInTheDocument();
  });
});
