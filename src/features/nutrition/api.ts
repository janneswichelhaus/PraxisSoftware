import { z } from 'zod';
import { abgewiesen } from '@/lib/abgewiesen';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { type AppointmentFormValues, schreibfehler } from '@/features/calendar/appointments';
import {
  einwilligungSchema,
  FORMELN,
  GESCHLECHTER,
  gewichtSchema,
  ZIELE,
  zielwerteSchema,
  type Formel,
  type Geschlecht,
  type Ziel,
} from './zielwerte';
import { tagSchema, zieleSchema } from './tagebuch';

/**
 * Die Ernährungsberatung in der Praxis (ERN-001, ADR-027).
 *
 * Lesen und schreiben allein mit der Fähigkeit „Ernährungsberatung“ (owner,
 * ADR-027 Punkt 4) - verbindlich prüft der Server, jedes Lesen steht als
 * Öffnen von Akte bzw. Trainingsverhältnis im Protokoll.
 */

export type { Verhaeltnisart } from './eingabe';
import type { Verhaeltnisart } from './eingabe';

const profilSchema = z.object({
  id: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  started_on: z.string(),
  ended_on: z.string().nullable(),
  height_cm: z.number(),
  formula_sex: z.enum(GESCHLECHTER),
  body_fat_percent: z.number().nullable(),
  activity_pal: z.number(),
  goal: z.enum(ZIELE),
  bmr_formula: z.enum(FORMELN),
  target_weight_kg: z.number().nullable(),
  target_weight_source: z.enum(['counsellor', 'person']).nullable(),
  overrides: z.object({
    energy_kcal: z.number().nullable(),
    protein_g: z.number().nullable(),
    fat_g: z.number().nullable(),
    carbohydrate_g: z.number().nullable(),
    water_ml: z.number().nullable(),
  }),
  notes: z.string().nullable(),
  diary_enabled: z.boolean(),
  diary_changed_at: z.string().nullable(),
  diary_changed_by_kind: z.enum(['self', 'legal_representative']).nullable(),
  updated_at: z.string(),
  consent: einwilligungSchema.nullable(),
  weights: z.array(gewichtSchema),
  targets: zielwerteSchema,
});

export type Ernaehrungsprofil = z.infer<typeof profilSchema>;

const sichtSchema = z.object({
  today: z.string(),
  relationship_open: z.boolean(),
  birth_date_known: z.boolean(),
  running_elsewhere: z.enum(['treatment', 'training']).nullable(),
  earlier_count: z.number(),
  profile: profilSchema.nullable(),
});

export type Ernaehrungssicht = z.infer<typeof sichtSchema>;

export function ernaehrungSchluessel(art: Verhaeltnisart, verhaeltnisId: string) {
  return ['ernaehrung', art, verhaeltnisId] as const;
}

/** Profil eines Verhältnisses; `null` heißt: ohne Recht oder nicht gefunden. */
export async function fetchErnaehrung(
  art: Verhaeltnisart,
  verhaeltnisId: string,
): Promise<Ernaehrungssicht | null> {
  const satz = 'Die Ernährungsberatung konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_nutrition_profile', {
    p_kind: art,
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(sichtSchema.nullable(), data ?? null, satz);
}

/** Verständliche Sätze statt der Meldung des Servers (§13). */
export function ernaehrungsfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('already running'))
    return 'Für diese Person läuft schon eine Ernährungsberatung. Bitte die laufende zuerst beenden.';
  if (m.includes('consent missing'))
    return 'Ohne Einwilligung wird nichts eingetragen. Bitte zuerst die Einwilligung vermerken.';
  if (m.includes('changed meanwhile'))
    return 'Das Profil wurde inzwischen geändert. Bitte neu laden und die Eingaben noch einmal machen.';
  if (m.includes('relationship has ended')) return 'Der Vertrag ist beendet.';
  if (m.includes('has ended')) return 'Die Beratung ist beendet; das Profil bleibt, wie es ist.';
  if (m.includes('future')) return 'Das Datum liegt in der Zukunft.';
  if (m.includes('withdrawal before consent') || m.includes('consent before withdrawal'))
    return 'Das Datum liegt vor dem letzten Vermerk zur Einwilligung.';
  if (m.includes('before')) return 'Das Datum liegt vor dem Beginn der Beratung.';
  if (m.includes('already granted')) return 'Die Einwilligung ist schon vermerkt.';
  if (m.includes('no consent to withdraw')) return 'Es gibt keine Einwilligung zu widerrufen.';
  if (m.includes('check constraint') || m.includes('violates'))
    return 'Bitte die Angaben prüfen: Größe 100 bis 250 cm, Gewicht 20 bis 350 kg, Körperfett 3 bis 70 %.';
  if (m.includes('not allowed'))
    return 'Die Ernährungsberatung führt die Praxisinhaber:in; dieses Konto darf das nicht.';
  return 'Nicht gespeichert. Bitte die Verbindung prüfen und erneut versuchen.';
}

async function aufrufen(funktion: string, parameter: Record<string, unknown>): Promise<unknown> {
  const { data, error } = (await getSupabase().rpc(funktion, parameter)) as {
    data: unknown;
    error: { message?: string } | null;
  };
  if (error) throw new Error(ernaehrungsfehler(error.message));
  return data;
}

export interface Profilangaben {
  groesse: number;
  geschlecht: Geschlecht;
  koerperfett: number | null;
  pal: number;
  ziel: Ziel;
  zielgewicht: number | null;
}

export async function profilAnlegen(
  eingabe: Profilangaben & {
    art: Verhaeltnisart;
    verhaeltnisId: string;
    einwilligungAm: string;
    gewicht: number;
    notizen: string;
  },
): Promise<void> {
  await aufrufen('create_nutrition_profile', {
    p_kind: eingabe.art,
    p_relationship_id: eingabe.verhaeltnisId,
    p_consent_on: eingabe.einwilligungAm,
    p_height_cm: eingabe.groesse,
    p_weight_kg: eingabe.gewicht,
    p_formula_sex: eingabe.geschlecht,
    p_activity_pal: eingabe.pal,
    p_goal: eingabe.ziel,
    p_body_fat_percent: eingabe.koerperfett,
    p_target_weight_kg: eingabe.zielgewicht,
    p_notes: eingabe.notizen.trim() === '' ? null : eingabe.notizen.trim(),
  });
}

export async function profilAendern(
  profilId: string,
  erwartet: string,
  eingabe: Profilangaben & { formel: Formel },
): Promise<void> {
  await aufrufen('update_nutrition_profile', {
    p_profile_id: profilId,
    p_expected: erwartet,
    p_height_cm: eingabe.groesse,
    p_formula_sex: eingabe.geschlecht,
    p_body_fat_percent: eingabe.koerperfett,
    p_activity_pal: eingabe.pal,
    p_goal: eingabe.ziel,
    p_bmr_formula: eingabe.formel,
    p_target_weight_kg: eingabe.zielgewicht,
  });
}

export interface Ueberschreibungen {
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  water_ml: number | null;
}

export async function zielwerteSetzen(profilId: string, werte: Ueberschreibungen): Promise<void> {
  await aufrufen('set_nutrition_overrides', {
    p_profile_id: profilId,
    p_energy_kcal: werte.energy_kcal,
    p_protein_g: werte.protein_g,
    p_fat_g: werte.fat_g,
    p_carbohydrate_g: werte.carbohydrate_g,
    p_water_ml: werte.water_ml,
  });
}

export async function notizenSpeichern(profilId: string, notizen: string): Promise<void> {
  await aufrufen('set_nutrition_notes', { p_profile_id: profilId, p_notes: notizen });
}

export async function gewichtEintragen(
  profilId: string,
  tag: string,
  gewicht: number,
): Promise<void> {
  await aufrufen('record_nutrition_weight', {
    p_profile_id: profilId,
    p_measured_on: tag,
    p_weight_kg: gewicht,
  });
}

export async function einwilligungVermerken(
  profilId: string,
  art: 'consent_granted' | 'consent_withdrawn',
  tag: string,
): Promise<void> {
  await aufrufen('record_nutrition_consent', {
    p_profile_id: profilId,
    p_record_kind: art,
    p_occurred_on: tag,
  });
}

export async function beratungBeenden(profilId: string, tag: string): Promise<void> {
  await aufrufen('end_nutrition_profile', { p_profile_id: profilId, p_ended_on: tag });
}

// -----------------------------------------------------------------------------
// ERN-010: das Tagebuch für die Beratung - sieben Tage bis zu einem Tag. Die
// Beratung liest mit und schreibt nicht (ADR-027 Punkt 10).
// -----------------------------------------------------------------------------

const tagebuchDerBeratungSchema = z.object({
  today: z.string(),
  started_on: z.string(),
  from: z.string(),
  to: z.string(),
  targets: zieleSchema,
  days: z.array(tagSchema),
});

export type TagebuchDerBeratung = z.infer<typeof tagebuchDerBeratungSchema>;

export function tagebuchSchluessel(profilId: string, bis: string | null) {
  return ['ernaehrung', 'tagebuch', profilId, bis ?? 'heute'] as const;
}

/** Sieben Tage des Tagebuchs bis `bis` (ohne Angabe heute). */
export async function fetchTagebuch(
  profilId: string,
  bis: string | null,
): Promise<TagebuchDerBeratung | null> {
  const satz = 'Das Tagebuch konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_nutrition_diary', {
    p_profile_id: profilId,
    p_to: bis,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(tagebuchDerBeratungSchema.nullable(), data ?? null, satz);
}

// -----------------------------------------------------------------------------
// ERN-012: der Beratungstermin (ANN-622, ANN-664). Am Verhältnis des laufenden
// Profils - an der Akte ein Termin der Behandlung, am Trainingsverhältnis
// einer des Trainings, jeweils mit dem Anlass „Ernährungsberatung“. Mit dem
// Haken entsteht die Position; abgerechnet wird mit der Rechnung des Bereichs.
// -----------------------------------------------------------------------------

export async function beratungsterminAnlegen(
  profilId: string,
  werte: AppointmentFormValues,
  ausserhalbBestaetigt: boolean,
  vergangenheitBestaetigt: boolean,
): Promise<string> {
  const satz = 'Der Beratungstermin konnte nicht angelegt werden.';
  const ergebnis = (await getSupabase().rpc('create_nutrition_appointment', {
    p_profile_id: profilId,
    p_staff_member_id: werte.staff_member_id,
    p_appointment_type: werte.appointment_type,
    p_date: werte.date,
    p_start_time: werte.start_time,
    p_end_time: werte.end_time,
    p_location_id: werte.appointment_type === 'practice' ? werte.location_id : null,
    p_allow_outside_working_hours: ausserhalbBestaetigt,
    p_confirmed_past: vergangenheitBestaetigt,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) {
    const m = ergebnis.error.message ?? '';
    if (m.includes('consent missing'))
      throw new Error('Ohne erteilte Einwilligung entsteht kein Beratungstermin.');
    if (m.includes('has ended')) throw new Error('Die Beratung ist beendet.');
    if (m.includes('not allowed to counsel'))
      throw new Error(
        'Die Ernährungsberatung führt die Praxisinhaber:in; dieses Konto darf das nicht.',
      );
    if (m.includes('does not counsel nutrition'))
      throw new Error(
        'Die Beratung führt, wer die Ernährungsberatung trägt – bitte diese Person wählen.',
      );
    if (m.includes('staff member not assignable'))
      throw new Error('Die gewählte Person ist für diesen Bereich nicht im Kalender geführt.');
    if (m.includes('complete patient address'))
      throw new Error('Für den Hausbesuch fehlt eine vollständige Anschrift.');
    throw schreibfehler(ergebnis.error, satz);
  }
  if (abgewiesen(ergebnis)) throw new Error(satz);
  const id = z.string().uuid().safeParse(ergebnis.data);
  if (!id.success) throw new Error(satz);
  return id.data;
}
