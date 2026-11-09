import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Voraussetzungsprofil am Trainingsverhältnis (KND-005, IDEA-LZK-004).
 *
 * Lesen und schreiben owner und Trainingsbetreuung (ANN-287); jedes Lesen
 * protokolliert der Server (ADR-021 Punkt 8).
 */

/** Die sieben Felder in der Reihenfolge der Seite, mit Beschriftung und, wo nötig, Hinweis. */
export const PROFILFELDER = [
  ['goals', 'Ziele', 'In den Worten der Person'],
  ['equipment', 'Ausrüstung', null],
  ['time_budget', 'Zeitbudget', 'Je Woche und je Einheit'],
  ['places', 'Orte', null],
  ['limits', 'Belastungsgrenzen', null],
  ['history', 'Vorgeschichte', 'Verletzungen und Operationen'],
  ['preferences', 'Vorlieben', null],
] as const;

export type Profilfeld = (typeof PROFILFELDER)[number][0];
export const PROFILTEXT_HOECHSTENS = 1000;

const profilSchema = z.object({
  goals: z.string().nullable(),
  equipment: z.string().nullable(),
  time_budget: z.string().nullable(),
  places: z.string().nullable(),
  limits: z.string().nullable(),
  history: z.string().nullable(),
  preferences: z.string().nullable(),
  updated_at: z.string(),
  updated_by_name: z.string().nullable(),
});

const sichtSchema = z.object({
  health_consent: z.boolean(),
  profile: profilSchema.nullable(),
  takeovers: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      offered_on: z.string(),
      released_at: z.string(),
      /** Der Tag der Freigabe in der Zeitzone der Praxis. */
      released_on: z.string(),
    }),
  ),
});

export type Profilsicht = z.infer<typeof sichtSchema>;
export type Profilwerte = Record<Profilfeld, string>;

export function profilSchluessel(relationshipId: string) {
  return ['training-profil', relationshipId] as const;
}

/** Profil und Übernahmen; `null` heißt: nicht gefunden. */
export async function fetchProfil(relationshipId: string): Promise<Profilsicht | null> {
  const satz = 'Das Profil konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_profile', {
    p_relationship_id: relationshipId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(sichtSchema.nullable(), data ?? null, satz);
}

export async function saveProfil(
  relationshipId: string,
  werte: Profilwerte,
  erwartet: string | null,
): Promise<void> {
  const { error } = (await getSupabase().rpc('save_training_profile', {
    p_relationship_id: relationshipId,
    p_fields: werte,
    p_expected: erwartet,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('changed meanwhile')) {
    throw new Error(
      'Das Profil wurde inzwischen geändert. Bitte neu laden und die Eingaben noch einmal machen.',
    );
  }
  if (error?.message?.includes('has ended')) {
    throw new Error('Der Vertrag ist beendet; das Profil bleibt, wie es ist.');
  }
  if (error) throw new Error('Das Profil konnte nicht gespeichert werden.');
}
