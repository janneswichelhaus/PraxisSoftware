import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import { patientName, type Appointment } from '@/features/appointments/api';
import { mitRueckweg } from '@/lib/rueckweg';
import { DocumentationShell } from './DocumentationShell';
import {
  Schreibfeld,
  Schreibflaeche,
  Ursprungseintrag,
  ZustandMitRueckweg,
} from './Schreibflaeche';
import { kopfzeileFuer } from './format';
import { useTextverlustschutz } from './Textverlustschutz';
import { NochEinEntwurf } from './Zustaende';
import { Einfuegemeldung } from './Einfuegemeldung';
import { useEinfuegen } from './einfuegen';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { nachtragFestschreiben } from './uebernahme';
import {
  createTreatmentNoteAddendum,
  findeEintrag,
  inhaltFehler,
  istDauerhafterSchreibfehler,
  updateTreatmentNote,
  wieGespeichert,
  type TreatmentDocumentation,
  type TreatmentNote,
} from './api';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

/**
 * Nachtrag zu einem finalisierten Eintrag (DOK-002, ADR-016 Punkt 6).
 *
 * Die Ergänzung ist der Regelfall: sie entsteht als eigener, mit dem
 * Ursprungseintrag verknüpfter Eintrag und lässt den alten Text unangetastet.
 * Sie beginnt als Entwurf und wird wie jeder Eintrag gesondert finalisiert -
 * andernfalls entstünde klinischer Text, der nie Bestandteil der Akte wird.
 *
 * Seit UX-EPIC-007 (BEF-056) wird der Nachtrag hier auch festgeschrieben,
 * der Entwurf nach einer Pause im Tippen von selbst gesichert (ANN-319), und
 * die Textbausteine stehen wie beim Haupteintrag über dem Feld. Nach dem
 * ersten Sichern bleibt die Seite stehen und ändert denselben Entwurf, statt
 * einen zweiten Nachtrag anzulegen.
 */
function Formular({
  appointment,
  parent,
  dokumentation,
  eingehend,
  zumTermin,
}: {
  appointment: Appointment;
  parent: TreatmentNote;
  /** Der aktuelle Stand des Termins - daraus der schon gesicherte Nachtrag. */
  dokumentation: TreatmentDocumentation;
  /** Der mitgereiste Rückweg: Ziel des Pfeils oben (DOK-01). */
  eingehend: string;
  /** Ziel für „Abbrechen“ und nach dem Speichern: der Termin samt Rückweg (DOK-01). */
  zumTermin: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const feldId = useId();
  const folgeId = useId();
  const fristId = useId();

  const [inhalt, setInhalt] = useState('');
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const [schreibtFest, setSchreibtFest] = useState(false);
  // Der Nachtrag, den diese Seite angelegt hat. Ab dann ändert jedes weitere
  // Sichern ihn, statt einen zweiten anzulegen.
  const [angelegtId, setAngelegtId] = useState<string | null>(null);
  const angelegtIdRef = useRef(angelegtId);
  angelegtIdRef.current = angelegtId;
  const angelegt = angelegtId ? findeEintrag(dokumentation, angelegtId) : null;
  const gespeichert = angelegt?.content ?? '';
  // Gemessen am Stand, wie der Server ihn speichert (Zweitreview UX-EPIC-007).
  const ungespeichert = angelegtId
    ? wieGespeichert(inhalt) !== wieGespeichert(gespeichert)
    : inhalt.trim().length > 0;
  const { letzte, einfuegen, rueckgaengig, vergessen } = useEinfuegen(feldId, setInhalt);

  // Der Text, wie er in diesem Augenblick im Feld steht (FIX-014).
  const inhaltRef = useRef(inhalt);
  inhaltRef.current = inhalt;

  /**
   * Den Nachtrag als Entwurf sichern - ohne Seitenwechsel.
   *
   * Der Nachtrag entsteht ausdrücklich als Entwurf (ADR-016 Punkt 6). Der
   * Navigationsschutz und die Sicherung von selbst dürfen ihn deshalb
   * sichern, ohne etwas festzuschreiben.
   */
  async function entwurfSichern(): Promise<boolean> {
    const zuSichern = inhaltRef.current;
    const meldung = inhaltFehler(zuSichern);
    if (meldung) {
      setFehler(meldung);
      throw new Error(meldung);
    }
    const id = angelegtIdRef.current;
    if (id) {
      const stand = queryClient
        .getQueryData<TreatmentDocumentation>(['treatment-note', appointment.id])
        ?.addenda.find((eintrag) => eintrag.id === id);
      if (!stand) throw new Error('Der Nachtrag wurde nicht gefunden.');
      try {
        await updateTreatmentNote(id, stand.updated_at, zuSichern);
      } catch (error) {
        await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
        throw error;
      }
    } else {
      const neu = await createTreatmentNoteAddendum(parent.id, zuSichern);
      angelegtIdRef.current = neu;
      setAngelegtId(neu);
    }
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    // Wer während des Schreibens weitertippt, hat danach wieder
    // ungespeicherten Text (FIX-014).
    return wieGespeichert(inhaltRef.current) === wieGespeichert(zuSichern);
  }

  const { freigeben, laeuft, schreiben, schutz, sicherungsstand } = useTextverlustschutz({
    ungespeichert,
    speichern: entwurfSichern,
    // Als Zeile über der Aktionsleiste, wie auf der Schreibseite.
    kompakt: true,
    selbst: {
      stand: inhalt,
      aussetzenBei: istDauerhafterSchreibfehler,
      bereit: !schreibtFest && angelegt?.status !== 'final' && inhaltFehler(inhalt) === undefined,
    },
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

  /** Sichern, was im Feld steht, dann festschreiben (BEF-056, ADR-016 Punkt 4). */
  function festschreiben() {
    const meldung = inhaltFehler(inhalt);
    setFehler(meldung);
    if (meldung) return;
    setSchreibtFest(true);
    void schreiben({
      ausfuehren: async () => {
        if (
          !angelegtIdRef.current ||
          wieGespeichert(inhaltRef.current) !== wieGespeichert(gespeichert)
        ) {
          const vollstaendig = await entwurfSichern();
          if (!vollstaendig) return false;
        }
        await nachtragFestschreiben(queryClient, appointment.id, angelegtIdRef.current!);
        return true;
      },
      fehlertitel: 'Nicht festgeschrieben',
      danach: () => {
        freigeben();
        void navigate(zumTermin, {
          state: { meldung: 'Nachtrag als Version 1 festgeschrieben.' },
        });
      },
    }).finally(() => setSchreibtFest(false));
  }

  return (
    <Schreibflaeche
      zurueck={eingehend || zumTermin}
      titel={patientName(appointment)}
      kopfzeile={kopfzeileFuer('Nachtrag', appointment)}
      leiste={
        // Dieselbe Leiste wie beim Haupteintrag (BEF-056).
        <TextbausteinLeiste
          alsChips
          onEinfuegen={(text, titel) => {
            if (!schreibtFest) einfuegen(titel, inhalt, text);
          }}
        />
      }
    >
      <Ursprungseintrag inhalt={parent.content} />

      <form onSubmit={absenden} noValidate className="flex min-w-0 flex-1 flex-col">
        <Schreibfeld
          feldId={feldId}
          label="Nachtrag"
          wert={inhalt}
          fehler={fehler}
          beschreibungId={fristId}
          readOnly={schreibtFest}
          onAendern={(wert) => {
            setInhalt(wert);
            vergessen();
            if (fehler) setFehler(undefined);
          }}
        />

        <div className="shrink-0 px-4 empty:hidden">
          <Einfuegemeldung
            einfuegung={letzte && letzte.nachher === inhalt ? letzte : null}
            gesperrt={laeuft}
            onRueckgaengig={rueckgaengig}
          />
        </div>

        {/* Auch der Nachtrag wird mit der Frist der Praxis von selbst Version 1
            (ADR-016 Punkt 7, DOK-02); wo er liegt und was protokolliert wird,
            steht als Kleingedrucktes darunter. */}
        <Kleingedrucktes className="shrink-0 px-4 pt-2 pb-3">
          <span id={fristId}>
            Bleibt Entwurf bis zur Finalisierung – spätestens mit Ablauf der Dokumentationsfrist.
          </span>{' '}
          Der Nachtrag wird auf dem Server gespeichert, nicht auf diesem Gerät. Das Öffnen der Akte
          wird protokolliert.
        </Kleingedrucktes>

        {/* Die Folge des Festschreibens für Vorlesesoftware, wie auf der
            Schreibseite: Der Knopf heißt nach dem, was er tut (ADR-016
            Punkt 4, BEF-056, DOK-20). */}
        <p id={folgeId} className="sr-only">
          Festschreiben macht den Nachtrag als Version 1 zum Teil der Akte. Danach ist er nur noch
          mit Begründung änderbar.
        </p>

        {/* Fehler, Stand der Sicherung und Rückfrage stehen als Zeile über
            der Leiste: Alle Schreibwege laufen durch denselben Vorgang
            (FIX-014, ANN-046). */}
        <Aktionsleiste
          einbettung="flaeche"
          oben={
            <>
              {sicherungsstand}
              {schutz}
            </>
          }
        >
          <Button
            type="submit"
            variant="quiet"
            groesse="kompakt"
            className="ml-auto"
            disabled={laeuft || !ungespeichert}
          >
            {laeuft && !schreibtFest ? 'Wird gespeichert …' : 'Entwurf'}
          </Button>
          <Button
            type="button"
            groesse="kompakt"
            disabled={laeuft || inhalt.trim().length === 0}
            aria-describedby={folgeId}
            onClick={festschreiben}
          >
            {schreibtFest ? 'Wird festgeschrieben …' : 'Festschreiben'}
          </Button>
        </Aktionsleiste>
      </form>
    </Schreibflaeche>
  );
}

export function TreatmentNoteAddendumPage({ user }: { user: CurrentUser }) {
  const { appointmentId, noteId } = useParams<{ appointmentId: string; noteId: string }>();

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation schreiben dürfen Therapeut:innen und Teamleitung."
      eigenerKopf
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const eintrag = findeEintrag(dokumentation, noteId);

        if (!eintrag) {
          return (
            <ZustandMitRueckweg appointmentId={appointment.id}>
              <ErrorState
                title="Nicht gefunden"
                description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
              />
            </ZustandMitRueckweg>
          );
        }

        // Erwartbare Zustände mit dem nächsten Schritt, kein Alarm (DOK-12).
        if (eintrag.addendum_to_note_id !== null) {
          return (
            <ZustandMitRueckweg appointmentId={appointment.id}>
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
            </ZustandMitRueckweg>
          );
        }

        if (eintrag.status !== 'final') {
          return (
            <ZustandMitRueckweg appointmentId={appointment.id}>
              <NochEinEntwurf
                appointmentId={appointment.id}
                eintrag={eintrag}
                eingehend={eingehend}
                beschreibung="Solange der Eintrag ein Entwurf ist, wird er schlicht bearbeitet. Einen Nachtrag gibt es erst nach der Finalisierung."
              />
            </ZustandMitRueckweg>
          );
        }

        return (
          <Formular
            appointment={appointment}
            parent={eintrag}
            dokumentation={dokumentation}
            eingehend={eingehend}
            zumTermin={zumTermin}
          />
        );
      }}
    </DocumentationShell>
  );
}
