import { hakenFehlt } from '@/features/appointments';
import type { DayPlanEntry } from '@/lib/tagesplan';
import { appointmentStatusLabels, type AppointmentStatus } from '@/lib/termin';

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
 * Drei Fälle, und die letzten beiden beschäftigen die Praxis am Abend:
 *
 *   1. Der Besuch steht noch aus (`confirmed`).
 *   2. Die Doku ist festgeschrieben, aber der Haken fehlt (B4): Festschreiben
 *      hakt nicht ab.
 *   3. Der Besuch ist abgeschlossen, aber die Dokumentation ist noch nicht
 *      finalisiert - sichtbar nur für Rollen, die auch dokumentieren dürfen.
 *      Für alle anderen wäre es eine Aufgabe, die sie nicht erledigen können.
 *
 * Ein abgesagter Termin ist nie offen, und ein nicht angetroffener auch nicht:
 * Der Vermerk schließt den Vorgang ab, und offen bleibt daran nichts (ADR-018
 * Fassung 2 Punkt 8). Ein dokumentierter und abgehakter Termin ist es
 * ebenfalls nicht.
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
  // Der Trainingstermin erzeugt keine Behandlungsdokumentation (ADR-022
  // Punkt 6): offen ist er, solange er aussteht - danach nicht mehr. Seit
  // TRN-006 steht er in der eigenen Liste der Trainingsbetreuung, und dort
  // gehört ein kommender Termin nach oben, nicht unter „Erledigt".
  if (termin.kind === 'training') return termin.status === 'confirmed';
  if (termin.kind !== 'therapy') return false;
  // B4: Dokumentiert, aber nicht abgehakt, verlangt noch den Haken.
  if (hakenFehlt(termin.status, termin.checked_at)) return true;
  if (termin.status !== 'completed') return false;
  // Die Aufgabe „Doku schreiben" gehört den Schreibenden; den Stand selbst
  // zeigt `offenGrund` allen, die lesen dürfen (ABN-005, ANN-201 Fassung 2).
  if (!darfDokumentieren) return false;
  return termin.documentation_status !== null && termin.documentation_status !== 'final';
}

/** Warum ein abgeschlossener Termin noch offen steht - als Text, nicht als Farbe. */
export function offenGrund(termin: DayPlanEntry): string | null {
  if (termin.status !== 'completed') return null;
  if (termin.documentation_status === 'draft') return 'Doku im Entwurf';
  if (termin.documentation_status === 'none') return 'Doku offen';
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

/** Dieselben Wörter wie überall (BEF-067); der Name bleibt für die Aufrufer. */
export const dayPlanStatusLabels: Record<AppointmentStatus, string> = appointmentStatusLabels;

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
