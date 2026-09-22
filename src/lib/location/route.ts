/**
 * Die Route aus der eigenen Function — der Client-Teil von MAP-003.
 *
 * Der Browser spricht **nur** mit der eigenen Anwendung: Die Berechnung läuft
 * serverseitig, damit der Serverschlüssel und die Browser-Metadaten der Person
 * nicht beim Anbieter landen (ADR-019 Punkt 15). Der einzige direkte Kontakt
 * des Browsers zum Kartendienst bleiben die Kacheln.
 *
 * **Nichts wird abgelegt.** Das Ergebnis lebt im Zwischenspeicher der Abfrage,
 * so lange die Seite offen ist, und ist danach fort: kein `localStorage`,
 * keine Tabelle, keine Spalte (ADR-019 Punkt 16, §18, §20). Auch der Server
 * antwortet mit `Cache-Control: no-store`.
 *
 * Diese Datei liegt in `src/lib/location/` und nicht im Kartenprototyp: Ein
 * Vorschaubereich spricht nicht selbst mit einem Server
 * (`src/features/preview/trennung.test.ts`). Sie ist dort namentlich für den
 * Prototyp freigegeben — und nur für ihn.
 */

import { useQuery } from '@tanstack/react-query';
import { getSupabase } from '@/lib/supabase';
import type { Coordinate, LocationError, RouteResult, TravelProfile } from './contract';

/** Name der Edge Function. Steht einmal hier und einmal im Verzeichnisnamen. */
const FUNCTION = 'location-provider';

/**
 * Woher die angezeigte Route stammt.
 *
 * Die Oberfläche muss es sagen können: Eine Nachbildung ohne Anbieter sieht
 * auf der Karte aus wie eine Route. Welcher Anbieter es war, erfährt der
 * Fachcode bewusst nicht (ADR-019 Punkt 1).
 */
export type Routenquelle = 'anbieter' | 'nachbildung';

export interface Routenantwort {
  readonly route: RouteResult;
  readonly quelle: Routenquelle;
}

/** Wie im Vertrag: kein Werfen, der Fehlerpfad steht im Typ. */
export type Routenergebnis =
  | { readonly ok: true; readonly value: Routenantwort }
  | { readonly ok: false; readonly error: LocationError };

/**
 * Ein Aufruf der Function — und die Übersetzung ihrer Antwort.
 *
 * Alles, was schiefgehen kann, endet in einer Fehlerklasse: Ein Netzfehler
 * ist eine Klasse, eine Antwort in unerwarteter Form auch. Eine Ausnahme
 * verlässt diese Funktion nicht, damit die Oberfläche keinen Fall kennt, den
 * sie nicht anzeigt.
 *
 * **Wer geantwortet hat, entscheidet die Klasse** (BEF-027): Nur eine Antwort
 * im Format dieser Function darf über den Kartendienst sprechen. Alles andere
 * — ein Gateway, eine nicht laufende Laufzeit, ein Plattformfehler — wird nach
 * dem HTTP-Status eingeordnet und nie dem Anbieter angelastet.
 */
export async function fordereRouteAn(
  waypoints: readonly Coordinate[],
  profile: TravelProfile,
  signal?: AbortSignal,
): Promise<Routenergebnis> {
  // Ausdrücklich umtypisiert: `error` ist in der Bibliothek `any`, und ein
  // `any` aus einer Fremdschnittstelle soll hier nicht weiterlaufen.
  const { data, error, response } = (await getSupabase().functions.invoke<unknown>(FUNCTION, {
    body: { waypoints, profile },
    ...(signal === undefined ? {} : { signal }),
  })) as { data: unknown; error: unknown; response?: Response };

  if (error !== null) {
    // Die Meldung der Bibliothek wird nicht gelesen: Sie trägt die Adresse
    // der Anfrage. Was zählt, steht im Körper der Antwort - und wenn es
    // keinen gibt, kam die Function gar nicht zu Wort.
    if (response === undefined) {
      return stoerung('function_unavailable', 'keine Antwort der Function');
    }
    return uebersetze(await koerper(response), response.status);
  }

  return uebersetze(data, 200);
}

/**
 * Die Route zu einer Folge von Stopps (MAP-003b).
 *
 * `staleTime: Infinity` hält das Ergebnis für die Sitzung: Dieselben Stopps
 * ergeben dieselbe Route, und jeder erneute Abruf kostet Geld beim Anbieter.
 * `gcTime` ist kurz, damit nichts länger im Speicher steht als nötig — wer
 * die Seite verlässt, lässt nichts zurück.
 */
export function useRoute(
  waypoints: readonly Coordinate[],
  profile: TravelProfile,
  { aktiv = true }: { aktiv?: boolean } = {},
) {
  return useQuery({
    queryKey: ['route', profile, waypoints],
    queryFn: ({ signal }) => fordereRouteAn(waypoints, profile, signal),
    enabled: aktiv && waypoints.length >= 2,
    staleTime: Infinity,
    gcTime: 30_000,
    retry: false,
  });
}

async function koerper(antwort: Response): Promise<unknown> {
  try {
    return await antwort.json();
  } catch {
    return null;
  }
}

/**
 * Die Antwort der Function im Typ dieser Anwendung.
 *
 * Gelesen wird Feld für Feld. Eine Antwort, die nicht passt, ist ein Fehler
 * und keine halbe Route: Eine Linie ohne Distanz sähe auf der Karte richtig
 * aus. Und sie ist **kein** Fehler des Kartendienstes — wer nicht in unserem
 * Format antwortet, ist nicht unsere Function (BEF-027).
 */
function uebersetze(wert: unknown, status: number): Routenergebnis {
  if (typeof wert !== 'object' || wert === null) {
    return fremd(status, 'Antwort ohne Objekt');
  }
  const daten = wert as Record<string, unknown>;

  if (daten['ok'] === false) {
    const fehler = daten['error'];
    const code = (fehler as LocationError | undefined)?.code;
    return code === undefined
      ? fremd(status, 'Antwort ohne Fehlerklasse')
      : { ok: false, error: { code, message: String((fehler as LocationError).message) } };
  }

  const route = daten['value'];
  if (!istRoute(route)) return fremd(status, 'Antwort ohne Route');
  const quelle = daten['quelle'];

  return {
    ok: true,
    value: { route, quelle: quelle === 'nachbildung' ? 'nachbildung' : 'anbieter' },
  };
}

function istRoute(wert: unknown): wert is RouteResult {
  if (typeof wert !== 'object' || wert === null) return false;
  const daten = wert as Record<string, unknown>;
  return (
    typeof daten['distanceMeters'] === 'number' &&
    typeof daten['durationSeconds'] === 'number' &&
    Array.isArray(daten['legs']) &&
    Array.isArray(daten['geometry'])
  );
}

/**
 * Eine Antwort, die nicht aus dieser Function stammt — eingeordnet nach dem,
 * was der Status darüber sagt, **wer** sie geschickt hat.
 *
 * 401 und 403 kommen von der Plattform vor unserem Code: Der Token fehlte
 * oder galt nicht. Alles andere heißt: Die Function war nicht zu erreichen.
 * Über den Kartendienst sagt keiner der beiden Fälle etwas.
 */
function fremd(status: number, meldung: string): Routenergebnis {
  const code = status === 401 || status === 403 ? 'session_invalid' : 'function_unavailable';
  return stoerung(code, `${meldung} (HTTP ${status})`);
}

function stoerung(code: LocationError['code'], meldung: string): Routenergebnis {
  return { ok: false, error: { code, message: `route: ${meldung}` } };
}
