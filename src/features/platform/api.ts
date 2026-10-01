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
