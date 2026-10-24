import { describe, expect, it } from 'vitest';
import type {
  Bogenstand,
  EigeneCheckins,
  EigenePlaene,
  EigenerPlan,
  PlanPosition,
  Plattformzugang,
} from './api';
import { ersteAufgabe, handlung, type Aufgabenlage } from './hauptsache';

/**
 * Die erste Aufgabe (ANN-692; Handoff 2026-10-22, Abschnitt 0): Reihenfolge
 * nach DSN-001 4.1, nichts in der Lesefrist, im Training die nächste Einheit.
 * Synthetische Daten; der 23.10.2026 ist ein Freitag (ISO 5).
 */

const HEUTE = '2026-10-23';
const BOGEN = 'anamnese';

const ZUGANG: Aufgabenlage['zugang'] = {
  relationship_kind: 'treatment',
  access_kind: 'self',
  read_until: null,
};

function bogen(status: Bogenstand['status']): Bogenstand {
  return {
    id: '00000000-0000-4000-8000-0000000000b1',
    instrument_id: BOGEN,
    definition_version: '8',
    status,
    recorded_on: HEUTE,
    source: 'platform',
    answers: null,
    updated_at: `${HEUTE}T08:00:00Z`,
    completed_at: status === 'abgeschlossen' ? `${HEUTE}T08:00:00Z` : null,
  };
}

/** Zwei Fragen und eine Angabe zum Zusammenhang, die nicht als Frage zählt (ANN-355). */
function checkins(
  kann: boolean,
  schluessel = ['pain_rest', 'sleep_quality', 'painkiller_24h'],
): EigeneCheckins {
  return {
    today: HEUTE,
    schedule: { interval_days: 7, parameter_keys: schluessel },
    due_on: HEUTE,
    due: true,
    can_answer: kann,
    consent_needed: false,
    last_values: {},
    history: [],
    session_history: [],
  };
}

function plan(id: string, aenderungen: Partial<EigenerPlan> = {}): EigenerPlan {
  return {
    id,
    service_area: 'therapy',
    title: 'Heimübungen Knie',
    status: 'assigned',
    sessions_per_week: 3,
    assigned_on: '2026-10-01',
    runs_from: '2026-10-01',
    runs_until: null,
    ended_on: null,
    can_exercise: true,
    note_allowed: true,
    open_session: null,
    can_choose_days: true,
    weekdays: [1, 3, 5],
    recent_sessions: [],
    items: Array.from({ length: 4 }, () => ({}) as PlanPosition),
    ...aenderungen,
  };
}

function plaene(...liste: EigenerPlan[]): EigenePlaene {
  return { today: HEUTE, plans: liste };
}

function lage(aenderungen: Partial<Aufgabenlage> = {}): Aufgabenlage {
  return {
    zugang: ZUGANG,
    bogenId: BOGEN,
    boegen: [],
    checkins: checkins(true),
    plaene: plaene(plan('00000000-0000-4000-8000-0000000000a1')),
    ...aenderungen,
  };
}

describe('ersteAufgabe (ANN-692)', () => {
  it('nimmt zuerst den Fragebogen vor dem ersten Termin, angefangen oder nicht', () => {
    expect(ersteAufgabe(lage())).toEqual({ art: 'fragebogen', angefangen: false });
    expect(ersteAufgabe(lage({ boegen: [bogen('entwurf')] }))).toEqual({
      art: 'fragebogen',
      angefangen: true,
    });
  });

  it('nimmt danach den fälligen Check-in, wenn der Zugang antworten darf', () => {
    const fertig = { boegen: [bogen('abgeschlossen')] };
    expect(ersteAufgabe(lage(fertig))).toEqual({ art: 'checkin', fragen: 2 });
    // Ohne Recht oder Einwilligung ist er keine Aufgabe; dann die Übungen.
    expect(ersteAufgabe(lage({ ...fertig, checkins: checkins(false) }))).toMatchObject({
      art: 'uebungen',
    });
  });

  it('nimmt die Übungen, wenn heute ein Übungstag ist und noch nicht geübt wurde', () => {
    const ohneVorher = { boegen: [bogen('abgeschlossen')], checkins: null };
    expect(ersteAufgabe(lage(ohneVorher))).toEqual({
      art: 'uebungen',
      uebungen: 4,
      planId: '00000000-0000-4000-8000-0000000000a1',
    });
    // Zwei Pläne heute: zu den Übungen, nicht in eine Einheit.
    expect(
      ersteAufgabe(
        lage({
          ...ohneVorher,
          plaene: plaene(
            plan('00000000-0000-4000-8000-0000000000a1'),
            plan('00000000-0000-4000-8000-0000000000a2', { items: [{} as PlanPosition] }),
          ),
        }),
      ),
    ).toEqual({ art: 'uebungen', uebungen: 5, planId: null });
    // Kein Übungstag, heute schon geübt oder gesperrt: keine Aufgabe.
    for (const anders of [
      { weekdays: [1, 3] },
      { recent_sessions: [{ performed_on: HEUTE, finished: true }] },
      { can_exercise: false },
    ]) {
      expect(
        ersteAufgabe(lage({ ...ohneVorher, plaene: plaene(plan('p', anders)) })),
        JSON.stringify(anders),
      ).toBeNull();
    }
  });

  it('kennt keine Aufgabe in der Lesefrist, im Training und ohne Daten', () => {
    expect(ersteAufgabe(lage({ zugang: { ...ZUGANG, read_until: '2026-12-31' } }))).toBeNull();
    expect(ersteAufgabe(lage({ zugang: { ...ZUGANG, relationship_kind: 'training' } }))).toBeNull();
    expect(
      ersteAufgabe({ ...lage(), boegen: undefined, checkins: undefined, plaene: undefined }),
    ).toBeNull();
  });

  it('hält das Ende einer Vertretung nicht für die Lesefrist', () => {
    // Sorgerecht bis zur Volljährigkeit: `read_until` steht, die Behandlung läuft.
    const vertretung: Aufgabenlage['zugang'] = {
      ...ZUGANG,
      access_kind: 'legal_representative',
      read_until: '2031-04-30',
    };
    expect(ersteAufgabe(lage({ zugang: vertretung }))).toEqual({
      art: 'fragebogen',
      angefangen: false,
    });
  });

  it('lässt eine Begleitung den Fragebogen nicht ausfüllen (ANN-248)', () => {
    const begleitung: Plattformzugang['access_kind'] = 'companion';
    expect(ersteAufgabe(lage({ zugang: { ...ZUGANG, access_kind: begleitung } }))).toEqual({
      art: 'checkin',
      fragen: 2,
    });
  });
});

describe('handlung', () => {
  it('ist der Knopf der Hauptsache mit seinem Ziel', () => {
    expect(handlung({ art: 'fragebogen', angefangen: false })).toEqual({
      text: 'Fragebogen beginnen',
      pfad: '/p/befundbogen',
    });
    expect(handlung({ art: 'fragebogen', angefangen: true }).text).toBe(
      'Fragebogen weiter ausfüllen',
    );
    expect(handlung({ art: 'checkin', fragen: 1 })).toEqual({
      text: 'Check-in beantworten',
      pfad: '/p/checkin',
    });
    expect(handlung({ art: 'uebungen', uebungen: 4, planId: 'a1' }).pfad).toBe(
      '/p/uebungen/einheit/a1',
    );
    expect(handlung({ art: 'uebungen', uebungen: 5, planId: null }).pfad).toBe('/p/uebungen');
  });
});
