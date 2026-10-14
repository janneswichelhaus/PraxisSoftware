/**
 * Der Adapter ohne Anbieter (ADR-005 Punkt 5, KI-EPIC-001).
 *
 * Er macht die ganze Kette - Aufnahme, Gateway, Berechtigung, Vorschlag,
 * Übernahme - entwickel- und prüfbar, ohne dass ein Byte die Anwendung
 * verlässt (PROJECT_PRINCIPLES.md 3.1). Bis zur Anbieterentscheidung ist er
 * der einzige Adapter; in der Produktion ist er ausgeschlossen (`auswahl.ts`).
 *
 * **Er gibt sich zu erkennen.** Die Aufnahme hört er nicht an: Er liefert
 * immer dasselbe synthetische Diktat, und die Antwort trägt
 * `quelle: 'nachbildung'` - die Oberfläche sagt es dazu. Das Diktat enthält
 * mit Absicht alles, was die Inhaltstreue nach 6.3 erhalten muss: Zahlen,
 * Körperseiten, eine Verneinung, eine Unsicherheit, die Aussage der
 * Patientin neben der eigenen Beobachtung und eine Stelle `[unverständlich]`.
 *
 * **Er ordnet nur ein.** Die Einordnung verschiebt ganze Sätze nach festen
 * Signalwörtern in die Abschnitte der Vorlage, wörtlich und in ihrer
 * Reihenfolge. Sie trennt nur an Leerraum nach einem Satzzeichen; jedes Wort
 * des Transkripts steht deshalb genau einmal im Vorschlag (`mock.test.ts`).
 */

import { DIKTAT_ABSCHNITTE } from './zwecke.ts';
import type { Abschnitt, Adapterergebnis, Sprachadapter, Strukturierungsanfrage } from './typen.ts';

/** Das feste, synthetische Diktat der Nachbildung. */
export const NACHGEBILDETES_DIKTAT =
  'Patientin berichtet, das rechte Knie sei seit dem letzten Termin besser, Schmerz drei von zehn. ' +
  'Keine Schwellung. Beugung rechts 110 Grad, links 135 Grad. ' +
  'Mobilisation Knie rechts und Kräftigung Quadrizeps. ' +
  'Eigenübungen weiter, vielleicht nächstes Mal Treppe [unverständlich].';

/**
 * Signalwörter je Abschnitt, in der Reihenfolge der Prüfung. Ein Wort gilt
 * nur ganz (Grenzen über Buchstaben und Ziffern, auch für ä, ö, ü, ß).
 *
 * Berichtende Verben stehen vor allem anderen: „Patientin sagt, die
 * Mobilisation habe geholfen" ist ihre Aussage, nicht die Behandlung.
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

/** Satzweise - getrennt wird nur an Leerraum nach `.`, `!`, `?` oder `…`. */
export function saetze(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((satz) => satz.trim())
    .filter((satz) => satz !== '');
}

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
 * Die Einordnung der Nachbildung: jeder Satz in genau einen Abschnitt, ohne
 * ein Zeichen zu ändern. Ein Satz ohne Signal folgt dem vorigen; der erste
 * ohne Signal gilt als Befund. Abschnitte ohne Satz entfallen.
 */
export function ordneEin(transkript: string, vorlage: readonly string[]): Abschnitt[] {
  const reihenfolge = vorlage.length > 0 ? vorlage : DIKTAT_ABSCHNITTE;
  const fallback = reihenfolge.includes('Befund') ? 'Befund' : reihenfolge[0]!;
  const texte = new Map<string, string[]>();
  let zuletzt = fallback;
  for (const satz of saetze(transkript)) {
    const gefunden = abschnittVon(satz) ?? zuletzt;
    // Ein Abschnitt, den die Vorlage nicht kennt, verliert seinen Satz nicht.
    const ziel = reihenfolge.includes(gefunden) ? gefunden : fallback;
    texte.set(ziel, [...(texte.get(ziel) ?? []), satz]);
    zuletzt = ziel;
  }
  return reihenfolge
    .filter((titel) => texte.has(titel))
    .map((titel) => ({ titel, text: texte.get(titel)!.join(' ') }));
}

export function erstelleNachbildung(): Sprachadapter {
  return {
    id: 'mock',
    quelle: 'nachbildung',
    transkribiere(): Promise<Adapterergebnis<{ readonly transkript: string }>> {
      return Promise.resolve({ ok: true, value: { transkript: NACHGEBILDETES_DIKTAT } });
    },
    strukturiere(
      anfrage: Strukturierungsanfrage,
    ): Promise<Adapterergebnis<{ readonly abschnitte: readonly Abschnitt[] }>> {
      return Promise.resolve({
        ok: true,
        value: { abschnitte: ordneEin(anfrage.transkript, anfrage.abschnitte) },
      });
    },
  };
}
