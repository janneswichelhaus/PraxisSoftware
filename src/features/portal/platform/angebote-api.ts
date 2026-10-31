import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Trainingspaket und Preise (PROJECT_PRINCIPLES.md 4.10)
// -----------------------------------------------------------------------------

export const meinPaketSchema = z.object({
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  /** Aus dem Tag: beginnt bald, läuft, vorbei. Kein Pausieren (ANN-277). */
  state: z.enum(['planned', 'running', 'ended']),
});
export type MeinPaket = z.infer<typeof meinPaketSchema>;

export function paketeSchluessel(zugangId: string) {
  return ['platform-training-packages', zugangId] as const;
}

/** Die eigenen Pakete; `null` heißt: für diesen Zugang nicht sichtbar (Recht billing). */
export async function ladeMeinePakete(zugangId: string): Promise<MeinPaket[] | null> {
  const satz = 'Ihr Paket konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_packages', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(meinPaketSchema).nullable(), ergebnis.data ?? null, satz);
}

const angeboteSchema = z.object({
  /** Enthält der Preis Umsatzsteuer? Unter § 19 UStG nicht. */
  vat_included: z.boolean(),
  offers: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      package_months: z.number(),
      price_cents: z.number(),
      currency: z.string(),
      tax_rate_permille: z.number(),
    }),
  ),
});
export type Paketangebote = z.infer<typeof angeboteSchema>;

export function angeboteSchluessel(zugangId: string) {
  return ['platform-training-offers', zugangId] as const;
}

/** Die Pakete der geltenden Preisliste; `null`: für diesen Zugang keine (nur Training). */
export async function ladeAngebote(zugangId: string): Promise<Paketangebote | null> {
  const satz = 'Die Preise konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_offers', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(angeboteSchema.nullable(), ergebnis.data ?? null, satz);
}

// -----------------------------------------------------------------------------
// Nachsorge-Abo (PROJECT_PRINCIPLES.md 4.6, ADR-009 Punkt 21)
// -----------------------------------------------------------------------------

const aboSchema = z.object({
  id: z.string().uuid(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  /** Läuft, ist gekündigt und läuft noch, oder ist beendet. */
  state: z.enum(['running', 'ending', 'ended']),
  next_month_start: z.string().nullable(),
  next_month_price_cents: z.number().nullable(),
  /** Laufend: das Ende, auf das eine Kündigung heute fiele (ANN-270). */
  cancel_effective_on: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_via: z.enum(['practice', 'platform']).nullable(),
  /** Den Knopf haben die Person selbst und ihre rechtliche Vertretung (ANN-273). */
  can_cancel: z.boolean(),
});
export type Nachsorgeabo = z.infer<typeof aboSchema>;

export function aboSchluessel(zugangId: string) {
  return ['platform-aftercare', zugangId] as const;
}

/** Das eigene Abo; `null` heißt: keins, oder für diesen Zugang nicht sichtbar. */
export async function ladeAbo(zugangId: string): Promise<Nachsorgeabo | null> {
  const satz = 'Ihr Abo konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_aftercare', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(aboSchema.nullable(), ergebnis.data ?? null, satz);
}

const kuendigungSchema = z.object({
  ends_on: z.string(),
  cancelled_at: z.string(),
  cancelled_on: z.string(),
});
export type Kuendigungsbestaetigung = z.infer<typeof kuendigungSchema>;

/** Der Kündigungsknopf (ANN-272): liefert die Bestätigung mit Zeitpunkt. */
export async function aboKuendigen(
  zugangId: string,
  aboId: string,
): Promise<Kuendigungsbestaetigung> {
  const satz = 'Die Kündigung ist nicht angekommen. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('cancel_platform_aftercare', {
    p_access_id: zugangId,
    p_subscription_id: aboId,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error?.message?.includes('already cancelled'))
    throw new Error('Ihr Abo ist schon gekündigt.');
  if (ergebnis.error) throw new Error(satz);
  return antwort(kuendigungSchema, ergebnis.data, satz);
}

// -----------------------------------------------------------------------------
// Trainingsvertrag im eigenen Konto (PROJECT_PRINCIPLES.md 4.10, ANN-288, ANN-289)
// -----------------------------------------------------------------------------

const praxisSchema = z.object({
  name: z.string(),
  street: z.string().nullable(),
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

const trainingsangebotSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  tax_rate_permille: z.number(),
  /** Enthält der Preis Umsatzsteuer? Unter § 19 UStG nicht. */
  vat_included: z.boolean(),
  starts_on: z.string(),
  ends_on: z.string(),
  valid_until: z.string(),
  offered_on: z.string(),
  handover_items: z.array(z.object({ title: z.string(), body: z.string() })),
  /** Die Kontaktdaten der Akte, wenn die Praxis sie zur Übernahme anbietet. */
  contact: z
    .object({
      date_of_birth: z.string().nullable(),
      street: z.string().nullable(),
      house_number: z.string().nullable(),
      postal_code: z.string().nullable(),
      city: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    })
    .nullable(),
  /** Beginnt das Training innerhalb der Widerrufsfrist? */
  early_start: z.boolean(),
  withdrawal_days: z.number(),
  wording_version: z.string(),
  /** Warum (noch) nicht angenommen werden kann; null: es geht. */
  blocker: z.string().nullable(),
  /** Nur der eigene Zugang nimmt an (ANN-289). */
  can_accept: z.boolean(),
  practice: praxisSchema,
});
export type Trainingsangebot = z.infer<typeof trainingsangebotSchema>;

export function trainingsangebotSchluessel(zugangId: string) {
  return ['platform-training-offer', zugangId] as const;
}

/** Das offene Angebot der Praxis; `null`: keins, oder für diesen Zugang nicht sichtbar. */
export async function ladeTrainingsangebot(zugangId: string): Promise<Trainingsangebot | null> {
  const satz = 'Das Angebot konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_offer', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(trainingsangebotSchema.nullable(), ergebnis.data ?? null, satz);
}

const buchungSchema = z.object({
  contract_id: z.string().uuid(),
  training_access_id: z.string().uuid(),
  concluded_at: z.string(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  withdrawal_ends_on: z.string(),
  early_start_requested: z.boolean(),
  contact_released: z.boolean(),
  health_consent_granted: z.boolean(),
  released_titles: z.array(z.string()),
});
export type Buchungsbestaetigung = z.infer<typeof buchungSchema>;

export interface Buchung {
  angebotId: string;
  freigaben: number[];
  kontakt: boolean;
  einwilligung: boolean;
  fruehBeginnen: boolean;
  fassung: string;
}

/** „Zahlungspflichtig buchen": liefert die Bestätigung (ANN-288). */
export async function angebotAnnehmen(
  zugangId: string,
  buchung: Buchung,
): Promise<Buchungsbestaetigung> {
  const satz = 'Die Buchung ist nicht angekommen. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('accept_platform_training_offer', {
    p_access_id: zugangId,
    p_offer_id: buchung.angebotId,
    p_release_items: buchung.freigaben,
    p_release_contact: buchung.kontakt,
    p_health_consent: buchung.einwilligung,
    p_early_start: buchung.fruehBeginnen,
    p_wording_version: buchung.fassung,
  })) as { data: unknown; error: { message?: string } | null };
  const meldung = ergebnis.error?.message ?? '';
  if (meldung.includes('not open'))
    throw new Error('Das Angebot gilt nicht mehr. Bitte sprechen Sie die Praxis an.');
  if (meldung.includes('wording outdated'))
    throw new Error('Die Bedingungen haben sich geändert. Bitte laden Sie die Seite neu.');
  if (meldung.includes('health consent required'))
    throw new Error(
      'Angaben aus der Behandlung gehen nur mit Ihrer Einwilligung zu Gesundheitsangaben ins Training.',
    );
  if (meldung.includes('early start must be requested'))
    throw new Error(
      'Bitte bestätigen Sie, dass das Training vor dem Ende der Frist beginnen soll.',
    );
  if (meldung.includes('cannot be accepted'))
    throw new Error(
      'Das Angebot kann gerade nicht angenommen werden. Bitte laden Sie die Seite neu.',
    );
  if (ergebnis.error) throw new Error(satz);
  return antwort(buchungSchema, ergebnis.data, satz);
}

export const vertragSchema = z.object({
  id: z.string().uuid(),
  concluded_at: z.string(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  tax_rate_permille: z.number(),
  vat_included: z.boolean(),
  starts_on: z.string(),
  ends_on: z.string(),
  offered_on: z.string(),
  wording_version: z.string(),
  early_start_requested: z.boolean(),
  contact_released: z.boolean(),
  health_consent_granted: z.boolean(),
  withdrawal_ends_on: z.string(),
  released_titles: z.array(z.string()),
  /** Eingang des Widerrufs; null: nicht widerrufen. */
  withdrawn_at: z.string().nullable().default(null),
  /** Knopf da? In der Frist, nicht widerrufen, Recht contract. */
  can_withdraw: z.boolean().default(false),
});
export type Trainingsvertrag = z.infer<typeof vertragSchema>;

export function vertragSchluessel(zugangId: string) {
  return ['platform-training-contract', zugangId] as const;
}

/** Der eigene Trainingsvertrag; `null`: keiner, oder für diesen Zugang nicht sichtbar. */
export async function ladeVertrag(zugangId: string): Promise<Trainingsvertrag | null> {
  const satz = 'Ihr Vertrag konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_contract', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(vertragSchema.nullable(), ergebnis.data ?? null, satz);
}

const widerrufSchema = z.object({
  withdrawn_at: z.string(),
  withdrawn_on: z.string(),
  label: z.string(),
  concluded_at: z.string(),
});
export type Widerrufseingang = z.infer<typeof widerrufSchema>;

/** Die Widerrufsfunktion (§ 356a BGB): liefert den Eingang mit Zeitpunkt. */
export async function vertragWiderrufen(
  zugangId: string,
  vertragId: string,
): Promise<Widerrufseingang> {
  const satz = 'Der Widerruf ist nicht angekommen. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('withdraw_platform_training_contract', {
    p_access_id: zugangId,
    p_contract_id: vertragId,
  })) as { data: unknown; error: { message?: string } | null };
  const meldung = ergebnis.error?.message ?? '';
  if (meldung.includes('already withdrawn')) throw new Error('Sie haben schon widerrufen.');
  if (meldung.includes('period has ended'))
    throw new Error('Die Widerrufsfrist ist abgelaufen. Bitte wenden Sie sich an die Praxis.');
  if (ergebnis.error) throw new Error(satz);
  return antwort(widerrufSchema, ergebnis.data, satz);
}
