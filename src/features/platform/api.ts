import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Die Plattform spricht nur Plattformprojektionen an (ADR-023 Punkte 19, 26).
 *
 * Diese Datei ist der einzige Datenzugang des Features. `trennung.test.ts`
 * hält fest, dass hier nichts aus den Praxisfeatures hereinkommt. Welche
 * Zeilen die Person sieht, entscheidet der Server; die Oberfläche zeigt nur.
 */

const kontextSchema = z.object({
  access_id: z.string().uuid(),
  organization_name: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  status: z.enum(['active', 'locked']),
  readable: z.boolean(),
  read_until: z.string().nullable(),
  /** POR-006: eigener Zugang oder Vertretung (ADR-023 Punkt 13). */
  access_kind: z.enum(['self', 'legal_representative', 'companion']),
  /** Nur an einer lesbaren Vertretung: für wen sie handelt (Punkt 14). */
  represented_name: z.string().nullable(),
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

/** Die Bezeichnung eines Bereichs in der Sprache der Person (DSN-001 D6). */
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
  const { error } = await getSupabase().auth.signOut({ scope: 'global' });
  if (error) throw new Error('Die Abmeldung auf allen Geräten ist nicht gelungen.');
}

// -----------------------------------------------------------------------------
// Unter „Ich": wer für mich Zugang hat (POR-007, ADR-023 Punkt 14)
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
// Reiter „Termine": die eigenen Termine (POR-008, DSN-001 4.1)
// -----------------------------------------------------------------------------

const terminSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  /** Für die Person: dokumentiert und abgerechnet sind „durchgeführt". */
  status: z.enum(['confirmed', 'cancelled', 'no_show', 'completed']),
  staff_name: z.string().nullable(),
  location_name: z.string().nullable(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
});
export type Termin = z.infer<typeof terminSchema>;

export function termineSchluessel(zugangId: string) {
  return ['platform-appointments', zugangId] as const;
}

/**
 * Die eigenen Termine des gewählten Bereichs: künftige und die der letzten
 * zwölf Monate (ANN-248). Welche Zeilen, entscheidet der Server über den
 * Zugang; die Kennung wählt nur unter den eigenen aus (ADR-023 Punkt 19).
 */
export async function ladeTermine(zugangId: string): Promise<Termin[]> {
  const satz = 'Ihre Termine konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_appointments', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(terminSchema), ergebnis.data ?? [], satz);
}
