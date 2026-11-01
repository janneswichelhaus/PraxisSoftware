// Inhaltstreue als Bauart (ANN-824, §6.3, ADR-006 Punkt 8): Der Adapter ordnet nur Sätzen
// Abschnitte zu, den Text setzt der Gateway aus dem Transkript zusammen. Ergänzen, Weglassen
// oder Umformulieren hat in der Antwort eines Adapters keinen Platz.

import type { Abschnitt } from './typen.ts';

/** Satzweise - getrennt wird nur an Leerraum nach `.`, `!`, `?` oder `…`. */
export function saetze(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/u)
    .map((satz) => satz.trim())
    .filter((satz) => satz !== '');
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
