// Der Adapter ohne Anbieter (ADR-005 Punkt 5), in der Produktion ausgeschlossen (`auswahl.ts`).
// Er hört die Aufnahme nicht an, liefert immer dasselbe synthetische Diktat und gibt sich mit
// `quelle: 'nachbildung'` zu erkennen; die Zuordnung folgt festen Signalwörtern.

import { DIKTAT_ABSCHNITTE } from './zwecke.ts';
import type {
  Adapterergebnis,
  Assistenzadapter,
  Sprachadapter,
  Zuordnungsanfrage,
} from './typen.ts';

/**
 * Das feste, synthetische Diktat der Nachbildung - mit allem, was die Inhaltstreue nach §6.3
 * erhalten muss: Zahlen, Körperseiten, Verneinung, Unsicherheit, Aussage und Beobachtung.
 */
export const NACHGEBILDETES_DIKTAT =
  'Patientin berichtet, das rechte Knie sei seit dem letzten Termin besser, Schmerz drei von zehn. ' +
  'Keine Schwellung. Beugung rechts 110 Grad, links 135 Grad. ' +
  'Mobilisation Knie rechts und Kräftigung Quadrizeps. ' +
  'Eigenübungen weiter, vielleicht nächstes Mal Treppe [unverständlich].';

/**
 * Signalwörter je Abschnitt, in der Reihenfolge der Prüfung, nur als ganzes Wort. Berichtende
 * Verben zuerst: „Patientin sagt, die Mobilisation habe geholfen" ist ihre Aussage.
 */
const ANSAGE = /^(?:(Angaben|Anamnese)|(Befund)|(Behandlung)|(Plan))(?![\p{L}\p{N}])/iu;
const SIGNALE: readonly { readonly abschnitt: string; readonly muster: RegExp }[] = [
  {
    abschnitt: 'Angaben der Patient:in',
    muster:
      /(?<![\p{L}\p{N}])(?:berichtet|gibt an|sagt|klagt|äußert|erzählt|beschreibt)(?![\p{L}\p{N}])/iu,
  },
  {
    abschnitt: 'Plan',
    muster:
      /(?<![\p{L}\p{N}])(?:Plan|nächstes Mal|nächste Woche|weiter mit|Hausaufgabe)(?![\p{L}\p{N}])/iu,
  },
  {
    abschnitt: 'Behandlung',
    muster:
      /(?<![\p{L}\p{N}])(?:Behandlung|behandelt|Mobilisation|Kräftigung|Dehnung|Massage|Lymphdrainage|Gangschule)(?![\p{L}\p{N}])/iu,
  },
  {
    abschnitt: 'Befund',
    muster:
      /(?<![\p{L}\p{N}])(?:Befund|Schwellung|Beugung|Streckung|Grad|tastbar|Rötung|Druckschmerz|Beweglichkeit)(?![\p{L}\p{N}])/iu,
  },
];

/** Der Abschnitt eines Satzes - oder `null`, wenn kein Signal darin steht. */
function abschnittVon(satz: string): string | null {
  const ansage = ANSAGE.exec(satz);
  if (ansage) {
    if (ansage[1]) return 'Angaben der Patient:in';
    if (ansage[2]) return 'Befund';
    if (ansage[3]) return 'Behandlung';
    return 'Plan';
  }
  return SIGNALE.find(({ muster }) => muster.test(satz))?.abschnitt ?? null;
}

/**
 * Je Satz ein Titel der Vorlage. Ein Satz ohne Signal folgt dem vorigen, der erste ohne Signal
 * gilt als Befund; was die Vorlage nicht kennt, fällt auf den Befund.
 */
export function ordneZu(liste: readonly string[], vorlage: readonly string[]): string[] {
  const reihenfolge = vorlage.length > 0 ? vorlage : DIKTAT_ABSCHNITTE;
  const fallback = reihenfolge.includes('Befund') ? 'Befund' : reihenfolge[0]!;
  let zuletzt = fallback;
  return liste.map((satz) => {
    const gefunden = abschnittVon(satz) ?? zuletzt;
    zuletzt = reihenfolge.includes(gefunden) ? gefunden : fallback;
    return zuletzt;
  });
}

export function erstelleNachbildung(): Sprachadapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    transkribiere(): Promise<Adapterergebnis<{ readonly transkript: string }>> {
      return Promise.resolve({ ok: true, value: { transkript: NACHGEBILDETES_DIKTAT } });
    },
    ordneZu(
      anfrage: Zuordnungsanfrage,
    ): Promise<Adapterergebnis<{ readonly zuordnung: readonly string[] }>> {
      return Promise.resolve({
        ok: true,
        value: { zuordnung: ordneZu(anfrage.saetze, anfrage.abschnitte) },
      });
    },
  };
}

/** Die Hilfen ohne Ton als Nachbildung: feste Regeln statt eines Sprachmodells. */
export function erstelleAssistenznachbildung(): Assistenzadapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    ordneZu(
      anfrage: Zuordnungsanfrage,
    ): Promise<Adapterergebnis<{ readonly zuordnung: readonly string[] }>> {
      return Promise.resolve({
        ok: true,
        value: { zuordnung: ordneZu(anfrage.saetze, anfrage.abschnitte) },
      });
    },
  };
}
