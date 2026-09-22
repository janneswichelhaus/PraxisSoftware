import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { telHref } from '@/lib/telefon';
import {
  appointmentKindSchema,
  appointmentStatusSchema,
  appointmentTypeSchema,
  type AppointmentStatus,
} from '@/features/appointments/api';
import { documentationStatusSchema } from '@/features/documentation/api';

// -----------------------------------------------------------------------------
// Tagesliste des Hausbesuchstags (UX-001)
//
// Eigener Lesepfad neben dem Kalender: `list_day_plan` liefert genau einen
// Kalendertag einer Person, dafür mit den Angaben, an denen ein Hausbesuch
// sonst scheitert - Adresse, Rufnummer, Zugangshinweis. Der Kalender liefert
// sie bewusst nicht (ADR-004, Datenminimierung); die Zweckbindung steht in der
// Serverfunktion, nicht hier.
// -----------------------------------------------------------------------------

const dayPlanEntrySchema = z.object({
  id: z.string(),
  /**
   * `null` an einem Ereignis des Praxisbetriebs (CAL-016).
   *
   * Es gehört in diese Liste, weil es den Tag belegt — eine Teambesprechung,
   * die im Kalender steht, aber im eigenen Tagesplan fehlt, ist genau die
   * Lücke, an der eine Planung scheitert. Es ist aber keine Behandlung: kein
   * Name, keine Anschrift, keine Dokumentation.
   */
  patient_id: z.string().nullable(),
  staff_member_id: z.string(),
  appointment_type: appointmentTypeSchema,
  kind: appointmentKindSchema,
  title: z.string().nullable(),
  status: appointmentStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  patient_given_name: z.string().nullable(),
  patient_family_name: z.string().nullable(),
  location_name: z.string().nullable(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
  patient_phone: z.string().nullable(),
  patient_phone_mobile: z.string().nullable(),
  home_visit_access_note: z.string().nullable(),
  special_note: z.string().nullable(),
  /**
   * Dokumentationsstand ohne Inhalt (ANN-006). `null` heißt: die eigene Rolle
   * darf den Behandlungsnachweis nicht lesen - nicht, dass es keinen gibt.
   */
  documentation_status: documentationStatusSchema.nullable(),
  organization_time_zone: z.string(),
});

export type DayPlanEntry = z.infer<typeof dayPlanEntrySchema>;

/**
 * Die Tagesliste einer behandelnden Person für einen Kalendertag.
 *
 * Beide Angaben sind Pflicht - die Serverfunktion kennt weder „alle Personen"
 * noch einen Zeitraum. Ein Aufruf legt damit höchstens einen Arbeitstag offen.
 */
export async function fetchDayPlan(datum: string, staffMemberId: string): Promise<DayPlanEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_day_plan', {
    p_date: datum,
    p_staff_member_id: staffMemberId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Tagesliste konnte nicht geladen werden.');
  return z.array(dayPlanEntrySchema).parse(data ?? []);
}

/**
 * Wie lange die zuletzt geladene Tagesliste im Arbeitsspeicher der Seite
 * lesbar bleibt (UX-011, ADR-001, ANN-021).
 *
 * Das ist **kein** Offline-Modus: Es wird nichts auf dem Gerät gespeichert,
 * nichts synchronisiert, es gibt keinen Service Worker (ADR-015 Punkt 16).
 * Es ist der Zwischenspeicher, den die laufende Seite ohnehin hält - er wird
 * nur lange genug bemessen, dass ein Funkloch im Treppenhaus die Anschrift
 * nicht vom Bildschirm nimmt, und nicht länger.
 *
 * Ein Neuladen, ein geschlossener Tab und jede Abmeldung verwerfen ihn; mit
 * dem Kalendertag wechselt der Abfrageschlüssel und damit der Eintrag.
 *
 * Seit ANN-021 Fassung 2 ist diese Liste auch die Bereitstellung der
 * Tagesinformationen nach ADR-012 Punkt 9; einen Druck- oder Exportweg für
 * den Tagesplan gibt es bewusst nicht (G10-Funktionsteil gestrichen); Papier
 * entsteht über den Browserdruck der Übersicht (Druck-Basis, UI-000).
 */
export const TAGESPLAN_VORHALTEDAUER_MS = 8 * 60 * 60 * 1000;

/**
 * Verlangt dieser Termin heute noch etwas?
 *
 * Zwei Fälle, und der zweite ist der, den die Praxis am Abend beschäftigt:
 *
 *   1. Der Besuch steht noch aus (`confirmed`).
 *   2. Der Besuch ist abgeschlossen, aber die Dokumentation ist noch nicht
 *      finalisiert - sichtbar nur für Rollen, die auch dokumentieren dürfen.
 *      Für alle anderen wäre es eine Aufgabe, die sie nicht erledigen können.
 *
 * Ein abgesagter Termin ist nie offen, und ein nicht angetroffener auch nicht:
 * Der Vermerk schließt den Vorgang ab, und offen bleibt daran nichts (ADR-018
 * Fassung 2 Punkt 8). Ein dokumentierter Termin ist es ebenfalls nicht - der
 * Zustand sagt bereits, dass die Dokumentation festgeschrieben ist.
 *
 * Ist der Dokumentationsstand unbekannt (`null`, weil die Rolle den
 * Behandlungsnachweis nicht lesen darf), zählt allein der Terminstatus -
 * lieber nichts behaupten als etwas Falsches.
 */
export function istOffen(termin: DayPlanEntry, darfDokumentieren: boolean): boolean {
  // Ein Ereignis verlangt nichts: Es wird weder abgeschlossen noch
  // dokumentiert, und eine Aufgabe, die niemand erledigen kann, wäre eine
  // falsche Zahl über der Liste (CAL-016).
  //
  // Für den Trainingstermin gilt dasselbe, und zwar dauerhaft: Er erzeugt
  // keine Behandlungsdokumentation (ADR-022 Punkt 6), also steht an ihm auch
  // nichts offen. Er erreicht diese Liste nur bei einer Rolle, die beide
  // Bereiche trägt (owner, office).
  if (termin.kind !== 'therapy') return false;
  if (termin.status === 'confirmed') return true;
  if (termin.status !== 'completed') return false;
  if (!darfDokumentieren) return false;
  return termin.documentation_status !== null && termin.documentation_status !== 'final';
}

/** Warum ein abgeschlossener Termin noch offen steht - als Text, nicht als Farbe. */
export function offenGrund(termin: DayPlanEntry): string | null {
  if (termin.status !== 'completed') return null;
  if (termin.documentation_status === 'draft') return 'Dokumentation noch Entwurf';
  if (termin.documentation_status === 'none') return 'Dokumentation fehlt';
  return null;
}

/**
 * Die Besuchsadresse in zwei Zeilen - Straße mit Hausnummer, dann Ort.
 *
 * Leer, wenn es kein Hausbesuch ist: die Adressfelder sind dann serverseitig
 * gar nicht erst gefüllt.
 */
export function adressZeilen(termin: DayPlanEntry): string[] {
  const strasse = [termin.visit_street, termin.visit_house_number].filter(Boolean).join(' ');
  const ort = [termin.visit_postal_code, termin.visit_city].filter(Boolean).join(' ');
  return [strasse, ort].filter((zeile) => zeile.length > 0);
}

export interface Rufnummer {
  label: string;
  anzeige: string;
  href: string;
}

export function rufnummern(termin: DayPlanEntry): Rufnummer[] {
  const felder: [string, string | null][] = [
    ['Mobil', termin.patient_phone_mobile],
    ['Telefon', termin.patient_phone],
  ];
  return felder
    .filter((eintrag): eintrag is [string, string] => Boolean(eintrag[1]?.trim()))
    .map(([label, nummer]) => ({ label, anzeige: nummer, href: telHref(nummer) }));
}

/**
 * Reihenfolge nach Uhrzeit: früheste zuerst, bei Gleichstand stabil über die ID.
 *
 * Gilt für die eigene Tagesliste wie für den Tagesplan des Teams - beide
 * Datensätze tragen Beginn und Kennung.
 */
export function nachUhrzeit(
  a: { starts_at: string; id: string },
  b: { starts_at: string; id: string },
): number {
  return a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id);
}

export const dayPlanStatusLabels: Record<AppointmentStatus, string> = {
  confirmed: 'Steht aus',
  cancelled: 'Abgesagt',
  no_show: 'Nicht angetroffen',
  completed: 'Abgeschlossen',
  documented: 'Dokumentiert',
  invoiced: 'Abgerechnet',
};

/**
 * Ton des Abzeichens in der Tagesliste.
 *
 * „Steht aus" ist keine Bewertung und bleibt deshalb neutral; alles andere
 * bekommt den Ton, den es auch im Kalender hat. Der Zustand steht immer als
 * Wort daneben.
 */
export const dayPlanStatusTon: Record<
  AppointmentStatus,
  'neutral' | 'positiv' | 'warnung' | 'kritisch'
> = {
  confirmed: 'neutral',
  cancelled: 'kritisch',
  no_show: 'warnung',
  completed: 'positiv',
  documented: 'positiv',
  invoiced: 'positiv',
};
