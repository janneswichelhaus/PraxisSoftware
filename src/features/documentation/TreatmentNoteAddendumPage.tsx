import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { TextArea } from '@/components/ui/TextArea';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { DocumentationShell } from './DocumentationShell';
import { FREITEXT } from './format';
import { useTextverlustschutz } from './Textverlustschutz';
import { NochEinEntwurf } from './Zustaende';
import { createTreatmentNoteAddendum, findeEintrag, inhaltFehler, type TreatmentNote } from './api';

/**
 * Nachtrag zu einem finalisierten Eintrag (DOK-002, ADR-016 Punkt 6).
 *
 * Die Ergänzung ist der Regelfall: sie entsteht als eigener, mit dem
 * Ursprungseintrag verknüpfter Eintrag und lässt den alten Text unangetastet.
 * Sie beginnt als Entwurf und wird wie jeder Eintrag gesondert finalisiert -
 * andernfalls entstünde klinischer Text, der nie Bestandteil der Akte wird.
 */
function Formular({
  appointment,
  parent,
  zumTermin,
}: {
  appointment: Appointment;
  parent: TreatmentNote;
  /** Ziel für „Abbrechen“ und nach dem Speichern: der Termin samt Rückweg (DOK-01). */
  zumTermin: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;

  const [inhalt, setInhalt] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);

  // Der Text, wie er in diesem Augenblick im Feld steht (FIX-014).
  const inhaltRef = useRef(inhalt);
  inhaltRef.current = inhalt;

  /**
   * Den Nachtrag als Entwurf anlegen - ohne Seitenwechsel.
   *
   * Der Nachtrag entsteht ausdrücklich als Entwurf (ADR-016 Punkt 6); seine
   * Finalisierung ist ein eigener Schritt am Termin. Der Navigationsschutz
   * darf ihn deshalb sichern, ohne etwas festzuschreiben.
   */
  async function entwurfSichern(): Promise<boolean> {
    const zuSichern = inhaltRef.current;
    const meldung = inhaltFehler(zuSichern);
    if (meldung) {
      setFehler(meldung);
      throw new Error(meldung);
    }
    await createTreatmentNoteAddendum(parent.id, zuSichern);
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    // Wer während des Schreibens weitertippt, hat danach wieder
    // ungespeicherten Text (FIX-014).
    return inhaltRef.current === zuSichern;
  }

  const { freigeben, laeuft, schreiben, schutz } = useTextverlustschutz({
    ungespeichert: inhalt.trim().length > 0,
    speichern: entwurfSichern,
  });

  function absenden(event: React.FormEvent) {
    event.preventDefault();

    const meldung = inhaltFehler(inhalt);
    setFehler(meldung);
    if (meldung) return;

    void schreiben({
      ausfuehren: entwurfSichern,
      fehlertitel: 'Nicht gespeichert',
      danach: () => {
        freigeben();
        // Der Termin erfährt, was geschehen ist (DOK-15).
        void navigate(zumTermin, { state: { meldung: 'Nachtrag als Entwurf gespeichert.' } });
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Nachtrag zur Behandlungsdokumentation"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      {/* Der Ursprungseintrag ist Akteninhalt, keine Nebensache: auf Papier
          mit Trennlinie wie jede Auskunft (UI-002c, DOK-19), nicht vertieft
          wie ein Hinweis. Die Beschriftung im Label-Stil (TOK-05). */}
      <div className="border-line bg-surface rounded-card mb-6 max-w-2xl border p-4">
        <p className="text-ink-muted tracking-label text-xs font-semibold uppercase">
          Ursprünglicher Eintrag
        </p>
        <p className={`text-ink text-liste mt-2 max-w-prose leading-relaxed ${FREITEXT}`}>
          {parent.content}
        </p>
      </div>

      <form onSubmit={absenden} noValidate className="max-w-2xl">
        <TextArea
          label="Nachtrag"
          // Auch der Nachtrag wird mit der Frist der Praxis von selbst Version 1
          // (ADR-016 Punkt 7, DOK-02).
          hint="Der Nachtrag ergänzt den Eintrag oben und ändert ihn nicht. Er bleibt ein Entwurf, bis jemand ihn finalisiert – spätestens automatisch mit Ablauf der Dokumentationsfrist der Praxis."
          rows={12}
          value={inhalt}
          error={fehler}
          onChange={(event) => {
            setInhalt(event.target.value);
            if (fehler) setFehler(undefined);
          }}
        />

        {/* Fehler, Hinweise und Rückfrage stehen seit FIX-014 an einer
            Stelle: Alle Schreibwege dieser Seite laufen durch denselben
            Vorgang. */}

        {schutz}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={laeuft || inhalt.trim().length === 0}>
            {laeuft ? 'Wird gespeichert …' : 'Nachtrag als Entwurf speichern'}
          </Button>
          <ButtonLink to={zumTermin} variant="quiet">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
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
      verweigert="Behandlungsdokumentation schreiben dürfen Therapeut:innen und Teamleitung."
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const eintrag = findeEintrag(dokumentation, noteId);

        if (!eintrag) {
          return (
            <ErrorState
              title="Nicht gefunden"
              description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
            />
          );
        }

        // Erwartbare Zustände mit dem nächsten Schritt, kein Alarm (DOK-12).
        if (eintrag.addendum_to_note_id !== null) {
          return (
            <EmptyState
              title="Kein Nachtrag zum Nachtrag"
              description="Ein Nachtrag ergänzt immer den ursprünglichen Eintrag. Bitte diesen ergänzen."
              aktion={
                <ButtonLink
                  to={mitRueckweg(
                    `/termine/${appointment.id}/dokumentation/${eintrag.addendum_to_note_id}/nachtrag`,
                    eingehend,
                  )}
                  variant="secondary"
                >
                  Zum ursprünglichen Eintrag
                </ButtonLink>
              }
            />
          );
        }

        if (eintrag.status !== 'final') {
          return (
            <NochEinEntwurf
              appointmentId={appointment.id}
              eintrag={eintrag}
              eingehend={eingehend}
              beschreibung="Solange der Eintrag ein Entwurf ist, wird er schlicht bearbeitet. Einen Nachtrag gibt es erst nach der Finalisierung."
            />
          );
        }

        return <Formular appointment={appointment} parent={eintrag} zumTermin={zumTermin} />;
      }}
    </DocumentationShell>
  );
}
