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
import { createTreatmentNoteAddendum, findeEintrag, inhaltFehler, type TreatmentNote } from './api';

/**
 * Nachtrag zu einem finalisierten Eintrag (DOK-002, ADR-016 Punkt 6).
 *
 * Die Ergänzung ist der Regelfall: sie entsteht als eigener, mit dem
 * Ursprungseintrag verknüpfter Eintrag und lässt den alten Text unangetastet.
 * Sie beginnt als Entwurf und wird wie jeder Eintrag gesondert finalisiert -
 * andernfalls entstünde klinischer Text, der nie Bestandteil der Akte wird.
 */
function Formular({ appointment, parent }: { appointment: Appointment; parent: TreatmentNote }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;

  const [inhalt, setInhalt] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const zurueck = `/termine/${appointment.id}`;

  const speichern = useMutation({
    mutationFn: () => createTreatmentNoteAddendum(parent.id, inhalt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
      void navigate(zurueck);
    },
  });

  function absenden(event: React.FormEvent) {
    event.preventDefault();
    if (speichern.isPending) return;

    const meldung = inhaltFehler(inhalt);
    setFehler(meldung);
    if (meldung) return;

    speichern.mutate();
  }

  return (
    <>
      <PageHeader
        title="Nachtrag zur Behandlungsdokumentation"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      <div className="border-line-strong bg-surface-sunken rounded-card mb-6 max-w-2xl border p-4">
        <p className="text-ink-muted text-xs font-semibold tracking-wide uppercase">
          Ursprünglicher Eintrag
        </p>
        <p className="text-ink mt-2 max-w-prose text-[0.9375rem] leading-relaxed whitespace-pre-wrap">
          {parent.content}
        </p>
      </div>

      <form onSubmit={absenden} noValidate className="max-w-2xl">
        <TextArea
          label="Nachtrag"
          hint="Der Nachtrag ergänzt den Eintrag oben und ändert ihn nicht. Er wird zunächst als Entwurf gespeichert."
          rows={12}
          value={inhalt}
          error={fehler}
          onChange={(event) => {
            setInhalt(event.target.value);
            if (fehler) setFehler(undefined);
          }}
        />

        {speichern.isError ? (
          <div className="mt-4">
            <ErrorState title="Nicht gespeichert" description={speichern.error.message} />
          </div>
        ) : null}

        <Textverlustschutz ungespeichert={inhalt.trim().length > 0} />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={speichern.isPending || inhalt.trim().length === 0}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Nachtrag als Entwurf speichern'}
          </Button>
          <Link
            to={zurueck}
            className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-button inline-flex min-h-11 items-center justify-center px-4 text-[0.9375rem] font-medium transition-colors"
          >
            Abbrechen
          </Link>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Nachtrag wird auf dem Server gespeichert, nicht auf diesem Gerät. Anlegen, Ändern und
        Lesen werden protokolliert.
      </p>
    </>
  );
}

export function TreatmentNoteAddendumPage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation schreiben dürfen ausschließlich therapeutische Rollen."
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

        if (eintrag.addendum_to_note_id !== null) {
          return (
            <ErrorState
              title="Kein Nachtrag zum Nachtrag"
              description="Ein Nachtrag ergänzt immer den ursprünglichen Eintrag. Bitte diesen ergänzen."
            />
          );
        }

        if (eintrag.status !== 'final') {
          return (
            <ErrorState
              title="Noch ein Entwurf"
              description="Solange der Eintrag ein Entwurf ist, wird er schlicht bearbeitet. Einen Nachtrag gibt es erst nach der Finalisierung."
            />
          );
        }

        return <Formular appointment={appointment} parent={eintrag} />;
      }}
    </DocumentationShell>
  );
}
