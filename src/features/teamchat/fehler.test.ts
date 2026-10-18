import { describe, expect, it, vi } from 'vitest';

/**
 * Fehler des Teamchats ohne Netz (TEAM-002, Praxis-Sichtung): Nur Nachrichten
 * holt der Ausgang nach. Reagieren, Merken und Abhaken gehen direkt an den
 * Server; scheitert das, darf der Satz kein Nachholen versprechen.
 */

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { TeamchatFehler, aendereGemerkt, merke, reagiere } = await import('./api');

const vorgaenge = [
  () => reagiere('n-1', 'daumen'),
  () => merke('n-1', null),
  () => aendereGemerkt('n-1', { erledigt: true }),
];

async function fehlerVon(
  vorgang: () => Promise<unknown>,
): Promise<InstanceType<typeof TeamchatFehler>> {
  const fehler: unknown = await vorgang().then(
    () => null,
    (e: unknown) => e,
  );
  expect(fehler).toBeInstanceOf(TeamchatFehler);
  return fehler as InstanceType<typeof TeamchatFehler>;
}

describe('Ohne Netz', () => {
  it('verspricht bei Reaktion, Merken und Abhaken kein Nachholen', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    for (const vorgang of vorgaenge) {
      const fehler = await fehlerVon(vorgang);
      expect(fehler.netz).toBe(true);
      expect(fehler.message).toBe('Kein Netz – nicht angekommen. Bitte gleich noch einmal.');
      expect(fehler.message).not.toMatch(/gesendet/);
    }
  });

  it('nimmt einen Server, der gerade nicht bereit ist, wie fehlendes Netz', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'upstream' }, status: 503 });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(true);
    expect(fehler.message).toMatch(/noch einmal/);
  });

  it('nimmt eine Antwort der Datenbank als Ablehnung, auch als HTTP 500 (P0002)', async () => {
    // PostgREST schickt P0002 und andere P0-Codes als 500; der Ausgang darf
    // eine abgelehnte Nachricht nicht ohne Ende als „kein Netz“ wiederholen.
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'team message not found', code: 'P0002' },
      status: 500,
    });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toBe('Das Gespräch oder die Nachricht gibt es nicht mehr.');
  });

  it('wiederholt bei Verbindungs- und Verklemmungsfehlern der Datenbank', async () => {
    for (const code of ['08006', '40001', '40P01', '53300', '57014']) {
      rpc.mockResolvedValue({ data: null, error: { message: 'x', code }, status: 500 });
      expect((await fehlerVon(vorgaenge[0]!)).netz).toBe(true);
    }
  });

  it('nennt eine Ablehnung des Servers als solche', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not allowed' }, status: 403 });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toBe('Dafür fehlt die Berechtigung.');
  });
});
