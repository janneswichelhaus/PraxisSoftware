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
 * **Drei Stellen der Vorlage sind unvollständig** (Plan D2, **ANN-118**):
 * Schulter „Untersuchung ACG" ist leer, LWS „Behandlung" endet mit einem
 * leeren Aufzählungspunkt, HWS „Therapie Hochzervikal" bricht nach dem ersten
 * Punkt ab. Sie tragen `status: "unvollstaendig"` und werden in der
 * Oberfläche als offen gekennzeichnet — nicht aus eigenem Wissen gefüllt. Das
 * Kennzeichen steht deshalb auch an einem Block **mit** Items: Die Vorlage
 * bricht dort ab, und was vor dem Abbruch steht, ist verwendbar. Ein leerer
 * Block **ohne** Kennzeichen bleibt ein Fehler: Sonst sieht eine vergessene
 * Übertragung genauso aus wie eine bekannte Lücke.
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

/* ------------------------------------------------------------------------- *
 * Scores (FRB-006)
 * ------------------------------------------------------------------------- */

/**
 * Das Schema der Scores (PROMs).
 *
 * Die Rechenformen unten sind **aus dem Inventar abgelesen**
 * (`quellen/scores/score-inventar.md`, Blatt „Scoring"), nicht aus dem
 * Modellwissen erfunden — genau das verbietet der Arbeitsauftrag §5 Punkt 2.
 * Die 18 vorliegenden Instrumente brauchen zusammen fünf Rechenformen; dazu
 * kommt „gar keine Berechnung", weil der Anamnesebogen ausdrücklich keinen
 * Summenscore hat, und seit FRB-EPIC-001 der Mittelwert der PSFS. Gerechnet
 * wird in `rechnen.ts`, nirgends sonst.
 */

/**
 * Eine Antwortoption.
 *
 * Bei einem **gewerteten** Item ist sie die Punktzuordnung: Text und Wert, nie
 * nur Text (Prüfung am Item). Bei einem nicht gewerteten Item — der
 * Anamnesebogen hat keinen Summenscore — gibt es keinen Punktwert, und einen
 * zu erfinden wäre genau die Rekonstruktion, die der Arbeitsauftrag §5 Punkt 2
 * verbietet.
 *
 * `id` ist das, was eine Erhebung speichert (FRB-EPIC-002): eine sprechende,
 * unveränderliche Kennung statt einer Position in der Liste. In der Kopie nach
 * Art. 15 steht dann „nachtschmerzen", nicht „1". Eine Option ohne Punktwert
 * braucht sie; eine gewertete Option ohne `id` wird mit ihrem Punktwert
 * gespeichert, den `rechnen.ts` ohnehin erwartet (`optionKennung`, **ANN-102**).
 *
 * `exklusiv` markiert das „nein" einer Mehrfachauswahl: Wer es wählt, wählt
 * nichts anderes. `freitext` markiert „Sonstiges?", „andere Erkrankung?" und
 * „Anderes?" — die Option trägt eine eigene Angabe der Person.
 */
export const optionSchema = z.object({
  id: kennungSchema.optional(),
  label: z.string().min(1),
  wert: z.number().optional(),
  exklusiv: z.boolean().optional(),
  freitext: z.boolean().optional(),
});

/**
 * Was eine Erhebung für eine gewählte Option speichert (**ANN-102**): die
 * Kennung, sonst der Punktwert als Zeichenkette. Die eine Stelle dafür — die
 * Oberfläche, die Prüfung der Antworten und die Hervorhebung lesen sie alle.
 */
export function optionKennung(option: {
  id?: string | undefined;
  wert?: number | undefined;
}): string {
  return option.id ?? String(option.wert);
}

/**
 * Der Wortlaut der Rechenvorschrift **wörtlich aus dem Inventar**, daneben die
 * maschinenlesbare Form.
 *
 * Beides, weil eine Übertragung, die nur noch als Formel existiert, nicht mehr
 * gegen ihre Quelle zu halten ist. Beispiel ODI: Das Inventar sagt „Summe der
 * 10 Sektionen (0-50), x 2 = Prozentwert", die Maschinenform sagt
 * `summe_prozent` mit `maximum: 50`. Dieselbe Zahl, und der Satz bleibt
 * lesbar, wenn jemand das nachprüfen will.
 */
const formelSchema = z.discriminatedUnion('art', [
  /** Anamnesebogen: „Kein Scoring - reine Informationserfassung". */
  z.object({ art: z.literal('keine_berechnung') }),
  /** Tegner: „Direkte Einstufung - keine Berechnung" — ein Item ist der Wert. */
  z.object({ art: z.literal('einzelwert'), item: kennungSchema }),
  /** RMDQ, LEFS, VISA-A, VISA-P, TSK, PCS, PHQ-4, STarT, FABQ-Subskalen. */
  z.object({ art: z.literal('summe') }),
  /**
   * NDI (Summe/50), SPADI (/130), HOOS (/156), ODI (x2), FAAM (erreichte durch
   * mögliche Punkte).
   *
   * Beim FAAM reduziert „nicht zutreffend" ausdrücklich das Maximum, statt als
   * 0 zu zählen — dafür steht `aus_gewerteten_items`, und dann braucht die
   * Form den Höchstwert je Item.
   */
  z
    .object({
      art: z.literal('summe_prozent'),
      maximum: z.union([z.number().positive(), z.literal('aus_gewerteten_items')]),
      item_maximum: z.number().positive().optional(),
    })
    .superRefine((formel, ctx) => {
      if (formel.maximum === 'aus_gewerteten_items' && formel.item_maximum === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['item_maximum'],
          message:
            'Bei maximum "aus_gewerteten_items" muss item_maximum den Höchstwert je Item nennen.',
        });
      }
    }),
  /**
   * PSFS: Mittelwert der bewerteten Aktivitäten (FRB-EPIC-001). Die einzige
   * Form, die nicht aus dem Inventar der 18 stammt, sondern mit dem ersten
   * Instrument kam, das sie braucht (ANN-087 gilt sinngemäß).
   */
  z.object({ art: z.literal('mittelwert') }),
  /** KOOS je Subskala: „100 - (Mittelwert der Items x 100 / 4)". */
  z.object({ art: z.literal('mittelwert_invertiert'), item_maximum: z.number().positive() }),
  /** PRWE-G: „Schmerz-Summe + (Funktions-Summe / 2)" — Subskalen mit Gewicht. */
  z.object({
    art: z.literal('gewichtete_subskalensumme'),
    gewichte: z.record(kennungSchema, z.number()),
  }),
]);

export const wertebereichSchema = z
  .object({ min: z.number(), max: z.number() })
  .refine((bereich) => bereich.max > bereich.min, 'max muss über min liegen.');

/**
 * Ein Item des Fragebogens.
 *
 * `gewertet` steht hier, weil der Arbeitsauftrag §3 es verlangt: Ein Item, das
 * nicht in die Rechnung eingeht, wird **markiert und nicht weggelassen** — der
 * FABQ zeigt dem Patienten 16 Items und wertet 11. Wer die fünf weglässt,
 * zeigt einen anderen Fragebogen als den validierten.
 *
 * `nummer` ist die gedruckte Nummer der Vorlage. Sie ist der einzige Weg, eine
 * Übertragung gegen das PDF zu halten — das Inventar benennt Subskalen über
 * Nummern („FABQ-W: Items 6,7,9,10,11,12,15").
 *
 * **Kein `skip_logic` (ANN-087).** Der Arbeitsauftrag §3 nennt das Feld in
 * seiner Skizze, aber keines der 18 Instrumente braucht es: Was das Inventar an
 * Auslassungen kennt, betrifft ganze Subskalen (KOOS: „Nicht-Sportler:
 * Sport-Subskala auslassen") und steht dort in der Missing-Value-Regel. Ein
 * Feld ohne Fall wäre ein Zukunftsfeature — und lädt dazu ein, falsch benutzt
 * zu werden, bevor jemand weiß, was es bedeuten soll.
 */
export const scoreItemSchema = z
  .object({
    id: kennungSchema,
    nummer: z.number().int().positive().optional(),
    /** Wörtlich aus dem PDF. Eine geänderte Formulierung hebt die Normwerte auf. */
    text: z.string().min(1),
    /**
     * `koerperschema` beantwortet „Wo haben Sie Ihre Beschwerden (bitte
     * einzeichnen)?" — Bereiche auf Vorder- und Rückansicht statt eines
     * Kreuzes (FRB-EPIC-002, `IDEA-PRX-027`). Es dokumentiert, es bewertet
     * nicht, und geht deshalb wie ein Freitext in keine Rechnung ein.
     */
    typ: z.enum(['einzelauswahl', 'mehrfachauswahl', 'skala', 'zahl', 'freitext', 'koerperschema']),
    optionen: z.array(optionSchema).min(2).optional(),
    skala: wertebereichSchema.optional(),
    /**
     * Die Beschriftung der beiden Enden einer Skala, wörtlich wie im Bogen
     * (NRS: „keine Schmerzen" bis „stärkste vorstellbare Schmerzen"). Ohne sie
     * ist eine 0 nicht von einer 10 zu unterscheiden — die Richtung einer
     * Skala steht im Text, nicht in der Zahl.
     */
    anker: z.object({ min: z.string().min(1), max: z.string().min(1) }).optional(),
    einheit: z.string().min(1).optional(),
    gewertet: z.boolean().default(true),
    hinweis: z.string().min(1).optional(),
    /**
     * Ein einzelnes Feld, das nicht die Person selbst ausfüllt — im
     * Anamnesebogen „Anmerkungen Therapeut:". Ohne Angabe gilt
     * `meta.ausgefuellt_von`.
     */
    ausgefuellt_von: z.enum(['patient', 'therapeut']).optional(),
  })
  .superRefine((item, ctx) => {
    const brauchtOptionen = item.typ === 'einzelauswahl' || item.typ === 'mehrfachauswahl';
    if (brauchtOptionen && item.optionen === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['optionen'],
        message: `Ein Item vom Typ "${item.typ}" braucht seine Antwortoptionen mit Punktwert.`,
      });
    }
    if (item.typ === 'skala' && item.skala === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['skala'],
        message: 'Ein Item vom Typ "skala" braucht seinen Wertebereich.',
      });
    }
    if (item.anker !== undefined && item.typ !== 'skala') {
      ctx.addIssue({
        code: 'custom',
        path: ['anker'],
        message: 'Anker gibt es nur an einem Item vom Typ "skala".',
      });
    }
    if (item.typ === 'freitext' && item.gewertet) {
      // Freitext kann in keine Summe eingehen. Ein als gewertet markierter
      // Freitext ist ein Uebertragungsfehler, der spaeter als NaN auffaellt.
      ctx.addIssue({
        code: 'custom',
        path: ['gewertet'],
        message: 'Ein Freitext-Item kann nicht gewertet werden.',
      });
    }
    if (item.typ === 'koerperschema' && item.gewertet) {
      ctx.addIssue({
        code: 'custom',
        path: ['gewertet'],
        message: 'Ein Körperschema kann nicht gewertet werden.',
      });
    }
    const optionen = item.optionen ?? [];
    for (const [index, option] of optionen.entries()) {
      if (item.gewertet && option.wert === undefined) {
        // Die Zusicherung von vorher, jetzt am Item statt an der Option: Eine
        // gewertete Antwort ohne Punktwert ist eine unvollstaendige Uebertragung.
        ctx.addIssue({
          code: 'custom',
          path: ['optionen', index, 'wert'],
          message: 'Eine Option eines gewerteten Items braucht ihren Punktwert.',
        });
      }
      if (option.exklusiv && item.typ !== 'mehrfachauswahl') {
        ctx.addIssue({
          code: 'custom',
          path: ['optionen', index, 'exklusiv'],
          message: 'Exklusiv kann eine Option nur in einer Mehrfachauswahl sein.',
        });
      }
    }
    for (const [index, option] of optionen.entries()) {
      if (option.id === undefined && option.wert === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['optionen', index, 'id'],
          message: `Option "${option.label}" braucht eine Kennung oder einen Punktwert — sonst lässt sie sich nicht speichern.`,
        });
      }
    }
    const kennungen = optionen.map(optionKennung);
    if (new Set(kennungen).size !== kennungen.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['optionen'],
        message: 'Die Kennungen der Optionen eines Items müssen eindeutig sein.',
      });
    }
  });

export const subskalaSchema = z.object({
  id: kennungSchema,
  label: z.string().min(1),
  items: z.array(kennungSchema).min(1),
  formel: formelSchema,
  wertebereich: wertebereichSchema,
});

/**
 * Die Richtung des Wertes — Pflichtfeld nach Arbeitsauftrag §3.
 *
 * Der Auftrag nennt zwei Werte. Die Quellen brauchen einen dritten:
 * Der Anamnesebogen hat keinen Score („Richtung: n/a"), und die Tegner-Skala
 * misst ein Aktivitätsniveau — „hoch = aktiver", ausdrücklich nicht besser.
 * Sie auf `hoch_ist_besser` zu zwingen wäre eine Bewertung, die weder in der
 * Quelle steht noch nach ADR-006 Punkt 11 von uns kommen darf. Das Feld bleibt
 * Pflicht, der Wertevorrat wird um `nicht_anwendbar` erweitert (**ANN-085**).
 */
export const RICHTUNGEN = ['hoch_ist_besser', 'hoch_ist_schlechter', 'nicht_anwendbar'] as const;

export const scoringSchema = z.object({
  /** Wörtlich aus dem Inventar, Blatt „Scoring". */
  regel_wortlaut: z.string().min(1),
  /**
   * `null` heißt: **kein Gesamtwert**. Das ist kein fehlender Eintrag, sondern
   * eine Angabe der Quelle — der KOOS sagt ausdrücklich „Subskalen einzeln
   * auswerten - kein Gesamtscore bilden", der FABQ führt zwei getrennte
   * Bereiche. Einen Gesamtwert trotzdem zu bilden wäre ein eigener Score und
   * damit nach ADR-006 Punkt 4 verboten.
   */
  gesamt: z.object({ formel: formelSchema, wertebereich: wertebereichSchema }).nullable(),
  subskalen: z.array(subskalaSchema),
  richtung: z.enum(RICHTUNGEN),
  /**
   * Wörtlich aus dem Inventar — oder `TODO_ENTSCHEIDUNG`, wo die Vorlage „im
   * PDF nicht geregelt" sagt (ODI, RMDQ, NDI, FABQ, PCS und weitere, D6 im
   * Plan). Der Arbeitsauftrag §3 verlangt genau das: nicht erfinden, sondern
   * kennzeichnen.
   */
  missing_value_regel: z.string().min(1),
});

/**
 * Cut-off, MCID und MDC.
 *
 * **`MDR_REVIEW_REQUIRED` (ADR-006 Punkt 6).** Gespeichert wird, angezeigt
 * nicht: Die drei Verbote aus ADR-006 Fassung 3 sind Ausgabeverbote, keine
 * Datenverbote (dort, „Konsequenzen"). Ob ein *veröffentlichter* Schwellenwert
 * neben dem eigenen Wert stehen darf, ist die offene Folgefrage des ADR und
 * gehört in die externe Prüfung B1 — bis dahin entsteht keine Darstellung, auch
 * keine hinter einem Schalter (Punkt 13).
 *
 * Geführt wird die Klassifikation seit ANN-089 an einer Stelle: als
 * `cutoff-anzeige` in `src/app/mdr.ts`. Dieser Kommentar sagt, **was** hier
 * gespeichert wird; der Eintrag dort sagt, was daraus nicht entsteht.
 *
 * Die Werte bleiben **Zeichenketten im Wortlaut der Quelle**. Das Inventar
 * nennt Bereiche mit Zitat („MDC95: 9 (Mannion 2006) / 11,75 (Johnsen 2013)");
 * daraus eine Zahl zu machen hieße, eine Struktur zu erfinden, die die Quelle
 * nicht hat. Fehlt die Angabe, steht `null` — nicht der wahrscheinlichste Wert
 * (Arbeitsauftrag §5 Punkt 3).
 */
export const interpretationSchema = z.object({
  cutoffs: z.string().min(1).nullable(),
  mcid: z.string().min(1).nullable(),
  mdc: z.string().min(1).nullable(),
});

/**
 * Ein Referenzfall: bekannte Antwortkombination, erwarteter Wert.
 *
 * Er gehört zur Definition und nicht in eine Schlussphase — ein Score ohne
 * Referenzfall ist nicht fertig, sondern unbelegt („Grün heißt erst grün, wenn
 * der stimmt", Arbeitsauftrag §3).
 */
export const referenzfallSchema = z.object({
  bezeichnung: z.string().min(1),
  antworten: z.record(kennungSchema, z.union([z.number(), z.array(z.number())])),
  erwartet: z.object({
    gesamt: z.number().nullable().optional(),
    subskalen: z.record(kennungSchema, z.number()).optional(),
  }),
});

export const LIZENZ_STATUS = ['freigegeben', 'lizenz_erforderlich', 'ungeklaert'] as const;

/**
 * Der Lizenzstatus je Instrument — FRB-001 verlangt ihn, `IDEA-OUT-001`
 * begründet ihn: Was für diese 18 gilt, gilt nicht für das neunzehnte.
 *
 * `aktiv` hängt daran (siehe Prüfung unten): Ohne geklärten Lizenzstatus wird
 * ein Instrument nicht aktiviert. Für die 18 vorliegenden gilt die Erklärung
 * von Jannes vom 2026-09-21 — keine Lizenzierung, Integration freigegeben; der
 * schriftliche Beleg des Lizenzgebers bleibt als B8 offen (**ANN-086**).
 */
export const lizenzstatusSchema = z.object({
  status: z.enum(LIZENZ_STATUS),
  begruendung: z.string().min(1),
  stand: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Stand als ISO-Datum, zum Beispiel "2026-09-21".'),
});

export const scoreMetaSchema = z.object({
  id: kennungSchema,
  version: versionSchema,
  name_de: z.string().min(1),
  name_en: z.string().min(1).optional(),
  /** Wörtlich aus dem Inventar, etwa „Wirbelsaeule / LWS". */
  region: z.string().min(1),
  konstrukt: z.string().min(1),
  ausgefuellt_von: z.enum(['patient', 'therapeut', 'beide']),
  sprache: z.string().min(2),
  prioritaet: z.enum(['a', 'b']),
  /**
   * Woher der Wortlaut kommt.
   *
   * `datei` ist die Vorlage im Repository, gegen die sich jeder Itemtext halten
   * lässt. Fehlt sie, ist der Wortlaut **vorläufig**: übertragen aus der unter
   * `literatur` genannten Veröffentlichung, aber gegen kein Dokument hier
   * prüfbar — und ein solches Instrument wird nicht aktiviert (Prüfung unten,
   * **ANN-099**). Das betrifft seit FRB-EPIC-001 NRS, PSFS und die globale
   * Veränderungsfrage, für die kein Bogen in `quellen/` liegt.
   */
  quelle: z
    .object({
      /** Dateiname unter `quellen/scores/pdf/`; der Test der Bibliothek prüft, dass sie existiert. */
      datei: z.string().min(1).optional(),
      /** Veröffentlichung des Instruments, wenn keine Vorlage im Repository liegt. */
      literatur: z.string().min(1).optional(),
      validierung: z.string().min(1),
    })
    .refine(
      (quelle) => quelle.datei !== undefined || quelle.literatur !== undefined,
      'Eine Quelle nennt eine Vorlage (datei) oder eine Veröffentlichung (literatur).',
    ),
  lizenzstatus: lizenzstatusSchema,
  aktiv: z.boolean(),
});

/**
 * Eine offengelegte Regel der Hervorhebung nach `PROJECT_PRINCIPLES.md` §7.1
 * (FRB-002c, **ANN-104**).
 *
 * Sie sagt nur, **welche angekreuzte Angabe** sichtbar gemacht wird — nie, was
 * sie bedeutet. Deshalb gibt es kein Feld für eine Stufe, eine Farbe oder
 * einen Text der Art „bitte abklären": Die Hervorhebung zeigt die Angabe der
 * Person unverändert, mit Frage und Datum, und daneben diese Regel mit ihrer
 * Quelle (ADR-006 Punkt 3 und 11). Die Entscheidung trifft die Therapeut:in.
 *
 * Jede Regel betrifft **eine** Frage. Eine Verknüpfung mehrerer Angaben —
 * „Tumoranamnese und Gewichtsverlust" — wäre schon eine Auswahl, die über
 * das Sichtbarmachen hinausgeht, und entsteht hier nicht.
 */
export const hervorhebungSchema = z.object({
  id: kennungSchema,
  item: kennungSchema,
  /** Die Optionen, deren Wahl hervorgehoben wird — ihre Kennungen. */
  optionen: z.array(z.string().min(1)).min(1),
  /** Die Regel in einem Satz, so wie sie in der Oberfläche steht. */
  regel: z.string().min(1),
  /** Woher die Auswahl der Frage stammt — Veröffentlichung mit Fundstelle. */
  quelle: z.string().min(1),
});

/**
 * Eine Score-Definition ist eine Datei.
 *
 * Die Prüfungen darunter sind die, an denen eine Übertragung aus einem PDF
 * tatsächlich scheitert: eine Subskala, die auf ein Item zeigt, das es nicht
 * gibt; ein nicht gewertetes Item, das trotzdem in einer Summe steht; ein
 * Referenzfall, der eine unbekannte Subskala erwartet. Jede davon wäre in
 * einer 42-Item-Datei mit dem Auge nicht zu finden.
 */
export const scoreDefinitionSchema = z
  .object({
    meta: scoreMetaSchema,
    items: z.array(scoreItemSchema).min(1),
    scoring: scoringSchema,
    interpretation: interpretationSchema,
    referenzfaelle: z.array(referenzfallSchema),
    hervorhebungen: z.array(hervorhebungSchema).default([]),
  })
  .superRefine((score, ctx) => {
    const itemIds = new Set<string>();
    for (const [index, item] of score.items.entries()) {
      if (itemIds.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'id'],
          message: `Doppelte Item-Kennung "${item.id}".`,
        });
      }
      itemIds.add(item.id);
    }

    const gewertet = new Set(score.items.filter((item) => item.gewertet).map((item) => item.id));

    for (const [index, subskala] of score.scoring.subskalen.entries()) {
      for (const [stelle, itemId] of subskala.items.entries()) {
        if (!itemIds.has(itemId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['scoring', 'subskalen', index, 'items', stelle],
            message: `Subskala "${subskala.id}" nennt das unbekannte Item "${itemId}".`,
          });
          continue;
        }
        if (!gewertet.has(itemId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['scoring', 'subskalen', index, 'items', stelle],
            message: `Item "${itemId}" ist nicht gewertet und darf nicht in Subskala "${subskala.id}" stehen.`,
          });
        }
      }
    }

    // Jede Formel, die ein einzelnes Item nennt - am Gesamtwert wie an einer
    // Subskala. Der zweite Fall ist selten und genau deshalb der, den sonst
    // niemand prueft.
    const formelstellen: { formel: z.infer<typeof formelSchema>; pfad: PropertyKey[] }[] = [
      ...(score.scoring.gesamt
        ? [{ formel: score.scoring.gesamt.formel, pfad: ['scoring', 'gesamt', 'formel'] }]
        : []),
      ...score.scoring.subskalen.map((subskala, index) => ({
        formel: subskala.formel,
        pfad: ['scoring', 'subskalen', index, 'formel'],
      })),
    ];

    for (const stelle of formelstellen) {
      if (stelle.formel.art === 'einzelwert' && !itemIds.has(stelle.formel.item)) {
        ctx.addIssue({
          code: 'custom',
          path: [...stelle.pfad, 'item'],
          message: `Die Formel nennt das unbekannte Item "${stelle.formel.item}".`,
        });
      }
    }

    const gewichteteSumme = score.scoring.gesamt?.formel;
    if (gewichteteSumme?.art === 'gewichtete_subskalensumme') {
      const bekannt = new Set(score.scoring.subskalen.map((subskala) => subskala.id));
      for (const subskalaId of Object.keys(gewichteteSumme.gewichte)) {
        if (!bekannt.has(subskalaId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['scoring', 'gesamt', 'formel', 'gewichte', subskalaId],
            message: `Die Gewichtung nennt die unbekannte Subskala "${subskalaId}".`,
          });
        }
      }
    }

    const rechnetEtwas = score.scoring.gesamt !== null || score.scoring.subskalen.length > 0;

    if (!rechnetEtwas && score.scoring.richtung !== 'nicht_anwendbar') {
      ctx.addIssue({
        code: 'custom',
        path: ['scoring', 'richtung'],
        message:
          'Ein Instrument ohne Gesamtwert und ohne Subskala hat keine Richtung — richtung muss "nicht_anwendbar" sein.',
      });
    }

    if (rechnetEtwas && score.referenzfaelle.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['referenzfaelle'],
        message:
          'Ein Score, der etwas rechnet, braucht mindestens einen Referenzfall — sonst ist er unbelegt.',
      });
    }

    const subskalaIds = new Set(score.scoring.subskalen.map((subskala) => subskala.id));
    for (const [index, fall] of score.referenzfaelle.entries()) {
      for (const itemId of Object.keys(fall.antworten)) {
        if (!itemIds.has(itemId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['referenzfaelle', index, 'antworten', itemId],
            message: `Der Referenzfall antwortet auf das unbekannte Item "${itemId}".`,
          });
        }
      }
      for (const subskalaId of Object.keys(fall.erwartet.subskalen ?? {})) {
        if (!subskalaIds.has(subskalaId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['referenzfaelle', index, 'erwartet', 'subskalen', subskalaId],
            message: `Der Referenzfall erwartet die unbekannte Subskala "${subskalaId}".`,
          });
        }
      }
    }

    const regelIds = new Set<string>();
    for (const [index, regel] of score.hervorhebungen.entries()) {
      if (regelIds.has(regel.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['hervorhebungen', index, 'id'],
          message: `Doppelte Regel-Kennung "${regel.id}".`,
        });
      }
      regelIds.add(regel.id);
      const item = score.items.find((eintrag) => eintrag.id === regel.item);
      if (!item || (item.typ !== 'einzelauswahl' && item.typ !== 'mehrfachauswahl')) {
        ctx.addIssue({
          code: 'custom',
          path: ['hervorhebungen', index, 'item'],
          message: `Die Regel "${regel.id}" braucht ein Auswahl-Item; "${regel.item}" ist keines.`,
        });
        continue;
      }
      for (const [stelle, kennung] of regel.optionen.entries()) {
        const option = (item.optionen ?? []).find((o) => optionKennung(o) === kennung);
        if (!option || option.exklusiv) {
          // Ein hervorgehobenes „nein" waere eine Aussage ueber eine Verneinung.
          ctx.addIssue({
            code: 'custom',
            path: ['hervorhebungen', index, 'optionen', stelle],
            message: `Die Regel "${regel.id}" nennt "${kennung}", keine hervorhebbare Option von "${regel.item}".`,
          });
        }
      }
    }

    if (score.meta.aktiv && score.meta.quelle.datei === undefined) {
      // ANN-099: Ein Wortlaut, der gegen keine Vorlage im Repository zu halten
      // ist, erreicht keine Patientin. Aktiviert wird mit dem Bogen in
      // quellen/scores/pdf/ und einem Versionssprung der Definition.
      ctx.addIssue({
        code: 'custom',
        path: ['meta', 'aktiv'],
        message:
          'Ein Instrument ohne Vorlage im Repository (quelle.datei) darf nicht aktiv sein — sein Wortlaut ist vorläufig.',
      });
    }

    if (score.meta.aktiv && score.meta.lizenzstatus.status !== 'freigegeben') {
      // IDEA-OUT-001: Ohne geklaerten Lizenzstatus wird ein Instrument nicht
      // aktiviert. Die Pruefung steht hier und nicht in der Oberflaeche, weil
      // ein ausgeblendetes Element keine Zugriffskontrolle ist.
      ctx.addIssue({
        code: 'custom',
        path: ['meta', 'aktiv'],
        message: `Ein Instrument mit Lizenzstatus "${score.meta.lizenzstatus.status}" darf nicht aktiv sein.`,
      });
    }
  });

export type Option = z.infer<typeof optionSchema>;
export type Formel = z.infer<typeof formelSchema>;
export type Wertebereich = z.infer<typeof wertebereichSchema>;
export type ScoreItem = z.infer<typeof scoreItemSchema>;
export type Subskala = z.infer<typeof subskalaSchema>;
export type Scoring = z.infer<typeof scoringSchema>;
export type Interpretation = z.infer<typeof interpretationSchema>;
export type Referenzfall = z.infer<typeof referenzfallSchema>;
export type HervorhebungsRegel = z.infer<typeof hervorhebungSchema>;
export type ScoreMeta = z.infer<typeof scoreMetaSchema>;
export type ScoreDefinition = z.infer<typeof scoreDefinitionSchema>;
export type Richtung = (typeof RICHTUNGEN)[number];
export type Lizenzstatus = (typeof LIZENZ_STATUS)[number];
