import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import type * as TeamchatApi from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * BEF-191: Ändert eine Person ihr Bild, sehen es die anderen an
 * Nachrichten, die schon dastehen - ohne die Seite neu zu laden. Die Liste der
 * Bilder lädt dafür im Takt der Zähler nach.
 */

const fetchAvatare = vi.fn<() => Promise<TeamchatApi.Avatar[]>>();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamchatApi>()),
  fetchAvatare: () => fetchAvatare(),
  ladeProfilbild: (id: string) => Promise.resolve(`blob:bild-${id}`),
}));

const { Teambild } = await import('./Teambild');
const { ZAEHLER_MS } = await import('./api');

const ANNA = '55555555-5555-4555-8555-000000000002';

afterEach(() => {
  vi.useRealTimers();
});

describe('Teambild', () => {
  it('folgt einem neuen Bild ohne Neuladen der Seite', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchAvatare.mockResolvedValue([
      { staff_member_id: ANNA, color: 'ozean', picture_id: null, own: false },
    ]);
    const { container } = renderWithProviders(
      <Teambild staffMemberId={ANNA} name="Anna Beispiel" />,
    );
    expect(await screen.findByText('AB')).toBeInTheDocument();

    // Anna setzt ein Bild; die schon gezeigte Nachricht folgt im nächsten Takt.
    fetchAvatare.mockResolvedValue([
      { staff_member_id: ANNA, color: 'ozean', picture_id: 'bild-1', own: false },
    ]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ZAEHLER_MS + 1_000);
    });
    await waitFor(() =>
      expect(container.querySelector('[data-personenbild="foto"]')).toHaveAttribute(
        'src',
        'blob:bild-bild-1',
      ),
    );
    expect(screen.queryByText('AB')).toBeNull();
  });
});
