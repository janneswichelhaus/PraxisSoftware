import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { istBenachrichtigungsart, type Benachrichtigungsart } from '@/lib/begriffe';
import type { PushRegistrierung } from '@/lib/push';
import { getSupabase } from '@/lib/supabase';
import { meinPaketSchema, vertragSchema } from './angebote-api';
import { nachrichtSchema } from './nachrichten-api';
import { bogenSchema } from './selbstauskunft-api';
import { terminSchema, wunschSchema } from './termine-api';
import { dokumentSchema, rechnungZeileSchema } from './unterlagen-api';

// -----------------------------------------------------------------------------
// Einwilligungen (ADR-023 Punkt 13; ANN-261, ANN-262)
// -----------------------------------------------------------------------------

const einwilligungSchema = z.object({
  purpose: z.enum([
    'email_contact',
    'prescriber_report',
    'patient_photos',
    'training_health_data',
    'message_attachments',
  ]),
  /** open: noch nie etwas; refused: in der Praxis abgelehnt (ADR-017 Punkt 35). */
  state: z.enum(['open', 'granted', 'withdrawn', 'refused']),
  occurred_on: z.string().nullable(),
  /** Wer den Stand gesetzt hat: die Plattform oder ein Papier in der Praxis. */
  source: z.enum(['practice', 'platform']).nullable(),
  /** Nach der Lesefrist nur noch widerrufen (D2, ANN-261). */
  can_grant: z.boolean(),
});
export type Einwilligung = z.infer<typeof einwilligungSchema>;

export function einwilligungenSchluessel(zugangId: string) {
  return ['platform-consents', zugangId] as const;
}

/**
 * Der Stand je Zweck. Leer für eine Begleitung: Sie erteilt nichts, und der
 * Stand geht sie nichts an (Punkt 13).
 */
export async function ladeEinwilligungen(zugangId: string): Promise<Einwilligung[]> {
  const satz = 'Ihre Einwilligungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_consents', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(einwilligungSchema), ergebnis.data ?? [], satz);
}

/** Erteilen oder widerrufen, mit der Fassung des Texts, den die Person sah. */
export async function einwilligungSchreiben(eingabe: {
  zugangId: string;
  zweck: Einwilligung['purpose'];
  erteilen: boolean;
  fassung: string;
}): Promise<void> {
  const ergebnis = (await getSupabase().rpc('record_platform_consent', {
    p_access_id: eingabe.zugangId,
    p_purpose: eingabe.zweck,
    p_grant: eingabe.erteilen,
    p_wording_version: eingabe.fassung,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(einwilligungsfehler(ergebnis.error.message));
}

/** Verständliche Sätze für die Abweisungen des Servers (§13). */
export function einwilligungsfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('already granted')) return 'Diese Einwilligung ist schon erteilt.';
  if (m.includes('no consent to withdraw'))
    return 'Diese Einwilligung ist nicht erteilt. Es gibt nichts zu widerrufen.';
  if (m.includes('wording outdated'))
    return 'Der Text hat sich geändert. Bitte laden Sie die Seite neu und lesen Sie ihn noch einmal.';
  if (m.includes('not allowed'))
    return 'Das ist mit diesem Zugang nicht möglich. Bitte wenden Sie sich an die Praxis.';
  return 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';
}

// -----------------------------------------------------------------------------
// Datenexport (ANN-265)
// -----------------------------------------------------------------------------

const exportSchema = z.object({
  format: z.literal('plattform-export'),
  format_version: z.number(),
  exported_at: z.string(),
  organization: z.string(),
  relationship: z.enum(['treatment', 'training']),
  exported_by: z.enum(['self', 'legal_representative']),
  person: z.record(z.string(), z.unknown()),
  appointments: z.array(terminSchema),
  appointment_requests: z.array(wunschSchema),
  questionnaires: z.array(bogenSchema),
  invoices: z.array(rechnungZeileSchema),
  documents: z.array(dokumentSchema),
  consents: z.array(einwilligungSchema.omit({ can_grant: true })),
  /** Die eigenen Trainingspakete; ältere Exporte tragen sie nicht. */
  training_packages: z.array(meinPaketSchema).default([]),
  /** Der im Konto geschlossene Trainingsvertrag; sonst null. */
  training_contract: z
    .lazy(() => vertragSchema)
    .nullable()
    .default(null),
  /** Die eigenen Nachrichten; ältere Exporte tragen sie nicht. */
  messages: z.lazy(() => z.array(nachrichtSchema)).default([]),
});
export type Datenexport = z.infer<typeof exportSchema>;

/**
 * Die eigenen Daten der Plattform, wie der Server sie zusammensetzt. Jeder
 * Aufruf steht im Protokoll der Praxis (ADR-023 Punkt 24) - die Seite ruft
 * deshalb nur auf Knopfdruck auf und nie von selbst.
 */
export async function ladeDatenexport(
  zugangId: string,
): Promise<{ daten: Datenexport; roh: unknown }> {
  const satz =
    'Ihre Daten konnten nicht zusammengestellt werden. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('platform_export', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return { daten: antwort(exportSchema, ergebnis.data, satz), roh: ergebnis.data };
}

/**
 * Der Export einer Begleitung (ADR-023 Punkt 13, Fassung 6) - nur
 * ihre eigene Wahl zu Benachrichtigungen, nichts von der Person. Die Liste
 * ist dieselbe wie im ganzen Export (`notifications`).
 */
const benachrichtigungsexportSchema = z.object({
  format: z.literal('plattform-export'),
  format_version: z.number(),
  exported_at: z.string(),
  organization: z.string(),
  relationship: z.enum(['treatment', 'training']),
  exported_by: z.literal('companion'),
  notifications: z.object({
    settings: z
      .object({
        email_kinds: z.array(z.string()),
        push_kinds: z.array(z.string()),
        quiet_from: z.number().nullable(),
        quiet_until: z.number().nullable(),
        chosen_at: z.string(),
      })
      .nullable(),
    devices: z.array(z.object({ registered_at: z.string() })),
    deliveries: z.array(z.object({ kind: z.string(), state: z.string() })),
  }),
});
export type Benachrichtigungsexport = z.infer<typeof benachrichtigungsexportSchema>;

/** Wie `ladeDatenexport`: nur auf Knopfdruck, jeder Aufruf steht im Protokoll. */
export async function ladeBenachrichtigungsexport(
  zugangId: string,
): Promise<{ daten: Benachrichtigungsexport; roh: unknown }> {
  const satz =
    'Ihre Daten konnten nicht zusammengestellt werden. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('platform_export_notifications', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return {
    daten: antwort(benachrichtigungsexportSchema, ergebnis.data, satz),
    roh: ergebnis.data,
  };
}

// -----------------------------------------------------------------------------
// Benachrichtigungen (ADR-024 Punkt 15)
// -----------------------------------------------------------------------------

const artSchema = z.string().refine(istBenachrichtigungsart);

const benachrichtigungSchema = z.object({
  email_kinds: z.array(artSchema),
  push_kinds: z.array(artSchema),
  quiet_from: z.number().int().min(0).max(23),
  quiet_until: z.number().int().min(0).max(23),
  chosen_at: z.string().nullable(),
  disabled_kinds: z.array(z.string()),
  device_registered: z.boolean(),
});
export type Benachrichtigungswahl = Omit<
  z.infer<typeof benachrichtigungSchema>,
  'email_kinds' | 'push_kinds'
> & { email_kinds: Benachrichtigungsart[]; push_kinds: Benachrichtigungsart[] };

export function benachrichtigungSchluessel(zugangId: string, endpunkt: string | null) {
  return ['platform-notifications', zugangId, endpunkt] as const;
}

export async function ladeBenachrichtigungen(
  zugangId: string,
  endpunkt: string | null,
): Promise<Benachrichtigungswahl | null> {
  const satz = 'Ihre Benachrichtigungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_notification_settings', {
    p_access_id: zugangId,
    p_endpoint: endpunkt,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  const zeile = antwort(z.array(benachrichtigungSchema), ergebnis.data ?? [], satz)[0];
  return (zeile as Benachrichtigungswahl | undefined) ?? null;
}

export async function speichereBenachrichtigungen(
  zugangId: string,
  wahl: Pick<Benachrichtigungswahl, 'email_kinds' | 'push_kinds' | 'quiet_from' | 'quiet_until'>,
): Promise<void> {
  const { error } = (await getSupabase().rpc('set_platform_notification_settings', {
    p_access_id: zugangId,
    p_email_kinds: wahl.email_kinds,
    p_push_kinds: wahl.push_kinds,
    p_quiet_from: wahl.quiet_from,
    p_quiet_until: wahl.quiet_until,
  })) as { error: unknown };
  if (error) throw new Error('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
}

/** Dieses Gerät für Push an den eigenen Zugängen registrieren. */
export async function registriereGeraet(
  zugangIds: readonly string[],
  geraet: PushRegistrierung,
): Promise<void> {
  for (const zugangId of zugangIds) {
    const { error } = (await getSupabase().rpc('register_platform_push_subscription', {
      p_access_id: zugangId,
      p_endpoint: geraet.endpoint,
      p_p256dh: geraet.p256dh,
      p_auth: geraet.auth,
    })) as { error: unknown };
    if (error) throw new Error('Dieses Gerät konnte nicht eingetragen werden.');
  }
}

/** Push auf diesem Gerät ausschalten - an allen eigenen Zugängen. */
export async function entferneGeraet(endpunkt: string): Promise<void> {
  const { error } = (await getSupabase().rpc('remove_platform_push_subscription', {
    p_endpoint: endpunkt,
  })) as { error: unknown };
  if (error) throw new Error('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
}
