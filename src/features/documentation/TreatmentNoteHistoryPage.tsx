import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canReadTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTime,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { fetchTreatmentNoteVersions, findeEintrag, type TreatmentNote } from './api';

/**
 * Änderungsverlauf einer Behandlungsdokumentation (DOK-002, ADR-016 Punkt 5).
 *
 * Der Verlauf ist eine eigene Seite und nicht Teil der Terminansicht. ADR-016
 * hält als offene Folgefrage fest, dass er den Alltagsblick auf die Akte nicht
 * überlagern soll - eine eigene Seite ist die einfachste Antwort darauf, und
 * sie macht den gesonderten Auditeintrag nachvollziehbar: wer hierher
 * navigiert, sieht mehr als den aktuellen Stand.
 *
 * Lesen darf ihn, wer den Eintrag selbst lesen darf (Punkt 8) - seit E15 auch
 * office (ROL-001). Für Patientenkonten gibt es die Seite nicht und den
 * Serveraufruf ebenso wenig.
 */
function Verlauf({ appointment, note }: { appointment: Appointment; note: TreatmentNote }) {
  const zone = appointment.organization_time_zone;

  const versionen = useQuery({
    queryKey: ['treatment-note-versions', note.id],
    queryFn: () => fetchTreatmentNoteVersions(note.id),
    retry: false,
  });

  return (
    <>
      <PageHeader
        title="Änderungsverlauf"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}`}
      />

      {versionen.isPending ? <LoadingState label="Verlauf wird geladen …" /> : null}

      {versionen.isError ? (
        <ErrorState title="Der Änderungsverlauf konnte nicht geladen werden." />
      ) : null}

      {versionen.data?.length === 0 ? (
        <p className="text-ink-muted max-w-prose text-[0.9375rem]">
          Dieser Eintrag ist noch ein Entwurf. Festgeschriebene Versionen entstehen erst mit der
          Finalisierung.
        </p>
      ) : null}

      {versionen.data && versionen.data.length > 0 ? (
        <ol className="max-w-2xl space-y-4">
          {versionen.data.map((version) => (
            <li
              key={version.version_no}
              className="border-line bg-surface rounded-card border p-4"
              aria-label={`Version ${version.version_no}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="border-line-strong bg-surface-sunken text-ink-muted rounded-pill border px-2.5 py-0.5 text-xs font-medium">
                  Version {version.version_no}
                </span>
                <span className="text-ink-subtle text-xs">
                  {formatLocalDate(version.recorded_at, zone)},{' '}
                  {formatLocalTime(version.recorded_at, zone)} Uhr
                  {version.author_name ? ` · ${version.author_name}` : ''}
                </span>
              </div>

              {version.change_reason ? (
                <p className="text-ink-muted mt-3 max-w-prose text-sm">
                  <span className="font-medium">Begründung: </span>
                  {version.change_reason}
                </p>
              ) : (
                <p className="text-ink-subtle mt-3 text-sm">
                  Bei der Finalisierung festgeschriebener Stand.
                </p>
              )}

              <p className="text-ink mt-3 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
                {version.content}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Frühere Versionen werden nicht überschrieben und nicht gelöscht. Das Lesen des Verlaufs wird
        gesondert protokolliert.
      </p>
    </>
  );
}

export function TreatmentNoteHistoryPage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canReadTreatmentNote(user.roles)}
      verweigert="Den Änderungsverlauf der Behandlungsdokumentation sieht die Verwaltung nicht."
    >
      {({ appointment, dokumentation }) => {
        const eintrag = findeEintrag(dokumentation, noteId);

        if (!eintrag) {
          return (
            <ErrorState
              title="Nicht gefunden"
              description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
            />
          );
        }

        return <Verlauf appointment={appointment} note={eintrag} />;
      }}
    </DocumentationShell>
  );
}
