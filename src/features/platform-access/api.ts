import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { abgewiesen } from '@/lib/abgewiesen';
import { getSupabase } from '@/lib/supabase';

/**
 * Plattformzugang aus Sicht der Praxis (POR-002, ADR-023 Punkte 6 bis 11).
 *
 * Alle Wege laufen über Serverfunktionen; sie prüfen Rolle, Organisation und
 * Zustand selbst und protokollieren. Die Oberfläche blendet nur aus, was die
 * Rolle nicht darf — verbindlich ist der Server (ADR-004). Ein abgewiesener
 * Schreibweg antwortet mit HTTP 403 und dem Körper `null` (ANN-115).
 */

export type Verhaeltnisart = 'treatment' | 'training';
export type Zugangszustand = 'invited' | 'active' | 'locked' | 'revoked';

const zeitpunkt = z.string().min(1);

const zustandSchema = z.object({
  id: z.string().uuid().nullable(),
  status: z.enum(['invited', 'active', 'locked', 'revoked']).nullable(),
  created_at: zeitpunkt.nullable(),
  activated_at: zeitpunkt.nullable(),
  locked_at: zeitpunkt.nullable(),
  revoked_at: zeitpunkt.nullable(),
  revoked_reason: z.enum(['practice', 'relationship_deleted', 'account_deleted']).nullable(),
  invitation_id: z.string().uuid().nullable(),
  invitation_purpose: z.enum(['activate', 'reset']).nullable(),
  invitation_channel: z.enum(['on_site', 'email']).nullable(),
  invitation_expires_at: zeitpunkt.nullable(),
  invitation_sent_at: zeitpunkt.nullable(),
  relationship_email: z.string().nullable(),
  ended_at: zeitpunkt.nullable(),
});
export type Plattformzugang = z.infer<typeof zustandSchema>;

const einladungSchema = z.object({
  access_id: z.string().uuid(),
  invitation_id: z.string().uuid(),
  purpose: z.enum(['activate', 'reset']),
  code: z.string().min(20),
  expires_at: zeitpunkt,
});
export type Einladung = z.infer<typeof einladungSchema>;

export function zugangsschluessel(art: Verhaeltnisart, verhaeltnisId: string) {
  return ['platform-access', art, verhaeltnisId] as const;
}

/**
 * Der Zustand des eigenen Zugangs zu einem Verhältnis. Gibt es keinen, liefert
 * der Server eine leere Zeile; die Oberfläche zeigt dann „Kein Zugang".
 */
export async function getPlatformAccess(
  art: Verhaeltnisart,
  verhaeltnisId: string,
): Promise<Plattformzugang | null> {
  const satz = 'Der Zugang zur Plattform konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('get_platform_access', {
    p_relationship_kind: art,
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  const zeilen = antwort(z.array(zustandSchema), ergebnis.data ?? [], satz);
  return zeilen[0] ?? null;
}

/** Warum eine Einladung nicht ausgestellt wurde — in der Sprache der Praxis. */
function einladefehler(meldung: string | undefined): string {
  const m = (meldung ?? '').toLowerCase();
  if (m.includes('date of birth required')) {
    return 'Ohne Geburtsdatum gibt es keine Einladung: Ein eigener Zugang setzt 18 Jahre voraus. Bitte das Geburtsdatum ergänzen.';
  }
  if (m.includes('under age')) {
    return 'Unter 18 Jahren gibt es keinen eigenen Zugang. Den Zugang über Sorgeberechtigte gibt es in einem späteren Schritt.';
  }
  if (m.includes('no email address')) {
    return 'Für diese Person ist keine E-Mail-Adresse hinterlegt. Bitte vor Ort einladen.';
  }
  if (m.includes('address must be confirmed')) {
    return 'Bitte bestätigen, dass die Person die Adresse selbst genannt hat.';
  }
  if (m.includes('person has a practice account')) {
    return 'Diese Person hat ein Konto der Praxis. Einen Plattformzugang gibt es dafür nicht; Übungen gibt es als PDF.';
  }
  if (m.includes('reset needs every area')) {
    return 'Ein neues Kennwort gilt für alle Bereiche dieser Person. Ausstellen kann es nur, wer alle ihre Zugänge verwaltet – etwa die Praxisinhaber:in oder das Büro.';
  }
  if (m.includes('locked')) {
    return 'Der Zugang ist gesperrt. Bitte zuerst entsperren.';
  }
  return 'Die Einladung konnte nicht ausgestellt werden.';
}

export async function invitePlatformAccess(
  art: Verhaeltnisart,
  verhaeltnisId: string,
  weg: 'on_site' | 'email',
  adresseBestaetigt: boolean,
): Promise<Einladung> {
  const satz = 'Die Einladung konnte nicht ausgestellt werden.';
  const ergebnis = (await getSupabase().rpc('invite_platform_access', {
    p_relationship_kind: art,
    p_relationship_id: verhaeltnisId,
    p_channel: weg,
    p_address_confirmed: adresseBestaetigt,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) throw new Error(einladefehler(ergebnis.error.message));
  if (abgewiesen(ergebnis)) throw new Error(satz);
  const zeile = antwort(z.array(einladungSchema), ergebnis.data ?? [], satz)[0];
  if (!zeile) throw new Error(satz);
  return zeile;
}

export async function setPlatformAccessLocked(zugangId: string, sperren: boolean): Promise<void> {
  const satz = sperren
    ? 'Der Zugang konnte nicht gesperrt werden.'
    : 'Der Zugang konnte nicht entsperrt werden.';
  const ergebnis = (await getSupabase().rpc('set_platform_access_locked', {
    p_access_id: zugangId,
    p_locked: sperren,
  })) as { data: unknown; error: unknown; status?: number };
  if (abgewiesen(ergebnis) || ergebnis.data === null) throw new Error(satz);
}

export async function revokePlatformAccess(zugangId: string): Promise<void> {
  const satz = 'Der Zugang konnte nicht entzogen werden.';
  const ergebnis = (await getSupabase().rpc('revoke_platform_access', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown; status?: number };
  if (abgewiesen(ergebnis) || ergebnis.data === null) throw new Error(satz);
}

/** Fehlerklassen des Zugangsdienstes beim Versand (supabase/functions/platform-access). */
const VERSANDFEHLER: Readonly<Record<string, string>> = {
  not_configured:
    'Der Mailversand ist noch nicht eingerichtet. Bitte die Einladung vor Ort übergeben.',
  address_changed:
    'Die Adresse hat sich seit der Einladung geändert. Bitte neu einladen und die Adresse bestätigen lassen.',
  session_invalid: 'Die Sitzung ist abgelaufen. Bitte neu anmelden.',
  not_allowed: 'Die Einladung kann nicht per Mail versandt werden.',
  unavailable: 'Der Mailversand antwortet gerade nicht. Bitte später erneut versuchen.',
};

/**
 * Lässt den Zugangsdienst die Einladung per Mail versenden. Die Adresse
 * bestimmt der Server aus dem Verhältnis, nie der Browser (ADR-023 Punkt 11).
 */
export async function sendPlatformInvitation(einladungId: string, code: string): Promise<void> {
  const { data, error, response } = (await getSupabase().functions.invoke<unknown>(
    'platform-access',
    { body: { aufgabe: 'versenden', einladungId, code } },
  )) as { data: unknown; error: unknown; response?: Response };

  let koerper: unknown = data;
  if (error !== null) {
    if (response === undefined) throw new Error(VERSANDFEHLER.not_configured);
    try {
      koerper = await response.json();
    } catch {
      koerper = null;
    }
  }
  const gelesen = z.object({ ok: z.boolean(), error: z.string().optional() }).safeParse(koerper);
  if (!gelesen.success) throw new Error(VERSANDFEHLER.not_configured);
  if (!gelesen.data.ok) {
    throw new Error(
      VERSANDFEHLER[gelesen.data.error ?? ''] ?? 'Die Einladung konnte nicht versandt werden.',
    );
  }
}

/**
 * Die Adresse, unter der die Einladung eingelöst wird. Der Code steht im
 * Fragment (`#code=`): Er geht an keinen Server und in kein Zugriffsprotokoll
 * (ADR-023 Punkt 8, ANN-043).
 */
export function einloeseadresse(ursprung: string, code: string): string {
  return `${ursprung.replace(/\/+$/, '')}/einladung#code=${encodeURIComponent(code)}`;
}

// -----------------------------------------------------------------------------
// Vertretung (POR-005, ADR-023 Punkte 13 bis 15)
// -----------------------------------------------------------------------------

const vertretungSchema = z.object({
  id: z.string().uuid(),
  access_kind: z.enum(['legal_representative', 'companion']),
  legal_basis: z.enum(['custody', 'guardianship', 'power_of_attorney']).nullable(),
  representative_name: z.string(),
  status: z.enum(['invited', 'active', 'locked', 'revoked']),
  created_at: zeitpunkt,
  activated_at: zeitpunkt.nullable(),
  locked_at: zeitpunkt.nullable(),
  revoked_at: zeitpunkt.nullable(),
  revoked_reason: z
    .enum([
      'practice',
      'relationship_deleted',
      'account_deleted',
      'consent_withdrawn',
      // ABN-010: Vollmacht vor dem Vermerk der Gesundheitssorge, entzogen.
      'scope_unproven',
    ])
    .nullable(),
  proof_documents: z.array(
    z.enum(['identity_document', 'custody_proof', 'guardianship_certificate', 'power_of_attorney']),
  ),
  // ABN-010: nachgewiesene bzw. eingewilligte Bereiche (BEF-119, BEF-116).
  health_scope: z.boolean().nullable(),
  finance_scope: z.boolean().nullable(),
  proof_recorded_at: zeitpunkt,
  proof_recorded_by_name: z.string().nullable(),
  consent_recorded_at: zeitpunkt.nullable(),
  consent_earlier_messages: z.boolean().nullable(),
  invitation_purpose: z.enum(['activate', 'reset']).nullable(),
  invitation_expires_at: zeitpunkt.nullable(),
  ended_at: zeitpunkt.nullable(),
});
export type Vertretung = z.infer<typeof vertretungSchema>;

export function vertretungsschluessel(art: Verhaeltnisart, verhaeltnisId: string) {
  return ['platform-representations', art, verhaeltnisId] as const;
}

export async function listPlatformRepresentations(
  art: Verhaeltnisart,
  verhaeltnisId: string,
): Promise<Vertretung[]> {
  const satz = 'Die Vertretungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('list_platform_representations', {
    p_relationship_kind: art,
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(vertretungSchema), ergebnis.data ?? [], satz);
}

/** Warum eine Vertretung nicht eingerichtet wurde — in der Sprache der Praxis. */
export function vertretungsfehler(meldung: string | undefined): string {
  const m = (meldung ?? '').toLowerCase();
  if (m.includes('date of birth required')) {
    return 'Ohne Geburtsdatum gibt es keine Vertretung: Ob Sorgerecht oder Begleitung passt, hängt am Alter. Bitte das Geburtsdatum ergänzen.';
  }
  if (m.includes('minor needs custody')) {
    return 'Die Person ist unter 18. Für sie gibt es nur die rechtliche Vertretung durch Sorgeberechtigte.';
  }
  if (m.includes('custody ends at majority')) {
    return 'Die Person ist volljährig. Ein Sorgerecht trägt hier nicht mehr; möglich sind Betreuung, Vorsorgevollmacht oder Begleitung.';
  }
  if (m.includes('representative name required')) {
    return 'Bitte den Namen der vertretenden Person angeben.';
  }
  if (m.includes('identity document must be seen')) {
    return 'Bitte den Ausweis der vertretenden Person ansehen und abhaken.';
  }
  if (m.includes('authority document must be seen')) {
    return 'Bitte das Dokument ansehen und abhaken, das die Vertretung belegt.';
  }
  if (m.includes('guardianship must cover health care')) {
    return 'Eine Betreuung trägt nur, wenn ihr Aufgabenkreis die Gesundheitssorge umfasst.';
  }
  if (m.includes('power of attorney must cover health care')) {
    return 'Eine Vorsorgevollmacht trägt nur, wenn sie die Gesundheitssorge umfasst.';
  }
  if (m.includes('finance scope must be stated')) {
    return 'Bitte angeben, ob die Vertretung auch Rechnungen sehen darf.';
  }
  if (m.includes('legal basis required')) {
    return 'Bitte angeben, worauf die rechtliche Vertretung beruht.';
  }
  if (m.includes('consent of the person required') || m.includes('consent scope required')) {
    return 'Die Person muss der Begleitung selbst zustimmen. Bitte die Einwilligung bestätigen lassen.';
  }
  if (m.includes('has ended')) {
    return 'Diese Vertretung ist beendet. Bitte eine neue einrichten.';
  }
  if (m.includes('reset needs every area')) {
    return 'Ein neues Kennwort gilt für alle Bereiche dieses Kontos. Ausstellen kann es nur, wer alle seine Zugänge verwaltet – etwa die Praxisinhaber:in oder das Büro.';
  }
  if (m.includes('locked')) {
    return 'Der Zugang ist gesperrt. Bitte zuerst entsperren.';
  }
  return 'Die Vertretung konnte nicht eingerichtet werden.';
}

export interface VertretungsAngaben {
  zugangsart: 'legal_representative' | 'companion';
  grundlage: 'custody' | 'guardianship' | 'power_of_attorney' | null;
  name: string;
  dokumente: string[];
  aufgabenkreis: boolean | null;
  fassung: string | null;
  fruehereNachrichten: boolean | null;
  /** ABN-010: Rechnungen und Zahlungen — nachgewiesen bzw. eingewilligt, ja oder nein. */
  rechnungen: boolean;
  /**
   * Zweifel an der Einwilligungsfähigkeit (ADR-023 Punkt 13): wird ohne Grund
   * am Zugang der rechtlichen Vertretung vermerkt (ANN-207, LOG-EPIC-001).
   */
  zweifel?: boolean;
}

export async function invitePlatformRepresentation(
  art: Verhaeltnisart,
  verhaeltnisId: string,
  angaben: VertretungsAngaben,
): Promise<Einladung> {
  const satz = 'Die Vertretung konnte nicht eingerichtet werden.';
  const ergebnis = (await getSupabase().rpc('invite_platform_representation', {
    p_relationship_kind: art,
    p_relationship_id: verhaeltnisId,
    p_access_kind: angaben.zugangsart,
    p_legal_basis: angaben.grundlage,
    p_representative_name: angaben.name,
    p_proof_documents: angaben.dokumente,
    p_health_scope: angaben.aufgabenkreis,
    p_consent_version: angaben.fassung,
    p_earlier_messages: angaben.fruehereNachrichten,
    p_finance_scope: angaben.rechnungen,
    p_capacity_doubt: angaben.zweifel ?? false,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) throw new Error(vertretungsfehler(ergebnis.error.message));
  if (abgewiesen(ergebnis)) throw new Error(satz);
  const zeile = antwort(z.array(einladungSchema), ergebnis.data ?? [], satz)[0];
  if (!zeile) throw new Error(satz);
  return zeile;
}

export async function renewPlatformRepresentationCode(zugangId: string): Promise<Einladung> {
  const satz = 'Der Code konnte nicht ausgestellt werden.';
  const ergebnis = (await getSupabase().rpc('renew_platform_representation_code', {
    p_access_id: zugangId,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) throw new Error(vertretungsfehler(ergebnis.error.message));
  if (abgewiesen(ergebnis)) throw new Error(satz);
  const zeile = antwort(z.array(einladungSchema), ergebnis.data ?? [], satz)[0];
  if (!zeile) throw new Error(satz);
  return zeile;
}

/**
 * Die Person widerruft ihre Einwilligung zur Begleitung in der Praxis. Steht
 * im Nachweis als Widerruf, nicht als Entziehen (ADR-023 Punkte 5, 13).
 */
export async function recordCompanionConsentWithdrawn(zugangId: string): Promise<void> {
  const satz = 'Der Widerruf konnte nicht vermerkt werden.';
  const ergebnis = (await getSupabase().rpc('record_companion_consent_withdrawn', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown; status?: number };
  if (ergebnis.error || abgewiesen(ergebnis) || ergebnis.data === null) throw new Error(satz);
}
