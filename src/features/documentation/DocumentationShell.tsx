import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { fetchAppointment, type Appointment } from '@/features/appointments/api';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { fetchTreatmentDocumentation, type TreatmentDocumentation } from './api';

/**
 * Gemeinsamer Rahmen der Dokumentationsseiten (DOK-002).
 *
 * Alle vier Seiten - Entwurf, Korrektur, Nachtrag und Verlauf - brauchen
 * dieselbe Vorarbeit: Rückweg zum Termin, Rollenprüfung für die Darstellung,
 * Termin und Dokumentation laden, Lade- und Fehlerzustände. Ohne diesen Rahmen
 * stünde derselbe Block viermal da, und eine Abweichung darin wäre genau die
 * Art Fehler, die niemandem auffällt.
 *
 * **Der mitgereiste Rückweg bleibt erhalten (DOK-01, NAV-03, ZST-17).** Die
 * Übersicht und der Termin schicken `?zurueck=` mit. Der Kopf-Link führt
 * dorthin (`Rueckweg`, sonst zum Termin); „Abbrechen" und der Weg nach dem
 * Speichern führen zum Termin **samt** diesem Rückweg (`zumTermin`). Bis
 * UXR-008 zielten alle drei fest auf `/termine/:id`, und der Termin fiel auf
 * „Zurück zur Patientenliste" zurück - Kalenderwoche, Filter und die Stelle in
 * der Akte waren weg.
 *
 * Die Rollenprüfung hier ist ausschließlich Darstellung. Verbindlich prüfen die
 * Serverfunktionen selbst, und auf die Tabellen gibt es überhaupt kein Recht
 * (ADR-004, ADR-010).
 *
 * Die Abfragen laufen nur, wenn die Rolle passt: sonst löste allein der Aufruf
 * einer Seite einen protokollierten Lesezugriff auf klinischen Freitext aus.
 */
export function DocumentationShell({
  appointmentId,
  darf,
  verweigert,
  children,
}: {
  appointmentId: string | undefined;
  darf: boolean;
  verweigert: string;
  children: (daten: {
    appointment: Appointment;
    dokumentation: TreatmentDocumentation;
    /** Der Rückweg, mit dem die Seite geöffnet wurde - leer, wenn keiner kam. */
    eingehend: string;
    /** Der Termin samt diesem Rückweg: Ziel für „Abbrechen" und nach Erfolg. */
    zumTermin: string;
  }) => ReactNode;
}) {
  const [suche] = useSearchParams();
  const eingehend = leseRueckweg(suche, '');
  const termin = `/termine/${appointmentId ?? ''}`;

  const terminAbfrage = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId) && darf,
    retry: false,
  });

  const doku = useQuery({
    queryKey: ['treatment-note', appointmentId],
    queryFn: () => fetchTreatmentDocumentation(appointmentId!),
    enabled: Boolean(appointmentId) && darf,
    retry: false,
  });

  return (
    <>
      {appointmentId ? (
        <Rueckweg standard={termin} beschriftung="Zurück zum Termin" />
      ) : (
        <Rueckweg standard="/kalender" />
      )}

      {!darf ? <ErrorState title="Nicht freigegeben" description={verweigert} /> : null}

      {darf && (terminAbfrage.isPending || doku.isPending) ? (
        <LoadingState label="Termin wird geladen …" />
      ) : null}

      {darf && (terminAbfrage.isError || doku.isError) ? (
        <ErrorState
          title="Die Behandlungsdokumentation konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => Promise.all([terminAbfrage.refetch(), doku.refetch()])}
        />
      ) : null}

      {darf && terminAbfrage.data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {darf && terminAbfrage.data && doku.data
        ? children({
            appointment: terminAbfrage.data,
            dokumentation: doku.data,
            eingehend,
            zumTermin: mitRueckweg(termin, eingehend),
          })
        : null}
    </>
  );
}
