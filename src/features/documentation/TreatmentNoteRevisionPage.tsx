import { useEffect, useId, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
import { Textlink } from '@/components/ui/Textlink';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import { type Appointment } from '@/features/appointments/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { DocumentationShell } from './DocumentationShell';
import {
  DOKUMENTATIONSTEXTE,
  useTextverlustschutz,
  type Verlustschutztexte,
} from '@/app/Textverlustschutz';
import { Schreibfeld, Schreibflaeche, ZustandMitRueckweg } from './Schreibflaeche';
import { kopfzeileFuer } from './format';
import { NochEinEntwurf } from './Zustaende';
import { uebergabeErledigt, uebergebenerText } from './uebernahme';
import {
  MAX_BEGRUENDUNG,
  begruendungFehler,
  findeEintrag,
  inhaltFehler,
  reviseTreatmentNote,
  type TreatmentNote,
} from './api';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { patientName } from '@/lib/termin';

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
  const feldId = useId();
  const folgeId = useId();

  // Aus dem Konfliktfall übernommener Text (BEF-056): Er steht im Feld statt
  // des bisherigen Wortlauts und ist ungespeichert, bis die Korrektur
  // festgeschrieben ist.
  const [uebernommen] = useState(() => uebergebenerText(note.id));
  const [inhalt, setInhalt] = useState(uebernommen ?? note.content);
  useEffect(() => uebergabeErledigt(note.id), [note.id]);
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
    try {
      await reviseTreatmentNote(note.id, note.updated_at, inhalt, begruendung);
    } catch (error) {
      // Den Stand nachladen statt zum Neuladen aufzufordern (BEF-056): Das
      // nächste Festschreiben beruht dann auf der jüngsten Version.
      await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
      throw error;
    }
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
    <Schreibflaeche
      zurueck={eingehend || zumTermin}
      titel={patientName(appointment)}
      kopfzeile={kopfzeileFuer('Korrektur', appointment)}
    >
      {/* Ein Hinweis, kein Bedienelement (DOK-19): eine leise Zeile unter dem
          Kopf. Wer nur ergänzen will, findet hier den Nachtrag (ADR-016
          Punkt 6); der alte Wortlaut bleibt abrufbar (Punkt 5). */}
      <p className="border-line text-ink-muted shrink-0 border-b px-4 py-2 text-sm">
        Für echte Fehler. Ergänzen geht als{' '}
        <Textlink
          to={mitRueckweg(
            `/termine/${appointment.id}/dokumentation/${note.id}/nachtrag`,
            eingehend,
          )}
        >
          Nachtrag
        </Textlink>
        . Der bisherige Wortlaut bleibt als eigene Version erhalten und abrufbar.
      </p>

      {uebernommen !== undefined ? (
        <Statusmeldung className="shrink-0 px-4 py-2">
          Ihr Text aus dem Entwurf steht im Feld. Mit Begründung festschreiben – oder abbrechen,
          dann geht er verloren.
        </Statusmeldung>
      ) : null}

      <form onSubmit={absenden} noValidate className="flex min-w-0 flex-1 flex-col">
        <Schreibfeld
          feldId={feldId}
          label="Korrigierter Eintrag"
          wert={inhalt}
          fehler={inhaltsfehler}
          readOnly={laeuft}
          onAendern={(wert) => {
            setInhalt(wert);
            if (inhaltsfehler) setInhaltsfehler(undefined);
          }}
        />

        {/* Die Begründung gehört zur Korrektur und steht deshalb in der
            Fläche, unter einer Linie - ohne eigenen Kasten. */}
        <div className="border-line shrink-0 border-t px-4 pt-3 pb-2">
          <TextArea
            label="Begründung der Korrektur"
            hint={`Kurz und sachlich, höchstens ${MAX_BEGRUENDUNG.toLocaleString('de-DE')} Zeichen.`}
            rows={2}
            value={begruendung}
            error={grundfehler}
            readOnly={laeuft}
            onChange={(event) => {
              setBegruendung(event.target.value);
              if (grundfehler) setGrundfehler(undefined);
            }}
          />
        </div>

        <Kleingedrucktes id={folgeId} className="shrink-0 px-4 pb-3">
          Jede Korrektur wird als neue Version festgeschrieben und protokolliert. Frühere Versionen
          werden nicht überschrieben.
        </Kleingedrucktes>

        {/* Die Rückfrage des Schutzes steht ausführlich, nicht als Zeile: Sie
            sagt, warum es hier kein Speichern gibt (DOK-05). */}
        <div className="shrink-0 px-4 empty:hidden [&>*:first-child]:mt-0">{schutz}</div>

        <Aktionsleiste einbettung="flaeche">
          {/* „Festschreiben“, nicht „Speichern“: Speichern heißt in der
              Dokumentation Entwurf (ANN-046), eine Korrektur ist sofort eine
              neue Version der Akte (DOK-08). Die Folge steht darüber und ist
              mit dem Knopf verbunden (DOK-20). */}
          <Button
            type="submit"
            groesse="kompakt"
            className="ml-auto"
            disabled={laeuft || !geaendert}
            aria-describedby={folgeId}
          >
            {laeuft ? 'Wird festgeschrieben …' : 'Korrektur festschreiben'}
          </Button>
        </Aktionsleiste>
      </form>
    </Schreibflaeche>
  );
}

export function TreatmentNoteRevisionPage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation ändern dürfen Therapeut:innen und Teamleitung."
      eigenerKopf
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const eintrag = findeEintrag(dokumentation, noteId);

        if (!eintrag) {
          return (
            <ZustandMitRueckweg
              appointmentId={appointment.id}
              titel={patientName(appointment)}
              beschreibung={kopfzeileFuer('Korrektur', appointment)}
            >
              <ErrorState
                title="Nicht gefunden"
                description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
              />
            </ZustandMitRueckweg>
          );
        }

        // Ein erwartbarer Zustand mit dem nächsten Schritt, kein Alarm (DOK-12).
        if (eintrag.status !== 'final') {
          return (
            <ZustandMitRueckweg
              appointmentId={appointment.id}
              titel={patientName(appointment)}
              beschreibung={kopfzeileFuer('Korrektur', appointment)}
            >
              <NochEinEntwurf
                appointmentId={appointment.id}
                eintrag={eintrag}
                eingehend={eingehend}
                beschreibung="Ein Entwurf wird schlicht bearbeitet. Eine Korrektur mit Begründung gibt es erst nach der Finalisierung."
              />
            </ZustandMitRueckweg>
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
