import { describe, expect, it } from 'vitest';
import type { WartendeEinheit } from './ablage';
import { heutigeEinheit, istBeendet, uebungErledigt } from './haken';

/**
 * Die heutige Einheit eines Plans aus Server und Gerät (BEF-218, ANN-730):
 * eine Rechnung für den Start der Durchführung und die Vorschau im Reiter.
 */
const HEUTE = '2026-10-08';
const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';
const PLAN = 'aaaaaaaa-0000-4000-8000-000000000001';
const SERVER = 'cccccccc-0000-4000-8000-000000000001';

type Ereignis = WartendeEinheit['ereignisse'][number];

function satz(item: string, durchgang: number, done = true): Ereignis {
  return {
    id: `satz-${item}-${durchgang}-${String(done)}`,
    kind: 'set',
    at: `${HEUTE}T08:00:00.000Z`,
    item_id: item,
    set_number: durchgang,
    done,
  };
}

const ENDE: Ereignis = {
  id: 'ende',
  kind: 'finish',
  at: `${HEUTE}T08:30:00.000Z`,
  note: '',
  values: {},
};

function einheit(id: string, ereignisse: Ereignis[], teil: Partial<WartendeEinheit> = {}) {
  return {
    id,
    zugangId: ZUGANG,
    planId: PLAN,
    tag: HEUTE,
    begonnenAm: `${HEUTE}T08:00:00.000Z`,
    ereignisse,
    ...teil,
  };
}

const offen = { id: SERVER, sets: [{ item_id: 'a', set_number: 1 }] };

describe('heutigeEinheit', () => {
  it('ohne Gerät: die beim Server offene Einheit mit ihren Haken', () => {
    const e = heutigeEinheit({ id: PLAN, open_session: offen }, ZUGANG, [], HEUTE);
    expect(e.id).toBe(SERVER);
    expect([...e.haken]).toEqual(['a:1']);
    expect(e.lokal).toBeNull();
    expect(e.beendetAufGeraet).toBe(false);
  });

  it('legt die Haken des Geräts über die des Servers - gesetzt und zurückgenommen', () => {
    const lokal = einheit(SERVER, [satz('a', 2), satz('a', 1, false), satz('b', 1)]);
    const e = heutigeEinheit({ id: PLAN, open_session: offen }, ZUGANG, [lokal], HEUTE);
    expect(e.id).toBe(SERVER);
    expect(e.lokal).toBe(lokal);
    expect([...e.haken].sort()).toEqual(['a:2', 'b:1']);
  });

  it('eine auf dem Gerät beendete Server-Einheit ist nicht mehr offen (BEF-213)', () => {
    const e = heutigeEinheit(
      { id: PLAN, open_session: offen },
      ZUGANG,
      [einheit(SERVER, [satz('a', 2), ENDE])],
      HEUTE,
    );
    expect(e.id).toBeNull();
    expect(e.haken.size).toBe(0);
    expect(e.beendetAufGeraet).toBe(true);
  });

  it('nach einer beendeten geht eine heute neu begonnene Einheit weiter', () => {
    const neu = einheit('dddddddd-0000-4000-8000-000000000002', [satz('b', 1)]);
    const e = heutigeEinheit(
      { id: PLAN, open_session: null },
      ZUGANG,
      [einheit('dddddddd-0000-4000-8000-000000000001', [satz('a', 1), ENDE]), neu],
      HEUTE,
    );
    expect(e.id).toBe(neu.id);
    expect([...e.haken]).toEqual(['b:1']);
    expect(e.beendetAufGeraet).toBe(true);
  });

  it('übergeht Einheiten anderer Tage, Pläne und Zugänge', () => {
    const e = heutigeEinheit(
      { id: PLAN, open_session: null },
      ZUGANG,
      [
        einheit('1', [satz('a', 1)], { tag: '2026-10-07' }),
        einheit('2', [satz('a', 1), ENDE], { planId: 'anderer-plan' }),
        einheit('3', [satz('a', 1)], { zugangId: 'anderer-zugang' }),
      ],
      HEUTE,
    );
    expect(e).toEqual({ id: null, lokal: null, haken: new Set(), beendetAufGeraet: false });
  });
});

describe('uebungErledigt und istBeendet', () => {
  it('erledigt ist eine Übung erst mit allen Durchgängen', () => {
    expect(uebungErledigt({ id: 'a', sets: 2 }, new Set(['a:1']))).toBe(false);
    expect(uebungErledigt({ id: 'a', sets: 2 }, new Set(['a:1', 'a:2']))).toBe(true);
  });

  it('beendet ist eine Einheit mit ihrem Ende', () => {
    expect(istBeendet({ ereignisse: [satz('a', 1)] })).toBe(false);
    expect(istBeendet({ ereignisse: [satz('a', 1), ENDE] })).toBe(true);
  });
});
