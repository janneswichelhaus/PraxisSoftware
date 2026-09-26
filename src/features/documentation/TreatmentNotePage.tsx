import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { BausteinFeld } from '@/features/assessments/BausteinFeld';
import { useBausteinAuswahl } from '@/features/assessments/bausteinauswahl';
import { VORSCHLAG_OFFEN } from '@/features/assessments/dokumentationstext';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { useTextverlustschutz } from './Textverlustschutz';
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
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const [vorschlagOffen, setVorschlagOffen] = useState(false);

  const wert = entwurf ?? gespeichert;
  const bausteine = useBausteinAuswahl();
  // Ein Vorschlag aus den Bausteinen, der noch nicht im Feld steht, ist
  // ungespeicherte Arbeit wie getippter Text (§13, FRB-003b).
  const geaendert = wert !== gespeichert || bausteine.text !== '';
  const zurueck = `/termine/${appointment.id}`;

  // Der Text, wie er in diesem Augenblick im Feld steht. Ein Schreibvorgang
  // dauert; wer währenddessen weitertippt, hat danach wieder ungespeicherten
  // Text. Ohne diese Referenz läse der Vorgang den Stand von vorhin, und die
  // Seite ginge mit einem Ergebnis weiter, das den neuen Text nicht enthält
  // (FIX-014).
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const vorschlagRef = useRef(bausteine.text);
  vorschlagRef.current = bausteine.text;

  /**
   * Den Entwurf sichern - ohne Seitenwechsel.
   *
   * Beide Wege gehen hier durch: die Schaltfläche und die Rückfrage des
   * Navigationsschutzes. Der Unterschied liegt allein danach, und genau
   * deshalb steht das Speichern für sich: Eine Finalisierung löst es in keinem
   * der beiden Fälle aus (ADR-016).
   *
   * Der Rückgabewert sagt, ob **alles Getippte** auf dem Server liegt.
   */
  async function entwurfSichern(): Promise<boolean> {
    // Ein noch nicht übernommener Vorschlag geht mit — erreichbar nur über die
    // Rückfrage des Navigationsschutzes, die verspricht, dass nichts verloren
    // geht. Die Schaltfläche hält vorher an (FRB-003b, ANN-120).
    const vorschlag = vorschlagRef.current;
    const zuSichern = vorschlag ? bausteinEinfuegen(wertRef.current, vorschlag) : wertRef.current;
    const meldung = inhaltFehler(zuSichern);
    if (meldung) {
      setFehler(meldung);
      throw new Error(meldung);
    }

    if (note) {
      // Der gelesene Stand geht unverändert zurück; der Server weist eine
      // Änderung auf veraltetem Stand ab (ADR-001).
      await updateTreatmentNote(note.id, note.updated_at, zuSichern);
    } else {
      await createTreatmentNote(appointment.id, zuSichern);
    }

    if (vorschlag && vorschlagRef.current === vorschlag) {
      // Was während des Speicherns getippt wurde, bleibt stehen; der
      // Vorschlag steht danach im Feld wie übernommen.
      const imFeld = bausteinEinfuegen(wertRef.current, vorschlag);
      setEntwurf(imFeld);
      bausteine.leeren();
      wertRef.current = imFeld;
      vorschlagRef.current = '';
    }
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    return wertRef.current === zuSichern && vorschlagRef.current === '';
  }

  const { freigeben, laeuft, schreiben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    speichern: entwurfSichern,
  });

  // Die Meldung gilt dem Vorschlag, der sie ausgelöst hat; ist er übernommen
  // oder verworfen, verschwindet sie, statt beim nächsten wieder zu stehen.
  useEffect(() => {
    if (!bausteine.text) setVorschlagOffen(false);
  }, [bausteine.text]);

  function absenden(event: React.FormEvent) {
    event.preventDefault();

    // Gespeichert wird, was im Feld steht und gelesen wurde: Ein Vorschlag aus
    // den Bausteinen wird erst übernommen oder verworfen (ANN-120). Sonst
    // könnte ungesehener Text über die automatische Finalisierung (ADR-016
    // Punkt 7) Bestandteil der Akte werden.
    if (bausteine.text) {
      setVorschlagOffen(true);
      return;
    }

    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    if (meldung) return;

    void schreiben({
      ausfuehren: entwurfSichern,
      fehlertitel: 'Nicht gespeichert',
      danach: () => {
        // Der eigene Rückweg ist gewollt und braucht keine Rückfrage.
        freigeben();
        void navigate(zurueck);
      },
    });
  }

  return (
    <>
      <PageHeader
        title={istNachtrag ? 'Nachtrag bearbeiten' : 'Behandlungsdokumentation'}
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
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

        {istNachtrag ? null : (
          <BausteinFeld
            bausteine={bausteine}
            onUebernehmen={(text) => setEntwurf(bausteinEinfuegen(wert, text))}
            gesperrt={laeuft}
            meldung={vorschlagOffen && bausteine.text ? VORSCHLAG_OFFEN : undefined}
          />
        )}

        {/* Fehler, Hinweise und Rückfrage stehen seit FIX-014 an einer Stelle:
            Alle Schreibwege dieser Seite laufen durch denselben Vorgang. */}
        {schutz}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={laeuft || !geaendert}>
            {laeuft ? 'Wird gespeichert …' : 'Als Entwurf speichern'}
          </Button>

          {/* „Abbrechen" ist seit FIX-011 ein gewöhnlicher Weg zurück: Die
              Rückfrage vor dem Verwerfen stellt der Navigationsschutz, und
              zwar für diesen Weg wie für jeden anderen aus dieser Seite
              heraus. Eine zweite eigene Rückfrage an dieser Stelle hätte
              zweimal dasselbe gefragt. */}
          <Link
            to={zurueck}
            className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-button inline-flex min-h-11 items-center justify-center px-4 text-[0.9375rem] font-medium transition-colors"
          >
            Abbrechen
          </Link>
        </div>
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
