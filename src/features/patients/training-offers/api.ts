import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Trainingsangebot aus der Akte (KND-EPIC-001, PROJECT_PRINCIPLES.md
 * 4.10, ADR-021 Punkt 7).
 *
 * Anbieten und zurückziehen dürfen die Rollen der Akte (ANN-282); welche
 * Zeilen eine Rolle sieht und was sie darf, entscheidet der Server (ADR-004).
 */

/** ANN-283: höchstens fünf Übergabeangaben, je Überschrift und Text. */
export const UEBERGABE_HOECHSTENS = 5;
export const UEBERSCHRIFT_HOECHSTENS = 80;
export const TEXT_HOECHSTENS = 600;

const uebergabeSchema = z.object({ title: z.string(), body: z.string() });

export type Uebergabeangabe = z.infer<typeof uebergabeSchema>;

const angebotSchema = z.object({
  id: z.string(),
  /** ANN-285: Die Akte kennt keine Annahme – nur offen, zurückgezogen, abgelaufen. */
  state: z.enum(['open', 'withdrawn', 'expired']),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  valid_until: z.string(),
  handover_items: z.array(uebergabeSchema),
  offers_contact: z.boolean(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  withdrawn_at: z.string().nullable(),
});

export type Trainingsangebot = z.infer<typeof angebotSchema>;

const sichtSchema = z.object({
  today: z.string(),
  care_concluded_on: z.string().nullable(),
  /** Hat die Person einen aktiven eigenen Plattformzugang? Ohne ihn kann sie nicht annehmen. */
  has_own_access: z.boolean(),
  offers: z.array(angebotSchema),
});

export type Angebotssicht = z.infer<typeof sichtSchema>;

const paketSchema = z.object({
  catalog_item_id: z.string(),
  label: z.string(),
  package_months: z.number(),
  unit_price_cents: z.number(),
  currency: z.string(),
});

export type Angebotspaket = z.infer<typeof paketSchema>;

export function angebotSchluessel(patientId: string) {
  return ['trainingsangebot', patientId] as const;
}

/** Die Angebote der Akte; `null` heißt: für diese Rolle nicht sichtbar. */
export async function fetchAngebote(patientId: string): Promise<Angebotssicht | null> {
  const satz = 'Die Trainingsangebote konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_patient_training_offers', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(sichtSchema.nullable(), data ?? null, satz);
}

/** Die Pakete der Preisliste, die am Beginn gilt. */
export async function fetchAngebotspakete(beginn: string): Promise<Angebotspaket[]> {
  const satz = 'Die Pakete der Preisliste konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_training_offer_packages', {
    p_on: beginn,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(paketSchema), data ?? [], satz);
}

export interface NeuesAngebot {
  patientId: string;
  paketId: string;
  beginn: string;
  uebergabe: Uebergabeangabe[];
  kontakt: boolean;
}

export async function createAngebot(angebot: NeuesAngebot): Promise<void> {
  const { error } = (await getSupabase().rpc('create_training_offer', {
    p_patient_id: angebot.patientId,
    p_catalog_item_id: angebot.paketId,
    p_starts_on: angebot.beginn,
    p_handover_items: angebot.uebergabe,
    p_offers_contact: angebot.kontakt,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('within the next 90 days')) {
    throw new Error('Das Training beginnt frühestens heute und höchstens in 90 Tagen.');
  }
  if (error?.message?.includes('before care is concluded')) {
    throw new Error('Das Training beginnt frühestens am Tag des Abschlusses der Versorgung.');
  }
  if (error?.message?.includes('not in the price list')) {
    throw new Error('Das Paket steht nicht in der Preisliste, die am Beginn gilt.');
  }
  if (error?.message?.includes('handover items invalid')) {
    throw new Error('Bitte jede Angabe mit Überschrift und Text füllen.');
  }
  if (error?.message?.includes('open training offer exists')) {
    throw new Error('Es gibt schon ein offenes Angebot. Bitte es erst zurückziehen.');
  }
  if (error) throw new Error('Das Angebot konnte nicht festgehalten werden.');
}

export async function withdrawAngebot(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('withdraw_training_offer', {
    p_offer_id: id,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('not open')) {
    throw new Error('Das Angebot ist nicht mehr offen.');
  }
  if (error) throw new Error('Das Angebot konnte nicht zurückgezogen werden.');
}
