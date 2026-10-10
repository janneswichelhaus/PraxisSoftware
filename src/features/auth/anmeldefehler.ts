/** Die Sätze der Anmeldemaske und der Sperrseite (BEF-047). */
export const ANMELDESAETZE = {
  pruefen: 'Anmeldung nicht möglich. Bitte E-Mail-Adresse und Kennwort prüfen.',
  leer: 'Bitte E-Mail-Adresse und Kennwort eingeben.',
  keineVerbindung: 'Keine Verbindung zum Anmeldedienst. Ihre Angaben wurden nicht geprüft.',
  dienstGestoert:
    'Der Anmeldedienst ist gerade nicht erreichbar. Ihre Angaben wurden nicht geprüft. Bitte später erneut versuchen.',
  zuVieleVersuche: 'Zu viele Versuche. Bitte in einigen Minuten erneut versuchen.',
  sitzungBeendet: 'Ihre Sitzung wurde beendet. Nicht gespeicherte Eingaben sind nicht erhalten.',
} as const;

/**
 * Welcher Satz zu einem Fehler des Anmeldedienstes gehört (BEF-047).
 *
 * Bis UX-006c galt jeder Fehler als falsche Eingabe. Der Anmeldedienst wirft
 * bei einem Netzfehler aber nicht, er gibt `AuthRetryableFetchError` zurück -
 * im Funkloch stand deshalb „Kennwort prüfen", und wer sein Kennwort kennt,
 * fordert dann womöglich eine Rücksetzmail an.
 *
 * Unterschieden wird nur, was nichts über ein Konto verrät: keine Verbindung,
 * Störung des Dienstes (5xx, Antwort ohne JSON), zu viele Versuche (429). Die
 * Fehlerformen folgen `lib/fetch.js` von `@supabase/auth-js` 2.112. Alles andere -
 * unbekanntes Konto, falsches Kennwort, nicht bestätigte Adresse - bleibt
 * derselbe Satz (`sonst`), damit die Maske kein Verzeichnis der Konten ist.
 * Geprüft wird der Name wie in `linkEinloesen.ts`, nicht die Klasse.
 *
 * Die Sperrseite nutzt dieselbe Unterscheidung: Dort ist das Konto bekannt,
 * und `sonst` heißt „Das Kennwort passt nicht" - im Funkloch stand bis
 * UX-006c genau das.
 */
export function anmeldesatz(
  fehler: {
    name?: string | undefined;
    status?: number | undefined;
    code?: string | undefined;
  },
  sonst: string,
): string {
  // Status 0: die Anfrage kam nicht an. 502 bis 504 meldet die Bibliothek
  // unter demselben Namen - dann antwortet etwas, nur nicht der Dienst.
  if (fehler.name === 'AuthRetryableFetchError') {
    return fehler.status ? ANMELDESAETZE.dienstGestoert : ANMELDESAETZE.keineVerbindung;
  }
  if (fehler.status === 429 || fehler.code === 'over_request_rate_limit') {
    return ANMELDESAETZE.zuVieleVersuche;
  }
  // Eine Antwort ohne JSON - etwa die Fehlerseite eines Gateways - kommt als
  // `AuthUnknownError` ohne Status. Der Anmeldedienst selbst antwortet immer
  // mit JSON; über ein Konto sagt dieser Fall also nichts.
  if (fehler.name === 'AuthUnknownError') return ANMELDESAETZE.dienstGestoert;
  if (fehler.status !== undefined && fehler.status >= 500) return ANMELDESAETZE.dienstGestoert;
  return sonst;
}
