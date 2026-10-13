import { z } from 'zod';
import { BILD_HOECHSTENS_BYTES, bildBytes, uebungsbildSchema } from '../bild/schema';
import { KOERPERREGIONEN, NAME_HOECHSTENS, TEXT_HOECHSTENS } from '../types';
import {
  AUSGANGSSTELLUNGEN,
  GRUPPEN,
  HILFSMITTEL,
  HILFSMITTEL_LABEL,
  NACH_BEDARF,
  ZIELE,
  type Katalogeintrag,
} from './typen';

/**
 * Prüfung eines Katalogeintrags (ANN-382) - dieselben Grenzen wie der Server
 * in `app.exercise_catalog_entry` (`20261111100000_ueb_012_exercise_catalog.sql`).
 * Der Server prüft selbst noch einmal; diese Prüfung fängt Fehler schon im
 * Repository (`katalog.test.ts`).
 */

/** Ein Schritt der Anleitung, ein Fehler: ganze Sätze, kurz genug zum Vorlesen. */
export const SATZ_HOECHSTENS = 240;

const gruppenMuster = GRUPPEN.map((g) => g.toUpperCase()).join('|');
// eslint-disable-next-line security/detect-non-literal-regexp -- aus der festen Liste GRUPPEN gebaut.
export const SCHLUESSEL_MUSTER = new RegExp(`^(${gruppenMuster})-\\d{2}$`);
export const VERSION_MUSTER = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const text = (hoechstens: number) =>
  z
    .string()
    .min(1)
    .max(hoechstens)
    .refine((t) => t.trim() === t && t.trim() !== '', 'ohne Leerraum am Rand');

const satz = text(SATZ_HOECHSTENS).refine((t) => /[.!?]$/.test(t), 'endet mit einem Satzzeichen');

export const dosierungSchema = z
  .object({
    saetze: z.int().min(1).max(20).optional(),
    wiederholungen: z
      .union([z.int().min(1).max(100), z.tuple([z.int().min(1).max(100), z.int().min(1).max(100)])])
      .optional(),
    halten_s: z.int().min(1).max(600).optional(),
    dauer_s: z.int().min(1).max(3600).optional(),
    je_seite: z.boolean().optional(),
    taeglich: z.int().min(1).max(10).optional(),
  })
  .strict()
  .refine(
    (d) => (d.wiederholungen === undefined) !== (d.dauer_s === undefined),
    'genau eines von wiederholungen und dauer_s',
  )
  .refine(
    (d) => d.halten_s === undefined || d.wiederholungen !== undefined,
    'halten nur mit Wiederholungen',
  )
  .refine(
    (d) => !Array.isArray(d.wiederholungen) || d.wiederholungen[0] < d.wiederholungen[1],
    'Bereich von < bis',
  );

export const katalogeintragSchema = z
  .object({
    schluessel: z.string().regex(SCHLUESSEL_MUSTER),
    version: z.string().regex(VERSION_MUSTER),
    name: text(NAME_HOECHSTENS),
    alltagsname: text(NAME_HOECHSTENS),
    region: z.enum(KOERPERREGIONEN),
    ziel: z.enum(ZIELE),
    ausgangsstellung: z.enum(AUSGANGSSTELLUNGEN),
    hilfsmittel: z.array(z.enum(HILFSMITTEL)).max(8),
    hilfsmittel_optional: z.array(z.enum(HILFSMITTEL)).max(8).optional(),
    niveau: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    dosierung: dosierungSchema,
    anleitung: z.array(satz).min(3).max(5),
    fehler: z.array(satz).min(1).max(5),
    hinweise_praxis: text(TEXT_HOECHSTENS).optional(),
    bild: uebungsbildSchema.optional(),
  })
  .strict()
  .refine(
    (e) => e.anleitung.join('\n').length <= TEXT_HOECHSTENS,
    'Anleitung zusammen höchstens 1000 Zeichen',
  )
  .refine(
    (e) => e.fehler.join('\n').length <= TEXT_HOECHSTENS,
    'Fehler zusammen höchstens 1000 Zeichen',
  )
  .refine((e) => {
    const alle = [...e.hilfsmittel, ...(e.hilfsmittel_optional ?? [])];
    return alle.length <= 8 && new Set(alle).size === alle.length;
  }, 'Hilfsmittel höchstens acht, keines doppelt')
  .refine(
    (e) => e.bild === undefined || bildBytes(e.bild) <= BILD_HOECHSTENS_BYTES,
    'Bild zu groß',
  );

/** Eine mitgelieferte Zusammenstellung: Name, Ziel, Schlüssel mit optionaler Dosierung. */
export const katalogvorlageSchema = z
  .object({
    schluessel: z.string().regex(/^V\d{2}$/),
    name: text(NAME_HOECHSTENS),
    ziel: text(TEXT_HOECHSTENS),
    uebungen: z
      .array(
        z
          .object({
            schluessel: z.string().regex(SCHLUESSEL_MUSTER),
            dosierung: dosierungSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();

/** Die Ausrüstung, wie sie beim Übernehmen an der Variante steht. */
export function ausruestungVon(
  e: Pick<Katalogeintrag, 'hilfsmittel' | 'hilfsmittel_optional'>,
): string[] {
  return [
    ...e.hilfsmittel.map((h) => HILFSMITTEL_LABEL[h]),
    ...(e.hilfsmittel_optional ?? []).map((h) => `${HILFSMITTEL_LABEL[h]}${NACH_BEDARF}`),
  ];
}
