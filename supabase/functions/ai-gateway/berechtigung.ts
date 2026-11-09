// Darf diese Person das an diesem Gegenstand? (ADR-004, ADR-005) Der Gateway entscheidet es nie
// selbst: Er fragt die Datenbank über PostgREST mit dem Token der Person und erfährt nur Ja oder
// Nein. Fail closed: Durch kommt nur ein ausdrückliches `true`.

/** Auch die Berechtigungsprüfung wartet nicht endlos. */
const TIMEOUT_MS = 5_000;

/**
 * `abgelehnt`: Das Token gilt bei der Datenbank nicht (mehr).
 * `verweigert`: Die Datenbank hat es an diesem Gegenstand abgelehnt.
 * `nicht_pruefbar`: Die Prüfung selbst lief nicht - Einrichtung, Ausfall.
 */
export type Berechtigungsbefund = 'erlaubt' | 'verweigert' | 'abgelehnt' | 'nicht_pruefbar';

export type Berechtigungspruefung = (
  authorization: string,
  terminId: string,
) => Promise<Berechtigungsbefund>;

/** Woran eine Hilfe ohne Ton geprüft wird; je Art genau eine Funktion der Datenbank. */
export interface Assistenzfrage {
  readonly art: 'termin';
  readonly id: string;
}

export type Assistenzpruefung = (
  authorization: string,
  frage: Assistenzfrage,
) => Promise<Berechtigungsbefund>;

interface Optionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

/** Die Prüffunktionen der Datenbank, ausgeschrieben: Ein anderer Pfad fällt `abschottung.test.ts` auf. */
const PFADE = {
  diktat: '/rest/v1/rpc/check_dictation_access',
  termin: '/rest/v1/rpc/check_note_arrangement_access',
} as const;

function erstelleFrage({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen) {
  const adresse = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = anonKey.trim();

  return async (
    authorization: string,
    pfad: (typeof PFADE)[keyof typeof PFADE],
    argumente: Readonly<Record<string, string>>,
  ): Promise<Berechtigungsbefund> => {
    if (adresse === '' || schluessel === '') return 'nicht_pruefbar';

    let antwort: Response;
    try {
      antwort = await abrufen(`${adresse}${pfad}`, {
        method: 'POST',
        // Das Token der Person wird weitergereicht, nicht ausgewertet: Die
        // Datenbank prüft es und liest daraus Konto und Rolle.
        headers: {
          apikey: schluessel,
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(argumente),
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

/** Das Diktat am Termin. */
export function erstelleBerechtigungspruefung(optionen: Optionen): Berechtigungspruefung {
  const frage = erstelleFrage(optionen);
  return (authorization, terminId) =>
    frage(authorization, PFADE.diktat, { p_appointment_id: terminId });
}

/** Die Hilfen ohne Ton, je nach Gegenstand des Zwecks. */
export function erstelleAssistenzpruefung(optionen: Optionen): Assistenzpruefung {
  const frage = erstelleFrage(optionen);
  return (authorization, { art, id }) => {
    switch (art) {
      case 'termin':
        return frage(authorization, PFADE.termin, { p_appointment_id: id });
    }
  };
}
