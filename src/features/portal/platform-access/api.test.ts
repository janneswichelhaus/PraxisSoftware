import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc }) }));

const { invitePlatformAccess } = await import('./api');

const MAX = '66666666-6666-4666-8666-000000000001';

describe('Einladung zur Plattform: Abweisungen in der Sprache der Praxis', () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it('sagt, dass es ein neues Kennwort nur vor Ort gibt (ADR-023 Punkt 10)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'reset only on site' } });
    await expect(invitePlatformAccess('treatment', MAX, 'email', true)).rejects.toThrow(
      'Die Person nutzt ihren Zugang schon. Ein neues Kennwort gibt es nur vor Ort.',
    );
  });
});
