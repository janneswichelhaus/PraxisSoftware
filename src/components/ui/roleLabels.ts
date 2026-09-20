import type { RoleKey } from '@/features/session/types';

/** Anzeigenamen der Rollen aus PROJECT_PRINCIPLES.md 4. */
export const roleLabels: Record<RoleKey, string> = {
  owner: 'Praxisinhaber',
  therapist: 'Therapeut:in',
  team_lead: 'Teamleitung',
  office: 'Praxismanagement',
  trainer: 'Trainingsbetreuung',
  patient: 'Patient:in',
};

export function roleLabel(role: RoleKey): string {
  return roleLabels[role];
}
