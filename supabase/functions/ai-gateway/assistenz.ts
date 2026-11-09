// Die Hilfen ohne Ton (ANN-861): Text hinein, ein Vorschlag heraus, der nur Stellen der Eingabe
// enthält. Der Adapter nennt Stellen, den Wortlaut setzt der Gateway; gespeichert wird nichts.

import type { Assistenzfrage, Assistenzpruefung } from './berechtigung.ts';
import { UUID, antwort, fehler, liesJson, mitFrist } from './http.ts';
import { einheiten, ordne } from './inhaltstreue.ts';
import type {
  Assistenzadapter,
  Ordnungsantwort,
  Protokolleintrag,
  Umformungsantwort,
} from './typen.ts';
import { pruefeUmformung, stuecke } from './waechter.ts';
import type { Assistenzzweck, Ordnungszweck, Umformzweck } from './zwecke.ts';

/** Platz für Feldnamen und Zeichenmaskierung neben dem Text. */
const JSON_ZUSCHLAG_BYTES = 16 * 1024;

export interface Assistenzauftrag {
  readonly anfrage: Request;
  readonly authorization: string;
  readonly zweck: Assistenzzweck;
  readonly adapter: Assistenzadapter;
  readonly pruefe: Assistenzpruefung;
  readonly protokolliere: (eintrag: Protokolleintrag) => void;
  readonly jetzt: () => number;
  readonly fristMs: number;
}

export function assistiere(auftrag: Assistenzauftrag): Promise<Response> {
  const { zweck } = auftrag;
  switch (zweck.art) {
    case 'ordnen':
      return ordnen(auftrag, zweck);
    case 'umformen':
      return umformen(auftrag, zweck);
  }
}

/** Der Körper einer Textanfrage: genau der Gegenstand und der Text - oder die Abweisung. */
async function textanfrage(
  anfrage: Request,
  gegenstand: string,
  hoechstZeichen: number,
): Promise<{ readonly id: string; readonly text: string } | Response> {
  // UTF-8 braucht höchstens vier Bytes je Zeichen.
  const koerper = await liesJson(anfrage, hoechstZeichen * 4 + JSON_ZUSCHLAG_BYTES);
  if (koerper === 'zu_gross') return fehler('too_large', 'Anfrage zu groß');
  if (koerper === null) return fehler('invalid_request', 'kein lesbares JSON');
  if (!genau(koerper, [gegenstand, 'text']))
    return fehler('invalid_request', 'Felder passen nicht');
  const id = new Map(Object.entries(koerper)).get(gegenstand);
  const { text } = koerper;
  if (typeof id !== 'string' || !UUID.test(id))
    return fehler('invalid_request', 'Gegenstand fehlt');
  if (typeof text !== 'string' || text.trim() === '')
    return fehler('invalid_request', 'Text fehlt');
  if (text.length > hoechstZeichen) return fehler('too_large', 'Text zu lang');
  return { id, text };
}

/** Genau diese Felder, kein weiteres: Ein zusätzliches - etwa ein Name - wird abgewiesen. */
function genau(koerper: Record<string, unknown>, felder: readonly string[]): boolean {
  const namen = Object.keys(koerper);
  return namen.length === felder.length && felder.every((feld) => namen.includes(feld));
}

/** Die Datenbank entscheidet mit dem Token der Person; `null` heißt erlaubt. */
async function abgewiesen(
  { authorization, pruefe, protokolliere, zweck }: Assistenzauftrag,
  frage: Assistenzfrage,
): Promise<Response | null> {
  const befund = await pruefe(authorization, frage);
  if (befund === 'erlaubt') return null;
  if (befund === 'abgelehnt')
    return fehler('session_invalid', 'Sitzung von der Datenbank abgelehnt');
  if (befund === 'verweigert') return fehler('forbidden', 'an diesem Gegenstand nicht erlaubt');
  protokolliere({
    zweck: zweck.kennung,
    anbieter: 'berechtigung',
    code: 'unavailable',
    dauerMs: 0,
  });
  return fehler('unavailable', 'Berechtigung nicht prüfbar');
}

/** Ein gescheiterter Adapteraufruf: Protokolleintrag ohne Inhalt, dann die Fehlerklasse. */
function gescheitert(
  { adapter, protokolliere, jetzt, zweck }: Assistenzauftrag,
  beginn: number,
  code: 'unavailable' | 'timeout',
  meldung: string,
): Response {
  protokolliere({ zweck: zweck.kennung, anbieter: adapter.id, code, dauerMs: jetzt() - beginn });
  return fehler(code, meldung);
}

async function ordnen(auftrag: Assistenzauftrag, zweck: Ordnungszweck): Promise<Response> {
  const { adapter, jetzt, fristMs } = auftrag;
  const eingabe = await textanfrage(auftrag.anfrage, 'termin', zweck.eingabe.hoechstZeichen);
  if (eingabe instanceof Response) return eingabe;
  const { id: termin, text } = eingabe;

  const abweisung = await abgewiesen(auftrag, { art: zweck.gegenstand, id: termin });
  if (abweisung) return abweisung;

  const liste = einheiten(text, zweck.ausgabe.abschnitte);
  const frei = liste.filter((einheit) => einheit.titel === null).map((einheit) => einheit.text);
  const beginn = jetzt();
  // Steht schon alles unter einem Titel der Vorlage, geht nichts an den Adapter.
  let zuordnung: unknown = [];
  if (frei.length > 0) {
    const einordnung = await mitFrist(
      (signal) =>
        adapter.ordneZu(
          {
            saetze: frei,
            sprache: zweck.eingabe.sprache,
            regeln: zweck.regeln,
            abschnitte: zweck.ausgabe.abschnitte,
          },
          signal,
        ),
      fristMs,
    );
    if (!einordnung.ok)
      return gescheitert(auftrag, beginn, einordnung.error.code, 'Einordnung fehlgeschlagen');
    zuordnung = einordnung.value.zuordnung;
  }
  const abschnitte = ordne(liste, zuordnung, zweck.ausgabe.abschnitte);
  if (abschnitte === null)
    return gescheitert(auftrag, beginn, 'unavailable', 'Einordnung unbrauchbar');

  const ergebnis: Ordnungsantwort = { ok: true, art: 'ordnen', abschnitte, quelle: adapter.quelle };
  return antwort(ergebnis, 200);
}

async function umformen(auftrag: Assistenzauftrag, zweck: Umformzweck): Promise<Response> {
  const { adapter, jetzt, fristMs } = auftrag;
  const eingabe = await textanfrage(auftrag.anfrage, 'rueckfrage', zweck.eingabe.hoechstZeichen);
  if (eingabe instanceof Response) return eingabe;

  const abweisung = await abgewiesen(auftrag, { art: zweck.gegenstand, id: eingabe.id });
  if (abweisung) return abweisung;

  // An den Adapter: nur die Sätze der Praxis - die Frage der Person liegt dem Gateway nicht vor.
  const quellen = stuecke(eingabe.text).map((stueck) => stueck.text);
  const beginn = jetzt();
  const umformung = await mitFrist(
    (signal) =>
      adapter.formuliere(
        {
          saetze: quellen,
          aufgabe: zweck.aufgabe,
          sprache: zweck.eingabe.sprache,
          regeln: zweck.regeln,
        },
        signal,
      ),
    fristMs,
  );
  if (!umformung.ok)
    return gescheitert(auftrag, beginn, umformung.error.code, 'Umformung fehlgeschlagen');
  const umgeformt = pruefeUmformung(quellen, umformung.value.saetze);
  if (umgeformt === null)
    return gescheitert(auftrag, beginn, 'unavailable', 'Umformung unbrauchbar');

  const ergebnis: Umformungsantwort = {
    ok: true,
    art: 'umformen',
    saetze: umgeformt,
    quelle: adapter.quelle,
  };
  return antwort(ergebnis, 200);
}
