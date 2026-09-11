import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { roleKeySchema, userProfileSchema, type CurrentUser, type RoleKey } from './types';

/**
 * Das angemeldete Konto existiert beim Anmeldedienst, ist aber keiner Praxis
 * zugeordnet.
 *
 * Der Normalfall dahinter ist eine eingeladene Person beim ersten Anmelden: Das
 * Konto entsteht beim Provider, die Zuordnung erst mit der Annahme der
 * Einladung (STAFF-002b). Der andere Fall ist ein Konto ohne Einladung - es
 * bleibt zugriffslos (ANN-025). Die Anwendung kann beide erst unterscheiden,
 * nachdem sie die Annahme versucht hat.
 */
export class KeinProfilError extends Error {
  constructor() {
    super('Für diesen Zugang ist kein Praxisprofil hinterlegt.');
    this.name = 'KeinProfilError';
  }
}

/**
 * Der Zugang besteht, ist aber gesperrt (STAFF-003).
 *
 * Ohne eigene Behandlung sähe die Person eine vollständige, aber überall leere
 * Anwendung: `app.current_organization_id()` liefert für einen gesperrten
 * Zugang `null`, und jede Policy läuft ins Leere. Eine Anwendung, die
 * funktionstüchtig aussieht und nichts findet, ist genau der unklare Zustand,
 * den §13 verbietet.
 */
export class ZugangGesperrtError extends Error {
  constructor() {
    super('Dieser Zugang ist gesperrt.');
    this.name = 'ZugangGesperrtError';
  }
}

/**
 * Lädt Profil und Rollen des angemeldeten Accounts.
 *
 * Die Rollen steuern ausschließlich die Darstellung. Die verbindliche
 * Autorisierung liegt in den RLS-Policies (ADR-004); eine im Client
 * ausgeblendete Ansicht ist keine Zugriffsbeschränkung.
 */
export async function fetchCurrentUser(userId: string): Promise<CurrentUser> {
  const supabase = getSupabase();

  const [profileResult, rolesResult] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, organization_id, person_id, display_name, is_active')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('user_roles').select('role_key').eq('user_id', userId),
  ]);

  if (profileResult.error) throw new Error('Profil konnte nicht geladen werden.');
  if (rolesResult.error) throw new Error('Berechtigungen konnten nicht geladen werden.');
  if (!profileResult.data) {
    throw new KeinProfilError();
  }

  const profile = userProfileSchema.parse(profileResult.data);
  if (!profile.is_active) throw new ZugangGesperrtError();

  const roles: RoleKey[] = [];
  for (const row of rolesResult.data ?? []) {
    const parsed = roleKeySchema.safeParse(row.role_key);
    if (parsed.success) roles.push(parsed.data);
  }

  const [organization, staffMember] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, time_zone, appointment_grid_minutes')
      .eq('id', profile.organization_id)
      .maybeSingle(),
    // Die eigene Beschaeftigtenkennung. Ein Patientenkonto hat keine; das ist
    // kein Fehler, sondern der Normalfall - deshalb maybeSingle.
    supabase.from('staff_members').select('id').eq('person_id', profile.person_id).maybeSingle(),
  ]);

  const org = organization.data as {
    name?: string;
    time_zone?: string;
    appointment_grid_minutes?: number;
  } | null;

  return {
    profile,
    roles,
    organizationName: org?.name ?? null,
    // Massgeblich fuer die Auslegung von Kalendertagen und Uhrzeiten
    // (CAL-001). Bewusst aus der Organisation, nicht aus dem Browser.
    organizationTimeZone: org?.time_zone ?? null,
    appointmentGridMinutes: org?.appointment_grid_minutes ?? null,
    staffMemberId: (staffMember.data as { id?: string } | null)?.id ?? null,
  };
}

export function useCurrentUser(userId: string | undefined): UseQueryResult<CurrentUser, Error> {
  return useQuery({
    queryKey: ['current-user', userId],
    queryFn: () => fetchCurrentUser(userId!),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
