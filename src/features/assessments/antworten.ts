import { z } from 'zod';
import { bereicheText, istKoerperbereich } from './koerperschema';
import { optionKennung, type ScoreDefinition, type ScoreItem } from './schema';

/**
 * Die Antworten einer Erhebung (FRB-EPIC-002).
 *
 * Gespeichert wird ein Objekt „Kennung des Items → Antwort". Die Form der
 * Antwort folgt allein dem Typ des Items — wie bei der Definition kennt der
 * Code kein Instrument namentlich. Der Server kennt die Definitionen nicht und
 * prüft nur, dass jede Antwort ein Objekt ist (**ANN-105**); was eine gültige
 * Antwort auf *dieses* Item ist, prüft `antwortenSchema` hier, vor dem
 * Speichern.
 *
 * Eine Frage ohne Antwort fehlt im Objekt. „Nicht beantwortet" und „nein"
 * sind zweierlei, und nur das zweite hat die Person gesagt.
 */

/** Höchstlänge einer freien Angabe — ein Absatz, kein Brief. */
export const FREITEXT_MAX = 2000;

export type Antwort =
  | { auswahl: string; freitext?: string }
  | { auswahl: string[]; freitext?: string }
  | { wert: number }
  | { text: string }
  | { bereiche: string[] };

export type Antworten = Record<string, Antwort>;

const freitextSchema = z.string().trim().min(1).max(FREITEXT_MAX);

function optionMitFreitext(item: ScoreItem, gewaehlt: readonly string[]): boolean {
  return (item.optionen ?? []).some(
    (option) => option.freitext === true && gewaehlt.includes(optionKennung(option)),
  );
}

/** Das Schema einer Antwort auf genau dieses Item. */
export function antwortSchema(item: ScoreItem): z.ZodType {
  const kennungen = (item.optionen ?? []).map(optionKennung);
  const bekannt = z
    .string()
    .refine((wert) => kennungen.includes(wert), 'Keine Option dieses Items.');

  switch (item.typ) {
    case 'einzelauswahl':
      return z
        .object({ auswahl: bekannt, freitext: freitextSchema.optional() })
        .strict()
        .refine(
          (a) => a.freitext === undefined || optionMitFreitext(item, [a.auswahl]),
          'Eine eigene Angabe gehört zu einer Option, die sie vorsieht.',
        );
    case 'mehrfachauswahl':
      return z
        .object({ auswahl: z.array(bekannt).min(1), freitext: freitextSchema.optional() })
        .strict()
        .refine((a) => new Set(a.auswahl).size === a.auswahl.length, 'Eine Option doppelt gewählt.')
        .refine((a) => {
          // „nein" steht allein: Wer es zusammen mit „Nachtschmerzen" wählt,
          // hat sich verklickt — gespeichert wird so etwas nicht.
          const exklusiv = (item.optionen ?? [])
            .filter((option) => option.exklusiv)
            .map(optionKennung);
          return !a.auswahl.some((wert) => exklusiv.includes(wert)) || a.auswahl.length === 1;
        }, '„nein" lässt sich nicht mit einer anderen Angabe verbinden.')
        .refine(
          (a) => a.freitext === undefined || optionMitFreitext(item, a.auswahl),
          'Eine eigene Angabe gehört zu einer Option, die sie vorsieht.',
        );
    case 'skala': {
      const skala = item.skala ?? { min: 0, max: 0 };
      return z.object({ wert: z.number().int().min(skala.min).max(skala.max) }).strict();
    }
    case 'zahl':
      return z.object({ wert: z.number().finite() }).strict();
    case 'freitext':
      return z.object({ text: freitextSchema }).strict();
    case 'koerperschema':
      return z
        .object({
          bereiche: z
            .array(z.string().refine(istKoerperbereich, 'Kein Bereich des Körperschemas.'))
            .min(1),
        })
        .strict()
        .refine((a) => new Set(a.bereiche).size === a.bereiche.length, 'Ein Bereich doppelt.');
  }
}

/**
 * Das Schema aller Antworten auf eine Definition. Eine Antwort auf ein Item,
 * das es nicht gibt, wird abgewiesen — sie wäre im Verlauf unauffindbar.
 */
export function antwortenSchema(definition: ScoreDefinition): z.ZodType<Antworten> {
  const felder = Object.fromEntries(
    definition.items.map((item) => [item.id, antwortSchema(item).optional()]),
  );
  return z.object(felder).strict() as unknown as z.ZodType<Antworten>;
}

/**
 * Die Antwort in Worten, **wörtlich aus der Definition**: die Beschriftung der
 * Option, der Wert der Skala, der Text der Person. Keine Deutung, keine
 * Zusammenfassung (ADR-006 Punkt 3 und 11). `null` heißt: nicht beantwortet.
 */
export function antwortText(item: ScoreItem, antwort: Antwort | undefined): string | null {
  if (antwort === undefined) return null;
  const label = (kennung: string) =>
    (item.optionen ?? []).find((option) => optionKennung(option) === kennung)?.label ?? kennung;
  const eigene = 'freitext' in antwort && antwort.freitext ? ` („${antwort.freitext}“)` : '';

  if ('auswahl' in antwort) {
    const gewaehlt = Array.isArray(antwort.auswahl) ? antwort.auswahl : [antwort.auswahl];
    return gewaehlt.map(label).join(', ') + eigene;
  }
  if ('wert' in antwort) {
    return item.skala ? `${antwort.wert} von ${item.skala.max}` : String(antwort.wert);
  }
  if ('text' in antwort) return antwort.text;
  return bereicheText(antwort.bereiche);
}

/** Die gewählten Kennungen einer Auswahl, sonst leer. */
export function gewaehlteKennungen(antwort: Antwort | undefined): string[] {
  if (antwort === undefined || !('auswahl' in antwort)) return [];
  return Array.isArray(antwort.auswahl) ? antwort.auswahl : [antwort.auswahl];
}
