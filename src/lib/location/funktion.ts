/**
 * Der Weg vom Browser zur eigenen Edge Function (MAP-003b, MAP-004a).
 *
 * Der Browser spricht **nur** mit der eigenen Anwendung: Berechnet wird
 * serverseitig, damit der Serverschlüssel und die Browser-Metadaten der Person
 * nicht beim Anbieter landen (ADR-019 Punkt 15). Der einzige direkte Kontakt
 * des Browsers zum Kartendienst bleiben die Kacheln.
 *
 * **Nichts wird abgelegt.** Ergebnisse leben im Zwischenspeicher der Abfrage,
 * so lange die Seite offen ist, und sind danach fort: kein `localStorage`,
 * keine Tabelle, keine Spalte (ADR-019 Punkt 16, §18, §20). Auch der Server
 * antwortet mit `Cache-Control: no-store`.
 *
 * Diese Datei trägt, was Route und Matrix teilen: den Aufruf, die Einordnung
 * jeder Antwort in eine Fehlerklasse und die Regel aus **BEF-027**, wer über
 * den Kartendienst sprechen darf. Sie steht einmal hier, weil sie zweimal
 * gebraucht wird — und eine Korrektur an zwei Stellen wäre eine Korrektur an
 * einer.
 */

import { getSupabase } from '@/lib/supabase';
import type { LocationError } from './contract';

/** Name der Edge Function. Steht einmal hier und einmal im Verzeichnisnamen. */
const FUNCTION = 'location-provider';

/**
 * Welche Aufgabe gefragt ist (Route, Matrix, seit MAP-006a das Geocoding).
 *
 * Sie geht als eigenes Feld hinaus und wird von der Function nicht aus der
 * Form der Anfrage geraten (`handler.ts`). Ein Verb, keine Angabe über eine
 * Person: Was hinausgeht, bleiben Koordinaten und ein Fahrprofil.
 */
export type Aufgabe = 'route' | 'matrix' | 'geocode';

/**
 * Woher die Antwort stammt.
 *
 * Die Oberfläche muss es sagen können: Eine Nachbildung ohne Anbieter sieht
 * auf der Karte aus wie eine Route. Welcher Anbieter es war, erfährt der
 * Fachcode bewusst nicht (ADR-019 Punkt 1).
 */
export type Quelle = 'anbieter' | 'nachbildung';

/** Wie im Vertrag: kein Werfen, der Fehlerpfad steht im Typ. */
export type Funktionsergebnis<T> =
  | { readonly ok: true; readonly value: T; readonly quelle: Quelle }
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
export async function rufeFunktionAuf<T>(
  aufgabe: Aufgabe,
  koerper: Readonly<Record<string, unknown>>,
  istWert: (wert: unknown) => wert is T,
  signal?: AbortSignal,
): Promise<Funktionsergebnis<T>> {
  // Ausdrücklich umtypisiert: `error` ist in der Bibliothek `any`, und ein
  // `any` aus einer Fremdschnittstelle soll hier nicht weiterlaufen.
  const { data, error, response } = (await getSupabase().functions.invoke<unknown>(FUNCTION, {
    body: { aufgabe, ...koerper },
    ...(signal === undefined ? {} : { signal }),
  })) as { data: unknown; error: unknown; response?: Response };

  if (error !== null) {
    // Die Meldung der Bibliothek wird nicht gelesen: Sie trägt die Adresse
    // der Anfrage. Was zählt, steht im Körper der Antwort - und wenn es
    // keinen gibt, kam die Function gar nicht zu Wort.
    if (response === undefined) {
      return stoerung(aufgabe, 'function_unavailable', 'keine Antwort der Function');
    }
    return uebersetze(aufgabe, await gelesen(response), response.status, istWert);
  }

  return uebersetze(aufgabe, data, 200, istWert);
}

async function gelesen(antwort: Response): Promise<unknown> {
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
 * und kein halbes Ergebnis: Eine Linie ohne Distanz sähe auf der Karte richtig
 * aus, eine Matrix ohne Fahrzeiten in der Tabelle auch. Und sie ist **kein**
 * Fehler des Kartendienstes — wer nicht in unserem Format antwortet, ist nicht
 * unsere Function (BEF-027).
 */
function uebersetze<T>(
  aufgabe: Aufgabe,
  wert: unknown,
  status: number,
  istWert: (wert: unknown) => wert is T,
): Funktionsergebnis<T> {
  if (typeof wert !== 'object' || wert === null) {
    return fremd(aufgabe, status, 'Antwort ohne Objekt');
  }
  const daten = wert as Record<string, unknown>;

  if (daten['ok'] === false) {
    const fehler = daten['error'];
    const code = (fehler as LocationError | undefined)?.code;
    return code === undefined
      ? fremd(aufgabe, status, 'Antwort ohne Fehlerklasse')
      : { ok: false, error: { code, message: String((fehler as LocationError).message) } };
  }

  const inhalt = daten['value'];
  if (!istWert(inhalt)) return fremd(aufgabe, status, 'Antwort ohne verwertbares Ergebnis');

  return {
    ok: true,
    value: inhalt,
    quelle: daten['quelle'] === 'nachbildung' ? 'nachbildung' : 'anbieter',
  };
}

/**
 * Eine Antwort, die nicht aus dieser Function stammt — eingeordnet nach dem,
 * was der Status darüber sagt, **wer** sie geschickt hat.
 *
 * 401 und 403 kommen von der Plattform vor unserem Code: Der Token fehlte
 * oder galt nicht. Alles andere heißt: Die Function war nicht zu erreichen.
 * Über den Kartendienst sagt keiner der beiden Fälle etwas.
 */
function fremd<T>(aufgabe: Aufgabe, status: number, meldung: string): Funktionsergebnis<T> {
  const code = status === 401 || status === 403 ? 'session_invalid' : 'function_unavailable';
  return stoerung(aufgabe, code, `${meldung} (HTTP ${status})`);
}

function stoerung<T>(
  aufgabe: Aufgabe,
  code: LocationError['code'],
  meldung: string,
): Funktionsergebnis<T> {
  return { ok: false, error: { code, message: `${aufgabe}: ${meldung}` } };
}
