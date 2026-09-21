/**
 * Die Sitzungsprüfung der Function (MAP-003a).
 *
 * Ein Routing-Aufruf kostet Geld und geht an einen Anbieter. Er ist deshalb
 * kein offener Endpunkt: Ohne gültige Sitzung antwortet die Function mit 401,
 * bevor irgendetwas das Haus verlässt.
 *
 * Geprüft wird beim eigenen Anmeldedienst (`/auth/v1/user`) und nicht durch
 * eigenes Nachrechnen der Signatur. Das ist die Abwägung: Eine eigene
 * JWT-Prüfung bräuchte eine Bibliothek und damit eine Abhängigkeit in einer
 * Laufzeit, die nach ADR-015 Punkt 20 ohnehin noch unter Vorbehalt steht —
 * und sie kennte nicht, was der Anmeldedienst weiß (gesperrtes Konto,
 * zurückgezogene Sitzung). Der zusätzliche Aufruf geht an die eigene Instanz,
 * nicht nach außen.
 *
 * Die Plattformprüfung (`verify_jwt` in `supabase/config.toml`) bleibt
 * zusätzlich stehen: zwei Riegel, nicht einer statt des anderen.
 *
 * **Fail closed:** Jeder Zweifel — kein Kopf, falsches Format, Netzfehler,
 * Zeitüberschreitung — heißt „keine Sitzung". Nie umgekehrt.
 */

const VORSATZ = 'Bearer ';

/** Auch die Sitzungsprüfung wartet nicht endlos auf eine Antwort. */
const TIMEOUT_MS = 5_000;

interface SitzungsOptionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

export type Sitzungspruefung = (authorization: string | null) => Promise<boolean>;

export function erstelleSitzungspruefung({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: SitzungsOptionen): Sitzungspruefung {
  return async (authorization) => {
    if (authorization === null || !authorization.startsWith(VORSATZ)) return false;
    if (authorization.slice(VORSATZ.length).trim() === '') return false;

    try {
      const antwort = await abrufen(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
        method: 'GET',
        // Der Zugangstoken der aufrufenden Person wird weitergereicht, nicht
        // ausgewertet: Diese Function liest keinen Inhalt daraus.
        headers: { Authorization: authorization, apikey: anonKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
      return antwort.ok;
    } catch {
      return false;
    }
  };
}
