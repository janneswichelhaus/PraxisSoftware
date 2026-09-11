import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { roleKeySchema, type RoleKey } from '@/features/session/types';

/**
 * Zugänge zur Anwendung (STAFF-002b).
 *
 * Der Ablauf hat drei Schritte, und nur der erste und der dritte laufen hier:
 *
 *   1. `ladeZugangEin` — legt die **Berechtigung** an (`invite_staff_account`)
 *      und lässt anschließend die Auth-Mail des Providers zustellen.
 *   2. Die eingeladene Person meldet sich über diese Mail an. Das **Konto**
 *      entsteht beim Provider, nicht hier.
 *   3. `nimmZugangAn` — bindet das Konto an Organisation, Person und Rollen
 *      (`claim_staff_invitation`).
 *
 * Warum der Versand über `signInWithOtp` läuft und nicht über die Admin-API
 * des Providers: Die Admin-API verlangt den `service_role`-Schlüssel, und der
 * gehört niemals in den Browser (ADR-002, §13). Ein eigener Mailversand wäre
 * ein zweiter Dienstleister und ist durch B13 ausgeschlossen. Bleibt die
 * Auth-Mail, die der Provider selbst verschickt.
 *
 * Dass dieser Weg ein Konto erzeugen kann, ohne dass jemand eingeladen hat,
 * ist bewusst hingenommen und abgesichert: Ein Konto ohne passende offene
 * Einladung bleibt vollständig zugriffslos, weil ohne `user_profiles` jede
 * Policy ins Leere läuft. Die Berechtigung hängt an der Einladung, nicht am
 * Konto (ANN-023).
 */
const invitationSchema = z.object({
  id: z.string(),
  staff_member_id: z.string(),
  email: z.string(),
  role_keys: z.array(roleKeySchema),
  status: z.enum(['pending', 'accepted', 'revoked']),
  expires_at: z.string(),
  created_at: z.string(),
});

export type StaffInvitation = z.infer<typeof invitationSchema>;

const accountSchema = z.object({
  staff_member_id: z.string(),
  user_id: z.string().nullable(),
  account_active: z.boolean().nullable(),
  role_keys: z.array(roleKeySchema).nullable(),
});

export type StaffAccount = z.infer<typeof accountSchema>;

/** Eine offene Einladung, deren Frist abgelaufen ist, gilt nicht mehr. */
export function istAbgelaufen(einladung: StaffInvitation, jetzt = new Date()): boolean {
  const ende = new Date(einladung.expires_at);
  return Number.isNaN(ende.getTime()) ? false : ende.getTime() <= jetzt.getTime();
}

export async function fetchStaffAccount(staffMemberId: string): Promise<StaffAccount | null> {
  const { data, error } = await getSupabase()
    .from('staff_account_directory')
    .select('staff_member_id, user_id, account_active, role_keys')
    .eq('staff_member_id', staffMemberId)
    .maybeSingle();

  if (error) throw new Error('Der Zugangsstand konnte nicht geladen werden.');
  if (!data) return null;
  return accountSchema.parse(data);
}

/**
 * Einladungen eines Datensatzes, neueste zuerst.
 *
 * Lesbar ausschließlich für die Praxisinhaberin - das entscheidet die Policy
 * auf der Tabelle, nicht diese Abfrage.
 */
export async function fetchStaffInvitations(staffMemberId: string): Promise<StaffInvitation[]> {
  const { data, error } = await getSupabase()
    .from('staff_account_invitations')
    .select('id, staff_member_id, email, role_keys, status, expires_at, created_at')
    .eq('staff_member_id', staffMemberId)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Die Einladungen konnten nicht geladen werden.');
  return z.array(invitationSchema).parse(data ?? []);
}

/**
 * Der Server hat die Einladung abgewiesen, weil es die Person oder die Adresse
 * schon gibt. Beides ist kein technischer Fehler, sondern eine Lage, die die
 * Oberfläche erklären muss.
 */
export type EinladungsProblem =
  'account_already_exists' | 'email_already_in_use' | 'bereits_eingeladen' | 'unbekannt';

export class EinladungsError extends Error {
  readonly problem: EinladungsProblem;

  constructor(problem: EinladungsProblem) {
    super(problem);
    this.name = 'EinladungsError';
    this.problem = problem;
  }
}

function einladungsProblem(meldung: string): EinladungsProblem {
  if (meldung.includes('account_already_exists')) return 'account_already_exists';
  if (meldung.includes('email_already_in_use')) return 'email_already_in_use';
  if (meldung.includes('staff_account_invitations_one_open')) return 'bereits_eingeladen';
  return 'unbekannt';
}

/**
 * Lässt die Auth-Mail des Providers zustellen.
 *
 * Getrennt von der Einladung selbst, damit ein misslungener Versand die
 * bereits angelegte Berechtigung nicht entwertet: Die Einladung steht dann als
 * offen im Datensatz, und die Oberfläche bietet „erneut senden" an.
 */
export async function sendeZugangsMail(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw new Error('Die Einladung konnte nicht zugestellt werden.');
}

export async function ladeZugangEin(
  staffMemberId: string,
  email: string,
  rollen: readonly RoleKey[],
): Promise<void> {
  const { error } = (await getSupabase().rpc('invite_staff_account', {
    p_staff_member_id: staffMemberId,
    p_email: email,
    p_role_keys: rollen,
  })) as { error: { message?: string } | null };

  if (error) throw new EinladungsError(einladungsProblem(error.message ?? ''));

  await sendeZugangsMail(email);
}

export async function widerrufeEinladung(invitationId: string): Promise<void> {
  const { error } = await getSupabase().rpc('revoke_staff_invitation', {
    p_invitation_id: invitationId,
  });
  if (error) throw new Error('Die Einladung konnte nicht zurückgenommen werden.');
}

/**
 * Nimmt eine offene Einladung an - aufgerufen vom eingeladenen Konto selbst.
 *
 * Die einzige Stelle, an der ein Konto ohne Praxisprofil überhaupt etwas tun
 * kann. Ohne passende offene Einladung entsteht nichts.
 */
export class KeineEinladungError extends Error {
  constructor() {
    super('Für diesen Zugang liegt keine offene Einladung vor.');
    this.name = 'KeineEinladungError';
  }
}

export async function nimmZugangAn(): Promise<void> {
  const { error } = (await getSupabase().rpc('claim_staff_invitation')) as {
    error: { message?: string } | null;
  };

  if (error?.message?.includes('no_open_invitation')) throw new KeineEinladungError();
  if (error) throw new Error('Der Zugang konnte nicht eingerichtet werden.');
}
