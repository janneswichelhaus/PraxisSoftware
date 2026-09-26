import type {
  BausteinBlock,
  BausteinItem,
  BausteinRegion,
  BefundErgebnis,
  TechnikErgebnis,
} from './schema';

/**
 * Aus abgehakten Untersuchungsbausteinen wird Dokumentationstext
 * (FRB-003b, Phase P3; Form seit 2026-09-26 nach **ANN-130**).
 *
 * Deterministische Textmontage — kein Sprachmodell, keine Bewertung
 * (ADR-006 Punkt 2, Plan Abschnitt 3). Das Zeichen vor einem Test gibt das
 * Ergebnis wieder, das die Therapeut:in selbst gewählt hat; es entsteht aus
 * nichts anderem.
 *
 *   - Ein Absatz je Block, die Überschrift nennt Region und Seite.
 *   - Je Test eine Zeile: `<Zeichen> <Label>< Seite>< Messwert>< – Notiz>`.
 *   - Unterpunkte stehen eingerückt unter ihrer Gruppe; die Bezeichnung einer
 *     Ausgangsstellung entfällt, ihre Unterpunkte stehen direkt im Absatz.
 *   - „Nicht getestet" sammelt sich in einer Zeile am Ende des Absatzes.
 *   - Techniken stehen als Aufzählung mit „•".
 *   - Reihenfolge ist die der Definition, nicht die des Antippens; ein Block
 *     ohne Angabe erzeugt keine Überschrift.
 *
 * Der Text ist ein **Vorschlag**. Erst wenn die Therapeut:in ihn übernimmt,
 * steht er im Entwurf der Behandlungsdokumentation (ADR-016); die einzelnen
 * Häkchen werden nicht gespeichert (**ANN-120**).
 */

/** Die zwei Seiten, unter denen ein seitengetrennter Test Angaben trägt. */
export const SEITEN = ['links', 'rechts'] as const;
export type Seite = (typeof SEITEN)[number];

/** Die Wahl für eine ganze Region: eine Seite oder beide im Vergleich. */
export const REGIONSSEITEN = ['links', 'rechts', 'beidseits'] as const;
export type Regionsseite = (typeof REGIONSSEITEN)[number];

/** Was zu einem Test oder einer Technik auf einer Seite angegeben ist. */
export interface Angabe {
  ergebnis: BefundErgebnis | TechnikErgebnis;
  /** Wie eingegeben; in den Text nur, wenn es eine Zahl ist. */
  messwert?: string | undefined;
  notiz?: string | undefined;
}

/** Angaben je Schlüssel — Kennung eines Items oder Unterpunkts, bei Seiten mit Seite. */
export type Auswahl = Readonly<Record<string, Angabe>>;

/** Die gewählte Seite je Region (Kennung der Region). */
export type Seitenwahl = Readonly<Record<string, Regionsseite>>;

/** Beschriftung der Schaltflächen. */
export const ERGEBNIS_TEXT: Record<BefundErgebnis | TechnikErgebnis, string> = {
  ohne_befund: 'o.B.',
  positiv: 'positiv',
  nicht_getestet: 'nicht getestet',
  durchgefuehrt: 'durchgeführt',
};

/**
 * Ein Zeichen je Ergebnis, im Text und auf der Schaltfläche (**ANN-130**).
 * Form und Farbe unterscheiden sich, damit es auch ohne Farbsehen trägt.
 * „Nicht getestet" hat bewusst keins: Es steht ausgeschrieben.
 */
export const ERGEBNIS_ZEICHEN: Partial<Record<BefundErgebnis | TechnikErgebnis, string>> = {
  ohne_befund: '✅',
  positiv: '❗',
};

const SEITE_KURZ: Record<Seite | 'beidseits', string> = {
  links: 'li.',
  rechts: 're.',
  beidseits: 'bds.',
};

/** Höchstlänge der Notiz an einem Test. */
export const NOTIZ_MAX = 300;

/**
 * Ein seitengetrennter Test mit Messwert — Knee to Wall, Navicular Drop —
 * wird **immer je Seite** erfasst, auch wenn die Region nur eine Seite hat
 * (Jannes, 2026-09-26): Der Vergleich der Seiten ist der Sinn der Messung.
 *
 * Die Regel hängt am Schema, nicht an zwei Testnamen: Jeder künftige Test
 * mit `bilateral` und `value_field` bekommt dasselbe.
 */
export function jeSeiteGemessen(item: BausteinItem): boolean {
  return item.bilateral && item.value_field !== undefined && item.subitems === undefined;
}

/**
 * Eine Region, in der jeder Test und jede Technik seitengetrennt ist — die
 * Extremitäten und der Kiefer. Dort wird die Seite **einmal für die Region**
 * gewählt; an der Wirbelsäule bekommt jeder seitengetrennte Test links und
 * rechts (**ANN-129**).
 */
export function seitlicheRegion(region: BausteinRegion): boolean {
  const items = region.blocks.flatMap((block) => block.items);
  return items.length > 0 && items.every((item) => item.bilateral);
}

/**
 * Auf welchen Seiten ein Item erfasst wird (**ANN-129**). `undefined` steht
 * für „ohne Seite"; eine leere Liste heißt, dass die Region noch auf ihre
 * Seitenwahl wartet.
 */
export function seitenDes(
  region: BausteinRegion,
  item: BausteinItem,
  wahl: Regionsseite | undefined,
): readonly (Seite | undefined)[] {
  if (!item.bilateral) return [undefined];
  if (jeSeiteGemessen(item) || !seitlicheRegion(region)) return SEITEN;
  if (wahl === undefined) return [];
  return wahl === 'beidseits' ? SEITEN : [wahl];
}

/** Der Schlüssel der Angabe. Keine Testkennung: nur ein Schlüssel der Auswahl. */
export function seitenKennung(kennung: string, seite: Seite | undefined): string {
  return seite ? `${kennung}.${seite}` : kennung;
}

/** Die Kennungen, unter denen ein Item Angaben trägt: je Unterpunkt oder das Item selbst. */
export function kennungenDes(item: BausteinItem): string[] {
  return item.subitems ? item.subitems.map((subitem) => subitem.id) : [item.id];
}

/** Alle Schlüssel, unter denen ein Item in der Auswahl stehen kann — gleich welche Seite. */
function alleSchluesselDes(item: BausteinItem): string[] {
  return kennungenDes(item).flatMap((kennung) =>
    item.bilateral ? SEITEN.map((seite) => seitenKennung(kennung, seite)) : [kennung],
  );
}

/** Wie viele Angaben in einem Block stehen. */
export function angabenImBlock(block: BausteinBlock, auswahl: Auswahl): number {
  return block.items.flatMap(alleSchluesselDes).filter((s) => auswahl[s] !== undefined).length;
}

/**
 * Die Seite einer Region umstellen, ohne dass Angaben unsichtbar liegen
 * bleiben (**ANN-129**): Von einer Seite auf die andere wandern die Angaben
 * mit — meist war die erste Wahl ein Vertipper. Von „beidseits" auf eine
 * Seite fallen die der anderen Seite weg. Gemessene Tests bleiben unberührt,
 * sie haben immer beide Seiten.
 */
export function seiteUmstellen(
  region: BausteinRegion,
  auswahl: Auswahl,
  bisher: Regionsseite | undefined,
  neu: Regionsseite,
): Auswahl {
  if (bisher === undefined || bisher === neu || neu === 'beidseits') return auswahl;
  const andere: Seite = neu === 'links' ? 'rechts' : 'links';
  const ergebnis: Record<string, Angabe> = { ...auswahl };

  for (const item of region.blocks.flatMap((block) => block.items)) {
    if (!item.bilateral || jeSeiteGemessen(item)) continue;
    for (const kennung of kennungenDes(item)) {
      const alt = seitenKennung(kennung, andere);
      const angabe = ergebnis[alt];
      delete ergebnis[alt];
      if (bisher !== 'beidseits' && angabe) ergebnis[seitenKennung(kennung, neu)] = angabe;
    }
  }
  return ergebnis;
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
        return alleSchluesselDes(item).some((schluessel) => {
          const wert = auswahl[schluessel]?.messwert?.trim();
          return !!wert && !istMesswert(wert, messfeld.input);
        });
      }),
    ),
  );
}

/** Ein Zeilenumbruch in der Notiz würde die Zeile des Tests zerreißen. */
function einzeilig(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Eine Angabe auf einer Seite; `beidseits`, wenn beide Seiten gleich lauten. */
interface Eintrag {
  seite: Seite | 'beidseits' | undefined;
  angabe: Angabe;
}

/**
 * Die Einträge eines Tests über seine Seiten. Lauten beide Seiten gleich —
 * Ergebnis und Notiz, ohne Messwert —, stehen sie als einer: „bds." statt
 * zweier Zeilen.
 */
function eintraege(
  kennung: string,
  seiten: readonly (Seite | undefined)[],
  auswahl: Auswahl,
): Eintrag[] {
  const liste = seiten.flatMap((seite) => {
    const angabe = auswahl[seitenKennung(kennung, seite)];
    return angabe ? [{ seite, angabe }] : [];
  });
  const [erster, zweiter] = liste;
  if (
    erster &&
    zweiter &&
    erster.angabe.ergebnis === zweiter.angabe.ergebnis &&
    einzeilig(erster.angabe.notiz) === einzeilig(zweiter.angabe.notiz) &&
    !erster.angabe.messwert?.trim() &&
    !zweiter.angabe.messwert?.trim()
  ) {
    return [{ seite: 'beidseits', angabe: erster.angabe }];
  }
  return liste;
}

/** Was ein Absatz sammelt: Zeilen in Reihenfolge und die nicht getesteten Punkte. */
interface Absatz {
  zeilen: string[];
  nichtGetestet: string[];
}

function schreibe(
  absatz: Absatz,
  item: BausteinItem,
  label: string,
  kennung: string,
  seiten: readonly (Seite | undefined)[],
  auswahl: Auswahl,
  einzug: string,
): void {
  // Hat die Region nur eine Seite, steht sie in der Überschrift.
  const seiteNennen = seiten.length > 1;
  for (const { seite, angabe } of eintraege(kennung, seiten, auswahl)) {
    const seitentext = seiteNennen && seite ? ` ${SEITE_KURZ[seite]}` : '';
    const notiz = einzeilig(angabe.notiz);

    if (angabe.ergebnis === 'nicht_getestet') {
      absatz.nichtGetestet.push(`${label}${seitentext}${notiz ? ` (${notiz})` : ''}`);
      continue;
    }

    let zeile = `${einzug}${ERGEBNIS_ZEICHEN[angabe.ergebnis] ?? '•'} ${label}${seitentext}`;
    const messwert = angabe.messwert?.trim();
    if (item.value_field && messwert && istMesswert(messwert, item.value_field.input)) {
      zeile += ` ${messwert} ${item.value_field.unit}`;
    }
    if (notiz) zeile += ` – ${notiz}`;
    absatz.zeilen.push(zeile);
  }
}

/**
 * Die Überschrift nennt die Region, wenn der Block sie nicht selbst nennt, und
 * die Seite, wenn die Region nur eine hat: „Untersuchung Hüfte" wird
 * „Untersuchung Hüfte rechts", „Therapie" wird „Hüfte rechts – Therapie".
 */
export function blockUeberschrift(
  region: BausteinRegion,
  block: BausteinBlock,
  seite?: Seite,
): string {
  const name = seite ? `${region.label} ${seite}` : region.label;
  return block.label.includes(region.label)
    ? block.label.replace(region.label, name)
    : `${name} – ${block.label}`;
}

function absatzDesBlocks(
  region: BausteinRegion,
  block: BausteinBlock,
  auswahl: Auswahl,
  wahl: Regionsseite | undefined,
): string | null {
  const absatz: Absatz = { zeilen: [], nichtGetestet: [] };

  for (const item of block.items) {
    const seiten = seitenDes(region, item, wahl);
    if (!item.subitems) {
      schreibe(absatz, item, item.label, item.id, seiten, auswahl, '');
      continue;
    }
    // Eine Ausgangsstellung ordnet nur das Abhaken; ihre Unterpunkte stehen
    // direkt im Absatz. Jede andere Gruppe bleibt als Zwischenzeile stehen,
    // ihre Unterpunkte eingerückt darunter — sonst sähe ein folgender
    // einzelner Test aus, als gehöre er noch dazu.
    const gruppe: Absatz = { zeilen: [], nichtGetestet: absatz.nichtGetestet };
    const einzug = item.ausgangsstellung ? '' : '  ';
    for (const subitem of item.subitems) {
      schreibe(gruppe, item, subitem.label, subitem.id, seiten, auswahl, einzug);
    }
    if (gruppe.zeilen.length === 0) continue;
    if (!item.ausgangsstellung) absatz.zeilen.push(`${item.label}:`);
    absatz.zeilen.push(...gruppe.zeilen);
  }

  if (absatz.nichtGetestet.length > 0) {
    absatz.zeilen.push(`Nicht getestet: ${absatz.nichtGetestet.join('; ')}`);
  }
  if (absatz.zeilen.length === 0) return null;

  const eineSeite = seitlicheRegion(region) && wahl !== 'beidseits' ? wahl : undefined;
  return [blockUeberschrift(region, block, eineSeite), ...absatz.zeilen].join('\n');
}

export function dokumentationstext(
  regionen: readonly BausteinRegion[],
  auswahl: Auswahl,
  seitenwahl: Seitenwahl = {},
): string {
  return regionen
    .flatMap((region) =>
      region.blocks.map((block) => absatzDesBlocks(region, block, auswahl, seitenwahl[region.id])),
    )
    .filter((absatz): absatz is string => absatz !== null)
    .join('\n\n');
}

/** Warum eine Dokumentationsseite nicht speichert oder abschließt (ANN-120). */
export const VORSCHLAG_OFFEN =
  'Der Vorschlag aus den Bausteinen steht noch nicht im Text. Bitte übernehmen oder verwerfen, dann speichern oder abschließen.';
