import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as GrundlagenApi from './api';
import { renderWithProviders } from '@/test-utils';

const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';
const PATIENT = '66666666-6666-4666-8666-000000000001';

const releaseTreatmentBasisForBilling = vi.fn();
const withdrawTreatmentBasisFromBilling = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof GrundlagenApi>();
  return {
    ...actual,
    releaseTreatmentBasisForBilling: (id: string) =>
      releaseTreatmentBasisForBilling(id) as Promise<void>,
    withdrawTreatmentBasisFromBilling: (id: string) =>
      withdrawTreatmentBasisFromBilling(id) as Promise<void>,
  };
});

const { AbrechnungDerGrundlage } = await import('./Freigabe');

function kontingent(
  overrides: Partial<GrundlagenApi.TreatmentBasisKontingent> = {},
): GrundlagenApi.TreatmentBasisKontingent {
  return {
    treatment_basis_id: GRUNDLAGE,
    prescribed: 10,
    used: 0,
    planned: 10,
    upcoming: 0,
    remaining: 0,
    covered: 10,
    uncovered: 0,
    performed: 10,
    documented: 10,
    open_count: 0,
    past_open: 0,
    state: 'abrechnen',
    released_at: null,
    invoiced: false,
    can_release: true,
    ...overrides,
  };
}

function rendern(
  stand: Partial<GrundlagenApi.TreatmentBasisKontingent> = {},
  darfZurueckholen = true,
) {
  return renderWithProviders(
    <AbrechnungDerGrundlage
      kontingent={kontingent(stand)}
      patientId={PATIENT}
      darfZurueckholen={darfZurueckholen}
      zeitzone="Europe/Berlin"
    />,
  );
}

describe('Abrechnung einer Verordnung in der Akte (B1, B7)', () => {
  beforeEach(() => {
    releaseTreatmentBasisForBilling.mockReset();
    withdrawTreatmentBasisFromBilling.mockReset();
    releaseTreatmentBasisForBilling.mockResolvedValue(undefined);
    withdrawTreatmentBasisFromBilling.mockResolvedValue(undefined);
  });

  it('nennt Zustand und Stand und stellt eine fertige Verordnung mit einem Tipp in die Abrechnung', async () => {
    const user = userEvent.setup();
    rendern();
    expect(screen.getByText('Abrechnen')).toBeInTheDocument();
    expect(screen.getByText(/10 von 10 erbracht · 10 dokumentiert/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'In die Abrechnung stellen' }));
    await waitFor(() => expect(releaseTreatmentBasisForBilling).toHaveBeenCalledWith(GRUNDLAGE));
    expect(
      await screen.findByText('In die Abrechnung gestellt. Doku und Termine sind jetzt gesperrt.'),
    ).toBeInTheDocument();
  });

  it('stellt auch eine früher beendete Behandlung in die Abrechnung - mit der echten Zahl', () => {
    rendern({ performed: 6, documented: 6, state: 'termine_fehlen' });
    expect(screen.getByText('Termine fehlen')).toBeInTheDocument();
    expect(screen.getByText(/6 von 10 erbracht · 6 dokumentiert/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'In die Abrechnung stellen' })).toBeInTheDocument();
  });

  it('bietet nichts an, solange Haken oder Doku fehlen', () => {
    rendern({ state: 'nachholen', past_open: 1, open_count: 1, can_release: false });
    expect(screen.getByText('Haken oder Doku fehlt')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('meldet, was der Server abweist', async () => {
    releaseTreatmentBasisForBilling.mockRejectedValue(
      new Error(
        'Es sind noch Termine offen: Jeder Termin der Verordnung braucht Haken und festgeschriebene Doku.',
      ),
    );
    const user = userEvent.setup();
    rendern();
    await user.click(screen.getByRole('button', { name: 'In die Abrechnung stellen' }));
    expect(await screen.findByText(/Es sind noch Termine offen/)).toBeInTheDocument();
  });

  it('holt eine freigegebene Verordnung zurück', async () => {
    const user = userEvent.setup();
    rendern({ state: 'in_abrechnung', released_at: '2027-05-13T22:30:00Z', can_release: false });
    // Der Tag in der Zeitzone der Praxis, nicht in UTC.
    expect(screen.getByText('In der Abrechnung seit 14.05.2027')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Aus der Abrechnung zurückholen' }));
    await waitFor(() => expect(withdrawTreatmentBasisFromBilling).toHaveBeenCalledWith(GRUNDLAGE));
    expect(
      await screen.findByText('Zurückgeholt. Doku und Termine lassen sich wieder ändern.'),
    ).toBeInTheDocument();
  });

  it('bietet das Zurückholen nur an, wer es darf, und nicht nach der Rechnung', () => {
    const { unmount } = rendern(
      { state: 'in_abrechnung', released_at: '2027-05-13T09:00:00Z', can_release: false },
      false,
    );
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    rendern({
      state: 'abgerechnet',
      released_at: '2027-05-13T09:00:00Z',
      invoiced: true,
      can_release: false,
    });
    expect(screen.getByText('Abgerechnet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
