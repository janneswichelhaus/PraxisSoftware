/**
 * Die Sitzungsprüfung der Function (MAP-003a, korrigiert mit BEF-027).
 *
 * Ein Routing-Aufruf kostet Geld und geht an einen Anbieter. Er ist deshalb
 * kein offener Endpunkt: Ohne gültige Sitzung antwortet die Function, bevor
 * irgendetwas das Haus verlässt.
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
 * **Fail closed bleibt, Schweigen nicht.** Bis BEF-027 gab diese Prüfung nur
 * `true` oder `false` zurück — und eine fehlende `SUPABASE_URL` sah aus wie
 * eine abgelehnte Sitzung, die wiederum aussah wie ein abgelehnter
 * Serverschlüssel. Drei Ursachen, eine Meldung, und die zeigte auf den
 * Falschen. Deshalb gibt es jetzt drei Ergebnisse: durchgelassen wird nach
 * wie vor nur `gueltig`.
 */

const VORSATZ = 'Bearer ';

/** Auch die Sitzungsprüfung wartet nicht endlos auf eine Antwort. */
const TIMEOUT_MS = 5_000;

/**
 * Was die Prüfung sagen kann.
 *
 * `nicht_pruefbar` ist **kein** milderes `abgelehnt`: Es heißt, dass die
 * Prüfung selbst nicht laufen konnte — fehlende Einrichtung oder ein
 * Anmeldedienst, der nicht antwortet. Auch dann geht niemand durch; nur die
 * Auskunft ist eine andere.
 */
export type Sitzungsbefund = 'gueltig' | 'abgelehnt' | 'nicht_pruefbar';

/** Warum nicht geprüft werden konnte — für das Log und die Meldung, ohne Token. */
export type Sitzungsgrund = 'einrichtung' | 'anmeldedienst';

export type Sitzungsergebnis =
  | { readonly befund: 'gueltig' | 'abgelehnt' }
  | { readonly befund: 'nicht_pruefbar'; readonly grund: Sitzungsgrund; readonly meldung: string };

interface SitzungsOptionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

export type Sitzungspruefung = (authorization: string | null) => Promise<Sitzungsergebnis>;

export function erstelleSitzungspruefung({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: SitzungsOptionen): Sitzungspruefung {
  const adresse = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = anonKey.trim();

  return async (authorization) => {
    // Zuerst die eigene Einrichtung: Ohne Adresse oder Schlüssel ist jede
    // Antwort dieser Funktion eine Behauptung. Genau das hat im ersten
    // Abnahmelauf eine Stunde gekostet (BEF-027).
    if (adresse === '' || schluessel === '') {
      return {
        befund: 'nicht_pruefbar',
        grund: 'einrichtung',
        meldung: `Sitzungsprüfung nicht eingerichtet: ${fehlende(adresse, schluessel)}`,
      };
    }

    if (authorization === null || !authorization.startsWith(VORSATZ))
      return { befund: 'abgelehnt' };
    if (authorization.slice(VORSATZ.length).trim() === '') return { befund: 'abgelehnt' };

    let antwort: Response;
    try {
      antwort = await abrufen(`${adresse}/auth/v1/user`, {
        method: 'GET',
        // Der Zugangstoken der aufrufenden Person wird weitergereicht, nicht
        // ausgewertet: Diese Function liest keinen Inhalt daraus.
        headers: { Authorization: authorization, apikey: schluessel },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return {
        befund: 'nicht_pruefbar',
        grund: 'anmeldedienst',
        meldung: 'Anmeldedienst nicht erreichbar',
      };
    }

    // 5xx ist keine Aussage über die Sitzung, sondern über den Dienst.
    if (antwort.status >= 500) {
      return {
        befund: 'nicht_pruefbar',
        grund: 'anmeldedienst',
        meldung: `Anmeldedienst antwortet mit ${antwort.status}`,
      };
    }
    return { befund: antwort.ok ? 'gueltig' : 'abgelehnt' };
  };
}

/** Nennt die fehlenden Variablen beim Namen — Namen, keine Werte. */
function fehlende(adresse: string, schluessel: string): string {
  if (adresse === '' && schluessel === '') return 'SUPABASE_URL und SUPABASE_ANON_KEY fehlen';
  return adresse === '' ? 'SUPABASE_URL fehlt' : 'SUPABASE_ANON_KEY fehlt';
}
