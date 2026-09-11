import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Section';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeLabels,
  fetchUpcomingAppointments,
  formatLocalDate,
  formatLocalTimeRange,
  staffName,
} from './api';

/**
 * Die nächsten Termine in der Akte (UX-006).
 *
 * Die Akte zeigte bisher nur Vergangenes. Die häufigste Frage am Telefon -
 * „wann bin ich das nächste Mal dran?" - war damit nur über den Kalender zu
 * beantworten, und dort muss man die Woche kennen.
 *
 * Bewusst über der Dokumentation und unter den Stammdaten: Es ist eine
 * organisatorische Auskunft, keine klinische. Der Abschnitt erscheint für alle
 * Rollen, die den Kalender lesen dürfen - für ein Patientenkonto liefert die
 * Serverfunktion nichts, und die Ansicht bleibt leer statt zu behaupten, es
 * gäbe keine Termine.
 */

/** Wie viele künftige Termine die Akte zeigt. Mehr wäre eine Terminliste. */
const ANZAHL = 5;

export function PatientUpcomingAppointments({
  patientId,
  user,
}: {
  patientId: string;
  user: CurrentUser;
}) {
  const darfTermine = canManageAppointments(user.roles);

  const { data, isPending, isError } = useQuery({
    queryKey: ['patient-upcoming-appointments', patientId],
    queryFn: () => fetchUpcomingAppointments(patientId, ANZAHL),
    enabled: darfTermine,
    retry: false,
  });

  if (!darfTermine) return null;

  return (
    // Bewusst ohne eigene Schaltfläche „Termin anlegen": die steht schon oben
    // in der Akte und ist dort an den Versorgungsstatus gebunden. Zwei
    // gleichnamige Wege auf einer Seite wären ein Rätsel, kein Angebot.
    <Section titel="Nächste Termine">
      {isPending ? <LoadingState label="Termine werden geladen …" /> : null}
      {isError ? <ErrorState title="Die Termine konnten nicht geladen werden." /> : null}

      {data && data.length === 0 ? (
        <p className="text-ink-muted text-[0.9375rem]">Kein weiterer Termin vereinbart.</p>
      ) : null}

      {data && data.length > 0 ? (
        <ul className="divide-line border-line divide-y border-y">
          {data.map((termin) => (
            <li key={termin.id}>
              <Link
                to={`/termine/${termin.id}`}
                className="hover:bg-surface-sunken flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-3 transition-colors"
              >
                <span className="text-ink min-w-0 flex-1 text-[0.9375rem] font-medium">
                  {formatLocalDate(termin.starts_at, termin.organization_time_zone)}
                  <span className="text-ink-muted mt-0.5 block text-sm">
                    {formatLocalTimeRange(
                      termin.starts_at,
                      termin.ends_at,
                      termin.organization_time_zone,
                    )}
                    {` · ${appointmentTypeLabels[termin.appointment_type]}`}
                    {` · ${staffName(termin)}`}
                  </span>
                </span>
                {termin.status !== 'confirmed' ? (
                  <Badge ton={appointmentStatusTon[termin.status]}>
                    {appointmentStatusLabels[termin.status]}
                  </Badge>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
