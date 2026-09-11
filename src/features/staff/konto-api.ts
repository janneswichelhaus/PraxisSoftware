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
 * **Diese Anwendung legt keine Authentifizierungskonten an.**
 * `supabase/config.toml` setzt `[auth].enable_signup = false` — keine
 * Selbstregistrierung, verankert in §4.2. Die Admin-API des Providers, die ein
 * Konto anlegen dürfte, verlangt den `service_role`-Schlüssel, und der gehört
 * niemals in den Browser (ADR-002, §13); eine serverseitige Funktion dafür gibt
 * es noch nicht (ADR-015, `[edge_runtime] enabled = false`). Ein eigener
 * Mailversand wäre ein zweiter Dienstleister und ist durch B13 ausgeschlossen.
 *
 * Deshalb entsteht das Konto **einmalig auf der Oberfläche des
 * Anmeldedienstes**, und Schritt 1 legt nur die Berechtigung an. Das ist die
 * restriktivere Seite und kostet einen manuellen Handgriff je neuem Zugang —
 * bis OPS-001 die Auth-Mails einschließt und eine Edge Function den Versand
 * übernehmen kann (ANN-023).
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
 * Konnte die Anmeldemail zugestellt werden?
 *
 * `kein_konto` ist der **Normalfall bei einer ersten Einladung** und kein
 * Fehler: Zu der Adresse gibt es beim Anmeldedienst noch kein Konto, und diese
 * Anwendung legt keines an (siehe `sendeZugangsMail`).
 */
export type Zustellung = 'gesendet' | 'kein_konto';

/**
 * Lässt den Anmeldedienst seine Mail an ein **bestehendes** Konto schicken.
 *
 * `shouldCreateUser: false` ist die entscheidende Zeile. `supabase/config.toml`
 * setzt `[auth].enable_signup = false` — keine Selbstregistrierung, verankert
 * in §4.2. Diese Anwendung legt deshalb **keine Authentifizierungskonten an**;
 * sie verwaltet ausschließlich die Berechtigung (ANN-023).
 *
 * Daraus folgt: Bei einer ersten Einladung gibt es noch kein Konto, und der
 * Aufruf kommt mit `kein_konto` zurück. Das ist kein Fehler und entwertet die
 * Einladung nicht — sie steht in der Datenbank und wartet. Das Konto entsteht
 * einmalig auf der Oberfläche des Anmeldedienstes; danach nimmt die Person die
 * Einladung in der Anwendung an.
 *
 * Ein misslungener Versand darf die bereits angelegte Berechtigung nie
 * entwerten — deshalb wirft diese Funktion nicht, sondern berichtet.
 */
export async function sendeZugangsMail(email: string): Promise<Zustellung> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin,
    },
  });
  return error ? 'kein_konto' : 'gesendet';
}

export async function ladeZugangEin(
  staffMemberId: string,
  email: string,
  rollen: readonly RoleKey[],
): Promise<Zustellung> {
  const { error } = (await getSupabase().rpc('invite_staff_account', {
    p_staff_member_id: staffMemberId,
    p_email: email,
    p_role_keys: rollen,
  })) as { error: { message?: string } | null };

  if (error) throw new EinladungsError(einladungsProblem(error.message ?? ''));

  return sendeZugangsMail(email);
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

// -----------------------------------------------------------------------------
// Rollen und Sperre eines bestehenden Zugangs (STAFF-002c, STAFF-003)
// -----------------------------------------------------------------------------

/**
 * Der Server hat den Vorgang abgewiesen, um ein Aussperren zu verhindern.
 *
 * Beides ist keine Panne, sondern eine Regel aus ADR-012: Die Praxis hat
 * Bus-Faktor 1, und ein Fehlgriff darf nicht dazu führen, dass niemand mehr
 * Rollen vergeben oder das Auditlog lesen kann.
 */
export type SperrProblem = 'last_owner_required' | 'cannot_lock_own_account' | 'unbekannt';

export class ZugangsError extends Error {
  readonly problem: SperrProblem;

  constructor(problem: SperrProblem) {
    super(problem);
    this.name = 'ZugangsError';
    this.problem = problem;
  }
}

function sperrProblem(meldung: string): SperrProblem {
  if (meldung.includes('last_owner_required')) return 'last_owner_required';
  if (meldung.includes('cannot_lock_own_account')) return 'cannot_lock_own_account';
  return 'unbekannt';
}

export async function setzeRollen(
  staffMemberId: string,
  rollen: readonly RoleKey[],
): Promise<void> {
  const { error } = (await getSupabase().rpc('set_staff_account_roles', {
    p_staff_member_id: staffMemberId,
    p_role_keys: rollen,
  })) as { error: { message?: string } | null };

  if (error) throw new ZugangsError(sperrProblem(error.message ?? ''));
}

export async function setzeZugangAktiv(staffMemberId: string, aktiv: boolean): Promise<void> {
  const { error } = (await getSupabase().rpc('set_staff_account_active', {
    p_staff_member_id: staffMemberId,
    p_active: aktiv,
  })) as { error: { message?: string } | null };

  if (error) throw new ZugangsError(sperrProblem(error.message ?? ''));
}

/**
 * Stößt das Zurücksetzen des Kennworts an.
 *
 * Zwei Schritte, weil zwei Systeme beteiligt sind: Die Datenbank hält den
 * Vorgang fest und nennt die Anmeldeadresse; die Mail verschickt der
 * Anmeldedienst (B13). Diese Anwendung sieht das Kennwort nie - weder das
 * alte noch das neue.
 */
export async function stosseKennwortZuruecksetzenAn(staffMemberId: string): Promise<void> {
  const { data, error } = (await getSupabase().rpc('request_staff_password_reset', {
    p_staff_member_id: staffMemberId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Das Zurücksetzen konnte nicht angestoßen werden.');
  const email = z.string().safeParse(data);
  if (!email.success) throw new Error('Das Zurücksetzen konnte nicht angestoßen werden.');

  const { error: mailError } = await getSupabase().auth.resetPasswordForEmail(email.data, {
    redirectTo: `${window.location.origin}/kennwort-neu`,
  });
  if (mailError) throw new Error('Die Mail zum Zurücksetzen konnte nicht zugestellt werden.');
}
