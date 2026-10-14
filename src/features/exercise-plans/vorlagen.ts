import { createContext } from 'react';
import type { Bibliothek, Uebung, Variante } from '@/features/exercises/api';
import { alsDosis } from '@/features/exercises/katalog/dosierung';
import type { Katalogeintrag, Katalogvorlage } from '@/features/exercises/katalog/typen';
import { KATALOG_VORLAGEN } from '@/features/exercises/katalog/vorlagen';
import type { Dosis } from './dosierung';
import { standardDosis } from './hinzufuegen';
import { alsUebung } from './uebungsliste';

/**
 * „Aus Vorlage" im Planeditor (ANN-444, Welle B): die mitgelieferten Zusammenstellungen
 * des Katalogs (`KATALOG_VORLAGEN`), nach Thema benannt. Seit Befund B9 mit
 * Vorschau: Ein Tipp auf eine Vorlage zeigt ihre Übungen mit Haken.
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

/**
 * Eine Übung der Vorlage in der Vorschau (Befund B9): wählbar - aus
 * der Bibliothek oder, wenn sie der Praxis fehlt, aus dem Katalog mit ihrem
 * Eintrag, den der Server beim Hinzufügen übernimmt -, oder archiviert.
 */
export type Vorlagenzeile =
  | {
      art: 'waehlbar';
      schluessel: string;
      uebung: Uebung;
      variante: Variante;
      /** Die Dosierung der Vorlage, sonst die Standarddosierung (ANN-384). */
      dosis: Dosis;
      /** Nur im Katalog: der Eintrag, den der Server übernimmt. */
      eintrag?: Katalogeintrag;
    }
  | { art: 'archiviert'; schluessel: string; name: string };

/**
 * Die Übungen einer Vorlage in ihrer Reihenfolge: über den Katalogschlüssel
 * (`catalog_key`, ANN-382) zur Variante der Praxis, sonst zum Eintrag des
 * Katalogs. Was die Praxis archiviert hat, bleibt archiviert und kommt nicht
 * über den Katalog zurück. Ein Schlüssel, den weder Bibliothek noch Katalog
 * kennen, fällt weg.
 *
 * Bekommt nur Vorlage, Bibliothek und Katalog - keine Person (ADR-006 Punkt 10).
 */
export function vorlagenZeilen(
  vorlage: Katalogvorlage,
  bibliothek: Bibliothek,
  katalog: readonly Katalogeintrag[],
): Vorlagenzeile[] {
  const zeilen: Vorlagenzeile[] = [];
  for (const eintrag of vorlage.uebungen) {
    let gefunden: { uebung: Uebung; variante: Variante } | undefined;
    let archiviert: string | undefined;
    for (const uebung of bibliothek.exercises) {
      for (const variante of uebung.variants) {
        if (variante.catalog_key !== eintrag.schluessel) continue;
        if (uebung.archived || variante.archived) archiviert ??= variante.name;
        else gefunden ??= { uebung, variante };
      }
    }
    const vorgabe = eintrag.dosierung ? alsDosis(eintrag.dosierung) : undefined;
    if (gefunden) {
      zeilen.push({
        art: 'waehlbar',
        schluessel: eintrag.schluessel,
        ...gefunden,
        dosis: vorgabe ?? standardDosis(gefunden.variante),
      });
      continue;
    }
    if (archiviert !== undefined) {
      zeilen.push({ art: 'archiviert', schluessel: eintrag.schluessel, name: archiviert });
      continue;
    }
    const ausKatalog = katalog.find((e) => e.schluessel === eintrag.schluessel);
    if (!ausKatalog) continue;
    const uebung = alsUebung(ausKatalog);
    const variante = uebung.variants[0]!;
    zeilen.push({
      art: 'waehlbar',
      schluessel: eintrag.schluessel,
      uebung,
      variante,
      dosis: vorgabe ?? standardDosis(variante),
      eintrag: ausKatalog,
    });
  }
  return zeilen;
}

/**
 * ANN-537: Vorausgewählt ist jede wählbare Übung der Vorlage - der Inhalt der
 * Vorlage, für jede Person gleich -, außer was schon im Plan steht. Die
 * Fachperson nimmt einzelne heraus; nichts davon liest Angaben der Person
 * (ADR-006 Punkt 10).
 */
export function vorausgewaehlt(
  zeilen: readonly Vorlagenzeile[],
  imPlan: ReadonlySet<string>,
): string[] {
  return zeilen.flatMap((z) =>
    z.art === 'waehlbar' && !imPlan.has(z.variante.id) ? [z.schluessel] : [],
  );
}
