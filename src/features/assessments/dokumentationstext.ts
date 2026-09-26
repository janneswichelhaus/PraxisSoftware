import type {
  BausteinBlock,
  BausteinItem,
  BausteinRegion,
  BefundErgebnis,
  TechnikErgebnis,
} from './schema';

/**
 * Aus abgehakten Untersuchungsbausteinen wird Dokumentationstext
 * (FRB-003b, Phase P3).
 *
 * Deterministische Textmontage nach den Regeln des Arbeitsauftrags
 * (`quellen/ARBEITSAUFTRAG_Bausteine-und-Scores.md`, §2) — kein Sprachmodell,
 * keine Bewertung (ADR-006 Punkt 2, Plan Abschnitt 3):
 *
 *   - Ein Item mit `nicht_durchgefuehrt` erscheint nicht.
 *   - Reihenfolge ist die der Definition, nicht die des Antippens.
 *   - Je Item: `<Label><, Seite><: Ergebnis><, Messwert>.< Freitext>`.
 *   - Ein Block ohne dokumentiertes Item erzeugt keine Überschrift.
 *
 * Der Text ist ein **Vorschlag**. Erst wenn die Therapeut:in ihn übernimmt,
 * steht er im Entwurf der Behandlungsdokumentation (ADR-016); die einzelnen
 * Häkchen werden nicht gespeichert (**ANN-120**).
 */

export const SEITEN = ['links', 'rechts', 'beidseits'] as const;
export type Seite = (typeof SEITEN)[number];

/** Was zu einem Test oder einer Technik angegeben ist. */
export interface Angabe {
  ergebnis: BefundErgebnis | TechnikErgebnis;
  seite?: Seite | undefined;
  /** Wie eingegeben; in den Text nur, wenn es eine Zahl ist. */
  messwert?: string | undefined;
  notiz?: string | undefined;
}

/** Angaben je Kennung — eines Items oder eines Unterpunkts. */
export type Auswahl = Readonly<Record<string, Angabe>>;

export const ERGEBNIS_TEXT: Record<BefundErgebnis | TechnikErgebnis, string> = {
  nicht_durchgefuehrt: 'nicht durchgeführt',
  ohne_befund: 'ohne Befund',
  positiv: 'positiv',
  negativ: 'negativ',
  nicht_beurteilbar: 'nicht beurteilbar',
  durchgefuehrt: 'durchgeführt',
};

/** Höchstlänge der Notiz an einem Test. */
export const NOTIZ_MAX = 300;

/**
 * Ein seitengetrennter Test mit Messwert — Knee to Wall, Navicular Drop —
 * wird **je Seite** erfasst: eigenes Ergebnis, eigener Wert, eigene Notiz
 * für links und rechts (Jannes, 2026-09-26). Der Vergleich der Seiten ist der
 * Sinn der Messung; ein Wert mit einer Seite reichte dafür nicht.
 *
 * Die Regel hängt am Schema, nicht an zwei Testnamen: Jeder künftige Test
 * mit `bilateral` und `value_field` bekommt dasselbe.
 */
export const MESSSEITEN = ['links', 'rechts'] as const;
export type Messseite = (typeof MESSSEITEN)[number];

export function jeSeiteGemessen(item: BausteinItem): boolean {
  return item.bilateral && item.value_field !== undefined && item.subitems === undefined;
}

/** Die Kennung der Angabe zu einer Seite. Keine Testkennung: nur ein Schlüssel der Auswahl. */
export function seitenKennung(kennung: string, seite: Messseite): string {
  return `${kennung}.${seite}`;
}

/** Alle Schlüssel, unter denen ein Item in der Auswahl Angaben trägt. */
export function kennungenDes(item: BausteinItem): string[] {
  if (item.subitems) return item.subitems.map((subitem) => subitem.id);
  if (jeSeiteGemessen(item)) return MESSSEITEN.map((seite) => seitenKennung(item.id, seite));
  return [item.id];
}

/**
 * Ein Messwert ist eine nicht negative Zahl, als Ganzzahl oder mit Komma
 * beziehungsweise Punkt. Bewusst ohne verschachtelte Quantoren
 * (`security/detect-unsafe-regex`).
 */
export function istMesswert(text: string, input: 'zahl' | 'ganzzahl'): boolean {
  const ganz = /^\d{1,6}$/;
  if (input === 'ganzzahl') return ganz.test(text);
  const teile = text.split(/[.,]/);
  if (teile.length > 2) return false;
  const [vorn = '', hinten] = teile;
  return ganz.test(vorn) && (hinten === undefined || /^\d{1,3}$/.test(hinten));
}

/**
 * Steht irgendwo ein Messwert, der keine Zahl ist? Dann fiele er still aus dem
 * Text — deshalb hält das Feld die Übernahme an, bis er korrigiert ist.
 */
export function ungueltigeMesswerte(
  regionen: readonly BausteinRegion[],
  auswahl: Auswahl,
): boolean {
  return regionen.some((region) =>
    region.blocks.some((block) =>
      block.items.some((item) => {
        const messfeld = item.value_field;
        if (messfeld === undefined) return false;
        return kennungenDes(item).some((kennung) => {
          const wert = auswahl[kennung]?.messwert?.trim();
          return !!wert && !istMesswert(wert, messfeld.input);
        });
      }),
    ),
  );
}

/** Ein Zeilenumbruch in der Notiz würde die Zeile des Tests zerreißen. */
function einzeilig(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function zeile(label: string, angabe: Angabe | undefined, item: BausteinItem): string | null {
  if (!angabe || angabe.ergebnis === 'nicht_durchgefuehrt') return null;

  let text = label;
  if (angabe.seite) text += `, ${angabe.seite}`;
  text += `: ${ERGEBNIS_TEXT[angabe.ergebnis]}`;

  const messwert = angabe.messwert?.trim();
  if (item.value_field && messwert && istMesswert(messwert, item.value_field.input)) {
    text += `, ${messwert} ${item.value_field.unit}`;
  }
  text += '.';

  const notiz = einzeilig(angabe.notiz ?? '');
  if (notiz) text += ` ${notiz}`;
  return text;
}

/** Die Zeilen eines Items — eine je Unterpunkt oder je gemessener Seite. */
function zeilenDesItems(item: BausteinItem, auswahl: Auswahl): string[] {
  if (jeSeiteGemessen(item)) {
    return MESSSEITEN.flatMap((seite) => {
      const angabe = auswahl[seitenKennung(item.id, seite)];
      const text = zeile(item.label, angabe && { ...angabe, seite }, item);
      return text ? [text] : [];
    });
  }
  if (item.subitems) {
    return item.subitems.flatMap((subitem) => {
      const text = zeile(`${item.label} – ${subitem.label}`, auswahl[subitem.id], item);
      return text ? [text] : [];
    });
  }
  const text = zeile(item.label, auswahl[item.id], item);
  return text ? [text] : [];
}

/**
 * Die Überschrift nennt die Region, wenn der Block sie nicht selbst nennt:
 * „Basisuntersuchung Knie" bleibt, „Therapie" wird „Knie – Therapie".
 */
export function blockUeberschrift(region: BausteinRegion, block: BausteinBlock): string {
  return block.label.includes(region.label) ? block.label : `${region.label} – ${block.label}`;
}

export function dokumentationstext(regionen: readonly BausteinRegion[], auswahl: Auswahl): string {
  const absaetze: string[] = [];
  for (const region of regionen) {
    for (const block of region.blocks) {
      const zeilen = block.items.flatMap((item) => zeilenDesItems(item, auswahl));
      if (zeilen.length > 0)
        absaetze.push([blockUeberschrift(region, block), ...zeilen].join('\n'));
    }
  }
  return absaetze.join('\n\n');
}

/** Warum eine Dokumentationsseite nicht speichert oder abschließt (ANN-120). */
export const VORSCHLAG_OFFEN =
  'Der Vorschlag aus den Bausteinen steht noch nicht im Text. Bitte übernehmen oder verwerfen, dann speichern oder abschließen.';
