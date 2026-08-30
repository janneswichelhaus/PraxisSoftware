import { describe, expect, it } from 'vitest';
import {
  appointmentFormSchema,
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  locationSummary,
  todayInTimeZone,
  type Appointment,
} from './api';

const basis: Appointment = {
  id: '77777777-7777-4777-8777-000000000001',
  patient_id: '66666666-6666-4666-8666-000000000001',
  staff_member_id: '55555555-5555-4555-8555-000000000002',
  location_id: null,
  appointment_type: 'video',
  status: 'scheduled',
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  patient_given_name: 'Berta',
  patient_family_name: 'Bestand',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: null,
  organization_time_zone: 'Europe/Berlin',
};

describe('Darstellung in der Praxiszeitzone', () => {
  it('zeigt eine Sommerzeit-Uhrzeit als Ortszeit (CEST, +02:00)', () => {
    expect(formatLocalTime('2027-05-12T07:00:00.000Z', 'Europe/Berlin')).toBe('09:00');
  });

  it('zeigt eine Winterzeit-Uhrzeit als Ortszeit (CET, +01:00)', () => {
    expect(formatLocalTime('2027-01-15T08:00:00.000Z', 'Europe/Berlin')).toBe('09:00');
  });

  it('bildet dieselbe Ortszeit ueber die Zeitumstellung hinweg ab', () => {
    // Der Tag vor und der Tag nach der Umstellung Ende Maerz 2027 - gleiche
    // Ortszeit, unterschiedlicher UTC-Zeitstempel.
    expect(formatLocalTime('2027-03-27T08:00:00.000Z', 'Europe/Berlin')).toBe('09:00');
    expect(formatLocalTime('2027-03-29T07:00:00.000Z', 'Europe/Berlin')).toBe('09:00');
  });

  it('haelt den Kalendertag an der Tagesgrenze in der Praxiszeitzone', () => {
    // 22:30 UTC ist in Berlin bereits der Folgetag.
    expect(formatLocalDate('2027-05-12T22:30:00.000Z', 'Europe/Berlin')).toMatch(/13\. Mai 2027/);
    expect(formatLocalDate('2027-05-12T22:30:00.000Z', 'UTC')).toMatch(/12\. Mai 2027/);
  });

  it('formatiert einen Zeitraum lesbar', () => {
    expect(formatLocalTimeRange(basis.starts_at, basis.ends_at, 'Europe/Berlin')).toBe(
      '09:00–10:00 Uhr',
    );
  });

  it('liefert den heutigen Praxistag als YYYY-MM-DD', () => {
    // 23:30 UTC am 12.05. ist in Berlin bereits der 13.05.
    const zeitpunkt = new Date('2027-05-12T23:30:00.000Z');
    expect(todayInTimeZone('Europe/Berlin', zeitpunkt)).toBe('2027-05-13');
    expect(todayInTimeZone('UTC', zeitpunkt)).toBe('2027-05-12');
  });
});

describe('Ortsangabe je Terminart', () => {
  it('nennt beim Praxistermin den Standort', () => {
    expect(
      locationSummary({ ...basis, appointment_type: 'practice', location_name: 'Hauptstandort' }),
    ).toBe('Hauptstandort');
  });

  it('nennt beim Hausbesuch die festgehaltene Anschrift', () => {
    expect(
      locationSummary({
        ...basis,
        appointment_type: 'home_visit',
        visit_street: 'Altstrasse',
        visit_house_number: '1',
        visit_postal_code: '50667',
        visit_city: 'Koeln',
      }),
    ).toBe('Altstrasse 1, 50667 Koeln');
  });

  it('nennt beim Videotermin keinen Ort', () => {
    expect(locationSummary(basis)).toBe('Videotermin');
  });
});

describe('appointmentFormSchema', () => {
  const gueltig = {
    staff_member_id: '55555555-5555-4555-8555-000000000002',
    appointment_type: 'video' as const,
    date: '2027-05-12',
    start_time: '09:00',
    end_time: '10:00',
    location_id: '',
  };

  it('nimmt eine vollstaendige Eingabe an', () => {
    expect(appointmentFormSchema.safeParse(gueltig).success).toBe(true);
  });

  it('verlangt eine behandelnde Person', () => {
    const ergebnis = appointmentFormSchema.safeParse({ ...gueltig, staff_member_id: '' });
    expect(ergebnis.success).toBe(false);
  });

  it('weist ein Ende gleich dem Beginn zurueck', () => {
    const ergebnis = appointmentFormSchema.safeParse({ ...gueltig, end_time: '09:00' });
    expect(ergebnis.success).toBe(false);
  });

  it('verlangt beim Praxistermin einen Standort', () => {
    const ergebnis = appointmentFormSchema.safeParse({
      ...gueltig,
      appointment_type: 'practice',
      location_id: '',
    });
    expect(ergebnis.success).toBe(false);
  });

  it('verlangt beim Hausbesuch und beim Videotermin keinen Standort', () => {
    for (const art of ['home_visit', 'video'] as const) {
      expect(
        appointmentFormSchema.safeParse({ ...gueltig, appointment_type: art, location_id: '' })
          .success,
      ).toBe(true);
    }
  });

  it('weist eine unbekannte Terminart zurueck', () => {
    const ergebnis = appointmentFormSchema.safeParse({ ...gueltig, appointment_type: 'surgery' });
    expect(ergebnis.success).toBe(false);
  });
});
