import { describe, expect, it } from 'vitest';
import type { DayPlanEntry } from './api';
import {
  anrufNummer,
  dokuZiel,
  smsHref,
  smsNummer,
  verspaetungsText,
  VERSPAETUNG_MINUTEN,
} from './besuchswege';

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
