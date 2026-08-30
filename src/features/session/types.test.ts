import { describe, expect, it } from 'vitest';
import {
  canChangePatientStatus,
  canManageAppointments,
  canManageStaff,
  canReadPatientDirectory,
  isStaff,
  roleKeySchema,
} from './types';

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

describe('canChangePatientStatus', () => {
  it.each([['owner'], ['team_lead'], ['office']] as const)(
    'erlaubt %s den Statuswechsel',
    (role) => {
      expect(canChangePatientStatus([role])).toBe(true);
    },
  );

  it('schliesst therapist aus, obwohl die Kartei lesbar ist', () => {
    // Der Statuswechsel ist ein Verwaltungsvorgang, kein Behandlungsschritt.
    expect(canReadPatientDirectory(['therapist'])).toBe(true);
    expect(canChangePatientStatus(['therapist'])).toBe(false);
  });

  it('erlaubt einem reinen Patientenkonto keinen Statuswechsel', () => {
    expect(canChangePatientStatus(['patient'])).toBe(false);
    expect(canChangePatientStatus([])).toBe(false);
  });

  it('wertet Mehrfachrollen als Vereinigung (ADR-004)', () => {
    expect(canChangePatientStatus(['therapist', 'office'])).toBe(true);
  });
});

describe('canManageAppointments', () => {
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'laesst %s Termine planen',
    (role) => {
      expect(canManageAppointments([role])).toBe(true);
    },
  );

  it('laesst ein reines Patientenkonto keine Termine planen', () => {
    expect(canManageAppointments(['patient'])).toBe(false);
    expect(canManageAppointments([])).toBe(false);
  });

  it('wertet Mehrfachrollen als Vereinigung (ADR-004)', () => {
    expect(canManageAppointments(['patient', 'office'])).toBe(true);
  });
});

describe('canManageStaff', () => {
  it('erlaubt der administrativen Praxisrolle die Mitarbeiterverwaltung', () => {
    expect(canManageStaff(['owner'])).toBe(true);
  });

  it.each([['therapist'], ['team_lead'], ['office'], ['patient']] as const)(
    'schliesst %s aus, solange keine Entscheidung dazu vorliegt',
    (role) => {
      expect(canManageStaff([role])).toBe(false);
    },
  );

  it('wertet Mehrfachrollen als Vereinigung (ADR-004)', () => {
    expect(canManageStaff(['office', 'owner'])).toBe(true);
    expect(canManageStaff([])).toBe(false);
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
