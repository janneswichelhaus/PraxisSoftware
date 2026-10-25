import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Aktionsleiste } from '@/components/ui/Aktionsleiste';
import { symbolknopfKlassen } from '@/components/ui/buttonStile';
import { EmptyState } from '@/components/ui/Feedback';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import {
  type Abrechnungslage,
  type Appointment,
  fetchAbrechnungslage,
  positionText,
} from '@/features/appointments';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BausteinFeld } from '@/features/assessments/BausteinFeld';
import { useBausteinAuswahl } from '@/features/assessments/bausteinauswahl';
import { VORSCHLAG_OFFEN } from '@/features/assessments/dokumentationstext';
import { canWriteTreatmentNote, type CurrentUser } from '@/features/session/types';
import { BisherigeEintraege } from './BisherigeEintraege';
import { AufGeraetSichern } from '@/features/offline-documentation/AufGeraetSichern';
import { DocumentationShell } from './DocumentationShell';
import { Einfuegemeldung } from './Einfuegemeldung';
import { useEinfuegen } from './einfuegen';
import { statuswechselText, type Statuswechsel } from './format';
import { useTextverlustschutz } from '@/app/Textverlustschutz';
import { TextbausteinLeiste } from './TextbausteinLeiste';
import { entwurfMeldung, useGesicherteBefundangaben } from './befundangaben';
import { BereitsFinalisiert, TextUebernehmen } from './Zustaende';
import { Danach } from './Danach';
import { WieZuletzt } from './WieZuletzt';
import { useTextUebernahme } from './uebernahme';
import { DIKTAT_TITEL, useDiktat } from './diktat';
import { Sprechleiste, VorschlagAusAufnahme } from './Spracheingabe';
import { useIstVerbunden } from '@/app/verbindung';
import {
  completeTreatment,
  createTreatmentNote,
  inhaltFehler,
  inhaltMitVermerk,
  VERMERK_OHNE_BEHANDLUNG,
  istDauerhafterSchreibfehler,
  wieGespeichert,
  updateTreatmentNote,
  type TreatmentNote,
} from './api';
import { formatLocalTimeRange } from '@/lib/datum';
import { patientName } from '@/lib/termin';

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
  besitzer,
  appointment,
  note,
  ohneBehandlung,
  zumTermin,
  eingehend,
  inzwischen,
  onFestgeschrieben,
}: {
  /** Das eigene Konto - für die Ablage auf dem Diensttelefon (OFF-003). */
  besitzer: string;
  appointment: Appointment;
  note: TreatmentNote | null;
  /** Hausbesuch-Szenario 1: Tür geöffnet, Behandlung nicht durchgeführt. */
  ohneBehandlung: boolean;
  /** Ziel für „Abbrechen“ und nach dem Schreiben: der Termin samt Rückweg (DOK-01). */
  zumTermin: string;
  /** Der mitgereiste Rückweg; er reist zur Übernahme mit (DOK-01). */
  eingehend: string;
  /** Was sich geändert hat, seit die Seite offen ist (DOK-B01). */
  inzwischen: Statuswechsel | undefined;
  /**
   * Nach dem Festschreiben bleibt die Seite stehen und zeigt „Danach“
   * (Auftrag C1); bis dahin ging es mit der Meldung zurück zum Termin.
   */
  onFestgeschrieben: (meldung: string) => void;
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
  // „Wie zuletzt“ ohne Ergebnis (K6): eine Zeile unter der Chipreihe.
  const [zuletztHinweis, setZuletztHinweis] = useState<string | null>(null);

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
  // Angaben in den Bausteinen, die noch nicht gesichert sind, sind
  // ungespeicherte Arbeit wie getippter Text (§13, FRB-003b). Gesichert werden
  // sie getrennt vom Entwurf, nie in seinen Text (ABN-015, ANN-120).
  const befund = useGesicherteBefundangaben(appointment.id, bausteine, !ohneBehandlung);
  // Gemessen am Stand, wie der Server ihn speichert (Zweitreview UX-EPIC-007).
  const textGeaendert = wieGespeichert(wert) !== wieGespeichert(gespeichert);
  const geaendert = textGeaendert || befund.ungesichert;
  const [vorschlagOffen, setVorschlagOffen] = useState(false);
  const { letzte, einfuegen, rueckgaengig, vergessen } = useEinfuegen(feldId, setEntwurf);
  // Spracheingabe (BEF-153, 6.3): nicht am Vermerk „ohne Behandlung“ - dort
  // wird nichts behandelt, also auch nichts diktiert.
  const diktat = useDiktat({ terminId: appointment.id, aktiv: !ohneBehandlung });
  const verbunden = useIstVerbunden();

  // Der Text, wie er in diesem Augenblick im Feld steht - nicht der von
  // vorhin. Ein Schreibvorgang dauert (FIX-014).
  const wertRef = useRef(wert);
  wertRef.current = wert;
  const gespeichertRef = useRef(gespeichert);
  gespeichertRef.current = gespeichert;

  /**
   * Nur den Entwurf sichern - ohne Abschluss und ohne Seitenwechsel.
   *
   * Derselbe Weg, den „Nur als Entwurf speichern" nimmt, und der Weg, den der
   * Navigationsschutz anbietet. Ausdrücklich **nicht** `completeTreatment`:
   * Ein Seitenwechsel darf keinen Termin abschließen und keine Dokumentation
   * festschreiben (ADR-016, ADR-018).
   */
  async function entwurfSichern(): Promise<boolean> {
    // Ein nicht übernommener Vorschlag geht **nicht** in den Entwurf - auch
    // nicht über die Rückfrage des Navigationsschutzes: Der Entwurf kann von
    // selbst festgeschrieben werden (ADR-016 Punkt 7). Seine Angaben sichert
    // `befund` daneben, bis die Person übernimmt oder verwirft (ABN-015,
    // BEF-103 Punkt 1, ANN-120 Fassung 2).
    const zuSichern = wertRef.current;
    if (wieGespeichert(zuSichern) !== wieGespeichert(gespeichertRef.current)) {
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
        // Den Stand nachladen statt zum Neuladen aufzufordern (BEF-056): Ist
        // der Eintrag inzwischen finalisiert, bietet die Seite die Übernahme
        // als Nachtrag oder Korrektur an. Der Text bleibt im Feld.
        await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
        throw error;
      }
    }
    if (befund.ungesichert) await befund.sichern();
    await queryClient.invalidateQueries({ queryKey: ['treatment-note', appointment.id] });
    return wieGespeichert(wertRef.current) === wieGespeichert(zuSichern);
  }

  // Die Meldung gilt dem Vorschlag, der sie ausgelöst hat; ist er übernommen
  // oder verworfen, verschwindet sie, statt beim nächsten wieder zu stehen.
  useEffect(() => {
    if (!bausteine.text) setVorschlagOffen(false);
  }, [bausteine.text]);

  const wechsel = inzwischen && !selbstAbgeschlossen.current ? inzwischen : undefined;

  const { freigeben, laeuft, schreiben, schutz, sicherungsstand } = useTextverlustschutz({
    ungespeichert: geaendert,
    speichern: entwurfSichern,
    // Aufnahme und Vorschlag lassen sich nicht speichern (ADR-016 Punkt 10):
    // Der Schutz fragt auch für sie, sichert sie aber nie.
    nichtSicherbar: ohneBehandlung ? undefined : diktat.offen,
    kompakt: true,
    // Von selbst gesichert wird nur der Text einer Behandlung (BEF-056,
    // ANN-319). Am Vermerk „Tür geöffnet, nicht behandelt“ nicht: Ein so
    // entstandener Entwurf trüge den Vermerk nicht, und mit der Frist würde
    // er als gewöhnliche Behandlung festgeschrieben (ADR-016 Punkt 7) - der
    // Vermerk entsteht nur mit „Mit Vermerk festschreiben“ (ANN-055).
    selbst: ohneBehandlung
      ? undefined
      : {
          stand: wert,
          aussetzenBei: istDauerhafterSchreibfehler,
          bereit:
            !wechsel && !schreibtAbschluss && (!textGeaendert || inhaltFehler(wert) === undefined),
        },
  });

  const uebernahme = useTextUebernahme({
    appointmentId: appointment.id,
    note,
    eingehend,
    wertRef,
    setFehler,
    schutz: { schreiben, freigeben },
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
    try {
      await completeTreatment(
        appointment.id,
        ohneBehandlung ? inhaltMitVermerk(wertRef.current) : wertRef.current,
        appointment.updated_at,
        note?.updated_at ?? null,
        ohneBehandlung,
      );
    } catch (error) {
      // Termin und Eintrag nachladen statt zum Neuladen aufzufordern
      // (BEF-056): Das nächste Festschreiben beruht dann auf dem neuen Stand.
      await nachSchreiben();
      throw error;
    }
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
    if (diktat.wartet) {
      diktat.hinweisen();
      return false;
    }
    if (bausteine.text) {
      setVorschlagOffen(true);
      setBefundOffen(true);
      return false;
    }
    // Am Vermerk darf das Feld leer bleiben; dann steht der Vermerk im
    // Eintrag (ANN-565).
    const meldung = inhaltFehler(ohneBehandlung ? inhaltMitVermerk(wert) : wert);
    setFehler(meldung);
    return meldung === undefined;
  }

  // Der Pfeil führt dorthin, woher die Seite kam - sonst zum Termin. Er läuft
  // wie jeder Weg hinaus durch den Textverlustschutz.
  const zurueck = leseRueckweg(suche, zumTermin);
  const kopfzeile = kopfzeileFuer(appointment, lage, ohneBehandlung);
  const hierher = mitRueckweg(`/termine/${appointment.id}/abschluss`, zurueck);
  const anzahlBefund = Object.keys(bausteine.auswahl).length;

  // ANN-521: Solange das Feld leer ist und nichts offen ist, ist „Sprechen“
  // der Hauptknopf der Seite (der bevorzugte Weg, BEF-153), „Festschreiben“
  // steht sekundär daneben. Steht Text im Feld, ist „Festschreiben“ wieder
  // Hauptknopf und „Sprechen“ sekundär. Während Aufnahme und Vorschlag trägt
  // deren Leiste den Hauptknopf („Fertig“, „Erneut senden“, „In die Doku
  // übernehmen“) - ein Hauptknopf je Ansicht (DESIGN.md Regel 4). Nach einer
  // Meldung (etwa: Mikrofon gesperrt) führt der Hauptknopf nicht wieder
  // dorthin.
  const sprechenHaupt =
    diktat.verfuegbar &&
    verbunden &&
    diktat.ruhig &&
    diktat.meldung === undefined &&
    wert.trim() === '' &&
    !bausteine.text;
  const festschreibenHaupt = !sprechenHaupt && diktat.ruhig;

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

      {/* Chipzeile: „Wie zuletzt“ | „+ Befund“ | die eigenen Textbausteine
          bzw. „Eigene Bausteine anlegen“. Läuft waagerecht, statt
          umzubrechen - „+ Befund“ steht deshalb vorn und bei 375 px ganz im
          Bild, die Bausteine sind beliebig viele (B5). Laden sie nicht, fällt
          der Trenner am Ende weg (`last:hidden`). Während eines
          Schreibvorgangs fügt die Leiste nichts ein: Das Feld ist dann
          festgehalten (Zweitreview FRB-EPIC-003). */}
      <div className="border-line nicht-drucken flex shrink-0 items-center gap-2 overflow-x-auto border-b px-4 py-1.5">
        {/* K6: der letzte Eintrag als Ausgangspunkt, vorn in der Reihe
            (ANN-502). Nicht am Vermerk „ohne Behandlung“. */}
        {!ohneBehandlung && appointment.kind === 'therapy' ? (
          <>
            <WieZuletzt
              appointmentId={appointment.id}
              gesperrt={laeuft}
              onUebernehmen={(titel, text) => einfuegen(titel, wert, text)}
              onHinweis={setZuletztHinweis}
            />
            <span aria-hidden="true" className="bg-line h-6 w-px shrink-0 last:hidden" />
          </>
        ) : null}
        {ohneBehandlung ? null : (
          <>
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
            <span aria-hidden="true" className="bg-line h-6 w-px shrink-0 last:hidden" />
          </>
        )}
        <TextbausteinLeiste
          alsChips
          onEinfuegen={(text, titel) => {
            if (!laeuft) einfuegen(titel, wert, text);
          }}
        />
      </div>

      {zuletztHinweis ? (
        <p role="status" className="border-line text-ink-muted shrink-0 border-b px-4 py-2 text-sm">
          {zuletztHinweis}
        </p>
      ) : null}

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
              danach: () => {
                freigeben();
                // B4 (BEF-154): Festschreiben hakt nicht ab - abgehakt wird
                // in der Übersicht oder im Kalender.
                onFestgeschrieben(
                  ohneBehandlung
                    ? 'Mit Vermerk festgeschrieben.'
                    : 'Eintrag als Version 1 festgeschrieben.',
                );
              },
            }).finally(() => setSchreibtAbschluss(false));
          }}
        >
          {/* Der Pflichtvermerk aus Hausbesuch-Szenario 1 (CAL-018, ADR-018
              Fassung 3 Punkt 9) als eine Zeile: eine Feststellung, kein
              Bedienelement - wer sich vertan hat, geht zurück. */}
          {ohneBehandlung ? (
            <p className="bg-warnung-soft text-warnung shrink-0 px-4 py-2 text-sm">
              <span aria-hidden="true">! </span>
              Vermerk: {VERMERK_OHNE_BEHANDLUNG} Kein Ausfallhonorar. Ein Eintrag ist nicht nötig.
            </p>
          ) : null}

          {/* Hat sich der Stand geändert, während hier geschrieben wurde, bleibt
              das Feld stehen und sagt es (DOK-B01). */}
          {wechsel ? (
            <Statusmeldung ton="warnung" className="shrink-0 px-4 py-2">
              {statuswechselText(wechsel, geaendert)}
            </Statusmeldung>
          ) : null}

          {/* Der Text findet einen Weg in die Akte (BEF-056). */}
          {wechsel === 'finalisiert' && textGeaendert && note ? (
            <div className="shrink-0 px-4 py-2">
              <TextUebernehmen
                className=""
                nachtragMoeglich
                gesperrt={laeuft}
                onNachtrag={uebernahme.alsNachtrag}
                onKorrektur={uebernahme.inKorrektur}
              />
            </div>
          ) : null}

          {/* OFF-003: ohne Verbindung auf dem Diensttelefon sichern (ADR-024
              Punkt 6). Nicht am Vermerk: Er entsteht ohne Netz nicht (ANN-362). */}
          {!ohneBehandlung && textGeaendert ? (
            <AufGeraetSichern
              besitzer={besitzer}
              terminId={appointment.id}
              kopf={{
                beginn: appointment.starts_at,
                ende: appointment.ends_at,
                zeitzone: zone,
                name: patientName(appointment),
                terminart: appointment.appointment_type,
              }}
              text={wert}
              onGesichert={() => {
                freigeben();
                void navigate('/auf-dem-geraet');
              }}
            />
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

          {/* Der Vorschlag aus der Aufnahme über dem Feld; erst „In die Doku
              übernehmen“ fügt ihn ein (ANN-520). */}
          <VorschlagAusAufnahme
            diktat={diktat}
            gesperrt={laeuft}
            onUebernehmen={(text) => einfuegen(DIKTAT_TITEL, wert, text)}
          />

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
            placeholder={ohneBehandlung ? 'Anmerkung, wenn nötig' : undefined}
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
              onRueckgaengig={() => {
                // Zurück vor die Übernahme heißt: der Vorschlag steht wieder
                // zum Prüfen da, statt verloren zu sein.
                if (letzte?.titel === DIKTAT_TITEL) diktat.zurueckholen();
                rueckgaengig();
              }}
            />
          </div>

          {/* Die Folge des Festschreibens für Vorlesesoftware: Der Knopf heißt
              nach dem, was er tut (ADR-016 Punkt 4), die Folge hört man mit
              (DOK-20). Seit B4 hakt das Festschreiben den Termin nicht ab. */}
          <p id={folgeId} className="sr-only">
            Schreibt den Eintrag als Version 1 fest; abgehakt wird der Termin getrennt. Danach nur
            mit Begründung änderbar.
          </p>

          {/* Fußleiste: bleibt beim Scrollen stehen, am Telefon über der
              Tableiste. Fehler des Schutzes stehen als Zeile
              darüber (ANN-046). */}
          <Aktionsleiste
            einbettung="flaeche"
            oben={
              <>
                {ohneBehandlung ? null : (
                  <Sprechleiste diktat={diktat} haupt={sprechenHaupt} verbunden={verbunden} />
                )}
                {sicherungsstand}
                {schutz}
              </>
            }
          >
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
              disabled={laeuft || diktat.beschaeftigt || !geaendert}
              onClick={() => {
                // Ein Vorschlag aus der Aufnahme lässt sich nicht sichern: Er
                // hält den Entwurf an, bis er übernommen oder verworfen ist.
                if (diktat.wartet) {
                  diktat.hinweisen();
                  return;
                }
                // Ein nicht übernommener Vorschlag hält den Entwurf nicht an:
                // Er geht nicht in den Text, seine Angaben werden daneben
                // gesichert (ABN-015).
                if (textGeaendert) {
                  const meldung = inhaltFehler(wert);
                  setFehler(meldung);
                  if (meldung) return;
                }
                const meldung = entwurfMeldung(textGeaendert, bausteine.text !== '');
                void schreiben({
                  ausfuehren: entwurfSichern,
                  fehlertitel: 'Nicht gespeichert',
                  danach: () => weiterZumTermin(meldung),
                });
              }}
            >
              {laeuft && !schreibtAbschluss ? 'Wird gespeichert …' : 'Entwurf'}
            </Button>
            <Button
              type="submit"
              variant={festschreibenHaupt ? 'primary' : 'secondary'}
              groesse="kompakt"
              disabled={laeuft || diktat.beschaeftigt}
              aria-describedby={folgeId}
            >
              {schreibtAbschluss
                ? 'Wird festgeschrieben …'
                : ohneBehandlung
                  ? 'Mit Vermerk festschreiben'
                  : 'Festschreiben'}
            </Button>
          </Aktionsleiste>
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
              zurAkte={mitRueckweg(`/patienten/${appointment.patient_id}/doku`, hierher)}
              onAnzahl={setVerlaufAnzahl}
              onSchliessen={() => setVerlaufOffen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Die Zeile unter dem Namen: was, Tag, Uhrzeit, „Termin n von m“. */
function kopfzeileFuer(
  appointment: Appointment,
  lage: Abrechnungslage | null | undefined,
  ohneBehandlung: boolean,
): string {
  const zone = appointment.organization_time_zone;
  return [
    ohneBehandlung ? 'Ohne Behandlung' : 'Dokumentation',
    kurzesDatum(appointment.starts_at, zone),
    formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone),
    lage ? positionText(lage) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * „Danach“ mit dem Kopf der Schreibseite (Auftrag C1) - nach dem eigenen
 * Festschreiben mit der Meldung, sonst unter „Bereits finalisiert“.
 */
function DanachSeite({
  user,
  appointment,
  meldung,
  kopf,
  ohneBehandlung,
  zumTermin,
}: {
  user: CurrentUser;
  appointment: Appointment;
  meldung: string | null;
  kopf?: ReactNode;
  ohneBehandlung: boolean;
  zumTermin: string;
}) {
  const [suche] = useSearchParams();
  const { data: lage } = useQuery({
    queryKey: ['appointment', appointment.id, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(appointment.id),
    enabled: appointment.kind === 'therapy',
    retry: false,
  });
  const zurueck = leseRueckweg(suche, zumTermin);
  return (
    <Danach
      user={user}
      appointment={appointment}
      kopfzeile={kopfzeileFuer(appointment, lage, ohneBehandlung)}
      kopf={kopf}
      meldung={meldung}
      ohneBehandlung={ohneBehandlung}
      zurueck={zurueck}
      zumTermin={zumTermin}
      hierher={mitRueckweg(`/termine/${appointment.id}/abschluss`, zurueck)}
    />
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
  // Nach dem eigenen Festschreiben: die Meldung, unter der „Danach“ steht.
  const [festgeschrieben, setFestgeschrieben] = useState<{
    termin: string;
    meldung: string;
  } | null>(null);

  return (
    <DocumentationShell
      appointmentId={appointmentId}
      darf={canWriteTreatmentNote(user.roles)}
      verweigert="Behandlungsdokumentation schreiben dürfen Therapeut:innen und Teamleitung."
      eigenerKopf
    >
      {({ appointment, dokumentation, eingehend, zumTermin }) => {
        const ohneBehandlung =
          // Der Vermerk gilt am Hausbesuch (ANN-055). Ein verstellter
          // Parameter an einem Praxistermin fällt hier still weg, statt in
          // eine Fehlermeldung des Servers zu laufen; verbindlich weist der
          // Server ihn ohnehin ab.
          ohneBehandlungGewaehlt && appointment.appointment_type === 'home_visit';

        if (festgeschrieben?.termin === appointment.id) {
          return (
            <DanachSeite
              user={user}
              appointment={appointment}
              meldung={festgeschrieben.meldung}
              ohneBehandlung={ohneBehandlung}
              zumTermin={zumTermin}
            />
          );
        }

        const zustand = zustandFuer(appointment, dokumentation.primary);
        const warAbschluss =
          ausgangslage.current?.termin === appointment.id && ausgangslage.current.abschluss;
        const abschluss = zustand === 'abschluss' || warAbschluss;
        ausgangslage.current = { termin: appointment.id, abschluss };

        if (abschluss) {
          return (
            <Abschluss
              besitzer={user.profile.id}
              key={appointment.id}
              appointment={appointment}
              note={dokumentation.primary}
              ohneBehandlung={ohneBehandlung}
              zumTermin={zumTermin}
              eingehend={eingehend}
              inzwischen={zustand === 'abschluss' ? undefined : zustand}
              onFestgeschrieben={(meldung) =>
                setFestgeschrieben({ termin: appointment.id, meldung })
              }
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

        if (!dokumentation.primary) return null;
        // Derselbe Zustand heißt überall gleich: „Bereits finalisiert“ (DOK-08).
        const finalisiert = (
          <BereitsFinalisiert
            appointmentId={appointment.id}
            eintrag={dokumentation.primary}
            eingehend={eingehend}
            kompakt={appointment.kind === 'therapy'}
          />
        );
        // Am Behandlungstermin steht darunter, was nach dem Festschreiben noch
        // zu tun ist (Auftrag C1) - so führt „Heilmittel offen“ aus der
        // Übersicht hierher.
        return appointment.kind === 'therapy' ? (
          <DanachSeite
            user={user}
            appointment={appointment}
            meldung={null}
            kopf={finalisiert}
            ohneBehandlung={dokumentation.primary.visit_without_treatment}
            zumTermin={zumTermin}
          />
        ) : (
          finalisiert
        );
      }}
    </DocumentationShell>
  );
}
