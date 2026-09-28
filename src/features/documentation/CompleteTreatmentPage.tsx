import { useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { TextArea } from '@/components/ui/TextArea';
import { EmptyState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
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
import { Einfuegemeldung } from './Einfuegemeldung';
import { useEinfuegen } from './einfuegen';
import { statuswechselText, type Statuswechsel } from './format';
import { useTextverlustschutz } from './Textverlustschutz';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { bausteinEinfuegen } from './textbausteine';
import { BereitsFinalisiert } from './Zustaende';
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
  zumTermin,
  inzwischen,
}: {
  appointment: Appointment;
  note: TreatmentNote | null;
  /** Hausbesuch-Szenario 1: Tür geöffnet, Behandlung nicht durchgeführt. */
  ohneBehandlung: boolean;
  /** Ziel für „Abbrechen“ und nach dem Schreiben: der Termin samt Rückweg (DOK-01). */
  zumTermin: string;
  /** Was sich geändert hat, seit die Seite offen ist (DOK-B01). */
  inzwischen: Statuswechsel | undefined;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = appointment.organization_time_zone;
  const feldId = useId();
  const folgeId = useId();

  const gespeichert = note?.content ?? '';
  const [entwurf, setEntwurf] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  // Welcher der beiden Wege gerade läuft. Der Schutz kennt nur „es läuft
  // einer"; die Beschriftung und das unveränderliche Feld brauchen die
  // Unterscheidung.
  const [schreibtAbschluss, setSchreibtAbschluss] = useState(false);
  // Der eigene Abschluss finalisiert den Eintrag. Das Nachladen danach ist
  // dann kein „inzwischen finalisiert“ (DOK-B01), sondern die eigene Tat.
  const selbstAbgeschlossen = useRef(false);

  const wert = entwurf ?? gespeichert;
  const bausteine = useBausteinAuswahl();
  // Ein Vorschlag aus den Bausteinen, der noch nicht im Feld steht, ist
  // ungespeicherte Arbeit wie getippter Text (§13, FRB-003b).
  const geaendert = wert !== gespeichert || bausteine.text !== '';
  const [vorschlagOffen, setVorschlagOffen] = useState(false);
  const { letzte, einfuegen, rueckgaengig, vergessen } = useEinfuegen(feldId, setEntwurf);

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
    // Ein noch nicht übernommener Vorschlag geht in den **Entwurf** mit —
    // erreichbar nur über die Rückfrage des Navigationsschutzes, die
    // verspricht, dass nichts verloren geht. Beide Schaltflächen halten
    // vorher an; in den Abschluss geht er nie ungesehen (FRB-003b, ANN-120).
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
    if (vorschlag && vorschlagRef.current === vorschlag) {
      const imFeld = bausteinEinfuegen(wertRef.current, vorschlag);
      setEntwurf(imFeld);
      bausteine.leeren();
      wertRef.current = imFeld;
      vorschlagRef.current = '';
    }
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    return wertRef.current === zuSichern && vorschlagRef.current === '';
  }

  // Die Meldung gilt dem Vorschlag, der sie ausgelöst hat; ist er übernommen
  // oder verworfen, verschwindet sie, statt beim nächsten wieder zu stehen.
  useEffect(() => {
    if (!bausteine.text) setVorschlagOffen(false);
  }, [bausteine.text]);

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
    selbstAbgeschlossen.current = true;
    await nachSchreiben();
    // Feld, Textbausteine und Bausteinfeld sind währenddessen gesperrt; was
    // gesendet wurde, ist, was auf dem Bildschirm steht.
    return true;
  }

  /**
   * Zurück zum Termin - samt Rückweg (DOK-01, ZST-17) und dem, was geschehen
   * ist (DOK-15): Der Termin kann es oben melden, statt dass es nur im
   * Doku-Abschnitt weit unten steht.
   */
  function weiterZumTermin(meldung: string) {
    freigeben();
    void navigate(zumTermin, { state: { meldung } });
  }

  /**
   * Gemeinsame Eingabeprüfung beider Wege. Verbindlich prüft der Server.
   *
   * Geschrieben wird nur, was im Feld steht und gelesen wurde (ADR-016
   * Punkt 4): Ein Vorschlag aus den Bausteinen hält beide Wege an, bis er
   * übernommen oder verworfen ist — auch den Entwurf, weil ungesehener Text
   * sonst über die automatische Finalisierung (Punkt 7) in die Akte käme.
   */
  function geprueft(): boolean {
    if (bausteine.text) {
      setVorschlagOffen(true);
      return false;
    }
    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    return meldung === undefined;
  }

  const wechsel = inzwischen && !selbstAbgeschlossen.current ? inzwischen : undefined;

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
          zurück und wählt den anderen Weg.

          Ein Hinweis, kein Bedienelement: vertieft, mit der Trennlinie statt
          des Rahmens für Bedienbares (DOK-19) - so ist er von der Rückfrage
          des Schutzes darunter zu unterscheiden. */}
      {ohneBehandlung ? (
        <div className="border-line bg-surface-sunken rounded-card mb-5 max-w-2xl border p-4">
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
          if (!geprueft()) return;
          setSchreibtAbschluss(true);
          void schreiben({
            ausfuehren: abschlussSchreiben,
            fehlertitel: 'Nicht abgeschlossen',
            danach: () =>
              weiterZumTermin(
                ohneBehandlung ? 'Ohne Behandlung abgeschlossen.' : 'Behandlung abgeschlossen.',
              ),
          }).finally(() => setSchreibtAbschluss(false));
        }}
      >
        {/* Hat sich der Stand geändert, während hier geschrieben wurde, bleibt
            das Feld stehen und sagt es (DOK-B01). */}
        {wechsel ? (
          <Statusmeldung ton="warnung" className="mb-3">
            {statuswechselText(wechsel, geaendert)}
          </Statusmeldung>
        ) : null}

        {/* Während eines Schreibvorgangs fügt die Leiste nichts ein: Das Feld
            ist dann festgehalten, und ein eingefügter Baustein stünde auf dem
            Bildschirm, aber nicht im Abschluss (Zweitreview FRB-EPIC-003). */}
        <TextbausteinLeiste
          onEinfuegen={(text, titel) => {
            if (!laeuft) einfuegen(titel, wert, text);
          }}
        />

        <TextArea
          label="Eintrag zur Behandlung"
          hint={
            ohneBehandlung
              ? 'Freitext. Was hier steht, wird mit dem Abschluss Bestandteil der Akte – etwa, was die Patient:in an der Tür gesagt hat.'
              : 'Freitext. Was hier steht, wird mit dem Abschluss Bestandteil der Akte.'
          }
          rows={12}
          feldId={feldId}
          value={wert}
          error={fehler}
          // Während des Abschlusses unveränderlich: Was festgeschrieben wird,
          // muss genau das sein, was auf dem Bildschirm stand (FIX-014).
          readOnly={schreibtAbschluss}
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

        {ohneBehandlung ? null : (
          <BausteinFeld
            bausteine={bausteine}
            onUebernehmen={(text) => einfuegen('Befund aus Bausteinen', wert, text)}
            gesperrt={laeuft}
            meldung={vorschlagOffen && bausteine.text ? VORSCHLAG_OFFEN : undefined}
          />
        )}

        {/* Die Folge steht vor der Schaltfläche, nicht in einer Rückfrage
            danach: So liest man sie, bevor man tippt (ADR-016 Punkt 4, 5).
            Wer mit der Tastatur zum Knopf springt, hört sie dort mit
            (`aria-describedby`, DOK-20). Ein Hinweis, kein Bedienelement:
            Trennlinie statt Bedienrahmen (DOK-19). */}
        <div className="border-line bg-surface-sunken rounded-card mt-5 border p-4">
          <p id={folgeId} className="text-ink text-sm leading-relaxed">
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
          <Button type="submit" disabled={laeuft} aria-describedby={folgeId}>
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
              if (!geprueft()) return;
              void schreiben({
                ausfuehren: entwurfSichern,
                fehlertitel: 'Nicht gespeichert',
                danach: () => weiterZumTermin('Entwurf gespeichert – noch nicht finalisiert.'),
              });
            }}
          >
            {laeuft && !schreibtAbschluss ? 'Wird gespeichert …' : 'Nur als Entwurf speichern'}
          </Button>

          {/* Die Rückfrage vor dem Verwerfen stellt seit FIX-011 der
              Navigationsschutz - für diesen Weg wie für jeden anderen aus
              dieser Seite heraus. */}
          <ButtonLink to={zumTermin} variant="quiet">
            Abbrechen
          </ButtonLink>
        </div>
      </form>

      <p className="text-ink-muted mt-10 max-w-prose text-xs leading-relaxed">
        Der Text wird auf dem Server gespeichert, nicht auf diesem Gerät. Anlegen, Finalisieren und
        Lesen werden protokolliert.
      </p>
    </>
  );
}

/** Was die Seite zeigt - den Abschluss oder einen Zustand, der ihn ausschließt. */
type Abschlusszustand = 'abschluss' | Extract<Statuswechsel, 'abgesagt' | 'finalisiert'>;

function zustandFuer(appointment: Appointment, note: TreatmentNote | null): Abschlusszustand {
  if (appointment.status === 'cancelled') return 'abgesagt';
  if (note?.status === 'final') return 'finalisiert';
  return 'abschluss';
}

export function CompleteTreatmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [suche] = useSearchParams();

  // Der Weg aus dem geführten Ablauf am Hausbesuch (CAL-018). Er reist in der
  // Adresszeile wie der Rückweg: So überlebt er ein Neuladen, und die Seite
  // braucht keinen zweiten Zustand neben dem Text.
  const ohneBehandlungGewaehlt = suche.get('ohne-behandlung') === '1';

  // Ob der Abschluss steht, entscheidet der erste Stand - danach bleibt er
  // (DOK-B01). Finalisiert eine Kollegin oder die Frist, sagt das Büro ab,
  // während hier geschrieben wird, verschwand bisher das Feld samt Text.
  const ausgangslage = useRef<{ termin: string; abschluss: boolean } | null>(null);

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Eine Behandlung abschließen dürfen Therapeut:innen und Teamleitung."
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const zustand = zustandFuer(appointment, dokumentation.primary);
        const warAbschluss =
          ausgangslage.current?.termin === appointment.id && ausgangslage.current.abschluss;
        const abschluss = zustand === 'abschluss' || warAbschluss;
        ausgangslage.current = { termin: appointment.id, abschluss };

        if (abschluss) {
          return (
            <Abschluss
              key={appointment.id}
              appointment={appointment}
              note={dokumentation.primary}
              // Der Vermerk gilt am Hausbesuch (ANN-055). Ein verstellter
              // Parameter an einem Praxistermin fällt hier still weg, statt in
              // eine Fehlermeldung des Servers zu laufen; verbindlich weist der
              // Server ihn ohnehin ab.
              ohneBehandlung={
                ohneBehandlungGewaehlt && appointment.appointment_type === 'home_visit'
              }
              zumTermin={zumTermin}
              inzwischen={zustand === 'abschluss' ? undefined : zustand}
            />
          );
        }

        // Erwartbare Zustände stehen ruhig da, mit dem nächsten Schritt
        // (DOK-12) - kein roter Alarm.
        if (zustand === 'abgesagt') {
          return (
            <EmptyState
              title="Termin abgesagt"
              description="Zu einem abgesagten Termin hat keine Behandlung stattgefunden."
            />
          );
        }

        // Derselbe Zustand heißt überall gleich: „Bereits finalisiert“ (DOK-08).
        return dokumentation.primary ? (
          <BereitsFinalisiert
            appointmentId={appointment.id}
            eintrag={dokumentation.primary}
            eingehend={eingehend}
          />
        ) : null;
      }}
    </DocumentationShell>
  );
}
