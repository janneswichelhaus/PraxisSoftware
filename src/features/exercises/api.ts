import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { AUSGANGSSTELLUNGEN, ZIELE, type Katalogeintrag } from './katalog/typen';
import { ACHSEN, KOERPERREGIONEN } from './types';

/**
 * Die Übungsbibliothek der Praxis (UEB-EPIC-001, IDEA-TRN-005).
 *
 * Lesen owner, therapist, team_lead und Trainingsbetreuung; pflegen nur owner
 * (ANN-293). Was eine Rolle sieht und darf, entscheidet der Server (ADR-004);
 * `can_manage` steuert hier nur die Darstellung.
 */

/**
 * UEB-012 (ANN-384): die Standarddosierung des Katalogs in der Form der
 * Planposition. Für alle gleich, nie aus Angaben einer Person abgeleitet.
 */
export const standarddosierungSchema = z.object({
  sets: z.number(),
  reps_min: z.number().nullable().default(null),
  reps_max: z.number().nullable().default(null),
  duration_seconds: z.number().nullable().default(null),
  hold_seconds: z.number().nullable().default(null),
  per_side: z.boolean().default(false),
  times_per_day: z.number().nullable().default(null),
});

export type Standarddosierung = z.infer<typeof standarddosierungSchema>;

const varianteSchema = z.object({
  id: z.string(),
  name: z.string(),
  lay_name: z.string(),
  instruction: z.string().nullable(),
  equipment: z.array(z.string()),
  common_faults: z.string().nullable(),
  practice_notes: z.string().nullable(),
  archived: z.boolean(),
  // UEB-012: Herkunft aus dem Katalog, Ordnungen, Standarddosierung und
  // Prüfvermerk (ANN-382 bis ANN-386). Bei eigenen Varianten leer. Ein Bild
  // gibt es nicht mehr (ANN-539).
  catalog_key: z.string().nullable().default(null),
  catalog_version: z.string().nullable().default(null),
  goal: z.enum(ZIELE).nullable().catch(null),
  starting_position: z.enum(AUSGANGSSTELLUNGEN).nullable().catch(null),
  level: z.number().int().min(1).max(3).nullable().catch(null),
  default_dosage: standarddosierungSchema.nullable().catch(null),
  reviewed_at: z.string().nullable().default(null),
  reviewed_by_name: z.string().nullable().default(null),
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

/**
 * UEB-002: Verbindung von der leichteren zur schwereren Variante entlang
 * genau einer Achse (ANN-294). Zum Nachschlagen; nichts wählt daraus aus
 * (ADR-006 Punkt 10).
 */
const verbindungSchema = z.object({
  id: z.string(),
  easier_variant_id: z.string(),
  harder_variant_id: z.string(),
  axis: z.enum(ACHSEN),
});

export type Verbindung = z.infer<typeof verbindungSchema>;

const bibliothekSchema = z.object({
  can_manage: z.boolean(),
  exercises: z.array(uebungSchema),
  links: z.array(verbindungSchema),
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

export async function verbinde(leichter: string, schwerer: string, achse: string): Promise<void> {
  const { error } = (await getSupabase().rpc('link_exercise_variants', {
    p_easier_variant_id: leichter,
    p_harder_variant_id: schwerer,
    p_axis: achse,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    const text = error.message ?? '';
    if (text.includes('already linked')) {
      throw new Error('Diese beiden Varianten sind schon verbunden.');
    }
    if (text.includes('cycle')) {
      throw new Error(
        'Die andere Variante ist über bestehende Verbindungen schon leichter oder schwerer – so entstünde ein Kreis.',
      );
    }
    if (text.includes('archived'))
      throw new Error('Archivierte Varianten lassen sich nicht verbinden.');
    if (text.includes('axis')) throw new Error('Bitte eine Achse wählen.');
    if (text.includes('itself'))
      throw new Error('Eine Variante lässt sich nicht mit sich selbst verbinden.');
    throw new Error('Die Verbindung konnte nicht angelegt werden.');
  }
}

export async function loeseVerbindung(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('unlink_exercise_variants', {
    p_link_id: id,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    throw new Error('Die Verbindung konnte nicht gelöst werden.');
  }
}

const uebernahmeSchema = z.object({
  imported: z.array(z.string()),
  skipped: z.array(z.string()),
  conflicts: z.array(z.object({ catalog_key: z.string(), name: z.string() })),
});

export type Uebernahme = z.infer<typeof uebernahmeSchema>;

/**
 * UEB-012 (ANN-385): den mitgelieferten Katalog in die Bibliothek der Praxis
 * übernehmen - nur owner. Der Server prüft jeden Eintrag, überspringt, was
 * die Praxis schon hat, und überschreibt nichts.
 */
export async function importiereKatalog(eintraege: readonly Katalogeintrag[]): Promise<Uebernahme> {
  const rest = 'Der Katalog konnte nicht übernommen werden.';
  const { data, error } = (await getSupabase().rpc('import_exercise_catalog', {
    p_entries: eintraege,
  })) as { data: unknown; error: Fehler };
  if (error) {
    gemeinsam(error);
    throw new Error(rest);
  }
  return antwort(uebernahmeSchema, data, rest);
}

/** UEB-012 (ANN-386): Prüfvermerk setzen oder nehmen - nur owner. */
export async function setzePruefvermerk(varianteId: string, geprueft: boolean): Promise<void> {
  const { error } = (await getSupabase().rpc('set_exercise_variant_reviewed', {
    p_variant_id: varianteId,
    p_reviewed: geprueft,
  })) as { error: Fehler };
  if (error) {
    gemeinsam(error);
    throw new Error('Der Prüfvermerk konnte nicht gespeichert werden.');
  }
}

/** Schlagworte aus einer kommagetrennten Eingabe. */
export function schlagworte(eingabe: string): string[] {
  return eingabe
    .split(',')
    .map((wort) => wort.trim())
    .filter((wort) => wort !== '');
}
