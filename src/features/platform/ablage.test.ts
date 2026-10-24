import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PlattformApi from './api';
import type { Uebertragung } from './api';
import { fachAendern, fachLesen, speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
import { eigenerPlan } from './testdaten';

/**
 * Plan und Warteschlange auf dem Gerät (TRK-008, ADR-024 Punkte 5, 7, 8;
 * ANN-358).
 */

const einheitUebertragen = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  einheitUebertragen: (...a: unknown[]) => einheitUebertragen(...a) as Promise<Uebertragung>,
}));

const {
  abgelegteZugaenge,
  abgelegterPlan,
  ablageZuruecksetzen,
  ereignisAblegen,
  geraetetag,
  plaeneAblegen,
  uebertragen,
  wartendeEinheiten,
  zugaengeAbgleichen,
} = await import('./ablage');
const { UebertragungAbgewiesen } = await import('./api');

const KONTO = 'konto-erika';
const ZUGANG = 'zugang-behandlung';
const PLAN = eigenerPlan();

function haken(id: string, satz = 1) {
  return {
    id,
    kind: 'set' as const,
    at: '2026-10-12T06:00:00.000Z',
    item_id: PLAN.items[0]!.id,
    set_number: satz,
    done: true,
  };
}

function kopf(id = 'einheit-1') {
  return {
    id,
    zugangId: ZUGANG,
    planId: PLAN.id,
    tag: geraetetag(),
    begonnenAm: '2026-10-12T05:59:00.000Z',
  };
}

beforeEach(() => {
  speicherSetzen(speicherImSpeicher());
  ablageZuruecksetzen();
  einheitUebertragen.mockReset();
  einheitUebertragen.mockImplementation((_z: string, e: { id: string }) =>
    Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
  );
});

describe('Plan auf dem Gerät (ADR-024 Punkt 5)', () => {
  it('legt nur laufende Pläne ab, an denen geübt werden darf, mit den Feldern der Durchführung', async () => {
    await plaeneAblegen(KONTO, ZUGANG, null, {
      today: geraetetag(),
      plans: [
        PLAN,
        eigenerPlan({ id: 'beendet', status: 'ended', can_exercise: false }),
        eigenerPlan({ id: 'gesperrt', can_exercise: false }),
        eigenerPlan({ id: 'leer', items: [] }),
      ],
    });
    const [zugang] = await abgelegteZugaenge(KONTO);
    expect(zugang!.plaene.map((p) => p.id)).toEqual([PLAN.id]);
    // Nicht mehr als die Ansicht braucht: keine Laufzeit, keine Übungstage,
    // keine früheren Einheiten.
    expect(Object.keys(zugang!.plaene[0]!).sort()).toEqual(
      ['id', 'items', 'note_allowed', 'open_session', 'service_area', 'title'].sort(),
    );
    const roh = JSON.stringify(await fachLesen(KONTO, 'plattform'));
    expect(roh).not.toContain('recent_sessions');
    expect(roh).not.toContain('runs_until');
  });

  it('was der Server nicht mehr nennt, fällt: Plan und Zugang', async () => {
    await plaeneAblegen(KONTO, ZUGANG, null, { today: geraetetag(), plans: [PLAN] });
    await plaeneAblegen(KONTO, 'zugang-training', null, { today: geraetetag(), plans: [PLAN] });
    await plaeneAblegen(KONTO, ZUGANG, null, { today: geraetetag(), plans: [] });
    expect((await abgelegteZugaenge(KONTO)).map((z) => z.zugangId)).toEqual(['zugang-training']);
    await zugaengeAbgleichen(KONTO, []);
    expect(await abgelegteZugaenge(KONTO)).toEqual([]);
    expect(await fachLesen(KONTO, 'plattform')).toBeUndefined();
  });

  it('die heute begonnene Einheit gilt nur am Tag des Ladens', async () => {
    const offen = { id: 'einheit-server', sets: [] };
    await plaeneAblegen(KONTO, ZUGANG, null, {
      today: '2020-01-01',
      plans: [{ ...PLAN, open_session: offen }],
    });
    expect((await abgelegterPlan(KONTO, ZUGANG, PLAN.id))!.open_session).toBeNull();
    await plaeneAblegen(KONTO, ZUGANG, null, {
      today: geraetetag(),
      plans: [{ ...PLAN, open_session: offen }],
    });
    expect((await abgelegterPlan(KONTO, ZUGANG, PLAN.id))!.open_session).toEqual(offen);
  });
});

describe('Warteschlange (ADR-024 Punkte 7 und 8)', () => {
  it('überträgt der Reihe nach und leert, was angekommen ist', async () => {
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    await ereignisAblegen(KONTO, kopf(), haken('h2', 2));
    const ergebnis = await uebertragen(KONTO);
    expect(ergebnis).toEqual({
      angekommen: ['einheit-1'],
      angabenVerworfen: [],
      abgewiesen: [],
      ohneNetz: false,
    });
    expect(einheitUebertragen).toHaveBeenCalledWith(
      ZUGANG,
      expect.objectContaining({ id: 'einheit-1', ereignisse: [haken('h1'), haken('h2', 2)] }),
    );
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('ein Funkloch lässt alles liegen', async () => {
    einheitUebertragen.mockRejectedValue(new Error('Nicht übertragen.'));
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    expect((await uebertragen(KONTO)).ohneNetz).toBe(true);
    expect((await wartendeEinheiten(KONTO))[0]!.ereignisse).toEqual([haken('h1')]);
  });

  it('was während der Übertragung dazukommt, bleibt für die nächste', async () => {
    let weiter: () => void = () => undefined;
    einheitUebertragen.mockImplementationOnce(
      (_z: string, e: { id: string }) =>
        new Promise((fertig) => {
          weiter = () => fertig({ session_id: e.id, status: 'ok', note_dropped: false });
        }),
    );
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    const laeuft = uebertragen(KONTO);
    await vi.waitFor(() => expect(einheitUebertragen).toHaveBeenCalledTimes(1));
    await ereignisAblegen(KONTO, kopf(), haken('h2', 2));
    // Wer währenddessen anstößt, bekommt eine zweite Runde.
    void uebertragen(KONTO);
    weiter();
    await laeuft;
    expect(einheitUebertragen).toHaveBeenCalledTimes(2);
    expect(einheitUebertragen.mock.calls[1]![1]).toMatchObject({ ereignisse: [haken('h2', 2)] });
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('eine Abweisung wird gemerkt und die Einheit verworfen', async () => {
    einheitUebertragen.mockRejectedValue(new UebertragungAbgewiesen('Der Plan gilt nicht mehr.'));
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    await uebertragen(KONTO);
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('meldet, wenn Satz und Angaben beim Eingang fielen (ANN-357)', async () => {
    einheitUebertragen.mockResolvedValue({
      session_id: 'einheit-1',
      status: 'ok',
      note_dropped: true,
    });
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    expect((await uebertragen(KONTO)).angabenVerworfen).toEqual(['einheit-1']);
  });
});

describe('Befunde aus dem Zweitreview', () => {
  it('„closed": die Ereignisse gehen unter neuer Kennung noch einmal, auch das Ende (S1, S5)', async () => {
    einheitUebertragen.mockImplementationOnce((_z: string, e: { id: string }) =>
      Promise.resolve({ session_id: e.id, status: 'closed', note_dropped: false }),
    );
    const schluss = {
      id: 'e1',
      kind: 'finish' as const,
      at: '2026-10-12T06:10:00.000Z',
      note: '',
      values: {},
    };
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    await ereignisAblegen(KONTO, kopf(), schluss);
    await uebertragen(KONTO);
    expect(einheitUebertragen).toHaveBeenCalledTimes(2);
    const [erste, zweite] = einheitUebertragen.mock.calls.map(
      (c) => c[1] as { id: string; ereignisse: unknown[] },
    );
    expect(zweite!.id).not.toBe(erste!.id);
    expect(zweite!.ereignisse).toEqual([haken('h1'), schluss]);
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
  });

  it('eine unlesbare Einheit fällt nicht still, wenn daneben geschrieben wird (S2)', async () => {
    await fachAendern(KONTO, 'plattform', () => ({
      zugaenge: { kaputt: { plaene: 'kein Plan' } },
      einheiten: [{ id: 'alt', ereignisse: 'aus einer anderen Fassung' }],
    }));
    await ereignisAblegen(KONTO, kopf(), haken('h1'));
    const roh = (await fachLesen(KONTO, 'plattform')) as {
      einheiten: unknown[];
      unlesbar: unknown[];
    };
    expect(roh.einheiten).toHaveLength(1);
    expect(roh.unlesbar).toEqual([{ id: 'alt', ereignisse: 'aus einer anderen Fassung' }]);
    // Der unpassende Plan fällt; er kommt beim nächsten Laden wieder.
    expect(await abgelegteZugaenge(KONTO)).toEqual([]);
  });

  it('die lokale Liste zeigt die offene Einheit eines früheren Tages nicht (S1)', async () => {
    await plaeneAblegen(KONTO, ZUGANG, null, {
      today: '2020-01-01',
      plans: [{ ...PLAN, open_session: { id: 'gestern', sets: [] } }],
    });
    const [z] = await abgelegteZugaenge(KONTO);
    expect(z!.plaene[0]!.open_session).toBeNull();
  });
});

describe('Das Ende bleibt das letzte Ereignis (BEF-213, DRP-EPIC-008)', () => {
  const ENDE = {
    id: 'ende-1',
    kind: 'finish' as const,
    at: '2026-10-12T06:10:00.000Z',
    note: '',
    values: {},
  };

  it('hängt nie hinter ein Ende: der Haken kommt in eine neue Einheit desselben Tages', async () => {
    await ereignisAblegen(KONTO, kopf(), haken('h-1'));
    expect(await ereignisAblegen(KONTO, kopf(), ENDE)).toEqual({
      einheitId: 'einheit-1',
      ereignisId: 'ende-1',
    });
    const { einheitId: neu, ereignisId } = await ereignisAblegen(KONTO, kopf(), haken('h-2', 2));
    expect(neu).not.toBe('einheit-1');
    expect(ereignisId).toBe('h-2');
    // Ein zweiter Haken findet dieselbe offene Einheit, statt noch eine anzulegen.
    expect((await ereignisAblegen(KONTO, kopf(), haken('h-3', 3))).einheitId).toBe(neu);
    const [beendet, offen] = await wartendeEinheiten(KONTO);
    expect(beendet!.ereignisse.map((e) => e.id)).toEqual(['h-1', 'ende-1']);
    expect(offen).toMatchObject({ id: neu, zugangId: ZUGANG, planId: PLAN.id, tag: geraetetag() });
    expect(offen!.ereignisse.map((e) => e.id)).toEqual(['h-2', 'h-3']);
  });

  it('so weist der Server nichts ab, und nichts geht verloren', async () => {
    // Wie der Server (Migration TRK-007): Nach dem Ende kommt nichts mehr.
    einheitUebertragen.mockImplementation(
      (_z: string, e: { id: string; ereignisse: { kind: string }[] }) =>
        e.ereignisse.findIndex((x) => x.kind === 'finish') === e.ereignisse.length - 1 ||
        !e.ereignisse.some((x) => x.kind === 'finish')
          ? Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false })
          : Promise.reject(new UebertragungAbgewiesen('finish must be last')),
    );
    await ereignisAblegen(KONTO, kopf(), haken('h-1'));
    await ereignisAblegen(KONTO, kopf(), ENDE);
    await ereignisAblegen(KONTO, kopf(), haken('h-2', 2));
    const ergebnis = await uebertragen(KONTO);
    expect(ergebnis.angekommen).toHaveLength(2);
    expect(await wartendeEinheiten(KONTO)).toEqual([]);
    const gesendet = einheitUebertragen.mock.calls.map((c) =>
      (c[1] as { ereignisse: { id: string }[] }).ereignisse.map((e) => e.id),
    );
    expect(gesendet).toEqual([['h-1', 'ende-1'], ['h-2']]);
  });

  it('ein zweites Ende fällt weg: es gilt das erste, keine Einheit nur aus einem Ende', async () => {
    await ereignisAblegen(KONTO, kopf(), haken('h-1'));
    await ereignisAblegen(KONTO, kopf(), ENDE);
    expect(await ereignisAblegen(KONTO, kopf(), { ...ENDE, id: 'ende-2', note: 'anders' })).toEqual(
      {
        einheitId: 'einheit-1',
        ereignisId: 'ende-1',
      },
    );
    const einheiten = await wartendeEinheiten(KONTO);
    expect(einheiten).toHaveLength(1);
    expect(einheiten[0]!.ereignisse.map((e) => e.id)).toEqual(['h-1', 'ende-1']);
  });

  it('das Ergebnis nennt, was in diesem Lauf abgewiesen wurde - mit den Ereignissen, über alle Runden', async () => {
    einheitUebertragen.mockImplementation((_z: string, e: { id: string }) =>
      e.id === 'einheit-2'
        ? Promise.reject(new UebertragungAbgewiesen('Der Plan gilt nicht mehr.'))
        : Promise.resolve({ session_id: e.id, status: 'ok', note_dropped: false }),
    );
    await ereignisAblegen(KONTO, kopf(), haken('h-1'));
    await ereignisAblegen(KONTO, kopf('einheit-2'), haken('h-2', 2));
    const ergebnis = await uebertragen(KONTO);
    expect(ergebnis.angekommen).toEqual(['einheit-1']);
    expect(ergebnis.abgewiesen).toEqual([
      {
        einheitId: 'einheit-2',
        planId: PLAN.id,
        satz: 'Der Plan gilt nicht mehr.',
        ereignisse: ['h-2'],
      },
    ]);
    // Ein späterer Lauf trägt die alte Abweisung nicht noch einmal.
    await ereignisAblegen(KONTO, kopf('einheit-3'), haken('h-3', 3));
    expect((await uebertragen(KONTO)).abgewiesen).toEqual([]);
  });
});
