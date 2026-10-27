import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { TAGESLAGE, tageslageNeuLaden } from './tageslage';

/** UBK-011: Nach einer Terminänderung stimmen Fahrzeiten ohne Neuladen. */
describe('tageslageNeuLaden', () => {
  it('laedt Terminliste, Tagesliste, Tagesroute und Fahrpuffer neu', async () => {
    const client = new QueryClient();
    const neuLaden = vi.spyOn(client, 'invalidateQueries');
    await tageslageNeuLaden(client);
    expect(neuLaden.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
      ['appointments'],
      ['day-plan'],
      ['day-route'],
      ['travel-buffers'],
    ]);
    expect(TAGESLAGE).toHaveLength(4);
  });
});
