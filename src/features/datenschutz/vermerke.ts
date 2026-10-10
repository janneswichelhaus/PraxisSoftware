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
 * bleiben (zuletzt `supabase/migrations/20260926150000_dok_006b_patient_photos.sql`).
 * Die Behandlung selbst steht hier bewusst nicht: Sie braucht keine
 * Einwilligung, sondern stützt sich auf den Behandlungsvertrag und
 * Art. 9 Abs. 2 lit. h DSGVO. Fotos dagegen stützen sich auf die Einwilligung
 * (ADR-017 Punkt 35) — wer widerruft, soll die Fotos loswerden.
 */
export const EINWILLIGUNGSZWECKE = [
  'email_contact',
  'prescriber_report',
  'patient_photos',
] as const;
export type Einwilligungszweck = (typeof EINWILLIGUNGSZWECKE)[number];

export const zweckTexte: Record<Einwilligungszweck, { label: string; beschreibung: string }> = {
  email_contact: {
    label: 'Kontakt per E-Mail',
    beschreibung:
      'Termine und organisatorische Nachrichten per unverschlüsselter E-Mail, nach Hinweis auf das Risiko.',
  },
  prescriber_report: {
    label: 'Bericht an die verordnende Praxis',
    beschreibung:
      'Entbindung von der Schweigepflicht gegenüber der verordnenden Ärztin oder dem verordnenden Arzt, für Rückmeldungen zum Behandlungsverlauf.',
  },
  patient_photos: {
    label: 'Fotos im Behandlungsverlauf',
    beschreibung:
      'Fotos, die das Praxisteam während der Behandlung aufnimmt — zur Übergabe und zum Vergleich im Verlauf. Neben der Akte, nicht in ihr; gelöscht nach spätestens zwölf Monaten, beim Widerruf sofort. Keine Weitergabe.',
  },
};

const vermerkartSchema = z.enum([
  'privacy_notice_handed_out',
  'treatment_contract_signed',
  'consent_granted',
  'consent_withdrawn',
  // ADR-017 Punkt 35, ANN-127: Eine Ablehnung ist ein eigener Vermerk und
  // ein erledigter Stand - kein offener Punkt und kein Widerruf.
  'consent_refused',
]);
export type Vermerkart = z.infer<typeof vermerkartSchema>;

const vermerkSchema = z.object({
  id: z.string(),
  record_kind: vermerkartSchema,
  purpose: z.enum(EINWILLIGUNGSZWECKE).nullable(),
  notice_version: z.string().nullable(),
  occurred_on: z.string(),
  recorded_at: z.string(),
  // POR-016: Herkunft - ein Papier der Praxis oder die Person auf der
  // Plattform, bei einer rechtlichen Vertretung mit ihrem Namen.
  // Ohne Angabe (ältere Aufrufer, Prüfseiten) ist es ein Vermerk der Praxis.
  source: z.enum(['practice', 'platform']).optional(),
  platform_access_kind: z.enum(['self', 'legal_representative']).nullable().optional(),
  representative_name: z.string().nullable().optional(),
});

export type Datenschutzvermerk = z.infer<typeof vermerkSchema>;

export async function fetchDatenschutzvermerke(patientId: string): Promise<Datenschutzvermerk[]> {
  const { data, error } = (await getSupabase()
    .from('patient_privacy_records')
    .select(
      'id, record_kind, purpose, notice_version, occurred_on, recorded_at, source, platform_access_kind, representative_name',
    )
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
  if (message.includes('already refused')) return 'Diese Ablehnung ist bereits vermerkt.';
  if (message.includes('consent is granted'))
    return 'Die Einwilligung ist erteilt. Bitte stattdessen den Widerruf vermerken.';
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
  /** Zuletzt ausdrücklich abgelehnt — ein erledigter Stand, kein offener. */
  abgelehnt: boolean;
  /** Datum des jüngsten Vermerks zu diesem Zweck. */
  seit: string | null;
  /** POR-016: Der jüngste Vermerk kam von der Plattform. */
  ueberPlattform: boolean;
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
    EINWILLIGUNGSZWECKE.map((zweck) => [
      zweck,
      { zweck, erteilt: false, abgelehnt: false, seit: null, ueberPlattform: false },
    ]),
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
        abgelehnt: v.record_kind === 'consent_refused',
        seit: v.occurred_on,
        ueberPlattform: v.source === 'platform',
      });
    }
  }

  return {
    datenschutzinformation,
    behandlungsvertrag,
    einwilligungen: EINWILLIGUNGSZWECKE.map((zweck) => zwecke.get(zweck)!),
  };
}

/**
 * Woher ein Vermerk kommt, als Zusatz in der Akte (POR-016): leer für die
 * Praxis, sonst „über die Plattform" und bei einer rechtlichen Vertretung
 * deren Name.
 */
export function herkunftText(
  v: Pick<Datenschutzvermerk, 'source' | 'representative_name'>,
): string {
  if (v.source !== 'platform') return '';
  return v.representative_name
    ? `über die Plattform, von ${v.representative_name} (rechtliche Vertretung)`
    : 'über die Plattform, von der Person selbst';
}

export const vermerkartTexte: Record<Vermerkart, string> = {
  privacy_notice_handed_out: 'Datenschutzinformation ausgehändigt',
  treatment_contract_signed: 'Behandlungsvertrag unterschrieben',
  consent_granted: 'Einwilligung erteilt',
  consent_withdrawn: 'Einwilligung widerrufen',
  consent_refused: 'Einwilligung abgelehnt',
};

/**
 * Der Kontrollwert der Rückfrage beim Foto-Widerruf (BEF-063): wie viele Fotos
 * gelöscht werden. Der Widerruf löscht nur die Arbeitshilfen; das
 * Dokumentationsfoto folgt der Akte (ADR-017 Punkt 46). Ohne geladene Liste -
 * oder ohne das Recht, sie zu sehen - bleibt es beim Satz ohne Zahl.
 */
export function loeschumfang(fotos: readonly { document_type: string }[] | undefined): string {
  const sperre = ' – außer eine Löschsperre hält sie.';
  if (!fotos) return `Alle Fotos als Arbeitshilfe werden sofort gelöscht${sperre}`;
  const n = fotos.filter((f) => f.document_type === 'patientenfoto').length;
  const doku = fotos.length - n;
  const bleiben =
    doku === 0
      ? ''
      : ` ${doku === 1 ? 'Ein Dokumentationsfoto bleibt' : `${doku} Dokumentationsfotos bleiben`} in der Akte.`;
  if (n === 0) return `Es liegt kein Foto als Arbeitshilfe vor; gelöscht wird nichts.${bleiben}`;
  const anzahl = n === 1 ? 'Ein Foto als Arbeitshilfe wird' : `${n} Fotos als Arbeitshilfe werden`;
  return `${anzahl} sofort gelöscht${sperre}${bleiben}`;
}
