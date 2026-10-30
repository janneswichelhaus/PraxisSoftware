import { describe, expect, it } from 'vitest';
import type { Termin, Terminwunsch } from './api';
import {
  artKurz,
  artLang,
  artUndPerson,
  artzeichen,
  gedaempft,
  absageEingegangen,
  gesendetAm,
  wunschEingang,
  heroEtikett,
  leereTage,
  rolle,
  tagDerWoche,
  tagInWorten,
  tageSatz,
  bisTag,
  terminZustand,
  terminzeileName,
  wunschInWorten,
  wunschTitel,
} from './termintexte';

/**
 * Die Wörter der Termine (Handoff 2026-10-24 „Termine“, Abschnitte 3 und 8):
 * Tag in Worten, Rolle je Art und Lage samt Vertretung, Wunsch in Worten,
 * Etikett des Heros. „Heute“ ist wie im Handoff Samstag, 24. Oktober 2026.
 */
const JETZT = new Date(2026, 9, 24, 8, 0);

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
    visit_city: 'Tübingen',
    late_notice: false,
    open_request_kind: null,
    ...aenderungen,
  };
}

function wunsch(aenderungen: Partial<Terminwunsch> = {}): Terminwunsch {
  return {
    id: '11111111-0000-4000-8000-000000000001',
    kind: 'new',
    appointment_id: null,
    preferred_days: [],
    preferred_times: [],
    note: null,
    status: 'open',
    created_at: '2026-10-22T10:00:00+02:00',
    resolved_at: null,
    answer: null,
    ...aenderungen,
  };
}

describe('Art', () => {
  it('nennt jede Art kurz und lang; im Training ist alles außer Video „Training“', () => {
    expect(artKurz('home_visit', 'treatment')).toBe('Hausbesuch');
    expect(artKurz('practice', 'treatment')).toBe('Praxis');
    expect(artKurz('video', 'treatment')).toBe('Video');
    expect(artLang('practice', 'treatment')).toBe('In der Praxis');
    expect(artLang('video', 'treatment')).toBe('Videotermin');
    expect(artzeichen('home_visit', 'training')).toBe('training');
    expect(artzeichen('practice', 'training')).toBe('training');
    expect(artzeichen('video', 'training')).toBe('video');
    expect(artKurz('practice', 'training')).toBe('Training');
  });

  it('setzt die dritte Zeile aus Art und Person, ohne Namen nur das Wort', () => {
    expect(
      artUndPerson(
        termin('2026-11-04', { appointment_type: 'practice', staff_name: 'Jannes Test' }),
        'treatment',
      ),
    ).toBe('Praxis · Jannes Test');
    expect(artUndPerson(termin('2026-11-04', { staff_name: null }), 'treatment')).toBe(
      'Hausbesuch',
    );
  });
});

describe('tagInWorten', () => {
  it('sagt heute und morgen beim Wort, sonst den Wochentag; Tag und Monat bleiben zusammen', () => {
    expect(tagInWorten(termin('2026-10-24').starts_at, JETZT)).toBe('Heute, 24.\u00a0Oktober');
    expect(tagInWorten(termin('2026-10-25').starts_at, JETZT)).toBe('Morgen, 25.\u00a0Oktober');
    expect(tagInWorten(termin('2026-11-04').starts_at, JETZT)).toBe('Mittwoch, 4.\u00a0November');
  });

  it('nennt ein anderes Jahr', () => {
    expect(tagInWorten(termin('2027-01-04').starts_at, JETZT)).toBe('Montag, 4.\u00a0Januar 2027');
  });
});

describe('Zustand und Name der Terminzeile', () => {
  it('trägt den offenen Wunsch vor dem Zustand; bestätigt ohne Wunsch kein Zeichen', () => {
    expect(terminZustand(termin('2026-11-04'))).toBeNull();
    expect(terminZustand(termin('2026-11-04', { open_request_kind: 'change' }))?.wort).toBe(
      'Änderung angefragt',
    );
    expect(terminZustand(termin('2026-11-04', { open_request_kind: 'cancel' }))?.wort).toBe(
      'Absage angefragt',
    );
    expect(terminZustand(termin('2026-10-20', { status: 'completed' }))?.wort).toBe('durchgeführt');
    expect(terminZustand(termin('2026-10-20', { status: 'cancelled' }))?.wort).toBe('abgesagt');
    expect(terminZustand(termin('2026-10-20', { status: 'no_show' }))?.wort).toBe(
      'nicht angetroffen',
    );
  });

  it('dämpft Vergangenes und Abgesagtes', () => {
    expect(gedaempft(termin('2026-11-04'), JETZT)).toBe(false);
    expect(gedaempft(termin('2026-11-04', { status: 'cancelled' }), JETZT)).toBe(true);
    expect(gedaempft(termin('2026-10-20'), JETZT)).toBe(true);
  });

  it('sagt Vorlesesoftware Tag, Zeit, Art, Person und Zustand', () => {
    expect(
      terminzeileName(
        termin('2026-11-04', {
          appointment_type: 'practice',
          staff_name: 'Jannes Test',
          open_request_kind: 'change',
        }),
        'treatment',
        JETZT,
      ),
    ).toBe('Mittwoch, 4.\u00a0November, 09:30 bis 10:30, Praxis · Jannes Test, Änderung angefragt');
  });
});

describe('rolle („Wer und wo“)', () => {
  const praxis = { appointment_type: 'practice' as const };
  const video = { appointment_type: 'video' as const };

  it('kommend je Art, für eine Vertretung ohne „Ihnen“ und mit dem Namen', () => {
    expect(rolle(termin('2026-11-04'), null, JETZT)).toBe('kommt zu Ihnen');
    expect(rolle(termin('2026-11-04'), 'Maximilian', JETZT)).toBe('kommt');
    expect(rolle(termin('2026-11-04', praxis), null, JETZT)).toBe('erwartet Sie in der Praxis');
    expect(rolle(termin('2026-11-04', praxis), 'Maximilian', JETZT)).toBe(
      'erwartet Maximilian in der Praxis',
    );
    expect(rolle(termin('2026-11-04', video), null, JETZT)).toBe('per Video');
  });

  it('durchgeführt beim Hausbesuch „war bei Ihnen“, sonst nur der Name', () => {
    expect(rolle(termin('2026-10-20', { status: 'completed' }), null, JETZT)).toBe('war bei Ihnen');
    // Für eine Vertretung war der Besuch bei der Person, nicht bei ihr.
    expect(rolle(termin('2026-10-20', { status: 'completed' }), 'Maximilian', JETZT)).toBe(
      'war da',
    );
    expect(rolle(termin('2026-10-20', { ...praxis, status: 'completed' }), null, JETZT)).toBeNull();
    expect(rolle(termin('2026-10-20', { status: 'cancelled' }), null, JETZT)).toBeNull();
    expect(rolle(termin('2026-10-20', { status: 'no_show' }), null, JETZT)).toBeNull();
    // Bestätigt, aber vorbei und nicht abgeschlossen: nur der Name.
    expect(rolle(termin('2026-10-20'), null, JETZT)).toBeNull();
  });
});

describe('heroEtikett', () => {
  it('je Art, beim ersten Termin und für eine Vertretung', () => {
    expect(heroEtikett('home_visit', 'treatment', false, false)).toBe('Ihr nächster Besuch');
    expect(heroEtikett('practice', 'treatment', false, false)).toBe('Ihr nächster Termin');
    expect(heroEtikett('video', 'treatment', false, false)).toBe('Ihr nächster Termin');
    expect(heroEtikett('home_visit', 'training', false, false)).toBe('Ihr nächstes Training');
    expect(heroEtikett('home_visit', 'treatment', true, false)).toBe('Ihr erster Besuch');
    expect(heroEtikett('practice', 'treatment', true, false)).toBe('Ihr erster Termin');
    expect(heroEtikett('practice', 'training', true, false)).toBe('Ihr erstes Training');
    expect(heroEtikett('home_visit', 'treatment', false, true)).toBe('Nächster Besuch');
    expect(heroEtikett('practice', 'treatment', false, true)).toBe('Nächster Termin');
    expect(heroEtikett('practice', 'training', false, true)).toBe('Nächstes Training');
  });
});

describe('Wunsch in Worten', () => {
  it('fasst die Tage nach Wochentag mit „oder“ zusammen, dann die Tageszeit', () => {
    expect(
      wunschInWorten(
        wunsch({
          preferred_days: ['2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05'],
          preferred_times: ['morning'],
        }),
      ),
    ).toBe('Dienstag oder Donnerstag, vormittags');
    expect(
      wunschInWorten(
        wunsch({
          preferred_days: ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'],
          preferred_times: ['midday', 'afternoon'],
        }),
      ),
    ).toBe('Montag bis Freitag, mittags oder nachmittags');
    expect(wunschInWorten(wunsch({ preferred_days: ['2026-10-26'] }))).toBe(
      'Montag, zu jeder Tageszeit',
    );
    // Ab drei steht „oder“ nur vor dem letzten.
    expect(
      wunschInWorten(
        wunsch({
          preferred_days: ['2026-10-26', '2026-10-27', '2026-10-28'],
          preferred_times: ['morning', 'midday', 'afternoon'],
        }),
      ),
    ).toBe('Montag, Dienstag oder Mittwoch, vormittags, mittags oder nachmittags');
    expect(wunschInWorten(wunsch({ kind: 'cancel' }))).toBeNull();
  });

  it('der Satz unter den Tagen: Tage mit „oder“ und der letzte gesendete Tag', () => {
    expect(tageSatz([2, 4], ['2026-10-27', '2026-11-12'], JETZT)).toBe(
      'Dienstag oder Donnerstag – bis Donnerstag, 12.\u00a0November.',
    );
    expect(tageSatz([1, 2, 3, 4, 5], ['2026-10-26', '2026-11-13'], JETZT)).toBe(
      'Montag bis Freitag – bis Freitag, 13.\u00a0November.',
    );
    expect(tageSatz([], [], JETZT)).toBe('Wählen Sie einen oder mehrere Tage.');
  });

  it('bis wann die Tage reichen, wie in der Karte der Zusammenfassung', () => {
    expect(bisTag(['2026-10-27', '2026-11-12'], JETZT)).toBe('bis Donnerstag, 12.\u00a0November');
    expect(bisTag([], JETZT)).toBe('');
  });

  it('titelt mit dem Termin des Wunschs, sonst mit der Art des Wunschs', () => {
    const t = termin('2026-11-04');
    expect(wunschTitel(wunsch(), [t], JETZT)).toBe('Terminwunsch');
    expect(wunschTitel(wunsch({ kind: 'change', appointment_id: t.id }), [t], JETZT)).toBe(
      'Änderung für Mi., 4.\u00a0November',
    );
    expect(wunschTitel(wunsch({ kind: 'cancel', appointment_id: t.id }), [t], JETZT)).toBe(
      'Absage für Mi., 4.\u00a0November',
    );
    expect(wunschTitel(wunsch({ kind: 'change', appointment_id: t.id }), [], JETZT)).toBe(
      'Änderungswunsch',
    );
    expect(wunschTitel(wunsch({ kind: 'cancel', appointment_id: null }), [], JETZT)).toBe(
      'Absagewunsch',
    );
  });

  it('sagt, wann der Wunsch gesendet wurde', () => {
    expect(gesendetAm(wunsch(), JETZT)).toBe('Gesendet am 22.\u00a0Oktober');
  });

  it('nennt bei einer Absage den Eingang mit Uhrzeit, auf der Uhr des Geräts (ANN-806)', () => {
    // Ortszeit des Geräts, damit der Test in jeder Zeitzone dasselbe sagt.
    const absage = wunsch({
      kind: 'cancel',
      created_at: new Date(2026, 9, 29, 14, 32).toISOString(),
    });
    expect(wunschEingang(absage, JETZT)).toBe('Eingegangen am 29.\u00a0Oktober um 14:32');
    expect(absageEingegangen(absage, JETZT)).toBe(
      'Ihre Absage ist am 29.\u00a0Oktober um 14:32 eingegangen.',
    );
    expect(wunschEingang(wunsch({ kind: 'change' }), JETZT)).toBe('Gesendet am 22.\u00a0Oktober');
    expect(wunschEingang(wunsch(), JETZT)).toBe('Gesendet am 22.\u00a0Oktober');
  });
});

describe('leereTage („Diese Woche“)', () => {
  it('zählt einzelne Tage auf und fasst drei und mehr in Folge zusammen', () => {
    expect(leereTage(['2026-10-25', '2026-10-27', '2026-10-29', '2026-10-30'])).toBe(
      'So., Di., Do., Fr.',
    );
    expect(leereTage(['2026-10-25', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'])).toBe(
      'So., Di. bis Fr.',
    );
    expect(leereTage([])).toBe('');
  });

  it('nennt einen belegten Tag kurz mit Wochentag (Schritt 3b)', () => {
    expect(tagDerWoche('2026-10-26')).toBe('Mo., 26.');
    expect(tagDerWoche('2026-11-01')).toBe('So., 1.');
  });
});
