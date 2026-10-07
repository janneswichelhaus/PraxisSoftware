import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Trainingspaket am Trainingsverhältnis (ANG-EPIC-002, ADR-009 Punkt 21,
 * PROJECT_PRINCIPLES.md 4.10 und 19).
 *
 * Anlegen, lesen und als Fehlanlage entfernen dürfen owner und office; welche
 * Zeilen eine Rolle sieht und was sie darf, entscheidet der Server (ADR-004).
 */

/** Warum heute kein Paket beginnen kann (`app.training_package_start_blocker`). */
export const STARTHINDERNIS = {
  not_found: 'Das Trainingsverhältnis wurde nicht gefunden.',
  ended: 'Der Vertrag ist beendet – erst wieder aufnehmen.',
  before_contract: 'Das Paket beginnt frühestens mit dem Vertrag.',
  too_early: 'Ein Paket beginnt höchstens 14 Tage rückwirkend.',
  // ANN-278: nicht während einer laufenden Behandlung derselben Person.
  care_open: 'Die Person ist noch in Behandlung. Ein Paket beginnt nach dem Ende der Behandlung.',
  before_care_end:
    'Das Paket beginnt frühestens am Tag, an dem die Behandlung abgeschlossen wurde.',
} as const;

export type Starthindernis = keyof typeof STARTHINDERNIS;

const paketSchema = z.object({
  id: z.string(),
  code: z.string(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  /** Aus dem Tag: geplant, läuft, vorbei. Kein Pausieren (ANN-277). */
  state: z.enum(['planned', 'running', 'ended']),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  /** Steht auf einer Rechnung oder einem Entwurf, die nicht storniert ist. */
  invoiced: z.boolean(),
});

export type Trainingspaket = z.infer<typeof paketSchema>;

const sichtSchema = z.object({
  today: z.string(),
  start_blocker: z
    .enum(['not_found', 'ended', 'before_contract', 'too_early', 'care_open', 'before_care_end'])
    .nullable(),
  packages: z.array(paketSchema),
});

export type Paketsicht = z.infer<typeof sichtSchema>;

export function paketSchluessel(verhaeltnisId: string) {
  return ['trainingspaket', verhaeltnisId] as const;
}

/** Die Pakete des Verhältnisses; `null` heißt: für diese Rolle nicht sichtbar. */
export async function fetchPakete(verhaeltnisId: string): Promise<Paketsicht | null> {
  const satz = 'Die Trainingspakete konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_packages', {
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(sichtSchema.nullable(), data ?? null, satz);
}

const angebotSchema = z.object({
  catalog_item_id: z.string(),
  code: z.string(),
  label: z.string(),
  package_months: z.number(),
  unit_price_cents: z.number(),
  currency: z.string(),
  tax_rate_permille: z.number(),
});

export type Paketposition = z.infer<typeof angebotSchema>;

/** Die Pakete der Preisliste, die am Tag gilt (ADR-009 Punkt 5). */
export async function fetchPaketpositionen(tag: string): Promise<Paketposition[]> {
  const satz = 'Die Pakete der Preisliste konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_training_package_items', {
    p_on: tag,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(angebotSchema), data ?? [], satz);
}

export async function createPaket(
  verhaeltnisId: string,
  positionId: string,
  beginn: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('create_training_package', {
    p_relationship_id: verhaeltnisId,
    p_catalog_item_id: positionId,
    p_starts_on: beginn,
  })) as { error: { message?: string } | null };

  const grund = Object.entries(STARTHINDERNIS).find(([schluessel]) =>
    error?.message?.includes(`cannot start: ${schluessel}`),
  );
  if (grund) throw new Error(grund[1]);
  if (error?.message?.includes('already covers')) {
    throw new Error('In diesem Zeitraum läuft schon ein Paket. Pakete überschneiden sich nicht.');
  }
  // ANN-279: Im Zeitraum ist schon eine Trainingsstunde erfasst.
  if (error?.message?.includes('already carry billable services')) {
    throw new Error(
      'Im Zeitraum ist schon eine Trainingsstunde als Leistung erfasst. Erst die Erfassung zurücknehmen oder das Paket danach beginnen lassen.',
    );
  }
  if (error?.message?.includes('not in the price list')) {
    throw new Error(
      'Am gewählten Beginn gilt eine andere Preisliste. Bitte das Paket aus dieser Liste wählen.',
    );
  }
  if (error) throw new Error('Das Paket konnte nicht angelegt werden.');
}

export async function deletePaket(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_training_package', {
    p_package_id: id,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('on an invoice')) {
    throw new Error(
      'Das Paket steht auf einer Rechnung oder einem Entwurf. Erst den Entwurf verwerfen oder die Rechnung stornieren.',
    );
  }
  if (error) throw new Error('Das Paket konnte nicht entfernt werden.');
}
