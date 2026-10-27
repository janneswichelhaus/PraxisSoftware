import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { ProgressDots } from '@/components/ui/ProgressDots';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { Textlink } from '@/components/ui/Textlink';
import { mitRueckweg } from '@/lib/rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Zweispalter } from '@/components/ui/Zweispalter';
import {
  type CalendarEntry,
  dokumentiertOhneHaken,
  fetchAbrechnungslage,
  fetchAppointments,
  FreigabeNachHaken,
  hakenFehlt,
  hakenZuruecknehmbar,
  NavigationZumTermin,
  positionText,
  TerminAbschliessenKnopf,
} from '@/features/calendar/appointments';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canReadPatientDirectory,
  canWriteTrainingClients,
  isTherapyStaff,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  isStaff,
  type CurrentUser,
} from '@/features/core';
import { nachUhrzeit, TAGESPLAN_VORHALTEDAUER_MS } from './api';
import { Tageskarte } from './Tagesliste';
import { AnrufKnopf, AusfallKnopf, HakenRueckgaengig, SpaeterDa } from './Besuchsknoepfe';
import { ausfallMoeglich, dokuZiel } from './besuchswege';
import { Nachzuholen, NochOffen } from './NochOffen';
import { TagesplanDruck } from './TagesplanDruck';
import { CheckupErinnerung } from '@/features/fleet';
import { Zeitstrahl } from './Zeitstrahl';
import { Wochenleiste } from './Wochenleiste';
import { fensterTage, kopfDatum, terminAnzahl } from './wochenfenster';
import { Tageskacheln, type Abfahrt } from './Tageskacheln';
import { MorgenVorschau } from './MorgenVorschau';
import { travelPlan } from '@/components/ui/travelPlan';
import { useTagesfahrzeiten } from './fahrzeiten';
import { TagesWort, bezugszeitpunkt, gewaehlterTag, tagesWort } from './tageswahl';
import { navigationsZiel } from '@/lib/location/navigation';
import {
  besuchsphase,
  besucheDesTages,
  hausbesucheDesTages,
  bisBeginn,
  fokusDesTages,
  hakenUndDokuText,
  fortschrittText,
  liegeHeute,
  naechsterWeg,
  nichtAbgeschlossen,
  stehtAus,
  tagesfortschritt,
  terminName,
  VERALTET_TEXT,
  wegeDesTages,
  wegZumBesuch,
  type Fokus,
  type NaechsterWeg,
} from './tagesstart';
import { TagesrouteAufklapper } from '@/features/calendar/tours/TagesrouteAufklapper';
import { OpenPointsSummary, useBarometerHinweise } from '@/features/workplace';
import { OPEN_INTAKES_KEY, fetchOpenIntakes } from '@/features/patients';
import { REJECTED_TIME_OFF_KEY, fetchRejectedTimeOff } from '@/features/workforce';
import { HinweisZwischendurch } from './HinweisZwischendurch';
import { formatLocalDate, formatLocalTime, todayInTimeZone, tagePlus } from '@/lib/datum';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  terminBezeichnung,
  staffName,
  terminPfad,
} from '@/lib/termin';
import { Laengenzeichen } from '@/components/ui/Laengenzeichen';
import { fetchDayPlan, type DayPlanEntry } from '@/features/calendar/day-plan/api';

/**
 * Übersicht - der persönliche Einstieg.
 *
 * Die Seite beantwortet eine Frage: was ist als Nächstes zu tun. Sie ist
 * deshalb kein Begrüßungsbildschirm mit Kennzahl, sondern der eigene Tag als
 * Zeitstrahl aus echten Terminen und - klar getrennt - den Hinweisen aus den
 * noch nicht angebundenen Bereichen.
 *
 * Seit UX-001 kommen die eigenen Besuche aus einem eigenen, engeren Lesepfad
 * (`list_day_plan`) mit Adresse, Rufnummer und Zugangshinweis, nicht aus dem
 * Kalender. Der Tagesplan des Teams bleibt die Kalenderabfrage - er braucht
 * keine Adressen.
 *
 * Seit dem Design-Handoff vom 2026-10-01 steht der Tag als **Zeitstrahl** da:
 * oben die Liege und der nächste Weg mit seinem Puffer, darunter alle Termine
 * an einer Schiene, der nächste ausgeklappt. Ab 900 px Inhaltsbreite steht
 * der Tagesplan des Teams als Karte rechts daneben, darunter ist er ein
 * Aufklapper unter dem eigenen Tag.
 *
 * Ein Ladefehler bietet hier immer „Erneut versuchen" an, nie ein Neuladen
 * der Seite: Das verwürfe im Funkloch genau die vorgehaltene Tagesliste
 * (ANN-021, ZST-04).
 */

/** Der nächste Schritt nach einem Ladefehler (WRT-01) - ohne Ratefrage. */
const NACH_LADEFEHLER = 'Bitte die Verbindung prüfen und erneut versuchen.';

/**
 * Zweite Zeile im Tagesplan des Teams: wer, dann wo (UEB-06).
 *
 * Die Person steht vorn, weil der Plan zeigen soll, wer wann wo ist - am
 * Telefon kürzt `truncate` das Ende der Zeile, und das war bis UXR-003 genau
 * der Name. Die Terminart steht einmal und nur, wenn sie vom Hausbesuch
 * abweicht (ANN-192); bei Praxisterminen folgt ihr der Standort.
 *
 * Die Kalenderabfrage liefert bewusst keine Besuchsadresse - für die Übersicht
 * über den Tag des Teams ist sie nicht erforderlich (ADR-004,
 * Datenminimierung). Die eigene Tagesliste hat sie.
 */
function personUndOrt(termin: CalendarEntry): string {
  const art = appointmentTypeHint(termin.appointment_type);
  const ort =
    termin.appointment_type === 'practice' && termin.location_name
      ? `${art} ${termin.location_name}`
      : art;
  return ort ? `${staffName(termin)} · ${ort}` : staffName(termin);
}

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function firstName(displayName: string): string {
  return displayName.split(' ')[0] ?? displayName;
}

/** „Donnerstag, 1. Oktober 2026" aus dem Kalendertag der Praxis. */
function langesDatum(tag: string): string {
  return formatLocalDate(`${tag}T12:00:00Z`, 'UTC');
}

const KURZES_DATUM = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** „Dienstag, 13. Okt." - das Datum im Kopf am Telefon (Design-Review R2, U3). */
function kurzesDatum(tag: string): string {
  return KURZES_DATUM.format(new Date(`${tag}T12:00:00Z`));
}

const MONAT_UND_JAHR = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** „Oktober 2026" - über der Wochenleiste, die Wochentag und Tag schon nennt. */
function monatUndJahr(tag: string): string {
  return MONAT_UND_JAHR.format(new Date(`${tag}T12:00:00Z`));
}

/** Richtungszeichen hinter einem Link, nicht Teil seines Namens (WRT-08). */
function Pfeil() {
  return <span aria-hidden="true">→</span>;
}

/**
 * Die laufende Zeit für Jetzt-Marke, Arbeitskarte und den ersten Weg.
 *
 * Ein Zeitpunkt, keine Uhrzeit: Angezeigt wird er immer in der Zeitzone der
 * Praxis (`formatLocalTime`), nie in der des Geräts. Er rückt alle 30
 * Sekunden nach - der Zeitstrahl rechnet in Minuten, und mit dem halben Takt
 * hängt die Marke nie mehr als eine halbe Minute nach.
 */
function useJetzt(): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const takt = window.setInterval(() => setJetzt(Date.now()), 30_000);
    return () => window.clearInterval(takt);
  }, []);
  return jetzt;
}

/**
 * Der Tagesplan des Teams: als Karte in der Kontextspalte, darunter als
 * Aufklapper (Design-Handoff 2026-10-01, Abschnitt 5).
 *
 * Dichte Zeilen mit Statuszeichen statt Abzeichen - in 300 px Breite sprengte
 * ein Abzeichen die Zeile. Laden und Fehler stehen im Aufklapper, an der
 * Stelle der Liste (UEB-05, ZST-18): Davor gelesen, hielt man den Fehler für
 * einen der eigenen Termine.
 */
function Teamplan({
  abfrage,
  heute,
  tagWort,
  zeitzone,
  offen,
  offenAbLg,
}: {
  abfrage: UseQueryResult<CalendarEntry[]>;
  /** Der gezeigte Tag (ANN-234) - meist heute. */
  heute: string;
  /** „Heute", „Morgen", „Am Mi., 7.10." für den Leerzustand. */
  tagWort: string;
  zeitzone: string;
  offen: boolean;
  /** In der Kontextspalte: am Rechner von Anfang an offen. */
  offenAbLg: boolean;
}) {
  const { data, isPending, isError, refetch } = abfrage;
  const alleHeute = [...(data ?? [])].sort(nachUhrzeit);

  return (
    <section>
      {/* Derselbe Aufklapper wie „Nachzuholen" und „Tagesroute" (Design-
          Review R2, U5): Karte, Titel in 600 mit Zähler. */}
      <Disclosure
        inKarte
        kopf="betont"
        offen={offen}
        {...(offenAbLg ? { offenAb: 'lg' as const } : {})}
        {...(data ? { anzahl: alleHeute.length } : {})}
        // Die Überschrift bleibt eine Überschrift: `summary` darf ein
        // Überschriftenelement enthalten, und nur so steht der Block in der
        // Gliederung, die Vorlesesoftware ansteuert (UEB-17).
        summary={<h2>Tagesplan des Teams</h2>}
      >
        {isPending ? (
          <LoadingState label="Tagesplan des Teams wird geladen …" />
        ) : isError ? (
          <ErrorState
            title="Der Tagesplan des Teams konnte nicht geladen werden."
            description={NACH_LADEFEHLER}
            onErneut={() => refetch()}
          />
        ) : alleHeute.length === 0 ? (
          <EmptyState title={`${tagWort} sind keine Termine geplant`} />
        ) : (
          <ListRows rahmen={false}>
            {alleHeute.map((termin) => (
              <ListRow
                key={termin.id}
                dicht
                to={mitRueckweg(terminPfad(termin), '/')}
                zeit={formatLocalTime(termin.starts_at, zeitzone)}
                // Der Tagesplan des Teams liest den Kalender - dort stehen
                // seit CAL-015b auch Fehlzeiten ohne Patient:in.
                titel={terminBezeichnung(termin)}
                meta={personUndOrt(termin)}
                gedaempft={termin.status !== 'confirmed'}
                status={
                  <span className="flex items-center gap-2">
                    {/* §8.1: weder 45 noch 60 Minuten - gekennzeichnet, nicht
                        verboten (CAL-020). */}
                    <Laengenzeichen termin={termin} knapp />
                    {termin.status !== 'confirmed' ? (
                      <StatusMark ton={appointmentStatusTon[termin.status]}>
                        {appointmentStatusLabels[termin.status]}
                      </StatusMark>
                    ) : null}
                  </span>
                }
              />
            ))}
          </ListRows>
        )}
        <Textlink
          alleinstehend
          to={`/kalender?ansicht=tag&datum=${heute}`}
          className="gap-1 text-sm font-semibold"
        >
          Zum Kalender
          <Pfeil />
        </Textlink>
      </Disclosure>
    </section>
  );
}

/** Der nächste Weg als Kachel: späteste Abfahrt, Fahrt, Puffer (`travelPlan`). */
function alsAbfahrt(weg: NaechsterWeg): Abfahrt {
  const plan = travelPlan(weg.von.zeit, weg.bis.zeit, weg.fahrtMin);
  return {
    titel: weg.titel === 'Nächster Weg danach' ? 'Abfahrt danach' : 'Abfahrt',
    zeit: plan.abfahrt,
    fahrtMin: weg.fahrtMin,
    pufferMin: plan.pufferMin,
    stufe: plan.stufe,
  };
}

/** Leere Flächen in Zielgröße, solange die Tagesliste lädt: Liege-Zeile und Wegbalken. */
function Ladegeruest() {
  return (
    <div>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="border-line bg-surface rounded-card h-13 border" />
        <div className="border-line bg-surface rounded-card h-30 border" />
      </div>
      <div className="mt-4">
        <LoadingState label="Tagesliste wird geladen …" />
      </div>
    </div>
  );
}

/**
 * Der eigene Tag: Liege, nächster Weg, Zeitstrahl.
 *
 * „Offen" heißt: der Besuch steht noch aus, oder er ist abgeschlossen und die
 * Dokumentation ist noch nicht finalisiert (siehe `istOffen`). Erledigtes
 * verschwindet nicht - es bleibt an seiner Stelle im Strahl und trägt ein
 * Abzeichen.
 */
function MeinTag({
  abfrage,
  sortiert,
  fokus,
  datum,
  morgen,
  staffMemberId,
  darfDokumentieren,
  darfDokuLesen,
  darfTermine,
  mitBehandlung,
  zeitzone,
  jetzt,
  heute,
  praxis,
}: {
  abfrage: UseQueryResult<DayPlanEntry[]>;
  /** Die Tagesliste nach Uhrzeit; leer, solange nichts geladen ist. */
  sortiert: readonly DayPlanEntry[];
  fokus: Fokus | null;
  datum: string;
  morgen: string;
  staffMemberId: string;
  darfDokumentieren: boolean;
  darfDokuLesen: boolean;
  darfTermine: boolean;
  /** Sieht die Rolle Akten? Sonst fragt die Liste nicht nach Erstaufnahmen (TRN-006). */
  mitBehandlung: boolean;
  zeitzone: string;
  /** Der Bezugszeitpunkt des gezeigten Tags (`bezugszeitpunkt`, ANN-234). */
  jetzt: number;
  /** Der heutige Tag der Praxis - `datum` kann davon abweichen (ANN-234). */
  heute: string;
  /** Der Name der Praxis für die Nachricht „Später da?“ (ANN-476). */
  praxis: string;
}) {
  const { data: termine, isPending, isError, isFetching, dataUpdatedAt, refetch } = abfrage;

  // Eine spätere Zeile klappt in der Übersicht auf, statt in den Kalender zu
  // springen (Auftrag C1). Eine zur Zeit; der Fokus folgt dem Knopf, der an
  // die Stelle des getippten tritt.
  const [offeneZeile, setOffeneZeile] = useState<string | null>(null);
  const fokusNach = useRef<string | null>(null);
  useEffect(() => {
    const ziel = fokusNach.current;
    if (!ziel) return;
    fokusNach.current = null;
    document.querySelector<HTMLElement>(ziel)?.focus();
  }, [offeneZeile]);
  function umschalten(id: string) {
    const zu = offeneZeile === id;
    fokusNach.current = `[data-termin="${id}"] ${zu ? '[data-zeile]' : '[data-zuklappen]'}`;
    setOffeneZeile(zu ? null : id);
  }
  const istHeute = datum === heute;
  const tagWort = tagesWort(datum, heute);

  // Was der Haken bewirkt hat - oder warum nicht (Design-Handoff 2026-10-01,
  // Abschnitt 5a Punkt 4). Steht oben, nimmt den Fokus. Nach dem Haken trägt
  // sie „Rückgängig" (Praxis-Review R2, P1): Ein Fehltipp ließ sich bis dahin
  // nur über Kalender → Termin → „Termin wieder öffnen" zurücknehmen.
  const [meldung, setMeldung] = useState<{
    ton: 'ok' | 'fehler';
    text: string;
    /** Der eben abgehakte Termin - für „Rückgängig". */
    abgehakt?: { id: string; name: string };
  } | null>(null);

  /**
   * Der Haken an einem bestätigten Behandlungstermin (Abschnitt 6a): schließt
   * ab, ohne zu dokumentieren. Die Doku bleibt danach als „Doku offen" stehen.
   */
  function haken(
    termin: DayPlanEntry,
    groesse: 'normal' | 'gross' = 'normal',
    beschriftung?: string,
    variante: 'primary' | 'secondary' = 'secondary',
  ): ReactNode {
    // B4: auch eine festgeschriebene Doku wartet noch auf ihren Haken.
    if (
      !darfTermine ||
      // ERN-012: Die Ernährungsberatung wird abgehakt, auch im Training.
      (termin.kind !== 'therapy' && termin.occasion !== 'nutrition_counselling') ||
      !hakenFehlt(termin.status, termin.checked_at)
    ) {
      return null;
    }
    // Ein künftiger Tag wird nicht abgehakt (ANN-234): Der Besuch war noch nicht.
    if (datum > heute) return null;
    const name = terminName(termin);
    return (
      <TerminAbschliessenKnopf
        appointmentId={termin.id}
        name={name}
        {...(beschriftung ? { beschriftung } : {})}
        variant={variante}
        groesse={groesse}
        onAbgeschlossen={() =>
          setMeldung({
            ton: 'ok',
            text:
              darfDokumentieren &&
              termin.status !== 'documented' &&
              termin.occasion !== 'nutrition_counselling'
                ? `${name} abgeschlossen. Doku offen.`
                : `${name} abgeschlossen.`,
            abgehakt: { id: termin.id, name },
          })
        }
        onFehler={(text) => setMeldung({ ton: 'fehler', text })}
      />
    );
  }

  /**
   * Wohin „Doku" an Karte und Zeile führt - nach der Phase des Besuchs
   * (`dokuZiel`, Auftrag C1): vor dem Besuch in die Akte, ab dem Beginn und bei
   * offener Doku auf die Schreibseite, festgeschrieben zum Eintrag. Abgesagt
   * und nicht angetroffen bekommen keinen Knopf: Zu ihnen entsteht keine
   * Dokumentation (ADR-018).
   */
  function dokuFuer(termin: DayPlanEntry): string | null {
    const mitDoku =
      termin.kind === 'therapy' &&
      termin.occasion !== 'nutrition_counselling' &&
      termin.patient_id !== null &&
      (darfDokuLesen || darfDokumentieren) &&
      termin.status !== 'cancelled' &&
      termin.status !== 'no_show';
    return mitDoku ? dokuZiel(termin, jetzt, darfDokumentieren) : null;
  }

  /**
   * „Ausfall“ an jeder Behandlung, die begonnen hat und keine Doku hat (B12,
   * `ausfallMoeglich`) - an der Zeile, in der aufgeklappten Karte und an der
   * Karte des nächsten Wegs. Nur für die Rollen der Terminverwaltung;
   * verbindlich prüft der Server (`record_no_show`).
   */
  function ausfall(termin: DayPlanEntry, ort: 'zeile' | 'karte' | 'tuer'): ReactNode {
    if (!darfTermine || !ausfallMoeglich(termin, jetzt)) return null;
    return (
      <AusfallKnopf termin={termin} ort={ort} melden={(text) => setMeldung({ ton: 'ok', text })} />
    );
  }

  /**
   * Die Knöpfe einer Zeile (Leitfaden L3, Jannes 2026-10-06): „Doku" an jedem
   * Behandlungstermin, auch nach dem Abschließen und Festschreiben - erledigt
   * heißt nicht unerreichbar. Daneben der Haken, solange ein vorbeigegangener
   * Besuch nicht abgehakt ist; sonst der Anruf (Auftrag C1). Einen späteren
   * Besuch hakt niemand vorab ab - an seiner Zeile steht deshalb das Telefon.
   */
  function zeilenAktionen(termin: DayPlanEntry): ReactNode {
    const doku = dokuFuer(termin);
    // B4: Ist die Doku festgeschrieben, steht der Haken gleich da - auch
    // bevor die Zeit des Besuchs um ist (Kernablauf K5).
    const hakenDa =
      nichtAbgeschlossen(termin, jetzt) ||
      (termin.kind === 'therapy' && dokumentiertOhneHaken(termin.status, termin.checked_at));
    const zweites = hakenDa ? (
      haken(termin)
    ) : termin.kind === 'internal' ? null : (
      <AnrufKnopf termin={termin} />
    );
    if (!doku && !zweites) return null;
    return (
      <>
        {doku ? (
          <ButtonLink to={doku} variant="secondary" groesse="kompakt" className="shrink-0">
            Doku{' '}
            <span className="sr-only">
              zum Termin um {formatLocalTime(termin.starts_at, zeitzone)} Uhr
            </span>
          </ButtonLink>
        ) : null}
        {zweites}
      </>
    );
  }

  /**
   * „Doku" als Knopf - der zugängliche Name beginnt mit dem sichtbaren Wort,
   * damit auch die Sprachsteuerung „Doku" trifft (UEB-10, WCAG 2.5.3).
   */
  function dokuKnopf(
    termin: DayPlanEntry,
    variante: 'primary' | 'secondary',
    klassen: string,
  ): ReactNode {
    const ziel = dokuFuer(termin);
    return ziel ? (
      <ButtonLink
        to={ziel}
        variant={variante}
        groesse={variante === 'secondary' ? 'kompakt' : 'normal'}
        className={klassen}
      >
        Doku <span className="sr-only">zu diesem Termin</span>
      </ButtonLink>
    ) : null;
  }

  /**
   * Eine Reihe: „Doku" so breit wie möglich, daneben Symbolknöpfe - 12 px
   * auseinander, der Haken zuletzt (Praxis-Review R2, P1).
   */
  function knopfreihe(doku: ReactNode, symbole: ReactNode[]): ReactNode {
    const da = symbole.filter(Boolean);
    if (!doku && da.length === 0) return null;
    return (
      <div className="flex items-center gap-3">
        {doku}
        {da}
      </div>
    );
  }

  /**
   * Den Haken zurücknehmen - jederzeit, auch nach dem Festschreiben (B4,
   * BEF-154): an der aufgeklappten Zeile eines abgehakten Besuchs. Ob es
   * geht, entscheidet der Server (abgerechnet, Verordnung in der Abrechnung).
   */
  function hakenZuruecknehmen(termin: DayPlanEntry): ReactNode {
    if (!darfTermine || termin.kind !== 'therapy') return null;
    if (!hakenZuruecknehmbar(termin.status, termin.checked_at)) return null;
    const name = terminName(termin);
    return (
      <HakenRueckgaengig
        appointmentId={termin.id}
        name={name}
        beschriftung="Haken zurücknehmen"
        onWiederOffen={() => setMeldung({ ton: 'ok', text: `Haken bei ${name} zurückgenommen.` })}
        onFehler={(text) => setMeldung({ ton: 'fehler', text })}
      />
    );
  }

  /**
   * Eine aufgeklappte Zeile (Auftrag C1, Analyse „Alltag unterwegs“ Rang 8):
   * dieselbe Karte wie die des nächsten Wegs, mit Navigation, Anruf und Doku,
   * ohne Hauptfarbe - der eine Hauptknopf bleibt an der Karte des nächsten
   * Wegs. Die Fläche der Karte öffnet weiter den Termin im Kalender.
   */
  function zeilenKarte(termin: DayPlanEntry): ReactNode {
    const zone = termin.organization_time_zone;
    const kommt = stehtAus(termin, jetzt);
    const liegt = nichtAbgeschlossen(termin, jetzt);
    const hakenDa =
      liegt ||
      (termin.kind === 'therapy' && dokumentiertOhneHaken(termin.status, termin.checked_at));
    const anfahrt = fahrzeiten.anfahrten.get(termin.id);
    // Der Wegbalken, der über der Zeile lag, steht in der Karte an Stelle
    // der Minuten (B6).
    const balken = kommt ? wegZumBesuch(termin, anfahrt, zone, jetzt) : null;
    const kicker = kommt
      ? `Später${anfahrt && !balken ? ` · ≈ ${anfahrt.minuten} min` : ''}`
      : liegt
        ? `Seit ${formatLocalTime(termin.ends_at, zone)} offen`
        : 'Vorbei';
    const reihe = knopfreihe(dokuKnopf(termin, 'secondary', 'min-w-0 flex-1'), [
      <AnrufKnopf key="anruf" termin={termin} />,
      hakenDa ? (
        <Fragment key="haken">{haken(termin, 'normal', 'Behandlung abschließen')}</Fragment>
      ) : null,
    ]);
    // Unter den Knöpfen: „Später da?“ vor dem Besuch, „Ausfall“ ab dem Beginn.
    const spaeter = kommt && istHeute ? <SpaeterDa termin={termin} praxis={praxis} /> : null;
    const ausfaelle = ausfall(termin, 'karte');
    return (
      <Tageskarte
        termin={termin}
        kicker={kicker}
        vorDerTuer={darfDokuLesen}
        weg={balken ? { ...balken, kachelNenntIhn: false } : null}
        erstaufnahme={
          erstaufnahmen?.find((eintrag) => eintrag.patient_id === termin.patient_id)?.open_items
        }
        hauptaktion={
          kommt && navigationsZiel(termin) !== null ? (
            <>
              <NavigationZumTermin termin={termin} breit />
              {reihe}
            </>
          ) : (
            reihe
          )
        }
        aktionen={
          spaeter || ausfaelle ? (
            <>
              {spaeter}
              {ausfaelle}
            </>
          ) : (
            hakenZuruecknehmen(termin)
          )
        }
        hinweis={kommt && fahrzeiten.veraltet.has(termin.id) ? VERALTET_TEXT : null}
        onZuklappen={() => umschalten(termin.id)}
      />
    );
  }

  // PRX-013: Was zur Erstaufnahme noch fehlt, steht an der Karte - vor der
  // Tür, wo man es noch mitnehmen oder erledigen kann. Dieselbe Abfrage wie
  // unter „Offene Punkte".
  const { data: erstaufnahmen } = useQuery({
    queryKey: OPEN_INTAKES_KEY,
    queryFn: fetchOpenIntakes,
    enabled: mitBehandlung,
    retry: false,
  });

  // Fahrzeiten für Wegbalken und Übergänge (ANN-194). Nur für die
  // Praxisrollen - der Server gibt die Tagesroute der Trainingsbetreuung nicht.
  const fahrzeiten = useTagesfahrzeiten({
    datum,
    staffMemberId,
    plan: termine,
    aktiv: mitBehandlung,
    jetzt,
  });

  // PRX-008: „Termin n von m" an der ausgeklappten Karte - derselbe Lesepfad
  // und derselbe Schlüssel wie die Kachel „Grundlage" am Termin.
  const fokusBehandlung = fokus?.termin.kind === 'therapy' ? fokus.termin.id : null;
  const { data: lage } = useQuery({
    queryKey: ['appointment', fokusBehandlung, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(fokusBehandlung!),
    enabled: darfTermine && fokusBehandlung !== null,
    retry: false,
  });

  // BEF-179 (ANN-675): Ein zurückgewiesener Freizeitausgleich steht unter
  // „noch offen“, bis sein Tag vorbei ist - nur heute, ohne Benachrichtigung.
  // Lädt er nicht, fehlt die Zeile; das Zeitkonto bleibt der Ort dafür.
  const { data: zurueckgewieseneDaten } = useQuery({
    queryKey: REJECTED_TIME_OFF_KEY,
    queryFn: fetchRejectedTimeOff,
    enabled: istHeute,
    retry: false,
  });
  // An einem anderen Tag nicht - auch nicht aus dem Zwischenspeicher.
  const zurueckgewiesen = istHeute ? (zurueckgewieseneDaten ?? []) : [];

  if (isPending) return <Ladegeruest />;

  // Nur wenn es NICHTS zu zeigen gibt, tritt der Fehler an die Stelle der
  // Liste. Gibt es einen älteren Stand, ist er im Hausflur mehr wert als eine
  // Fehlermeldung - er wird dann als älterer Stand gekennzeichnet.
  if (isError && !termine) {
    return (
      <ErrorState
        title="Die Tagesliste konnte nicht geladen werden."
        description={NACH_LADEFEHLER}
        onErneut={() => refetch()}
      />
    );
  }
  if (!termine) return null;

  const wege = wegeDesTages(sortiert, jetzt);
  const besuche = besucheDesTages(sortiert);
  const hausbesuche = hausbesucheDesTages(sortiert);
  const stehtBesuchAus = fokus?.art === 'besuch';
  const ohneBesuch = besuche.length === 0 && !stehtBesuchAus;
  // Der Wegbalken rechnet von jetzt (ANN-196) - an einem anderen Tag gibt es
  // kein Jetzt, nur die Anfahrten am Zeitstrahl (ANN-234).
  const weg = istHeute ? naechsterWeg(sortiert, fokus, fahrzeiten.anfahrten, jetzt) : null;

  function karte(): ReactNode {
    if (!fokus) return null;
    const termin = fokus.termin;
    const zone = termin.organization_time_zone;
    const behandlung = termin.kind === 'therapy' && termin.patient_id !== null;
    const phase = besuchsphase(termin, jetzt);
    // Ab dem Beginn - und wenn nur noch die Dokumentation offen ist - wird
    // die Karte zur Arbeitskarte: Abschluss statt Navigation (UEB-04).
    const arbeitet = fokus.art === 'dokumentation' || phase !== 'wartet';
    const hatNavigation = navigationsZiel(termin) !== null;
    const anfahrt = fahrzeiten.anfahrten.get(termin.id);
    const ende = formatLocalTime(termin.ends_at, zone);

    // ANN-117 Fassung 2: Ein vorbeigegangener, nicht abgehakter Besuch hält
    // die Karte nur, wenn kein Weg mehr aussteht - dann zum Abschließen.
    // Die Fahrzeit im Kicker weicht am Telefon, wenn die Kachel „Abfahrt"
    // darüber denselben Weg nennt (`weg`, ANN-484): So passt „Termin →" in
    // dieselbe Zeile (Praxis-Review R2, P1), und der Hauptknopf bleibt über
    // der Tableiste. Kommt der Weg von einem Termin davor, steht an Stelle
    // der Minuten der Wegbalken wie über den Zeilen (B6).
    const wegTitel =
      wege.erster?.id === termin.id && wege.istErsterDesTages ? 'Erster Weg' : 'Nächster Weg';
    const balken =
      fokus.art === 'besuch' && phase === 'wartet'
        ? wegZumBesuch(termin, anfahrt, zone, jetzt)
        : null;
    const kicker: ReactNode =
      fokus.art === 'dokumentation' ? (
        hakenFehlt(termin.status, termin.checked_at) ? (
          `Seit ${ende} offen`
        ) : (
          'Doku offen'
        )
      ) : phase === 'laeuft' ? (
        `Jetzt · bis ${ende}`
      ) : phase === 'ueberfaellig' ? (
        `Seit ${ende} offen`
      ) : anfahrt && !balken ? (
        <>
          {wegTitel}{' '}
          <span className={weg ? 'max-sm:hidden' : ''}>{`· ≈ ${anfahrt.minuten} min`}</span>
        </>
      ) : (
        wegTitel
      );

    // Ein Hauptknopf je Ansicht (UX-EPIC-002, DESIGN.md Regel 4): die
    // Navigation, solange der Besuch wartet; darunter „Doku", Anruf und der
    // Haken in einer Reihe. Ab dem Beginn - und davor, wenn es kein Ziel für
    // die Navigation gibt (Praxis, Video) - ist „Doku" der eine gefüllte
    // Knopf (Design-Review R2, U2; ANN-481): Er führt ab dem Beginn direkt auf
    // die Schreibseite (Auftrag C1). Der Haken steht 48 px groß mit Rahmen am
    // Ende der Reihe; gefüllt nur, wo es kein „Doku" gibt. Der Anruf steht an
    // jeder Karte (Auftrag C1).
    const zeigtDoku = behandlung;
    let hauptaktion: ReactNode = null;
    if (!arbeitet && hatNavigation) {
      hauptaktion = (
        <>
          <NavigationZumTermin termin={termin} hauptknopf breit />
          {knopfreihe(zeigtDoku ? dokuKnopf(termin, 'secondary', 'min-w-0 flex-1') : null, [
            <AnrufKnopf key="anruf" termin={termin} />,
            <Fragment key="haken">{haken(termin, 'normal', 'Behandlung abschließen')}</Fragment>,
          ])}
        </>
      );
    } else {
      const doku = zeigtDoku ? dokuKnopf(termin, 'primary', 'min-w-0 flex-1') : null;
      const grosserHaken = haken(termin, 'gross', undefined, doku ? 'secondary' : 'primary');
      hauptaktion =
        grosserHaken || doku ? (
          <div className="flex w-full items-center gap-3">
            {doku}
            <AnrufKnopf termin={termin} groesse="gross" />
            {grosserHaken}
          </div>
        ) : null;
    }

    // Unter den Knöpfen, was je nach Phase dazukommt: „Später da?“ auf dem
    // Weg, „Ausfall“ ab dem Beginn (Auftrag C1, Analyse Rang 9; B12) - am
    // Hausbesuch derselbe Ablauf wie im Terminfenster, an der Tür mit der Uhr.
    // Eine Verspätung gibt es nur heute; an einem künftigen Tag wartet alles.
    // Auf dem Weg zum Hausbesuch auch „Panne melden“: Wer mit dem Lastenrad
    // liegen bleibt, beginnt hier, nicht drei Tipps entfernt in der Radflotte
    // (BEF-176). Das Rad wählt die Seite danach, das eigene vorbelegt.
    const nebenaktionen =
      fokus.art !== 'besuch' || !istHeute ? null : phase === 'wartet' ? (
        <>
          <SpaeterDa termin={termin} praxis={praxis} />
          {termin.appointment_type === 'home_visit' ? (
            <ButtonLink
              to={mitRueckweg('/betrieb/flotte/panne', '/')}
              variant="quiet"
              groesse="kompakt"
            >
              Panne melden
            </ButtonLink>
          ) : null}
        </>
      ) : (
        ausfall(termin, 'tuer')
      );

    return (
      <Tageskarte
        termin={termin}
        kicker={kicker}
        vorDerTuer={darfDokuLesen}
        weg={balken ? { ...balken, kachelNenntIhn: weg !== null } : null}
        relativ={fokus.art === 'besuch' ? bisBeginn(termin, jetzt) : null}
        position={lage && lage.appointment_id === termin.id ? positionText(lage) : null}
        abschlussgespraech={!!lage && lage.appointment_id === termin.id && lage.closing_talk_due}
        erstaufnahme={
          erstaufnahmen?.find((eintrag) => eintrag.patient_id === termin.patient_id)?.open_items
        }
        hauptaktion={hauptaktion}
        aktionen={nebenaktionen}
        hinweis={
          fokus.art === 'besuch' && fahrzeiten.veraltet.has(termin.id) ? VERALTET_TEXT : null
        }
      />
    );
  }

  const strahl =
    sortiert.length > 0 ? (
      <Zeitstrahl
        {...(istHeute && !stehtBesuchAus
          ? { titel: `Heute · ${kopfDatum(heute)}`, titelSichtbar: true }
          : {})}
        erstaufnahmeOffen={(termin) =>
          termin.patient_id !== null &&
          (erstaufnahmen ?? []).some((eintrag) => eintrag.patient_id === termin.patient_id)
        }
        plan={sortiert}
        // Steht kein Besuch mehr aus, sagt „noch offen“ darüber, was fehlt;
        // der Strahl zeigt dann nur noch den Tag.
        fokusId={stehtBesuchAus ? (fokus?.termin.id ?? null) : null}
        fruehereZusammenfassen={istHeute && stehtBesuchAus}
        jetzt={jetzt}
        jetztMarke={istHeute}
        zeitzone={zeitzone}
        anfahrten={fahrzeiten.anfahrten}
        veraltet={fahrzeiten.veraltet}
        karte={karte()}
        aktionen={zeilenAktionen}
        ausfall={(termin) => ausfall(termin, 'zeile')}
        aufklappen={{
          offenId: offeneZeile,
          aufklappbar: (termin) =>
            termin.kind === 'therapy' ? termin.patient_id !== null : termin.kind === 'training',
          umschalten,
          karte: zeilenKarte,
        }}
      />
    ) : null;

  // „Rückgängig" nur, solange der Termin nach der Liste noch abgehakt (oder
  // noch nicht nachgeladen) ist. Seit B4 auch nach dem Festschreiben: Doku und
  // Haken sind getrennt (ADR-018 Fassung 5).
  const abgehakt = meldung?.ton === 'ok' ? meldung.abgehakt : undefined;
  const abgehaktJetzt = abgehakt ? sortiert.find((t) => t.id === abgehakt.id) : undefined;
  const rueckgaengig =
    abgehakt &&
    abgehaktJetzt &&
    (hakenZuruecknehmbar(abgehaktJetzt.status, abgehaktJetzt.checked_at) ||
      hakenFehlt(abgehaktJetzt.status, abgehaktJetzt.checked_at)) ? (
      <HakenRueckgaengig
        appointmentId={abgehakt.id}
        name={abgehakt.name}
        onWiederOffen={() => setMeldung({ ton: 'ok', text: `${abgehakt.name} wieder offen.` })}
        onFehler={(text) => setMeldung({ ton: 'fehler', text })}
      />
    ) : null;

  return (
    <>
      {meldung?.ton === 'ok' ? (
        <div className="flex items-center gap-3">
          <Rueckmeldung key={meldung.text} className="min-w-0 flex-1">
            {meldung.text}
          </Rueckmeldung>
          {rueckgaengig}
        </div>
      ) : meldung ? (
        <Statusmeldung ton="fehler">{meldung.text}</Statusmeldung>
      ) : null}
      {/* B7: Hat dieser Haken die Verordnung vollständig gemacht, folgt der
          Vorschlag „In die Abrechnung stellen“ (ein Tipp). */}
      {abgehakt && darfTermine ? (
        <div className="empty:hidden">
          <FreigabeNachHaken
            appointmentId={abgehakt.id}
            patientId={abgehaktJetzt?.patient_id ?? null}
          />
        </div>
      ) : null}
      {/* „Stand von …" erscheint nur, wenn die Liste tatsächlich nicht mehr
          frisch ist (UX-011). Dauerhaft angezeigt wäre es Rauschen - wie ein
          dauerhaftes „verbunden" (ANN-015). Aktualisiert wird über die
          Abfrage, nicht über ein Neuladen der Seite, das den Stand verwürfe
          (ANN-021, UEB-05). */}
      {isError ? (
        <div className="bg-warnung-soft rounded-card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Statusmeldung ton="warnung" className="max-w-prose">
            Die Tagesliste ließ sich gerade nicht aktualisieren. Angezeigt wird der Stand von{' '}
            {formatLocalTime(new Date(dataUpdatedAt).toISOString(), zeitzone)} Uhr – er kann
            veraltet sein.
          </Statusmeldung>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            {isFetching ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}
          </Button>
        </div>
      ) : null}

      {ohneBesuch ? (
        // Der Titel sagt, was der Fall ist (UEB-11): An einem Tag ohne Besuch
        // ist nichts „erledigt". Eine Fehlzeit steht darunter im Zeitstrahl.
        // In der Karte, wie jeder Leerzustand zwischen Karten (DESIGN.md
        // Regel 8; Design-Review R2, U4).
        <EmptyState
          inKarte
          title={`${TagesWort(datum, heute)} sind Ihnen keine Besuche zugeordnet`}
        />
      ) : stehtBesuchAus ? (
        // Liege, Abfahrt und der Strahl mit der Karte des nächsten Besuchs
        // sind ein Abschnitt.
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="flex flex-col gap-2">
            {/* Die Liege gehört an den Hausbesuch (BEF-051): An einem Tag nur
                mit Praxisterminen gibt es die Frage nicht. Die Abfahrt steht nur
                mit bekannter Fahrzeit da (Jannes, 2026-10-11). */}
            <Tageskacheln
              liege={hausbesuche.length > 0 ? liegeHeute(sortiert, jetzt) : null}
              abfahrt={weg ? alsAbfahrt(weg) : null}
              tagWort={tagWort}
            />
            {/* Eine Nachbildung ohne Kartendienst sieht aus wie eine Fahrzeit;
                die Seite sagt es dazu, wie die Tour (MAP-006c). */}
            {fahrzeiten.quelle === 'nachbildung' && fahrzeiten.anfahrten.size > 0 ? (
              <Statusmeldung ton="warnung">
                Nachbildung ohne Kartendienst: Die Fahrzeiten sind über die Luftlinie mit 15 km/h
                gerechnet.
              </Statusmeldung>
            ) : null}
          </div>
          {strahl}
        </div>
      ) : null}

      {/* Ohne eigenen Besuch steht der heutige Strahl (Fehlzeiten) gleich unter
          dem Leerzustand - heute vor morgen (Design-Review R2, U4; ANN-482). */}
      {ohneBesuch ? strahl : null}

      {/* Steht kein Besuch mehr aus, gibt es keine eigene Abschlusskarte mehr:
          Punkte im Kopf, „noch offen" und der Strahl sagen dasselbe (Jannes,
          2026-10-15, ANN-546). Erst, was heute noch offen ist - Haken und
          Doku -, dann was liegen geblieben ist, dann morgen (Auftrag C1,
          Analyse Rang 13). */}
      {!stehtBesuchAus ? (
        <NochOffen
          plan={sortiert}
          tagWort={TagesWort(datum, heute)}
          heute={heute}
          darfDokumentieren={darfDokumentieren}
          jetzt={jetzt}
          zeitzone={zeitzone}
          ausfall={(termin) => ausfall(termin, 'zeile')}
          zurueckgewiesen={zurueckgewiesen}
        />
      ) : null}
      {istHeute && !stehtBesuchAus && darfDokumentieren ? (
        <Nachzuholen
          heute={heute}
          staffMemberId={staffMemberId}
          zeitzone={zeitzone}
          ausfall={(termin) => ausfall(termin, 'zeile')}
        />
      ) : null}

      {/* Steht heute kein Weg mehr aus, ist morgen das Nächste (Jannes,
          2026-10-11). */}
      {istHeute && !stehtBesuchAus ? (
        <MorgenVorschau
          morgen={morgen}
          heute={heute}
          staffMemberId={staffMemberId}
          zeitzone={zeitzone}
          mitBehandlung={mitBehandlung}
        />
      ) : null}

      {ohneBesuch || stehtBesuchAus ? null : strahl}

      {/* Steht ein Besuch aus, bleibt „noch offen“ für die Besuche weg; ein
          zurückgewiesener Freizeitausgleich steht trotzdem da - unter dem
          Strahl, der nächste Weg bleibt auf dem ersten Bildschirm (BEF-179). */}
      {istHeute && stehtBesuchAus ? (
        <NochOffen
          plan={[]}
          tagWort={TagesWort(datum, heute)}
          heute={heute}
          darfDokumentieren={darfDokumentieren}
          jetzt={jetzt}
          zeitzone={zeitzone}
          zurueckgewiesen={zurueckgewiesen}
        />
      ) : null}

      {/* Liegengebliebenes der letzten Tage, unter dem eigenen Tag: Der
          nächste Weg bleibt auf dem ersten Bildschirm (Auftrag C1). */}
      {istHeute && stehtBesuchAus && darfDokumentieren ? (
        <Nachzuholen
          heute={heute}
          staffMemberId={staffMemberId}
          zeitzone={zeitzone}
          ausfall={(termin) => ausfall(termin, 'zeile')}
        />
      ) : null}
    </>
  );
}

export function MyDayPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const darfTermine = canManageAppointments(user.roles);
  const praxisrolle = isStaff(user.roles);
  const darfDokumentieren = canWriteTreatmentNote(user.roles);
  const uhr = useJetzt();
  // ANN-234: der gezeigte Tag, aus der Adresse; ohne Angabe heute. An einem
  // anderen Tag misst die Seite nicht an der Uhr, sondern liegt ganz vor oder
  // ganz hinter ihm.
  const [suche] = useSearchParams();
  const tag = gewaehlterTag(suche.get('tag'), heute);
  const jetzt = bezugszeitpunkt(tag, heute, uhr);

  /**
   * Der Tagesplan des Teams fragt genau einen Kalendertag ab.
   *
   * Der Bereich ist halboffen - `bis` ist der erste Tag NACH dem Bereich,
   * dieselbe Auslegung wie in `bereichFuer` und wie in `list_appointments`
   * selbst. Bis hierher stand hier zweimal derselbe Tag; die Funktion weist
   * das mit `to must be after from` zurueck, und die Seite zeigte dauerhaft
   * "Die Termine konnten nicht geladen werden". Der Abschnitt hat damit nie
   * funktioniert - es war kein abgelaufener Anmeldezustand.
   */
  const morgen = tagePlus(heute, 1);
  const folgetag = tagePlus(tag, 1);

  const team = useQuery({
    queryKey: ['appointments', tag, folgetag, null, null, 'active'],
    queryFn: () =>
      fetchAppointments({
        von: tag,
        bis: folgetag,
        person: null,
        standort: null,
        status: 'active',
      }),
    enabled: darfTermine,
    retry: false,
  });

  // Seit TRN-006 auch die Trainingsbetreuung: Ihre Liste zeigt nur
  // Trainingstermine, der Server filtert je Termin (ADR-022 Punkt 11).
  const eigeneTagesliste =
    (darfTermine || canWriteTrainingClients(user.roles)) && Boolean(user.staffMemberId);
  const staffMemberId = user.staffMemberId ?? '';

  const tagesliste = useQuery({
    queryKey: ['day-plan', tag, staffMemberId],
    queryFn: () => fetchDayPlan(tag, staffMemberId),
    enabled: praxisrolle && eigeneTagesliste,
    retry: false,
    // Die zuletzt geladene Liste bleibt im Arbeitsspeicher der Seite lesbar,
    // auch wenn eine spätere Abfrage scheitert (UX-011, ADR-001, ANN-021).
    gcTime: TAGESPLAN_VORHALTEDAUER_MS,
  });

  // Die Wochenleiste zählt die Termine der sieben Tage über denselben
  // Lesepfad und Schlüssel wie die Tagesliste: Der gezeigte Tag kommt aus
  // demselben Eintrag, ein Tipp auf einen anderen Tag zeigt ihn sofort.
  const wochentage = fensterTage(tag, heute);
  const woche = useQueries({
    queries: wochentage.map((t) => ({
      queryKey: ['day-plan', t, staffMemberId],
      queryFn: () => fetchDayPlan(t, staffMemberId),
      enabled: praxisrolle && eigeneTagesliste,
      retry: false,
      gcTime: TAGESPLAN_VORHALTEDAUER_MS,
    })),
  });
  const anzahlAm = (t: string): number | undefined => {
    const daten = woche[wochentage.indexOf(t)]?.data;
    return daten ? terminAnzahl(daten) : undefined;
  };

  const sortiert = useMemo(() => [...(tagesliste.data ?? [])].sort(nachUhrzeit), [tagesliste.data]);
  const fokus = useMemo(
    () => fokusDesTages(sortiert, darfDokumentieren, jetzt),
    [sortiert, darfDokumentieren, jetzt],
  );
  const fortschritt = useMemo(
    () => tagesfortschritt(sortiert, fokus?.art === 'besuch' ? fokus.termin.id : null),
    [sortiert, fokus],
  );

  // ANN-547: Wird der gezeigte Tag in dieser Sitzung fertig - jeder Besuch
  // abgehakt und dokumentiert -, rollt einmal das Rad über die Punkte, und
  // das Telefon vibriert kurz. Nichts davon wird gespeichert oder gezählt;
  // ein Tag, der schon fertig geöffnet wird, feiert nicht.
  const [feier, setFeier] = useState(0);
  const zuletzt = useRef<{ tag: string; fertig: boolean } | null>(null);
  const fertig = darfDokumentieren && fortschritt.fertig;
  const geladen = tagesliste.data !== undefined;
  useEffect(() => {
    if (!geladen) return;
    const vorher = zuletzt.current;
    zuletzt.current = { tag, fertig };
    if (vorher?.tag === tag && !vorher.fertig && fertig) {
      setFeier((n) => n + 1);
      navigator.vibrate?.([20, 60, 20]);
    }
  }, [tag, fertig, geladen]);

  // ANN-117: Zugeklappt nur für die, die selbst unterwegs sind: Das Büro hat meist
  // keine eigenen Besuche, für es ist der Plan des Teams die Hauptsache.
  const teamplanZugeklappt = eigeneTagesliste && darfDokumentieren;
  // BEF-051: Wer nicht dokumentiert (das Büro), plant zuerst - der Plan des
  // Teams steht dann vor der eigenen Liste, und die Seite bleibt einspaltig.
  const teamplanZuerst = eigeneTagesliste && !darfDokumentieren;
  const zweispaltig = eigeneTagesliste && !teamplanZuerst;

  // ORG-005 (ANN-603): Hinweise zwischendurch - als Fenster, nur zu einem
  // passenden Zeitpunkt nach den eigenen Terminen, die die Seite ohnehin lädt.
  // Wer keine eigene Tagesliste hat (das Büro), hat keinen Termin im Weg.
  const hinweise = useBarometerHinweise(praxisrolle);
  const hinweisTermine = eigeneTagesliste ? (tagesliste.data ?? null) : [];

  if (!praxisrolle) {
    // UEB-08: Der Satz sagt, wozu der Zugang heute dient, und nennt den Weg
    // für alles andere - ohne ein Portal zu versprechen, das erst mit DSN-001
    // entworfen wird. Der Gruß bleibt beim „Sie", ohne Vornamen.
    return (
      <>
        <PageHeader title={greeting()} description={langesDatum(heute)} />
        <Section titel="Ihr Zugang">
          <p className="text-ink-muted text-liste max-w-prose">
            Über diesen Zugang verwalten Sie derzeit Ihr Konto. Termine vereinbaren oder absagen Sie
            bitte direkt bei der Praxis.
          </p>
          <ButtonLink to="/mein-konto" variant="secondary" className="mt-4">
            Mein Konto
          </ButtonLink>
        </Section>
      </>
    );
  }

  // MAP-006b: die Tagesroute auf der Karte, erst beim Aufklappen geladen. Nur
  // für die Praxisrollen - der Server gibt sie der Trainingsbetreuung nicht -
  // und nur mit einem Hausbesuch: Ohne ihn lüde sie nur „Heute gibt es keinen
  // Besuch mit Ort" (BEF-051).
  const tagesroute =
    isTherapyStaff(user.roles) &&
    tagesliste.data &&
    user.staffMemberId &&
    hausbesucheDesTages(sortiert).length > 0 ? (
      <TagesrouteAufklapper datum={tag} staffMemberId={user.staffMemberId} plan={sortiert} />
    ) : null;

  const teamplan = darfTermine ? (
    <Teamplan
      abfrage={team}
      heute={tag}
      tagWort={TagesWort(tag, heute)}
      zeitzone={zeitzone}
      offen={!teamplanZugeklappt}
      offenAbLg={eigeneTagesliste}
    />
  ) : null;

  return (
    <div>
      {/* Zwei Spalten ab 900 px **Inhaltsbreite** (`Zweispalter`): Darunter
          rückt die Kontextspalte unter den eigenen Tag. Wer keinen eigenen
          Tag hat (das Büro), bleibt einspaltig: Für ihn ist der Plan des
          Teams die Hauptsache, keine Randspalte. */}
      <Zweispalter
        // Untereinander (unter 900 px Inhaltsbreite) gilt derselbe Rhythmus
        // wie in der Hauptspalte: 32 px zur Hauptspalte und zwischen den
        // Karten; daneben stehen die Karten mit 16 px (Zweispalter).
        kontext={
          zweispaltig ? (
            <div className="@zweispaltig:gap-4 flex flex-col gap-8 [&>*]:mt-0">
              {teamplan}
              {tagesroute}
            </div>
          ) : null
        }
        className={`gap-y-8 ${eigeneTagesliste && tagesliste.data ? 'print:hidden' : ''}`}
      >
        {/* Am Telefon ein kompakter Kopf (Auftrag C1): Gruß in h4, darunter
            das kurze Datum, rechts Punkte und Kurzform. So liegt der
            Hauptknopf des nächsten Besuchs auch bei 375 × 667 über der
            Tableiste. Ab 640 px das lange Datum und der ganze Satz. */}
        <PageHeader
          title={
            <span className="max-sm:text-h4">{`${greeting()}, ${firstName(user.profile.display_name)}`}</span>
          }
          // Das Datum steht auch am Telefon (Design-Review R2, U3). Mit der
          // Wochenleiste nur Monat und Jahr: Wochentag und Tag stehen dort
          // schon („DI 13"), doppelt sah es aus wie ein Fehler (Jannes,
          // 13.10.2026). Ohne Leiste, etwa beim Trainer, das kurze Datum.
          description={
            <>
              <span className="sm:hidden">
                {eigeneTagesliste || darfTermine ? monatUndJahr(tag) : kurzesDatum(tag)}
              </span>
              <span className="max-sm:hidden">{langesDatum(tag)}</span>
            </>
          }
          actions={
            // Tagesfortschritt im Kopf: ein Punkt je Behandlungsbesuch.
            // Fehlzeiten und Training zählen nicht (ANN-117). Status = Zeichen
            // + Wort (Design-Review R2, U1): am Telefon „2 von 6" neben den
            // Punkten, der ganze Satz für Vorlesesoftware und ab 640 px.
            fortschritt.gesamt > 0 ? (
              <ProgressDots
                punkte={fortschritt.punkte}
                // Haken und Doku: zwei Hälften je Punkt, nur für die, die
                // dokumentieren (ANN-547).
                {...(darfDokumentieren ? { doku: fortschritt.doku, feier } : {})}
              >
                <span aria-hidden="true" className="tabular-nums sm:hidden">
                  {`${fortschritt.erledigt} von ${fortschritt.gesamt}`}
                </span>
                <span className="max-sm:sr-only">
                  {darfDokumentieren ? hakenUndDokuText(fortschritt) : fortschrittText(fortschritt)}
                </span>
              </ProgressDots>
            ) : undefined
          }
        />

        {eigeneTagesliste ? (
          <Wochenleiste tag={tag} heute={heute} anzahl={anzahlAm} />
        ) : darfTermine ? (
          <Wochenleiste tag={tag} heute={heute} anzahl={() => undefined} />
        ) : null}

        {/* Unter dem Kopf ein Rhythmus: Abschnitt zu Abschnitt 32 px
            (DESIGN.md „Rhythmus“), gleich, welche Abschnitte der Tag gerade
            zeigt (Jannes, 2026-10-15). Die Abschnitte bringen keinen eigenen
            Außenabstand mit. */}
        {tag === heute ? (
          <HinweisZwischendurch hinweise={hinweise} termine={hinweisTermine} heute={heute} />
        ) : null}

        <div className="flex flex-col gap-8 [&>*]:mt-0">
          {teamplanZuerst ? teamplan : null}

          {eigeneTagesliste && user.staffMemberId ? (
            <MeinTag
              abfrage={tagesliste}
              sortiert={sortiert}
              fokus={fokus}
              datum={tag}
              morgen={morgen}
              staffMemberId={user.staffMemberId}
              darfDokumentieren={darfDokumentieren}
              darfDokuLesen={canReadTreatmentNote(user.roles)}
              darfTermine={darfTermine}
              mitBehandlung={isTherapyStaff(user.roles)}
              zeitzone={zeitzone}
              jetzt={jetzt}
              heute={heute}
              praxis={user.organizationName ?? 'Ihrer Praxis'}
            />
          ) : null}

          {/* FLT-009 (ANN-570): das eigene Rad braucht einen Check-Up - nur
              ein Hinweis, kein Termin; nur heute und nur, wo etwas fällig ist. */}
          {isTherapyStaff(user.roles) && user.staffMemberId && tag === heute ? (
            <CheckupErinnerung heute={heute} zone={zeitzone} />
          ) : null}

          {/* PRX-EPIC-003: was liegen geblieben ist, als eine Zeile - nur wenn
              etwas fällig ist. Wer selbst unterwegs ist, sieht sie unter dem
              eigenen Tag: Liege und nächster Weg bleiben auf dem ersten
              Bildschirm (UX-EPIC-003). Ohne Fälliges steht an ihrer Stelle
              der ruhige Weg zur Büroliste - nie beide (Design-Review R2, U6). */}
          <OpenPointsSummary
            user={user}
            today={heute}
            sonst={
              canReadPatientDirectory(user.roles) ? (
                <p className="border-line nicht-drucken border-t pt-3">
                  <Textlink alleinstehend to="/offen" className="text-liste gap-1 font-medium">
                    Offene Punkte: Aufgaben, Anrufliste, Erstaufnahmen
                    <Pfeil />
                  </Textlink>
                </p>
              ) : null
            }
          />

          {teamplanZuerst ? tagesroute : null}

          {eigeneTagesliste ? null : teamplan}
        </div>
      </Zweispalter>

      {/* BEF-052, ANN-021 Fassung 3: Gedruckt wird nur der eigene Tag als
          Liste mit Anschrift und Rufnummer - die Bildschirmansicht trägt sie
          hinter Knöpfen und Aufklappern. */}
      {eigeneTagesliste && tagesliste.data ? (
        <TagesplanDruck
          termine={sortiert}
          name={user.profile.display_name}
          datum={langesDatum(tag)}
          zeitzone={zeitzone}
          standVon={tagesliste.isError ? tagesliste.dataUpdatedAt : null}
        />
      ) : null}
    </div>
  );
}
