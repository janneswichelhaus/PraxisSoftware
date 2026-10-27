import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Der Absender der Praxis auf Blättern an Patient:innen (UX-009a, BEF-052,
 * ANN-323): Aufnahmeblatt und Terminzettel.
 *
 * Die Serverfunktion gibt nur, was auf ein solches Blatt gehört - Name,
 * Anschrift, Telefon, E-Mail -, nie Steuer- oder Bankangaben (ADR-013 Punkt 9
 * Nr. 3). Sind die Praxis-Stammdaten nicht gepflegt, steht nur der Name der
 * Organisation da; die übrigen Felder fehlen dann.
 */
const absenderSchema = z.object({
  name: z.string(),
  street: z.string().nullable().optional(),
  house_number: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});

export type PraxisAbsender = z.infer<typeof absenderSchema>;

export const PRAXIS_ABSENDER_KEY = ['practice-sender'] as const;

export async function fetchPraxisAbsender(): Promise<PraxisAbsender | null> {
  const { data, error } = (await getSupabase().rpc('get_practice_sender')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error('Der Absender der Praxis konnte nicht geladen werden.');
  return data === null ? null : absenderSchema.parse(data);
}

/** „Musterallee 1, 72070 Tübingen" - leer, wenn die Stammdaten fehlen. */
export function absenderAnschrift(absender: PraxisAbsender): string {
  const strasse = [absender.street, absender.house_number].filter(Boolean).join(' ');
  const ort = [absender.postal_code, absender.city].filter(Boolean).join(' ');
  return [strasse, ort].filter((teil) => teil.length > 0).join(', ');
}

/** „Telefon …, E-Mail …" - leer, wenn keins von beiden gepflegt ist. */
export function absenderKontakt(absender: PraxisAbsender): string {
  return [
    absender.phone ? `Telefon ${absender.phone}` : null,
    absender.email ? `E-Mail ${absender.email}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Ob das Blatt einen vollständigen Absender trägt: Anschrift und ein Kontaktweg. */
export function absenderVollstaendig(absender: PraxisAbsender | null | undefined): boolean {
  return (
    !!absender && absenderAnschrift(absender).length > 0 && absenderKontakt(absender).length > 0
  );
}
