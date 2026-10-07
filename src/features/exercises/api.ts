import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { KOERPERREGIONEN } from './types';

/**
 * Die Übungsbibliothek der Praxis (UEB-EPIC-001, IDEA-TRN-005).
 *
 * Lesen owner, therapist, team_lead und Trainingsbetreuung; pflegen nur owner
 * (ANN-293). Was eine Rolle sieht und darf, entscheidet der Server (ADR-004);
 * `can_manage` steuert hier nur die Darstellung.
 */

const varianteSchema = z.object({
  id: z.string(),
  name: z.string(),
  lay_name: z.string(),
  instruction: z.string().nullable(),
  equipment: z.array(z.string()),
  common_faults: z.string().nullable(),
  practice_notes: z.string().nullable(),
  archived: z.boolean(),
});

export type Variante = z.infer<typeof varianteSchema>;

const uebungSchema = z.object({
  id: z.string(),
  name: z.string(),
  lay_name: z.string(),
  body_region: z.enum(KOERPERREGIONEN),
  archived: z.boolean(),
  variants: z.array(varianteSchema),
});

export type Uebung = z.infer<typeof uebungSchema>;

const bibliothekSchema = z.object({
  can_manage: z.boolean(),
  exercises: z.array(uebungSchema),
});

export type Bibliothek = z.infer<typeof bibliothekSchema>;

export const BIBLIOTHEK_SCHLUESSEL = ['uebungsbibliothek'] as const;

export async function fetchBibliothek(): Promise<Bibliothek> {
  const satz = 'Die Übungsbibliothek konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_exercise_library')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(bibliothekSchema, data, satz);
}

type Fehler = { message?: string } | null;

/** Übersetzt die gemeinsamen Meldungen der Schreibpfade. */
function gemeinsam(error: Fehler): void {
  const text = error?.message ?? '';
  if (text.includes('not allowed')) {
    throw new Error('Die Übungsbibliothek pflegt die Praxisinhaber:in.');
  }
  if (text.includes('is required')) throw new Error('Bitte beide Bezeichnungen ausfüllen.');
  if (text.includes('is too long')) throw new Error('Ein Eintrag ist zu lang.');
}

export interface UebungEingabe {
  id?: string;
  name: string;
  laie: string;
  region: string;
}

export async function saveUebung(eingabe: UebungEingabe): Promise<string> {
  const { data, error } = (await getSupabase().rpc('save_exercise', {
    p_exercise_id: eingabe.id ?? null,
    p_name: eingabe.name,
    p_lay_name: eingabe.laie,
    p_body_region: eingabe.region,
  })) as { data: unknown; error: Fehler };
  if (error) {
    gemeinsam(error);
    if (error.message?.includes('already exists')) {
      throw new Error('Eine Übung mit dieser Bezeichnung gibt es schon.');
    }
    if (error.message?.includes('body region')) throw new Error('Bitte eine Körperregion wählen.');
    throw new Error('Die Übung konnte nicht gespeichert werden.');
  }
  return antwort(z.string(), data, 'Die Übung konnte nicht gespeichert werden.');
}

export interface VarianteEingabe {
  id?: string;
  uebungId: string;
  name: string;
  laie: string;
  anleitung: string;
  ausruestung: string[];
  ausweichbewegungen: string;
  hinweise: string;
}

export async function saveVariante(eingabe: VarianteEingabe): Promise<string> {
  const { data, error } = (await getSupabase().rpc('save_exercise_variant', {
    p_variant_id: eingabe.id ?? null,
    p_exercise_id: eingabe.uebungId,
    p_name: eingabe.name,
    p_lay_name: eingabe.laie,
    p_instruction: eingabe.anleitung,
    p_equipment: eingabe.ausruestung,
    p_common_faults: eingabe.ausweichbewegungen,
    p_practice_notes: eingabe.hinweise,
  })) as { data: unknown; error: Fehler };
  if (error) {
    gemeinsam(error);
    if (error.message?.includes('already exists')) {
      throw new Error('Diese Übung hat schon eine Variante mit dieser Bezeichnung.');
    }
    if (error.message?.includes('too many equipment')) {
      throw new Error('Höchstens acht Angaben zur Ausrüstung.');
    }
    if (error.message?.includes('equipment tag is too long')) {
      throw new Error('Eine Angabe zur Ausrüstung ist zu lang (höchstens 40 Zeichen).');
    }
    throw new Error('Die Variante konnte nicht gespeichert werden.');
  }
  return antwort(z.string(), data, 'Die Variante konnte nicht gespeichert werden.');
}

export async function archiviereUebung(id: string, archiviert: boolean): Promise<void> {
  const { error } = (await getSupabase().rpc('set_exercise_archived', {
    p_exercise_id: id,
    p_archived: archiviert,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    throw new Error('Die Übung konnte nicht geändert werden.');
  }
}

export async function archiviereVariante(id: string, archiviert: boolean): Promise<void> {
  const { error } = (await getSupabase().rpc('set_exercise_variant_archived', {
    p_variant_id: id,
    p_archived: archiviert,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    throw new Error('Die Variante konnte nicht geändert werden.');
  }
}

export async function loescheUebung(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_exercise', {
    p_exercise_id: id,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    if (error.message?.includes('has variants')) {
      throw new Error('Die Übung hat noch Varianten. Bitte erst die Varianten löschen.');
    }
    throw new Error('Die Übung konnte nicht gelöscht werden.');
  }
}

export async function loescheVariante(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_exercise_variant', {
    p_variant_id: id,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    if (error.message?.includes('in use')) {
      throw new Error(
        'Die Variante ist mit anderen verbunden. Bitte erst die Verbindungen lösen oder archivieren.',
      );
    }
    throw new Error('Die Variante konnte nicht gelöscht werden.');
  }
}

/** Schlagworte aus einer kommagetrennten Eingabe. */
export function schlagworte(eingabe: string): string[] {
  return eingabe
    .split(',')
    .map((wort) => wort.trim())
    .filter((wort) => wort !== '');
}
