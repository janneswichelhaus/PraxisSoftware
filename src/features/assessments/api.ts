import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type { Antworten } from './antworten';

/**
 * Datenzugriff auf erhobene Fragebögen (FRB-002b).
 *
 * `patient_questionnaire_responses` ist über den Anwendungspfad unerreichbar;
 * gelesen wird nur über `list_patient_questionnaire_responses`, und die
 * Funktion protokolliert jede gelieferte Erhebung (ADR-010). Geschrieben wird
 * über drei Funktionen, die dieselben Regeln prüfen, die die Oberfläche hier
 * nur spiegelt: abgeschlossen ist unveränderlich, eine Korrektur ist eine neue
 * Erhebung mit Begründung (ANN-103).
 *
 * Nichts davon liegt im Browser — kein localStorage, kein Service Worker
 * (ADR-001). Ein Entwurf ist gespeichert, wenn der Server ihn hat.
 */

const erhebungSchema = z.object({
  id: z.string(),
  instrument_id: z.string(),
  definition_version: z.string(),
  status: z.enum(['entwurf', 'abgeschlossen']),
  recorded_on: z.string(),
  answers: z.record(z.string(), z.unknown()),
  supersedes_response_id: z.string().nullable(),
  superseded_by_response_id: z.string().nullable(),
  change_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  author_name: z.string().nullable(),
  completed_by_name: z.string().nullable(),
});

export interface Erhebung extends Omit<z.infer<typeof erhebungSchema>, 'answers'> {
  /** Vom Server nur als Objekt geprüft; die Form je Item prüft `antworten.ts`. */
  answers: Antworten;
}

export const erhebungenQueryKey = (patientId: string) => ['erhebungen', patientId] as const;

export async function fetchErhebungen(patientId: string): Promise<Erhebung[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_questionnaire_responses', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Fragebögen konnten nicht geladen werden.');
  return z.array(erhebungSchema).parse(data) as Erhebung[];
}

/** Verständliche Meldungen für die Abweisungen des Servers — ohne interne Details. */
function meldungFuer(message: string): string {
  if (message.includes('future')) return 'Das Datum darf nicht in der Zukunft liegen.';
  if (message.includes('completed'))
    return 'Der Bogen ist abgeschlossen und lässt sich nur noch als Korrektur ändern.';
  if (message.includes('already corrected')) return 'Zu diesem Bogen gibt es schon eine Korrektur.';
  if (message.includes('reason')) return 'Eine Korrektur braucht eine Begründung.';
  if (message.includes('not allowed')) return 'Für diesen Schritt fehlt die Berechtigung.';
  if (message.includes('not found')) return 'Der Bogen wurde nicht gefunden.';
  return 'Der Bogen konnte nicht gespeichert werden.';
}

export interface ErhebungSpeichern {
  patientId: string;
  /** Gesetzt: diesen Entwurf überschreiben. */
  erhebungId: string | null;
  instrumentId: string;
  version: string;
  datum: string;
  antworten: Antworten;
  /** Gesetzt: Korrektur dieser abgeschlossenen Erhebung. */
  korrigiert: string | null;
  begruendung: string | null;
}

export async function erhebungSpeichern(eingabe: ErhebungSpeichern): Promise<string> {
  const { data, error } = (await getSupabase().rpc('save_questionnaire_response', {
    p_patient_id: eingabe.patientId,
    p_response_id: eingabe.erhebungId,
    p_instrument_id: eingabe.instrumentId,
    p_definition_version: eingabe.version,
    p_recorded_on: eingabe.datum,
    p_answers: eingabe.antworten,
    p_supersedes_response_id: eingabe.korrigiert,
    p_change_reason: eingabe.begruendung,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) throw new Error(meldungFuer(error.message ?? ''));
  return z.string().parse(data);
}

export async function erhebungAbschliessen(erhebungId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('complete_questionnaire_response', {
    p_response_id: erhebungId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(meldungFuer(error.message ?? ''));
}

export async function erhebungVerwerfen(erhebungId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('discard_questionnaire_response', {
    p_response_id: erhebungId,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(meldungFuer(error.message ?? ''));
}
