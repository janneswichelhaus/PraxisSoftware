import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextArea } from '@/components/ui/TextArea';
import { ErrorState } from '@/components/ui/Feedback';
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
import { useTextverlustschutz } from './Textverlustschutz';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { bausteinEinfuegen } from './textbausteine';
import {
  completeTreatment,
  createTreatmentNote,
  inhaltFehler,
  updateTreatmentNote,
  type TreatmentNote,
} from './api';

/**
 * Behandlung abschließen in einem Schritt (UX-007).
 *
 * Am Ende eines Hausbesuchs standen bisher sechs Schritte über drei Ansichten:
 * Termin abschließen, Dokumentation anlegen, Text schreiben, Entwurf speichern,
 * zurück zum Termin, finalisieren, Rückfrage bestätigen. Auf dem Telefon, im
 * Hausflur, mit einer Hand.
 *
 * Hier ist es eine Seite: Text schreiben, abschließen. Serverseitig laufen
 * dieselben drei Vorgänge in **einer** Transaktion (`complete_treatment`).
 *
 * ADR-016 Punkt 4 verlangt, dass die Finalisierung ein **ausdrücklicher**
 * Schritt bleibt. Sie ist es: Die Schaltfläche heißt nach dem, was sie tut,
 * und ihre Folge steht unmittelbar darüber - nicht in einer zweiten Rückfrage,
 * die erst nach dem Klick erscheint. Wer nur speichern will, hat daneben den
 * Weg „Nur als Entwurf speichern".
 */

function Abschluss({
  appointment,
  note,
  ohneBehandlung,
}: {
  appointment: Appointment;
  note: TreatmentNote | null;
  /** Hausbesuch-Szenario 1: Tür geöffnet, Behandlung nicht durchgeführt. */
  ohneBehandlung: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const zurueck = `/termine/${appointment.id}`;

  const gespeichert = note?.content ?? '';
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  // Welcher der beiden Wege gerade läuft. Der Schutz kennt nur „es läuft
  // einer"; die Beschriftung und das unveränderliche Feld brauchen die
  // Unterscheidung.
  const [schreibtAbschluss, setSchreibtAbschluss] = useState(false);

  const wert = entwurf ?? gespeichert;
  const bausteine = useBausteinAuswahl();
  // Ein Vorschlag aus den Bausteinen, der noch nicht im Feld steht, ist
  // ungespeicherte Arbeit wie getippter Text (§13, FRB-003b).
  const geaendert = wert !== gespeichert || bausteine.text !== '';
  const [vorschlagOffen, setVorschlagOffen] = useState(false);

  // Der Text, wie er in diesem Augenblick im Feld steht - nicht der von
  // vorhin. Ein Schreibvorgang dauert (FIX-014).
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const vorschlagRef = useRef(bausteine.text);
  vorschlagRef.current = bausteine.text;

  /**
   * Nur den Entwurf sichern - ohne Abschluss und ohne Seitenwechsel.
   *
   * Derselbe Weg, den „Nur als Entwurf speichern" nimmt, und der Weg, den der
   * Navigationsschutz anbietet. Ausdrücklich **nicht** `completeTreatment`:
   * Ein Seitenwechsel darf keinen Termin abschließen und keine Dokumentation
   * festschreiben (ADR-016, ADR-018).
   */
  async function entwurfSichern(): Promise<boolean> {
    // Ein noch nicht übernommener Vorschlag geht in den **Entwurf** mit, damit
    // die Rückfrage des Navigationsschutzes hält, was sie verspricht. In den
    // Abschluss geht er nie ungesehen (siehe unten, FRB-003b).
    const vorschlag = vorschlagRef.current;
    const zuSichern = vorschlag ? bausteinEinfuegen(wertRef.current, vorschlag) : wertRef.current;
    const meldung = inhaltFehler(zuSichern);
    if (meldung) {
      setFehler(meldung);
      throw new Error(meldung);
    }

    if (note) {
      await updateTreatmentNote(note.id, note.updated_at, zuSichern);
    } else {
      await createTreatmentNote(appointment.id, zuSichern);
    }
    if (vorschlag) {
      const imFeld = bausteinEinfuegen(wertRef.current, vorschlag);
      setEntwurf(imFeld);
      bausteine.leeren();
      wertRef.current = imFeld;
      vorschlagRef.current = '';
    }
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    return wertRef.current === zuSichern;
  }

  const { freigeben, laeuft, schreiben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    speichern: entwurfSichern,
  });

  async function nachSchreiben() {
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
    // Kalender und Tagesliste führen den Termin sonst weiter im alten Zustand.
    await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
  }

  /**
   * Abschließen - und dabei genau den Text festschreiben, der im Feld steht.
   *
   * Anders als beim Entwurf ist dieser Vorgang **nicht umkehrbar**: Was hier
   * durchgeht, ist Bestandteil der Akte und nur noch als Korrektur mit
   * Begründung änderbar. Deshalb bleibt das Feld währenddessen unveränderlich
   * (`festgehalten`): Ein Zeichen, das nach dem Absenden dazukommt, stünde
   * sonst nicht in der festgeschriebenen Fassung, und die Person hätte es nie
   * erfahren (FIX-014, ADR-016).
   */
  async function abschlussSchreiben(): Promise<boolean> {
    await completeTreatment(
      appointment.id,
      wertRef.current,
      appointment.updated_at,
      note?.updated_at ?? null,
      ohneBehandlung,
    );
    await nachSchreiben();
    // Wer währenddessen Bausteine angetippt hat, hat danach wieder
    // ungespeicherte Arbeit; die Seite bleibt dann stehen (FIX-014).
    return vorschlagRef.current === '';
  }

  function weiterZumTermin() {
    freigeben();
    void navigate(zurueck);
  }

  /**
   * Gemeinsame Eingabeprüfung beider Wege. Verbindlich prüft der Server.
   * Geprüft wird der Text, der geschrieben würde: beim Entwurf samt einem
   * noch nicht übernommenen Vorschlag.
   */
  function geprueft(mitVorschlag: boolean): boolean {
    const meldung = inhaltFehler(
      mitVorschlag && bausteine.text ? bausteinEinfuegen(wert, bausteine.text) : wert,
    );
    setFehler(meldung);
    return meldung === undefined;
  }

  return (
    <>
      <PageHeader
        title={ohneBehandlung ? 'Ohne Behandlung abschließen' : 'Behandlung abschließen'}
        description={`${patientName(appointment)} · ${formatLocalDate(appointment.starts_at, zone)}, ${formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}`}
        kompakt
      />

      {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018, ADR-018
          Fassung 3 Punkt 9). Er steht hier als Feststellung und nicht als
          Kästchen zum Umschalten: Wer diesen Weg gewählt hat, hat die Frage am
          Termin schon beantwortet, und ein zweites Mal danach zu fragen hieße,
          die erste Antwort nicht ernst zu nehmen. Wer sich vertan hat, geht
          zurück und wählt den anderen Weg. */}
      {ohneBehandlung ? (
        <div className="border-line-strong bg-surface-sunken rounded-card mb-5 max-w-2xl border p-4">
          <p className="text-ink text-sm leading-relaxed">
            <strong className="font-medium">
              Vermerk: Tür geöffnet, Behandlung auf Angabe der Patient:in nicht durchgeführt.
            </strong>{' '}
            Der Termin gilt als durchgeführt und wird normal abgerechnet; eine Ausfallgebühr
            entsteht nicht. Der Vermerk wird mit dem Abschluss gesetzt und gehört dann zum Eintrag –
            ein Entwurf trägt ihn noch nicht.
          </p>
        </div>
      ) : null}

      <form
        noValidate
        className="max-w-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          // Festgeschrieben wird nur, was im Feld steht und gelesen wurde
          // (ADR-016 Punkt 4). Ein Vorschlag aus den Bausteinen geht deshalb
          // nicht ungesehen mit, sondern hält den Abschluss an (FRB-003b).
          if (bausteine.text) {
            setVorschlagOffen(true);
            return;
          }
          if (!geprueft(false)) return;
          setSchreibtAbschluss(true);
          void schreiben({
            ausfuehren: abschlussSchreiben,
            fehlertitel: 'Nicht abgeschlossen',
            danach: weiterZumTermin,
          }).finally(() => setSchreibtAbschluss(false));
        }}
      >
        <TextbausteinLeiste onEinfuegen={(text) => setEntwurf(bausteinEinfuegen(wert, text))} />

        <TextArea
          label="Eintrag zur Behandlung"
          hint={
            ohneBehandlung
              ? 'Freitext. Was hier steht, wird mit dem Abschluss Bestandteil der Akte – etwa, was die Patient:in an der Tür gesagt hat.'
              : 'Freitext. Was hier steht, wird mit dem Abschluss Bestandteil der Akte.'
          }
          rows={12}
          value={wert}
          error={fehler}
          // Während des Abschlusses unveränderlich: Was festgeschrieben wird,
          // muss genau das sein, was auf dem Bildschirm stand (FIX-014).
          readOnly={schreibtAbschluss}
          onChange={(event) => {
            setEntwurf(event.target.value);
            if (fehler) setFehler(undefined);
          }}
        />

        {ohneBehandlung ? null : (
          <BausteinFeld
            bausteine={bausteine}
            onUebernehmen={(text) => {
              setEntwurf(bausteinEinfuegen(wert, text));
              setVorschlagOffen(false);
            }}
            hinweis="Übernommen wird der Vorschlag mit „In den Text übernehmen“. Abgeschlossen wird erst, wenn er im Text steht oder verworfen ist."
          />
        )}
        {vorschlagOffen && bausteine.text ? (
          <Statusmeldung ton="fehler" className="mt-3">
            Der Vorschlag aus den Bausteinen steht noch nicht im Text. Bitte übernehmen oder
            verwerfen, dann abschließen.
          </Statusmeldung>
        ) : null}

        {/* Die Folge steht vor der Schaltfläche, nicht in einer Rückfrage
            danach: So liest man sie, bevor man tippt (ADR-016 Punkt 4, 5). */}
        <div className="border-line-strong bg-surface-sunken rounded-card mt-5 border p-4">
          <p className="text-ink text-sm leading-relaxed">
            Mit dem Abschluss geschieht zweierlei in einem Schritt: Der Termin wird als durchgeführt
            geführt, und der Eintrag wird als Version 1 festgeschrieben. Ab dann ist er Bestandteil
            der Patientenakte; jede spätere Änderung braucht eine Begründung und bleibt
            nachvollziehbar.
            {appointment.status === 'completed'
              ? ' Dieser Termin ist bereits abgeschlossen – es wird nur noch die Dokumentation festgeschrieben.'
              : ''}
          </p>
        </div>

        {/* Fehler, Hinweise und Rückfrage stehen seit FIX-014 an einer Stelle:
            Beide Schaltflächen und die Rückfrage laufen durch denselben
            Schreibweg, und es läuft immer höchstens einer. */}
        {schutz}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={laeuft}>
            {schreibtAbschluss
              ? 'Wird abgeschlossen …'
              : ohneBehandlung
                ? 'Ohne Behandlung abschließen'
                : 'Behandlung abschließen'}
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={laeuft || !geaendert}
            onClick={() => {
              if (!geprueft(true)) return;
              void schreiben({
                ausfuehren: entwurfSichern,
                fehlertitel: 'Nicht gespeichert',
                danach: weiterZumTermin,
              });
            }}
          >
            {laeuft && !schreibtAbschluss ? 'Wird gespeichert …' : 'Nur als Entwurf speichern'}
          </Button>

          {/* Die Rückfrage vor dem Verwerfen stellt seit FIX-011 der
              Navigationsschutz - für diesen Weg wie für jeden anderen aus
              dieser Seite heraus. */}
          <Link
            to={zurueck}
            className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-button inline-flex min-h-11 items-center justify-center px-4 text-[0.9375rem] font-medium transition-colors"
          >
            Abbrechen
          </Link>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Text wird auf dem Server gespeichert, nicht auf diesem Gerät. Anlegen, Finalisieren und
        Lesen werden protokolliert.
      </p>
    </>
  );
}

export function CompleteTreatmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [suche] = useSearchParams();

  // Der Weg aus dem geführten Ablauf am Hausbesuch (CAL-018). Er reist in der
  // Adresszeile wie der Rückweg: So überlebt er ein Neuladen, und die Seite
  // braucht keinen zweiten Zustand neben dem Text.
  const ohneBehandlungGewaehlt = suche.get('ohne-behandlung') === '1';

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Eine Behandlung abschließen dürfen ausschließlich therapeutische Rollen."
    >
      {({ appointment, dokumentation }) => {
        if (appointment.status === 'cancelled') {
          return (
            <ErrorState
              title="Termin abgesagt"
              description="Zu einem abgesagten Termin hat keine Behandlung stattgefunden."
            />
          );
        }

        if (dokumentation.primary?.status === 'final') {
          return (
            <ErrorState
              title="Bereits abgeschlossen"
              description="Die Dokumentation dieses Termins ist finalisiert. Eine Änderung ist nur als Korrektur mit Begründung möglich, eine Ergänzung als Nachtrag."
            />
          );
        }

        return (
          <Abschluss
            appointment={appointment}
            note={dokumentation.primary}
            // Der Vermerk gilt am Hausbesuch (ANN-055). Ein verstellter
            // Parameter an einem Praxistermin fällt hier still weg, statt in
            // eine Fehlermeldung des Servers zu laufen; verbindlich weist der
            // Server ihn ohnehin ab.
            ohneBehandlung={ohneBehandlungGewaehlt && appointment.appointment_type === 'home_visit'}
          />
        );
      }}
    </DocumentationShell>
  );
}
