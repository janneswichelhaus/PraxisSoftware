import type { Formel, ScoreDefinition, ScoreItem } from './schema';

/**
 * Der Rechenkern der Instrumentenbibliothek (FRB-008).
 *
 * **Berechnen ja, bewerten nein** (ADR-006 Punkt 2 und 11). Diese Datei rechnet
 * einen Wert nach der Formel, die in der Definition steht — und sonst nichts.
 * Sie kennt kein Instrument beim Namen, keinen Cut-off, keine MCID und keine
 * Richtung; `interpretation` liest sie nicht einmal. Was aus dem Wert folgt,
 * entscheidet die Therapeutin.
 *
 * Der Wert wird **nicht gerundet**. Gerundet wird bei der Anzeige; ein im Kern
 * gerundeter Wert wäre im Verlauf nicht mehr zu reproduzieren.
 */

/**
 * Antworten je Item-Kennung, in derselben Form wie im Referenzfall.
 *
 * Freitext steht hier nicht: Er geht in keine Rechnung ein, und was in keine
 * Rechnung eingeht, braucht der Rechenkern nicht zu sehen (Datenminimierung).
 */
export type Antworten = Record<string, number | number[]>;

export interface Rechenergebnis {
  /** `null`: kein Gesamtwert — weil die Quelle keinen kennt oder etwas fehlt. */
  gesamt: number | null;
  subskalen: Record<string, number | null>;
  /** Gewertete Items ohne Antwort, in der Reihenfolge der Definition. */
  fehlend: string[];
}

/** Eine Antwort, die zur Definition nicht passt, ist ein Fehler, kein fehlender Wert. */
export class UngueltigeAntwort extends Error {
  constructor(meldung: string) {
    super(meldung);
    this.name = 'UngueltigeAntwort';
  }
}

function pruefeAntwort(item: ScoreItem, antwort: number | number[]): void {
  if (Array.isArray(antwort)) {
    // Eine Mehrfachauswahl, die in eine Rechnung eingeht, hat keines der
    // bekannten Instrumente. Wie sie zaehlt, entscheidet das Instrument, das
    // sie braucht - nicht eine Vermutung hier (ANN-087 sinngemaess).
    throw new UngueltigeAntwort(
      `Item "${item.id}": Eine Mehrfachauswahl geht in keine Rechnung ein.`,
    );
  }
  if (!Number.isFinite(antwort)) {
    throw new UngueltigeAntwort(`Item "${item.id}": Die Antwort ist keine Zahl.`);
  }
  if (item.optionen && !item.optionen.some((option) => option.wert === antwort)) {
    throw new UngueltigeAntwort(`Item "${item.id}": ${antwort} ist keine Antwortoption.`);
  }
  if (item.skala && (antwort < item.skala.min || antwort > item.skala.max)) {
    throw new UngueltigeAntwort(
      `Item "${item.id}": ${antwort} liegt außerhalb von ${item.skala.min} bis ${item.skala.max}.`,
    );
  }
}

function summe(werte: number[]): number {
  return werte.reduce((gesamt, wert) => gesamt + wert, 0);
}

/**
 * Wendet eine Formel auf eine Menge von Items an.
 *
 * **Fehlt ein Wert, gibt es keinen (ANN-098).** Das Inventar sagt für die
 * meisten Instrumente „im PDF nicht geregelt" (D6); einen fehlenden Wert als 0
 * zu zählen oder hochzurechnen hieße, eine Regel zu erfinden. Die einzige
 * Ausnahme steht in der Formel selbst: Beim FAAM verkleinert „nicht
 * zutreffend" das Maximum — `summe_prozent` mit `aus_gewerteten_items`.
 */
function wende(
  formel: Formel,
  werte: Map<string, number>,
  itemIds: string[],
  subskalen: Record<string, number | null>,
): number | null {
  const vorhanden = itemIds.filter((id) => werte.has(id)).map((id) => werte.get(id) as number);
  const vollstaendig = vorhanden.length === itemIds.length;

  switch (formel.art) {
    case 'keine_berechnung':
      return null;
    case 'einzelwert':
      return werte.get(formel.item) ?? null;
    case 'summe':
      return vollstaendig ? summe(vorhanden) : null;
    case 'mittelwert':
      return vollstaendig && vorhanden.length > 0 ? summe(vorhanden) / vorhanden.length : null;
    case 'mittelwert_invertiert':
      return vollstaendig && vorhanden.length > 0
        ? 100 - ((summe(vorhanden) / vorhanden.length) * 100) / formel.item_maximum
        : null;
    case 'summe_prozent': {
      if (formel.maximum === 'aus_gewerteten_items') {
        if (vorhanden.length === 0) return null;
        // Schema-Pruefung sichert item_maximum fuer diesen Fall zu.
        const maximum = vorhanden.length * (formel.item_maximum as number);
        return (summe(vorhanden) / maximum) * 100;
      }
      return vollstaendig ? (summe(vorhanden) / formel.maximum) * 100 : null;
    }
    case 'gewichtete_subskalensumme': {
      let ergebnis = 0;
      for (const [subskala, gewicht] of Object.entries(formel.gewichte)) {
        const wert = subskalen[subskala];
        if (wert === null || wert === undefined) return null;
        ergebnis += wert * gewicht;
      }
      return ergebnis;
    }
  }
}

/**
 * Rechnet ein Instrument nach seiner Definition.
 *
 * Der Gesamtwert rechnet über alle **gewerteten** Items — ein nicht gewertetes
 * steht im Bogen, aber nie in einer Summe (Arbeitsauftrag §3, FABQ).
 * Subskalen zuerst, weil eine gewichtete Summe auf ihnen aufbaut.
 */
export function rechne(definition: ScoreDefinition, antworten: Antworten): Rechenergebnis {
  const items = new Map(definition.items.map((item) => [item.id, item]));
  const werte = new Map<string, number>();

  for (const [itemId, antwort] of Object.entries(antworten)) {
    const item = items.get(itemId);
    if (!item) throw new UngueltigeAntwort(`Unbekanntes Item "${itemId}".`);
    if (!item.gewertet) continue;
    pruefeAntwort(item, antwort);
    werte.set(itemId, antwort as number);
  }

  const gewertet = definition.items.filter((item) => item.gewertet).map((item) => item.id);

  const subskalen: Record<string, number | null> = {};
  for (const subskala of definition.scoring.subskalen) {
    subskalen[subskala.id] = wende(subskala.formel, werte, subskala.items, subskalen);
  }

  const gesamt = definition.scoring.gesamt
    ? wende(definition.scoring.gesamt.formel, werte, gewertet, subskalen)
    : null;

  return { gesamt, subskalen, fehlend: gewertet.filter((id) => !werte.has(id)) };
}
