import { getSupabase } from '@/lib/supabase';

/**
 * Der Serveraufruf zum Zurücknehmen eines eben angelegten Folgetermins
 * (Befund B8, Migration `o_001`). Eigene Datei, damit Seitentests ihn
 * festlegen können.
 */

/** Was der Server einwendet - in Worten, die sagen, was jetzt zu tun ist. */
function meldung(text: string | undefined): string {
  if (text?.includes('undo window has passed')) {
    return 'Die Zeit zum Zurücknehmen ist vorbei. Der Termin lässt sich jetzt nur noch im Kalender absagen.';
  }
  if (text?.includes('changed meanwhile')) {
    return 'Der Termin wurde inzwischen geändert. Bitte im Kalender ansehen.';
  }
  if (text?.includes('already notified')) {
    return 'Die Person weiß schon von dem Termin. Bitte im Kalender absagen.';
  }
  if (text?.includes('cannot be undone')) {
    return 'An dem Termin hängt schon etwas. Bitte im Kalender absagen.';
  }
  if (text?.includes('not allowed to undo')) {
    return 'Zurücknehmen kann nur, wer den Termin angelegt hat.';
  }
  if (text?.includes('appointment not found')) {
    return 'Den Termin gibt es nicht mehr.';
  }
  return 'Der Folgetermin konnte nicht zurückgenommen werden.';
}

/**
 * Nimmt einen eben angelegten Termin zurück: Der Server löscht ihn, wenn er
 * noch nichts bewirkt hat, und prüft dabei alles selbst - Person, Zeit,
 * Zustand und was am Termin hängt (`undo_appointment_creation`).
 * `expectedUpdatedAt` ist der Stand direkt nach dem Anlegen, unverändert als
 * Zeichenkette.
 */
export async function undoAppointmentCreation(
  appointmentId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('undo_appointment_creation', {
    p_appointment_id: appointmentId,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(meldung(error.message));
}
