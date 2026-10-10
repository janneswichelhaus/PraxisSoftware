import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
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
import { Einfuegemeldung } from './Einfuegemeldung';
import { useEinfuegen } from './einfuegen';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { nachtragFestschreiben } from './uebernahme';
import {
  createTreatmentNoteAddendum,
  findeEintrag,
  inhaltFehler,
  updateTreatmentNote,
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
  zumTermin,
}: {
  appointment: Appointment;
  parent: TreatmentNote;
  /** Der aktuelle Stand des Termins - daraus der schon gesicherte Nachtrag. */
  dokumentation: TreatmentDocumentation;
  /** Ziel für „Abbrechen“ und nach dem Speichern: der Termin samt Rückweg (DOK-01). */
  zumTermin: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const feldId = useId();
  const folgeId = useId();

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
  const ungespeichert = angelegtId ? inhalt !== gespeichert : inhalt.trim().length > 0;
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
    return inhaltRef.current === zuSichern;
  }

  const { freigeben, laeuft, schreiben, schutz, sicherungsstand } = useTextverlustschutz({
    ungespeichert,
    speichern: entwurfSichern,
    selbst: {
      stand: inhalt,
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
        if (!angelegtIdRef.current || inhaltRef.current !== gespeichert) {
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
    <>
      <PageHeader
        title="Nachtrag zur Behandlungsdokumentation"
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      {/* Der Ursprungseintrag zugeklappt mit seiner ersten Zeile (BEF-057
          Option 2): Ausgeklappt stand er ganz vor dem Feld, und am Handy
          begann der Nachtrag unter dem Falz. Ein Tipp zeigt ihn vollständig;
          er bleibt Akteninhalt, kein Hinweis (UI-002c, DOK-19). */}
      <details className="group border-line mb-6 max-w-2xl border-y">
        <summary className={`${aufklappKopfKlassen} text-ink min-h-12 text-sm`}>
          <Aufklappzeichen />
          <span className="tracking-label text-ink-muted shrink-0 text-xs font-semibold uppercase">
            Ursprünglicher Eintrag
          </span>
          <span aria-hidden="true" className="text-ink-muted min-w-0 truncate group-open:hidden">
            {parent.content}
          </span>
        </summary>
        <p
          data-testid="ursprung"
          className={`text-ink text-liste max-w-prose pb-4 leading-relaxed ${FREITEXT}`}
        >
          {parent.content}
        </p>
      </details>

      <form onSubmit={absenden} noValidate className="max-w-2xl">
        {/* Dieselbe Leiste wie beim Haupteintrag (BEF-056). */}
        <TextbausteinLeiste
          onEinfuegen={(text, titel) => {
            if (!schreibtFest) einfuegen(titel, inhalt, text);
          }}
        />

        <TextArea
          label="Nachtrag"
          // Auch der Nachtrag wird mit der Frist der Praxis von selbst Version 1
          // (ADR-016 Punkt 7, DOK-02).
          hint="Ergänzt den Eintrag, ohne ihn zu ändern. Bleibt Entwurf bis zur Finalisierung – spätestens mit Ablauf der Dokumentationsfrist."
          rows={12}
          feldId={feldId}
          value={inhalt}
          error={fehler}
          readOnly={schreibtFest}
          onChange={(event) => {
            setInhalt(event.target.value);
            vergessen();
            if (fehler) setFehler(undefined);
          }}
        />

        <Einfuegemeldung
          einfuegung={letzte && letzte.nachher === inhalt ? letzte : null}
          gesperrt={laeuft}
          onRueckgaengig={rueckgaengig}
        />

        {/* Fehler, Hinweise und Rückfrage stehen seit FIX-014 an einer
            Stelle: Alle Schreibwege dieser Seite laufen durch denselben
            Vorgang. */}
        {sicherungsstand}
        {schutz}

        {/* Die Folge steht über dem Knopf (ADR-016 Punkt 4, BEF-056). */}
        <p id={folgeId} className="text-ink-muted mt-5 text-sm">
          „Nachtrag festschreiben“ macht ihn als Version 1 zum Teil der Akte. Danach ist er nur noch
          mit Begründung änderbar.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={laeuft || inhalt.trim().length === 0}
            aria-describedby={folgeId}
            onClick={festschreiben}
          >
            {schreibtFest ? 'Wird festgeschrieben …' : 'Nachtrag festschreiben'}
          </Button>
          <Button type="submit" variant="secondary" disabled={laeuft || !ungespeichert}>
            {laeuft && !schreibtFest ? 'Wird gespeichert …' : 'Als Entwurf speichern'}
          </Button>
          <ButtonLink to={zumTermin} variant="quiet">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <Kleingedrucktes className="mt-10">
        Der Nachtrag wird auf dem Server gespeichert, nicht auf diesem Gerät. Das Öffnen der Akte
        wird protokolliert.
      </Kleingedrucktes>
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

        return (
          <Formular
            appointment={appointment}
            parent={eintrag}
            dokumentation={dokumentation}
            zumTermin={zumTermin}
          />
        );
      }}
    </DocumentationShell>
  );
}
