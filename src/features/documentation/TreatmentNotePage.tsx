import { useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { leseMeldung } from '@/features/appointments/terminformular';
import { PageHeader } from '@/components/ui/PageHeader';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { TextArea } from '@/components/ui/TextArea';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BausteinFeld } from '@/features/assessments/BausteinFeld';
import { useBausteinAuswahl } from '@/features/assessments/bausteinauswahl';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import {
  formatLocalDate,
  formatLocalTimeRange,
  patientName,
  type Appointment,
} from '@/features/appointments/api';
import { DocumentationShell } from './DocumentationShell';
import { Einfuegemeldung } from './Einfuegemeldung';
import { useEinfuegen } from './einfuegen';
import { FREITEXT, statuswechselText, type Statuswechsel } from './format';
import { useTextverlustschutz } from './Textverlustschutz';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { entwurfMeldung, useGesicherteBefundangaben } from './befundangaben';
import { BereitsFinalisiert, TextUebernehmen } from './Zustaende';
import { nachtragFestschreiben, useTextUebernahme } from './uebernahme';
import {
  createTreatmentNote,
  findeEintrag,
  inhaltFehler,
  updateTreatmentNote,
  type TreatmentNote,
} from './api';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';

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
 * wäre nicht gespeichert, würde aber so aussehen (ADR-001, ADR-015). Seit
 * UX-EPIC-007 sichert die Seite den Entwurf nach einer Pause im Tippen von
 * selbst **auf dem Server** (BEF-056, ANN-319).
 *
 * Ein Nachtrag wird hier auch festgeschrieben (BEF-056): Bis dahin ging das
 * nur über den Termin. Im Konfliktfall - der Entwurf ist inzwischen
 * finalisiert - übernimmt die Seite den getippten Text als Nachtrag oder in
 * eine Korrektur (ADR-016 Punkt 6), statt ihn nur stehen zu lassen.
 */
function Editor({
  appointment,
  note,
  ursprung,
  eingehend,
  zumTermin,
  inzwischen,
}: {
  appointment: Appointment;
  note: TreatmentNote | null;
  /** Bei einem Nachtrag: der Eintrag, den er ergänzt - zugeklappt darüber. */
  ursprung: TreatmentNote | null;
  /** Der mitgereiste Rückweg; er reist zur Übernahme mit (DOK-01). */
  eingehend: string;
  /** Ziel für „Abbrechen“ und nach dem Speichern: der Termin samt Rückweg (DOK-01). */
  zumTermin: string;
  /** Was sich geändert hat, seit die Seite offen ist (DOK-B01). */
  inzwischen: Statuswechsel | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const ortZustand: unknown = useLocation().state;
  // Was die Übernahme im Konfliktfall angelegt hat, sagt die Seite einmal (BEF-056).
  const [eingangsmeldung] = useState(() => leseMeldung(ortZustand));
  const zone = appointment.organization_time_zone;
  const feldId = useId();
  const folgeId = useId();

  const istNachtrag = note?.addendum_to_note_id != null;

  const gespeichert = note?.content ?? '';
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  // Während der Nachtrag festgeschrieben wird, ist das Feld unveränderlich:
  // Festgeschrieben wird, was auf dem Bildschirm steht (FIX-014).
  const [schreibtFest, setSchreibtFest] = useState(false);
  // Das eigene Festschreiben finalisiert den Nachtrag; das Nachladen danach
  // ist kein „inzwischen finalisiert“ (DOK-B01), sondern die eigene Tat.
  const selbstFestgeschrieben = useRef(false);

  const wert = entwurf ?? gespeichert;
  const bausteine = useBausteinAuswahl();
  // Angaben in den Bausteinen, die noch nicht gesichert sind, sind
  // ungespeicherte Arbeit wie getippter Text (§13, FRB-003b). Gesichert werden
  // sie getrennt vom Entwurf, nie in seinen Text (ABN-015, ANN-120).
  const befund = useGesicherteBefundangaben(appointment.id, bausteine, !istNachtrag);
  const textGeaendert = wert !== gespeichert;
  const geaendert = textGeaendert || befund.ungesichert;
  const { letzte, einfuegen, rueckgaengig, vergessen } = useEinfuegen(feldId, setEntwurf);

  // Der Text, wie er in diesem Augenblick im Feld steht. Ein Schreibvorgang
  // dauert; wer währenddessen weitertippt, hat danach wieder ungespeicherten
  // Text. Ohne diese Referenz läse der Vorgang den Stand von vorhin, und die
  // Seite ginge mit einem Ergebnis weiter, das den neuen Text nicht enthält
  // (FIX-014).
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const gespeichertRef = useRef(gespeichert);
  gespeichertRef.current = gespeichert;

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
    // Ein nicht übernommener Vorschlag geht **nicht** in den Entwurf - auch
    // nicht über die Rückfrage des Navigationsschutzes: Der Entwurf kann von
    // selbst festgeschrieben werden (ADR-016 Punkt 7). Seine Angaben sichert
    // `befund` daneben, bis die Person übernimmt oder verwirft (ABN-015,
    // BEF-103 Punkt 1, ANN-120 Fassung 2).
    const zuSichern = wertRef.current;
    if (zuSichern !== gespeichertRef.current) {
      const meldung = inhaltFehler(zuSichern);
      if (meldung) {
        setFehler(meldung);
        throw new Error(meldung);
      }
      try {
        if (note) {
          await updateTreatmentNote(note.id, note.updated_at, zuSichern);
        } else {
          await createTreatmentNote(appointment.id, zuSichern);
        }
      } catch (error) {
        // Den Stand nachladen, statt zum Neuladen aufzufordern (BEF-056): Ist
        // der Eintrag inzwischen finalisiert, bietet die Seite danach die
        // Übernahme an; ist er ein fremder Entwurf, beruht das nächste
        // Speichern auf dessen Stand. Der Text bleibt im Feld.
        await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
        throw error;
      }
    }
    if (befund.ungesichert) await befund.sichern();
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    return wertRef.current === zuSichern;
  }

  const wechsel = inzwischen && !selbstFestgeschrieben.current ? inzwischen : undefined;

  const { freigeben, laeuft, schreiben, schutz, sicherungsstand } = useTextverlustschutz({
    ungespeichert: geaendert,
    speichern: entwurfSichern,
    // Von selbst nur, was sich sichern lässt: kein leeres oder zu langes Feld,
    // kein Eintrag, der inzwischen finalisiert oder dessen Termin abgesagt ist
    // (BEF-056, ANN-319).
    selbst: {
      stand: wert,
      bereit: !wechsel && !schreibtFest && (!textGeaendert || inhaltFehler(wert) === undefined),
    },
  });

  /**
   * Den Nachtrag festschreiben, wo er geschrieben wird (BEF-056).
   *
   * Erst sichern, was im Feld steht, dann finalisieren - beides durch den
   * einen Schreibweg der Seite. Die Folge steht über dem Knopf (ADR-016
   * Punkt 4).
   */
  function nachtragAbschliessen() {
    if (!note) return;
    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    if (meldung) return;
    setSchreibtFest(true);
    void schreiben({
      ausfuehren: async () => {
        if (wertRef.current !== gespeichertRef.current || befund.ungesichert) {
          const vollstaendig = await entwurfSichern();
          if (!vollstaendig) return false;
        }
        selbstFestgeschrieben.current = true;
        try {
          await nachtragFestschreiben(queryClient, appointment.id, note.id);
        } catch (error) {
          selbstFestgeschrieben.current = false;
          throw error;
        }
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

  const uebernahme = useTextUebernahme({
    appointmentId: appointment.id,
    note,
    eingehend,
    wertRef,
    setFehler,
    schutz: { schreiben, freigeben },
  });

  function absenden(event: React.FormEvent) {
    event.preventDefault();

    // Gespeichert wird, was im Feld steht und gelesen wurde. Ein Vorschlag
    // aus den Bausteinen geht nicht mit - sonst könnte ungesehener Text über
    // die automatische Finalisierung (ADR-016 Punkt 7) Bestandteil der Akte
    // werden; seine Angaben sichert `befund` daneben (ABN-015, ANN-120).
    if (textGeaendert) {
      const meldung = inhaltFehler(wert);
      setFehler(meldung);
      if (meldung) return;
    }
    const meldung = istNachtrag
      ? 'Nachtrag als Entwurf gespeichert.'
      : entwurfMeldung(textGeaendert, bausteine.text !== '');

    void schreiben({
      ausfuehren: entwurfSichern,
      fehlertitel: 'Nicht gespeichert',
      danach: () => {
        // Der eigene Rückweg ist gewollt und braucht keine Rückfrage. Der
        // Termin bekommt mit, was geschehen ist (DOK-15) - der Doku-Abschnitt
        // steht dort erst weit unten.
        freigeben();
        void navigate(zumTermin, { state: { meldung } });
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
        {/* Hat sich der Stand geändert, während hier geschrieben wurde, bleibt
            das Feld stehen und sagt es (DOK-B01) - statt samt Text zu
            verschwinden. */}
        {eingangsmeldung && !geaendert ? (
          <Statusmeldung ton="erfolg" className="mb-3">
            {eingangsmeldung}
          </Statusmeldung>
        ) : null}

        {wechsel ? (
          <Statusmeldung ton="warnung" className="mb-3">
            {statuswechselText(wechsel, geaendert)}
          </Statusmeldung>
        ) : null}

        {/* Der Text findet einen Weg in die Akte (BEF-056): als Nachtrag -
            zu einem Nachtrag gibt es keinen weiteren (ADR-016 Punkt 6) - oder
            als Korrektur mit Begründung. */}
        {wechsel === 'finalisiert' && textGeaendert && note ? (
          <TextUebernehmen
            nachtragMoeglich={!istNachtrag}
            gesperrt={laeuft}
            onNachtrag={uebernahme.alsNachtrag}
            onKorrektur={uebernahme.inKorrektur}
          />
        ) : null}

        {/* Beim Bearbeiten eines Nachtrags steht der Ursprung zugeklappt
            darüber, wie beim Anlegen (BEF-056, BEF-057). */}
        {istNachtrag && ursprung ? (
          <details className="group border-line mb-4 border-y">
            <summary className={`${aufklappKopfKlassen} text-ink min-h-12 text-sm`}>
              <Aufklappzeichen />
              <span className="tracking-label text-ink-muted shrink-0 text-xs font-semibold uppercase">
                Ursprünglicher Eintrag
              </span>
              <span
                aria-hidden="true"
                className="text-ink-muted min-w-0 truncate group-open:hidden"
              >
                {ursprung.content}
              </span>
            </summary>
            <p
              data-testid="ursprung"
              className={`text-ink text-liste max-w-prose pb-4 leading-relaxed ${FREITEXT}`}
            >
              {ursprung.content}
            </p>
          </details>
        ) : null}

        <TextbausteinLeiste onEinfuegen={(text, titel) => einfuegen(titel, wert, text)} />

        <TextArea
          label={istNachtrag ? 'Nachtrag' : 'Eintrag zur Behandlung'}
          // Der Entwurf wird nicht ewig einer: Mit der Dokumentationsfrist der
          // Praxis wird er von selbst Version 1 (ADR-016 Punkt 7, DOK-02).
          hint={`Freitext. ${istNachtrag ? 'Der Nachtrag' : 'Der Eintrag'} bleibt ein Entwurf, bis jemand ihn finalisiert – spätestens automatisch mit Ablauf der Dokumentationsfrist der Praxis.`}
          rows={14}
          feldId={feldId}
          value={wert}
          error={fehler}
          readOnly={schreibtFest}
          onChange={(event) => {
            setEntwurf(event.target.value);
            vergessen();
            if (fehler) setFehler(undefined);
          }}
        />

        <Einfuegemeldung
          einfuegung={letzte && letzte.nachher === wert ? letzte : null}
          gesperrt={laeuft}
          onRueckgaengig={rueckgaengig}
        />

        {istNachtrag ? null : (
          <BausteinFeld
            bausteine={bausteine}
            onUebernehmen={(text) => einfuegen('Befund aus Bausteinen', wert, text)}
            gesperrt={laeuft}
          />
        )}

        {/* Fehler, Hinweise und Rückfrage stehen seit FIX-014 an einer Stelle:
            Alle Schreibwege dieser Seite laufen durch denselben Vorgang. */}
        {sicherungsstand}
        {schutz}

        {/* Die Folge des Festschreibens steht über dem Knopf (ADR-016
            Punkt 4, BEF-056) - nicht in einer zweiten Rückfrage. */}
        {istNachtrag && !wechsel ? (
          <p id={folgeId} className="text-ink-muted mt-5 text-sm">
            „Nachtrag festschreiben“ macht ihn als Version 1 zum Teil der Akte. Danach ist er nur
            noch mit Begründung änderbar.
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {istNachtrag && !wechsel ? (
            <Button
              type="button"
              disabled={laeuft || wert.trim() === ''}
              aria-describedby={folgeId}
              onClick={nachtragAbschliessen}
            >
              {schreibtFest ? 'Wird festgeschrieben …' : 'Nachtrag festschreiben'}
            </Button>
          ) : null}
          <Button
            type="submit"
            variant={istNachtrag && !wechsel ? 'secondary' : 'primary'}
            disabled={laeuft || !geaendert}
          >
            {laeuft && !schreibtFest ? 'Wird gespeichert …' : 'Als Entwurf speichern'}
          </Button>

          {/* „Abbrechen“ ist seit FIX-011 ein gewöhnlicher Weg zurück: Die
              Rückfrage vor dem Verwerfen stellt der Navigationsschutz, und
              zwar für diesen Weg wie für jeden anderen aus dieser Seite
              heraus. Eine zweite eigene Rückfrage an dieser Stelle hätte
              zweimal dasselbe gefragt. */}
          <ButtonLink to={zumTermin} variant="quiet">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <Kleingedrucktes className="mt-10">
        Der Entwurf wird auf dem Server gespeichert, nicht auf diesem Gerät. Das Öffnen der Akte
        wird protokolliert.
      </Kleingedrucktes>
    </>
  );
}

/** Was die Seite zeigt - der Editor oder ein Zustand, der ihn ausschließt. */
type Entwurfszustand = 'editor' | 'nicht-gefunden' | Statuswechsel;

function zustandFuer(
  appointment: Appointment,
  eintrag: TreatmentNote | null,
  noteId: string | undefined,
): Entwurfszustand {
  if (noteId && !eintrag) return 'nicht-gefunden';
  if (eintrag?.status === 'final') return 'finalisiert';
  // Zu einem abgesagten oder nicht angetroffenen Termin entsteht keine
  // Dokumentation (ADR-018; der Server weist beides ab, TER-B01). Gibt es
  // schon eine, bleibt sie bearbeitbar - sie wurde vorher angelegt und darf
  // nicht unerreichbar werden.
  if (!eintrag && appointment.status === 'cancelled') return 'abgesagt';
  if (!eintrag && appointment.status === 'no_show') return 'nicht-angetroffen';
  return 'editor';
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

  // Ob der Editor steht, entscheidet der erste Stand - danach bleibt er (DOK-B01),
  // wie in der Erhebung. Die Abfragen laden nach, etwa nach einem Funkloch; hat
  // inzwischen die Frist, eine Kollegin oder das Büro den Stand geändert, baute
  // die Seite bisher den Editor ab, und mit ihm Text, Rückfrage und Warnung
  // des Browsers. Jetzt bleibt er stehen und sagt, was sich geändert hat.
  const ausgangslage = useRef<{ schluessel: string; editor: boolean } | null>(null);

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation schreiben dürfen Therapeut:innen und Teamleitung."
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const eintrag = noteId ? findeEintrag(dokumentation, noteId) : dokumentation.primary;
        const zustand = zustandFuer(appointment, eintrag, noteId);

        const schluessel = `${appointment.id}:${noteId ?? ''}`;
        const warEditor =
          ausgangslage.current?.schluessel === schluessel && ausgangslage.current.editor;
        // Ein verschwundener Eintrag behält den Editor nicht: Mit `note = null`
        // legte er beim Speichern einen neuen Haupteintrag an.
        const editor = zustand === 'editor' || (warEditor && zustand !== 'nicht-gefunden');
        ausgangslage.current = { schluessel, editor };

        if (editor) {
          return (
            <Editor
              // Ein anderer Termin oder Eintrag setzt das Feld neu auf.
              key={schluessel}
              appointment={appointment}
              note={eintrag}
              ursprung={
                eintrag?.addendum_to_note_id
                  ? findeEintrag(dokumentation, eintrag.addendum_to_note_id)
                  : null
              }
              eingehend={eingehend}
              zumTermin={zumTermin}
              inzwischen={zustand === 'editor' ? undefined : zustand}
            />
          );
        }

        if (zustand === 'nicht-gefunden') {
          return (
            <ErrorState
              title="Nicht gefunden"
              description="Dieser Eintrag gehört nicht zu diesem Termin oder existiert nicht."
            />
          );
        }

        // Erwartbare Zustände stehen ruhig da, mit dem nächsten Schritt
        // (DOK-12) - kein roter Alarm.
        if (zustand === 'abgesagt') {
          return (
            <EmptyState
              title="Termin abgesagt"
              description="Zu einem abgesagten Termin entsteht keine Behandlungsdokumentation."
            />
          );
        }

        if (zustand === 'nicht-angetroffen') {
          return (
            <EmptyState
              title="Nicht angetroffen"
              description="Zu einem nicht angetroffenen Termin entsteht keine Behandlungsdokumentation. War das ein Irrtum, zuerst am Termin „Termin wieder öffnen“."
            />
          );
        }

        return eintrag ? (
          <BereitsFinalisiert
            appointmentId={appointment.id}
            eintrag={eintrag}
            eingehend={eingehend}
          />
        ) : null;
      }}
    </DocumentationShell>
  );
}
