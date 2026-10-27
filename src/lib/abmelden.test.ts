import { describe, expect, it, vi } from 'vitest';
import { abmeldenAufraeumen, beimAbmeldenLeeren } from './abmelden';

describe('Aufräumen beim Abmelden', () => {
  it('leert jedes eingetragene Modul, ein zweimal eingetragenes einmal', () => {
    const doku = vi.fn();
    const teamchat = vi.fn();
    beimAbmeldenLeeren(doku);
    beimAbmeldenLeeren(teamchat);
    beimAbmeldenLeeren(doku);

    abmeldenAufraeumen();

    expect(doku).toHaveBeenCalledTimes(1);
    expect(teamchat).toHaveBeenCalledTimes(1);
  });

  it('leert die übrigen auch, wenn einer wirft, und meldet den Fehler danach', () => {
    const spaeter = vi.spyOn(globalThis, 'queueMicrotask').mockImplementation(() => undefined);
    const fehler = new Error('kaputt');
    const wirft = vi.fn(() => {
      throw fehler;
    });
    const danach = vi.fn();
    beimAbmeldenLeeren(wirft);
    beimAbmeldenLeeren(danach);

    expect(() => abmeldenAufraeumen()).not.toThrow();

    expect(danach).toHaveBeenCalledTimes(1);
    const gemeldet = spaeter.mock.calls[0]?.[0];
    expect(gemeldet).toBeTypeOf('function');
    expect(() => gemeldet?.()).toThrow(fehler);
    spaeter.mockRestore();
  });
});
