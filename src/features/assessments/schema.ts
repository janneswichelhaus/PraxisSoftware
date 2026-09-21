import { z } from 'zod';

/**
 * Das Schema der Untersuchungsbausteine (FRB-005).
 *
 * Leitprinzip des Arbeitsauftrags vom 2026-09-21
 * (`quellen/ARBEITSAUFTRAG_Bausteine-und-Scores.md`, §1): **Der Code kennt
 * keinen einzigen Test namentlich — er kennt nur das Schema.** Ein neuer Test
 * ist eine neue Datei unter `definitionen/`, kein Commit an einer Komponente.
 *
 * Die Feldnamen folgen wörtlich dem Arbeitsauftrag (§2), nicht der sonst hier
 * üblichen deutschen Benennung: Die Definitionsdateien sollen sich gegen die
 * Vorgabe halten lassen, ohne dass jemand eine Übersetzungstabelle im Kopf
 * mitführt. Die TypeScript-Typen tragen deutsche Namen, weil sie unsere sind.
 *
 * Was hier **nicht** entsteht: Oberfläche, Datenbank, Auswertung. Das Schema
 * beschreibt die Definition, nicht das Ergebnis; Ergebnisse sind
 * Gesundheitsdaten und kommen mit ihrer Datenklasse, ihrer Frist und ihrer
 * RLS-Policy in einem eigenen Loop (Phase P6 in
 * `docs/development/FRB-BAUSTEINE-UND-SCORES.md`).
 */

/**
 * Eine Kennung ist sprechend, klein geschrieben und **unveränderlich**
 * (Arbeitsauftrag §1). Eine ID, die einmal in einem Ergebnis steht, darf nie
 * wieder etwas anderes bedeuten; ein geändertes Label ändert sie nicht.
 *
 * Deshalb prüft das Schema die Form: Wer `knie_lachmann_test` schreibt, kann
 * sie später nicht versehentlich als `Knie-Lachmann` wiederverwenden.
 */
const KENNUNG_HINWEIS =
  'Kennung muss snake_case sein: Kleinbuchstabe am Anfang, dann Kleinbuchstaben, Ziffern und einfache Unterstriche.';

export const kennungSchema = z
  .string()
  // Bewusst ein flacher Ausdruck ohne verschachtelte Quantoren. Die
  // naheliegende Form /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/ liest sich besser,
  // ist aber anfällig für exponentielles Backtracking und laut ESLint-Regel
  // `security/detect-unsafe-regex` ein Befund. Die beiden Sonderfälle stehen
  // deshalb daneben, statt im Ausdruck.
  .regex(/^[a-z][a-z0-9_]*$/, KENNUNG_HINWEIS)
  .refine((wert) => !wert.includes('__'), KENNUNG_HINWEIS)
  .refine((wert) => !wert.endsWith('_'), KENNUNG_HINWEIS);

/**
 * Semantische Version je Definition (Arbeitsauftrag §1).
 *
 * Jedes gespeicherte Ergebnis hält später die verwendete `definition_version`
 * fest. Ohne dieses Feld bricht jeder Verlauf, sobald ein Itemtext korrigiert
 * wird — und korrigiert wird (D2 bis D6 im Plan). Semantisch statt Datum, weil
 * die Korrektur eines Tippfehlers und das Umschneiden eines Blocks nicht
 * dasselbe Gewicht haben (**ANN-084**).
 */
export const versionSchema = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'Version muss semantisch sein, zum Beispiel "1.0.0".');

/**
 * Die möglichen Ergebnisse eines Tests. `nicht_durchgefuehrt` ist der Standard
 * und erscheint nach §2 nicht im Dokumentationstext.
 */
export const BEFUND_ERGEBNISSE = [
  'nicht_durchgefuehrt',
  'ohne_befund',
  'positiv',
  'negativ',
  'nicht_beurteilbar',
] as const;

/** Techniken werden durchgeführt oder nicht — sie haben keinen Befund (§2). */
export const TECHNIK_ERGEBNISSE = ['nicht_durchgefuehrt', 'durchgefuehrt'] as const;

/**
 * Die vier Blockarten der Vorlage (§2): Basisuntersuchung, weiterführende
 * Untersuchung, Spezialblöcke und Therapie- beziehungsweise
 * Behandlungstechniken.
 */
export const BLOCK_ARTEN = ['basis', 'weiterfuehrend', 'spezial', 'therapie'] as const;

/**
 * Ein Messwert am Item — Knee-to-Wall in Zentimetern, Navicular Drop in
 * Zentimetern, ein Bewegungsausmaß in Grad (§2).
 *
 * Die Einheit steht in der Definition und nicht im Eingabefeld: Ein Wert ohne
 * Einheit ist im Verlauf nicht vergleichbar, und die Einheit gehört zum Test,
 * nicht zur Erhebung.
 */
export const messfeldSchema = z.object({
  label: z.string().min(1),
  unit: z.string().min(1),
  input: z.enum(['zahl', 'ganzzahl']),
});

const subitemSchema = z.object({
  id: kennungSchema,
  /** Wörtlich aus der Quelldatei, samt ihrer Tippfehler (Regel 1, `quellen/README.md`). */
  label: z.string().min(1),
  hint: z.string().min(1).optional(),
});

/**
 * Ein Item ist ein Test oder eine Technik.
 *
 * `result_type` ist an `type` gebunden: Ein Test hat einen Befund, eine
 * Technik wurde durchgeführt oder nicht. Die beiden Felder stehen im
 * Arbeitsauftrag getrennt und könnten auseinanderlaufen — deshalb prüft das
 * Schema die Kopplung, statt sie zu dokumentieren.
 *
 * Kein Feld `note`: Freitext ist nach §2 „immer verfügbar", also eine
 * Eigenschaft jeder Erhebung und keine Angabe der Definition. Ein Feld, das
 * überall `true` wäre, sagt nichts.
 */
export const bausteinItemSchema = z
  .object({
    id: kennungSchema,
    label: z.string().min(1),
    type: z.enum(['test', 'technik']),
    /** `true`, wenn seitengetrennt zu dokumentieren ist (§2). */
    bilateral: z.boolean(),
    result_type: z.enum(['befund', 'durchgefuehrt']),
    value_field: messfeldSchema.optional(),
    /** Durchführungshinweis der Vorlage, etwa „30–60 Sekunden halten" (§2). */
    hint: z.string().min(1).optional(),
    subitems: z.array(subitemSchema).min(1).optional(),
  })
  .superRefine((item, ctx) => {
    const erwartet = item.type === 'test' ? 'befund' : 'durchgefuehrt';
    if (item.result_type !== erwartet) {
      ctx.addIssue({
        code: 'custom',
        path: ['result_type'],
        message: `Ein Item mit type "${item.type}" braucht result_type "${erwartet}" (Arbeitsauftrag §2).`,
      });
    }
  });

/**
 * Ein Block fasst Items zusammen.
 *
 * **Vier Stellen der Vorlage sind unvollständig** (§2: Schulter „Untersuchung
 * ACG", LWS „Untersuchung SIG", LWS „Behandlung", HWS „Therapie
 * Hochzervikal"). Sie werden als leerer Block mit `status:
 * "unvollstaendig"` angelegt und in der Oberfläche als offen gekennzeichnet —
 * nicht aus eigenem Wissen gefüllt. Umgekehrt ist ein leerer Block **ohne**
 * dieses Kennzeichen ein Fehler: Sonst sieht eine vergessene Übertragung
 * genauso aus wie eine bekannte Lücke.
 */
export const blockSchema = z
  .object({
    id: kennungSchema,
    label: z.string().min(1),
    art: z.enum(BLOCK_ARTEN),
    items: z.array(bausteinItemSchema),
    status: z.literal('unvollstaendig').optional(),
  })
  .superRefine((block, ctx) => {
    if (block.items.length === 0 && block.status !== 'unvollstaendig') {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message:
          'Ein Block ohne Items ist nur mit status "unvollstaendig" gültig — sonst sieht eine vergessene Übertragung wie eine bekannte Lücke aus.',
      });
    }
    if (block.items.length > 0 && block.status === 'unvollstaendig') {
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Ein Block mit Items ist nicht "unvollstaendig".',
      });
    }
  });

/**
 * Eine Region ist eine Definitionsdatei: HWS, LWS, Schulter, Ellenbogen, Hand,
 * Hüfte, Knie, Fuß, Kiefer (§2).
 *
 * Die neun Namen stehen **nicht** als Aufzählung im Schema. Sie sind Inhalt,
 * und Inhalt gehört nach dem Leitprinzip in Dateien: Eine zehnte Region wäre
 * sonst eine Codeänderung. Dass es genau diese neun sind, prüft der Zähltest
 * der Phase P2 gegen die Tabelle des Arbeitsauftrags — dort, wo die Zahl
 * hingehört.
 */
export const bausteinRegionSchema = z.object({
  id: kennungSchema,
  label: z.string().min(1),
  version: versionSchema,
  blocks: z.array(blockSchema).min(1),
});

export type Messfeld = z.infer<typeof messfeldSchema>;
export type BausteinItem = z.infer<typeof bausteinItemSchema>;
export type BausteinBlock = z.infer<typeof blockSchema>;
export type BausteinRegion = z.infer<typeof bausteinRegionSchema>;
export type BefundErgebnis = (typeof BEFUND_ERGEBNISSE)[number];
export type TechnikErgebnis = (typeof TECHNIK_ERGEBNISSE)[number];
