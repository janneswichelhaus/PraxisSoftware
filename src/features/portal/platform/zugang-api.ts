import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { meldeSelbstAb } from '@/features/core/auth/eigeneAbmeldung';

const kontextSchema = z.object({
  access_id: z.string().uuid(),
  organization_name: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  status: z.enum(['active', 'locked']),
  readable: z.boolean(),
  /**
   * Darf dieser Zugang noch schreiben? Nicht in der Lesefrist, für jede Art des Zugangs (ANN-809);
   * am Server dieselbe Prüfung wie jeder Schreibweg (`app.platform_access_writable`).
   */
  writable: z.boolean(),
  read_until: z.string().nullable(),
  /** Eigener Zugang oder Vertretung (ADR-023 Punkt 13). */
  access_kind: z.enum(['self', 'legal_representative', 'companion']),
  /** Nur an einer lesbaren Vertretung: für wen sie handelt (Punkt 14). */
  represented_name: z.string().nullable(),
  /**
   * DRP-N1: der eigene Name für Gruß und Initialen (`initialen` aus
   * `@/components/ui/personenfarben`), nur an einem lesbaren Zugang. Eine
   * Vertretung bekommt ihren eigenen, nie den der vertretenen Person.
   */
  own_name: z.string().nullable(),
  /** DRP-N2: die Rufnummer der Praxis für „Praxis anrufen“, wo sie eine führt. */
  practice_phone: z.string().nullable(),
});
export type Plattformzugang = z.infer<typeof kontextSchema>;
export type Bereich = Plattformzugang['relationship_kind'];

export const KONTEXT_SCHLUESSEL = ['platform-context'] as const;

/**
 * Die eigenen Zugänge mit Praxis und Zustand. Leer heißt: Dieses Konto hat
 * keinen Zugang zur Plattform - dann ist es womöglich ein Konto mit offener
 * Praxiseinladung (`ZugangEinrichtenPage`).
 */
export async function ladePlattformkontext(): Promise<Plattformzugang[]> {
  const satz = 'Ihr Zugang konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_context')) as {
    data: unknown;
    error: unknown;
  };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(kontextSchema), ergebnis.data ?? [], satz);
}

/** Die Bezeichnung eines Bereichs in der Sprache der Person. */
export const BEREICHSNAME: Record<Bereich, string> = {
  treatment: 'Behandlung',
  training: 'Training',
};

/**
 * „Überall abmelden" (ADR-023 Punkt 18): beendet alle Sitzungen des Kontos
 * beim Anmeldedienst. Anders als in der Praxis ohne Auditeintrag - das
 * Protokoll kennt für die Plattform nur, was Punkt 24 nennt.
 */
export async function ueberallAbmelden(): Promise<void> {
  // Selbst ausgelöst: kein „Ihre Sitzung wurde beendet" auf diesem Gerät.
  const { error } = await meldeSelbstAb(() => getSupabase().auth.signOut({ scope: 'global' }));
  if (error) throw new Error('Die Abmeldung auf allen Geräten ist nicht gelungen.');
}

// -----------------------------------------------------------------------------
// Unter „Ich": wer für mich Zugang hat (ADR-023 Punkt 14)
// -----------------------------------------------------------------------------

const vertretungSchema = z.object({
  access_id: z.string().uuid(),
  access_kind: z.enum(['legal_representative', 'companion']),
  legal_basis: z.enum(['custody', 'guardianship', 'power_of_attorney']).nullable(),
  representative_name: z.string(),
  status: z.enum(['invited', 'active', 'locked']),
  since: z.string(),
  can_end: z.boolean(),
});
export type MeineVertretung = z.infer<typeof vertretungSchema>;

export function vertretungenSchluessel(zugangId: string) {
  return ['platform-representatives', zugangId] as const;
}

/**
 * Wer für die Person Zugang hat. Der Server antwortet nur über den eigenen
 * Zugang oder eine rechtliche Vertretung; einer Begleitung leer.
 */
export async function ladeMeineVertretungen(zugangId: string): Promise<MeineVertretung[]> {
  const satz = 'Die Liste konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_representatives', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(vertretungSchema), ergebnis.data ?? [], satz);
}

/** Eine Begleitung beenden — der Widerruf der Einwilligung (Punkt 13). */
export async function begleitungBeenden(zugangId: string, begleitungId: string): Promise<void> {
  const satz = 'Die Begleitung konnte nicht beendet werden. Bitte wenden Sie sich an die Praxis.';
  const ergebnis = (await getSupabase().rpc('end_platform_companion', {
    p_access_id: zugangId,
    p_companion_access_id: begleitungId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data !== true) throw new Error(satz);
}

// -----------------------------------------------------------------------------
// Einstieg (ANN-266)
// -----------------------------------------------------------------------------

const einstiegSchema = z.object({
  pending: z.boolean(),
  finished_at: z.string().nullable(),
  /** Von der Praxis übersprungen - ohne Namen (ADR-023 Punkt 22). */
  skipped_at: z.string().nullable(),
});
export type Einstiegsstand = z.infer<typeof einstiegSchema>;

export function einstiegSchluessel(zugangId: string) {
  return ['platform-onboarding', zugangId] as const;
}

export async function ladeEinstieg(zugangId: string): Promise<Einstiegsstand | null> {
  const satz = 'Der Einstieg konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_onboarding', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(einstiegSchema), ergebnis.data ?? [], satz)[0] ?? null;
}

/** Den Einstieg beenden - auch mit „Später"; danach kommt er nicht wieder. */
export async function einstiegBeenden(zugangId: string): Promise<void> {
  const ergebnis = (await getSupabase().rpc('finish_platform_onboarding', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error)
    throw new Error('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
}
