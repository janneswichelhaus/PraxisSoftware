import type { RoleKey } from '@/features/core/session/types';

/**
 * Was eine Rolle in dieser Praxis darf - ein Satz, dort, wo sie vergeben wird
 * (ORG-01).
 *
 * Bis UXR-011 stand unter „Praxismanagement" „Kein klinischer Freitext" - seit
 * E15 (PROJECT_PRINCIPLES.md 4.3, ADR-004 Fassung 2) liest das Praxismanagement
 * aber alle klinischen Inhalte. Die Praxisinhaber:in vergab damit Zugriff auf
 * Gesundheitsdaten im Glauben, er bleibe verschlossen. Ebenso falsch waren
 * „Vollzugriff" beim Praxisinhaber - allein dokumentiert diese Rolle nicht -
 * und „organisatorische Auswertungen" der Teamleitung, die es nicht gibt.
 *
 * Die Sätze sind reine Auskunft; die Rechte selbst stehen in
 * `src/features/session/types.ts` und verbindlich in der Datenbank.
 * `rollenhinweise.test.ts` hält beides gegeneinander: Ändert sich ein Recht,
 * scheitert der Test, bis der Satz wieder stimmt.
 */
export const ROLLENHINWEISE: Partial<Record<RoleKey, string>> = {
  therapist: 'Behandelt, dokumentiert, sieht alle Akten der Praxis.',
  team_lead: 'Wie Therapeut:in, dazu Arbeitszeiten pflegen.',
  office:
    'Termine, Arbeitszeiten, Abrechnung, Mitarbeiterstammdaten und Trainingskund:innen. Liest alle Akten einschließlich Dokumentation, schreibt aber keine klinischen Inhalte.',
  // TRN-003: Die Grenze zur Behandlung steht im Satz, weil sie beim Vergeben
  // am wenigsten erwartet wird (ADR-021 Punkt 6).
  trainer:
    'Betreut Trainingskund:innen: anlegen, ändern, Vertrag beenden. Sieht keine Akten, keine Termine der Behandlung und keine Dokumentation.',
  owner:
    'Zugänge, Rollen, Protokoll, Abrechnung und Trainingskund:innen; liest alle Akten. Dokumentieren nur zusammen mit der Rolle Therapeut:in oder Teamleitung.',
};

/**
 * Rollen, die ein Praxiszugang bekommen kann. `patient` ist ein anderes Konzept
 * (§4.6). Die Trainingsbetreuung seit TRN-003 - verbindlich prüft
 * `app.assert_staff_role_keys`. Dieselben bietet die Rollenwahl beim Einrichten
 * an (`NewStaffMemberPage`, Überholung 6); deshalb hier statt am Zugang.
 */
export const WAEHLBARE_ROLLEN: readonly RoleKey[] = [
  'therapist',
  'team_lead',
  'office',
  'trainer',
  'owner',
];
