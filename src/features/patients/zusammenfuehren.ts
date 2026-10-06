import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { abgewiesen } from '@/lib/abgewiesen';

/**
 * Eine Dublette in die richtige Akte übernehmen (PRX-017, PRX-EPIC-003b).
 *
 * Vorschau und Vorgang laufen über den Server (`preview_patient_merge`,
 * `merge_patients`); dort liegen Rollenprüfung, Regeln und Sperren. Diese
 * Datei übersetzt nur, was der Server sagt, in Sätze für die Praxis.
 */

const kopfSchema = z.object({
  id: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  date_of_birth: z.string().nullable(),
  status: z.enum(['active', 'inactive']),
  care_concluded_on: z.string().nullable(),
});

export const ZAEHLER = [
  'appointments',
  'treatment_notes',
  'treatment_bases',
  'billable_services',
  'invoices',
  'invoices_issued',
  'invoice_recipients',
  'fee_agreements',
  'patient_files',
  'privacy_records',
  'questionnaire_responses',
  'course_events',
  'therapy_reports',
  'tasks',
  'waitlist_entries',
  'legal_holds',
] as const;

export type Zaehler = (typeof ZAEHLER)[number];

const planSchema = z.object({
  source: kopfSchema,
  target: kopfSchema,
  counts: z.record(z.string(), z.coerce.number()),
  conflicts: z.array(z.string()),
  appended: z.array(z.string()),
  blockers: z.array(z.string()),
});

export type Zusammenfuehrungsplan = z.infer<typeof planSchema>;

/** Einzahl und Mehrzahl je Bereich, in der Reihenfolge von `ZAEHLER`. */
const BEREICHE: Record<Zaehler, [string, string]> = {
  appointments: ['Termin', 'Termine'],
  treatment_notes: ['Dokumentationseintrag', 'Dokumentationseinträge'],
  treatment_bases: ['Grundlage', 'Grundlagen'],
  billable_services: ['erfasste Leistung', 'erfasste Leistungen'],
  invoices: ['Rechnung', 'Rechnungen'],
  invoices_issued: ['davon ausgestellt', 'davon ausgestellt'],
  invoice_recipients: ['Rechnungsempfänger', 'Rechnungsempfänger'],
  fee_agreements: ['Honorarvereinbarung', 'Honorarvereinbarungen'],
  patient_files: ['Datei', 'Dateien'],
  privacy_records: ['Datenschutzvermerk', 'Datenschutzvermerke'],
  questionnaire_responses: ['Bogen', 'Bögen'],
  course_events: ['Verlaufsereignis', 'Verlaufsereignisse'],
  therapy_reports: ['Therapiebericht', 'Therapieberichte'],
  tasks: ['Aufgabe', 'Aufgaben'],
  waitlist_entries: ['Wartelisteneintrag', 'Wartelisteneinträge'],
  legal_holds: ['Löschsperre', 'Löschsperren'],
};

/** „3 Termine", „1 Datei" — nur Bereiche, in denen etwas wandert. */
export function wandertMit(counts: Record<string, number>): string[] {
  return ZAEHLER.filter((k) => (counts[k] ?? 0) > 0).map((k) => {
    const n = counts[k] ?? 0;
    const [eins, viele] = BEREICHE[k];
    return `${n} ${n === 1 ? eins : viele}`;
  });
}

const FELDER: Record<string, string> = {
  given_name: 'Vorname',
  family_name: 'Nachname',
  date_of_birth: 'Geburtsdatum',
  email: 'E-Mail',
  phone: 'Telefon',
  phone_mobile: 'Mobil',
  phone_work: 'Telefon dienstlich',
  institution: 'Einrichtung',
  primary_therapist_staff_member_id: 'Therapeut:in',
  treatment_table_required: 'Behandlungsliege',
  address: 'Anschrift',
  home_visit_access_note: 'Zugangshinweis',
  special_note: 'Besonderheit',
  remark: 'Bemerkung',
};

export function feldLabel(feld: string): string {
  return FELDER[feld] ?? feld;
}

/**
 * ANN-149: Warum das Zusammenführen nicht geht — und was vorher zu tun ist.
 * Der Server entscheidet (`app.patient_merge_plan`); hier steht nur der Satz.
 */
const SPERREN: Record<string, string> = {
  source_has_account:
    'An der Person der Dublette hängt ein Zugang zur Anwendung. Er verlöre seine Akte – bitte die Dublette öffnen und diese Akte von dort aus übernehmen.',
  draft_invoice_overlap:
    'Beide Akten haben einen Rechnungsentwurf für denselben Monat. Bitte einen der beiden Entwürfe verwerfen.',
  fee_agreement_overlap:
    'Beide Akten haben eine Honorarvereinbarung ab demselben Tag. Bitte eine davon entfernen; ist sie schon an einem Termin angewandt, vorher die Erfassung dieser Termine im Büro zurücknehmen.',
  open_waitlist_overlap:
    'Beide Akten stehen ohne Grundlage auf der Warteliste. Bitte einen der beiden Einträge schließen.',
  note_too_long:
    'Zugangshinweis, Besonderheit oder Bemerkung würden zusammen zu lang. Bitte in einer der beiden Akten kürzen.',
  take_along_too_many:
    '„Mitnehmen" hätte zusammen mehr als zehn Einträge. Bitte in einer der beiden Akten kürzen.',
};

export function sperrText(sperre: string): string {
  return SPERREN[sperre] ?? 'Die beiden Akten lassen sich so nicht zusammenführen.';
}

export async function previewPatientMerge(
  quelle: string,
  ziel: string,
): Promise<Zusammenfuehrungsplan> {
  const antwort = (await getSupabase().rpc('preview_patient_merge', {
    p_source_patient_id: quelle,
    p_target_patient_id: ziel,
  })) as { data: unknown; error: unknown; status: number };
  // ANN-115: Eine Abweisung kommt als 403 mit dem Körper null.
  if (abgewiesen(antwort) || antwort.data == null) {
    throw new Error('Die Vorschau konnte nicht geladen werden.');
  }
  return planSchema.parse(antwort.data);
}

export async function mergePatients(quelle: string, ziel: string): Promise<void> {
  const antwort = (await getSupabase().rpc('merge_patients', {
    p_source_patient_id: quelle,
    p_target_patient_id: ziel,
  })) as { data: unknown; error: unknown; status: number };
  if (abgewiesen(antwort) || antwort.data == null) {
    throw new Error('Die Akten konnten nicht zusammengeführt werden.');
  }
}

const vermerkSchema = z.object({
  id: z.string(),
  merged_at: z.string(),
  merged_by_name: z.string().nullable(),
  counts: z.record(z.string(), z.number()),
});
export type Zusammenfuehrungsvermerk = z.infer<typeof vermerkSchema>;

/**
 * Die Vermerke des Zusammenführens an einer Akte (ABN-018, BEF-108): wann,
 * durch wen, was mitgezogen ist - so lange wie die Akte, nicht nur so lange
 * wie das Auditlog.
 */
export async function fetchZusammenfuehrungen(
  patientId: string,
): Promise<Zusammenfuehrungsvermerk[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_merge_records', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Die Vermerke des Zusammenführens konnten nicht geladen werden.');
  return z.array(vermerkSchema).parse(data ?? []);
}
