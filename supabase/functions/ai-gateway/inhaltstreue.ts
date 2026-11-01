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
