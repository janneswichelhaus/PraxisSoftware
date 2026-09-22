import { useOutletContext } from 'react-router-dom';
import {
  canManageAppointments,
  canReadPatientDirectory,
  canReadPatientFiles,
  canReadTreatmentBases,
  canReadTreatmentNote,
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

interface Aktenbereich {
  to: string;
  label: string;
  /** Nur der Einstieg ist exakt; die übrigen haben keine Unterseiten. */
  end?: boolean;
}

/**
 * Die Bereiche der Akte in der Reihenfolge des Arbeitstags.
 *
 * Termine zuerst, weil dort gearbeitet wird. Stammdaten zuletzt, weil sie sich
 * am seltensten ändern - sie sind die Auskunft, die man einmal bei der
 * Aufnahme braucht (§13: das Häufige zuerst).
 *
 * **Einen Bereich „Übersicht" gibt es nicht mehr** (UI-002a). Er war ein
 * Auszug aus den vier anderen - nächste Termine, laufende Grundlagen,
 * letzter Behandlungsstand - und kostete bei jedem Aufruf der Akte einen Tap,
 * bevor irgendetwas zu tun war. Wer die Akte öffnet, landet jetzt dort, wo
 * gearbeitet wird. Die beiden Angaben, die vor einem Hausbesuch zählen und
 * sonst nur in den Stammdaten stünden, stehen im Kopf der Akte.
 *
 * Die Rollenprüfung steuert ausschließlich die Navigation. Sie ist **keine**
 * Zugriffskontrolle: Wer eine Adresse direkt aufruft, bekommt vom Server
 * schlicht keine Daten (ADR-004).
 */
export function aktenBereiche(patientId: string, user: CurrentUser): Aktenbereich[] {
  const basis = `/patienten/${patientId}`;
  const bereiche: Aktenbereich[] = [];

  if (canManageAppointments(user.roles)) {
    bereiche.push({ to: `${basis}/termine`, label: 'Termine' });
  }
  if (canReadTreatmentBases(user.roles)) {
    // Der Bereich zeigt beide Bauarten, deshalb steht hier das Oberwort
    // (ADR-020 Punkt 7). Das Adressfragment bleibt `verordnungen` (ANN-062).
    bereiche.push({ to: `${basis}/verordnungen`, label: 'Behandlungsgrundlagen' });
  }
  // Seit E15 steht hier für alle vier Praxisrollen dieselbe klinische Sicht,
  // office eingeschlossen (ROL-001); jeder gelesene Eintrag wird protokolliert.
  if (canReadTreatmentNote(user.roles)) {
    bereiche.push({ to: `${basis}/verlauf`, label: 'Behandlungsverlauf' });
  }
  // Dateien vor den Stammdaten: „was liegt uns vor" wird im Gespräch häufiger
  // gebraucht als eine Adresse. Was `office` dort sieht, entscheidet die
  // Dokumentart in der Datenbank, nicht diese Zeile (ADR-017 Punkt 12).
  if (canReadPatientFiles(user.roles)) {
    bereiche.push({ to: `${basis}/dateien`, label: 'Dateien' });
  }
  // Datenschutz vor den Stammdaten und hinter den Dateien: gebraucht bei der
  // Aufnahme und bei einer Rückfrage, nicht im Tagesgeschäft (PAT-006). Die
  // vier Praxisrollen, dieselben wie die Kartei; verbindlich ist die RLS.
  if (canReadPatientDirectory(user.roles)) {
    bereiche.push({ to: `${basis}/datenschutz`, label: 'Datenschutz' });
  }
  bereiche.push({ to: `${basis}/stammdaten`, label: 'Stammdaten' });

  return bereiche;
}

/**
 * Wohin `/patienten/:id` führt (UI-002a).
 *
 * Immer der erste Bereich, den die Rolle sehen darf. Für die behandelnden und
 * verwaltenden Rollen sind das die Termine; einem Patientenkonto bleiben die
 * Stammdaten, und die stehen in jeder Liste - `aktenBereiche` gibt deshalb nie
 * eine leere Liste zurück.
 */
export function ersterAktenbereich(patientId: string, user: CurrentUser): string {
  return aktenBereiche(patientId, user)[0]!.to;
}
