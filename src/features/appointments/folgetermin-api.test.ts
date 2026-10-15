import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { AufDerPlattformSichtbar, undoAppointmentCreation } = await import('./folgetermin-api');

/** Befund B8: Zurücknehmen über `undo_appointment_creation`, Einwände in Worten. */
describe('undoAppointmentCreation', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('ruft den Server mit Termin und Stand, unverändert als Zeichenkette', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await undoAppointmentCreation('neu-1', '2026-10-14T07:25:00.123456+00:00');
    expect(rpc).toHaveBeenCalledWith('undo_appointment_creation', {
      p_appointment_id: 'neu-1',
      p_expected_updated_at: '2026-10-14T07:25:00.123456+00:00',
    });
  });

  // Zweitreview F2: kein Fehler für die Person, sondern ein eigener Fall -
  // die Oberfläche sagt den Termin dann ab (ANN-534).
  it('kennzeichnet einen Termin, den die Person auf der Plattform sieht', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'appointment is visible on the platform' },
    });
    await expect(undoAppointmentCreation('neu-1', 'stand')).rejects.toBeInstanceOf(
      AufDerPlattformSichtbar,
    );
  });

  it.each([
    ['undo window has passed', 'Die Zeit zum Zurücknehmen ist vorbei.'],
    ['appointment was changed meanwhile', 'Der Termin wurde inzwischen geändert.'],
    ['patient already notified', 'Die Person weiß schon von dem Termin.'],
    ['appointment creation cannot be undone', 'An dem Termin hängt schon etwas.'],
    ['not allowed to undo appointment creation', 'Zurücknehmen kann nur, wer'],
    ['appointment not found', 'Den Termin gibt es nicht mehr.'],
    ['irgendetwas anderes', 'Der Folgetermin konnte nicht zurückgenommen werden.'],
  ])('übersetzt „%s“ ohne Einzelheiten der Datenbank', async (fehler, meldung) => {
    rpc.mockResolvedValue({ data: null, error: { message: fehler } });
    const versuch = undoAppointmentCreation('neu-1', 'stand');
    await expect(versuch).rejects.toThrow(meldung);
    await expect(versuch).rejects.not.toThrow(fehler);
  });
});
