import type { Fundstelle } from '@/lib/ki/verordnung';
import { HAUSBESUCH, HEILMITTEL } from './heilmittel';

// Aus den Werten vom Foto werden Formularwerte, nach festen Regeln und ohne Anbieter (ADR-005
// Punkt 6). Was sich nicht sicher zuordnen lässt, bleibt sichtbar, wird aber nicht eingetragen.

/** Was ein Vorschlag im Formular „Daten übertragen“ setzen kann. */
export type Formularfeld =
  'issued_on' | 'kind' | 'prescriber_id' | 'icd' | 'diagnose' | 'position' | 'hausbesuch';

export interface Feldvorschlag {
  readonly feld: Formularfeld;
  /** Die Beschriftung des Feldes im Formular. */
  readonly beschriftung: string;
  /** Was eingetragen würde, lesbar. */
  readonly anzeige: string;
  /** Der Wert fürs Formular, oder `null`, wenn er sich nicht sicher zuordnen lässt. */
  readonly wert: string | null;
  /** Warum nicht - nur ohne Wert. */
  readonly grund: string | null;
  /** Bei einer Position die Anzahl. */
  readonly anzahl: number | null;
  /** Die erkannte Zeile, aus der der Wert stammt. */
  readonly quelle: string;
}

export interface Zuordnungskontext {
  /** Das Verzeichnis der Verordnenden mit dem Namen, wie die Auswahl ihn zeigt. */
  readonly verordnende: readonly { readonly id: string; readonly name: string }[];
  /** Ein ICD-10-Code in der Form des Servers - oder `null`, wenn er keiner ist. */
  readonly icd: (roh: string) => string | null;
  /** Heute in der Zeitzone der Praxis; ein späterer Tag ist kein Ausstellungstag. */
  readonly heute: string;
}

function ohneWert(
  feld: Formularfeld,
  beschriftung: string,
  fund: Fundstelle,
  grund: string,
): Feldvorschlag {
  return {
    feld,
    beschriftung,
    anzeige: fund.wert,
    wert: null,
    grund,
    anzahl: null,
    quelle: fund.zeile,
  };
}

function mitWert(
  feld: Formularfeld,
  beschriftung: string,
  fund: Fundstelle,
  wert: string,
  anzeige = wert,
  anzahl: number | null = null,
): Feldvorschlag {
  return { feld, beschriftung, anzeige, wert, grund: null, anzahl, quelle: fund.zeile };
}

/** `TT.MM.JJJJ` oder `TT.MM.JJ` als ISO-Tag - nur ein Tag, den es gibt. */
export function tagAus(text: string): string | null {
  const teile = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(text.trim());
  if (!teile) return null;
  const [tag, monat] = [Number(teile[1]), Number(teile[2])];
  const jahr = teile[3]!.length === 2 ? 2000 + Number(teile[3]) : Number(teile[3]);
  const datum = new Date(Date.UTC(jahr, monat - 1, tag));
  if (datum.getUTCFullYear() !== jahr || datum.getUTCMonth() !== monat - 1) return null;
  if (datum.getUTCDate() !== tag) return null;
  return datum.toISOString().slice(0, 10);
}

function normalisiert(name: string): string {
  return name.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
}

/** Die eine Verordner:in, deren Name so dasteht - oder deren Nachname allein eindeutig ist. */
function verordnerAus(
  wert: string,
  kontext: Zuordnungskontext,
): { id: string; name: string } | null {
  const gesucht = normalisiert(wert);
  const genau = kontext.verordnende.filter((v) => normalisiert(v.name) === gesucht);
  if (genau.length === 1) return genau[0]!;
  const woerter = new Set(gesucht.split(' '));
  const nachname = kontext.verordnende.filter((v) =>
    woerter.has(normalisiert(v.name).split(' ').at(-1)!),
  );
  return nachname.length === 1 ? nachname[0]! : null;
}

/** Das Heilmittel und seine Anzahl aus einer Zeile wie „Krankengymnastik 6 x“ oder „KG 6x“. */
function positionAus(wert: string): { remedy: string; anzahl: number | null } | null {
  const basis = /^(?:krankengymnastik|kg)\b/i.test(wert)
    ? 'Krankengymnastik'
    : /^(?:manuelle therapie|mt)\b/i.test(wert)
      ? 'Manuelle Therapie'
      : null;
  if (basis === null) return null;
  const remedy = /doppel/i.test(wert) ? `${basis} als Doppelbehandlung` : basis;
  if (!HEILMITTEL.some((h) => h.remedy === remedy && h.remedy !== HAUSBESUCH)) return null;
  const zahl = /(\d{1,3})\s*(?:x|×|mal)(?![\p{L}\p{N}])/iu.exec(wert);
  const anzahl = zahl ? Number(zahl[1]) : null;
  return { remedy, anzahl: anzahl !== null && anzahl >= 1 && anzahl <= 500 ? anzahl : null };
}

/** Je Fundstelle ein Vorschlag fürs Formular, in der Reihenfolge der Felder. */
export function feldvorschlaege(
  fundstellen: readonly Fundstelle[],
  kontext: Zuordnungskontext,
): Feldvorschlag[] {
  return fundstellen.map((fund): Feldvorschlag => {
    switch (fund.feld) {
      case 'ausgestellt_am': {
        const tag = tagAus(fund.wert);
        if (tag === null) return ohneWert('issued_on', 'Ausstellungsdatum', fund, 'Kein Datum');
        if (kontext.heute !== '' && tag > kontext.heute)
          return ohneWert('issued_on', 'Ausstellungsdatum', fund, 'Liegt in der Zukunft');
        return mitWert('issued_on', 'Ausstellungsdatum', fund, tag, fund.wert);
      }
      case 'art': {
        if (/erst/i.test(fund.wert)) return mitWert('kind', 'Art', fund, 'first', 'Erstverordnung');
        if (/folge/i.test(fund.wert))
          return mitWert('kind', 'Art', fund, 'follow_up', 'Folgeverordnung');
        return ohneWert('kind', 'Art', fund, 'Keine bekannte Art');
      }
      case 'verordnende': {
        const treffer = verordnerAus(fund.wert, kontext);
        return treffer
          ? mitWert('prescriber_id', 'Verordnende Ärzt:in', fund, treffer.id, treffer.name)
          : ohneWert('prescriber_id', 'Verordnende Ärzt:in', fund, 'Nicht im Verzeichnis');
      }
      case 'icd10': {
        const code = kontext.icd(fund.wert);
        return code
          ? mitWert('icd', 'Diagnose (ICD-10)', fund, code)
          : ohneWert('icd', 'Diagnose (ICD-10)', fund, 'Kein ICD-10-Code');
      }
      case 'diagnose':
        return mitWert('diagnose', 'Diagnose oder Leitsymptomatik', fund, fund.wert);
      case 'heilmittel': {
        const position = positionAus(fund.wert);
        if (position === null) return ohneWert('position', 'Heilmittel', fund, 'Nicht im Katalog');
        if (position.anzahl === null)
          return ohneWert('position', 'Heilmittel', fund, 'Anzahl fehlt');
        const anzeige = `${position.remedy} · ${String(position.anzahl)}`;
        return mitWert('position', 'Heilmittel', fund, position.remedy, anzeige, position.anzahl);
      }
      case 'hausbesuch':
        return /(?:^|[^\p{L}\p{N}])ja(?![\p{L}\p{N}])/iu.test(fund.wert)
          ? mitWert('hausbesuch', 'Hausbesuch je Termin', fund, 'ja', 'Ja')
          : ohneWert('hausbesuch', 'Hausbesuch je Termin', fund, 'Nicht angekreuzt');
    }
  });
}

/** Der Stand des Formulars, soweit ein Vorschlag ihn berührt. */
export interface Formularstand {
  readonly issuedOn: string;
  readonly kind: string;
  readonly prescriberId: string;
  readonly icd: string;
  readonly diagnose: string;
  readonly zeilen: readonly {
    readonly id: string | null;
    readonly remedy: string;
    readonly anzahl: string;
  }[];
  readonly hausbesuch: boolean;
}

/**
 * Trägt die zuordenbaren Werte ein - nur in leere Felder; Positionen nur, solange keine gewählt
 * ist. Was schon dasteht, bleibt, wie es ist: Die Person hat es selbst eingetragen.
 */
export function uebernimm(
  stand: Formularstand,
  vorschlaege: readonly Feldvorschlag[],
): { readonly stand: Formularstand; readonly uebernommen: number; readonly belassen: number } {
  let neu = stand;
  let uebernommen = 0;
  let belassen = 0;
  const textfeld = (aktuell: string, wert: string, setze: (wert: string) => Formularstand) => {
    if (aktuell.trim() === '') {
      neu = setze(wert);
      uebernommen += 1;
    } else if (aktuell !== wert) belassen += 1;
  };
  const brauchbar = vorschlaege.filter((v) => v.wert !== null);
  for (const v of brauchbar) {
    const wert = v.wert!;
    if (v.feld === 'issued_on') textfeld(neu.issuedOn, wert, (w) => ({ ...neu, issuedOn: w }));
    if (v.feld === 'kind') textfeld(neu.kind, wert, (w) => ({ ...neu, kind: w }));
    if (v.feld === 'prescriber_id')
      textfeld(neu.prescriberId, wert, (w) => ({ ...neu, prescriberId: w }));
    if (v.feld === 'icd') textfeld(neu.icd, wert, (w) => ({ ...neu, icd: w }));
    if (v.feld === 'diagnose') textfeld(neu.diagnose, wert, (w) => ({ ...neu, diagnose: w }));
    if (v.feld === 'hausbesuch' && !neu.hausbesuch) {
      neu = { ...neu, hausbesuch: true };
      uebernommen += 1;
    }
  }
  const positionen = brauchbar.filter((v) => v.feld === 'position');
  if (positionen.length > 0) {
    if (neu.zeilen.every((zeile) => zeile.remedy === '')) {
      neu = {
        ...neu,
        zeilen: positionen.map((v) => ({ id: null, remedy: v.wert!, anzahl: String(v.anzahl) })),
      };
      uebernommen += positionen.length;
    } else belassen += positionen.length;
  }
  return { stand: neu, uebernommen, belassen };
}
