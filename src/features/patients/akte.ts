import { useOutletContext } from 'react-router-dom';
import {
  canManageAppointments,
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
 * Wo in den Stammdaten der Anmeldebogen steht - Ziel des Hinweises im Kopf,
 * der Erstaufnahme und der alten Adresse `/datenschutz` (AKTE-007).
 */
export const ANMELDEBOGEN_ANKER = 'anmeldebogen';

/** Die Einwilligungen in den Stammdaten - Ziel von „Zu den Einwilligungen" (Foto aufnehmen). */
export const EINWILLIGUNGEN_ANKER = 'einwilligungen';

/**
 * Die Bereiche der Akte in der Reihenfolge des Arbeitstags - genau vier
 * (AKTE-007, Jannes 2026-10-03).
 *
 * Termine zuerst, weil dort gearbeitet wird. Stammdaten zuletzt, weil sie sich
 * am seltensten ändern - sie sind die Auskunft, die man einmal bei der
 * Aufnahme braucht (§13: das Häufige zuerst).
 *
 * **Einen Bereich „Übersicht" gibt es nicht mehr** (UI-002a). Er war ein
 * Auszug aus den anderen - nächste Termine, laufende Grundlagen,
 * letzter Behandlungsstand - und kostete bei jedem Aufruf der Akte einen Tap,
 * bevor irgendetwas zu tun war.
 *
 * **Bis AKTE-007 waren es sieben.** „Behandlungsverlauf" und „Befund" sind
 * jetzt die „Doku", „Datenschutz" ist der Anmeldebogen in den Stammdaten, und
 * „Dateien" gibt es nicht mehr: Jede Datei steht im Bereich, zu dem sie
 * gehört (`dateibereich` in `features/files/dokumentarten.ts`). Die alten
 * Adressen leiten weiter (`ALTE_AKTENBEREICHE`).
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
  // Verlauf, Befund samt Anamnesebogen und die klinischen Dateien. Seit E15
  // für alle vier Praxisrollen dieselbe klinische Sicht, office eingeschlossen
  // (ROL-001); das Lesen protokolliert das Öffnen der Akte.
  // Doku vor den Grundlagen (Akte entschlacken, 2026-10-03): am Termin der
  // häufigere Weg.
  if (canReadTreatmentNote(user.roles)) {
    bereiche.push({ to: `${basis}/doku`, label: 'Doku' });
  }
  if (canReadTreatmentBases(user.roles)) {
    // Der Bereich zeigt beide Bauarten, deshalb steht hier das Oberwort
    // (ADR-020 Punkt 7). Das Adressfragment bleibt `verordnungen` (ANN-062).
    bereiche.push({ to: `${basis}/verordnungen`, label: 'Behandlungsgrundlagen' });
  }
  bereiche.push({ to: `${basis}/stammdaten`, label: 'Stammdaten' });

  return bereiche;
}

/**
 * Die Adressen der abgelösten Bereiche und wohin sie heute führen (AKTE-007).
 * Gespeicherte Rückwege und Lesezeichen landen so im neuen Bereich statt auf
 * einer leeren Seite.
 */
export const ALTE_AKTENBEREICHE = {
  verlauf: 'doku',
  befund: 'doku/befund',
  datenschutz: `stammdaten#${ANMELDEBOGEN_ANKER}`,
  dateien: 'stammdaten',
} as const satisfies Record<string, string>;

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
