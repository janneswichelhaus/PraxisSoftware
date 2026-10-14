/**
 * Der Gateway selbst, ohne Laufzeit (KI-EPIC-001, ADR-005, BEF-153).
 *
 * Hier steht der ganze Ablauf - Vorabanfrage, Methode, Sitzung, Formular,
 * Zweck, Eingaben, Berechtigung, Adapter, Antwort, Log -, und nichts davon
 * kennt Deno, ein Secret oder einen Anbieter. Alles, was von außen kommt, ist
 * eine Abhängigkeit im Aufruf; deshalb ist diese Datei vollständig mit
 * Unit-Tests prüfbar (wie `location-provider/handler.ts`).
 *
 * Die Kontrollen aus PROJECT_PRINCIPLES.md 6.1 an einer Stelle:
 *   * Benutzerberechtigung: Sitzung beim Anmeldedienst, dann die Datenbank
 *     mit dem Token der Person (`check_dictation_access`);
 *   * Verarbeitungszweck: nur ein Zweck aus `zwecke.ts`;
 *   * notwendige Daten, Datenminimierung: an den Adapter gehen Audio,
 *     Format, Sprache und die Regeln des Zwecks - Termin, Person und Konto
 *     bleiben hier (die Typen haben dafür kein Feld);
 *   * erlaubtes Modell: nur ein Adapter aus der Liste des Zwecks;
 *   * Logging: nur Fehler, nur Zweck, Anbieterkennung, Klasse und Dauer;
 *   * Fehlerbehandlung: feste Klassen mit festen HTTP-Status.
 *
 * **Diese Function speichert nichts.** Die Aufnahme liegt nur für die
 * Dauer der Anfrage im Arbeitsspeicher; Transkript und Vorschlag gehen als
 * Antwort zurück und werden hier nicht abgelegt - keine Tabelle, keine
 * Ablage, kein Log mit Inhalt, kein Zwischenspeicher (`no-store`).
 */

import type { Berechtigungspruefung } from './berechtigung.ts';
import type { Sitzungspruefung } from './sitzung.ts';
import type {
  Abschnitt,
  Adapterergebnis,
  Antwort,
  Fehlerklasse,
  Protokolleintrag,
  Sprachadapter,
} from './typen.ts';
import { ZWECKE, zweckAus, type Zweck } from './zwecke.ts';

/**
 * Die Kopfzeilen für den Aufruf aus dem Browser - wie beim Kartendienst: `*`
 * ist kein Zugeständnis, der Endpunkt gibt ohne gültige Sitzung nichts heraus
 * und nimmt keine Cookies entgegen. `x-client-info` schickt supabase-js mit.
 */
const CORS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

/** Welcher HTTP-Status zu welcher Fehlerklasse gehört. */
export const STATUS: Readonly<Record<Fehlerklasse, number>> = {
  session_invalid: 401,
  invalid_request: 400,
  forbidden: 403,
  not_configured: 503,
  too_large: 413,
  unavailable: 502,
  timeout: 504,
};

/** Genau diese vier Felder trägt eine Anfrage, jedes genau einmal. */
const FELDER = ['zweck', 'termin', 'audio', 'dauer_s'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Platz für Feldnamen, Grenzen und Kopfzeilen des Formulars neben der Aufnahme. */
const FORMULAR_ZUSCHLAG_BYTES = 64 * 1024;

/** Wie lange ein Adapter höchstens braucht, bevor die Anfrage `timeout` meldet. */
export const FRISTEN = { transkriptionMs: 120_000, strukturierungMs: 60_000 } as const;

/** Höchstlänge eines Transkripts - fünf Minuten Sprache sind weit darunter. */
const HOECHST_ZEICHEN = 50_000;

interface HandlerOptionen {
  /** `null`, wenn kein Anbieter eingerichtet ist - dann `not_configured`. */
  readonly adapter: Sprachadapter | null;
  /** Wurde die Nachbildung in der Produktion abgewiesen? Dann steht es im Log. */
  readonly gateAbgewiesen?: boolean;
  readonly pruefeSitzung: Sitzungspruefung;
  readonly pruefeBerechtigung: Berechtigungspruefung;
  readonly protokolliere: (eintrag: Protokolleintrag) => void;
  /** Für Tests; sonst die Uhr der Laufzeit. */
  readonly jetzt?: () => number;
  /** Für Tests; sonst `FRISTEN`. */
  readonly fristen?: { readonly transkriptionMs: number; readonly strukturierungMs: number };
}

export function erstelleHandler({
  adapter,
  gateAbgewiesen = false,
  pruefeSitzung,
  pruefeBerechtigung,
  protokolliere,
  jetzt = () => Date.now(),
  fristen = FRISTEN,
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (anfrage.method !== 'POST') return fehler('invalid_request', 'nur POST', 405);

    const authorization = anfrage.headers.get('Authorization');
    const sitzung = await pruefeSitzung(authorization);
    if (sitzung.befund === 'abgelehnt') {
      // Ohne Sitzung kein Log: Es gab keinen Anbieteraufruf, und ein Eintrag
      // je abgewiesenem Aufruf wäre ein Zähler über Zugriffe.
      return fehler('session_invalid', 'keine gültige Sitzung');
    }
    if (sitzung.befund === 'nicht_pruefbar') {
      // Ein Betriebsfehler bei uns, der jeden Aufruf trifft (BEF-027).
      protokolliere({
        zweck: 'unbekannt',
        anbieter: 'sitzung',
        code: 'not_configured',
        dauerMs: 0,
      });
      return fehler('not_configured', sitzung.meldung);
    }

    // Erst lesen, was kommt - höchstens so viel, wie eine erlaubte Aufnahme
    // samt Formular braucht. Mehr bleibt ungelesen.
    const formular = await liesFormular(anfrage, hoechstGrenze());
    if (formular === 'zu_gross') return fehler('too_large', 'Anfrage zu groß');
    if (formular === null) return fehler('invalid_request', 'kein lesbares Formular');

    const pruefung = pruefeEingabe(formular);
    if (!pruefung.ok) return fehler(pruefung.code, pruefung.meldung);
    const { zweck, terminId, datei, mime } = pruefung.eingabe;

    // Die Datenbank entscheidet über Rolle, Organisation, Leistungsbereich
    // und Zustand des Termins - mit dem Token der Person (ADR-004).
    const befund = await pruefeBerechtigung(authorization ?? '', terminId);
    if (befund === 'abgelehnt')
      return fehler('session_invalid', 'Sitzung von der Datenbank abgelehnt');
    if (befund === 'verweigert') return fehler('forbidden', 'kein Diktat zu diesem Termin');
    if (befund === 'nicht_pruefbar') {
      protokolliere({
        zweck: zweck.kennung,
        anbieter: 'berechtigung',
        code: 'unavailable',
        dauerMs: 0,
      });
      return fehler('unavailable', 'Berechtigung nicht prüfbar');
    }

    if (adapter === null) {
      // Die Nachbildung in der Produktion: abgewiesen, und das steht im Log.
      if (gateAbgewiesen) {
        protokolliere({
          zweck: zweck.kennung,
          anbieter: 'gate',
          code: 'gate_rejected',
          dauerMs: 0,
        });
      }
      return fehler('not_configured', 'kein Anbieter eingerichtet');
    }
    if (!zweck.adapter.includes(adapter.id)) {
      // Ein Adapter, den der Zweck nicht nennt, bedient ihn nicht (6.1).
      protokolliere({
        zweck: zweck.kennung,
        anbieter: adapter.id,
        code: 'not_configured',
        dauerMs: 0,
      });
      return fehler('not_configured', 'Anbieter für diesen Zweck nicht freigegeben');
    }

    const beginn = jetzt();
    const scheitert = (code: 'unavailable' | 'timeout', meldung: string) => {
      protokolliere({
        zweck: zweck.kennung,
        anbieter: adapter.id,
        code,
        dauerMs: jetzt() - beginn,
      });
      return fehler(code, meldung);
    };

    // An den Adapter: nur Audio, Format und Sprache.
    const audio = new Uint8Array(await datei.arrayBuffer());
    const transkription = await mitFrist(
      (signal) => adapter.transkribiere({ audio, mime, sprache: zweck.eingabe.sprache }, signal),
      fristen.transkriptionMs,
    );
    if (!transkription.ok)
      return scheitert(transkription.error.code, 'Spracherkennung fehlgeschlagen');
    const transkript = transkription.value.transkript;
    if (typeof transkript !== 'string' || transkript.length > HOECHST_ZEICHEN) {
      return scheitert('unavailable', 'Transkript unbrauchbar');
    }

    // Nichts verstanden ist kein Fehler, aber auch nichts zum Einordnen.
    if (transkript.trim() === '') {
      return antwort({ ok: true, transkript: '', abschnitte: [], quelle: adapter.quelle }, 200);
    }

    // An den Adapter: der Text, die Sprache und die Regeln des Zwecks.
    const einordnung = await mitFrist(
      (signal) =>
        adapter.strukturiere(
          {
            transkript,
            sprache: zweck.eingabe.sprache,
            regeln: zweck.regeln,
            abschnitte: zweck.ausgabe.abschnitte,
          },
          signal,
        ),
      fristen.strukturierungMs,
    );
    if (!einordnung.ok) return scheitert(einordnung.error.code, 'Einordnung fehlgeschlagen');
    const abschnitte = inVorlage(einordnung.value.abschnitte, zweck);
    if (abschnitte === null) return scheitert('unavailable', 'Einordnung unbrauchbar');

    return antwort({ ok: true, transkript, abschnitte, quelle: adapter.quelle }, 200);
  };
}

/** Die größte erlaubte Anfrage: die größte Aufnahme aller Zwecke und das Formular darum. */
function hoechstGrenze(): number {
  const groesste = Math.max(...Object.values(ZWECKE).map((zweck) => zweck.eingabe.hoechstBytes));
  return groesste + FORMULAR_ZUSCHLAG_BYTES;
}

/** Was eine Datei im Formular mindestens kann - unabhängig von der Laufzeit. */
interface Datei {
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

function istDatei(wert: unknown): wert is Datei {
  if (typeof wert !== 'object' || wert === null) return false;
  const datei = wert as Partial<Datei>;
  return (
    typeof datei.arrayBuffer === 'function' &&
    typeof datei.size === 'number' &&
    typeof datei.type === 'string'
  );
}

interface Eingabe {
  readonly zweck: Zweck;
  readonly terminId: string;
  readonly datei: Datei;
  /** Grundformat ohne Parameter. */
  readonly mime: string;
  readonly dauerS: number;
}

type Eingabepruefung =
  | { readonly ok: true; readonly eingabe: Eingabe }
  | {
      readonly ok: false;
      readonly code: 'invalid_request' | 'too_large';
      readonly meldung: string;
    };

/**
 * Die Anfrage - oder warum sie nicht taugt. Geprüft wird vollständig und vor
 * dem ersten Kontakt zur Datenbank und zum Adapter.
 */
function pruefeEingabe(formular: FormData): Eingabepruefung {
  const ungueltig = (meldung: string): Eingabepruefung => ({
    ok: false,
    code: 'invalid_request',
    meldung,
  });

  // Nur die vier Felder: Ein zusätzliches - etwa ein Name - wird nicht still
  // übergangen, sondern abgewiesen.
  let anzahl = 0;
  formular.forEach(() => {
    anzahl += 1;
  });
  if (anzahl !== FELDER.length || FELDER.some((feld) => formular.getAll(feld).length !== 1)) {
    return ungueltig('Formular unvollständig');
  }

  const zweck = zweckAus(formular.get('zweck'));
  if (zweck === null) return ungueltig('unbekannter Zweck');

  const termin = formular.get('termin');
  if (typeof termin !== 'string' || !UUID.test(termin)) return ungueltig('Termin fehlt');

  const datei = formular.get('audio');
  if (!istDatei(datei)) return ungueltig('Aufnahme fehlt');
  const mime = (datei.type.split(';')[0] ?? '').trim().toLowerCase();
  if (!zweck.eingabe.formate.includes(mime)) return ungueltig('Format nicht erlaubt');
  if (datei.size === 0) return ungueltig('Aufnahme leer');
  if (datei.size > zweck.eingabe.hoechstBytes) {
    return { ok: false, code: 'too_large', meldung: 'Aufnahme zu groß' };
  }

  const dauer = formular.get('dauer_s');
  const dauerS =
    // Ziffern und höchstens ein Punkt; `Number` weist „1.2.3" selbst ab.
    typeof dauer === 'string' && /^[0-9.]{1,9}$/.test(dauer.trim())
      ? Number(dauer.trim())
      : Number.NaN;
  if (!Number.isFinite(dauerS) || dauerS <= 0) return ungueltig('Dauer fehlt');
  if (dauerS > zweck.eingabe.hoechstDauerS) {
    return { ok: false, code: 'too_large', meldung: 'Aufnahme zu lang' };
  }

  return { ok: true, eingabe: { zweck, terminId: termin, datei, mime, dauerS } };
}

/**
 * Das Formular der Anfrage - `zu_gross`, sobald mehr als `grenze` Bytes
 * kommen, `null`, wenn es keines ist. Gelesen wird stückweise und nicht über
 * die Grenze hinaus: Eine zu große Anfrage landet nie ganz im Speicher.
 */
async function liesFormular(
  anfrage: Request,
  grenze: number,
): Promise<FormData | 'zu_gross' | null> {
  const typ = anfrage.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(typ)) return null;
  const angegeben = Number(anfrage.headers.get('Content-Length') ?? Number.NaN);
  if (Number.isFinite(angegeben) && angegeben > grenze) return 'zu_gross';
  if (anfrage.body === null) return null;

  const leser = anfrage.body.getReader();
  const teile: Uint8Array[] = [];
  let summe = 0;
  try {
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      summe += value.byteLength;
      if (summe > grenze) {
        await leser.cancel().catch(() => undefined);
        return 'zu_gross';
      }
      teile.push(value);
    }
  } catch {
    return null;
  }

  const koerper = new Uint8Array(summe);
  let stelle = 0;
  for (const teil of teile) {
    koerper.set(teil, stelle);
    stelle += teil.byteLength;
  }
  try {
    return await new Response(koerper, { headers: { 'Content-Type': typ } }).formData();
  } catch {
    return null;
  }
}

/**
 * Ein Adapteraufruf mit Frist. Läuft sie ab, wird der Aufruf abgebrochen und
 * die Anfrage meldet `timeout`; wirft der Adapter, gilt er als `unavailable`.
 */
async function mitFrist<T>(
  aufruf: (signal: AbortSignal) => Promise<Adapterergebnis<T>>,
  ms: number,
): Promise<Adapterergebnis<T>> {
  const steuerung = new AbortController();
  let uhr: ReturnType<typeof setTimeout> | undefined;
  const frist = new Promise<Adapterergebnis<T>>((fertig) => {
    uhr = setTimeout(() => {
      steuerung.abort();
      fertig({ ok: false, error: { code: 'timeout', message: 'Frist abgelaufen' } });
    }, ms);
  });
  const ergebnis = aufruf(steuerung.signal).catch((): Adapterergebnis<T> => ({
    ok: false,
    error: { code: 'unavailable', message: 'Adapter fehlgeschlagen' },
  }));
  try {
    return await Promise.race([ergebnis, frist]);
  } finally {
    clearTimeout(uhr);
  }
}

/**
 * Die Abschnitte in der Reihenfolge der Vorlage, leere weggelassen - oder
 * `null`, wenn der Adapter etwas liefert, das die Vorlage nicht kennt. Ein
 * erfundener Abschnitt wäre eine Ergänzung (6.3), ein doppelter eine
 * stille Umstellung; beides geht nicht an die Oberfläche.
 */
function inVorlage(abschnitte: unknown, zweck: Zweck): Abschnitt[] | null {
  // Was ein Adapter liefert, ist eine Behauptung, bis es geprüft ist.
  if (!Array.isArray(abschnitte)) return null;
  const vorlage = zweck.ausgabe.abschnitte;
  const texte = new Map<string, string>();
  for (const abschnitt of abschnitte as unknown[]) {
    if (typeof abschnitt !== 'object' || abschnitt === null) return null;
    const { titel, text } = abschnitt as Record<string, unknown>;
    if (typeof titel !== 'string' || typeof text !== 'string') return null;
    if (!vorlage.includes(titel) || texte.has(titel)) return null;
    if (text.length > HOECHST_ZEICHEN) return null;
    texte.set(titel, text.trim());
  }
  return vorlage
    .filter((titel) => (texte.get(titel) ?? '') !== '')
    .map((titel) => ({ titel, text: texte.get(titel)! }));
}

function fehler(code: Fehlerklasse, meldung: string, status = STATUS[code]): Response {
  return antwort({ ok: false, error: { code, message: `ai-gateway: ${meldung}` } }, status);
}

function antwort(koerper: Antwort, status: number): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      // Transkript und Vorschlag sind ein Ergebnis des Augenblicks und werden
      // nirgends abgelegt - auch nicht in einem Zwischenspeicher.
      'Cache-Control': 'no-store',
    },
  });
}
