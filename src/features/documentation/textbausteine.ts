import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Textbausteine der Behandlungsdokumentation (UX-008, IDEA-PRX-011).
 *
 * Ein Baustein ist eine vorbereitete Formulierung, kein Befund: kein
 * Patientenbezug, keine Platzhalter, keine Werte aus der Akte, kein
 * Sprachmodell (E-9). Gelesen und geschrieben wird ausschließlich über
 * Serverfunktionen; welche Bausteine jemand sieht, entscheidet die Datenbank.
 */

export const MAX_TITEL = 80;
export const MAX_BAUSTEIN = 2000;

const snippetSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  /** Gehört der ganzen Praxis, nicht einer Person. */
  shared: z.boolean(),
  /** Ob die anfragende Person ihn ändern darf. Verbindlich prüft der Server. */
  editable: z.boolean(),
});

export type TextSnippet = z.infer<typeof snippetSchema>;

export async function fetchTextSnippets(): Promise<TextSnippet[]> {
  const { data, error } = (await getSupabase().rpc('list_text_snippets')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error('Die Textbausteine konnten nicht geladen werden.');
  return z.array(snippetSchema).parse(data ?? []);
}

function schreibfehler(error: { message?: string } | null, standard: string): Error {
  if (error?.message?.includes('already exists')) {
    return new Error('Ein Baustein mit diesem Titel gibt es schon. Bitte einen anderen wählen.');
  }
  if (error?.message?.includes('title must not be empty')) {
    return new Error('Der Titel darf nicht leer sein.');
  }
  if (error?.message?.includes('snippet must not be empty')) {
    return new Error('Der Baustein darf nicht leer sein.');
  }
  if (error?.message?.includes('title is too long')) {
    return new Error(`Der Titel ist zu lang. Höchstens ${MAX_TITEL} Zeichen.`);
  }
  if (error?.message?.includes('snippet is too long')) {
    return new Error(`Der Baustein ist zu lang. Höchstens ${MAX_BAUSTEIN} Zeichen.`);
  }
  if (error?.message?.includes('shared text snippets')) {
    return new Error('Bausteine der Praxis darf nur die Praxisleitung anlegen und ändern.');
  }
  if (error?.message?.includes('not found')) {
    return new Error('Dieser Baustein wurde nicht gefunden.');
  }
  // Alles Übrige bleibt unspezifisch, damit keine internen Details nach außen
  // gelangen.
  return new Error(standard);
}

export async function createTextSnippet(
  title: string,
  body: string,
  shared: boolean,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_text_snippet', {
    p_title: title,
    p_body: body,
    p_shared: shared,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Baustein konnte nicht angelegt werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Der Baustein konnte nicht angelegt werden.');
  return id.data;
}

export async function updateTextSnippet(
  snippetId: string,
  title: string,
  body: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('update_text_snippet', {
    p_snippet_id: snippetId,
    p_title: title,
    p_body: body,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Baustein konnte nicht gespeichert werden.');
}

export async function deleteTextSnippet(snippetId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_text_snippet', {
    p_snippet_id: snippetId,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Baustein konnte nicht gelöscht werden.');
}

/** Prüfung der Eingabe. Bedienkomfort - verbindlich prüft der Server. */
export function bausteinFehler(title: string, body: string): Partial<Record<string, string>> {
  const fehler: Partial<Record<string, string>> = {};
  if (title.trim().length === 0) fehler['title'] = 'Ein Titel ist erforderlich.';
  else if (title.trim().length > MAX_TITEL) fehler['title'] = `Höchstens ${MAX_TITEL} Zeichen.`;
  if (body.trim().length === 0) fehler['body'] = 'Der Baustein darf nicht leer sein.';
  else if (body.trim().length > MAX_BAUSTEIN) fehler['body'] = `Höchstens ${MAX_BAUSTEIN} Zeichen.`;
  return fehler;
}

/**
 * Fügt einen Baustein in einen Text ein.
 *
 * Zwei Regeln, beide aus dem Alltag: Der Baustein kommt ans Ende des bereits
 * Geschriebenen, nicht an den Anfang - er ergänzt. Und zwischen zwei Absätzen
 * steht genau eine Leerzeile, egal wie der bisherige Text endet. Das ist
 * ausdrücklich eine reine Textoperation ohne Kenntnis der Akte (E-9).
 */
export function bausteinEinfuegen(bisher: string, baustein: string): string {
  const links = bisher.replace(/\s+$/, '');
  if (links.length === 0) return baustein;
  return `${links}\n\n${baustein}`;
}
