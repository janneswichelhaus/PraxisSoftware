import { useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { Textlink } from '@/components/ui/Textlink';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { DocumentationShell } from './DocumentationShell';
import {
  DOKUMENTATIONSTEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from './Textverlustschutz';
import { NochEinEntwurf } from './Zustaende';
import {
  MAX_BEGRUENDUNG,
  begruendungFehler,
  findeEintrag,
  inhaltFehler,
  reviseTreatmentNote,
  type TreatmentNote,
} from './api';

/**
 * Die Sätze des Schutzes für die Korrektur (DOK-05).
 *
 * Wie in der Dokumentation, nur der zweite Absatz sagt, was hier gilt: Die
 * Korrektur kennt keinen Entwurf. Bis UXR-008 stand dort „Korrektur und
 * Nachtrag werden mit dem Absenden Bestandteil der Akte. Bitte zurückgehen
 * und den Eintrag abschließen.“ - der Nachtrag hat aber einen Entwurf, und
 * „zurückgehen“ klang nach genau dem Weggehen, das den Text verwirft.
 */
const KORREKTURTEXTE: Verlustschutztexte = {
  ...DOKUMENTATIONSTEXTE,
  ohneSpeichern:
    'Eine Korrektur lässt sich nicht zwischenspeichern: Sie wird erst mit „Korrektur festschreiben“ Teil der Akte. Zum Festschreiben hier bleiben; beim Weitergehen gehen Text und Begründung verloren.',
};

/**
 * Korrektur eines finalisierten Eintrags (DOK-002, ADR-016 Punkt 5 und 6).
 *
 * Bewusst eine eigene Seite und nicht derselbe Editor wie der Entwurf. Die
 * Korrektur ist die Ausnahme: sie erzeugt eine neue Version, hinterlässt eine
 * Begründung und ist nicht rückgängig zu machen. Wer nur etwas ergänzen will,
 * schreibt einen Nachtrag - darauf weist die Seite ausdrücklich hin.
 *
 * Der alte Text bleibt vollständig abrufbar (630f Abs. 1 S. 2 BGB); die Seite
 * schreibt ihn nicht fort, sondern übergibt den neuen Stand an den Server.
 */
function Formular({
  appointment,
  note,
  eingehend,
  zumTermin,
}: {
  appointment: Appointment;
  note: TreatmentNote;
  /** Der mitgereiste Rückweg - er reist mit zum Nachtrag (DOK-01). */
  eingehend: string;
  /** Ziel für „Abbrechen“ und nach dem Festschreiben: der Termin samt Rückweg. */
  zumTermin: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const folgeId = useId();

  const [inhalt, setInhalt] = useState(note.content);
  const [begruendung, setBegruendung] = useState('');
  const [inhaltsfehler, setInhaltsfehler] = useState<string | undefined>(undefined);
  const [grundfehler, setGrundfehler] = useState<string | undefined>(undefined);

  const geaendert = inhalt !== note.content;
  // Auch eine allein getippte Begründung ist Arbeit, die verloren ginge.
  const ungespeichert = geaendert || begruendung.trim() !== '';

  /**
   * Die Korrektur kennt keinen Entwurf - deshalb bekommt der Schutz hier
   * keinen Speicherweg.
   *
   * Sie wird mit dem Absenden eine neue, festgeschriebene Version der Akte
   * (ADR-016). Ein „Speichern" aus einer Navigation heraus wäre also nicht das
   * Sichern eines Zwischenstands, sondern genau die Finalisierung, die hier
   * nicht nebenbei passieren darf. Die Rückfrage bietet deshalb Verwerfen und
   * Bleiben an und sagt, warum.
   */
  const { freigeben, laeuft, schreiben, schutz } = useTextverlustschutz({
    ungespeichert,
    texte: KORREKTURTEXTE,
  });

  /**
   * Die Korrektur schreiben - festgeschrieben, nicht als Entwurf.
   *
   * Das Feld bleibt währenddessen unveränderlich (`laeuft`): Was hier
   * durchgeht, wird eine neue Version der Akte, und die muss genau das
   * enthalten, was auf dem Bildschirm stand (FIX-014, ADR-016).
   */
  async function korrekturSchreiben(): Promise<boolean> {
    await reviseTreatmentNote(note.id, note.updated_at, inhalt, begruendung);
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    await queryClient.invalidateQueries({ queryKey: ['treatment-note-versions', note.id] });
    return true;
  }

  function absenden(event: React.FormEvent) {
    event.preventDefault();

    const inhaltMeldung = inhaltFehler(inhalt);
    const grundMeldung = begruendungFehler(begruendung);
    setInhaltsfehler(inhaltMeldung);
    setGrundfehler(grundMeldung);
    if (inhaltMeldung || grundMeldung) return;

    // Die neue Version folgt auf die bisher jüngste.
    const version = note.version_count + 1;
    void schreiben({
      ausfuehren: korrekturSchreiben,
      fehlertitel: 'Nicht festgeschrieben',
      danach: () => {
        freigeben();
        // Der Termin erfährt, was geschehen ist (DOK-15).
        void navigate(zumTermin, {
          state: { meldung: `Korrektur als Version ${version} festgeschrieben.` },
        });
      },
    });
  }

  return (
    <>
      <PageHeader
        title="Dokumentation korrigieren"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      {/* Ein Hinweis, kein Bedienelement: vertieft, mit der Trennlinie statt
          des Rahmens für Bedienbares (DOK-19) - so bleibt er von der
          Rückfrage des Schutzes unterscheidbar. */}
      <div className="border-line bg-surface-sunken rounded-card mb-6 max-w-2xl border p-4">
        <p className="text-ink text-sm leading-relaxed">
          Der bisherige Wortlaut bleibt als eigene Version erhalten und abrufbar. Eine Korrektur ist
          für echte Fehler gedacht – wer nachträglich etwas ergänzen möchte, legt stattdessen einen{' '}
          <Textlink
            to={mitRueckweg(
              `/termine/${appointment.id}/dokumentation/${note.id}/nachtrag`,
              eingehend,
            )}
          >
            Nachtrag
          </Textlink>{' '}
          an.
        </p>
      </div>

      <form onSubmit={absenden} noValidate className="max-w-2xl">
        <TextArea
          label="Korrigierter Eintrag"
          rows={14}
          value={inhalt}
          error={inhaltsfehler}
          readOnly={laeuft}
          onChange={(event) => {
            setInhalt(event.target.value);
            if (inhaltsfehler) setInhaltsfehler(undefined);
          }}
        />

        <div className="mt-5">
          <TextArea
            label="Begründung der Korrektur"
            hint={`Kurz und sachlich, für die Nachvollziehbarkeit der Akte. Höchstens ${MAX_BEGRUENDUNG.toLocaleString('de-DE')} Zeichen.`}
            rows={3}
            value={begruendung}
            error={grundfehler}
            readOnly={laeuft}
            onChange={(event) => {
              setBegruendung(event.target.value);
              if (grundfehler) setGrundfehler(undefined);
            }}
          />
        </div>

        {/* Fehler, Hinweise und Rückfrage stehen seit FIX-014 an einer
            Stelle. */}
        {schutz}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {/* „Festschreiben“, nicht „Speichern“: Speichern heißt in der
              Dokumentation Entwurf (ANN-046), eine Korrektur ist sofort eine
              neue Version der Akte (DOK-08). Die Folge steht unten und ist mit
              dem Knopf verbunden (DOK-20). */}
          <Button type="submit" disabled={laeuft || !geaendert} aria-describedby={folgeId}>
            {laeuft ? 'Wird festgeschrieben …' : 'Korrektur festschreiben'}
          </Button>
          <ButtonLink to={zumTermin} variant="quiet">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <p id={folgeId} className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Jede Korrektur wird als neue Version festgeschrieben und protokolliert. Frühere Versionen
        werden nicht überschrieben.
      </p>
    </>
  );
}

export function TreatmentNoteRevisionPage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation ändern dürfen Therapeut:innen und Teamleitung."
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

        // Ein erwartbarer Zustand mit dem nächsten Schritt, kein Alarm (DOK-12).
        if (eintrag.status !== 'final') {
          return (
            <NochEinEntwurf
              appointmentId={appointment.id}
              eintrag={eintrag}
              eingehend={eingehend}
              beschreibung="Ein Entwurf wird schlicht bearbeitet. Eine Korrektur mit Begründung gibt es erst nach der Finalisierung."
            />
          );
        }

        return (
          <Formular
            appointment={appointment}
            note={eintrag}
            eingehend={eingehend}
            zumTermin={zumTermin}
          />
        );
      }}
    </DocumentationShell>
  );
}
