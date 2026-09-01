import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf die Behandlungsdokumentation (DOK-001).
 *
 * Anders als bei Terminen gibt es hier keine Sicht und keine Tabelle, die
 * direkt gelesen werden könnte: `public.treatment_notes` ist über den
 * Anwendungspfad unerreichbar. Gelesen wird ausschließlich über
 * `get_treatment_note`, und diese Funktion protokolliert jeden Lesezugriff auf
 * klinischen Freitext (ADR-010).
 *
 * Nichts davon wird im Browser zwischengespeichert - kein Service Worker, kein
 * localStorage. Ein Entwurf, der nur lokal läge, wäre genau die Situation, die
 * ADR-001 ausschließt: dokumentiert geglaubt, aber nirgends gespeichert.
 */

export const treatmentNoteStatusSchema = z.enum(['draft']);
export type TreatmentNoteStatus = z.infer<typeof treatmentNoteStatusSchema>;

export const treatmentNoteStatusLabels: Record<TreatmentNoteStatus, string> = {
  draft: 'Entwurf',
};

const treatmentNoteSchema = z.object({
  id: z.string(),
  appointment_id: z.string(),
  status: treatmentNoteStatusSchema,
  content: z.string(),
  created_at: z.string(),
  // Grundlage der Konflikterkennung beim Speichern. Bewusst als Zeichenkette
  // geführt: ein Date verlöre Bruchteile von Sekunden.
  updated_at: z.string(),
  author_name: z.string().nullable(),
  last_editor_name: z.string().nullable(),
});

export type TreatmentNote = z.infer<typeof treatmentNoteSchema>;

/**
 * Liest die Behandlungsdokumentation eines Termins.
 *
 * `null` heißt: es gibt keine. Das ist kein Fehlerfall - zu den meisten
 * Terminen existiert (noch) keine Dokumentation, und dann entsteht auch kein
 * Auditeintrag.
 */
export async function fetchTreatmentNote(appointmentId: string): Promise<TreatmentNote | null> {
  const { data, error } = (await getSupabase().rpc('get_treatment_note', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsdokumentation konnte nicht geladen werden.');
  const zeilen = z.array(treatmentNoteSchema).parse(data ?? []);
  return zeilen[0] ?? null;
}

/**
 * Die Dokumentation wurde zwischenzeitlich von einer anderen Person geändert.
 *
 * Eigener Typ statt eines Textvergleichs in der Oberfläche: nur so lässt sich
 * der Konflikt sicher von einem sonstigen Fehler unterscheiden. Der eigene Text
 * bleibt dabei im Formular stehen - er darf durch den Konflikt nicht verloren
 * gehen (PROJECT_PRINCIPLES.md 13).
 */
export class DokumentationVeraendertError extends Error {
  constructor() {
    super(
      'Die Dokumentation wurde zwischenzeitlich von einer anderen Person geändert. Bitte den eigenen Text sichern, die Ansicht neu laden und die Änderung erneut vornehmen.',
    );
    this.name = 'DokumentationVeraendertError';
  }
}

export function istZwischenzeitlichGeaendert(fehler: unknown): boolean {
  return fehler instanceof DokumentationVeraendertError;
}

function schreibfehler(error: { message?: string } | null, standard: string): Error {
  if (error?.message?.includes('changed meanwhile')) {
    return new DokumentationVeraendertError();
  }
  if (error?.message?.includes('must not be empty')) {
    return new Error('Die Behandlungsdokumentation darf nicht leer sein.');
  }
  if (error?.message?.includes('too long')) {
    return new Error('Die Behandlungsdokumentation ist zu lang. Höchstens 20.000 Zeichen.');
  }
  if (error?.message?.includes('cannot be documented')) {
    return new Error('Zu einem abgesagten Termin kann keine Behandlungsdokumentation entstehen.');
  }
  if (error?.message?.includes('already exists')) {
    return new Error(
      'Für diesen Termin gibt es bereits eine Behandlungsdokumentation. Bitte die Ansicht neu laden.',
    );
  }
  // Alles Übrige bleibt bewusst unspezifisch, damit keine internen Details nach
  // außen gelangen.
  return new Error(standard);
}

/** Legt die Dokumentation eines Termins als Entwurf an und gibt ihre ID zurück. */
export async function createTreatmentNote(appointmentId: string, content: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_treatment_note', {
    p_appointment_id: appointmentId,
    p_content: content,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) {
    throw schreibfehler(error, 'Die Behandlungsdokumentation konnte nicht angelegt werden.');
  }

  const id = z.string().uuid().safeParse(data);
  if (!id.success) {
    throw new Error('Die Behandlungsdokumentation konnte nicht angelegt werden.');
  }
  return id.data;
}

/**
 * Ändert einen Entwurf.
 *
 * `expectedUpdatedAt` ist der Stand, auf dem die Bearbeitung beruht. Er wird
 * unverändert so zurückgegeben, wie er gelesen wurde; der Server weist eine
 * Änderung auf veraltetem Stand ab, statt still zu überschreiben (ADR-001).
 */
export async function updateTreatmentNote(
  noteId: string,
  expectedUpdatedAt: string,
  content: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('update_treatment_note', {
    p_note_id: noteId,
    p_expected_updated_at: expectedUpdatedAt,
    p_content: content,
  })) as { error: { message?: string } | null };

  if (error) {
    throw schreibfehler(error, 'Die Behandlungsdokumentation konnte nicht gespeichert werden.');
  }
}

/** Höchstlänge des Freitexts. Muss zur Prüfung in der Datenbank passen. */
export const MAX_ZEICHEN = 20_000;

/**
 * Prüfung der Eingabe. Bedienkomfort - verbindlich prüft der Server.
 */
export function inhaltFehler(content: string): string | undefined {
  if (content.trim().length === 0) return 'Die Behandlungsdokumentation darf nicht leer sein.';
  if (content.trim().length > MAX_ZEICHEN) {
    return `Höchstens ${MAX_ZEICHEN.toLocaleString('de-DE')} Zeichen.`;
  }
  return undefined;
}
