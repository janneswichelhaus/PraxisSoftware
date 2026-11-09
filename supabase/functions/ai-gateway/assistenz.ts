// Die Hilfen ohne Ton (ANN-861): Text hinein, ein Vorschlag heraus, der nur Stellen der Eingabe
// enthält. Der Adapter nennt Stellen, den Wortlaut setzt der Gateway; gespeichert wird nichts.

import type { Assistenzfrage, Assistenzpruefung } from './berechtigung.ts';
import { UUID, antwort, fehler, liesJson, mitFrist } from './http.ts';
import { einheiten, ordne } from './inhaltstreue.ts';
import type { Assistenzadapter, Ordnungsantwort, Protokolleintrag } from './typen.ts';
import type { Assistenzzweck } from './zwecke.ts';

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
  switch (auftrag.zweck.art) {
    case 'ordnen':
      return ordnen(auftrag);
  }
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

async function ordnen(auftrag: Assistenzauftrag): Promise<Response> {
  const { anfrage, adapter, zweck, jetzt, fristMs } = auftrag;
  // UTF-8 braucht höchstens vier Bytes je Zeichen.
  const koerper = await liesJson(anfrage, zweck.eingabe.hoechstZeichen * 4 + JSON_ZUSCHLAG_BYTES);
  if (koerper === 'zu_gross') return fehler('too_large', 'Anfrage zu groß');
  if (koerper === null) return fehler('invalid_request', 'kein lesbares JSON');
  if (!genau(koerper, ['termin', 'text'])) return fehler('invalid_request', 'Felder passen nicht');
  const { termin, text } = koerper;
  if (typeof termin !== 'string' || !UUID.test(termin))
    return fehler('invalid_request', 'Termin fehlt');
  if (typeof text !== 'string' || text.trim() === '')
    return fehler('invalid_request', 'Text fehlt');
  if (text.length > zweck.eingabe.hoechstZeichen) return fehler('too_large', 'Text zu lang');

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
