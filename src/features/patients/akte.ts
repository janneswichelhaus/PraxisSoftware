import { useOutletContext } from 'react-router-dom';
import {
  canManageAppointments,
  canReadPrescriptions,
  canReadTreatmentEvidence,
  type CurrentUser,
} from '@/features/session/types';
import type { Patient } from './api';

/**
 * Der gemeinsame Zustand der Patientenakte (AKTE-000).
 *
 * Getrennt von `PatientRecordLayout.tsx`, weil jeder Bereich der Akte den
 * Zugriff darauf braucht - auch die Bereiche, die fachlich in anderen
 * Feature-Ordnern liegen. Eine Datei ohne Komponenten lässt sich von überall
 * importieren, ohne den Rahmen mitzuziehen.
 */

export interface PatientRecordContext {
  patient: Patient;
  user: CurrentUser;
}

export function usePatientRecord(): PatientRecordContext {
  return useOutletContext<PatientRecordContext>();
}

export interface Aktenbereich {
  to: string;
  label: string;
  /** Nur der Einstieg ist exakt; die übrigen haben keine Unterseiten. */
  end?: boolean;
}

/**
 * Die Bereiche der Akte in der Reihenfolge des Arbeitstags.
 *
 * Übersicht zuerst, weil sie die Frage „was ist offen" beantwortet.
 * Stammdaten zuletzt, weil sie sich am seltensten ändern - sie sind die
 * Auskunft, die man einmal bei der Aufnahme braucht (§13: das Häufige zuerst).
 *
 * Die Rollenprüfung steuert ausschließlich die Navigation. Sie ist **keine**
 * Zugriffskontrolle: Wer eine Adresse direkt aufruft, bekommt vom Server
 * schlicht keine Daten (ADR-004).
 */
export function aktenBereiche(patientId: string, user: CurrentUser): Aktenbereich[] {
  const basis = `/patienten/${patientId}`;
  const bereiche: Aktenbereich[] = [{ to: basis, label: 'Übersicht', end: true }];

  if (canManageAppointments(user.roles)) {
    bereiche.push({ to: `${basis}/termine`, label: 'Termine' });
  }
  if (canReadPrescriptions(user.roles)) {
    bereiche.push({ to: `${basis}/verordnungen`, label: 'Verordnungen' });
  }
  // Welche Sicht dahinter steht, entscheidet die Rolle: klinische Inhalte für
  // die behandelnden Rollen, der Behandlungsnachweis für die Verwaltung
  // (DOK-003). Beide Sichten beantworten dieselbe Frage - „was ist bisher
  // passiert" - und stehen deshalb hinter derselben Beschriftung.
  if (canReadTreatmentEvidence(user.roles)) {
    bereiche.push({ to: `${basis}/verlauf`, label: 'Behandlungsverlauf' });
  }
  bereiche.push({ to: `${basis}/stammdaten`, label: 'Stammdaten' });

  return bereiche;
}
