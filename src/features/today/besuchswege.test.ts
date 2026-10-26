import { describe, expect, it } from 'vitest';
import {
  anrufNummer,
  ausfallMoeglich,
  dokuZiel,
  smsHref,
  smsNummer,
  verspaetungsText,
  VERSPAETUNG_MINUTEN,
} from './besuchswege';
import type { DayPlanEntry } from '@/features/day-plan/api';

const BEGINN = Date.parse('2026-10-13T08:00:00.000Z');

function termin(teil: Partial<DayPlanEntry> = {}): DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2026-10-13T08:00:00.000Z',
    ends_at: '2026-10-13T09:00:00.000Z',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    patient_phone: '+49 7071 0000006',
    patient_phone_mobile: '+49 160 0000006',
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

const AKTE = `/patienten/p1/doku?termin=t1&zurueck=${encodeURIComponent('/')}`;
const SCHREIBSEITE = `/termine/t1/abschluss?zurueck=${encodeURIComponent('/')}`;

describe('dokuZiel (Auftrag C1, ANN-225)', () => {
  it('führt vor dem Besuch in die Akte (Jannes 2026-10-03, ANN-225)', () => {
    expect(dokuZiel(termin(), BEGINN - 60_000, true)).toBe(AKTE);
  });

  it('führt ab dem Beginn direkt auf die Schreibseite - auch überfällig', () => {
    expect(dokuZiel(termin(), BEGINN, true)).toBe(SCHREIBSEITE);
    expect(dokuZiel(termin(), BEGINN + 3 * 3_600_000, true)).toBe(SCHREIBSEITE);
  });

  it('führt bei offener Doku oder Entwurf auf die Schreibseite, festgeschrieben in die Akte', () => {
    expect(dokuZiel(termin({ status: 'completed' }), 0, true)).toBe(SCHREIBSEITE);
    expect(dokuZiel(termin({ status: 'completed', documentation_status: 'draft' }), 0, true)).toBe(
      SCHREIBSEITE,
    );
    expect(
      dokuZiel(termin({ status: 'completed', documentation_status: 'final' }), BEGINN, true),
    ).toBe(AKTE);
    expect(
      dokuZiel(termin({ status: 'documented', documentation_status: 'final' }), BEGINN, true),
    ).toBe(AKTE);
  });

  it('führt wer nicht schreiben darf immer in die Akte', () => {
    expect(dokuZiel(termin(), BEGINN + 60_000, false)).toBe(AKTE);
  });

  it('kennt ohne Patient:in kein Ziel', () => {
    expect(dokuZiel(termin({ patient_id: null }), BEGINN, true)).toBeNull();
  });
});

describe('Anruf und „Später da?" (ANN-476)', () => {
  it('wählt zuerst Mobil, sonst das Festnetz', () => {
    expect(anrufNummer(termin())?.href).toBe('tel:+491600000006');
    expect(anrufNummer(termin({ patient_phone_mobile: null }))?.href).toBe('tel:+4970710000006');
    expect(anrufNummer(termin({ patient_phone_mobile: null, patient_phone: null }))).toBeNull();
  });

  it('schreibt eine SMS nur an eine Mobilnummer', () => {
    expect(smsNummer(termin())).toBe('+49 160 0000006');
    expect(smsNummer(termin({ patient_phone_mobile: '  ' }))).toBeNull();
  });

  it('übergibt Nummer und Text an die SMS-App, ohne Namen und ohne Grund', () => {
    const text = verspaetungsText('Test Praxis', 15);
    expect(text).toBe(
      'Guten Tag, hier Test Praxis. Ich bin etwa 15 Minuten später da als vereinbart.',
    );
    const ziel = smsHref('+49 160 0000006', text);
    expect(ziel.startsWith('sms:+491600000006?&body=')).toBe(true);
    expect(decodeURIComponent(ziel.split('body=')[1]!)).toBe(text);
    expect(VERSPAETUNG_MINUTEN).toEqual([10, 15, 20]);
  });
});

describe('„Ausfall“ an der Zeile (B12, ANN-533)', () => {
  it('steht ab dem Beginn eines bestätigten Behandlungstermins ohne Doku - am Hausbesuch wie in der Praxis', () => {
    expect(ausfallMoeglich(termin(), BEGINN)).toBe(true);
    expect(ausfallMoeglich(termin(), BEGINN + 3 * 3_600_000)).toBe(true);
    expect(ausfallMoeglich(termin({ appointment_type: 'practice' }), BEGINN)).toBe(true);
    expect(ausfallMoeglich(termin({ appointment_type: 'video' }), BEGINN)).toBe(true);
  });

  it('steht nicht vor dem Beginn - vorher ist ein Ausfall nicht feststellbar', () => {
    expect(ausfallMoeglich(termin(), BEGINN - 1)).toBe(false);
    // Ein künftiger Tag der Übersicht liegt ganz vor einem (ANN-234).
    expect(ausfallMoeglich(termin(), 0)).toBe(false);
  });

  it('steht nicht, sobald es eine Doku gibt - auch keinen Entwurf - oder der Stand unbekannt ist', () => {
    for (const documentation_status of ['draft', 'final', null] as const) {
      expect(ausfallMoeglich(termin({ documentation_status }), BEGINN)).toBe(false);
    }
  });

  it('steht nur am bestätigten Termin', () => {
    for (const status of ['completed', 'documented', 'invoiced', 'no_show', 'cancelled'] as const) {
      expect(ausfallMoeglich(termin({ status }), BEGINN)).toBe(false);
    }
  });

  it('steht nicht an Training, Fehlzeit oder einem Termin ohne Patient:in', () => {
    expect(ausfallMoeglich(termin({ kind: 'training', patient_id: null }), BEGINN)).toBe(false);
    expect(ausfallMoeglich(termin({ kind: 'internal', patient_id: null }), BEGINN)).toBe(false);
    expect(ausfallMoeglich(termin({ patient_id: null }), BEGINN)).toBe(false);
  });
});
