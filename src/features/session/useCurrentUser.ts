import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import { roleKeySchema, userProfileSchema, type CurrentUser, type RoleKey } from './types';

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
      .select('id, organization_id, person_id, display_name')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('user_roles').select('role_key').eq('user_id', userId),
  ]);

  if (profileResult.error) throw new Error('Profil konnte nicht geladen werden.');
  if (rolesResult.error) throw new Error('Berechtigungen konnten nicht geladen werden.');
  if (!profileResult.data) {
    throw new Error('Für diesen Zugang ist kein Praxisprofil hinterlegt.');
  }

  const profile = userProfileSchema.parse(profileResult.data);

  const roles: RoleKey[] = [];
  for (const row of rolesResult.data ?? []) {
    const parsed = roleKeySchema.safeParse(row.role_key);
    if (parsed.success) roles.push(parsed.data);
  }

  const organization = await supabase
    .from('organizations')
    .select('name')
    .eq('id', profile.organization_id)
    .maybeSingle();

  return {
    profile,
    roles,
    organizationName: (organization.data as { name?: string } | null)?.name ?? null,
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
