import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/Feedback';
import { canReadTreatmentNote, type CurrentUser } from '@/features/session/types';
import { type Appointment } from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { Schreibflaeche, ZustandMitRueckweg } from './Schreibflaeche';
import { FREITEXT, kopfzeileFuer } from './format';
import { fetchTreatmentNoteVersions, findeEintrag, type TreatmentNote } from './api';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { formatLocalDate, formatLocalTime } from '@/lib/datum';
import { patientName } from '@/lib/termin';

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
function Verlauf({
  appointment,
  note,
  zurueck,
}: {
  appointment: Appointment;
  note: TreatmentNote;
  /** Ziel des Pfeils oben: woher die Seite kam, sonst der Termin (DOK-01). */
  zurueck: string;
}) {
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
    <Schreibflaeche
      zurueck={zurueck}
      titel={patientName(appointment)}
      kopfzeile={kopfzeileFuer(
        `Änderungsverlauf · ${note.addendum_to_note_id === null ? 'Eintrag' : 'Nachtrag'}`,
        appointment,
      )}
    >
      <div className="flex-1 px-4 py-3">
        <Abfragezustand
          abfrage={versionen}
          laden="Verlauf wird geladen …"
          fehler="Der Änderungsverlauf konnte nicht geladen werden."
          leer={{
            wenn: (daten) => daten.length === 0,
            titel: 'Noch ein Entwurf',
            beschreibung: 'Festgeschriebene Versionen entstehen erst mit der Finalisierung.',
          }}
        >
          {(daten) => (
            // Die Versionen untereinander, getrennt durch Linien - ohne Karte je
            // Version (DESIGN.md Regel 3). Die jüngste ist die geltende Fassung.
            <ol>
              {daten.map((version) => (
                <li
                  key={version.version_no}
                  className="border-line border-b py-4 first:pt-1 last:border-b-0"
                  aria-label={`Version ${version.version_no}`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-ink text-liste font-bold">
                      Version {version.version_no}
                    </span>
                    {version.version_no === juengste ? (
                      <Badge ton="akzent">Geltende Fassung</Badge>
                    ) : null}
                    <span className="text-ink-muted text-sm">
                      {formatLocalDate(version.recorded_at, zone)},{' '}
                      {formatLocalTime(version.recorded_at, zone)} Uhr
                      {version.author_name ? ` · ${version.author_name}` : ''}
                    </span>
                  </div>

                  {version.change_reason ? (
                    <p className="text-ink-muted mt-2 max-w-prose text-sm">
                      <span className="font-medium">Begründung: </span>
                      {version.change_reason}
                    </p>
                  ) : (
                    <p className="text-ink-muted mt-2 text-sm">
                      Bei der Finalisierung festgeschriebener Stand.
                    </p>
                  )}

                  <p className={`text-ink text-liste mt-2 max-w-prose leading-relaxed ${FREITEXT}`}>
                    {version.content}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Abfragezustand>
      </div>

      <Kleingedrucktes className="shrink-0 px-4 pb-4">
        Frühere Versionen werden nicht überschrieben und nicht gelöscht. Das Lesen des Verlaufs wird
        gesondert protokolliert.
      </Kleingedrucktes>
    </Schreibflaeche>
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
      eigenerKopf
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const eintrag = findeEintrag(dokumentation, noteId);

        if (!eintrag) {
          return (
            <ZustandMitRueckweg
              appointmentId={appointment.id}
              titel={patientName(appointment)}
              beschreibung={kopfzeileFuer('Änderungsverlauf', appointment)}
            >
              <ErrorState
                title="Nicht gefunden"
                description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
              />
            </ZustandMitRueckweg>
          );
        }

        return (
          <Verlauf appointment={appointment} note={eintrag} zurueck={eingehend || zumTermin} />
        );
      }}
    </DocumentationShell>
  );
}
