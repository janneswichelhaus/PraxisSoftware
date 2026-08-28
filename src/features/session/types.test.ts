import { describe, expect, it } from 'vitest';
import { canReadPatientDirectory, isStaff, roleKeySchema } from './types';

/**
 * Die Rollenlogik im Client steuert ausschliesslich die Darstellung. Sie wird
 * hier trotzdem geprueft, weil eine falsche Navigation Patient:innen Wege
 * anbietet, die der Server anschliessend verweigert.
 */
describe('canReadPatientDirectory', () => {
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'erlaubt %s den Zugriff auf die Kartei',
    (role) => {
      expect(canReadPatientDirectory([role])).toBe(true);
    },
  );

  it('erlaubt einem reinen Patientenkonto keinen Karteizugriff', () => {
    expect(canReadPatientDirectory(['patient'])).toBe(false);
  });

  it('wertet Mehrfachrollen als Vereinigung (ADR-004)', () => {
    expect(canReadPatientDirectory(['patient', 'therapist'])).toBe(true);
    expect(canReadPatientDirectory([])).toBe(false);
  });
});

describe('isStaff', () => {
  it('trennt Praxisrollen von Patientenkonten', () => {
    expect(isStaff(['office'])).toBe(true);
    expect(isStaff(['patient'])).toBe(false);
  });
});

describe('roleKeySchema', () => {
  it('lehnt unbekannte Rollen ab, statt sie durchzureichen', () => {
    expect(roleKeySchema.safeParse('admin').success).toBe(false);
    expect(roleKeySchema.safeParse('owner').success).toBe(true);
  });
});
