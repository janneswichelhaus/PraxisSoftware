// Der Gateway selbst, ohne Laufzeit (ADR-005, PROJECT_PRINCIPLES.md 6.1): Sitzung, Zweck aus der
// Adresse, Anbieter und Berechtigung stehen fest, bevor die Eingabe gelesen wird. `GET` fragt, ob
// der Zweck bedient wird; `POST` ist das Diktat oder eine Hilfe ohne Ton. Gespeichert wird nichts.

import { assistiere } from './assistenz.ts';
import type { Assistenzpruefung, Berechtigungspruefung } from './berechtigung.ts';
import {
  CORS,
  FORMULAR_ZUSCHLAG_BYTES,
  UUID,
  antwort,
  fehler,
  grundformat,
  istDatei,
  liesFormular,
  mitFrist,
  type Datei,
} from './http.ts';
import { saetze, setzeZusammen } from './inhaltstreue.ts';
import type { Sitzungspruefung } from './sitzung.ts';
import type { Assistenzadapter, Protokolleintrag, Sprachadapter } from './typen.ts';
import { zweckAus, type Diktatzweck, type Zweck } from './zwecke.ts';

export { STATUS } from './http.ts';

/** Genau diese drei Felder trägt ein Diktat, jedes genau einmal; der Zweck steht in der Adresse. */
const FELDER = ['termin', 'audio', 'dauer_s'] as const;

/** Wie lange ein Adapter höchstens braucht, bevor die Anfrage `timeout` meldet. */
export const FRISTEN = { transkriptionMs: 120_000, strukturierungMs: 60_000 } as const;

/** Höchstlänge eines Transkripts - fünf Minuten Sprache sind weit darunter. */
const HOECHST_ZEICHEN = 50_000;

interface HandlerOptionen {
  /** `null`, wenn kein Anbieter eingerichtet ist - dann `not_configured`. */
  readonly adapter: Sprachadapter | null;
  /** Der Anbieter der Hilfen ohne Ton; ohne ihn bedient der Gateway nur das Diktat. */
  readonly assistenz?: Assistenzadapter | null;
  /** Wurde die Nachbildung in der Produktion abgewiesen? Dann meldet der Handler es. */
  readonly gateAbgewiesen?: boolean;
  readonly pruefeSitzung: Sitzungspruefung;
  readonly pruefeBerechtigung: Berechtigungspruefung;
  /** Ohne sie gilt jede Hilfe ohne Ton als nicht prüfbar - und geht nicht durch. */
  readonly pruefeAssistenz?: Assistenzpruefung;
  readonly protokolliere: (eintrag: Protokolleintrag) => void;
  /** Für Tests; sonst die Uhr der Laufzeit. */
  readonly jetzt?: () => number;
  /** Für Tests; sonst `FRISTEN`. */
  readonly fristen?: { readonly transkriptionMs: number; readonly strukturierungMs: number };
}

export function erstelleHandler({
  adapter,
  assistenz = null,
  gateAbgewiesen = false,
  pruefeSitzung,
  pruefeBerechtigung,
  pruefeAssistenz = () => Promise.resolve('nicht_pruefbar'),
  protokolliere,
  jetzt = () => Date.now(),
  fristen = FRISTEN,
}: HandlerOptionen): (anfrage: Request) => Promise<Response> {
  return async (anfrage) => {
    if (anfrage.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const nurStatus = anfrage.method === 'GET';
    if (!nurStatus && anfrage.method !== 'POST') {
      return fehler('invalid_request', 'nur GET und POST', 405);
    }

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

    // Zweck und Anbieter stehen fest, bevor ein Byte der Aufnahme gelesen
    // wird: Wo nichts eingerichtet ist, geht keine Aufnahme durch den Speicher.
    const zweck = zweckDerAdresse(anfrage.url);
    if (zweck === null) return fehler('invalid_request', 'unbekannter Zweck');
    // Das Diktat bedient der Sprachadapter, jede Hilfe ohne Ton der Assistenzadapter.
    const zustaendig = zweck.art === 'diktat' ? adapter : assistenz;
    const bedient = zustaendig !== null && zweck.adapter.includes(zustaendig.id);

    // Die Frage der Schreibseite vor „Sprechen“: nur ja oder nein, ohne
    // Anbieter, ohne Log - eine Frage ist kein Anbieteraufruf.
    if (nurStatus) return antwort({ ok: true, verfuegbar: bedient }, 200);

    if (zustaendig === null) {
      // Die Nachbildung in der Produktion: abgewiesen, und der Handler
      // meldet es als Protokolleintrag.
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
    if (!bedient) {
      // Ein Adapter, den der Zweck nicht nennt, bedient ihn nicht (6.1).
      protokolliere({
        zweck: zweck.kennung,
        anbieter: zustaendig.id,
        code: 'not_configured',
        dauerMs: 0,
      });
      return fehler('not_configured', 'Anbieter für diesen Zweck nicht freigegeben');
    }

    if (zweck.art !== 'diktat') {
      if (assistenz === null) return fehler('not_configured', 'kein Anbieter eingerichtet');
      return assistiere({
        anfrage,
        authorization: authorization ?? '',
        zweck,
        adapter: assistenz,
        pruefe: pruefeAssistenz,
        protokolliere,
        jetzt,
        fristMs: fristen.strukturierungMs,
      });
    }
    if (adapter === null) return fehler('not_configured', 'kein Anbieter eingerichtet');

    // Erst jetzt lesen, was kommt - höchstens so viel, wie eine erlaubte
    // Aufnahme samt Formular braucht. Mehr bleibt ungelesen.
    const formular = await liesFormular(
      anfrage,
      zweck.eingabe.hoechstBytes + FORMULAR_ZUSCHLAG_BYTES,
    );
    if (formular === 'zu_gross') return fehler('too_large', 'Anfrage zu groß');
    if (formular === null) return fehler('invalid_request', 'kein lesbares Formular');

    const pruefung = pruefeEingabe(formular, zweck);
    if (!pruefung.ok) return fehler(pruefung.code, pruefung.meldung);
    const { terminId, datei, mime } = pruefung.eingabe;

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

    // An den Adapter: die Sätze, die Sprache und die Regeln des Zwecks; zurück nur die
    // Zuordnung, den Text setzt der Gateway zusammen (ANN-824).
    const liste = saetze(transkript);
    const einordnung = await mitFrist(
      (signal) =>
        adapter.ordneZu(
          {
            saetze: liste,
            sprache: zweck.eingabe.sprache,
            regeln: zweck.regeln,
            abschnitte: zweck.ausgabe.abschnitte,
          },
          signal,
        ),
      fristen.strukturierungMs,
    );
    if (!einordnung.ok) return scheitert(einordnung.error.code, 'Einordnung fehlgeschlagen');
    const abschnitte = setzeZusammen(liste, einordnung.value.zuordnung, zweck.ausgabe.abschnitte);
    if (abschnitte === null) return scheitert('unavailable', 'Einordnung unbrauchbar');

    return antwort({ ok: true, transkript, abschnitte, quelle: adapter.quelle }, 200);
  };
}

/** Der Zweck aus der Adresse - genau einmal genannt und bekannt, sonst `null`. */
function zweckDerAdresse(adresse: string): Zweck | null {
  let werte: string[];
  try {
    werte = new URL(adresse).searchParams.getAll('zweck');
  } catch {
    return null;
  }
  return werte.length === 1 ? zweckAus(werte[0]) : null;
}

interface Eingabe {
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
function pruefeEingabe(formular: FormData, zweck: Diktatzweck): Eingabepruefung {
  const ungueltig = (meldung: string): Eingabepruefung => ({
    ok: false,
    code: 'invalid_request',
    meldung,
  });

  // Nur die drei Felder: Ein zusätzliches - etwa ein Name - wird nicht still
  // übergangen, sondern abgewiesen.
  let anzahl = 0;
  formular.forEach(() => {
    anzahl += 1;
  });
  if (anzahl !== FELDER.length || FELDER.some((feld) => formular.getAll(feld).length !== 1)) {
    return ungueltig('Formular unvollständig');
  }

  const termin = formular.get('termin');
  if (typeof termin !== 'string' || !UUID.test(termin)) return ungueltig('Termin fehlt');

  const datei = formular.get('audio');
  if (!istDatei(datei)) return ungueltig('Aufnahme fehlt');
  const mime = grundformat(datei.type);
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

  return { ok: true, eingabe: { terminId: termin, datei, mime, dauerS } };
}
