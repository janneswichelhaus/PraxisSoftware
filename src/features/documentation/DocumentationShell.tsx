import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchAppointment, type Appointment } from '@/features/appointments/api';
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
  }) => ReactNode;
}) {
  const termin = useQuery({
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
      <Link
        to={appointmentId ? `/termine/${appointmentId}` : '/kalender'}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Termin
      </Link>

      {!darf ? <ErrorState title="Nicht freigegeben" description={verweigert} /> : null}

      {darf && (termin.isPending || doku.isPending) ? (
        <LoadingState label="Termin wird geladen …" />
      ) : null}

      {darf && (termin.isError || doku.isError) ? (
        <ErrorState title="Die Behandlungsdokumentation konnte nicht geladen werden." />
      ) : null}

      {darf && termin.data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}

      {darf && termin.data && doku.data
        ? children({ appointment: termin.data, dokumentation: doku.data })
        : null}
    </>
  );
}
