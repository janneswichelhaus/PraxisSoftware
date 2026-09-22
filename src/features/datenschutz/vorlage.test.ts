import { describe, expect, it } from 'vitest';
import { ablehnungstext, paragraf } from './vorlage';
import type { Aufbewahrungsstand } from './api';

/**
 * Die begründete Ablehnung (OPS-006, ADR-008).
 *
 * Geprüft wird nicht der Wortlaut, sondern das, was die Ablehnung begründet
 * macht: Grundlage, Anker und Datum. Ein Brief, der „aus gesetzlichen Gründen"
 * ablehnt, ist keine Begründung, und ein Brief, der ein Löschdatum nennt,
 * obwohl die Behandlung läuft, ist eine falsche.
 */

function stand(rest: Partial<Aufbewahrungsstand> = {}): Aufbewahrungsstand {
  return {
    patient_id: '66666666-6666-4666-8666-000000000001',
    zeitzone: 'Europe/Berlin',
    versorgung_abgeschlossen_am: null,
    klassen: [
      {
        key: 'patientenakte',
        legal_reference: 'Par. 630f Abs. 3 BGB',
        anchor: 'care_concluded',
        anker_datum: null,
        frist_ende: null,
        loeschbar_ab: null,
        datensaetze: 1,
      },
      {
        key: 'abrechnungsdaten',
        legal_reference: 'Par. 147 Abs. 3 AO',
        anchor: 'calendar_year_end',
        anker_datum: null,
        frist_ende: null,
        loeschbar_ab: null,
        datensaetze: 0,
      },
    ],
    loeschsperre: null,
    ...rest,
  };
}

describe('paragraf', () => {
  it('macht aus der umlautfreien Fundstelle der Datenbank das Zeichen', () => {
    expect(paragraf('Par. 630f Abs. 3 BGB')).toBe('§ 630f Abs. 3 BGB');
    expect(paragraf('Par. 147 Abs. 3 AO')).toBe('§ 147 Abs. 3 AO');
  });

  it('lässt eine Fundstelle ohne Paragrafenzeichen unverändert', () => {
    expect(paragraf('Art. 5 Abs. 2 DSGVO')).toBe('Art. 5 Abs. 2 DSGVO');
  });

  it('gibt für eine fehlende Fundstelle nichts aus, statt „null" zu schreiben', () => {
    expect(paragraf(null)).toBe('');
  });
});

describe('ablehnungstext', () => {
  it('spricht die Person an und nennt die Grundlage der Aufbewahrung', () => {
    const text = ablehnungstext('Max Mustermann', stand());

    expect(text).toContain('Guten Tag Max Mustermann,');
    expect(text).toContain('§ 630f Abs. 3 BGB');
    expect(text).toContain('Art. 17 Abs. 3 lit. b DSGVO');
  });

  it('nennt kein Löschdatum, solange die Behandlung läuft', () => {
    const text = ablehnungstext('Max Mustermann', stand());

    expect(text).toContain('nicht abgeschlossen');
    expect(text).toContain('steht deshalb noch nicht fest');
  });

  it('nennt nach dem Abschluss den Tag, an dem die Frist endet', () => {
    const text = ablehnungstext(
      'Max Mustermann',
      stand({
        versorgung_abgeschlossen_am: '2026-03-15',
        klassen: [
          {
            key: 'patientenakte',
            legal_reference: 'Par. 630f Abs. 3 BGB',
            anchor: 'care_concluded',
            anker_datum: '2026-03-15',
            frist_ende: '2036-03-15',
            loeschbar_ab: '2036-03-15T23:00:00+00:00',
            datensaetze: 1,
          },
        ],
      }),
    );

    expect(text).toContain('15.03.2026 abgeschlossen');
    expect(text).toContain('endet am 15.03.2036');
    expect(text).not.toContain('noch nicht fest');
  });

  it('nennt die steuerliche Frist nur, wenn eine Rechnung ausgestellt wurde', () => {
    const ohne = ablehnungstext('Max Mustermann', stand());
    expect(ohne).not.toContain('§ 147 Abs. 3 AO');

    const mit = ablehnungstext(
      'Max Mustermann',
      stand({
        klassen: [
          ...stand().klassen.filter((k) => k.key !== 'abrechnungsdaten'),
          {
            key: 'abrechnungsdaten',
            legal_reference: 'Par. 147 Abs. 3 AO',
            anchor: 'calendar_year_end',
            anker_datum: '2026-12-31',
            frist_ende: '2034-12-31',
            loeschbar_ab: '2035-01-01T00:00:00+01:00',
            datensaetze: 2,
          },
        ],
      }),
    );
    expect(mit).toContain('§ 147 Abs. 3 AO');
    expect(mit).toContain('31.12.2034');
  });

  it('nennt eine laufende Löschsperre als eigenen Grund', () => {
    const text = ablehnungstext(
      'Max Mustermann',
      stand({ loeschsperre: { seit: '2026-09-01T08:00:00+00:00', grund: 'Honorarstreit' } }),
    );

    expect(text).toContain('Laufender Vorgang');
    expect(text).toContain('01.09.2026');
  });

  it('nennt die Rechte, die trotz der Ablehnung bestehen bleiben', () => {
    const text = ablehnungstext('Max Mustermann', stand());

    for (const recht of [
      'Art. 15 DSGVO',
      'Art. 16 DSGVO',
      'Art. 18 Abs. 1 lit. b DSGVO',
      'Art. 77 DSGVO',
    ]) {
      expect(text).toContain(recht);
    }
  });
});
