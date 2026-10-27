import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import type * as PlattformApi from './api';

/**
 * Die Ablage in offener Sitzung (TRK-008): Nach einer Übertragung, bei der
 * eine Einheit ankam, lädt sie die Pläne neu - sonst rechnete die Vorschau
 * nach dem Wiederverbinden mit dem alten Stand des Servers weiter (BEF-218,
 * Design-Review H5).
 */

const einheitUebertragen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  einheitUebertragen: (...args: unknown[]) => einheitUebertragen(...args) as Promise<unknown>,
}));
vi.mock('@/features/core/auth/freigabeOhneNetz', () => ({
  schluesselAblegen: () => Promise.resolve(),
}));

const { PlattformAblage } = await import('./PlattformAblage');
const { ablageZuruecksetzen, ereignisAblegen } = await import('./ablage');

const KONTO = 'eeeeeeee-0000-4000-8000-000000000001';
const EINHEIT = {
  id: 'dddddddd-0000-4000-8000-000000000001',
  zugangId: 'cafecafe-cafe-4afe-8afe-000000000002',
  planId: 'aaaaaaaa-0000-4000-8000-000000000001',
  tag: '2026-10-08',
  begonnenAm: '2026-10-08T08:00:00.000Z',
};

async function beendeteEinheitAufDemGeraet() {
  await ereignisAblegen(KONTO, EINHEIT, {
    id: 'ffffffff-0000-4000-8000-000000000001',
    kind: 'set',
    at: '2026-10-08T08:01:00.000Z',
    item_id: 'bbbbbbbb-0000-4000-8000-000000000001',
    set_number: 1,
    done: true,
  });
  await ereignisAblegen(KONTO, EINHEIT, {
    id: 'ffffffff-0000-4000-8000-000000000002',
    kind: 'finish',
    at: '2026-10-08T08:30:00.000Z',
    note: '',
    values: {},
  });
}

function zeige() {
  const client = new QueryClient();
  const neuLaden = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <PlattformAblage besitzer={KONTO} zugaenge={[]}>
        {null}
      </PlattformAblage>
    </QueryClientProvider>,
  );
  return neuLaden;
}

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
  ablageZuruecksetzen();
  einheitUebertragen.mockReset();
});

afterEach(() => {
  ablageZuruecksetzen();
});

describe('PlattformAblage', () => {
  it('lädt die Pläne neu, wenn eine Einheit angekommen ist', async () => {
    await beendeteEinheitAufDemGeraet();
    einheitUebertragen.mockResolvedValue({
      session_id: EINHEIT.id,
      status: 'finished',
      note_dropped: false,
    });
    const neuLaden = zeige();
    await waitFor(() =>
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['platform-exercise-plans'] }),
    );
    expect(einheitUebertragen).toHaveBeenCalledTimes(1);
  });

  it('lädt nichts neu, wenn ohne Netz nichts ankam', async () => {
    await beendeteEinheitAufDemGeraet();
    einheitUebertragen.mockRejectedValue(
      new Error('Nicht übertragen. Bitte die Verbindung prüfen.'),
    );
    const neuLaden = zeige();
    await waitFor(() => expect(einheitUebertragen).toHaveBeenCalled());
    await new Promise((weiter) => setTimeout(weiter, 50));
    expect(neuLaden).not.toHaveBeenCalled();
  });
});
