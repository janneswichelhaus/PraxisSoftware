import { createContext } from 'react';
import type { Bibliothek, Variante } from '@/features/exercises/api';
import { alsDosis } from '@/features/exercises/katalog/dosierung';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { KATALOG_VORLAGEN } from '@/features/exercises/katalog/vorlagen';
import type { Dosis } from './dosierung';
import { standardDosis } from './hinzufuegen';

/**
 * „Aus Vorlage" im Planeditor (ANN-444, Welle B): die mitgelieferten Zusammenstellungen
 * des Katalogs (`KATALOG_VORLAGEN`), nach Thema benannt.
 *
 * **Die Vorlagenliste liest nie Angaben der Person** (ADR-006 Punkt 10): Sie
 * hängt nur an den Vorlagen selbst, geordnet nach Name - nicht nach Diagnose,
 * Verordnung, Befund oder Verlauf, nichts vorgefiltert, nichts vorausgewählt.
 * `vorlagen.test.ts` hält das fest. Die Fachperson wählt von Hand.
 *
 * Die Vorlagen kommen über einen Kontext, damit Prüfseiten und Tests eigene
 * synthetische Vorlagen zeigen können - unabhängig vom Inhalt des Katalogs.
 */
export const VorlagenKontext = createContext<readonly Katalogvorlage[]>(KATALOG_VORLAGEN);

/** Die Vorlagen zur Wahl - nach Name, sonst nichts. Kein zweiter Parameter. */
export function vorlagenListe(vorlagen: readonly Katalogvorlage[]): Katalogvorlage[] {
  return [...vorlagen].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

export interface Vorlagenposition {
  schluessel: string;
  variante: Variante;
  dosis: Dosis;
}

export interface VorlagenStand {
  /** Was die Praxis hat, in der Reihenfolge der Vorlage. */
  positionen: Vorlagenposition[];
  /** Schlüssel, die die Bibliothek der Praxis gar nicht kennt - owner kann sie übernehmen. */
  fehlend: string[];
  /** Schlüssel, deren Übung oder Variante die Praxis archiviert hat. */
  archiviert: string[];
}

/**
 * Welche Übungen einer Vorlage die Bibliothek der Praxis hat: über den
 * Katalogschlüssel (`catalog_key`, ANN-382) zur Variante der Praxis. Die
 * Dosierung ist die der Vorlage, sonst die Standarddosierung (ANN-384).
 */
export function ausVorlage(vorlage: Katalogvorlage, bibliothek: Bibliothek): VorlagenStand {
  const stand: VorlagenStand = { positionen: [], fehlend: [], archiviert: [] };
  for (const eintrag of vorlage.uebungen) {
    let gefunden: Variante | undefined;
    let nurArchiviert = false;
    for (const uebung of bibliothek.exercises) {
      for (const variante of uebung.variants) {
        if (variante.catalog_key !== eintrag.schluessel) continue;
        if (uebung.archived || variante.archived) nurArchiviert = true;
        else gefunden ??= variante;
      }
    }
    if (gefunden) {
      stand.positionen.push({
        schluessel: eintrag.schluessel,
        variante: gefunden,
        dosis: eintrag.dosierung ? alsDosis(eintrag.dosierung) : standardDosis(gefunden),
      });
    } else if (nurArchiviert) {
      stand.archiviert.push(eintrag.schluessel);
    } else {
      stand.fehlend.push(eintrag.schluessel);
    }
  }
  return stand;
}
