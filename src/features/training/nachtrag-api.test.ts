import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Der Nachtrag am abgeschlossenen Trainingsprotokoll: Eine Abweisung kommt als HTTP 403 mit dem
 * Körper `null`, ohne Fehlerobjekt. Ohne die Statusprüfung hieße sie „gespeichert“ (ANN-115).
 */
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc }),
}));

const { addTrainingProtocolAddendum } = await import('./api');

const TERMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
const NACHTRAG = '99999999-9999-4999-8999-000000000002';

describe('addTrainingProtocolAddendum', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('ruft den Server mit Text und Grund ohne Ränder', async () => {
    rpc.mockResolvedValue({ data: NACHTRAG, error: null, status: 200 });
    await addTrainingProtocolAddendum(TERMIN, ' Gewicht war 20 kg. ', ' Zahl vertippt ');
    expect(rpc).toHaveBeenCalledWith('add_training_protocol_addendum', {
      p_appointment_id: TERMIN,
      p_content: 'Gewicht war 20 kg.',
      p_reason: 'Zahl vertippt',
    });
  });

  it('meldet eine Abweisung mit HTTP 403 als Fehler, auch ohne Fehlerkörper', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });
    await expect(
      addTrainingProtocolAddendum(TERMIN, 'Gewicht war 20 kg.', 'Zahl vertippt'),
    ).rejects.toThrow('Der Nachtrag konnte nicht gespeichert werden.');
  });

  it('meldet eine Antwort ohne Kennung als Fehler', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 200 });
    await expect(
      addTrainingProtocolAddendum(TERMIN, 'Gewicht war 20 kg.', 'Zahl vertippt'),
    ).rejects.toThrow('Der Nachtrag konnte nicht gespeichert werden.');
  });

  it('nennt den fehlenden Grund', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'an addendum needs a reason' },
      status: 400,
    });
    await expect(addTrainingProtocolAddendum(TERMIN, 'Gewicht war 20 kg.', 'x')).rejects.toThrow(
      'Ein Nachtrag braucht einen Grund (3 bis 500 Zeichen).',
    );
  });
});
