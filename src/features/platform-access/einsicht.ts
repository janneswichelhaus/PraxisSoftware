import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Die Einsicht der Praxis in die Plattform einer Person (E-001, DSN-001 D7,
 * Befund B11) - die Seite der Praxis.
 *
 * Gelesen wird nur über den Verteiler `platform_preview`: Er prüft Rolle
 * (owner), Sitzung und Zugang, schreibt den Lesezugriff wie beim Öffnen der
 * Akte (ADR-023 Punkt 24) und ruft eine Projektion aus seiner festen Liste.
 * Die Plattform bekommt diese Quelle eingespeist (`einsichtsApi` in
 * `features/platform/einsicht.ts`); sie selbst spricht den Verteiler nie an
 * (ADR-023 Punkt 26, `trennung.test.ts`).
 */

/** Die Adresse der Einsicht für einen Zugang - nur die Kennung, kein Name. */
export function einsichtsadresse(zugangId: string): string {
  return `/p?zugang=${encodeURIComponent(zugangId)}`;
}

/** Ob ein Pfad zur Einsicht gehört: das Präfix der Plattform. */
export function istEinsichtspfad(pfad: string): boolean {
  return pfad === '/p' || pfad.startsWith('/p/');
}

/** Der Server hat die Einsicht abgewiesen (Rolle, Zugang, Sitzung) - kein Netzfehler. */
export class EinsichtAbgewiesen extends Error {
  constructor() {
    super('Diese Einsicht ist nicht möglich.');
    this.name = 'EinsichtAbgewiesen';
  }
}

/**
 * Liest eine Projektion für die Einsicht. Eine Abweisung kommt als HTTP 403 -
 * mit Fehler (42501) oder, seit G6c, mit dem Körper `null` (ANN-115).
 */
export async function einsichtLesen(
  zugangId: string,
  funktion: string,
  argumente: Record<string, unknown> = {},
): Promise<{ data: unknown; error: unknown }> {
  const ergebnis = (await getSupabase().rpc('platform_preview', {
    p_access_id: zugangId,
    p_function: funktion,
    p_args: argumente,
  })) as { data: unknown; error: unknown; status?: number };
  if (ergebnis.status === 403) return { data: null, error: new EinsichtAbgewiesen() };
  if (ergebnis.error) return { data: null, error: ergebnis.error };
  return { data: ergebnis.data, error: null };
}

const kontextSchema = z.object({
  access_id: z.string().uuid(),
  organization_name: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  status: z.literal('active'),
  readable: z.boolean(),
  read_until: z.string().nullable(),
  access_kind: z.literal('self'),
  represented_name: z.null(),
  /** Nur für die Leiste und den Rückweg in die Praxis. */
  relationship_id: z.string().uuid(),
  person_name: z.string(),
});
export type Einsichtskontext = z.infer<typeof kontextSchema>;

export function einsichtskontextSchluessel(zugangId: string) {
  return ['platform-preview-context', zugangId] as const;
}

/** Der Zugang so, wie die Person ihn sieht, dazu Name und Verhältnis für die Praxis. */
export async function ladeEinsichtskontext(zugangId: string): Promise<Einsichtskontext> {
  const satz = 'Die Einsicht konnte nicht geladen werden.';
  const { data, error } = await einsichtLesen(zugangId, 'platform_context');
  if (error instanceof EinsichtAbgewiesen) throw error;
  if (error) throw new Error(satz);
  const zeile = antwort(z.array(kontextSchema), data ?? [], satz)[0];
  if (!zeile) throw new EinsichtAbgewiesen();
  return zeile;
}

/** Der Rückweg aus der Einsicht dorthin, wo der Knopf steht. */
export function rueckwegAusDerEinsicht(kontext: Einsichtskontext): {
  ziel: string;
  beschriftung: string;
} {
  return kontext.relationship_kind === 'treatment'
    ? { ziel: `/patienten/${kontext.relationship_id}/stammdaten`, beschriftung: 'Zurück zur Akte' }
    : {
        ziel: `/training/${kontext.relationship_id}`,
        beschriftung: 'Zurück zum Trainingsverhältnis',
      };
}
