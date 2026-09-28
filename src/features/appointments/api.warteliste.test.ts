import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { createAppointment } = await import('./api');

const WERTE = {
  appointment_type: 'home_visit' as const,
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  date: '2099-10-05',
  start_time: '09:00',
  end_time: '10:00',
  location_id: '',
};
const TERMIN = '77777777-7777-4777-8777-000000000001';
const EINTRAG = '99999999-9999-4999-8999-000000000001';

describe('createAppointment aus der Warteliste (PRX-004)', () => {
  beforeEach(() => rpc.mockReset());

  it('legt ohne Eintrag wie bisher über create_appointment an', async () => {
    rpc.mockResolvedValue({ data: TERMIN, error: null });
    await createAppointment('p1', WERTE);
    expect(rpc).toHaveBeenCalledWith(
      'create_appointment',
      expect.objectContaining({ p_patient_id: 'p1' }),
    );
  });

  it('nimmt mit Eintrag den Weg, der Termin und Eintrag in einer Transaktion schreibt', async () => {
    rpc.mockResolvedValue({ data: TERMIN, error: null });
    await createAppointment('p1', WERTE, false, 'b1', false, EINTRAG);
    const [name, params] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('create_appointment_from_waitlist');
    expect(params).toMatchObject({ p_entry_id: EINTRAG, p_treatment_basis_id: 'b1' });
    expect(params).not.toHaveProperty('p_patient_id');
  });

  it('sagt verständlich, wenn der Eintrag inzwischen geschlossen ist', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'waitlist entry closed' } });
    await expect(createAppointment('p1', WERTE, false, null, false, EINTRAG)).rejects.toThrow(
      /nicht mehr offen/,
    );
  });
});
