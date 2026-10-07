import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Das Nachsorge-Abo an der Akte (ANG-EPIC-001, ADR-009 Punkt 21,
 * PROJECT_PRINCIPLES.md 4.6 und 19).
 *
 * Anlegen, lesen und beenden dürfen owner und office; welche Zeilen eine
 * Rolle sieht und was sie darf, entscheidet der Server (ADR-004).
 */

const aboSchema = z.object({
  id: z.string(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  created_at: z.string(),
  created_by_name: z.string().nullable(),
  cancelled_on: z.string().nullable(),
  cancelled_via: z.enum(['practice', 'platform']).nullable(),
  cancelled_access_kind: z.enum(['self', 'legal_representative']).nullable(),
  cancelled_representative_name: z.string().nullable(),
  /** Laufend: das Ende, auf das eine Kündigung heute fiele (ANN-270). */
  current_month_end: z.string().nullable(),
  /** Laufend: der Beginn des nächsten Abo-Monats. */
  next_month_start: z.string().nullable(),
  /** ANG-002: wie viele Abo-Monate als Leistung erfasst sind. */
  recorded_months: z.number(),
  /** ANG-002: Preis des nächsten Abo-Monats laut Preisliste; null: keiner. */
  next_month_price_cents: z.number().nullable(),
});

export type Nachsorgeabo = z.infer<typeof aboSchema>;

const sichtSchema = z.object({
  today: z.string(),
  /** Frühester Beginn: Abschluss der Versorgung, höchstens 14 Tage zurück (ANN-268); vorher kein Abo. */
  earliest_start: z.string().nullable(),
  subscriptions: z.array(aboSchema),
});

export type Nachsorgesicht = z.infer<typeof sichtSchema>;

export function nachsorgeSchluessel(patientId: string) {
  return ['nachsorge', patientId] as const;
}

/** Die Abos der Akte; `null` heißt: für diese Rolle nicht sichtbar. */
export async function fetchNachsorge(patientId: string): Promise<Nachsorgesicht | null> {
  const satz = 'Das Nachsorge-Abo konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_patient_aftercare', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(sichtSchema.nullable(), data ?? null, satz);
}

export async function createNachsorge(patientId: string, beginn: string): Promise<void> {
  const { error } = (await getSupabase().rpc('create_aftercare_subscription', {
    p_patient_id: patientId,
    p_starts_on: beginn,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('care is not concluded')) {
    throw new Error('Erst die Versorgung abschließen – das Abo beginnt nach der Behandlung.');
  }
  if (error?.message?.includes('before care is concluded')) {
    throw new Error('Das Abo beginnt frühestens am Tag des Abschlusses der Versorgung.');
  }
  if (error?.message?.includes('more than 14 days ago')) {
    throw new Error('Ein Abo beginnt höchstens 14 Tage rückwirkend.');
  }
  if (error?.message?.includes('already covers')) {
    throw new Error('Für diesen Tag besteht schon ein Abo.');
  }
  if (error) throw new Error('Das Abo konnte nicht angelegt werden.');
}

export async function deleteNachsorge(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_aftercare_subscription', {
    p_subscription_id: id,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('is cancelled')) {
    throw new Error('Das Abo ist gekündigt; die Kündigung bleibt als Nachweis stehen.');
  }
  if (error?.message?.includes('has recorded months')) {
    throw new Error('Aus dem Abo ist schon ein Monat erfasst; es endet nur durch Kündigung.');
  }
  if (error) throw new Error('Das Abo konnte nicht entfernt werden.');
}

// -----------------------------------------------------------------------------
// Abo-Monate als Leistung (ANG-002, ADR-009 Punkt 21)
// -----------------------------------------------------------------------------

/** Warum ein Monat nicht erfasst werden kann (`app.aftercare_month_blocker`). */
export const MONATSHINDERNIS = {
  not_a_month: 'Kein Beginn eines Abo-Monats.',
  not_due: 'Der Monat hat noch nicht begonnen.',
  after_end: 'Der Monat liegt nach dem Ende des Abos.',
  // ANN-271: während einer neuen Behandlung wird kein Abo-Monat berechnet.
  care_open: 'Die Behandlung läuft wieder – kein Abo-Monat, solange sie dauert.',
  care_during_month: 'In diesem Monat wurde behandelt – dafür gibt es keinen Abo-Monat.',
  no_price: 'Die geltende Preisliste nennt keinen Abo-Monat.',
} as const;

const faelligSchema = z.object({
  subscription_id: z.string(),
  patient_id: z.string(),
  patient_name: z.string(),
  month_start: z.string(),
  month_end: z.string(),
  unit_price_cents: z.number().nullable(),
  currency: z.string().nullable(),
  blocker: z
    .enum(['not_a_month', 'not_due', 'after_end', 'care_open', 'care_during_month', 'no_price'])
    .nullable(),
});

export type FaelligerMonat = z.infer<typeof faelligSchema>;

export const FAELLIGE_MONATE_SCHLUESSEL = ['nachsorge', 'faellig'] as const;

export async function fetchFaelligeMonate(): Promise<FaelligerMonat[]> {
  const satz = 'Die Abo-Monate konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_due_aftercare_months')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(faelligSchema), data ?? [], satz);
}

export async function recordMonat(aboId: string, monat: string): Promise<void> {
  const { error } = (await getSupabase().rpc('record_aftercare_month', {
    p_subscription_id: aboId,
    p_month_start: monat,
  })) as { error: { message?: string } | null };

  const grund = Object.entries(MONATSHINDERNIS).find(([schluessel]) =>
    error?.message?.includes(schluessel),
  );
  if (grund) throw new Error(grund[1]);
  if (error?.message?.includes('already recorded')) {
    throw new Error('Dieser Abo-Monat ist schon erfasst.');
  }
  if (error) throw new Error('Der Abo-Monat konnte nicht erfasst werden.');
}

export async function deleteMonat(leistungId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_aftercare_month', {
    p_billable_service_id: leistungId,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('on an invoice')) {
    throw new Error(
      'Der Abo-Monat steht auf einem Rechnungsentwurf. Bitte erst den Entwurf verwerfen.',
    );
  }
  if (error) throw new Error('Die Erfassung konnte nicht zurückgenommen werden.');
}

// -----------------------------------------------------------------------------
// Kündigung (ANG-003)
// -----------------------------------------------------------------------------

/** Eine Kündigung eintragen, die bei der Praxis einging; liefert das Ende. */
export async function cancelNachsorge(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('cancel_aftercare_subscription', {
    p_subscription_id: id,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('already cancelled')) {
    throw new Error('Das Abo ist schon gekündigt.');
  }
  if (error) throw new Error('Die Kündigung konnte nicht eingetragen werden.');
}
