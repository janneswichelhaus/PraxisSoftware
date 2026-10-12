import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PlattformApi from './api';
import type { Uebertragung } from './api';
import { fachLesen, speicherImSpeicher, speicherSetzen } from '@/lib/geraeteablage';
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
    expect(ergebnis).toEqual({ angekommen: ['einheit-1'], angabenVerworfen: [], ohneNetz: false });
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
