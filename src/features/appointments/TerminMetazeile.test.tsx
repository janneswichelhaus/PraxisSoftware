import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as LageApi from './abrechnungslage-api';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

/**
 * Die Metazeile der Terminansicht erinnert in den letzten Terminen einer
 * Grundlage an das Abschlussgespräch (KND-001, ANN-286).
 */

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';

const lage: LageApi.Abrechnungslage = {
  appointment_id: TERMIN_ID,
  treatment_basis_id: '88888888-8888-4888-8888-000000000004',
  treatment_basis_kind: 'follow_up',
  treatment_basis_issued_on: '2026-09-08',
  basis_position: 9,
  basis_appointment_count: 10,
  billing_visible: false,
  recipient_kind: null,
  open_invoice_count: null,
  open_outstanding_cents: null,
  open_overdue: null,
  closing_talk_due: true,
};

const fetchAbrechnungslage = vi.fn();
vi.mock('./abrechnungslage-api', async (importOriginal) => ({
  ...(await importOriginal<typeof LageApi>()),
  fetchAbrechnungslage: (id: string) =>
    fetchAbrechnungslage(id) as Promise<LageApi.Abrechnungslage | null>,
}));

const { TerminMetazeile } = await import('./TerminKompakt');

function zeige() {
  return renderWithProviders(
    <TerminMetazeile
      appointment={testAppointment({ id: TERMIN_ID })}
      user={testUser(['therapist'])}
      darfVerwalten
      zumTermin={`/termine/${TERMIN_ID}`}
    />,
  );
}

describe('Abschlussgespräch an der Terminansicht (KND-001)', () => {
  beforeEach(() => fetchAbrechnungslage.mockReset());

  it('erinnert mit dem Weg zur Akte', async () => {
    fetchAbrechnungslage.mockResolvedValue(lage);
    zeige();
    expect(await screen.findByText(/Zeit für das Abschlussgespräch/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Training in der Akte anbieten' })).toHaveAttribute(
      'href',
      `/patienten/66666666-6666-4666-8666-000000000001?zurueck=${encodeURIComponent(`/termine/${TERMIN_ID}`)}`,
    );
  });

  it('schweigt, wenn der Server nichts meldet', async () => {
    fetchAbrechnungslage.mockResolvedValue({ ...lage, closing_talk_due: false });
    zeige();
    expect(await screen.findByText(/Termin 9 von 10/)).toBeInTheDocument();
    expect(screen.queryByText(/Abschlussgespräch/)).toBeNull();
  });
});
