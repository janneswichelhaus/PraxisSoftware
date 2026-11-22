// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { stelleMerken, stelleNehmen } from './stelle';

describe('Stelle in der Übersicht (Jannes 2026-11-22)', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('gibt die gemerkte Zeile einmal zurück', () => {
    stelleMerken({ tag: '2026-11-23', termin: 't-1', oben: 240, zeit: 1_000 });
    expect(stelleNehmen('2026-11-23', 2_000)).toEqual({
      tag: '2026-11-23',
      termin: 't-1',
      oben: 240,
      zeit: 1_000,
    });
    expect(stelleNehmen('2026-11-23', 2_000)).toBeNull();
  });

  it('vergisst einen anderen Tag, einen alten Stand und eine verstellte Kennung', () => {
    stelleMerken({ tag: '2026-11-22', termin: 't-1', oben: 0, zeit: 0 });
    expect(stelleNehmen('2026-11-23', 0)).toBeNull();
    stelleMerken({ tag: '2026-11-23', termin: 't-1', oben: 0, zeit: 0 });
    expect(stelleNehmen('2026-11-23', 61 * 60 * 1000)).toBeNull();
    stelleMerken({ tag: '2026-11-23', termin: '"] body [x="', oben: 0, zeit: 0 });
    expect(stelleNehmen('2026-11-23', 0)).toBeNull();
  });
});
