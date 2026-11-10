// Inhaltstreue als Bauart (ANN-824, §6.3, ADR-006 Punkt 8): Der Adapter ordnet nur Sätzen
// Abschnitte zu, den Text setzt der Gateway aus dem Transkript zusammen. Ergänzen, Weglassen
// oder Umformulieren hat in der Antwort eines Adapters keinen Platz.

import type { Abschnitt } from './typen.ts';

// Ein Punkt nach Zahl, Einzelbuchstabe oder gängiger Abkürzung beendet keinen Satz („2.“,
// „z. B.“); lieber ein Satz zu lang als eine Aussage auf zwei Abschnitte verteilt.
const KEIN_SATZENDE = /(?:^|\s)(?:\d+|\p{L}|ca|bzw|ggf|evtl|vgl|inkl|usw|Dr|Nr)\.$/iu;

/** Satzweise - getrennt wird an Leerraum nach `.`, `!`, `?` oder `…`, außer nach `KEIN_SATZENDE`. */
export function saetze(text: string): string[] {
  const liste: string[] = [];
  for (const teil of text.split(/(?<=[.!?…])\s+/u)) {
    const satz = teil.trim();
    if (satz === '') continue;
    const vorig = liste.at(-1);
    if (vorig !== undefined && KEIN_SATZENDE.test(vorig))
      liste[liste.length - 1] = `${vorig} ${satz}`;
    else liste.push(satz);
  }
  return liste;
}

/**
 * ANN-824: je Abschnitt seine Sätze im Wortlaut und in der Reihenfolge des Diktats.
 * `null`, wenn die Zuordnung nicht genau zu den Sätzen passt - sie ist eine Behauptung des
 * Adapters, bis sie geprüft ist.
 */
export function setzeZusammen(
  liste: readonly string[],
  zuordnung: unknown,
  vorlage: readonly string[],
): Abschnitt[] | null {
  if (!Array.isArray(zuordnung) || zuordnung.length !== liste.length) return null;
  const texte = new Map<string, string[]>();
  for (const [stelle, titel] of (zuordnung as unknown[]).entries()) {
    if (typeof titel !== 'string' || !vorlage.includes(titel)) return null;
    texte.set(titel, [...(texte.get(titel) ?? []), liste[stelle]!]);
  }
  return vorlage
    .filter((titel) => texte.has(titel))
    .map((titel) => ({ titel, text: texte.get(titel)!.join(' ') }));
}

/** Ein Satz getippten Textes: Wortlaut, Zeile und der Titel der Vorlage, unter dem er schon steht. */
export interface Einheit {
  readonly text: string;
  readonly zeile: number;
  readonly titel: string | null;
}

/** Der Titel der Vorlage, der allein in dieser Zeile steht - mit oder ohne Doppelpunkt. */
export function titelDerZeile(zeile: string, vorlage: readonly string[]): string | null {
  const ohne = zeile.replace(/:$/, '').trim().toLowerCase();
  return vorlage.find((titel) => titel.toLowerCase() === ohne) ?? null;
}

/**
 * Getippter Text zeilenweise in Sätzen. Eine Zeile, die nur ein Titel der Vorlage ist, ist
 * Gliederung und kein Satz: Was bis zur nächsten Leerzeile darunter steht, ist schon geordnet.
 */
export function einheiten(text: string, vorlage: readonly string[]): Einheit[] {
  const liste: Einheit[] = [];
  let titel: string | null = null;
  for (const [zeile, roh] of text.split(/\r?\n/).entries()) {
    const inhalt = roh.trim();
    if (inhalt === '') {
      titel = null;
      continue;
    }
    const gliederung = titelDerZeile(inhalt, vorlage);
    if (gliederung !== null) {
      titel = gliederung;
      continue;
    }
    for (const satz of saetze(inhalt)) liste.push({ text: satz, zeile, titel });
  }
  return liste;
}

/** Sätze derselben Zeile mit Leerzeichen, verschiedener Zeilen mit Zeilenwechsel. */
export function verbinde(liste: readonly Einheit[]): string {
  let text = '';
  for (const [stelle, einheit] of liste.entries()) {
    if (stelle > 0) text += liste[stelle - 1]!.zeile === einheit.zeile ? ' ' : '\n';
    text += einheit.text;
  }
  return text;
}

/**
 * ANN-861: je Abschnitt die Sätze im Wortlaut und in der Reihenfolge des Textes. Zugeordnet
 * werden nur Sätze ohne Titel; `null`, wenn die Zuordnung nicht genau zu ihnen passt.
 */
export function ordne(
  liste: readonly Einheit[],
  zuordnung: unknown,
  vorlage: readonly string[],
): Abschnitt[] | null {
  const frei = liste.filter((einheit) => einheit.titel === null).length;
  if (!Array.isArray(zuordnung) || zuordnung.length !== frei) return null;
  const jeTitel = new Map<string, Einheit[]>();
  let stelle = 0;
  for (const einheit of liste) {
    const titel: unknown = einheit.titel ?? (zuordnung as unknown[])[stelle++];
    if (typeof titel !== 'string' || !vorlage.includes(titel)) return null;
    jeTitel.set(titel, [...(jeTitel.get(titel) ?? []), einheit]);
  }
  return vorlage
    .filter((titel) => jeTitel.has(titel))
    .map((titel) => ({ titel, text: verbinde(jeTitel.get(titel)!) }));
}
