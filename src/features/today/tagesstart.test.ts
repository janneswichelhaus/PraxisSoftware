import { describe, expect, it } from 'vitest';
import type { DayPlanEntry } from './api';
import {
  besuchsphase,
  besucheDesTages,
  bisBeginn,
  dokuText,
  einordnung,
  fokusDesTages,
  fortschrittText,
  hausbesucheDesTages,
  liegeHeute,
  liegeText,
  naechsterWeg,
  nichtAbgeschlossen,
  tagesfortschritt,
  terminName,
  wegeDesTages,
  type Anfahrt,
} from './tagesstart';

const HEUTE = '2026-09-26';

/** Ein Zeitpunkt des Tages aus einer UTC-Uhrzeit; Sommerzeit: 07:00Z ist 09:00 in Berlin. */
function zeitpunkt(um: string): number {
  return Date.parse(`${HEUTE}T${um}:00.000Z`);
}

/** Vor allem, was der Tag bringt: Jeder bestätigte Termin steht noch aus. */
const FRUEH = Date.parse(`${HEUTE}T00:00:00.000Z`);

function eintrag(
  teil: Partial<DayPlanEntry> & { id: string; um: string; bis?: string },
): DayPlanEntry {
  const { um, bis, ...rest } = teil;
  return {
    patient_id: `p-${teil.id}`,
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: `${HEUTE}T${um}:00.000Z`,
    ends_at: `${HEUTE}T${bis ?? um}:00.000Z`,
    patient_given_name: 'Test',
    patient_family_name: teil.id,
    location_name: null,
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    treatment_table_required: false,
    ...rest,
  };
}

describe('Tagesstart (UX-EPIC-003)', () => {
  it('zaehlt Behandlungen ohne Fehlzeit, Training und Absage, in Uhrzeitfolge (ANN-117)', () => {
    const plan = [
      eintrag({ id: 'c', um: '10:00' }),
      eintrag({ id: 'a', um: '06:00', kind: 'internal', patient_id: null }),
      eintrag({ id: 't', um: '06:30', kind: 'training', patient_id: null }),
      eintrag({ id: 'b', um: '07:00' }),
      eintrag({ id: 'x', um: '08:00', status: 'cancelled' }),
    ];
    expect(besucheDesTages(plan).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('macht einen Trainingstermin nie zum ersten Weg', () => {
    const wege = wegeDesTages(
      [
        eintrag({ id: 't', um: '06:00', kind: 'training', patient_id: null }),
        eintrag({ id: 'a', um: '07:00' }),
      ],
      FRUEH,
    );
    expect(wege.erster?.id).toBe('a');
    expect(wege.istErsterDesTages).toBe(true);
  });

  it('zaehlt einen nicht angetroffenen Besuch mit, macht ihn aber nicht zum Weg', () => {
    const wege = wegeDesTages(
      [
        eintrag({ id: 'a', um: '07:00', status: 'no_show' }),
        eintrag({ id: 'b', um: '09:00', treatment_table_required: true }),
      ],
      FRUEH,
    );
    expect(wege.erster?.id).toBe('b');
    expect(wege.istErsterDesTages).toBe(false);
    expect(
      liegeHeute(
        [
          eintrag({ id: 'a', um: '07:00', status: 'no_show' }),
          eintrag({ id: 'b', um: '09:00', treatment_table_required: true }),
        ],
        FRUEH,
      ),
    ).toMatchObject({ noetig: true, besuch: 2 });
  });

  it('nennt den ersten ausstehenden Besuch, auch aus einer unsortierten Liste', () => {
    const wege = wegeDesTages(
      [
        eintrag({ id: 'b', um: '09:00' }),
        eintrag({ id: 'a', um: '07:00' }),
        eintrag({ id: 'c', um: '11:00' }),
      ],
      FRUEH,
    );
    expect(wege.erster?.id).toBe('a');
    expect(wege.istErsterDesTages).toBe(true);
  });

  it('spricht nach dem ersten erledigten Besuch vom naechsten Weg', () => {
    const wege = wegeDesTages(
      [eintrag({ id: 'a', um: '07:00', status: 'completed' }), eintrag({ id: 'b', um: '09:00' })],
      FRUEH,
    );
    expect(wege.erster?.id).toBe('b');
    expect(wege.istErsterDesTages).toBe(false);
  });

  it('hat keinen Weg, wenn nichts mehr aussteht', () => {
    const wege = wegeDesTages([eintrag({ id: 'a', um: '07:00', status: 'completed' })], FRUEH);
    expect(wege.erster).toBeNull();
  });

  it('sagt „Ja · ab 2. Besuch", wenn erst der zweite die Liege braucht (§9)', () => {
    const liege = liegeHeute(
      [
        eintrag({ id: 'a', um: '07:00' }),
        eintrag({ id: 'b', um: '08:30', treatment_table_required: true }),
        eintrag({ id: 'c', um: '10:00', treatment_table_required: true }),
      ],
      FRUEH,
    );
    expect(liege).toMatchObject({ noetig: true, besuch: 2 });
    // Die Uhrzeit steht dabei, damit die Zahl nicht nachgezählt werden muss.
    expect(liegeText(liege)).toBe('Ja · ab 2. Besuch 10:30');
  });

  it('zaehlt einen erledigten Besuch mit, braucht fuer ihn aber keine Liege mehr', () => {
    const liege = liegeHeute(
      [
        eintrag({ id: 'a', um: '07:00', status: 'completed', treatment_table_required: true }),
        eintrag({ id: 'b', um: '08:30' }),
        eintrag({ id: 'c', um: '10:00', treatment_table_required: true }),
      ],
      FRUEH,
    );
    expect(liege).toMatchObject({ noetig: true, besuch: 3 });
  });

  it('sagt „Nein", wenn keine ausstehende Behandlung die Liege braucht', () => {
    expect(liegeText(liegeHeute([eintrag({ id: 'a', um: '07:00' })], FRUEH))).toBe('Nein');
    // Am Training liefert die Tagesliste das Merkmal nicht (ADR-022 Punkt 11).
    expect(
      liegeHeute(
        [eintrag({ id: 't', um: '07:00', kind: 'training', treatment_table_required: null })],
        FRUEH,
      ),
    ).toEqual({ noetig: false });
    expect(
      liegeHeute(
        [eintrag({ id: 'a', um: '07:00', status: 'cancelled', treatment_table_required: true })],
        FRUEH,
      ),
    ).toEqual({ noetig: false });
  });
});

describe('Die Uhr statt des Hakens (ANN-117 Fassung 2)', () => {
  const a = eintrag({ id: 'a', um: '07:00', bis: '08:00', treatment_table_required: true });
  const b = eintrag({ id: 'b', um: '09:00', bis: '10:00' });
  const c = eintrag({ id: 'c', um: '11:00', bis: '12:00', treatment_table_required: true });
  const plan = [a, b, c];

  it('macht nach dem Ende eines nicht abgehakten Besuchs den naechsten zum Weg', () => {
    // 08:30: a ist vorbei, aber nicht abgehakt.
    const wege = wegeDesTages(plan, zeitpunkt('08:30'));
    expect(wege.erster?.id).toBe('b');
    expect(wege.istErsterDesTages).toBe(false);
    expect(fokusDesTages(plan, true, zeitpunkt('08:30'))).toMatchObject({
      art: 'besuch',
      termin: { id: 'b' },
    });
    expect(nichtAbgeschlossen(a, zeitpunkt('08:30'))).toBe(true);
    expect(nichtAbgeschlossen(b, zeitpunkt('08:30'))).toBe(false);
  });

  it('haelt den laufenden Besuch bis zu seinem Ende, auch ohne Haken', () => {
    expect(wegeDesTages(plan, zeitpunkt('07:59')).erster?.id).toBe('a');
    expect(wegeDesTages(plan, zeitpunkt('08:00')).erster?.id).toBe('b');
  });

  it('geht nach einem fruehen Haken auch vor dem Ende weiter', () => {
    const abgehakt = [{ ...a, status: 'completed' as const }, b, c];
    expect(wegeDesTages(abgehakt, zeitpunkt('07:30')).erster?.id).toBe('b');
  });

  it('zaehlt die Liege nach der Uhr: Ein vorbeigegangener Besuch braucht sie nicht mehr', () => {
    expect(liegeHeute(plan, zeitpunkt('06:00'))).toMatchObject({ noetig: true, besuch: 1 });
    expect(liegeHeute(plan, zeitpunkt('08:30'))).toMatchObject({ noetig: true, besuch: 3 });
  });

  it('klappt nach dem letzten Besuch den ersten nicht abgehakten aus - zum Abschliessen', () => {
    const fokus = fokusDesTages(plan, true, zeitpunkt('12:30'));
    expect(fokus).toMatchObject({ art: 'dokumentation', termin: { id: 'a' } });
    // Gezählt als erledigt wird weiter nur, was abgehakt ist.
    expect(tagesfortschritt(plan, null).erledigt).toBe(0);
  });

  it('liegt an einem kuenftigen Tag ganz vor, an einem vergangenen ganz hinter einem (ANN-234)', () => {
    expect(wegeDesTages(plan, 0).erster?.id).toBe('a');
    expect(wegeDesTages(plan, 8.64e15).erster).toBeNull();
  });
});

describe('Die Liege nur am Hausbesuch (BEF-051, ANN-116 Fassung 2)', () => {
  it('sagt „Nein" an einem Praxistermin, auch wenn die Person die Liege braucht', () => {
    const liege = liegeHeute(
      [
        eintrag({
          id: 'p',
          um: '14:00',
          appointment_type: 'practice',
          treatment_table_required: true,
        }),
      ],
      FRUEH,
    );
    expect(liegeText(liege)).toBe('Nein');
  });

  it('zaehlt an einem gemischten Tag nur die Hausbesuche', () => {
    const plan = [
      eintrag({ id: 'p', um: '06:00', appointment_type: 'practice' }),
      eintrag({ id: 'a', um: '07:00' }),
      eintrag({ id: 'b', um: '08:30', treatment_table_required: true }),
    ];
    expect(hausbesucheDesTages(plan).map((t) => t.id)).toEqual(['a', 'b']);
    expect(liegeText(liegeHeute(plan, FRUEH))).toBe('Ja · ab 2. Besuch 10:30');
    // Der Praxistermin bleibt ein Besuch des Tages - der erste Weg führt zu ihm.
    expect(wegeDesTages(plan, FRUEH).erster?.id).toBe('p');
  });
});

describe('Der ausgeklappte Termin (Design-Handoff 2026-10-01)', () => {
  it('ist der naechste noch anzufahrende Behandlungsbesuch', () => {
    const fokus = fokusDesTages(
      [
        eintrag({ id: 'a', um: '07:00', status: 'completed', documentation_status: 'draft' }),
        eintrag({ id: 'c', um: '11:00' }),
        eintrag({ id: 'b', um: '09:00' }),
      ],
      true,
      FRUEH,
    );
    // Der Besuch geht der offenen Dokumentation vor: Zu ihm muss man fahren.
    expect(fokus).toMatchObject({ art: 'besuch', termin: { id: 'b' } });
  });

  it('ist ohne Behandlungsbesuch der naechste Trainingstermin (TRN-006)', () => {
    const fokus = fokusDesTages(
      [
        eintrag({ id: 'a', um: '07:00', status: 'documented', documentation_status: 'final' }),
        eintrag({ id: 't2', um: '12:00', kind: 'training', patient_id: null }),
        eintrag({ id: 't1', um: '10:00', kind: 'training', patient_id: null }),
      ],
      false,
      FRUEH,
    );
    expect(fokus).toMatchObject({ art: 'besuch', termin: { id: 't1' } });
  });

  it('ist ohne ausstehenden Besuch die erste offene Dokumentation - nur fuer die, die schreiben', () => {
    const plan = [
      eintrag({ id: 'a', um: '07:00', status: 'documented', documentation_status: 'final' }),
      eintrag({ id: 'b', um: '09:00', status: 'completed', documentation_status: 'draft' }),
      eintrag({ id: 'c', um: '11:00', status: 'completed', documentation_status: 'none' }),
    ];
    expect(fokusDesTages(plan, true, FRUEH)).toMatchObject({
      art: 'dokumentation',
      termin: { id: 'b' },
    });
    // Für alle anderen wäre es eine Aufgabe, die sie nicht erledigen können.
    expect(fokusDesTages(plan, false, FRUEH)).toBeNull();
  });

  it('gibt es nicht, wenn alles erledigt ist, und nie fuer eine Fehlzeit oder Absage', () => {
    expect(
      fokusDesTages(
        [
          eintrag({ id: 'a', um: '07:00', status: 'documented', documentation_status: 'final' }),
          eintrag({ id: 'f', um: '09:00', kind: 'internal', patient_id: null }),
          eintrag({ id: 'x', um: '10:00', status: 'cancelled' }),
          eintrag({ id: 'n', um: '11:00', status: 'no_show' }),
        ],
        true,
        FRUEH,
      ),
    ).toBeNull();
    expect(fokusDesTages([], true, FRUEH)).toBeNull();
  });

  it('wartet bis zum Beginn, laeuft bis zum Ende und ist danach ueberfaellig', () => {
    const termin = eintrag({ id: 'a', um: '07:00', bis: '08:00' });
    expect(besuchsphase(termin, zeitpunkt('06:59'))).toBe('wartet');
    // Die Grenzen: der Beginn gehört zum Laufen, das Ende nicht mehr.
    expect(besuchsphase(termin, zeitpunkt('07:00'))).toBe('laeuft');
    expect(besuchsphase(termin, zeitpunkt('07:59'))).toBe('laeuft');
    expect(besuchsphase(termin, zeitpunkt('08:00'))).toBe('ueberfaellig');
  });

  it('nennt die Zeit bis zum Beginn nur in den letzten drei Stunden davor', () => {
    const termin = eintrag({ id: 'a', um: '09:00' });
    expect(bisBeginn(termin, zeitpunkt('08:35'))).toBe('in 25 Minuten');
    expect(bisBeginn(termin, zeitpunkt('08:59'))).toBe('in 1 Minute');
    // Angefangene Minuten zählen: 08:34:30 sind noch 26 Minuten.
    expect(bisBeginn(termin, zeitpunkt('08:34') + 30_000)).toBe('in 26 Minuten');
    expect(bisBeginn(termin, zeitpunkt('06:01'))).toBe('in 179 Minuten');
    expect(bisBeginn(termin, zeitpunkt('06:00'))).toBeNull();
    expect(bisBeginn(termin, zeitpunkt('09:00'))).toBeNull();
    expect(bisBeginn(termin, zeitpunkt('09:30'))).toBeNull();
  });
});

describe('Tagesfortschritt (Design-Handoff 2026-10-01, 5a Punkt 3)', () => {
  const plan = [
    eintrag({ id: 'f', um: '06:00', kind: 'internal', patient_id: null }),
    eintrag({ id: 'a', um: '07:00', status: 'documented', documentation_status: 'final' }),
    eintrag({ id: 'b', um: '08:00', status: 'no_show' }),
    eintrag({ id: 'x', um: '09:00', status: 'cancelled' }),
    eintrag({ id: 'c', um: '10:00' }),
    eintrag({ id: 't', um: '10:30', kind: 'training', patient_id: null }),
    eintrag({ id: 'd', um: '11:00' }),
    eintrag({ id: 'e', um: '06:30', status: 'completed', documentation_status: 'draft' }),
  ];

  it('gibt jedem Behandlungstermin einen Punkt, in Uhrzeitfolge - Fehlzeit und Training nicht', () => {
    const fortschritt = tagesfortschritt(plan, 'c');
    expect(fortschritt.punkte).toEqual([
      'erledigt', // e, 06:30
      'erledigt', // a
      'nicht_angetroffen', // b
      'abgesagt', // x
      'naechster', // c
      'offen', // d
    ]);
  });

  it('zaehlt Besuche ohne die Absage; erledigt ist, wozu niemand mehr faehrt', () => {
    const fortschritt = tagesfortschritt(plan, 'c');
    // Fünf Besuche (die Absage zählt nicht), drei davon hinter sich: e, a
    // und der nicht angetroffene b.
    expect(fortschritt).toMatchObject({ gesamt: 5, erledigt: 3, dokumentiert: 1 });
    expect(fortschrittText(fortschritt)).toBe('3 von 5 Besuchen erledigt');
    expect(dokuText(fortschritt)).toBe('1 Doku festgeschrieben');
  });

  it('kennt keinen naechsten Punkt, wenn keiner ausgeklappt ist', () => {
    expect(tagesfortschritt(plan, null).punkte).not.toContain('naechster');
  });

  it('bildet Ein- und Mehrzahl und schweigt ohne festgeschriebene Doku', () => {
    const einer = tagesfortschritt([eintrag({ id: 'a', um: '07:00' })], 'a');
    expect(fortschrittText(einer)).toBe('0 von 1 Besuch erledigt');
    expect(dokuText(einer)).toBeNull();

    const fertig = tagesfortschritt(
      [
        eintrag({ id: 'a', um: '07:00', status: 'documented', documentation_status: null }),
        eintrag({ id: 'b', um: '08:00', status: 'invoiced', documentation_status: null }),
        eintrag({ id: 'c', um: '09:00', status: 'completed', documentation_status: 'final' }),
      ],
      null,
    );
    // Auch ohne lesbaren Dokumentationsstand sagt der Terminzustand, dass
    // festgeschrieben ist.
    expect(dokuText(fertig)).toBe('3 Dokus festgeschrieben');
    expect(fortschrittText(fertig)).toBe('3 von 3 Besuchen erledigt');
  });

  it('ist an einem Tag ohne Behandlung leer', () => {
    expect(
      tagesfortschritt(
        [eintrag({ id: 'f', um: '06:00', kind: 'internal', patient_id: null })],
        null,
      ),
    ).toEqual({ punkte: [], erledigt: 0, gesamt: 0, dokumentiert: 0 });
  });
});

describe('Der naechste Weg (Design-Handoff 2026-10-01, ANN-196)', () => {
  const a = eintrag({
    id: 'a',
    um: '06:30',
    bis: '07:30',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
  });
  const b = eintrag({
    id: 'b',
    um: '08:00',
    bis: '09:00',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
  });
  const plan = [a, b];
  const anfahrten = new Map<string, Anfahrt>([
    ['a', { minuten: 12, vorher: null }],
    ['b', { minuten: 9, vorher: a }],
  ]);
  const fokusA = { termin: a, art: 'besuch' as const };

  it('fuehrt vor dem ersten Besuch von jetzt am Startort zu ihm', () => {
    // 08:05 in Berlin, der Besuch beginnt 08:30.
    expect(naechsterWeg(plan, fokusA, anfahrten, zeitpunkt('06:05'))).toEqual({
      titel: 'Erster Weg',
      von: { zeit: '08:05', label: 'Jetzt, Start am Rad' },
      bis: { zeit: '08:30', label: 'Erika Beispiel' },
      fahrtMin: 12,
    });
  });

  it('zeigt waehrend des Besuchs den Weg danach, vom geplanten Ende aus', () => {
    expect(naechsterWeg(plan, fokusA, anfahrten, zeitpunkt('06:40'))).toEqual({
      titel: 'Nächster Weg danach',
      von: { zeit: '09:30', label: 'Ende Erika Beispiel' },
      bis: { zeit: '10:00', label: 'Max Mustermann' },
      fahrtMin: 9,
    });
  });

  it('zaehlt herunter, sobald das Ende des Termins davor vorbei ist', () => {
    // 09:40: Der erste Besuch ist überfällig, der Balken beginnt jetzt.
    expect(naechsterWeg(plan, fokusA, anfahrten, zeitpunkt('07:40'))?.von).toEqual({
      zeit: '09:40',
      label: 'Jetzt',
    });
    // Genau am Ende gilt noch der geplante Abstand.
    expect(naechsterWeg(plan, fokusA, anfahrten, zeitpunkt('07:30'))?.von).toEqual({
      zeit: '09:30',
      label: 'Ende Erika Beispiel',
    });

    // Ist der erste erledigt, ist der zweite der nächste Weg - kein „erster".
    const danach = [{ ...a, status: 'completed' as const }, b];
    const fokusB = { termin: b, art: 'besuch' as const };
    expect(naechsterWeg(danach, fokusB, anfahrten, zeitpunkt('07:10'))).toMatchObject({
      titel: 'Nächster Weg',
      von: { zeit: '09:30', label: 'Ende Erika Beispiel' },
    });
    expect(naechsterWeg(danach, fokusB, anfahrten, zeitpunkt('07:45'))).toMatchObject({
      titel: 'Nächster Weg',
      von: { zeit: '09:45', label: 'Jetzt' },
      bis: { zeit: '10:00', label: 'Max Mustermann' },
    });
  });

  it('gibt es nicht ohne Fahrzeit - ungeprueft ist nicht kurz', () => {
    expect(naechsterWeg(plan, fokusA, new Map(), zeitpunkt('06:05'))).toBeNull();
    // Während des Besuchs zählt die Anfahrt zum nächsten, nicht die eigene.
    const nurErste = new Map<string, Anfahrt>([['a', { minuten: 12, vorher: null }]]);
    expect(naechsterWeg(plan, fokusA, nurErste, zeitpunkt('06:40'))).toBeNull();
  });

  it('gibt es nicht ohne ausstehenden Besuch', () => {
    expect(naechsterWeg(plan, null, anfahrten, zeitpunkt('06:05'))).toBeNull();
    expect(
      naechsterWeg(plan, { termin: a, art: 'dokumentation' }, anfahrten, zeitpunkt('06:05')),
    ).toBeNull();
    // Der letzte Besuch läuft: Danach kommt kein Weg mehr.
    expect(
      naechsterWeg(plan, { termin: b, art: 'besuch' }, anfahrten, zeitpunkt('08:10')),
    ).toBeNull();
  });

  it('ueberspringt beim Weg danach, was abgesagt oder schon erledigt ist', () => {
    const c = eintrag({ id: 'c', um: '10:00', patient_family_name: 'Dritte' });
    const mitAbsage = [a, { ...b, status: 'cancelled' as const }, c];
    const wege = new Map<string, Anfahrt>([
      ['a', { minuten: 12, vorher: null }],
      ['c', { minuten: 20, vorher: a }],
    ]);
    expect(naechsterWeg(mitAbsage, fokusA, wege, zeitpunkt('06:40'))).toMatchObject({
      bis: { zeit: '12:00', label: 'Test Dritte' },
      fahrtMin: 20,
    });
  });
});

describe('Name und Einordnung eines Termins', () => {
  it('nennt Patient:in, Trainingskund:in oder die Bezeichnung der Fehlzeit', () => {
    expect(
      terminName(
        eintrag({
          id: 'a',
          um: '07:00',
          patient_given_name: 'Max',
          patient_family_name: 'Mustermann',
        }),
      ),
    ).toBe('Max Mustermann');
    expect(
      terminName(
        eintrag({
          id: 't',
          um: '07:00',
          kind: 'training',
          patient_id: null,
          training_given_name: 'Tina',
          training_family_name: 'Training',
        }),
      ),
    ).toBe('Tina Training');
    // TRN-006: nie ein Name aus der Akte am Trainingstermin.
    expect(terminName(eintrag({ id: 't', um: '07:00', kind: 'training', patient_id: null }))).toBe(
      'Trainingstermin',
    );
    expect(
      terminName(
        eintrag({
          id: 'f',
          um: '07:00',
          kind: 'internal',
          patient_id: null,
          title: 'Teambesprechung',
        }),
      ),
    ).toBe('Teambesprechung');
    expect(terminName(eintrag({ id: 'f', um: '07:00', kind: 'internal', patient_id: null }))).toBe(
      'Fehlzeit',
    );
  });

  it('gibt dem Hausbesuch kein Wort und nennt sonst Art und Standort (ANN-192)', () => {
    expect(einordnung(eintrag({ id: 'a', um: '07:00' }))).toBe('');
    expect(
      einordnung(
        eintrag({
          id: 'a',
          um: '07:00',
          appointment_type: 'practice',
          location_name: 'Hauptstandort',
        }),
      ),
    ).toBe('Praxis · Hauptstandort');
    expect(
      einordnung(
        eintrag({
          id: 'f',
          um: '07:00',
          kind: 'internal',
          patient_id: null,
          title: 'Teambesprechung',
          appointment_type: 'video',
        }),
      ),
    ).toBe('Fehlzeit · Video');
    // Ohne Bezeichnung heißt die Fehlzeit schon so - nicht zweimal (UX-005h).
    expect(einordnung(eintrag({ id: 'f', um: '07:00', kind: 'internal', patient_id: null }))).toBe(
      '',
    );
    expect(einordnung(eintrag({ id: 't', um: '07:00', kind: 'training', patient_id: null }))).toBe(
      'Training',
    );
  });
});
