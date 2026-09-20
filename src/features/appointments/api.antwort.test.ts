import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Was die Oberfläche zeigt, wenn eine Serverfunktion etwas Unerwartetes
 * zurückgibt (R3-023).
 *
 * Bis zu diesem Test warf `z.number().parse(data)` einen `ZodError`, dessen
 * `message` ein englischer JSON-Text ist — und die Seiten zeigen
 * `mutation.error.message` unverändert an. Geprüft wird deshalb der Satz, der
 * wirklich im Bildschirm landet.
 */

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { addAppointmentNotification, cancelStaffDay, createAppointmentSeries } =
  await import('./api');

const TERMIN = '77777777-7777-4777-8777-000000000001';
const ANNA = '55555555-5555-4555-8555-000000000002';

async function meldung(vorgang: () => Promise<unknown>): Promise<string> {
  try {
    await vorgang();
  } catch (fehler) {
    return (fehler as Error).message;
  }
  throw new Error('Der Vorgang hätte scheitern müssen.');
}

describe('Unerwartete Antwortform', () => {
  beforeEach(() => {
    rpc.mockReset();
    // Kein Fehler, aber auch keine Zahl: genau die Lage, in der bisher der
    // ZodError-Text im Bildschirm stand.
    rpc.mockResolvedValue({ data: 'abc', error: null });
  });

  it('meldet den deutschen Satz statt des ZodError-Texts', async () => {
    const satz = await meldung(() => addAppointmentNotification([TERMIN], 'phone'));

    expect(satz).toBe('Der Vermerk konnte nicht gespeichert werden.');
    expect(satz.startsWith('[')).toBe(false);
    expect(satz).not.toMatch(/expected|invalid_type/);
  });

  it('gilt auch für die Serie und den Tagesabbruch', async () => {
    expect(await meldung(() => cancelStaffDay(ANNA, '2027-05-12', 'practice_request'))).toBe(
      'Der Tag konnte nicht umgeplant werden.',
    );

    const serie = await meldung(() =>
      createAppointmentSeries(
        '66666666-6666-4666-8666-000000000002',
        '88888888-8888-4888-8888-000000000004',
        {
          staff_member_id: ANNA,
          appointment_type: 'practice',
          location_id: '33333333-3333-4333-8333-000000000001',
          date: '2027-05-12',
          start_time: '09:00',
          end_time: '09:45',
        },
        [],
      ),
    );
    expect(serie).toBe('Die Terminserie konnte nicht angelegt werden.');
  });
});
