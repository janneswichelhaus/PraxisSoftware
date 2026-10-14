import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { suchform } from '@/app/funktionen';

// -----------------------------------------------------------------------------
// Die Patientenliste mit Karteileichen und Zahlungsstand (B1, B10)
//
// `list_patient_overview` liefert die Liste als einen JSON-Wert: Name, Alter,
// Ort und Kontakt wie bisher, dazu zuletzt behandelt, nächster Termin, die
// Grundlagen je Zustand und - nur für owner und office - Rechnungen, Offenes
// und zu Mahnendes (ANN-139, ANN-516). Was ankommt, entscheidet der Server;
// die Liste blendet nichts aus. Ein Wert statt Zeilen, damit die Liste nicht
// bei 200 Personen endet.
// -----------------------------------------------------------------------------

const eintragSchema = z.object({
  id: z.string(),
  given_name: z.string(),
  family_name: z.string(),
  date_of_birth: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  last_visit_on: z.string().nullable(),
  next_appointment_at: z.string().nullable(),
  open_bases: z.number(),
  bases_need_appointments: z.number(),
  bases_need_followup: z.number(),
  bases_ready: z.number(),
  bases_in_billing: z.number(),
  billing_visible: z.boolean(),
  invoices_issued: z.number().nullable(),
  invoices_paid: z.number().nullable(),
  outstanding_cents: z.number().nullable(),
  invoices_overdue: z.number().nullable(),
  reminders_due: z.number().nullable(),
});

export type Patienteneintrag = z.infer<typeof eintragSchema>;

export const PATIENT_OVERVIEW_KEY = ['patient-overview'] as const;

export async function fetchPatientOverview(): Promise<Patienteneintrag[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_overview')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error('Die Patientenliste konnte nicht geladen werden.');
  return z.array(eintragSchema).parse(data ?? []);
}

/** Sortierung (B10): zuletzt behandelt, offene Verordnung zuerst, A–Z. */
export type Sortierung = 'zuletzt' | 'verordnung' | 'name';

export const SORTIERUNGEN: readonly { wert: Sortierung; text: string }[] = [
  { wert: 'zuletzt', text: 'Zuletzt' },
  { wert: 'verordnung', text: 'Verordnung' },
  { wert: 'name', text: 'A–Z' },
];

// ANN-517: Vorgabe „Zuletzt“; die Liste ersetzt die Namenssuche ab drei Zeichen.
export function leseSortierung(wert: string | null): Sortierung {
  return wert === 'verordnung' || wert === 'name' ? wert : 'zuletzt';
}

/**
 * Was die Liste zeigt (B1): Karteileichen und Zahlungsstand. Eine Auswahl zur
 * Zeit; „alle“ ist keine.
 */
export type Zeigen =
  'termine_fehlen' | 'nachholen' | 'abrechnen' | 'in_abrechnung' | 'mahnen' | 'offen';

export function leseZeigen(wert: string | null): Zeigen | null {
  return wert === 'termine_fehlen' ||
    wert === 'nachholen' ||
    wert === 'abrechnen' ||
    wert === 'in_abrechnung' ||
    wert === 'mahnen' ||
    wert === 'offen'
    ? wert
    : null;
}

export const zeigenLabels: Record<Zeigen, string> = {
  termine_fehlen: 'Termine fehlen',
  nachholen: 'Haken oder Doku fehlt',
  abrechnen: 'Abrechnen',
  in_abrechnung: 'In der Abrechnung',
  mahnen: 'Zu mahnen',
  offen: 'Offene Rechnung',
};

export function passtZuZeigen(eintrag: Patienteneintrag, zeigen: Zeigen | null): boolean {
  switch (zeigen) {
    case null:
      return true;
    case 'termine_fehlen':
      return eintrag.bases_need_appointments > 0;
    case 'nachholen':
      return eintrag.bases_need_followup > 0;
    case 'abrechnen':
      return eintrag.bases_ready > 0;
    case 'in_abrechnung':
      return eintrag.bases_in_billing > 0;
    case 'mahnen':
      return (eintrag.reminders_due ?? 0) > 0;
    case 'offen':
      return (eintrag.outstanding_cents ?? 0) > 0;
  }
}

/** Die Auswahl, die es für diese Liste gibt: nur mit Treffern, Geld nur mit Recht. */
export function zeigenWahlen(
  liste: readonly Patienteneintrag[],
): { wert: Zeigen; text: string; anzahl: number }[] {
  const abrechnung = liste.some((eintrag) => eintrag.billing_visible);
  const alle: Zeigen[] = [
    'termine_fehlen',
    'nachholen',
    'abrechnen',
    'in_abrechnung',
    ...(abrechnung ? (['mahnen', 'offen'] as const) : []),
  ];
  return alle
    .map((wert) => ({
      wert,
      text: zeigenLabels[wert],
      anzahl: liste.filter((eintrag) => passtZuZeigen(eintrag, wert)).length,
    }))
    .filter((wahl) => wahl.anzahl > 0);
}

/**
 * Trifft die Zeile den Suchbegriff? (Design-Rollout B1, ANN-430)
 *
 * Name in beiden Schreibrichtungen und ohne Umlautsorgen - nach derselben
 * Regel wie `app.suchform` -, dazu Ort, Postleitzahl, Telefon und E-Mail.
 * Seit B10 schon ab dem ersten Zeichen: Die Liste trägt jede Akte, die die
 * Person lesen darf; die Suche ab drei Zeichen ist entfallen.
 */
export function passtZurSuche(eintrag: Patienteneintrag, begriff: string): boolean {
  const nadel = suchform(begriff.trim());
  if (!nadel) return true;
  const heuhaufen = [
    `${eintrag.given_name} ${eintrag.family_name}`,
    `${eintrag.family_name} ${eintrag.given_name}`,
    eintrag.city,
    eintrag.postal_code,
    eintrag.phone,
    eintrag.email,
  ]
    .filter((wert): wert is string => Boolean(wert))
    .map(suchform)
    .join('\n');
  return heuhaufen.includes(nadel);
}

function nachName(a: Patienteneintrag, b: Patienteneintrag): number {
  return (
    a.family_name.localeCompare(b.family_name, 'de') ||
    a.given_name.localeCompare(b.given_name, 'de') ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Rang für „offene Verordnung zuerst“: Was Arbeit verlangt (Termine fehlen,
 * Haken oder Doku fehlt, abrechnen), dann was läuft, dann der Rest.
 */
function verordnungsRang(eintrag: Patienteneintrag): number {
  if (eintrag.bases_ready + eintrag.bases_need_followup + eintrag.bases_need_appointments > 0) {
    return 0;
  }
  return eintrag.open_bases > 0 ? 1 : 2;
}

export function sortieren(
  liste: readonly Patienteneintrag[],
  sortierung: Sortierung,
): Patienteneintrag[] {
  const kopie = [...liste];
  if (sortierung === 'name') return kopie.sort(nachName);
  if (sortierung === 'verordnung') {
    return kopie.sort((a, b) => verordnungsRang(a) - verordnungsRang(b) || nachName(a, b));
  }
  // Zuletzt behandelt zuerst; wer nie behandelt wurde, steht am Ende.
  return kopie.sort((a, b) => {
    if (a.last_visit_on === b.last_visit_on) return nachName(a, b);
    if (a.last_visit_on === null) return 1;
    if (b.last_visit_on === null) return -1;
    return b.last_visit_on.localeCompare(a.last_visit_on);
  });
}

/**
 * Das eine Merkmal an der Zeile (Zeichen und Wort, DESIGN.md): was am
 * dringendsten ist. Geld nur, wenn der Server es geliefert hat.
 */
export function merkmal(
  eintrag: Patienteneintrag,
): { ton: 'warnung' | 'neutral' | 'positiv'; text: string } | null {
  if ((eintrag.reminders_due ?? 0) > 0) return { ton: 'warnung', text: 'Zu mahnen' };
  if (eintrag.bases_ready > 0) return { ton: 'warnung', text: 'Abrechnen' };
  if (eintrag.bases_need_followup > 0) return { ton: 'warnung', text: 'Haken oder Doku fehlt' };
  if (eintrag.bases_need_appointments > 0) return { ton: 'warnung', text: 'Termine fehlen' };
  if (eintrag.bases_in_billing > 0) return { ton: 'neutral', text: 'In der Abrechnung' };
  return null;
}
