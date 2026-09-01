import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canReadTreatmentNote,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { formatLocalDate, formatLocalTime, type Appointment } from '@/features/appointments/api';
import { fetchTreatmentNote, treatmentNoteStatusLabels, type TreatmentNote } from './api';

const linkPrimaer =
  'bg-accent hover:bg-accent-hover inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium text-white transition-colors';
const linkSekundaer =
  'border-line-strong bg-surface text-ink hover:bg-surface-sunken inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors';

/** „Zuletzt geändert am 1. September 2026, 14:30 Uhr von Anna Beispiel". */
function aenderungszeile(note: TreatmentNote, zone: string): string {
  const zeitpunkt = `${formatLocalDate(note.updated_at, zone)}, ${formatLocalTime(note.updated_at, zone)} Uhr`;
  return note.last_editor_name
    ? `Zuletzt geändert am ${zeitpunkt} von ${note.last_editor_name}`
    : `Zuletzt geändert am ${zeitpunkt}`;
}

/**
 * Behandlungsdokumentation am Termin (DOK-001).
 *
 * Der Abschnitt wird für `office` und Patientenkonten gar nicht erst
 * gerendert und auch nicht abgefragt (PROJECT_PRINCIPLES.md 4.3, 4.6). Das ist
 * ausdrücklich keine Zugriffskontrolle: `get_treatment_note` prüft die Rolle
 * selbst, und auf die Tabelle gibt es überhaupt kein Recht.
 *
 * Angezeigt wird der Freitext unverändert. Die Anwendung fügt ihm nichts hinzu
 * - keine Hervorhebung, keine Einordnung, keine Bewertung (ADR-006).
 */
export function TreatmentNoteSection({
  appointment,
  user,
}: {
  appointment: Appointment;
  user: CurrentUser;
}) {
  const darfLesen = canReadTreatmentNote(user.roles);
  const darfSchreiben = canWriteTreatmentNote(user.roles);
  const abgesagt = appointment.status === 'cancelled';
  const zone = appointment.organization_time_zone;

  const { data, isPending, isError } = useQuery({
    queryKey: ['treatment-note', appointment.id],
    queryFn: () => fetchTreatmentNote(appointment.id),
    enabled: darfLesen,
    retry: false,
  });

  if (!darfLesen) return null;

  return (
    <section className="mt-8">
      <h2 className="text-ink-muted text-sm font-semibold tracking-wide uppercase">
        Behandlungsdokumentation
      </h2>

      {isPending ? <LoadingState label="Dokumentation wird geladen …" /> : null}

      {isError ? (
        <div className="mt-2">
          <ErrorState title="Die Behandlungsdokumentation konnte nicht geladen werden." />
        </div>
      ) : null}

      {!isPending && !isError && data === null ? (
        <div className="border-line mt-2 border-t pt-4">
          <p className="text-ink-muted text-[0.9375rem]">
            {abgesagt
              ? 'Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation.'
              : 'Für diesen Termin ist noch keine Behandlungsdokumentation hinterlegt.'}
          </p>
          {darfSchreiben && !abgesagt ? (
            <Link to={`/termine/${appointment.id}/dokumentation`} className={`${linkPrimaer} mt-3`}>
              Dokumentation anlegen
            </Link>
          ) : null}
        </div>
      ) : null}

      {data ? (
        <div className="border-line mt-2 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="border-line-strong bg-surface-sunken text-ink-muted rounded-full border px-2.5 py-0.5 text-xs font-medium">
              {treatmentNoteStatusLabels[data.status]}
            </span>
            <span className="text-ink-subtle text-xs">noch nicht finalisiert</span>
          </div>

          <p className="text-ink mt-3 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
            {data.content}
          </p>

          <p className="text-ink-subtle mt-3 text-xs leading-relaxed">
            {data.author_name ? `Verfasst von ${data.author_name}. ` : ''}
            {aenderungszeile(data, zone)}.
          </p>

          {darfSchreiben ? (
            <Link
              to={`/termine/${appointment.id}/dokumentation`}
              className={`${linkSekundaer} mt-4`}
            >
              Dokumentation bearbeiten
            </Link>
          ) : null}
        </div>
      ) : null}

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Zugriffe auf die Behandlungsdokumentation werden protokolliert.
      </p>
    </section>
  );
}
