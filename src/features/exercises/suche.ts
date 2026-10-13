import { suchform } from '@/app/funktionen';
import type { Uebung, Variante } from './api';
import {
  AUSGANGSSTELLUNGEN,
  AUSGANGSSTELLUNG_LABEL,
  NACH_BEDARF,
  NIVEAU_LABEL,
  ZIELE,
  ZIEL_LABEL,
  type Ausgangsstellung,
  type Ziel,
} from './katalog/typen';
import { KOERPERREGIONEN, KOERPERREGION_LABEL, type Koerperregion } from './types';

/**
 * Suche und Filter der Übungsbibliothek (UEB-003; ANN-472, Welle B).
 *
 * Gesucht wird in beiden Sprachebenen - fachlich und in Alltagssprache - an
 * Übung und Variante, auch ohne Umlaute („Bruecke", „Brucke"; dieselbe
 * Vergleichsform wie die Patientensuche, `suchform`). Gefiltert wird nach
 * Körperregion, Ziel, Ausgangsstellung, Hilfsmittel und Niveau - Ordnungen,
 * die ADR-006 Punkt 10 ausdrücklich zulässt, **von Hand gesetzt**. Nichts hier
 * liest Angaben einer Person, nichts wird vorbelegt, und die Reihenfolge
 * bleibt die der Bibliothek: nach Bezeichnung.
 *
 * Innerhalb eines Filters genügt ein gewählter Wert („Knie oder Hüfte"),
 * zwischen den Filtern gilt jeder („Knie und im Sitz"). Die Region steht an
 * der Übung, alles andere an der Variante (ANN-383): Eine Übung passt, wenn
 * mindestens eine ihrer Varianten passt.
 */

/** So viele Zeilen zeigen Bibliothek und Auswahlblatt, bevor „Weitere laden“ kommt. */
export const ZEILEN_JE_SEITE = 40;

/** Hilfsmittelfilter: nur Varianten ohne Hilfsmittel. */
export const OHNE_AUSRUESTUNG = '__ohne__';

/** Niveau als Zeichenkette - `Filterchips` wählen Zeichenketten. */
export type NiveauWert = '1' | '2' | '3';

export interface Filter {
  text: string;
  regionen: readonly Koerperregion[];
  ziele: readonly Ziel[];
  stellungen: readonly Ausgangsstellung[];
  /** Bezeichnungen der Ausrüstung (ohne „nach Bedarf") oder `OHNE_AUSRUESTUNG`. */
  hilfsmittel: readonly string[];
  niveaus: readonly NiveauWert[];
}

export const KEIN_FILTER: Filter = {
  text: '',
  regionen: [],
  ziele: [],
  stellungen: [],
  hilfsmittel: [],
  niveaus: [],
};

export interface Treffer {
  uebung: Uebung;
  /** Die nicht archivierten Varianten, die zu den Filtern passen. */
  varianten: Variante[];
  /** Varianten, in denen der Suchtext stand, wenn er nicht schon an der Übung stand. */
  variantenTreffer: string[];
}

/** Wie viele Filter (ohne die Suche) etwas einschränken - für „Filter (2)". */
export function gesetzteFilter(filter: Filter): number {
  return [filter.regionen, filter.ziele, filter.stellungen, filter.hilfsmittel, filter.niveaus]
    .map((werte) => (werte.length > 0 ? 1 : 0))
    .reduce<number>((a, b) => a + b, 0);
}

/** Alle Filter zurück, die Suche bleibt. */
export function ohneFilter(filter: Filter): Filter {
  return { ...KEIN_FILTER, text: filter.text };
}

/** „Gewichtsmanschette (nach Bedarf)" zählt als „Gewichtsmanschette". */
export function ohneNachBedarf(wort: string): string {
  return wort.endsWith(NACH_BEDARF) ? wort.slice(0, -NACH_BEDARF.length) : wort;
}

function passtHilfsmittel(variante: Variante, gewaehlt: readonly string[]): boolean {
  if (gewaehlt.length === 0) return true;
  return gewaehlt.some((wert) =>
    wert === OHNE_AUSRUESTUNG
      ? variante.equipment.length === 0
      : variante.equipment.some((wort) => suchform(ohneNachBedarf(wort)) === suchform(wert)),
  );
}

/** Passt eine Variante zu den Filtern an der Variante (Ziel, Stellung, Hilfsmittel, Niveau)? */
export function passtVariante(variante: Variante, filter: Filter): boolean {
  if (filter.ziele.length > 0 && !(variante.goal && filter.ziele.includes(variante.goal))) {
    return false;
  }
  if (
    filter.stellungen.length > 0 &&
    !(variante.starting_position && filter.stellungen.includes(variante.starting_position))
  ) {
    return false;
  }
  if (
    filter.niveaus.length > 0 &&
    !(variante.level !== null && filter.niveaus.includes(String(variante.level) as NiveauWert))
  ) {
    return false;
  }
  return passtHilfsmittel(variante, filter.hilfsmittel);
}

function enthaelt(text: string, gesucht: string): boolean {
  return suchform(text).includes(gesucht);
}

export function filtere(uebungen: readonly Uebung[], filter: Filter): Treffer[] {
  const gesucht = suchform(filter.text.trim());
  const treffer: Treffer[] = [];

  for (const uebung of uebungen) {
    if (filter.regionen.length > 0 && !filter.regionen.includes(uebung.body_region)) continue;

    // Archivierte Varianten zählen nicht mit: Sie stehen nicht mehr in der
    // Bibliothek (ANN-296).
    const varianten = uebung.variants.filter(
      (variante) => !variante.archived && passtVariante(variante, filter),
    );
    if (varianten.length === 0 && gesetzteFilter(filter) > 0) continue;

    if (!gesucht || enthaelt(uebung.name, gesucht) || enthaelt(uebung.lay_name, gesucht)) {
      treffer.push({ uebung, varianten, variantenTreffer: [] });
      continue;
    }
    const gefunden = varianten.filter(
      (variante) => enthaelt(variante.name, gesucht) || enthaelt(variante.lay_name, gesucht),
    );
    if (gefunden.length > 0) {
      treffer.push({
        uebung,
        varianten: gefunden,
        variantenTreffer: gefunden.map((variante) => variante.name),
      });
    }
  }
  return treffer;
}

export interface Wahl<W extends string> {
  wert: W;
  text: string;
}

export interface Facetten {
  regionen: Wahl<Koerperregion>[];
  ziele: Wahl<Ziel>[];
  stellungen: Wahl<Ausgangsstellung>[];
  hilfsmittel: Wahl<string>[];
  niveaus: Wahl<NiveauWert>[];
}

/**
 * Die Filterwerte, die in der Bibliothek vorkommen - kein Chip, der zu
 * nichts führt. Reihenfolge der festen Listen; Hilfsmittel nach Bezeichnung,
 * „Ohne Hilfsmittel" zuerst.
 */
export function facetten(uebungen: readonly Uebung[]): Facetten {
  const regionen = new Set<Koerperregion>();
  const ziele = new Set<Ziel>();
  const stellungen = new Set<Ausgangsstellung>();
  const niveaus = new Set<number>();
  const hilfsmittel = new Map<string, string>();
  let ohne = false;

  for (const uebung of uebungen) {
    if (uebung.archived) continue;
    const varianten = uebung.variants.filter((variante) => !variante.archived);
    if (varianten.length === 0) continue;
    regionen.add(uebung.body_region);
    for (const variante of varianten) {
      if (variante.goal) ziele.add(variante.goal);
      if (variante.starting_position) stellungen.add(variante.starting_position);
      if (variante.level !== null) niveaus.add(variante.level);
      if (variante.equipment.length === 0) ohne = true;
      for (const wort of variante.equipment) {
        const bezeichnung = ohneNachBedarf(wort);
        if (!hilfsmittel.has(suchform(bezeichnung))) {
          hilfsmittel.set(suchform(bezeichnung), bezeichnung);
        }
      }
    }
  }

  return {
    regionen: KOERPERREGIONEN.filter((r) => regionen.has(r)).map((wert) => ({
      wert,
      text: KOERPERREGION_LABEL[wert],
    })),
    ziele: ZIELE.filter((z) => ziele.has(z)).map((wert) => ({ wert, text: ZIEL_LABEL[wert] })),
    stellungen: AUSGANGSSTELLUNGEN.filter((s) => stellungen.has(s)).map((wert) => ({
      wert,
      text: AUSGANGSSTELLUNG_LABEL[wert],
    })),
    hilfsmittel: [
      ...(ohne ? [{ wert: OHNE_AUSRUESTUNG, text: 'Ohne Hilfsmittel' }] : []),
      ...[...hilfsmittel.values()]
        .sort((a, b) => a.localeCompare(b, 'de'))
        .map((wert) => ({ wert, text: wert })),
    ],
    niveaus: ([1, 2, 3] as const)
      .filter((n) => niveaus.has(n))
      .map((n) => ({ wert: String(n) as NiveauWert, text: NIVEAU_LABEL[n] })),
  };
}

/**
 * „Knie · Kraft · Leicht, mit Halt" - Region der Übung, Ziel und Niveau der
 * Variante; was fehlt, entfällt (eigene Übungen tragen beides nicht).
 */
export function ordnungZeile(uebung: Uebung, variante: Variante | undefined): string {
  return [
    KOERPERREGION_LABEL[uebung.body_region],
    variante?.goal ? ZIEL_LABEL[variante.goal] : null,
    variante?.level ? NIVEAU_LABEL[variante.level as 1 | 2 | 3] : null,
  ]
    .filter((teil): teil is string => Boolean(teil))
    .join(' · ');
}

/** Aus dem Katalog übernommen und noch nicht von der Praxis durchgesehen (ANN-386)? */
export function ungeprueft(variante: Pick<Variante, 'catalog_key' | 'reviewed_at'>): boolean {
  return variante.catalog_key !== null && variante.reviewed_at === null;
}
