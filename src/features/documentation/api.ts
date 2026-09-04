import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf die Behandlungsdokumentation (DOK-001, DOK-002).
 *
 * Anders als bei Terminen gibt es hier keine Sicht und keine Tabelle, die
 * direkt gelesen werden könnte: `public.treatment_notes` und
 * `public.treatment_note_versions` sind über den Anwendungspfad unerreichbar.
 * Gelesen wird ausschließlich über `get_treatment_note` und
 * `get_treatment_note_versions`, und beide Funktionen protokollieren jeden
 * Lesezugriff auf klinischen Freitext (ADR-010).
 *
 * Nichts davon wird im Browser zwischengespeichert - kein Service Worker, kein
 * localStorage. Ein Entwurf, der nur lokal läge, wäre genau die Situation, die
 * ADR-001 ausschließt: dokumentiert geglaubt, aber nirgends gespeichert.
 */

export const treatmentNoteStatusSchema = z.enum(['draft', 'final']);
export type TreatmentNoteStatus = z.infer<typeof treatmentNoteStatusSchema>;

export const treatmentNoteStatusLabels: Record<TreatmentNoteStatus, string> = {
  draft: 'Entwurf',
  final: 'Finalisiert',
};

const treatmentNoteSchema = z.object({
  id: z.string(),
  appointment_id: z.string(),
  /** Gesetzt, wenn dieser Eintrag ein Nachtrag ist (ADR-016 Punkt 6). */
  addendum_to_note_id: z.string().nullable(),
  status: treatmentNoteStatusSchema,
  content: z.string(),
  created_at: z.string(),
  // Grundlage der Konflikterkennung beim Speichern. Bewusst als Zeichenkette
  // geführt: ein Date verlöre Bruchteile von Sekunden.
  updated_at: z.string(),
  finalized_at: z.string().nullable(),
  /** Anzahl festgeschriebener Versionen. Ein Entwurf hat null. */
  version_count: z.number(),
  author_name: z.string().nullable(),
  last_editor_name: z.string().nullable(),
  finalized_by_name: z.string().nullable(),
});

export type TreatmentNote = z.infer<typeof treatmentNoteSchema>;

const treatmentNoteVersionSchema = z.object({
  version_no: z.number(),
  content: z.string(),
  /** Begründung der Korrektur. Version 1 hat keine (ADR-016 Punkt 6). */
  change_reason: z.string().nullable(),
  recorded_at: z.string(),
  author_name: z.string().nullable(),
});

export type TreatmentNoteVersion = z.infer<typeof treatmentNoteVersionSchema>;

/**
 * Die Dokumentation eines Termins: ein Haupteintrag und seine Nachträge.
 *
 * Getrennt geführt, weil beide fachlich Verschiedenes sind - der Haupteintrag
 * ist die Behandlung, ein Nachtrag die spätere Ergänzung dazu (ADR-016
 * Punkt 6). Die Reihenfolge kommt vom Server und wird hier nicht verändert.
 */
export interface TreatmentDocumentation {
  primary: TreatmentNote | null;
  addenda: TreatmentNote[];
}

/**
 * Liest die Behandlungsdokumentation eines Termins.
 *
 * Ein leeres Ergebnis heißt: es gibt keine. Das ist kein Fehlerfall - zu den
 * meisten Terminen existiert (noch) keine Dokumentation, und dann entsteht auch
 * kein Auditeintrag.
 */
export async function fetchTreatmentDocumentation(
  appointmentId: string,
): Promise<TreatmentDocumentation> {
  const { data, error } = (await getSupabase().rpc('get_treatment_note', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsdokumentation konnte nicht geladen werden.');
  const zeilen = z.array(treatmentNoteSchema).parse(data ?? []);

  return {
    primary: zeilen.find((zeile) => zeile.addendum_to_note_id === null) ?? null,
    addenda: zeilen.filter((zeile) => zeile.addendum_to_note_id !== null),
  };
}

/** Sucht einen Eintrag - Haupteintrag oder Nachtrag - anhand seiner ID. */
export function findeEintrag(
  dokumentation: TreatmentDocumentation,
  noteId: string | undefined,
): TreatmentNote | null {
  if (!noteId) return null;
  if (dokumentation.primary?.id === noteId) return dokumentation.primary;
  return dokumentation.addenda.find((eintrag) => eintrag.id === noteId) ?? null;
}

/** Liest den Versionsverlauf eines Eintrags. Protokolliert wird das serverseitig. */
export async function fetchTreatmentNoteVersions(noteId: string): Promise<TreatmentNoteVersion[]> {
  const { data, error } = (await getSupabase().rpc('get_treatment_note_versions', {
    p_note_id: noteId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Änderungsverlauf konnte nicht geladen werden.');
  return z.array(treatmentNoteVersionSchema).parse(data ?? []);
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
  if (error?.message?.includes('requires a revision')) {
    return new Error(
      'Diese Dokumentation ist finalisiert. Eine Änderung ist nur als Korrektur mit Begründung möglich.',
    );
  }
  if (error?.message?.includes('is already final')) {
    return new Error('Diese Dokumentation ist bereits finalisiert. Bitte die Ansicht neu laden.');
  }
  if (error?.message?.includes('is not final')) {
    return new Error(
      'Dieser Eintrag ist noch ein Entwurf. Korrektur und Nachtrag gibt es erst nach der Finalisierung.',
    );
  }
  if (error?.message?.includes('change reason is required')) {
    return new Error('Für eine Korrektur ist eine kurze Begründung erforderlich.');
  }
  if (error?.message?.includes('change reason is too long')) {
    return new Error('Die Begründung ist zu lang. Höchstens 500 Zeichen.');
  }
  if (error?.message?.includes('documentation is unchanged')) {
    return new Error(
      'Der Text ist unverändert. Eine Korrektur ohne Änderung wird nicht gespeichert.',
    );
  }
  if (error?.message?.includes('addendum cannot be extended')) {
    return new Error(
      'Zu einem Nachtrag gibt es keinen weiteren Nachtrag. Bitte den ursprünglichen Eintrag ergänzen.',
    );
  }
  if (error?.message?.includes('treatment note not found')) {
    return new Error('Diese Behandlungsdokumentation wurde nicht gefunden.');
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
 *
 * Für einen finalisierten Eintrag ist dieser Weg verschlossen - dort greift
 * `reviseTreatmentNote`.
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

/**
 * Finalisiert einen Entwurf (ADR-016 Punkt 4).
 *
 * Der Stand wird dabei als Version 1 festgeschrieben. Danach ist der Eintrag
 * Bestandteil der Akte und nur noch als Korrektur änderbar.
 */
export async function finalizeTreatmentNote(
  noteId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('finalize_treatment_note', {
    p_note_id: noteId,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { error: { message?: string } | null };

  if (error) {
    throw schreibfehler(error, 'Die Behandlungsdokumentation konnte nicht finalisiert werden.');
  }
}

/**
 * Korrigiert einen finalisierten Eintrag als neue Version (ADR-016 Punkt 5, 6).
 *
 * Der bisherige Inhalt bleibt vollständig abrufbar; die Begründung ist
 * verbindlich und wird serverseitig geprüft.
 */
export async function reviseTreatmentNote(
  noteId: string,
  expectedUpdatedAt: string,
  content: string,
  reason: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('revise_treatment_note', {
    p_note_id: noteId,
    p_expected_updated_at: expectedUpdatedAt,
    p_content: content,
    p_reason: reason,
  })) as { error: { message?: string } | null };

  if (error) {
    throw schreibfehler(error, 'Die Korrektur konnte nicht gespeichert werden.');
  }
}

/**
 * Legt einen Nachtrag zu einem finalisierten Eintrag an (ADR-016 Punkt 6).
 *
 * Der Nachtrag ist ein eigener Eintrag und beginnt als Entwurf; er durchläuft
 * denselben Lebenszyklus wie der Ursprungseintrag.
 */
export async function createTreatmentNoteAddendum(
  parentNoteId: string,
  content: string,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_treatment_note_addendum', {
    p_parent_note_id: parentNoteId,
    p_content: content,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) {
    throw schreibfehler(error, 'Der Nachtrag konnte nicht angelegt werden.');
  }

  const id = z.string().uuid().safeParse(data);
  if (!id.success) {
    throw new Error('Der Nachtrag konnte nicht angelegt werden.');
  }
  return id.data;
}

/** Höchstlänge des Freitexts. Muss zur Prüfung in der Datenbank passen. */
export const MAX_ZEICHEN = 20_000;

/** Höchstlänge der Korrekturbegründung. Muss zur Prüfung in der Datenbank passen. */
export const MAX_BEGRUENDUNG = 500;

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

/** Prüfung der Begründung. Bedienkomfort - verbindlich prüft der Server. */
export function begruendungFehler(reason: string): string | undefined {
  if (reason.trim().length === 0) return 'Bitte kurz begründen, was korrigiert wird.';
  if (reason.trim().length > MAX_BEGRUENDUNG) {
    return `Höchstens ${MAX_BEGRUENDUNG.toLocaleString('de-DE')} Zeichen.`;
  }
  return undefined;
}
