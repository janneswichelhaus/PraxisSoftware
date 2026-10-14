/**
 * Darf diese Person zu diesem Termin diktieren? (KI-001, ADR-004, ADR-005)
 *
 * Der Gateway entscheidet das nicht selbst: Er fragt die Datenbank über
 * PostgREST, **mit dem Token der Person** und dem öffentlichen Schlüssel -
 * `public.check_dictation_access` prüft Rolle, Organisation, Sitzungssperre,
 * Leistungsbereich und Zustand des Termins. Kein Admin-Schlüssel, kein
 * Datenbankclient, keine Tabelle: Die Function erfährt nur Ja oder Nein.
 *
 * Fail closed: Durchgelassen wird nur ein ausdrückliches `true`. Alles andere
 * ist eine Abweisung oder „nicht prüfbar" - beides lässt nichts durch, die
 * Unterscheidung dient nur der richtigen Meldung.
 */

/** Auch die Berechtigungsprüfung wartet nicht endlos. */
const TIMEOUT_MS = 5_000;

/**
 * `abgelehnt`: Das Token gilt bei der Datenbank nicht (mehr).
 * `verweigert`: Die Datenbank hat das Diktat zu diesem Termin abgelehnt.
 * `nicht_pruefbar`: Die Prüfung selbst lief nicht - Einrichtung, Ausfall.
 */
export type Berechtigungsbefund = 'erlaubt' | 'verweigert' | 'abgelehnt' | 'nicht_pruefbar';

export type Berechtigungspruefung = (
  authorization: string,
  terminId: string,
) => Promise<Berechtigungsbefund>;

interface Optionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

export function erstelleBerechtigungspruefung({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Berechtigungspruefung {
  const adresse = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = anonKey.trim();

  return async (authorization, terminId) => {
    if (adresse === '' || schluessel === '') return 'nicht_pruefbar';

    let antwort: Response;
    try {
      antwort = await abrufen(`${adresse}/rest/v1/rpc/check_dictation_access`, {
        method: 'POST',
        // Das Token der Person wird weitergereicht, nicht ausgewertet: Die
        // Datenbank prüft es und liest daraus Konto und Rolle.
        headers: {
          apikey: schluessel,
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_appointment_id: terminId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return 'nicht_pruefbar';
    }

    // 5xx und 404 sind keine Aussage über die Person: Dienst gestört oder
    // die Funktion fehlt (Migration nicht eingespielt).
    if (antwort.status >= 500 || antwort.status === 404) return 'nicht_pruefbar';
    if (antwort.status === 401) return 'abgelehnt';
    if (antwort.status !== 200) return 'verweigert';

    let wert: unknown;
    try {
      wert = await antwort.json();
    } catch {
      return 'nicht_pruefbar';
    }
    if (wert === true) return 'erlaubt';
    if (wert === false) return 'verweigert';
    return 'nicht_pruefbar';
  };
}
