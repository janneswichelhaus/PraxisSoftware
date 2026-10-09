import { describe, expect, it } from 'vitest';
import {
  canChangePatientStatus,
  canConcludePatientCare,
  canCorrectPatientFileType,
  canManageAppointments,
  canManageStaffAccounts,
  canManageStaffEmployment,
  canManageStaffMasterData,
  canManageStaffPrivateDetails,
  canReadClinicalPatientFiles,
  canReadExerciseLibrary,
  canReadExercisePlans,
  canReadTrainingContent,
  canWriteExercisePlans,
  canWriteTrainingProtocols,
  canReadPatientDirectory,
  canReadTreatmentBasisClinical,
  canReadTreatmentNote,
  canRecordAtAppointment,
  canWriteClinicalPatientFiles,
  canWriteTreatmentBases,
  canWriteTreatmentNote,
  isStaff,
  isTherapyStaff,
  canReadTrainingClients,
  canWriteTrainingClients,
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

// E10 teilt die Mitarbeiterverwaltung in drei Bereiche. Die Tests halten die
// Dreiteilung fest, damit ein spaeteres Oeffnen eines Bereichs nicht
// versehentlich die anderen mit oeffnet.
describe('canManageStaffMasterData', () => {
  it('erlaubt owner und office die Stammdatenpflege (E10)', () => {
    expect(canManageStaffMasterData(['owner'])).toBe(true);
    expect(canManageStaffMasterData(['office'])).toBe(true);
  });

  it.each([['therapist'], ['team_lead'], ['patient']] as const)('schliesst %s aus', (role) => {
    expect(canManageStaffMasterData([role])).toBe(false);
  });

  it('wertet Mehrfachrollen als Vereinigung (ADR-004)', () => {
    expect(canManageStaffMasterData(['therapist', 'office'])).toBe(true);
    expect(canManageStaffMasterData([])).toBe(false);
  });
});

describe('canManageStaffPrivateDetails', () => {
  it('bleibt bei owner - deckungsgleich mit dem Leserecht (ANN-024)', () => {
    expect(canManageStaffPrivateDetails(['owner'])).toBe(true);
  });

  it.each([['office'], ['therapist'], ['team_lead'], ['patient']] as const)(
    'schliesst %s aus',
    (role) => {
      expect(canManageStaffPrivateDetails([role])).toBe(false);
    },
  );
});

describe('canManageStaffEmployment', () => {
  it('bleibt bei owner: der Statuswechsel hat arbeitsrechtliche Wirkung (E10)', () => {
    expect(canManageStaffEmployment(['owner'])).toBe(true);
  });

  it.each([['office'], ['therapist'], ['team_lead'], ['patient']] as const)(
    'schliesst %s aus',
    (role) => {
      expect(canManageStaffEmployment([role])).toBe(false);
    },
  );
});

describe('canManageStaffAccounts', () => {
  it('bleibt bei owner: Rollenvergabe ist Berechtigungsvergabe (ADR-004, E10)', () => {
    expect(canManageStaffAccounts(['owner'])).toBe(true);
  });

  it.each([['office'], ['therapist'], ['team_lead'], ['patient']] as const)(
    'schliesst %s aus',
    (role) => {
      expect(canManageStaffAccounts([role])).toBe(false);
    },
  );
});

describe('isStaff', () => {
  it('trennt Praxisrollen von Patientenkonten', () => {
    expect(isStaff(['office'])).toBe(true);
    expect(isStaff(['patient'])).toBe(false);
  });
});

describe('Training und Behandlungsseite (TRN-EPIC-001)', () => {
  it('spiegelt app.is_staff(): die Trainingsbetreuung gehört nicht zur Behandlungsseite', () => {
    for (const rolle of ['owner', 'therapist', 'team_lead', 'office'] as const) {
      expect(isTherapyStaff([rolle]), rolle).toBe(true);
    }
    expect(isTherapyStaff(['trainer'])).toBe(false);
    expect(isTherapyStaff(['patient'])).toBe(false);
  });

  it('gibt das Training owner, trainer und office - nicht therapist und team_lead (ANN-172)', () => {
    for (const rolle of ['owner', 'trainer', 'office'] as const) {
      expect(canReadTrainingClients([rolle]), rolle).toBe(true);
      expect(canWriteTrainingClients([rolle]), rolle).toBe(true);
    }
    for (const rolle of ['therapist', 'team_lead', 'patient'] as const) {
      expect(canReadTrainingClients([rolle]), rolle).toBe(false);
      expect(canWriteTrainingClients([rolle]), rolle).toBe(false);
    }
  });
});

describe('roleKeySchema', () => {
  it('lehnt unbekannte Rollen ab, statt sie durchzureichen', () => {
    expect(roleKeySchema.safeParse('admin').success).toBe(false);
    expect(roleKeySchema.safeParse('owner').success).toBe(true);
  });
});

describe('Behandlungsdokumentation (DOK-001)', () => {
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'laesst %s lesen',
    (role) => {
      expect(canReadTreatmentNote([role])).toBe(true);
    },
  );

  it('laesst office lesen, aber nicht dokumentieren (E15, PROJECT_PRINCIPLES.md 4.3)', () => {
    // Office liest denselben Inhalt wie die Therapeutin - geschrieben wird er
    // weiterhin nur von den therapeutischen Rollen.
    expect(canReadTreatmentNote(['office'])).toBe(true);
    expect(canWriteTreatmentNote(['office'])).toBe(false);
  });

  it('schliesst ein Patientenkonto aus (4.6)', () => {
    expect(canReadTreatmentNote(['patient'])).toBe(false);
    expect(canWriteTreatmentNote(['patient'])).toBe(false);
  });

  it.each([['therapist'], ['team_lead']] as const)('laesst %s dokumentieren', (role) => {
    expect(canWriteTreatmentNote([role])).toBe(true);
  });

  it('laesst einen reinen owner-Zugang lesen, aber nicht dokumentieren (4.1 gegen 4.2)', () => {
    expect(canReadTreatmentNote(['owner'])).toBe(true);
    expect(canWriteTreatmentNote(['owner'])).toBe(false);
    // Mit therapeutischer Zweitrolle sehr wohl - Mehrfachrollen sind die
    // Vereinigung (ADR-004).
    expect(canWriteTreatmentNote(['owner', 'therapist'])).toBe(true);
  });

  it('behandelt eine leere Rollenliste als kein Recht', () => {
    expect(canReadTreatmentNote([])).toBe(false);
    expect(canWriteTreatmentNote([])).toBe(false);
  });
});

describe('Verordnung und Dateien (ROL-002, E15)', () => {
  it.each([['owner'], ['therapist'], ['team_lead'], ['office']] as const)(
    'laesst %s die klinischen Verordnungsfelder und klinische Dateien lesen',
    (role) => {
      expect(canReadTreatmentBasisClinical([role])).toBe(true);
      expect(canReadClinicalPatientFiles([role])).toBe(true);
    },
  );

  it('laesst office Behandlungsgrundlagen erfassen (PRX-010, ANN-011)', () => {
    expect(canWriteTreatmentBases(['office'])).toBe(true);
    expect(canWriteTreatmentBases(['trainer'])).toBe(false);
    expect(canWriteTreatmentBases([])).toBe(false);
  });

  it('oeffnet office mit dem Leserecht kein Schreibrecht (PROJECT_PRINCIPLES.md 4.3)', () => {
    expect(canWriteClinicalPatientFiles(['office'])).toBe(false);
    expect(canCorrectPatientFileType(['office'])).toBe(false);
    expect(canConcludePatientCare(['office'])).toBe(false);
  });

  it.each([['owner'], ['therapist'], ['team_lead']] as const)(
    'laesst %s klinische Dateien pflegen und die Art korrigieren',
    (role) => {
      expect(canWriteClinicalPatientFiles([role])).toBe(true);
      expect(canCorrectPatientFileType([role])).toBe(true);
    },
  );

  it('schliesst ein Patientenkonto aus (4.6)', () => {
    expect(canReadTreatmentBasisClinical(['patient'])).toBe(false);
    expect(canReadClinicalPatientFiles(['patient'])).toBe(false);
    expect(canWriteClinicalPatientFiles(['patient'])).toBe(false);
    expect(canCorrectPatientFileType(['patient'])).toBe(false);
  });
});

describe('canRecordAtAppointment (PRX-009, ANN-140)', () => {
  const ANNA = '55555555-5555-4555-8555-000000000002';
  const TIM = '55555555-5555-4555-8555-000000000004';

  it('lässt owner und office an jedem Termin', () => {
    expect(canRecordAtAppointment(['office'], TIM, null)).toBe(true);
    expect(canRecordAtAppointment(['owner'], TIM, ANNA)).toBe(true);
  });

  it('lässt Behandelnde nur an ihrem eigenen Termin', () => {
    expect(canRecordAtAppointment(['therapist'], ANNA, ANNA)).toBe(true);
    expect(canRecordAtAppointment(['team_lead'], TIM, TIM)).toBe(true);
    expect(canRecordAtAppointment(['therapist'], TIM, ANNA)).toBe(false);
    expect(canRecordAtAppointment(['therapist'], ANNA, null)).toBe(false);
  });

  it('lässt Trainingsbetreuung und Patientenkonto nie', () => {
    expect(canRecordAtAppointment(['trainer'], ANNA, ANNA)).toBe(false);
    expect(canRecordAtAppointment(['patient'], ANNA, null)).toBe(false);
  });
});

describe('Das Büro liest im Training mit (ABN-030, BEF-137)', () => {
  it('liest Inhalte, Pläne und Bibliothek, schreibt aber keine Trainingsinhalte', () => {
    expect(canReadTrainingContent(['office'])).toBe(true);
    expect(canReadExercisePlans(['office'], 'training')).toBe(true);
    expect(canReadExerciseLibrary(['office'])).toBe(true);
    expect(canWriteExercisePlans(['office'], 'training')).toBe(false);
    expect(canWriteTrainingProtocols(['office'])).toBe(false);
  });

  it('öffnet das Training nicht für die Behandlungsrollen (ADR-021 Punkt 6)', () => {
    for (const rolle of ['therapist', 'team_lead'] as const) {
      expect(canReadTrainingContent([rolle])).toBe(false);
      expect(canReadExercisePlans([rolle], 'training')).toBe(false);
    }
  });
});
