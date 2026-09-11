import { describe, expect, it } from 'vitest';
import { adressZeilen, istOffen, offenGrund, rufnummern, telHref, type DayPlanEntry } from './api';

/**
 * Reine Ableitungen der Tagesliste (UX-001).
 *
 * Sie entscheiden, was am Nachmittag noch auf der Liste steht und was wählbar
 * ist. Beides gehört in Tests und nicht in einen Blick auf den Bildschirm.
 */

function eintrag(teil: Partial<DayPlanEntry> = {}): DayPlanEntry {
  return {
    id: 't1',
    patient_id: 'p1',
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: '2026-09-10T07:00:00.000Z',
    ends_at: '2026-09-10T08:00:00.000Z',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
    ...teil,
  };
}

describe('istOffen', () => {
  it('fuehrt einen noch ausstehenden Besuch als offen', () => {
    expect(istOffen(eintrag({ status: 'confirmed' }), true)).toBe(true);
  });

  it('fuehrt einen abgesagten Termin nie als offen', () => {
    expect(istOffen(eintrag({ status: 'cancelled' }), true)).toBe(false);
    expect(istOffen(eintrag({ status: 'cancelled' }), false)).toBe(false);
  });

  it('fuehrt einen abgeschlossenen Termin ohne finalisierte Dokumentation als offen', () => {
    expect(istOffen(eintrag({ status: 'completed', documentation_status: 'none' }), true)).toBe(
      true,
    );
    expect(istOffen(eintrag({ status: 'completed', documentation_status: 'draft' }), true)).toBe(
      true,
    );
  });

  it('fuehrt einen abgeschlossenen Termin mit finalisierter Dokumentation als erledigt', () => {
    expect(istOffen(eintrag({ status: 'completed', documentation_status: 'final' }), true)).toBe(
      false,
    );
  });

  it('macht aus dem Dokumentationsstand keine Aufgabe fuer Rollen, die nicht dokumentieren', () => {
    const termin = eintrag({ status: 'completed', documentation_status: 'draft' });
    expect(istOffen(termin, false)).toBe(false);
  });

  it('behauptet nichts, wenn der Dokumentationsstand nicht ausgeliefert wurde', () => {
    const termin = eintrag({ status: 'completed', documentation_status: null });
    expect(istOffen(termin, true)).toBe(false);
  });
});

describe('offenGrund', () => {
  it('benennt den Grund als Text, nicht als Farbe', () => {
    expect(offenGrund(eintrag({ status: 'completed', documentation_status: 'draft' }))).toBe(
      'Dokumentation noch Entwurf',
    );
    expect(offenGrund(eintrag({ status: 'completed', documentation_status: 'none' }))).toBe(
      'Dokumentation fehlt',
    );
  });

  it('nennt fuer einen ausstehenden Besuch keinen Grund', () => {
    expect(offenGrund(eintrag({ status: 'confirmed' }))).toBeNull();
  });
});

describe('adressZeilen', () => {
  it('setzt Strasse mit Hausnummer und Ort in zwei Zeilen', () => {
    expect(adressZeilen(eintrag())).toEqual(['Testweg 7', '72072 Tuebingen']);
  });

  it('bleibt leer, wenn kein Hausbesuch vorliegt', () => {
    const praxis = eintrag({
      appointment_type: 'practice',
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
    });
    expect(adressZeilen(praxis)).toEqual([]);
  });
});

describe('telHref', () => {
  it('entfernt Leerzeichen und behaelt die Landesvorwahl', () => {
    expect(telHref('+49 160 0000005')).toBe('tel:+491600000005');
  });

  it('entfernt Klammern und Bindestriche', () => {
    expect(telHref('07071 / 12-34')).toBe('tel:070711234');
  });

  it('laesst ein Plus nur am Anfang stehen', () => {
    expect(telHref('0170+123')).toBe('tel:0170123');
  });
});

describe('rufnummern', () => {
  it('nennt Mobil zuerst - unterwegs ist das die erreichbare Nummer', () => {
    const termin = eintrag({ patient_phone: '07071 1', patient_phone_mobile: '0160 2' });
    expect(rufnummern(termin).map((n) => n.label)).toEqual(['Mobil', 'Telefon']);
  });

  it('laesst leere und nur aus Leerzeichen bestehende Nummern weg', () => {
    const termin = eintrag({ patient_phone: '   ', patient_phone_mobile: null });
    expect(rufnummern(termin)).toEqual([]);
  });
});
