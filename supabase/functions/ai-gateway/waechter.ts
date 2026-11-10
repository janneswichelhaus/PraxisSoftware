// Was beim Umformen erhalten bleiben muss (PROJECT_PRINCIPLES.md 6.3): Zahlen, Einheiten,
// Körperseiten, Verneinungen, Unsicherheiten. Der Gateway vergleicht jeden Satz mit seiner Quelle;
// besteht er nicht, bleibt die Quelle im Wortlaut stehen (ANN-861). Im Zweifel streng.

import { saetze } from './inhaltstreue.ts';

function woerter(text: string): string[] {
  return text.toLowerCase().match(/\p{L}+/gu) ?? [];
}

function gleich(eins: readonly string[], zwei: readonly string[]): boolean {
  return eins.length === zwei.length && eins.every((wert, stelle) => wert === zwei[stelle]);
}

/** Zahlen als Ziffern, mit Wiederholung; Komma und Punkt gelten gleich. */
export function zahlen(text: string): string[] {
  return (text.match(/\d+[.,]\d+|\d+/g) ?? []).map((zahl) => zahl.replace(',', '.')).sort();
}

const SEITEN: readonly (readonly [string, RegExp])[] = [
  ['links', /^(?:links|linke[nrms]?|linksseitig|li)$/],
  ['rechts', /^(?:rechts|rechte[nrms]?|rechtsseitig|re)$/],
  ['beidseits', /^(?:beidseits|beidseitig|beidseitige[nrms]?|beiderseits|bds|bilateral)$/],
];

/** Welche Körperseiten genannt sind - ausgeschrieben oder abgekürzt. */
export function seiten(text: string): string[] {
  const gefunden = new Set<string>();
  for (const wort of woerter(text)) {
    for (const [seite, muster] of SEITEN) if (muster.test(wort)) gefunden.add(seite);
  }
  return [...gefunden].sort();
}

const EINHEITEN = new Map<string, string>([
  ['grad', 'grad'],
  ['prozent', 'prozent'],
  ['cm', 'cm'],
  ['mm', 'mm'],
  ['kg', 'kg'],
  ['min', 'min'],
  ['minute', 'min'],
  ['minuten', 'min'],
  ['sek', 'sek'],
  ['sekunde', 'sek'],
  ['sekunden', 'sek'],
  ['std', 'std'],
  ['stunde', 'std'],
  ['stunden', 'std'],
  ['tag', 'tag'],
  ['tage', 'tag'],
  ['tagen', 'tag'],
  ['woche', 'woche'],
  ['wochen', 'woche'],
  ['monat', 'monat'],
  ['monate', 'monat'],
  ['monaten', 'monat'],
  ['mal', 'mal'],
  ['wdh', 'wdh'],
  ['wiederholung', 'wdh'],
  ['wiederholungen', 'wdh'],
]);

/** Welche Maßeinheiten vorkommen; „°“ ist Grad, „%“ Prozent, „3x“ dreimal. */
export function masseinheiten(text: string): string[] {
  const gefunden = new Set<string>();
  for (const wort of woerter(text)) {
    const einheit = EINHEITEN.get(wort);
    if (einheit) gefunden.add(einheit);
  }
  if (text.includes('°')) gefunden.add('grad');
  if (text.includes('%')) gefunden.add('prozent');
  if (/\d\s*[x×](?!\p{L})/iu.test(text)) gefunden.add('mal');
  return [...gefunden].sort();
}

const VERNEINUNG = new Set([
  'nicht',
  'nichts',
  'kein',
  'keine',
  'keinen',
  'keinem',
  'keiner',
  'keines',
  'nie',
  'niemals',
  'nirgends',
  'ohne',
  'weder',
]);

export function verneinungen(text: string): number {
  return woerter(text).filter((wort) => VERNEINUNG.has(wort)).length;
}

const UNSICHER = new Set([
  'vielleicht',
  'eventuell',
  'evtl',
  'vermutlich',
  'wahrscheinlich',
  'möglicherweise',
  'womöglich',
  'unklar',
  'fraglich',
  'unsicher',
  'anscheinend',
  'eher',
  'ca',
  'circa',
  'etwa',
  'ungefähr',
]);

/** Ist eine Unsicherheit geäußert? Dazu zählen Fragezeichen und unverständliche Stellen eigens. */
export function unsicher(text: string): boolean {
  return woerter(text).some((wort) => UNSICHER.has(wort));
}

function anzahl(text: string, zeichen: string): number {
  return text.split(zeichen).length - 1;
}

/** Trägt der umgeformte Satz dieselben Zahlen, Einheiten, Seiten, Verneinungen, Unsicherheiten? */
export function gleicherGehalt(quelle: string, satz: string): boolean {
  return (
    gleich(zahlen(quelle), zahlen(satz)) &&
    gleich(seiten(quelle), seiten(satz)) &&
    gleich(masseinheiten(quelle), masseinheiten(satz)) &&
    verneinungen(quelle) === verneinungen(satz) &&
    unsicher(quelle) === unsicher(satz) &&
    anzahl(quelle, '?') === anzahl(satz, '?') &&
    anzahl(quelle, '[unverständlich]') === anzahl(satz, '[unverständlich]')
  );
}

/** Ein umgeformter Satz - oder die Quelle im Wortlaut, wenn die Umformung nicht besteht. */
export interface Umformsatz {
  readonly text: string;
  readonly unveraendert: boolean;
}

/** Ein Satz des Textes mit seiner Zeile; daraus setzt die Seite den Vorschlag wieder zusammen. */
export interface Stueck {
  readonly text: string;
  readonly zeile: number;
}

// Nach einer Zahl, einem Einzelbuchstaben oder einer dieser Abkürzungen beendet ein Punkt keinen
// Satz. Fehlt eine Abkürzung, wird feiner geteilt, nie gröber - und je Stück gilt ein Satz.
const KEIN_SATZENDE =
  /(?:^|[\s(])(?:\d+|\p{L}|li|re|bds|tägl|tgl|evtl|ggf|ca|bzw|vgl|inkl|usw|max|mind|Dr|Nr|Min|Std|Sek|Wdh)\.$/iu;

/** Die Stücke einer Zeile: getrennt nach Satzzeichen vor Leerraum, ohne Lookbehind wie im Browser. */
function nachSatzzeichen(zeile: string): string[] {
  const teile: string[] = [];
  let anfang = 0;
  for (const treffer of zeile.matchAll(/[.!?…](\s+)/gu)) {
    const ende = treffer.index + treffer[0].length - treffer[1]!.length;
    teile.push(zeile.slice(anfang, ende));
    anfang = ende + treffer[1]!.length;
  }
  teile.push(zeile.slice(anfang));
  return teile;
}

/** Der Text in Sätzen, Zeile für Zeile; umgeformt wird Stück für Stück. */
export function stuecke(text: string): Stueck[] {
  const liste: Stueck[] = [];
  for (const [zeile, roh] of text.split(/\r?\n/).entries()) {
    let offen = '';
    for (const teil of nachSatzzeichen(roh.trim())) {
      const satz = teil.trim();
      if (satz === '') continue;
      offen = offen === '' ? satz : `${offen} ${satz}`;
      if (KEIN_SATZENDE.test(offen)) continue;
      liste.push({ text: offen, zeile });
      offen = '';
    }
    if (offen !== '') liste.push({ text: offen, zeile });
  }
  return liste;
}

// Gegen Angefügtes: genau ein Satz je Stück und höchstens dreimal so lang.
const HOECHST_FAKTOR = 3;
const HOECHST_ZUSCHLAG = 40;

/**
 * Je Quelle genau ein Satz in derselben Reihenfolge. `null`, wenn die Antwort des Adapters diese
 * Form nicht hat; ein einzelner Satz, der nicht besteht, fällt auf seine Quelle zurück.
 */
export function pruefeUmformung(
  quellen: readonly string[],
  behauptung: unknown,
): Umformsatz[] | null {
  if (!Array.isArray(behauptung) || behauptung.length !== quellen.length) return null;
  const ergebnis: Umformsatz[] = [];
  for (const [stelle, quelle] of quellen.entries()) {
    const roh: unknown = (behauptung as unknown[])[stelle];
    if (typeof roh !== 'string') return null;
    const text = roh.replace(/\s+/gu, ' ').trim();
    const besteht =
      text !== '' &&
      text.length <= quelle.length * HOECHST_FAKTOR + HOECHST_ZUSCHLAG &&
      // Gezählt mit dem strengeren Teiler des Diktats: Er kennt weniger Abkürzungen.
      saetze(text).length === 1 &&
      gleicherGehalt(quelle, text);
    ergebnis.push(
      besteht ? { text, unveraendert: text === quelle } : { text: quelle, unveraendert: true },
    );
  }
  return ergebnis;
}
