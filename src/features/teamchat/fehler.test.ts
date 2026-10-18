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

  it('nennt eine Ablehnung des Servers als solche', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not allowed' }, status: 403 });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toBe('Dafür fehlt die Berechtigung.');
  });
});
