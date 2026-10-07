import type { Bibliothek, Uebung, Variante } from './api';

/** Wo eine Variante in der Bibliothek steht. */
export interface Ort {
  uebung: Uebung;
  variante: Variante;
}

/** Wo jede Variante der Bibliothek steht - für Verbindungen über Übungen hinweg. */
export function variantenOrte(bibliothek: Bibliothek): Map<string, Ort> {
  const orte = new Map<string, Ort>();
  for (const uebung of bibliothek.exercises) {
    for (const variante of uebung.variants) orte.set(variante.id, { uebung, variante });
  }
  return orte;
}
