import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { Section } from '@/components/ui/Section';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { Mitteilungszeichen } from './Mitteilungszeichen';
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
 * Seit CAL-012 steht hinter jedem Termin, ob und über welchen Weg er der
 * Patient:in mitgeteilt wurde. Kein Zeichen heißt: noch offen — oder der
 * Termin hat sich seit der Mitteilung geändert.
 *
 * Seit AKTE-003 steht der Abschnitt auf der Übersicht der Akte und ist dort
 * der Blick nach vorn: die nächsten Termine, mehr nicht. Alles Weitere -
 * Historie, abgesagte Termine, der Filter auf eine Verordnung - steht im
 * Terminbereich, und der Weg dorthin steht unter der Liste.
 *
 * Der Abschnitt erscheint für alle Rollen, die den Kalender lesen dürfen - für
 * ein Patientenkonto liefert die Serverfunktion nichts, und die Ansicht bleibt
 * leer statt zu behaupten, es gäbe keine Termine.
 */

/** Wie viele künftige Termine die Übersicht zeigt. Mehr wäre eine Terminliste. */
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
    <Section
      titel="Nächste Termine"
      // Das Mitteilen gehört hierher und nicht neben „Termin anlegen": Es ist
      // die Antwort auf „wann bin ich wieder dran" - zum Mitnehmen oder als
      // E-Mail (CAL-011, CAL-013). Nur, wenn es etwas mitzuteilen gibt.
      //
      // Nicht „Terminzettel": Hinter dem Wort suchte niemand die E-Mail, und
      // die Seite bietet seit CAL-013 beides an.
      aktion={
        data && data.length > 0 ? (
          <Link
            to={`/patienten/${patientId}/terminzettel`}
            className={kartenAktionKlassen('secondary')}
          >
            Termine mitteilen
          </Link>
        ) : null
      }
    >
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
                to={mitRueckweg(`/termine/${termin.id}`, `/patienten/${patientId}`)}
                className="hover:bg-surface-sunken flex min-h-14 flex-wrap items-center gap-x-4 gap-y-1 py-2.5 transition-colors"
              >
                {/* min-w-48: Ohne Mindestbreite schrumpft der Text, statt die
                    Zeichen umbrechen zu lassen - bei 375 px zerfiel das Datum
                    dann in drei Zeilen, während die Abzeichen daneben standen. */}
                <span className="text-ink min-w-48 flex-1 text-[0.9375rem] font-medium">
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
                {/* Die Mitteilungswege stehen hinter dem Termin, wie der
                    Zustand - beides beantwortet dieselbe Frage: Ist an diesem
                    Termin noch etwas zu tun? (CAL-012) */}
                <Mitteilungszeichen kanaele={termin.notification_channels} />
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

      {/* Der Weg in die vollständige Liste steht immer da - auch ohne künftigen
          Termin führt er zur Historie, und genau die sucht man dann. */}
      <Link
        to={`/patienten/${patientId}/termine`}
        className="text-accent mt-2 inline-flex min-h-11 items-center text-sm hover:underline"
      >
        Alle Termine und Historie
      </Link>
    </Section>
  );
}
