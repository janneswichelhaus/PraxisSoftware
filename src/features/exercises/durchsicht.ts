import type { Bibliothek, Uebung, Variante } from './api';
import { ungeprueft } from './suche';
import { KOERPERREGIONEN, type Koerperregion } from './types';

/**
 * Die Durchsicht des Katalogs (UEB-015, ANN-386, ANN-561): was die Praxis
 * aus dem Katalog übernommen und noch nicht durchgesehen hat, in einer
 * festen Reihenfolge - nach Region, dann Bezeichnung. Archiviertes zählt
 * nicht; es steht in keinem neuen Plan.
 *
 * Eine Reihenfolge der Arbeit, keine Auswahl für eine Person (ADR-006
 * Punkt 10): Nichts hier liest Angaben einer Person.
 */
export interface Durchsichtsposten {
  uebung: Uebung;
  variante: Variante;
}

export function offeneDurchsicht(bibliothek: Bibliothek): Durchsichtsposten[] {
  const posten: Durchsichtsposten[] = [];
  for (const uebung of bibliothek.exercises) {
    if (uebung.archived) continue;
    for (const variante of uebung.variants) {
      if (!variante.archived && ungeprueft(variante)) posten.push({ uebung, variante });
    }
  }
  const rang = (r: Koerperregion) => KOERPERREGIONEN.indexOf(r);
  return posten.sort(
    (a, b) =>
      rang(a.uebung.body_region) - rang(b.uebung.body_region) ||
      a.uebung.name.localeCompare(b.uebung.name, 'de') ||
      a.variante.name.localeCompare(b.variante.name, 'de'),
  );
}

/**
 * Der nächste Posten: der erste, der weder eben vermerkt noch übersprungen
 * ist; sind nur noch übersprungene offen, wieder der erste davon.
 */
export function naechster(
  offen: readonly Durchsichtsposten[],
  vermerkt: ReadonlySet<string>,
  uebersprungen: readonly string[],
): Durchsichtsposten | null {
  const rest = offen.filter((p) => !vermerkt.has(p.variante.id));
  return (
    rest.find((p) => !uebersprungen.includes(p.variante.id)) ??
    // Übersprungenes kommt in der Reihenfolge des Überspringens wieder.
    uebersprungen
      .map((id) => rest.find((p) => p.variante.id === id))
      .find((p): p is Durchsichtsposten => p !== undefined) ??
    null
  );
}
