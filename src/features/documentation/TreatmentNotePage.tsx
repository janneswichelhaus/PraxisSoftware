import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { Textverlustschutz } from './Textverlustschutz';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { bausteinEinfuegen } from './textbausteine';
import {
  createTreatmentNote,
  findeEintrag,
  inhaltFehler,
  updateTreatmentNote,
  type TreatmentNote,
} from './api';

/**
 * Entwurf der Behandlungsdokumentation schreiben (DOK-001).
 *
 * Eine Seite für beide Fälle - anlegen und ändern -, weil es fachlich derselbe
 * Vorgang ist: der Entwurf zu diesem Termin. Welche Serverfunktion greift,
 * entscheidet allein, ob es bereits einen gibt.
 *
 * Ein finalisierter Eintrag nimmt diesen Weg nicht mehr (DOK-002): dort ist
 * jede Änderung eine Korrektur mit Begründung, und der Server weist den
 * Entwurfsweg ab.
 *
 * Der Text wird ausschließlich auf dem Server gehalten. Es gibt bewusst kein
 * automatisches Zwischenspeichern im Browser: ein Entwurf, der nur lokal läge,
 * wäre nicht gespeichert, würde aber so aussehen (ADR-001, ADR-015).
 */
function Editor({ appointment, note }: { appointment: Appointment; note: TreatmentNote | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;

  const istNachtrag = note?.addendum_to_note_id != null;

  const gespeichert = note?.content ?? '';
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [abbruchfrage, setAbbruchfrage] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  const wert = entwurf ?? gespeichert;
  const geaendert = wert !== gespeichert;
  const zurueck = `/termine/${appointment.id}`;

  const speichern = useMutation({
    mutationFn: async () => {
      if (note) {
        // Der gelesene Stand geht unverändert zurück; der Server weist eine
        // Änderung auf veraltetem Stand ab (ADR-001).
        await updateTreatmentNote(note.id, note.updated_at, wert);
        return;
      }
      await createTreatmentNote(appointment.id, wert);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
      void navigate(zurueck);
    },
  });

  function absenden(event: React.FormEvent) {
    event.preventDefault();
    if (speichern.isPending) return;

    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    if (meldung) return;

    speichern.mutate();
  }

  return (
    <>
      <PageHeader
        title={istNachtrag ? 'Nachtrag bearbeiten' : 'Behandlungsdokumentation'}
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
      />

      <form onSubmit={absenden} noValidate className="max-w-2xl">
        <TextbausteinLeiste onEinfuegen={(text) => setEntwurf(bausteinEinfuegen(wert, text))} />

        <TextArea
          label={istNachtrag ? 'Nachtrag' : 'Eintrag zur Behandlung'}
          hint="Freitext. Der Eintrag bleibt ein Entwurf; die Finalisierung ist ein eigener Schritt am Termin."
          rows={14}
          value={wert}
          error={fehler}
          onChange={(event) => {
            setEntwurf(event.target.value);
            if (fehler) setFehler(undefined);
          }}
        />

        {speichern.isError ? (
          <div className="mt-4">
            <ErrorState title="Nicht gespeichert" description={speichern.error.message} />
          </div>
        ) : null}

        <Textverlustschutz ungespeichert={geaendert} />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={speichern.isPending || !geaendert}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Als Entwurf speichern'}
          </Button>

          {geaendert ? (
            <Button type="button" variant="quiet" onClick={() => setAbbruchfrage(true)}>
              Abbrechen
            </Button>
          ) : (
            <Link
              to={zurueck}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Abbrechen
            </Link>
          )}
        </div>

        {/* Ein versehentlicher Klick darf einen ungespeicherten Text nicht
            verwerfen (PROJECT_PRINCIPLES.md 13). */}
        {abbruchfrage ? (
          <div
            role="group"
            aria-label="Bearbeitung abbrechen"
            className="border-line-strong bg-surface-sunken mt-4 rounded-lg border p-4"
          >
            <p className="text-ink text-sm">
              Der eingegebene Text ist noch nicht gespeichert und geht beim Abbrechen verloren.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={() => void navigate(zurueck)}>
                Ja, Bearbeitung verwerfen
              </Button>
              <Button type="button" variant="quiet" onClick={() => setAbbruchfrage(false)}>
                Weiter bearbeiten
              </Button>
            </div>
          </div>
        ) : null}
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Entwurf wird auf dem Server gespeichert, nicht auf diesem Gerät. Anlegen, Ändern und
        Lesen werden protokolliert.
      </p>
    </>
  );
}

/**
 * Entwurf schreiben oder bearbeiten.
 *
 * Ohne `noteId` in der Route geht es um den Haupteintrag des Termins - der
 * Regelfall, der auch das Anlegen abdeckt. Mit `noteId` um genau diesen
 * Entwurf; so bleibt auch ein Nachtrag vor seiner Finalisierung änderbar
 * (DOK-002). Der Server unterscheidet die beiden Fälle nicht: `update_treatment_note`
 * ändert jeden Entwurf der eigenen Organisation.
 */
export function TreatmentNotePage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId?: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation schreiben dürfen ausschließlich therapeutische Rollen."
    >
      {({ appointment, dokumentation }) => {
        const eintrag = noteId ? findeEintrag(dokumentation, noteId) : dokumentation.primary;

        if (noteId && !eintrag) {
          return (
            <ErrorState
              title="Nicht gefunden"
              description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
            />
          );
        }

        // Zu einem abgesagten Termin hat keine Behandlung stattgefunden. Gibt es
        // schon eine Dokumentation, bleibt sie bearbeitbar - sie wurde vor der
        // Absage angelegt und darf nicht unerreichbar werden.
        if (appointment.status === 'cancelled' && !eintrag) {
          return (
            <ErrorState
              title="Termin abgesagt"
              description="Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation."
            />
          );
        }

        if (eintrag?.status === 'final') {
          return (
            <ErrorState
              title="Bereits finalisiert"
              description="Dieser Eintrag ist Bestandteil der Akte. Eine Änderung ist nur als Korrektur mit Begründung möglich, eine Ergänzung als Nachtrag."
            />
          );
        }

        return <Editor appointment={appointment} note={eintrag} />;
      }}
    </DocumentationShell>
  );
}
