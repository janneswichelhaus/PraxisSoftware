import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as LageApi from './abrechnungslage-api';
import type * as LeistungenApi from './leistungenAmTermin';
import type * as BillingApi from '@/features/billing/api';
import type * as GrundlagenApi from '@/features/treatment-bases/api';
import type { RoleKey } from '@/features/session/types';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';
import type { Appointment } from './api';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';

function lage(overrides: Partial<LageApi.Abrechnungslage> = {}): LageApi.Abrechnungslage {
  return {
    appointment_id: TERMIN_ID,
    treatment_basis_id: GRUNDLAGE,
    treatment_basis_kind: 'first',
    treatment_basis_issued_on: '2027-04-01',
    basis_position: 2,
    basis_appointment_count: 10,
    billing_visible: false,
    recipient_kind: null,
    open_invoice_count: null,
    open_outstanding_cents: null,
    open_overdue: null,
    closing_talk_due: false,
    ...overrides,
  };
}

const ohneErfassung: LeistungenApi.LeistungenAmTermin = {
  appointment_id: TERMIN_ID,
  can_record: false,
  services: [],
  recorded_at: null,
  recorded_by_name: null,
  basis_items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 1 }],
  session_fee_cents: null,
};

const fetchAbrechnungslage = vi.fn();
vi.mock('./abrechnungslage-api', async (importOriginal) => {
  const actual = await importOriginal<typeof LageApi>();
  return {
    ...actual,
    fetchAbrechnungslage: (id: string) =>
      fetchAbrechnungslage(id) as Promise<LageApi.Abrechnungslage | null>,
  };
});

const fetchLeistungenAmTermin = vi.fn();
vi.mock('./leistungenAmTermin', async (importOriginal) => {
  const actual = await importOriginal<typeof LeistungenApi>();
  return {
    ...actual,
    fetchLeistungenAmTermin: (id: string) =>
      fetchLeistungenAmTermin(id) as Promise<LeistungenApi.LeistungenAmTermin | null>,
  };
});

const fetchHonorar = vi.fn();
vi.mock('@/features/billing/api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchHonorar: (id: string) => fetchHonorar(id) as Promise<BillingApi.Honorarstand | null>,
  };
});

const releaseTreatmentBasisForBilling = vi.fn();
vi.mock('@/features/treatment-bases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof GrundlagenApi>();
  return {
    ...actual,
    releaseTreatmentBasisForBilling: (id: string) =>
      releaseTreatmentBasisForBilling(id) as Promise<void>,
  };
});

const { LeistungAmTermin } = await import('./LeistungAmTermin');

function rendern(
  termin: Partial<Appointment> = {},
  rollen: RoleKey[] = ['therapist'],
): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <LeistungAmTermin appointment={testAppointment(termin)} user={testUser(rollen)} />,
  );
}

describe('Leistung am Termin (B7, BEF-157)', () => {
  beforeEach(() => {
    fetchAbrechnungslage.mockReset();
    fetchLeistungenAmTermin.mockReset();
    fetchHonorar.mockReset();
    releaseTreatmentBasisForBilling.mockReset();
    fetchAbrechnungslage.mockResolvedValue(lage());
    fetchLeistungenAmTermin.mockResolvedValue(ohneErfassung);
    fetchHonorar.mockResolvedValue({
      current_cents: 4500,
      current_source: 'tariff',
      current_valid_from: '2027-01-01',
      agreements: [],
    });
    releaseTreatmentBasisForBilling.mockResolvedValue(undefined);
  });

  it('zeigt die Stelle in der Verordnung und das Heilmittel - ohne etwas abzuhaken', async () => {
    rendern();
    expect(await screen.findByText('2. von 10 Terminen · Krankengymnastik')).toBeInTheDocument();
    expect(screen.getByText('Haken fehlt')).toBeInTheDocument();
    // Keine Heilmittel-Bestätigung mehr (ersetzt ANN-475).
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('gilt mit dem Haken als erbracht', async () => {
    fetchAbrechnungslage.mockResolvedValue(lage({ checked_at: '2027-05-12T08:00:00Z' }));
    rendern({ status: 'completed', completed_at: '2027-05-12T08:00:00Z' });
    expect(await screen.findByText('Erbracht')).toBeInTheDocument();
    expect(screen.getByText('Abrechenbar mit der festgeschriebenen Doku.')).toBeInTheDocument();
  });

  it('nennt eine festgeschriebene Doku ohne Haken nicht erbracht (B4)', async () => {
    fetchAbrechnungslage.mockResolvedValue(lage({ checked_at: null }));
    rendern({ status: 'documented', completed_at: null });
    expect(await screen.findByText('Haken fehlt')).toBeInTheDocument();
    expect(screen.queryByText('Erbracht')).toBeNull();
  });

  it('schlägt die Freigabe vor, wenn die Verordnung vollständig ist, und stellt sie mit einem Tipp', async () => {
    fetchAbrechnungslage.mockResolvedValue(
      lage({
        basis_position: 10,
        checked_at: '2027-05-12T08:00:00Z',
        basis_performed: 10,
        basis_complete: true,
        basis_ready: true,
        can_release: true,
      }),
    );
    const user = userEvent.setup();
    rendern({ status: 'documented', completed_at: '2027-05-12T08:00:00Z' });

    // Den Stand nennt die Zeile darüber; der Vorschlag ist nur der Knopf.
    expect(await screen.findByText('10. von 10 Terminen · Krankengymnastik')).toBeInTheDocument();
    expect(screen.queryByText(/Verordnung vollständig/)).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'In die Abrechnung stellen' }));
    await waitFor(() => expect(releaseTreatmentBasisForBilling).toHaveBeenCalledWith(GRUNDLAGE));
    expect(
      await screen.findByText('In die Abrechnung gestellt. Doku und Termine sind jetzt gesperrt.'),
    ).toBeInTheDocument();
  });

  it('schlägt nichts vor, solange die Verordnung nicht vollständig ist', async () => {
    fetchAbrechnungslage.mockResolvedValue(
      lage({ checked_at: '2027-05-12T08:00:00Z', basis_complete: false, can_release: true }),
    );
    rendern({ status: 'documented', completed_at: '2027-05-12T08:00:00Z' });
    expect(await screen.findByText('Erbracht')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In die Abrechnung stellen' })).toBeNull();
  });

  it('zeigt an einer freigegebenen Verordnung den Stand, ohne Weg zurück am Termin', async () => {
    fetchAbrechnungslage.mockResolvedValue(
      lage({
        checked_at: '2027-05-12T08:00:00Z',
        basis_released_at: '2027-05-13T09:00:00Z',
        basis_complete: true,
        can_release: true,
      }),
    );
    rendern({ status: 'documented', completed_at: '2027-05-12T08:00:00Z' });
    expect(await screen.findByText('In der Abrechnung seit 13.05.2027')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('zeigt ohne Verordnung der Therapeut:in, dass das Büro abrechnet - ohne Betrag', async () => {
    fetchAbrechnungslage.mockResolvedValue(
      lage({ treatment_basis_id: null, basis_position: null, basis_appointment_count: null }),
    );
    rendern();
    expect(await screen.findByText('Ohne Verordnung · rechnet das Büro ab')).toBeInTheDocument();
    expect(fetchHonorar).not.toHaveBeenCalled();
  });

  it('zeigt ohne Verordnung dem Büro den Betrag (ABR-031)', async () => {
    fetchAbrechnungslage.mockResolvedValue(
      lage({ treatment_basis_id: null, basis_position: null, basis_appointment_count: null }),
    );
    fetchLeistungenAmTermin.mockResolvedValue({ ...ohneErfassung, basis_items: null });
    rendern({}, ['office']);
    expect(await screen.findByText(/^Ohne Verordnung · 45,00/)).toBeInTheDocument();
  });

  it('zeigt an Training, Absage und Nichtantreffen nichts', async () => {
    for (const termin of [
      { kind: 'training' as const },
      { status: 'cancelled' as const },
      { status: 'no_show' as const },
    ]) {
      const { container, unmount } = rendern(termin);
      await waitFor(() => expect(fetchAbrechnungslage).toHaveBeenCalled());
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });
});
