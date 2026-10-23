import { describe, expect, it } from 'vitest';
import type { Einwilligung, Plattformzugang } from './api';
import {
  MITTEILUNGSARTEN,
  einstiegsseiten,
  einwilligungstitel,
  freiwilligkeit,
  mitArten,
  mitteilungenAn,
  mitteilungsarten,
  nochFragen,
  offeneEinwilligungen,
  willkommenssatz,
  willkommenstitel,
  zahlwort,
} from './einstiegsablauf';

/** Neue Vorlagen tragen `own_name` und `practice_phone`, hier ohne Wert. */
const SELBST: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: null,
  practice_phone: null,
};

describe('Seiten des Einstiegs (5.3)', () => {
  it('fragt nach Einwilligungen, wenn eine offen ist - eine Begleitung nie (ADR-023 Punkt 13)', () => {
    expect(einstiegsseiten(SELBST, 2)).toEqual([
      'willkommen',
      'einwilligungen',
      'mitteilungen',
      'bereit',
    ]);
    expect(einstiegsseiten({ access_kind: 'legal_representative' }, 1)).toContain('einwilligungen');
    expect(einstiegsseiten(SELBST, 0)).toEqual(['willkommen', 'mitteilungen', 'bereit']);
    expect(einstiegsseiten({ access_kind: 'companion' }, 2)).toEqual([
      'willkommen',
      'mitteilungen',
      'bereit',
    ]);
  });
});

describe('Einwilligungen im Einstieg (ANN-693)', () => {
  const zeile = (
    purpose: Einwilligung['purpose'],
    state: Einwilligung['state'],
    can_grant = true,
  ) => ({ purpose, state, occurred_on: null, source: null, can_grant }) satisfies Einwilligung;

  it('fragt nur, was offen ist, erteilt werden kann und angeboten wird', () => {
    expect(
      offeneEinwilligungen([
        zeile('email_contact', 'open'),
        zeile('prescriber_report', 'granted'),
        // Fotos und Anhänge stehen nur zum Widerruf (ANN-316, ANN-333).
        zeile('patient_photos', 'open'),
        zeile('message_attachments', 'open'),
        zeile('training_health_data', 'withdrawn'),
      ]),
    ).toEqual(['email_contact']);
    // In der Praxis abgelehnt ist entschieden; nach der Lesefrist geht kein Ja.
    expect(
      offeneEinwilligungen([
        zeile('email_contact', 'refused'),
        zeile('prescriber_report', 'open', false),
      ]),
    ).toEqual([]);
  });

  it('zählt die Fragen im Titel und sagt, dass sie freiwillig sind', () => {
    expect(einwilligungstitel(2, SELBST)).toBe('Zwei Fragen zu Ihren Daten');
    expect(einwilligungstitel(1, SELBST)).toBe('Eine Frage zu Ihren Daten');
    expect(freiwilligkeit(2, SELBST)).toBe(
      'Beides ist freiwillig. Ihre Behandlung hängt nicht davon ab.',
    );
    expect(freiwilligkeit(1, { ...SELBST, relationship_kind: 'training' })).toBe(
      'Das ist freiwillig. Ihr Vertrag hängt nicht davon ab.',
    );
  });

  it('sagt einer rechtlichen Vertretung, für wen sie entscheidet', () => {
    const vertretung = {
      ...SELBST,
      access_kind: 'legal_representative' as const,
      represented_name: 'Max Mustermann',
    };
    expect(einwilligungstitel(2, vertretung)).toBe('Zwei Fragen zu den Daten von Max Mustermann');
    expect(freiwilligkeit(2, vertretung)).toBe(
      'Sie entscheiden hier für Max Mustermann. Beides ist freiwillig. Ihre Behandlung hängt nicht davon ab.',
    );
  });
});

describe('Sätze auf „Willkommen“', () => {
  it('setzt den eigenen Namen in eine eigene Zeile, ohne Namen nur „Willkommen“', () => {
    expect(willkommenstitel({ own_name: 'Erika Beispiel' })).toBe('Willkommen,\nErika Beispiel');
    expect(willkommenstitel({ own_name: null })).toBe('Willkommen');
    expect(willkommenstitel({ own_name: '  ' })).toBe('Willkommen');
  });

  it('sagt wofür - Behandlung, Training oder für wen eine Vertretung liest', () => {
    expect(willkommenssatz(SELBST, 'Test Praxis Tuebingen')).toBe(
      'Schön, dass Sie da sind. Hier finden Sie alles zu Ihrer Behandlung bei Test Praxis Tuebingen.',
    );
    expect(willkommenssatz({ ...SELBST, relationship_kind: 'training' }, '')).toBe(
      'Schön, dass Sie da sind. Hier finden Sie alles zu Ihrem Training bei Ihrer Praxis.',
    );
    expect(
      willkommenssatz(
        { ...SELBST, access_kind: 'companion', represented_name: 'Max Mustermann' },
        'Test Praxis Tuebingen',
      ),
    ).toBe('Hier sehen Sie, was Test Praxis Tuebingen für Max Mustermann bereithält.');
  });

  it('zählt die Fragen in Worten', () => {
    expect(nochFragen(1)).toBe('Noch eine kurze Frage, dann sind Sie fertig.');
    expect(nochFragen(2)).toBe('Noch zwei kurze Fragen, dann sind Sie fertig.');
    expect(zahlwort(5)).toBe('fünf');
    expect(zahlwort(12)).toBe('12');
  });
});

describe('Der eine Schalter für Mitteilungen (ANN-694)', () => {
  it('schaltet Termine, Antworten und neue Pläne ein, nie die Erinnerung ans Tagebuch', () => {
    expect(MITTEILUNGSARTEN).toEqual([
      'appointment_reminder',
      'appointment_changed',
      'appointment_cancelled',
      'message_answered',
      'request_answered',
      'plan_assigned',
    ]);
    expect(MITTEILUNGSARTEN).not.toContain('nutrition_diary_reminder');
    // Was die Praxis für alle abgeschaltet hat, bleibt aus.
    expect(mitteilungsarten(['plan_assigned'])).not.toContain('plan_assigned');
  });

  it('ist an, wenn eine seiner Arten kommt, und lässt beim Schalten die übrigen Arten stehen', () => {
    const arten = mitteilungsarten([]);
    expect(mitteilungenAn([], arten)).toBe(false);
    expect(mitteilungenAn(['nutrition_diary_reminder'], arten)).toBe(false);
    expect(mitteilungenAn(['message_answered'], arten)).toBe(true);
    expect(mitArten(['nutrition_diary_reminder'], arten, true)).toEqual([
      'nutrition_diary_reminder',
      ...arten,
    ]);
    expect(mitArten(['nutrition_diary_reminder', ...arten], arten, false)).toEqual([
      'nutrition_diary_reminder',
    ]);
  });
});
