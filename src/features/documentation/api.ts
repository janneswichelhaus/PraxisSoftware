import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { appointmentStatusSchema, appointmentTypeSchema } from '@/features/appointments/api';

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

const treatmentNoteStatusSchema = z.enum(['draft', 'final']);
type TreatmentNoteStatus = z.infer<typeof treatmentNoteStatusSchema>;

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
  /**
   * Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018, ADR-018 Fassung 3
   * Punkt 9): Die Tür wurde geöffnet, die Behandlung fand auf Angabe der
   * Patient:in nicht statt. Der Termin gilt trotzdem als durchgeführt.
   *
   * Ein Merkmal am Eintrag und ausdrücklich kein Freitext als einzige Quelle —
   * die Frage entscheidet später über eine Rechnung ohne erbrachte Leistung.
   */
  visit_without_treatment: z.boolean(),
  created_at: z.string(),
  // Grundlage der Konflikterkennung beim Speichern. Bewusst als Zeichenkette
  // geführt: ein Date verlöre Bruchteile von Sekunden.
  updated_at: z.string(),
  finalized_at: z.string().nullable(),
  /**
   * Wie finalisiert wurde: von Hand (DOK-002) oder automatisch nach
   * Fristablauf (DOK-004, ADR-016 Punkt 7). Ein Entwurf hat keinen Wert.
   */
  finalisation_kind: z.enum(['manual', 'automatic']).nullable(),
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
 * Schließt eine Behandlung in einem Schritt ab (UX-007).
 *
 * Entwurf schreiben, finalisieren und den Termin abschließen passieren
 * serverseitig in **einer** Transaktion. Drei einzelne Aufrufe könnten
 * dazwischen scheitern und einen halben Zustand hinterlassen - eine
 * finalisierte Dokumentation an einem Termin, der noch als geplant geführt
 * wird (PROJECT_PRINCIPLES.md 13).
 *
 * `expectedNoteUpdatedAt` ist der Stand des Entwurfs, auf dem die Eingabe
 * beruht, oder `null`, wenn es beim Öffnen keinen gab. Beides wird
 * serverseitig geprüft: ein zwischenzeitlich entstandener oder geänderter
 * Entwurf führt zum Konflikt statt zum stillen Überschreiben.
 *
 * `visitWithoutTreatment` trägt den Pflichtvermerk aus Hausbesuch-Szenario 1
 * ein (CAL-018). Er wird ausschließlich hier gesetzt — mit der Finalisierung
 * ist der Eintrag Bestandteil der Akte, und der Server nimmt ihn nur am
 * Hausbesuchstermin an (ANN-053).
 */
export async function completeTreatment(
  appointmentId: string,
  content: string,
  expectedAppointmentUpdatedAt: string,
  expectedNoteUpdatedAt: string | null,
  visitWithoutTreatment = false,
): Promise<void> {
  const { error } = (await getSupabase().rpc('complete_treatment', {
    p_appointment_id: appointmentId,
    p_content: content,
    p_expected_appointment_updated_at: expectedAppointmentUpdatedAt,
    p_expected_note_updated_at: expectedNoteUpdatedAt,
    p_visit_without_treatment: visitWithoutTreatment,
  })) as { error: { message?: string } | null };

  if (error) {
    if (error.message?.includes('appointment was changed meanwhile')) {
      throw new Error(
        'Der Termin wurde zwischenzeitlich geändert. Bitte den eigenen Text sichern, die Ansicht neu laden und den Abschluss erneut vornehmen.',
      );
    }
    throw schreibfehler(error, 'Die Behandlung konnte nicht abgeschlossen werden.');
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

// -----------------------------------------------------------------------------
// Dokumentation in der Akte (DOK-003, ROL-001)
//
// Die Akte liest chronologisch ueber alle Termine eines Patienten. Seit E15
// bekommen alle vier Praxisrollen dieselbe klinische Sicht, office
// eingeschlossen (ADR-004 Fassung 2 Punkt 3). Der Behandlungsnachweis ohne
// Inhalt (list_patient_treatment_evidence) bleibt serverseitig als
// Rechnungssicht bestehen (Punkt 4); die Akte fragt ihn nicht mehr an.
// -----------------------------------------------------------------------------

/**
 * Termine je Seite der Akte.
 *
 * Muss unter der Obergrenze der Datenbank (50) bleiben. Klein genug, dass ein
 * einzelner Aufruf nicht die ganze Akte offenlegt, gross genug fuer einen
 * Behandlungsverlauf ohne staendiges Nachladen.
 */
export const AKTE_SEITENGROESSE = 20;

/** Keyset-Cursor: der letzte Termin der vorigen Seite (starts_at, id). */
export interface AkteCursor {
  beforeStartsAt: string;
  beforeId: string;
}

const recordAppointmentSchema = z.object({
  appointment_id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: appointmentTypeSchema,
  appointment_status: appointmentStatusSchema,
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  organization_time_zone: z.string(),
});

/** Ein Termin der Akte - der organisatorische Rahmen seiner Eintraege. */
export type RecordAppointment = z.infer<typeof recordAppointmentSchema>;

/** Dokumentationsstand eines Termins ohne Inhalt, wie ihn der Tagesplan liefert. */
export const documentationStatusSchema = z.enum(['none', 'draft', 'final']);

function seitenArgumente(cursor: AkteCursor | null) {
  return {
    p_limit: AKTE_SEITENGROESSE,
    p_before_starts_at: cursor?.beforeStartsAt ?? null,
    p_before_id: cursor?.beforeId ?? null,
  };
}

/**
 * Cursor fuer die naechste Seite - oder null, wenn die Seite nicht voll war.
 *
 * Eine volle Seite kann die letzte sein; dann liefert die naechste Anfrage
 * eine leere Seite, und die Schaltflaeche verschwindet. Das ist billiger als
 * eine eigene Zaehlabfrage und kostet nur einen leeren Aufruf.
 */
export function naechsteAkteSeite(
  seite: readonly Pick<RecordAppointment, 'starts_at' | 'appointment_id'>[],
): AkteCursor | null {
  if (seite.length < AKTE_SEITENGROESSE) return null;
  const letzte = seite[seite.length - 1]!;
  return { beforeStartsAt: letzte.starts_at, beforeId: letzte.appointment_id };
}

/**
 * Klinische Sicht der Akte: je Termin seine Eintraege - Haupteintrag zuerst,
 * Nachtraege in Entstehungsreihenfolge - mit denselben Feldern wie am Termin.
 * Ein Termin ohne Dokumentation hat eine leere Liste.
 */
const patientTreatmentNotesSchema = recordAppointmentSchema.extend({
  notes: z.array(treatmentNoteSchema),
});

export type PatientTreatmentNotesEntry = z.infer<typeof patientTreatmentNotesSchema>;

/**
 * Eine Seite der klinischen Sicht.
 *
 * Jeder Eintrag der Seite wird serverseitig als gelesen protokolliert
 * (treatment_note.viewed), auch Nachtraege. Deshalb fragt die Oberflaeche
 * diese Sicht nur fuer Rollen an, die sie lesen duerfen - sonst entstuende
 * ein Auditeintrag fuer einen Zugriff, der ohnehin abgewiesen wird.
 */
export async function fetchPatientTreatmentNotesPage(
  patientId: string,
  cursor: AkteCursor | null,
): Promise<PatientTreatmentNotesEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_treatment_notes', {
    p_patient_id: patientId,
    ...seitenArgumente(cursor),
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsdokumentation konnte nicht geladen werden.');
  return z.array(patientTreatmentNotesSchema).parse(data ?? []);
}

// -----------------------------------------------------------------------------
// Frist der automatischen Finalisierung (DOK-004)
// -----------------------------------------------------------------------------

/**
 * Angebotene Fristen in Kalendertagen nach dem Behandlungstag. Die Datenbank
 * erlaubt 0 bis 30; die Auswahl beschraenkt sich auf sinnvolle Stufen, ein
 * anderer gespeicherter Wert wird trotzdem angezeigt.
 */
export const FRIST_WERTE = [0, 1, 2, 3, 7, 14] as const;

/** Voreinstellung nach ADR-016 Punkt 7: Ende des auf die Behandlung folgenden Kalendertages. */
export const FRIST_VOREINSTELLUNG = 1;

export function fristLabel(tage: number): string {
  if (tage === 0) return 'Ende des Behandlungstages';
  if (tage === 1) return 'Ende des Folgetages';
  return `Ende des ${tage}. Tages nach der Behandlung`;
}

const deadlineSchema = z.object({ documentation_auto_finalize_days: z.number().int() });

/** Liest die Frist der eigenen Praxis. RLS gibt nur die eigene Organisation frei. */
export async function fetchDocumentationDeadline(organizationId: string): Promise<number> {
  const { data, error } = await getSupabase()
    .from('organizations')
    .select('documentation_auto_finalize_days')
    .eq('id', organizationId)
    .maybeSingle();

  if (error || !data) throw new Error('Die Dokumentationsfrist konnte nicht geladen werden.');
  return deadlineSchema.parse(data).documentation_auto_finalize_days;
}

/**
 * Setzt die Frist. Nur owner - verbindlich prueft `set_documentation_deadline`;
 * die ausgeblendete Einstellung ist keine Zugriffskontrolle (ADR-004).
 */
export async function saveDocumentationDeadline(tage: number): Promise<void> {
  const { error } = (await getSupabase().rpc('set_documentation_deadline', {
    p_days: tage,
  })) as { error: { message?: string } | null };

  if (error) throw new Error('Die Dokumentationsfrist konnte nicht gespeichert werden.');
}
