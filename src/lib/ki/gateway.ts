import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Der eine Weg der Oberfläche zum AI Gateway (KI-EPIC-001, ADR-005 Punkte 3
 * und 4, PROJECT_PRINCIPLES.md 6.1).
 *
 * Jeder KI-Aufruf der Anwendung geht durch diese Datei und von hier an die
 * eigene Edge Function `ai-gateway` - nie an einen Anbieter. Welcher Anbieter
 * hinter dem Gateway steht, erfährt der Fachcode nicht; er bekommt einen
 * Vorschlag, die Quelle (`nachbildung` oder `anbieter`) und, wenn etwas
 * schiefgeht, eine Fehlerklasse mit einem Satz für die Oberfläche.
 * `gateway.test.ts` hält fest, dass keine andere Datei die Function aufruft.
 *
 * **Nichts wird abgelegt.** Die Aufnahme geht als Teil der Anfrage hinaus und
 * ist danach nur noch im Speicher der Seite, bis sie verworfen wird; Antwort
 * und Vorschlag leben im Zustand der Schreibseite
 * (`features/documentation/diktat.ts`).
 */

const FUNKTION = 'ai-gateway';

/** Der Zweck des Diktats in der Zweckliste des Gateways (`zwecke.ts`). */
export const ZWECK_DIKTAT = 'dokumentation.diktat';

/**
 * Die Function samt Zweck: Der Zweck steht in der Adresse, damit der Gateway
 * Zweck und Anbieter prüft, bevor er ein Byte der Aufnahme liest.
 */
const ADRESSE_DIKTAT = `${FUNKTION}?zweck=${encodeURIComponent(ZWECK_DIKTAT)}`;

/**
 * ANN-522: Die Abschnitte der Dokumentationsvorlage, in die ein Diktat
 * eingeordnet wird - Angaben der Patient:in getrennt vom eigenen Befund (6.3).
 * Was nicht vorkommt, liefert der Gateway nicht; ein anderer Titel ist eine
 * unbrauchbare Antwort. Die Kopie im Gateway hängt über `vertrag.test.ts` daran.
 */
export const DIKTAT_ABSCHNITTE = [
  'Angaben der Patient:in',
  'Befund',
  'Behandlung',
  'Plan',
] as const;

export type Diktatabschnittstitel = (typeof DIKTAT_ABSCHNITTE)[number];

/**
 * ANN-523: Eine Aufnahme dauert höchstens fünf Minuten und ist höchstens 5 MiB groß; der
 * Browser hält an beiden Grenzen selbst an (`lib/aufnahme.ts`). Der Gateway prüft gemeldete Dauer
 * und Größe, die Tonlänge misst er nicht: Mit 64 kbit/s passen knapp elf Minuten in 5 MiB.
 */
export const DIKTAT_HOECHSTDAUER_S = 300;
export const DIKTAT_HOECHSTBYTES = 5 * 1024 * 1024;

/** Die Fehlerklassen des Gateways - deckungsgleich mit `ai-gateway/typen.ts`. */
export const GATEWAY_FEHLERKLASSEN = [
  'session_invalid',
  'invalid_request',
  'forbidden',
  'not_configured',
  'too_large',
  'unavailable',
  'timeout',
] as const;

/**
 * Dazu eine Klasse, die nur der Browser vergibt: Die Function hat gar nicht
 * geantwortet (wie `function_unavailable` beim Kartendienst, BEF-027).
 */
export type Kifehler = (typeof GATEWAY_FEHLERKLASSEN)[number] | 'function_unavailable';

/** Die Sätze der Oberfläche je Fehlerklasse - ohne technische Einzelheiten (13). */
export const KI_FEHLERTEXTE: Readonly<Record<Kifehler, string>> = {
  session_invalid: 'Die Anmeldung gilt nicht mehr. Bitte neu anmelden und noch einmal sprechen.',
  invalid_request: 'Die Aufnahme ließ sich nicht verarbeiten. Bitte noch einmal sprechen.',
  forbidden: 'Zu diesem Termin ist kein Diktat möglich.',
  // ANN-524: Ohne eingerichteten Anbieter antwortet der Gateway „nicht
  // eingerichtet" - nie stillschweigend die Nachbildung, und in der
  // Produktion ist die Nachbildung ausgeschlossen (`ai-gateway/auswahl.ts`).
  not_configured: 'Die Spracheingabe ist hier nicht eingerichtet.',
  too_large: `Die Aufnahme ist zu lang – höchstens ${DIKTAT_HOECHSTDAUER_S / 60} Minuten am Stück.`,
  unavailable: 'Die Aufbereitung ist gerade nicht erreichbar.',
  timeout: 'Die Aufbereitung hat zu lange gedauert.',
  function_unavailable: 'Die Spracheingabe ist gerade nicht erreichbar.',
};

/**
 * Nach diesen Fehlern lohnt ein zweiter Versuch mit derselben Aufnahme: Das
 * Netz oder der Dienst war kurz weg. Bei allen anderen ändert ein zweiter
 * Versuch nichts.
 */
const ERNEUT_MOEGLICH: ReadonlySet<Kifehler> = new Set([
  'unavailable',
  'timeout',
  'function_unavailable',
]);

/**
 * Wie lange der Browser auf die Antwort wartet: länger als die Fristen des
 * Gateways zusammen (120 s Erkennung, 60 s Einordnung), damit dessen eigene
 * Meldung gewinnt.
 */
const ANTWORT_FRIST_MS = 190_000;

const abschnittSchema = z.object({
  titel: z.enum(DIKTAT_ABSCHNITTE),
  text: z.string().max(50_000),
});

const erfolgSchema = z
  .object({
    ok: z.literal(true),
    transkript: z.string().max(50_000),
    abschnitte: z.array(abschnittSchema).max(DIKTAT_ABSCHNITTE.length),
    quelle: z.enum(['anbieter', 'nachbildung']),
  })
  // Verstanden, aber nichts eingeordnet, wäre eine Auslassung (6.3) - der
  // Gateway liefert das nicht, und hier gilt es als unbrauchbare Antwort.
  .refine(
    (antwort) => antwort.transkript.trim() === '' || antwort.abschnitte.length > 0,
    'Transkript ohne Abschnitt',
  );

const statusSchema = z.object({ ok: z.literal(true), verfuegbar: z.boolean() });

const fehlerSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.enum(GATEWAY_FEHLERKLASSEN), message: z.string() }),
});

/** Transkript, eingeordnete Abschnitte und Quelle - ohne das `ok` der Antwort. */
export type Diktatvorschlag = Omit<z.infer<typeof erfolgSchema>, 'ok'>;

export type Diktatergebnis =
  | { readonly ok: true; readonly vorschlag: Diktatvorschlag }
  | {
      readonly ok: false;
      readonly fehler: Kifehler;
      readonly meldung: string;
      /** Lohnt ein zweiter Versuch mit derselben Aufnahme? */
      readonly erneutMoeglich: boolean;
    };

function gescheitert(fehler: Kifehler): Diktatergebnis {
  return {
    ok: false,
    fehler,
    meldung: KI_FEHLERTEXTE[fehler],
    erneutMoeglich: ERNEUT_MOEGLICH.has(fehler),
  };
}

/** Die Dateiendung zum Format - nur für den Dateinamen im Formular. */
function endung(mime: string): string {
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Bietet der Gateway das Diktat hier an? Die Schreibseite fragt, bevor sie
 * „Sprechen“ zeigt - wie die Karte, bevor sie Kacheln lädt (ADR-019 Punkt
 * 35). `true` nur bei ausdrücklichem Ja; ein Fehler, eine fehlende Function
 * oder eine Antwort in fremder Form heißen nein. Wirft nicht.
 */
export async function diktatVerfuegbar(signal?: AbortSignal): Promise<boolean> {
  try {
    const { data, error } = (await getSupabase().functions.invoke<unknown>(ADRESSE_DIKTAT, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    })) as { data: unknown; error: unknown };
    if (error !== null) return false;
    const status = statusSchema.safeParse(data);
    return status.success && status.data.verfuegbar;
  } catch {
    return false;
  }
}

/**
 * Ein Diktat aufbereiten: die Aufnahme an den Gateway, zurück kommen das
 * Transkript und der in die Vorlage eingeordnete Vorschlag.
 *
 * Hinaus gehen der Zweck in der Adresse und genau drei Felder: Termin,
 * Aufnahme, Dauer. Der Termin ist die Zuordnung (6.3) und die Grundlage der
 * Berechtigung am Server; er bleibt im Gateway und erreicht keinen Anbieter.
 *
 * Wirft nicht: Alles, was schiefgehen kann, endet in einer Fehlerklasse.
 */
export async function diktatAufbereiten({
  terminId,
  audio,
  dauerS,
  signal,
}: {
  terminId: string;
  audio: Blob;
  dauerS: number;
  signal?: AbortSignal | undefined;
}): Promise<Diktatergebnis> {
  if (audio.size === 0) return gescheitert('invalid_request');
  if (audio.size > DIKTAT_HOECHSTBYTES) return gescheitert('too_large');

  const formular = new FormData();
  formular.append('termin', terminId);
  formular.append(
    'dauer_s',
    String(Math.min(Math.max(1, Math.round(dauerS)), DIKTAT_HOECHSTDAUER_S)),
  );
  formular.append('audio', audio, `aufnahme.${endung(audio.type)}`);

  // Eine eigene Frist statt der der Bibliothek: Nur so lässt sich eine
  // abgelaufene Frist von einem Netzfehler unterscheiden.
  const steuerung = new AbortController();
  let abgelaufen = false;
  const uhr = setTimeout(() => {
    abgelaufen = true;
    steuerung.abort();
  }, ANTWORT_FRIST_MS);
  const weiterreichen = () => steuerung.abort();
  signal?.addEventListener('abort', weiterreichen);

  try {
    // Ausdrücklich umtypisiert: `error` ist in der Bibliothek `any`.
    const { data, error, response } = (await getSupabase().functions.invoke<unknown>(
      ADRESSE_DIKTAT,
      {
        body: formular,
        signal: steuerung.signal,
      },
    )) as { data: unknown; error: unknown; response?: Response };

    if (error !== null) {
      if (abgelaufen) return gescheitert('timeout');
      // Die Meldung der Bibliothek wird nicht gelesen: Sie trägt die Adresse.
      if (response === undefined) return gescheitert('function_unavailable');
      return deute(await gelesen(response), response.status);
    }
    return deute(data, 200);
  } catch {
    return gescheitert(abgelaufen ? 'timeout' : 'function_unavailable');
  } finally {
    clearTimeout(uhr);
    signal?.removeEventListener('abort', weiterreichen);
  }
}

async function gelesen(antwort: Response): Promise<unknown> {
  try {
    return await antwort.json();
  } catch {
    return null;
  }
}

/**
 * Die Antwort im Typ dieser Anwendung. Nur eine Antwort im Format des
 * Gateways darf über die Aufbereitung sprechen; alles andere wird nach dem
 * HTTP-Status eingeordnet - 401 und 403 kommen dann von der Plattform vor der
 * Function (Token fehlt oder gilt nicht), sonst kam die Function nicht zu Wort.
 */
function deute(wert: unknown, status: number): Diktatergebnis {
  const erfolg = erfolgSchema.safeParse(wert);
  if (erfolg.success) {
    const { transkript, abschnitte, quelle } = erfolg.data;
    return { ok: true, vorschlag: { transkript, abschnitte, quelle } };
  }
  const abgelehnt = fehlerSchema.safeParse(wert);
  if (abgelehnt.success) return gescheitert(abgelehnt.data.error.code);
  return gescheitert(status === 401 || status === 403 ? 'session_invalid' : 'function_unavailable');
}

/**
 * Der Vorschlag als Text für das Feld: je Abschnitt der Titel in einer Zeile,
 * darunter der Text, dazwischen eine Leerzeile - dieselbe Form wie der Befund
 * aus Bausteinen (ANN-130). Leere Abschnitte entfallen.
 */
export function vorschlagAlsText(vorschlag: Pick<Diktatvorschlag, 'abschnitte'>): string {
  return vorschlag.abschnitte
    .filter((abschnitt) => abschnitt.text.trim() !== '')
    .map((abschnitt) => `${abschnitt.titel}\n${abschnitt.text.trim()}`)
    .join('\n\n');
}

/** Die Kennzeichnung einer unverständlichen Stelle (6.3). */
export const UNVERSTAENDLICH = '[unverständlich]';

/** Wie viele Stellen im Text als unverständlich gekennzeichnet sind. */
export function unverstaendlicheStellen(text: string): number {
  return text.split(UNVERSTAENDLICH).length - 1;
}
