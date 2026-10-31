import { describe, expect, it } from 'vitest';
import type {
  Bogenstand,
  EigeneCheckins,
  EigenePlaene,
  EigenerPlan,
  PlanPosition,
  Plattformzugang,
  Termin,
} from './api';
import {
  ersteAufgabe,
  ersterTermin,
  handlung,
  hauptsache,
  inLesefrist,
  lesefristSatz,
  naechsterTermin,
  terminPerson,
  terminTitel,
  terminZeit,
  uebungenHeute,
  type Aufgabenlage,
} from './hauptsache';
import { eigenerPlan } from './testdaten';

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
  readable: true,
  writable: true,
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

/** 3 Durchgänge mit 10 bis 12 Wiederholungen, 30 s Pause: geschätzt 234 s (ANN-704). */
const POSITION: PlanPosition = eigenerPlan().items[0]!;

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
    items: Array.from({ length: 4 }, (_, i) => ({ ...POSITION, position: i + 1 })),
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
    // Vier Übungen zu 234 s sind 15,6 Minuten: „etwa 15 Minuten“.
    expect(ersteAufgabe(lage(ohneVorher))).toEqual({
      art: 'uebungen',
      uebungen: 4,
      minuten: 15,
      planId: '00000000-0000-4000-8000-0000000000a1',
    });
    // Zwei Pläne heute: zu den Übungen, nicht in eine Einheit.
    expect(
      ersteAufgabe(
        lage({
          ...ohneVorher,
          plaene: plaene(
            plan('00000000-0000-4000-8000-0000000000a1'),
            plan('00000000-0000-4000-8000-0000000000a2', { items: [POSITION] }),
          ),
        }),
      ),
    ).toEqual({ art: 'uebungen', uebungen: 5, minuten: 20, planId: null });
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
    expect(
      ersteAufgabe(lage({ zugang: { ...ZUGANG, writable: false, read_until: '2026-12-31' } })),
    ).toBeNull();
    expect(ersteAufgabe(lage({ zugang: { ...ZUGANG, relationship_kind: 'training' } }))).toBeNull();
    expect(
      ersteAufgabe({ ...lage(), boegen: undefined, checkins: undefined, plaene: undefined }),
    ).toBeNull();
  });

  it('hält das Ende einer Vertretung nicht für die Lesefrist', () => {
    // Sorgerecht bis zur Volljährigkeit: `read_until` steht, die Behandlung läuft, der Server
    // meldet `writable` (ANN-809).
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
    expect(handlung({ art: 'uebungen', uebungen: 4, minuten: 15, planId: 'a1' }).pfad).toBe(
      '/p/uebungen/einheit/a1',
    );
    expect(handlung({ art: 'uebungen', uebungen: 5, minuten: null, planId: null }).pfad).toBe(
      '/p/uebungen',
    );
  });
});

/** Ein Termin um 9:30 Ortszeit am Tag `tag` (JJJJ-MM-TT), eine Stunde lang. */
function termin(tag: string, aenderungen: Partial<Termin> = {}): Termin {
  const beginn = new Date(`${tag}T09:30:00`);
  return {
    id: `00000000-0000-4000-8000-${tag.replaceAll('-', '').padStart(12, '0')}`,
    starts_at: beginn.toISOString(),
    ends_at: new Date(beginn.getTime() + 60 * 60 * 1000).toISOString(),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    late_notice: false,
    open_request_kind: null,
    ...aenderungen,
  };
}

/** Freitag, 23.10.2026, 8 Uhr auf der Uhr des Geräts. */
const JETZT = new Date(2026, 9, 23, 8, 0);

describe('naechsterTermin und ersterTermin', () => {
  it('nimmt den frühesten bestätigten, der noch nicht vorbei ist', () => {
    const liste = [
      termin('2026-10-30'),
      termin('2026-10-24'),
      termin('2026-10-23', { status: 'cancelled' }),
      termin('2026-10-20', { status: 'completed' }),
    ];
    expect(naechsterTermin(liste, JETZT)?.starts_at).toBe(liste[1]!.starts_at);
    expect(naechsterTermin([], JETZT)).toBeUndefined();
  });

  it('nennt den nächsten Termin den ersten, wenn davor nur Abgesagtes liegt', () => {
    const naechster = termin('2026-10-24');
    expect(
      ersterTermin([termin('2026-10-20', { status: 'cancelled' }), naechster], naechster),
    ).toBe(true);
    expect(
      ersterTermin([termin('2026-10-20', { status: 'completed' }), naechster], naechster),
    ).toBe(false);
  });
});

describe('hauptsache (ANN-698)', () => {
  it('nimmt in der Lesefrist die Unterlagen, sonst die Aufgabe, sonst den Termin, sonst nichts', () => {
    const naechster = termin('2026-10-24');
    const lesefrist = { ...ZUGANG, writable: false, read_until: '2026-12-31' };
    expect(hauptsache({ ...lage({ zugang: lesefrist }), naechster })).toEqual({
      art: 'unterlagen',
      bis: '2026-12-31',
    });
    expect(hauptsache({ ...lage(), naechster })).toMatchObject({
      art: 'aufgabe',
      aufgabe: { art: 'fragebogen' },
    });
    const ohneAufgabe = lage({
      boegen: [bogen('abgeschlossen')],
      checkins: null,
      plaene: plaene(),
    });
    expect(hauptsache({ ...ohneAufgabe, naechster })).toEqual({ art: 'termin', termin: naechster });
    expect(hauptsache({ ...ohneAufgabe, naechster: undefined })).toEqual({ art: 'nichts' });
  });

  it('kennt keine Lesefrist, solange der Server schreiben lässt, etwa mit laufendem Abo (ANN-274)', () => {
    const naechster = termin('2026-10-24');
    // Gekündigt, aber noch nicht zu Ende: `read_until` steht schon, geschrieben wird weiter.
    const aboEndet = { ...ZUGANG, read_until: '2026-12-31' };
    const ohneAufgabe = { boegen: [bogen('abgeschlossen')], checkins: null, plaene: plaene() };
    expect(hauptsache({ ...lage({ zugang: aboEndet, ...ohneAufgabe }), naechster })).toEqual({
      art: 'termin',
      termin: naechster,
    });
    expect(ersteAufgabe(lage({ zugang: aboEndet }))).toMatchObject({ art: 'fragebogen' });
  });

  it('kennt die Lesefrist auch an Begleitung und Vertretung, wenn der Server sie meldet (ANN-809)', () => {
    const naechster = termin('2026-10-24');
    for (const access_kind of ['companion', 'legal_representative'] as const) {
      const vertretung = { ...ZUGANG, access_kind, writable: false, read_until: '2026-12-31' };
      expect(hauptsache({ ...lage({ zugang: vertretung }), naechster })).toEqual({
        art: 'unterlagen',
        bis: '2026-12-31',
      });
      expect(ersteAufgabe(lage({ zugang: vertretung }))).toBeNull();
    }
  });

  it('nimmt im Training immer die nächste Einheit, auch mit Übungen für heute', () => {
    const naechster = termin('2026-10-24');
    const training = { ...ZUGANG, relationship_kind: 'training' as const };
    expect(hauptsache({ ...lage({ zugang: training }), naechster })).toEqual({
      art: 'termin',
      termin: naechster,
    });
  });
});

describe('uebungenHeute', () => {
  it('zählt die Übungen der Pläne mit heutigem Übungstag', () => {
    expect(uebungenHeute(plaene(plan('a1')))).toEqual({
      art: 'uebungen',
      uebungen: 4,
      minuten: 15,
      planId: 'a1',
    });
    expect(uebungenHeute(plaene(plan('a1', { weekdays: [1] })))).toBeNull();
    expect(uebungenHeute(undefined)).toBeNull();
  });
});

describe('Texte eines Termins als Hauptsache', () => {
  it('nennt den Tag beim Wort: heute, morgen, Wochentag, über sechs Tage das Datum', () => {
    expect(terminTitel(termin('2026-10-23'), 'treatment', null, JETZT)).toBe('Besuch heute');
    expect(terminTitel(termin('2026-10-24'), 'treatment', null, JETZT)).toBe('Besuch morgen');
    expect(terminTitel(termin('2026-10-27'), 'treatment', null, JETZT)).toBe('Besuch am Dienstag');
    expect(terminTitel(termin('2026-11-02'), 'treatment', null, JETZT)).toBe(
      'Besuch am 2.\u00a0November',
    );
    expect(terminTitel(termin('2027-01-04'), 'treatment', null, JETZT)).toBe(
      'Besuch am 4.\u00a0Januar 2027',
    );
  });

  it('sagt im Training „Training“ und in der Praxis „Termin“', () => {
    expect(terminTitel(termin('2026-10-27'), 'training', null, JETZT)).toBe('Training am Dienstag');
    expect(
      terminTitel(termin('2026-10-27', { appointment_type: 'practice' }), 'treatment', null, JETZT),
    ).toBe('Termin am Dienstag');
  });

  it('nennt für eine Vertretung die Person statt des Tags; der Tag steht im Satz', () => {
    const t = termin('2026-10-24');
    expect(terminTitel(t, 'treatment', 'Max Mustermann', JETZT)).toBe('Besuch bei Max Mustermann');
    expect(
      terminTitel({ ...t, appointment_type: 'video' }, 'treatment', 'Max Mustermann', JETZT),
    ).toBe('Videotermin für Max Mustermann');
    // Tag und Monat mit geschütztem Leerzeichen: In der Hero-Karte brechen sie nicht auseinander.
    // Der Tag in Worten wie in den Zeilen: morgen „Morgen“, sonst der Wochentag.
    expect(terminZeit(t, true, JETZT)).toBe('Morgen, 24.\u00a0Oktober, 09:30 bis 10:30');
    expect(terminZeit(termin('2026-10-27'), true, JETZT)).toBe(
      'Dienstag, 27.\u00a0Oktober, 09:30 bis 10:30',
    );
    expect(terminZeit(t, false, JETZT)).toBe('24.\u00a0Oktober, 09:30 bis 10:30');
    // Über sechs Tage steht das Datum schon im Titel.
    expect(terminZeit(termin('2026-11-02'), false, JETZT)).toBe('09:30 bis 10:30');
  });

  it('sagt, wer kommt - oder bei wem; ohne Namen nichts', () => {
    const t = termin('2026-10-24');
    expect(terminPerson(t, false)).toBe('Anna Beispiel kommt zu Ihnen');
    expect(terminPerson(t, true)).toBe('Anna Beispiel kommt');
    expect(terminPerson({ ...t, appointment_type: 'practice' }, false)).toBe(
      'In der Praxis bei Anna Beispiel',
    );
    expect(terminPerson({ ...t, appointment_type: 'video' }, false)).toBe(
      'Videotermin mit Anna Beispiel',
    );
    expect(terminPerson({ ...t, staff_name: null }, false)).toBeNull();
  });
});

describe('Lesefrist (ANN-809)', () => {
  const ENDE = '2026-12-01T00:00:00+01:00';
  const eigen = {
    relationship_kind: 'treatment' as const,
    access_kind: 'self' as const,
    represented_name: null,
    read_until: ENDE,
  };

  it('nimmt sie vom Server: lesbar, aber nicht mehr schreibend', () => {
    expect(inLesefrist({ readable: true, writable: false })).toBe(true);
    expect(inLesefrist({ readable: true, writable: true })).toBe(false);
    // Gesperrt oder abgelaufen ist keine Lesefrist, sondern gar kein Zugang.
    expect(inLesefrist({ readable: false, writable: false })).toBe(false);
  });

  it('sagt der Person, was endete und bis wann sie liest', () => {
    expect(lesefristSatz(eigen, null)).toBe(
      'Ihre Behandlung ist beendet. Sie können hier noch bis 30.11.2026 lesen.',
    );
    expect(lesefristSatz({ ...eigen, relationship_kind: 'training' }, null)).toBe(
      'Ihre Trainingszeit ist beendet. Sie können hier noch bis 30.11.2026 lesen.',
    );
    expect(lesefristSatz(eigen, { state: 'ended', ends_on: '2026-10-31' })).toBe(
      'Ihr Nachsorge-Abo endete am 31.10.2026. Sie können hier noch bis 30.11.2026 lesen.',
    );
    expect(lesefristSatz({ ...eigen, read_until: null }, null)).toBeNull();
  });

  it('nennt einer Vertretung oder Begleitung die Person nicht, das Band darüber tut es', () => {
    for (const access_kind of ['companion', 'legal_representative'] as const) {
      const vertretung = { ...eigen, access_kind, represented_name: 'Max Mustermann' };
      expect(lesefristSatz(vertretung, null)).toBe(
        'Die Behandlung ist beendet. Sie können hier noch bis 30.11.2026 lesen.',
      );
      expect(lesefristSatz({ ...vertretung, relationship_kind: 'training' }, null)).toBe(
        'Die Trainingszeit ist beendet. Sie können hier noch bis 30.11.2026 lesen.',
      );
      expect(lesefristSatz(vertretung, { state: 'ended', ends_on: '2026-10-31' })).toBe(
        'Das Nachsorge-Abo endete am 31.10.2026. Sie können hier noch bis 30.11.2026 lesen.',
      );
    }
  });
});
