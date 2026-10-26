import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { fachAendern, fachLesen } from '@/lib/geraeteablage';
import { einrichtungLesen } from './servicePhone';
import { todayInTimeZone } from '@/lib/datum';
import type { DayPlanEntry } from '@/features/day-plan/api';

/**
 * Der eigene Tagesplan von heute auf dem Diensttelefon (OFF-001, ADR-024
 * Punkt 6, ANN-361).
 *
 * **Die Feldliste steht hier und nur hier** (`tagesplanTerminSchema`, ADR-001:
 * „sonst wächst sie zur Vollakte"): je Termin Uhrzeit, Terminart, Name,
 * Hausbesuchsadresse und Telefon, dazu was die Ansicht zum Zuordnen braucht -
 * Kennung, Art und Zustand des Termins. Kein Befund, keine Diagnose, keine
 * frühere Dokumentation, keine Verordnung, kein Zugangshinweis, keine
 * Besonderheit. Eine neue Spalte ist eine Änderung mit Review.
 *
 * Abgelegt wird nur auf einem eingerichteten Diensttelefon, nur die eigene
 * Liste (`staffMemberId` des Kontos) und nur für heute. Er fällt am Ende des
 * Tages (beim nächsten Lesen), beim Abmelden und beim Kontowechsel
 * (`ablageLeeren`), mit der Frist der Ablage und beim Ausschalten.
 */

const FACH = 'tagesplan';

/** ADR-024 Punkt 6: die Feldliste. */
export const tagesplanTerminSchema = z
  .object({
    id: z.string(),
    kind: z.string(),
    appointment_type: z.string(),
    status: z.string(),
    starts_at: z.string(),
    ends_at: z.string(),
    /** Nur an einem Ereignis des Praxisbetriebs gesetzt (Teambesprechung). */
    title: z.string().nullable(),
    given_name: z.string().nullable(),
    family_name: z.string().nullable(),
    visit_street: z.string().nullable(),
    visit_house_number: z.string().nullable(),
    visit_postal_code: z.string().nullable(),
    visit_city: z.string().nullable(),
    phone: z.string().nullable(),
    phone_mobile: z.string().nullable(),
  })
  .strict();
export type TagesplanTermin = z.infer<typeof tagesplanTerminSchema>;

const tagesplanSchema = z
  .object({
    tag: z.string(),
    zeitzone: z.string(),
    termine: z.array(tagesplanTerminSchema),
  })
  .strict();
export type Tagesplan = z.infer<typeof tagesplanSchema>;

/** Aus einer Zeile von `list_day_plan` genau die Felder der Liste. */
export function alsTagesplanTermin(e: DayPlanEntry): TagesplanTermin {
  const training = e.kind === 'training';
  // Ein Ereignis des Praxisbetriebs trägt keine Person (CAL-016).
  if (e.kind === 'internal') {
    return {
      id: e.id,
      kind: e.kind,
      appointment_type: e.appointment_type,
      status: e.status,
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      title: e.title,
      given_name: null,
      family_name: null,
      visit_street: null,
      visit_house_number: null,
      visit_postal_code: null,
      visit_city: null,
      phone: null,
      phone_mobile: null,
    };
  }
  return {
    id: e.id,
    kind: e.kind,
    appointment_type: e.appointment_type,
    status: e.status,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    title: null,
    given_name: (training ? e.training_given_name : e.patient_given_name) ?? null,
    family_name: (training ? e.training_family_name : e.patient_family_name) ?? null,
    visit_street: e.visit_street,
    visit_house_number: e.visit_house_number,
    visit_postal_code: e.visit_postal_code,
    visit_city: e.visit_city,
    phone: e.patient_phone,
    phone_mobile: e.patient_phone_mobile,
  };
}

/**
 * Nach jedem Laden der eigenen Liste von heute mit Verbindung: Sie ersetzt
 * die abgelegte. Die Frist der Ablage beginnt neu.
 */
export async function tagesplanAblegen(
  besitzer: string,
  zeitzone: string,
  tag: string,
  eintraege: readonly DayPlanEntry[],
): Promise<void> {
  if (!(await einrichtungLesen(besitzer))) return;
  if (tag !== todayInTimeZone(zeitzone)) return;
  const plan: Tagesplan = { tag, zeitzone, termine: eintraege.map(alsTagesplanTermin) };
  await fachAendern(besitzer, FACH, () => plan, true);
}

/** Der abgelegte Plan von heute - ein Plan eines anderen Tages fällt beim Lesen. */
export async function tagesplanLesen(
  besitzer: string,
  jetzt = new Date(),
): Promise<Tagesplan | null> {
  const roh = await fachLesen(besitzer, FACH);
  if (roh === undefined) return null;
  const g = tagesplanSchema.safeParse(roh);
  if (!g.success || g.data.tag !== todayInTimeZone(g.data.zeitzone, jetzt)) {
    await fachAendern(besitzer, FACH, () => undefined);
    return null;
  }
  return g.data;
}

/**
 * Räumt den abgelegten Tagesplan sofort (BEF-150): wenn das Konto nicht mehr
 * dokumentieren darf, der Zugang aber bleibt - sonst läge die Liste mit
 * Namen, Adressen und Telefonnummern bis zum Ende des Tages auf dem Gerät.
 * Entwürfe bleiben; die fallen nie still (§13).
 */
export async function tagesplanVerwerfen(besitzer: string): Promise<void> {
  await fachAendern(besitzer, FACH, () => undefined);
}

/**
 * Legt jede Antwort auf die eigene Tagesliste von heute ab, die in offener
 * Sitzung ankommt - gleich, welche Seite sie geladen hat. Die eine Stelle für
 * den Tagesplan; die Übersicht lädt wie bisher (Schlüssel `['day-plan', tag,
 * staffMemberId]`, `MyDayPage`).
 */
export function useTagesplanAblegen(
  besitzer: string,
  staffMemberId: string | null,
  zeitzone: string,
): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!staffMemberId) return;
    return queryClient.getQueryCache().subscribe((ereignis) => {
      if (ereignis.type !== 'updated' || ereignis.action.type !== 'success') return;
      const [art, tag, person] = ereignis.query.queryKey as readonly unknown[];
      if (art !== 'day-plan' || person !== staffMemberId || typeof tag !== 'string') return;
      void tagesplanAblegen(besitzer, zeitzone, tag, ereignis.action.data as DayPlanEntry[]).catch(
        () => undefined,
      );
    });
  }, [besitzer, staffMemberId, zeitzone, queryClient]);
}
