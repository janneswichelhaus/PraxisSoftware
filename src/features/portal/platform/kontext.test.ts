import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Der Kontext der Plattform, wie der Client ihn liest (POR-004, DRP-N1,
 * DRP-N2): mit eigenem Namen und Rufnummer der Praxis, beide auch leer. Fehlt
 * ein Feld, ist das ein anderer Server - kein Zugang ohne Namen.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { ladePlattformkontext } = await import('./api');

const ZEILE = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: 'Erika Beispiel',
  practice_phone: '+49 7071 0000000',
};

beforeEach(() => rpc.mockReset());

describe('ladePlattformkontext', () => {
  it('liest platform_context und gibt Namen und Rufnummer weiter', async () => {
    rpc.mockResolvedValue({ data: [ZEILE], error: null });
    expect(await ladePlattformkontext()).toEqual([ZEILE]);
    expect(rpc).toHaveBeenCalledWith('platform_context');
  });

  it('nimmt beide leer: ohne lesbaren Zugang kein Name, ohne Absender keine Nummer', async () => {
    const leer = {
      ...ZEILE,
      status: 'locked',
      readable: false,
      own_name: null,
      practice_phone: null,
    };
    rpc.mockResolvedValue({ data: [leer], error: null });
    expect(await ladePlattformkontext()).toEqual([leer]);
  });

  it('weist eine Antwort ohne die beiden Felder ab', async () => {
    const ohne = Object.fromEntries(
      Object.entries(ZEILE).filter(([feld]) => feld !== 'own_name' && feld !== 'practice_phone'),
    );
    rpc.mockResolvedValue({ data: [ohne], error: null });
    await expect(ladePlattformkontext()).rejects.toThrow('Ihr Zugang konnte nicht geladen werden.');
  });
});
