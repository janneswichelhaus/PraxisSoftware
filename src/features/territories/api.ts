import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Gebietstage für die Terminvergabe (PRX-002).
 *
 * Ein Gebiet ist eine Liste von Postleitzahlen mit festen Wochentagen oder
 * Tageshälften — eine Praxisregel ohne Personenbezug (B6). Ob ein Termin im
 * Gebietstag liegt, rechnet **nur der Server** (`app.territory_day_status`,
 * ANN-135); die Oberfläche fragt und zeigt. Die Regel warnt, sie sperrt nicht.
 */

export const PARTS = ['am', 'pm', 'day'] as const;
export type DayPartKind = (typeof PARTS)[number];

const dayPartSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  part: z.enum(PARTS),
});
export type DayPart = z.infer<typeof dayPartSchema>;

const territorySchema = z.object({
  id: z.string(),
  name: z.string(),
  day_parts: z.array(dayPartSchema),
  postal_codes: z.array(z.string()),
  updated_at: z.string(),
});
export type Territory = z.infer<typeof territorySchema>;

const WEEKDAY_SHORT: Record<number, string> = {
  1: 'Mo',
  2: 'Di',
  3: 'Mi',
  4: 'Do',
  5: 'Fr',
  6: 'Sa',
  7: 'So',
};

const PART_TEXT: Record<DayPartKind, string> = {
  am: 'vormittags',
  pm: 'nachmittags',
  day: 'ganztags',
};

/** „Mo vormittags, Mi ganztags" — sortiert nach Wochentag. */
export function dayPartsText(parts: readonly DayPart[]): string {
  if (parts.length === 0) return 'keine Gebietstage';
  return [...parts]
    .sort((a, b) => a.weekday - b.weekday || PARTS.indexOf(a.part) - PARTS.indexOf(b.part))
    .map((p) => `${WEEKDAY_SHORT[p.weekday]} ${PART_TEXT[p.part]}`)
    .join(', ');
}

/**
 * Postleitzahlen aus einer Eingabe wie „72070, 72072 72074": Trennzeichen
 * sind Komma, Semikolon, Leerraum. Doppelte fallen weg; was keine fünf
 * Ziffern hat, landet in `invalid`.
 */
export function parsePostalCodes(input: string): { codes: string[]; invalid: string[] } {
  const parts = input
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  const codes = [...new Set(parts.filter((p) => /^\d{5}$/.test(p)))].sort();
  const invalid = parts.filter((p) => !/^\d{5}$/.test(p));
  return { codes, invalid };
}

const LOAD_ERROR = 'Die Gebiete konnten nicht geladen werden.';

export async function fetchTerritories(): Promise<Territory[]> {
  const { data, error } = (await getSupabase().rpc('list_territories')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(LOAD_ERROR);
  return antwort(z.array(territorySchema), data ?? [], LOAD_ERROR);
}

/** Eine Postleitzahl gehört schon einem anderen Gebiet. */
export class PostalCodeTakenError extends Error {
  readonly postalCode: string;
  constructor(postalCode: string) {
    super(`Die Postleitzahl ${postalCode} gehört schon zu einem anderen Gebiet.`);
    this.name = 'PostalCodeTakenError';
    this.postalCode = postalCode;
  }
}

function writeError(error: { code?: string; message?: string }, fallback: string): Error {
  const taken = /postal code already assigned: (\d{5})/.exec(error.message ?? '');
  if (taken) return new PostalCodeTakenError(taken[1]!);
  if (error.message?.includes('territory name taken')) {
    return new Error('Ein Gebiet mit diesem Namen gibt es schon.');
  }
  if (error.code === '40001') {
    return new Error('Das Gebiet wurde inzwischen geändert. Bitte neu laden.');
  }
  return new Error(fallback);
}

export async function saveTerritory(
  territory: Pick<Territory, 'id' | 'updated_at'> | null,
  values: { name: string; postalCodes: string[]; dayParts: DayPart[] },
): Promise<string> {
  const fallback = 'Das Gebiet konnte nicht gespeichert werden.';
  const { data, error } = (await getSupabase().rpc('save_territory', {
    p_territory_id: territory?.id ?? null,
    p_expected_updated_at: territory?.updated_at ?? null,
    p_name: values.name,
    p_postal_codes: values.postalCodes,
    p_day_parts: values.dayParts,
  })) as { data: unknown; error: { code?: string; message?: string } | null };
  if (error) throw writeError(error, fallback);
  return antwort(z.string(), data, fallback);
}

export async function removeTerritory(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('remove_territory', { p_territory_id: id })) as {
    error: unknown;
  };
  if (error) throw new Error('Das Gebiet konnte nicht entfernt werden.');
}

const checkSchema = z.object({
  slot_index: z.number(),
  status: z.enum(['none', 'match', 'outside', 'invalid']),
  territory_name: z.string().nullable(),
  day_parts: z.array(dayPartSchema).nullable(),
});
export type TerritoryCheck = z.infer<typeof checkSchema>;

/** Je Termin: liegt er im Gebietstag der Postleitzahl? */
export async function checkTerritoryDays(
  postalCode: string,
  slots: readonly { datum: string; beginn: string }[],
): Promise<TerritoryCheck[]> {
  const fallback = 'Der Gebietstag konnte nicht geprüft werden.';
  const { data, error } = (await getSupabase().rpc('check_territory_days', {
    p_postal_code: postalCode,
    p_slots: slots,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(fallback);
  return antwort(z.array(checkSchema), data ?? [], fallback);
}
