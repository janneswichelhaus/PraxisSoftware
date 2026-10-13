import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { rufnummern, type DayPlanEntry, type Rufnummer } from './api';
import { besuchsphase } from './tagesstart';

// -----------------------------------------------------------------------------
// Wege eines Besuchs aus der Übersicht (Auftrag C1 „Besuch in einem Zug“)
//
// Reine Funktionen: wohin „Doku“ führt, welche Nummer der Anrufknopf wählt und
// wie die Nachricht „Später da?“ lautet. Je Regel eine Stelle, damit eine
// andere Entscheidung genau hier geändert wird.
// -----------------------------------------------------------------------------

/** Die Schreibseite eines Termins mit dem Weg zurück in die Übersicht. */
export function schreibseite(terminId: string): string {
  return mitRueckweg(`/termine/${terminId}/abschluss`, '/');
}

/**
 * Wohin „Doku“ an Karte und Zeile führt (Auftrag C1; vor dem Besuch ANN-225).
 *
 * Wartet der Besuch noch, ist es der Reiter „Doku“ der Akte mit diesem Termin
 * oben - der Blick auf die bisherige Doku vor der Tür (Jannes 2026-10-03,
 * ANN-225). Ab dem Beginn, und solange die Doku offen oder im Entwurf ist,
 * führt der Knopf direkt auf die Schreibseite: Nach dem Besuch war die Akte
 * ein Umweg. Ist die Doku festgeschrieben, zeigt die Akte den Eintrag mit dem
 * Weg zum Nachtrag (Leitfaden L3, ADR-016). Wer nicht schreiben darf, liest
 * immer in der Akte.
 */
export function dokuZiel(
  termin: DayPlanEntry,
  jetzt: number,
  darfDokumentieren: boolean,
): string | null {
  if (!termin.patient_id) return null;
  const akte = mitRueckweg(`/patienten/${termin.patient_id}/doku?termin=${termin.id}`, '/');
  if (!darfDokumentieren) return akte;
  const schreiben =
    (termin.status === 'confirmed' && besuchsphase(termin, jetzt) !== 'wartet') ||
    (termin.status === 'completed' && termin.documentation_status !== 'final');
  return schreiben ? schreibseite(termin.id) : akte;
}

/** Die Nummer für den Anrufknopf: zuerst Mobil, sonst das Festnetz (`rufnummern`). */
export function anrufNummer(termin: DayPlanEntry): Rufnummer | null {
  return rufnummern(termin)[0] ?? null;
}

/**
 * „Später da?“ als Übergabe an die SMS-App des Diensttelefons (ANN-476).
 *
 * Gesendet wird von Hand aus der eigenen App, ohne Dienstleister; die
 * Anwendung schreibt nichts mit. Der Text nennt nur die Praxis und die
 * Minuten - keinen Namen, keinen Grund, keine Gesundheitsangabe. Nur an eine
 * Mobilnummer: Ein Festnetz empfängt keine SMS.
 */
export const VERSPAETUNG_MINUTEN = [10, 15, 20] as const;

export function verspaetungsText(praxis: string, minuten: number): string {
  return `Guten Tag, hier ${praxis}. Ich bin etwa ${minuten} Minuten später da als vereinbart.`;
}

/**
 * `sms:` mit Vorlagentext. `?&body=` versteht iOS wie Android; die Nummer
 * steht bereinigt wie beim Wählen (`telHref`).
 */
export function smsHref(nummer: string, text: string): string {
  return `sms:${telHref(nummer).slice('tel:'.length)}?&body=${encodeURIComponent(text)}`;
}

export function smsNummer(termin: DayPlanEntry): string | null {
  return termin.patient_phone_mobile?.trim() || null;
}
