import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenschutzvermerke einer Akte (PAT-006).
 *
 * Datenschutzinformation und Behandlungsvertrag bleiben Papier; die Akte hält
 * fest, dass und wann sie vorlagen. Einwilligungen stehen je Zweck, ein
 * Widerruf ist ein eigener Vermerk und überschreibt die Erteilung nicht.
 *
 * Gelesen wird direkt aus `patient_privacy_records` — die RLS lässt die vier
 * Praxisrollen der eigenen Organisation lesen und sonst niemanden (ADR-004).
 * Geschrieben wird ausschließlich über `record_patient_privacy_entry`; die
 * Regeln (kein Datum in der Zukunft, kein doppelter Vermerk, kein Widerruf
 * ohne Erteilung) prüft der Server. Diese Datei spiegelt sie nur, damit die
 * Oberfläche nicht erst anbietet, was abgewiesen würde.
 */

/**
 * Die Zwecke, für die die Praxis eine Einwilligung einholt (ANN-093).
 *
 * Muss deckungsgleich mit dem Constraint an `patient_privacy_records.purpose`
 * bleiben (`supabase/migrations/20260922130000_datenschutzvermerke.sql`).
 * Die Behandlung selbst steht hier bewusst nicht: Sie braucht keine
 * Einwilligung, sondern stützt sich auf den Behandlungsvertrag und
 * Art. 9 Abs. 2 lit. h DSGVO.
 */
export const EINWILLIGUNGSZWECKE = ['email_contact', 'prescriber_report'] as const;
export type Einwilligungszweck = (typeof EINWILLIGUNGSZWECKE)[number];

export const zweckTexte: Record<Einwilligungszweck, { label: string; beschreibung: string }> = {
  email_contact: {
    label: 'Kontakt per E-Mail',
    beschreibung:
      'Termine und organisatorische Nachrichten per unverschlüsselter E-Mail, nach Hinweis auf das Risiko (ANN-041).',
  },
  prescriber_report: {
    label: 'Bericht an die verordnende Praxis',
    beschreibung:
      'Entbindung von der Schweigepflicht gegenüber der verordnenden Ärztin oder dem verordnenden Arzt, für Rückmeldungen zum Behandlungsverlauf.',
  },
};

const vermerkartSchema = z.enum([
  'privacy_notice_handed_out',
  'treatment_contract_signed',
  'consent_granted',
  'consent_withdrawn',
]);
export type Vermerkart = z.infer<typeof vermerkartSchema>;

const vermerkSchema = z.object({
  id: z.string(),
  record_kind: vermerkartSchema,
  purpose: z.enum(EINWILLIGUNGSZWECKE).nullable(),
  notice_version: z.string().nullable(),
  occurred_on: z.string(),
  recorded_at: z.string(),
});

export type Datenschutzvermerk = z.infer<typeof vermerkSchema>;

export async function fetchDatenschutzvermerke(patientId: string): Promise<Datenschutzvermerk[]> {
  const { data, error } = (await getSupabase()
    .from('patient_privacy_records')
    .select('id, record_kind, purpose, notice_version, occurred_on, recorded_at')
    .eq('patient_id', patientId)
    .order('recorded_at', { ascending: true })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Datenschutzvermerke konnten nicht geladen werden.');
  return z.array(vermerkSchema).parse(data);
}

export interface NeuerVermerk {
  patientId: string;
  art: Vermerkart;
  zweck?: Einwilligungszweck;
  fassung?: string;
  datum: string;
}

/** Verständliche Meldungen für die Abweisungen des Servers — ohne interne Details. */
function meldungFuer(message: string): string {
  if (message.includes('future')) return 'Das Datum darf nicht in der Zukunft liegen.';
  if (message.includes('already granted')) return 'Diese Einwilligung ist bereits vermerkt.';
  if (message.includes('no consent to withdraw'))
    return 'Für diesen Zweck ist keine Einwilligung vermerkt, die widerrufen werden könnte.';
  if (message.includes('withdrawal before consent'))
    return 'Der Widerruf kann nicht vor der Einwilligung liegen.';
  if (message.includes('not allowed')) return 'Für diesen Vermerk fehlt die Berechtigung.';
  return 'Der Vermerk konnte nicht gespeichert werden.';
}

export async function vermerkeSpeichern(vermerk: NeuerVermerk): Promise<void> {
  const { error } = (await getSupabase().rpc('record_patient_privacy_entry', {
    p_patient_id: vermerk.patientId,
    p_record_kind: vermerk.art,
    p_purpose: vermerk.zweck ?? null,
    p_notice_version: vermerk.fassung ?? null,
    p_occurred_on: vermerk.datum,
  })) as { error: { message?: string } | null };

  if (error) throw new Error(meldungFuer(error.message ?? ''));
}

export interface Einwilligungsstand {
  zweck: Einwilligungszweck;
  /** Erteilt und nicht widerrufen. */
  erteilt: boolean;
  /** Datum der jüngsten Erteilung beziehungsweise des jüngsten Widerrufs. */
  seit: string | null;
}

export interface Datenschutzstand {
  /** Jüngste Aushändigung der Datenschutzinformation. */
  datenschutzinformation: { am: string; fassung: string } | null;
  /** Jüngste Unterschrift des Behandlungsvertrags. */
  behandlungsvertrag: { am: string } | null;
  einwilligungen: Einwilligungsstand[];
}

/**
 * Der aktuelle Stand aus der Liste der Vermerke.
 *
 * Maßgeblich ist die Reihenfolge der Eingabe (`recorded_at`), wie auf dem
 * Server: Die jüngste Zeile eines Zwecks ist sein Stand. Die Liste kommt
 * bereits aufsteigend sortiert; die Funktion verlässt sich nicht darauf.
 */
export function datenschutzstand(vermerke: readonly Datenschutzvermerk[]): Datenschutzstand {
  const sortiert = [...vermerke].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));

  let datenschutzinformation: Datenschutzstand['datenschutzinformation'] = null;
  let behandlungsvertrag: Datenschutzstand['behandlungsvertrag'] = null;
  const zwecke = new Map<Einwilligungszweck, Einwilligungsstand>(
    EINWILLIGUNGSZWECKE.map((zweck) => [zweck, { zweck, erteilt: false, seit: null }]),
  );

  for (const v of sortiert) {
    if (v.record_kind === 'privacy_notice_handed_out') {
      datenschutzinformation = { am: v.occurred_on, fassung: v.notice_version ?? '' };
    } else if (v.record_kind === 'treatment_contract_signed') {
      behandlungsvertrag = { am: v.occurred_on };
    } else if (v.purpose) {
      zwecke.set(v.purpose, {
        zweck: v.purpose,
        erteilt: v.record_kind === 'consent_granted',
        seit: v.occurred_on,
      });
    }
  }

  return {
    datenschutzinformation,
    behandlungsvertrag,
    einwilligungen: EINWILLIGUNGSZWECKE.map((zweck) => zwecke.get(zweck)!),
  };
}

export const vermerkartTexte: Record<Vermerkart, string> = {
  privacy_notice_handed_out: 'Datenschutzinformation ausgehändigt',
  treatment_contract_signed: 'Behandlungsvertrag unterschrieben',
  consent_granted: 'Einwilligung erteilt',
  consent_withdrawn: 'Einwilligung widerrufen',
};
