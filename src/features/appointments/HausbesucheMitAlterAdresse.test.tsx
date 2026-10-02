import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Hausbesuche mit alter Adresse (ABN-004).
 *
 * Geprueft wird die Darstellung und dass nichts ohne Klick passiert: Der
 * Baustein nennt die abweichenden Besuche, uebernimmt einzeln auf Klick und
 * alle nur nach Rueckfrage. Was abweicht, entscheidet der Server
 * (`supabase/tests/home-visit-address-update.test.ts`).
 */

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const fetchVeralteteHausbesuche = vi.fn();
const aktualisiereHausbesuchAdressen = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchVeralteteHausbesuche: (id: string) =>
      fetchVeralteteHausbesuche(id) as Promise<AppointmentsApi.VeralteterHausbesuch[]>,
    aktualisiereHausbesuchAdressen: (ids: readonly string[]) =>
      aktualisiereHausbesuchAdressen(ids) as Promise<number>,
  };
});

const { HausbesucheMitAlterAdresse } = await import('./HausbesucheMitAlterAdresse');

function besuch(rest: Partial<AppointmentsApi.VeralteterHausbesuch> = {}) {
  return {
    id: 'b1',
    starts_at: '2027-05-19T07:00:00.000Z',
    ends_at: '2027-05-19T08:00:00.000Z',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_city: 'Tuebingen',
    organization_time_zone: 'Europe/Berlin',
    ...rest,
  };
}

describe('HausbesucheMitAlterAdresse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aktualisiereHausbesuchAdressen.mockResolvedValue(1);
  });

  it('zeichnet nichts, wenn keine Adresse abweicht', async () => {
    fetchVeralteteHausbesuche.mockResolvedValue([]);
    renderWithProviders(
      <HausbesucheMitAlterAdresse patientId={PATIENT_ID} user={testUser(['office'])} />,
    );
    await vi.waitFor(() => expect(fetchVeralteteHausbesuche).toHaveBeenCalledWith(PATIENT_ID));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('fragt fuer Rollen ohne Terminverwaltung gar nicht erst', () => {
    fetchVeralteteHausbesuche.mockResolvedValue([besuch()]);
    renderWithProviders(
      <HausbesucheMitAlterAdresse patientId={PATIENT_ID} user={testUser(['trainer'])} />,
    );
    expect(fetchVeralteteHausbesuche).not.toHaveBeenCalled();
  });

  it('nennt den Besuch mit alter Anschrift und uebernimmt erst auf Klick', async () => {
    const user = userEvent.setup();
    fetchVeralteteHausbesuche.mockResolvedValue([besuch()]);
    renderWithProviders(
      <HausbesucheMitAlterAdresse patientId={PATIENT_ID} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByText('Ein künftiger Hausbesuch nennt noch die alte Adresse.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Beispielstrasse 12, 72070 Tuebingen/)).toBeInTheDocument();
    expect(aktualisiereHausbesuchAdressen).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Adresse übernehmen' }));
    expect(aktualisiereHausbesuchAdressen).toHaveBeenCalledWith(['b1']);
  });

  it('uebernimmt alle nur nach Rueckfrage', async () => {
    const user = userEvent.setup();
    fetchVeralteteHausbesuche.mockResolvedValue([
      besuch(),
      besuch({
        id: 'b2',
        starts_at: '2027-05-26T07:00:00.000Z',
        ends_at: '2027-05-26T08:00:00.000Z',
      }),
    ]);
    renderWithProviders(
      <HausbesucheMitAlterAdresse patientId={PATIENT_ID} user={testUser(['office'])} />,
    );

    expect(
      await screen.findByText('2 künftige Hausbesuche nennen noch die alte Adresse.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alle 2 aktualisieren' }));
    expect(aktualisiereHausbesuchAdressen).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Ja, alle aktualisieren' }));
    expect(aktualisiereHausbesuchAdressen).toHaveBeenCalledWith(['b1', 'b2']);
  });
});
