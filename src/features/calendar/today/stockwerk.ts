// -----------------------------------------------------------------------------
// Stockwerk aus dem Zugangshinweis (Design-Handoff 2026-10-01, Abschnitt 5)
//
// ANN-197: Die Tageskarte zeigt das Stockwerk als Pille. Ein eigenes Feld gibt
// es dafür noch nicht; bis dahin wird es vom **Anfang** des Zugangshinweises
// abgetrennt, wenn dort erkennbar eines steht. Dies ist die eine Stelle, an
// der die Annahme greift: Kommt das Feld `home_visit_floor`, liest die Karte
// es direkt, und diese Datei entfällt.
//
// Bewusst eng: Erkannt wird nur „[Zahl.] Ebene [Seite]" als erste Angabe vor
// einem Komma, Semikolon, Gedankenstrich oder Zeilenumbruch. Alles andere
// bleibt, wie es eingetragen wurde, im Zugangshinweis stehen - lieber keine
// Pille als eine, die einen halben Satz trägt. Es wird nichts gespeichert und
// nichts umgeschrieben; der Hinweis in der Akte bleibt unverändert.
// -----------------------------------------------------------------------------

/** Ebenen, die für sich stehen können („EG", „Dachgeschoss"). */
const EBENEN_OHNE_ZAHL = new Set([
  'eg',
  'erdgeschoss',
  'ug',
  'untergeschoss',
  'dg',
  'dachgeschoss',
  'hochparterre',
  'parterre',
  'souterrain',
]);

/** Ebenen, die eine Zahl davor brauchen („2. OG", „3. Stock"). */
const EBENEN_MIT_ZAHL = new Set([
  'og',
  'obergeschoss',
  'ug',
  'untergeschoss',
  'dg',
  'dachgeschoss',
  'stock',
  'stockwerk',
  'etage',
]);

const SEITEN = new Set(['links', 'rechts', 'mitte', 'vorne', 'hinten']);

/** Wo die erste Angabe endet: Komma, Semikolon, Zeilenumbruch oder „ - ". */
const TRENNER = /[,;\n]| [–-] /;

export interface Zugang {
  /** Die Angabe für die Pille, so wie sie eingetragen ist - oder `null`. */
  stockwerk: string | null;
  /** Der Zugangshinweis ohne das Stockwerk - oder `null`, wenn nichts bleibt. */
  rest: string | null;
}

/** „2. OG links" ja, „Klingel Müller" nein. */
function istStockwerk(angabe: string): boolean {
  const worte = angabe
    .replace(/^(\d{1,2})\.(?=\S)/, '$1. ')
    .split(/\s+/)
    .filter(Boolean);
  if (worte.length === 0 || worte.length > 3) return false;

  const mitZahl = /^\d{1,2}\.$/.test(worte[0]!);
  const ebene = worte[mitZahl ? 1 : 0]?.replace(/\.$/, '').toLocaleLowerCase('de-DE');
  if (!ebene) return false;
  if (!(mitZahl ? EBENEN_MIT_ZAHL : EBENEN_OHNE_ZAHL).has(ebene)) return false;

  const danach = worte.slice(mitZahl ? 2 : 1);
  if (danach.length === 0) return true;
  return danach.length === 1 && SEITEN.has(danach[0]!.toLocaleLowerCase('de-DE'));
}

/**
 * Trennt das Stockwerk vom Anfang des Zugangshinweises.
 *
 * „2. OG links, Aufzug vorhanden." ergibt „2. OG links" und „Aufzug
 * vorhanden."; „Klingel Müller, 2. OG" bleibt ganz im Rest, weil das
 * Stockwerk nicht vorn steht.
 */
export function zugangMitStockwerk(hinweis: string | null | undefined): Zugang {
  const text = hinweis?.trim() ?? '';
  if (text === '') return { stockwerk: null, rest: null };

  const treffer = TRENNER.exec(text);
  const erste = (treffer ? text.slice(0, treffer.index) : text).trim();
  if (!istStockwerk(erste)) return { stockwerk: null, rest: text };

  const rest = treffer ? text.slice(treffer.index + treffer[0].length).trim() : '';
  return { stockwerk: erste, rest: rest === '' ? null : rest };
}
