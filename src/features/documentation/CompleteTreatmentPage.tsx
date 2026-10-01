import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { symbolknopfKlassen } from '@/components/ui/buttonStile';
import { EmptyState } from '@/components/ui/Feedback';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { fetchAbrechnungslage, positionText } from '@/features/appointments/abrechnungslage-api';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BausteinFeld } from '@/features/assessments/BausteinFeld';
import { useBausteinAuswahl } from '@/features/assessments/bausteinauswahl';
import { VORSCHLAG_OFFEN } from '@/features/assessments/dokumentationstext';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import { formatLocalTimeRange, patientName, type Appointment } from '@/features/appointments/api';
import { BisherigeEintraege } from './BisherigeEintraege';
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
  const [suche] = useSearchParams();
  const zone = appointment.organization_time_zone;
  const feldId = useId();
  const folgeId = useId();
  const fehlerId = useId();
  // Befund-Werkzeug und Verlauf sind zu, bis jemand sie öffnet: Der Verlauf
  // liest klinische Einträge, und jedes Lesen wird protokolliert (ANN-200).
  const [befundOffen, setBefundOffen] = useState(false);
  const [verlaufOffen, setVerlaufOffen] = useState(false);
  const [verlaufAnzahl, setVerlaufAnzahl] = useState<number | null>(null);

  // „Termin 2 von 6" im Kopf - derselbe Lesepfad wie die Übersicht (PRX-008).
  const { data: lage } = useQuery({
    queryKey: ['appointment', appointment.id, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(appointment.id),
    enabled: appointment.kind === 'therapy',
    retry: false,
  });

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
    kompakt: true,
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
      setBefundOffen(true);
      return false;
    }
    const meldung = inhaltFehler(wert);
    setFehler(meldung);
    return meldung === undefined;
  }

  const wechsel = inzwischen && !selbstAbgeschlossen.current ? inzwischen : undefined;

  // Der Pfeil führt dorthin, woher die Seite kam - sonst zum Termin. Er läuft
  // wie jeder Weg hinaus durch den Textverlustschutz.
  const zurueck = leseRueckweg(suche, zumTermin);
  const position = lage ? positionText(lage) : null;
  const kopfzeile = [
    ohneBehandlung ? 'Ohne Behandlung' : 'Dokumentation',
    kurzesDatum(appointment.starts_at, zone),
    formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone),
    position,
  ]
    .filter(Boolean)
    .join(' · ');
  const hierher = mitRueckweg(`/termine/${appointment.id}/abschluss`, zurueck);
  const anzahlBefund = Object.keys(bausteine.auswahl).length;

  return (
    // Eine Fläche statt Karten (Design-Handoff 2026-10-01, Abschnitt 6a): Die
    // Seite hebt die Polsterung des Inhaltsbereichs auf und füllt die Höhe;
    // getrennt wird über Linien. Die Höhe ist die des Fensters unter der
    // Kopfzeile (56 px); am Telefon liegt die Tableiste darüber, und die
    // Fußleiste bleibt über ihr stehen.
    <div className="bg-surface border-line -mx-4 -mt-4 -mb-28 flex min-h-[calc(100dvh-3.5rem)] flex-col pb-[calc(3.5rem+1px+env(safe-area-inset-bottom))] sm:-mx-6 sm:-mt-6 sm:-mb-10 sm:border-x sm:pb-0 lg:-mx-8 lg:-mb-12">
      <header className="border-line flex min-h-12 shrink-0 items-center gap-1 border-b pr-4 pl-1">
        <Link to={zurueck} aria-label="Zurück" className={symbolknopfKlassen('quiet')}>
          <span aria-hidden="true" className="text-xl leading-none">
            ←
          </span>
        </Link>
        <div className="min-w-0">
          <h1 className="text-ink text-liste truncate leading-tight font-bold">
            {patientName(appointment)}
          </h1>
          <p className="text-ink-muted truncate text-[13px] leading-tight">{kopfzeile}</p>
        </div>
      </header>

      {/* Chipzeile: Textbausteine, Trenner, „+ Befund". Läuft waagerecht,
          statt umzubrechen. Während eines Schreibvorgangs fügt die Leiste
          nichts ein: Das Feld ist dann festgehalten (Zweitreview FRB-EPIC-003). */}
      <div className="border-line nicht-drucken flex shrink-0 items-center gap-2 overflow-x-auto border-b px-4 py-1.5">
        <TextbausteinLeiste
          alsChips
          onEinfuegen={(text, titel) => {
            if (!laeuft) einfuegen(titel, wert, text);
          }}
        />
        {ohneBehandlung ? null : (
          <>
            <span aria-hidden="true" className="bg-line h-6 w-px shrink-0" />
            <Button
              type="button"
              variant={befundOffen ? 'primary' : 'secondary'}
              groesse="kompakt"
              className="shrink-0 whitespace-nowrap"
              aria-expanded={befundOffen}
              aria-controls="befund-streifen"
              onClick={() => setBefundOffen((offen) => !offen)}
            >
              + Befund{anzahlBefund > 0 ? ` · ${anzahlBefund}` : ''}
            </Button>
          </>
        )}
      </div>

      {ohneBehandlung ? null : (
        <BausteinFeld
          streifen={{ offen: befundOffen }}
          bausteine={bausteine}
          onUebernehmen={(text) => einfuegen('Befund aus Bausteinen', wert, text)}
          gesperrt={laeuft}
          meldung={vorschlagOffen && bausteine.text ? VORSCHLAG_OFFEN : undefined}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <form
          noValidate
          className="flex min-w-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!geprueft()) return;
            setSchreibtAbschluss(true);
            void schreiben({
              ausfuehren: abschlussSchreiben,
              fehlertitel: 'Nicht festgeschrieben',
              danach: () =>
                weiterZumTermin(
                  ohneBehandlung
                    ? 'Mit Vermerk festgeschrieben. Der Termin ist abgeschlossen.'
                    : 'Eintrag als Version 1 festgeschrieben. Der Termin ist abgeschlossen.',
                ),
            }).finally(() => setSchreibtAbschluss(false));
          }}
        >
          {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018, ADR-018
              Fassung 3 Punkt 9) als eine Zeile: eine Feststellung, kein
              Bedienelement - wer sich vertan hat, geht zurück. */}
          {ohneBehandlung ? (
            <p className="bg-warnung-soft text-warnung shrink-0 px-4 py-2 text-sm">
              <span aria-hidden="true">! </span>
              Vermerk: Tür geöffnet, Behandlung auf Angabe der Patient:in nicht durchgeführt. Kein
              Ausfallhonorar.
            </p>
          ) : null}

          {/* Hat sich der Stand geändert, während hier geschrieben wurde, bleibt
              das Feld stehen und sagt es (DOK-B01). */}
          {wechsel ? (
            <Statusmeldung ton="warnung" className="shrink-0 px-4 py-2">
              {statuswechselText(wechsel, geaendert)}
            </Statusmeldung>
          ) : null}

          {/* Der Fehler steht über dem Feld, nicht darunter (Abschnitt 6a). */}
          {fehler ? (
            <p
              id={fehlerId}
              role="alert"
              className="text-danger bg-danger-soft shrink-0 px-4 py-2 text-sm font-semibold"
            >
              <span aria-hidden="true">× </span>
              {fehler}
            </p>
          ) : null}

          <label htmlFor={feldId} className="sr-only">
            Eintrag zur Behandlung
          </label>
          <textarea
            id={feldId}
            value={wert}
            aria-invalid={fehler ? true : undefined}
            aria-describedby={fehler ? fehlerId : undefined}
            // Während des Festschreibens unveränderlich: Was festgeschrieben
            // wird, muss genau das sein, was auf dem Bildschirm stand (FIX-014).
            readOnly={schreibtAbschluss}
            className="text-ink placeholder:text-ink-muted min-h-40 w-full flex-1 resize-none border-0 bg-transparent px-4 py-3.5 text-base leading-[1.55] focus:outline-none focus-visible:outline-none"
            onChange={(event) => {
              setEntwurf(event.target.value);
              vergessen();
              if (fehler) setFehler(undefined);
            }}
          />

          <div className="shrink-0 px-4 empty:hidden">
            <Einfuegemeldung
              einfuegung={letzte && letzte.nachher === wert ? letzte : null}
              gesperrt={laeuft}
              onRueckgaengig={rueckgaengig}
            />
          </div>

          {/* Die Folge des Festschreibens für Vorlesesoftware: Der Knopf heißt
              nach dem, was er tut (ADR-016 Punkt 4); dass der Termin damit als
              durchgeführt gilt, hört man mit (DOK-20). */}
          <p id={folgeId} className="sr-only">
            Schreibt den Eintrag als Version 1 fest; der Termin gilt damit als durchgeführt. Danach
            nur mit Begründung änderbar.
          </p>

          {/* Fußleiste: bleibt beim Scrollen stehen, am Telefon über der
              Tableiste. Fehler und Rückfrage des Schutzes stehen als Zeile
              darüber (ANN-046). */}
          <div className="bg-surface sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 shrink-0 sm:bottom-0">
            {schutz}
            <div className="border-line flex items-center gap-2 border-t px-3 py-2">
              <Button
                type="button"
                variant="secondary"
                groesse="kompakt"
                aria-expanded={verlaufOffen}
                aria-controls="bisherige-eintraege-blatt"
                onClick={() => setVerlaufOffen((offen) => !offen)}
              >
                Verlauf{verlaufAnzahl !== null ? ` (${verlaufAnzahl})` : ''}
                <span aria-hidden="true">{verlaufOffen ? '▾' : '▴'}</span>
              </Button>
              <Button
                type="button"
                variant="quiet"
                groesse="kompakt"
                className="ml-auto"
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
                {laeuft && !schreibtAbschluss ? 'Wird gespeichert …' : 'Entwurf'}
              </Button>
              <Button type="submit" groesse="kompakt" disabled={laeuft} aria-describedby={folgeId}>
                {schreibtAbschluss
                  ? 'Wird festgeschrieben …'
                  : ohneBehandlung
                    ? 'Mit Vermerk festschreiben'
                    : 'Festschreiben'}
              </Button>
            </div>
          </div>
        </form>

        {/* Bisherige Einträge: am Telefon ein Blatt von unten über der
            Tableiste, ab 640 px eine Spalte rechts. Eingehängt erst, wenn
            jemand sie öffnet - dann liest der Server und protokolliert. */}
        {verlaufOffen && appointment.patient_id ? (
          <div
            id="bisherige-eintraege-blatt"
            className="bg-surface border-line-strong max-sm:rounded-t-card sm:border-line fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 flex max-h-[62dvh] flex-col border-t sm:static sm:z-auto sm:max-h-none sm:w-[clamp(240px,32%,320px)] sm:shrink-0 sm:border-t-0 sm:border-l"
          >
            <BisherigeEintraege
              patientId={appointment.patient_id}
              appointmentId={appointment.id}
              zurAkte={mitRueckweg(`/patienten/${appointment.patient_id}/verlauf`, hierher)}
              onAnzahl={setVerlaufAnzahl}
              onSchliessen={() => setVerlaufOffen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** „Do 01.10." - Wochentag kurz, Tag und Monat, in der Zeit der Praxis. */
function kurzesDatum(iso: string, zone: string): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: zone,
  }).formatToParts(new Date(iso));
  const wert = (art: Intl.DateTimeFormatPartTypes) =>
    teile.find((teil) => teil.type === art)?.value ?? '';
  return `${wert('weekday').replace('.', '')} ${wert('day')}.${wert('month')}.`;
}

/** Was die Seite zeigt - den Abschluss oder einen Zustand, der ihn ausschließt. */
type Abschlusszustand =
  'abschluss' | Extract<Statuswechsel, 'abgesagt' | 'finalisiert' | 'nicht-angetroffen'>;

function zustandFuer(appointment: Appointment, note: TreatmentNote | null): Abschlusszustand {
  if (appointment.status === 'cancelled') return 'abgesagt';
  // Zu einem nicht angetroffenen Termin entsteht keine Dokumentation
  // (ADR-018); seit `/dokumentation` hierher führt, sagt es diese Seite.
  if (!note && appointment.status === 'no_show') return 'nicht-angetroffen';
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
      verweigert="Behandlungsdokumentation schreiben dürfen Therapeut:innen und Teamleitung."
      eigenerKopf
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

        if (zustand === 'nicht-angetroffen') {
          return (
            <EmptyState
              title="Nicht angetroffen"
              description="Zu einem nicht angetroffenen Termin entsteht keine Behandlungsdokumentation. War das ein Irrtum, zuerst am Termin „Termin wieder öffnen“."
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
