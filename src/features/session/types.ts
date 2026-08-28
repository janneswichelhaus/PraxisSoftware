import { z } from 'zod';

export const roleKeySchema = z.enum(['owner', 'therapist', 'team_lead', 'office', 'patient']);
export type RoleKey = z.infer<typeof roleKeySchema>;

export const userProfileSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  person_id: z.string(),
  display_name: z.string(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export interface CurrentUser {
  profile: UserProfile;
  roles: RoleKey[];
  organizationName: string | null;
}

/** Rollen mit Zugriff auf die Patientenkartei (PROJECT_PRINCIPLES.md 4.2/4.3). */
const directoryRoles: RoleKey[] = ['owner', 'therapist', 'team_lead', 'office'];

export function canReadPatientDirectory(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => directoryRoles.includes(role));
}

export function isStaff(roles: readonly RoleKey[]): boolean {
  return roles.some((role) => role !== 'patient');
}
