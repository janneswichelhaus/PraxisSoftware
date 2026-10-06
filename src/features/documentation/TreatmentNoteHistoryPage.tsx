import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { canReadTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { FREITEXT } from './format';
import { fetchTreatmentNoteVersions, findeEintrag, type TreatmentNote } from './api';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

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
 *
 * Der Kopf ist so knapp wie auf den übrigen Doku-Seiten und nennt Name, Datum
 * und Uhrzeit (BEF-001) und ob es um den Eintrag oder einen Nachtrag geht
 * (DOK-18). Die jüngste Version ist die geltende Fassung und trägt das dazu -
 * vorher musste man sie an der höchsten Nummer erkennen.
 */
function Verlauf({ appointment, note }: { appointment: Appointment; note: TreatmentNote }) {
  const zone = appointment.organization_time_zone;

  const versionen = useQuery({
    queryKey: ['treatment-note-versions', note.id],
    queryFn: () => fetchTreatmentNoteVersions(note.id),
    retry: false,
  });

  const juengste = versionen.data?.reduce(
    (hoechste, version) => Math.max(hoechste, version.version_no),
    0,
  );

  return (
    <>
      <PageHeader
        title={`Änderungsverlauf · ${note.addendum_to_note_id === null ? 'Eintrag' : 'Nachtrag'}`}
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      {versionen.isPending ? <LoadingState label="Verlauf wird geladen …" /> : null}

      {versionen.isError ? (
        <ErrorState
          title="Der Änderungsverlauf konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => versionen.refetch()}
        />
      ) : null}

      {versionen.data?.length === 0 ? (
        <p className="text-ink-muted text-liste max-w-prose">
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
                <Badge>Version {version.version_no}</Badge>
                {version.version_no === juengste ? (
                  <Badge ton="akzent">Geltende Fassung</Badge>
                ) : null}
                <span className="text-ink-muted text-xs">
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
                <p className="text-ink-muted mt-3 text-sm">
                  Bei der Finalisierung festgeschriebener Stand.
                </p>
              )}

              <p className={`text-ink text-liste mt-3 max-w-prose leading-relaxed ${FREITEXT}`}>
                {version.content}
              </p>
            </li>
          ))}
        </ol>
      ) : null}

      <Kleingedrucktes className="mt-10">
        Frühere Versionen werden nicht überschrieben und nicht gelöscht. Das Lesen des Verlaufs wird
        gesondert protokolliert.
      </Kleingedrucktes>
    </>
  );
}

export function TreatmentNoteHistoryPage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canReadTreatmentNote(user.roles)}
      // Seit E15 liest auch das Praxismanagement den Verlauf; gesperrt ist er
      // nur für Konten außerhalb der Praxisrollen (WRT-12).
      verweigert="Den Änderungsverlauf sehen nur die Praxisrollen."
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
