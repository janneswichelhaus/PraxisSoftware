import { createContext } from 'react';
import type { Bibliothek, Uebung, Variante } from '../api';
import { alsDosis } from '../katalog/dosierung';
import type { Dosierung, Katalogeintrag, Katalogvorlage } from '../katalog/typen';
import { KATALOG_VORLAGEN } from '../katalog/vorlagen';
import type { Plan, Praxisvorlage, VorlagenUebung } from './api';
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

/**
 * Eine Vorlage zur Wahl (UEB-014): mitgeliefert - die Übungen über ihren
 * Katalogschlüssel - oder von der Praxis (`praxis`) - die Übungen über die
 * Kennung ihrer Variante, mit der Dosierung, wie sie gespeichert wurde.
 */
export interface Vorlage {
  schluessel: string;
  name: string;
  ziel: string;
  uebungen: readonly { schluessel: string; dosierung?: Dosierung; dosis?: Dosis }[];
  /** Eine Vorlage der Praxis (ANN-560): `schluessel` der Übungen ist die Kennung der Variante. */
  praxis?: true;
}

/** Eine Vorlage der Praxis in der Form der Wahl. */
export function alsVorlage(vorlage: Praxisvorlage): Vorlage {
  return {
    schluessel: `praxis-${vorlage.id}`,
    name: vorlage.name,
    ziel: vorlage.goal ?? '',
    praxis: true,
    uebungen: vorlage.items.map(({ variant_id, ...dosis }) => ({ schluessel: variant_id, dosis })),
  };
}

/**
 * Die Übungen eines Plans als Übungen einer Vorlage (ANN-560): Variante und
 * Dosierung - kein Hinweis der Position, keine Person. Was archiviert ist,
 * bleibt draußen; die Bibliothek bietet es nicht mehr an.
 */
export function vorlagenUebungen(plan: Pick<Plan, 'items'>): VorlagenUebung[] {
  return plan.items
    .filter((p) => !p.variant_archived)
    .map((p) => ({
      variant_id: p.variant_id,
      sets: p.sets,
      reps_min: p.reps_min,
      reps_max: p.reps_max,
      duration_seconds: p.duration_seconds,
      hold_seconds: p.hold_seconds,
      per_side: p.per_side,
      times_per_day: p.times_per_day,
      load: p.load,
      tempo: p.tempo,
      rest_seconds: p.rest_seconds,
      double_progression: p.double_progression,
    }));
}

/**
 * Die Vorlagen zur Wahl - die der Praxis zuerst, dann die mitgelieferten,
 * je nach Name, sonst nichts. Kein zweiter Parameter.
 */
export function vorlagenListe<T extends Vorlage>(vorlagen: readonly T[]): T[] {
  return [...vorlagen].sort(
    (a, b) => Number(!a.praxis) - Number(!b.praxis) || a.name.localeCompare(b.name, 'de'),
  );
}

/**
 * Eine Übung der Vorlage in der Vorschau (Befund B9): wählbar - aus
 * der Bibliothek oder, wenn sie der Praxis fehlt, für owner aus dem Katalog
 * mit ihrem Eintrag, den der Server beim Hinzufügen übernimmt -, archiviert,
 * oder für alle anderen Rollen „nicht in der Bibliothek“ (ANN-293: übernehmen
 * darf nur owner).
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
  | { art: 'archiviert'; schluessel: string; name: string }
  | { art: 'fehlt'; schluessel: string; name: string };

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
  vorlage: Vorlage,
  bibliothek: Bibliothek,
  katalog: readonly Katalogeintrag[],
  /** Darf die Rolle Fehlendes aus dem Katalog übernehmen (owner, ANN-293)? */
  uebernehmen = true,
): Vorlagenzeile[] {
  if (vorlage.praxis) return praxisZeilen(vorlage, bibliothek);
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
    if (!uebernehmen) {
      zeilen.push({ art: 'fehlt', schluessel: eintrag.schluessel, name: ausKatalog.name });
      continue;
    }
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
 * Die Übungen einer Vorlage der Praxis (UEB-014): über die Kennung der
 * Variante, mit der gespeicherten Dosierung. Was die Praxis seither
 * archiviert hat, steht als archiviert da; eine gelöschte Variante ist schon
 * aus der Vorlage gefallen.
 */
function praxisZeilen(vorlage: Vorlage, bibliothek: Bibliothek): Vorlagenzeile[] {
  const zeilen: Vorlagenzeile[] = [];
  for (const eintrag of vorlage.uebungen) {
    for (const uebung of bibliothek.exercises) {
      const variante = uebung.variants.find((v) => v.id === eintrag.schluessel);
      if (!variante) continue;
      if (uebung.archived || variante.archived) {
        zeilen.push({ art: 'archiviert', schluessel: eintrag.schluessel, name: variante.name });
      } else {
        zeilen.push({
          art: 'waehlbar',
          schluessel: eintrag.schluessel,
          uebung,
          variante,
          dosis: eintrag.dosis ?? standardDosis(variante),
        });
      }
      break;
    }
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
