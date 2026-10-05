import { FahrpufferHinweis } from '@/features/tours/FahrpufferHinweis';
import { useFahrwege, type FahrwegSpalte } from './fahrwege';
import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { textlinkKlassen } from '@/components/ui/buttonStile';
import {
  canManageAppointments,
  canReadTrainingClients,
  canWriteTrainingClients,
  isTherapyStaff,
  type CurrentUser,
} from '@/features/session/types';
import { BEGRIFFE } from '@/lib/begriffe';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchWorkingHourExceptions, fetchWorkingHours } from '@/features/scheduling/api';
import {
  dayKey,
  fetchAppointment,
  fetchAppointments,
  fetchBelegteZeiten,
  fetchAssignableTherapists,
  fetchAssignableTrainers,
  fetchLocations,
  istAusserhalbArbeitszeit,
  istVergangenheit,
  liegtInVergangenheit,
  minutesOfDay,
  NEUER_TERMIN_PARAM,
  schreibeTerminVorbelegung,
  TERMINFENSTER_MINUTEN,
  todayInTimeZone,
  updateAppointment,
  type TerminVorbelegung,
  TERMIN_PARAM,
  appointmentToFormValues,
} from './api';
import {
  CalendarGrid,
  type GitterAuswahl,
  type GitterEintrag,
  type GitterFokus,
  type GitterSpalte,
} from './CalendarGrid';
import { TerminPanel } from './TerminPanel';
import { TerminAktionenDialog } from './TerminAktionen';
import { Rueckmeldung } from './Rueckmeldungen';
import { leseMeldung } from './terminformular';
import { letzterKalenderstand, merkeKalenderstand } from './kalenderstand';
import { SpannenBild } from './Laengenzeichen';
import { naechsteAuswahl, type Spanne } from './useSpanneAufziehen';
import { Monatskalender } from './Monatskalender';
import type { VerschiebenFrage } from './VerschiebenRueckfrage';
import {
  arbeitszeitBaender,
  belegtBaender,
  bereichFuer,
  blaettern,
  FEHLZEIT_BEISPIELE,
  fensterMitArbeitszeit,
  gitterlinien,
  kalenderwoche,
  leseEingetrageneFehlzeit,
  leseParameter,
  minuteZuZeit,
  schreibeParameter,
  tagePlus,
  tageImBereich,
  tagesFenster,
  ZOOMSTUFEN,
  zoomSchritt,
  type KalenderAnsicht,
  type KalenderParameter,
  type StatusFilter,
  type Zeitband,
} from './calendar';

/**
 * Zentrale Kalenderansicht (CAL-002, CAL-006).
 *
 * Zwei Ansichten auf demselben Zeitgitter, die sich nur in der Bedeutung einer
 * Spalte unterscheiden:
 *
 *   * Tag   - alle behandelnden Personen nebeneinander. Das ist die Frage des
 *             Praxisalltags: wer hat wann was.
 *   * Woche - genau eine Person über sieben Tage. Die Woche mehrerer Personen
 *             gleichzeitig wäre in keiner Breite mehr lesbar.
 *
 * Ansicht, Datum und Filter stehen in der Adresszeile: ein Stand lässt sich
 * damit teilen und überlebt das Neuladen. Ungültige Werte fallen still auf den
 * Standard zurück.
 *
 * Es werden ausschließlich organisatorisch notwendige Angaben gezeigt. Klinische
 * Inhalte gehören nicht in den Kalender (PROJECT_PRINCIPLES.md 4.3, 4.6).
 */

/** Unterscheidbare, bewusst zurückhaltende Farben je behandelnder Person. */
function wochentagKurz(tag: string): string {
  return new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${tag}T00:00:00Z`),
  );
}

function tagesZahl(tag: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${tag}T00:00:00Z`));
}

/**
 * Der Monat am Telefon, kurz (BEF-039): „Sept." statt „September 2026".
 *
 * Ohne zweistelliges Jahr (KAL-27): „Okt. 26" las sich neben den Tagen der
 * Kopfzeile als 26. Oktober. Das Jahr steht nur dabei, wenn es nicht das
 * laufende ist, und dann ausgeschrieben.
 */
function monatKurz(tag: string, heute: string): string {
  const laufendesJahr = tag.slice(0, 4) === heute.slice(0, 4);
  return new Intl.DateTimeFormat('de-DE', {
    month: 'short',
    ...(laufendesJahr ? {} : { year: 'numeric' as const }),
    timeZone: 'UTC',
  }).format(new Date(`${tag}T00:00:00Z`));
}

function monatLang(tag: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${tag}T00:00:00Z`));
}

function bereichsBeschriftung(ansicht: KalenderAnsicht, von: string, bis: string): string {
  const lang = (tag: string) =>
    new Intl.DateTimeFormat('de-DE', { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(`${tag}T00:00:00Z`),
    );
  if (ansicht === 'tag') return lang(von);
  const letzter = new Date(`${bis}T00:00:00Z`);
  letzter.setUTCDate(letzter.getUTCDate() - 1);
  return `${lang(von)} – ${lang(letzter.toISOString().slice(0, 10))}`;
}

/**
 * Wie fein das Gitter gerade ist, in Worten (CAL-011).
 *
 * Die Zoomstufe selbst ist eine Pixelzahl und sagt niemandem etwas. Was
 * interessiert, ist die Frage dahinter: sehe ich gerade meine fünf Minuten?
 */
function rasterBeschriftung(fein: number | null, halbeStunde: boolean): string {
  if (fein) return `${fein}-Minuten-Raster`;
  if (halbeStunde) return 'Halbstundenraster';
  return 'Stundenraster';
}

/**
 * Was ein leerer Ausschnitt sagt - samt dem Filter, der ihn leer macht
 * (KAL-26). Unter „Nur abgesagte" hieß es bisher „keine Termine geplant", und
 * ein belegter Tag las sich als frei.
 */
function leerTitel(p: KalenderParameter): string {
  const zeitraum = p.ansicht === 'tag' ? 'an diesem Tag' : 'in dieser Woche';
  if (p.patient) return `Für diese Patient:in steht ${zeitraum} kein Termin an.`;
  switch (p.status) {
    case 'confirmed':
      return `Keine bestätigten Termine ${zeitraum}.`;
    case 'done':
      return `Keine erledigten Termine ${zeitraum}.`;
    case 'no_show':
      return `Keine nicht angetroffenen Termine ${zeitraum}.`;
    case 'cancelled':
      return `Keine abgesagten Termine ${zeitraum}.`;
    default:
      if (p.standort) return `Am gewählten Standort sind ${zeitraum} keine Termine geplant.`;
      return p.ansicht === 'tag'
        ? 'Für diesen Tag sind keine Termine geplant.'
        : 'Für diese Woche sind keine Termine geplant.';
  }
}

/** Anzeigename einer behandelnden Person, auch wenn die Liste sie nicht kennt. */
function alnamePerson(person: { display_name: string } | undefined): string {
  return person?.display_name ?? 'Behandelnde Person';
}

/** Was beim Verschieben an den Server geht, samt Beschreibung für die Rückgängig-Leiste. */
interface Verschiebung {
  terminId: string;
  staffMemberId: string;
  datum: string;
  startMinute: number;
  endeMinute: number;
  beschreibung: string;
}

/** Eine abgelegte, noch nicht bestätigte Verschiebung (CAL-023). */
interface Vorschlag {
  v: Verschiebung;
  zurueck: Verschiebung;
  frage: VerschiebenFrage;
  /** Die Zielspalte, in der das Gitter die neue Kachel zeichnet (FIX-017). */
  zielSpalteId: string;
}

/**
 * Ist die Spanne vollständig von Arbeitszeit gedeckt? Reine Darstellung.
 *
 * Aneinanderstoßende Bänder zählen zusammen (09–12 und 12–15 decken
 * 11:30–12:30) - so rechnet auch `app.is_within_working_hours` mit
 * `range_agg`. Die Bänder kommen sortiert aus `arbeitszeitBaender`.
 */
function inArbeitszeit(baender: readonly Zeitband[], von: number, bis: number): boolean {
  let gedecktBis = von;
  for (const band of baender) {
    if (band.vonMinute > gedecktBis) break;
    if (band.bisMinute > gedecktBis) gedecktBis = band.bisMinute;
    if (gedecktBis >= bis) return true;
  }
  return false;
}

export function CalendarPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const zone = user.organizationTimeZone;
  const darfAendern = canManageAppointments(user.roles);

  // Ohne Praxiszeitzone wird der Kalender nicht dargestellt (siehe unten).
  // Die Ableitungen brauchen trotzdem einen gueltigen Kalendertag: Hooks
  // duerfen nicht bedingt laufen, und ein leerer Wert liess die
  // Kalenderarithmetik abstuerzen statt den Fehlerzustand zu zeigen.
  const heute = zone ? todayInTimeZone(zone) : '1970-01-01';
  // BEF-073: Ohne Ansicht in der Adresse (Tableiste, Rückweg ohne Stand)
  // öffnet der Kalender dort, wo man heute zuletzt war.
  const gemerkt = suche.has('ansicht') ? null : letzterKalenderstand(user.profile.id, heute);
  const p = leseParameter(gemerkt ?? suche, heute);
  // Der gerade angelegte Termin (FIX-016): einmal hervorgehoben, beim
  // naechsten Blaettern faellt der Parameter weg (`schreibeParameter`).
  const neuerTermin = suche.get(NEUER_TERMIN_PARAM);
  // Die gerade eingetragene Fehlzeit (KAL-22): nur die Art, kein Name.
  const eingetragen = leseEingetrageneFehlzeit(suche);
  // Der Kalenderstand als Rückweg - aus den gelesenen Parametern, nicht aus der
  // Adresszeile: So reist `neu=` nicht in den nächsten Rückweg (und markiert
  // beim zweiten Anlegen den falschen Termin).
  const kalenderStand = `/kalender?${schreibeParameter(p).toString()}`;
  const bereich = bereichFuer(p.ansicht, p.datum);
  // Welche Linien die gewaehlte Zoomstufe traegt - dieselbe Auskunft fuer die
  // Beschriftung der Bedienung und fuer das Gitter selbst.
  const linien = gitterlinien(p.zoom, user.appointmentGridMinutes);

  /**
   * Die Verschiebung, nach der gerade gefragt wird (CAL-023).
   *
   * Das Loslassen einer Kachel schreibt nicht; es legt nur diesen Vorschlag
   * ab. Geschrieben wird erst auf die Bestätigung der Rückfrage.
   */
  const [vorschlag, setVorschlag] = useState<Vorschlag | null>(null);
  /**
   * Die Umkehrung der zuletzt ausgefuehrten Verschiebung (UX-010).
   *
   * Ein Termin wandert mit einer Geste - und eine Geste ist schnell
   * versehentlich gemacht. Die Leiste bleibt stehen, bis sie benutzt wird,
   * bis die naechste Verschiebung sie ersetzt oder bis der gezeigte Ausschnitt
   * wechselt; ein Zeitablauf waere eine zweite Ungewissheit ("war das jetzt
   * noch da?").
   */
  const [rueckgaengig, setRueckgaengig] = useState<Verschiebung | null>(null);
  /**
   * Die Auswahl auf der freien Fläche, über der das Anlegen-Menü steht
   * (CAL-019).
   *
   * Aufgezogen oder angetippt - beides landet hier, und erst die Wahl im Menü
   * führt irgendwohin. Ein Tap führte bis CAL-019 unmittelbar in die
   * Terminanlage; das ging, solange es nur einen Weg gab.
   */
  const [auswahl, setAuswahl] = useState<Spanne | null>(null);
  // Der Termin im Panel (Design-Handoff 2026-10-01, Abschnitt 7a).
  const [gewaehltId, setGewaehltId] = useState<string | null>(null);
  // Der Termin, dessen Fenster „Aktionen" offen ist (Akte entschlacken, 2026-10-03).
  const [aktionenId, setAktionenId] = useState<string | null>(null);
  /**
   * Ein Termin aus einem Link (`?termin=`, `kalenderZumTermin`): Seit der
   * Termin keine eigene Seite mehr hat, führen Tagesliste, Tour, Warteliste
   * und Formulare hierher. Gemerkt wird die Kennung beim ersten Lesen - der
   * gemerkte Kalenderstand schreibt die Adresse sonst ohne sie neu.
   */
  const terminImLink = suche.get(TERMIN_PARAM);
  // Was eine Schreibseite beim Zurückkommen bestätigt (DOK-15, ZST-17) - bis
  // 2026-10-03 stand es auf der Terminseite. Gemerkt beim ersten Lesen: Das
  // Umschreiben der Adresse nimmt den Zustand der Navigation nicht mit.
  const ortZustand: unknown = useLocation().state;
  const [eingangsmeldung] = useState(() => leseMeldung(ortZustand));
  const [sprungZiel, setSprungZiel] = useState<string | null>(null);
  useEffect(() => {
    if (terminImLink) setSprungZiel(terminImLink);
  }, [terminImLink]);
  /** Monatskalender und Ansicht/Filter sind eingeklappt, bis man sie braucht (BEF-039). */
  const [monatOffen, setMonatOffen] = useState(false);
  const [optionenOffen, setOptionenOffen] = useState(false);
  /** Zähler für „Jetzt" - das Gitter springt bei jeder Erhöhung (BEF-039). */
  const [sprung, setSprung] = useState(0);
  /**
   * Fokusführung nach dem Schließen (KAL-21, KAL-01): Monatsblatt und
   * „Ansicht und Filter" geben den Fokus an ihren Knopf zurück, Rückfrage und
   * Anlegen-Leiste an Kachel bzw. Spalte, und nach dem Verschieben steht er
   * auf „Rückgängig". Vorher fiel er auf den Seitenanfang, vor das Raster.
   */
  const [rasterFokus, setRasterFokus] = useState<GitterFokus | null>(null);
  const monatKnopfRef = useRef<HTMLButtonElement>(null);
  const optionenKnopfRef = useRef<HTMLButtonElement>(null);
  const optionenRef = useRef<HTMLDivElement>(null);
  const kalenderSuche = schreibeParameter(p).toString();
  const ausGemerktem = gemerkt !== null;
  useEffect(() => {
    if (ausGemerktem) {
      setSuche(new URLSearchParams(kalenderSuche), { replace: true });
      return;
    }
    merkeKalenderstand(user.profile.id, new URLSearchParams(kalenderSuche), heute);
  }, [ausGemerktem, kalenderSuche, heute, user.profile.id, setSuche]);
  const sprungTermin = useQuery({
    queryKey: ['appointment', sprungZiel],
    queryFn: () => fetchAppointment(sprungZiel!),
    enabled: Boolean(sprungZiel),
    retry: false,
  });
  useEffect(() => {
    if (!sprungZiel || sprungTermin.isPending) return;
    const termin = sprungTermin.data;
    setSprungZiel(null);
    if (!termin) {
      // Nicht (mehr) da oder nicht freigegeben: Der Kalender bleibt, wo er ist.
      if (terminImLink) setSuche(new URLSearchParams(kalenderSuche), { replace: true });
      return;
    }
    // Der Tag des Termins in der Zeit der Praxis; eine Personenauswahl folgt
    // der behandelnden Person, ein Zustandsfilter lässt den Termin sichtbar.
    const datum = appointmentToFormValues(termin).date;
    const zustand: KalenderParameter['status'] =
      termin.status === 'cancelled' || termin.status === 'no_show' ? 'all' : p.status;
    const ziel = schreibeParameter({
      ...p,
      ansicht: 'tag',
      datum,
      person: p.person ? termin.staff_member_id : null,
      status: zustand,
      patient: null,
      verordnung: null,
    });
    // Die Kennung bleibt in der Adresse, solange der Termin gewählt ist: Ein
    // Neuladen zeigt ihn wieder, und Tests finden ihn dort.
    ziel.set(TERMIN_PARAM, termin.id);
    setSuche(ziel, { replace: true });
    setGewaehltId(termin.id);
  }, [
    sprungZiel,
    sprungTermin.isPending,
    sprungTermin.data,
    p,
    kalenderSuche,
    terminImLink,
    setSuche,
  ]);
  const rueckgaengigRef = useRef<HTMLButtonElement>(null);
  const rueckgaengigFokussieren = useRef(false);
  useEffect(() => {
    if (!rueckgaengigFokussieren.current || !rueckgaengigRef.current) return;
    rueckgaengigFokussieren.current = false;
    // Ohne Bildlauf: Die Leiste klebt ohnehin unten im Bild.
    rueckgaengigRef.current.focus({ preventScroll: true });
  });
  useEffect(() => {
    // Beim Aufklappen steht der Fokus auf dem ersten Element des Feldes.
    if (optionenOffen) {
      optionenRef.current?.querySelector<HTMLElement>('button, a, select')?.focus();
    }
  }, [optionenOffen]);
  /**
   * Die aktuelle Uhrzeit der Praxis, jede Minute nachgestellt - für die
   * Linie im Raster (BEF-039). Ohne Zeitzone gibt es keine.
   */
  const [jetztMinute, setJetztMinute] = useState<number | null>(() =>
    zone ? minutesOfDay(new Date().toISOString(), zone) : null,
  );
  useEffect(() => {
    if (!zone) return;
    const takt = setInterval(
      () => setJetztMinute(minutesOfDay(new Date().toISOString(), zone)),
      60_000,
    );
    return () => clearInterval(takt);
  }, [zone]);

  // Die Spalten des Kalenders: wer behandelt und - seit TRN-006 - wer
  // Training betreut. Jede Rolle fragt nur nach der Liste, die ihr der Server
  // gibt: die Trainingsbetreuung nur nach der eigenen, die Behandlungsrollen
  // nur nach ihrer (ADR-022 Punkt 11); owner und Büro nach beiden.
  const mitTraining = canReadTrainingClients(user.roles);
  const mitBehandlung = darfAendern || !mitTraining;
  const darfTraining = canWriteTrainingClients(user.roles);
  const therapeuten = useQuery({
    queryKey: ['calendar-staff', mitBehandlung, mitTraining],
    queryFn: async () => {
      const [behandlung, training] = await Promise.all([
        mitBehandlung ? fetchAssignableTherapists() : Promise.resolve([]),
        // Scheitert nur die Liste der Trainingsbetreuung, bleibt der
        // Kalender der Behandlung stehen; ohne Behandlung ist sie die Spalte.
        mitTraining
          ? fetchAssignableTrainers().catch((fehler: unknown) => {
              if (mitBehandlung) return [];
              throw fehler;
            })
          : Promise.resolve([]),
      ]);
      const bekannt = new Set(behandlung.map((t) => t.staff_member_id));
      return {
        alle: [...behandlung, ...training.filter((t) => !bekannt.has(t.staff_member_id))],
        behandlung: bekannt,
        training: new Set(training.map((t) => t.staff_member_id)),
      };
    },
    retry: false,
  });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  const termine = useQuery({
    queryKey: ['appointments', bereich.von, bereich.bis, p.person, p.standort, p.status],
    queryFn: () =>
      fetchAppointments({
        von: bereich.von,
        bis: bereich.bis,
        person: p.person,
        standort: p.standort,
        status: p.status,
      }),
    enabled: Boolean(zone),
    retry: false,
    // Beim Blaettern bleibt der alte Ausschnitt stehen, bis der neue da ist:
    // Das Gitter wird nicht abgebaut, eine laufende Zieh-Geste ueberlebt den
    // Wechsel (FIX-018).
    placeholderData: keepPreviousData,
  });

  // Belegte Zeiten ohne lesbaren Termin (ABN-021, BEF-112): nur, wer die
  // Behandlung nicht sieht - die Trainingsbetreuung. Praxisrollen sehen die
  // Termine selbst; der Server gäbe ihnen ohnehin nichts.
  const belegt = useQuery({
    queryKey: ['busy-blocks', bereich.von, bereich.bis, p.person],
    queryFn: () => fetchBelegteZeiten({ von: bereich.von, bis: bereich.bis, person: p.person }),
    enabled: Boolean(zone) && !mitBehandlung,
    retry: false,
    placeholderData: keepPreviousData,
  });
  const belegtDaten = belegt.data ?? [];
  const belegtFuer = (staffMemberId: string, tag: string) =>
    zone ? belegtBaender(belegtDaten, staffMemberId, tag, zone, minutesOfDay, dayKey) : [];

  // Arbeitszeiten als Hintergrund. Der Wochenplan ist klein und ändert sich
  // selten; die Abweichungen werden auf den sichtbaren Bereich begrenzt.
  const wochenplan = useQuery({
    queryKey: ['working-hours'],
    queryFn: fetchWorkingHours,
    retry: false,
  });

  const ausnahmen = useQuery({
    queryKey: ['working-hour-exceptions', bereich.von, bereich.bis],
    queryFn: () => fetchWorkingHourExceptions(bereich.von, bereich.bis),
    enabled: Boolean(zone),
    retry: false,
    placeholderData: keepPreviousData,
  });

  // „Doku offen" sieht, wer Dokumentation lesen darf (ABN-005, ANN-201
  // Fassung 2): Der Server liefert den Stand nur an diese Rollen
  // (app.can_read_treatment_note), hier wird nichts mehr ausgeblendet. Die
  // Aufgabe - „Doku" schreiben - bleibt im Panel bei den Schreibenden.
  const eintraege = useMemo(() => termine.data ?? [], [termine.data]);
  const gewaehlt = gewaehltId ? (eintraege.find((e) => e.id === gewaehltId) ?? null) : null;

  const verschieben = useMutation({
    mutationFn: async (auftrag: {
      v: Verschiebung;
      bestaetigt: boolean;
      /** Ein Tag vor dem heutigen, ausdrücklich bestätigt (FIX-019). */
      vergangenheit: boolean;
      /** Was die Leiste danach anbietet; ohne Angabe verschwindet sie. */
      zurueck?: Verschiebung;
      /** Die Rückfrage, aus der der Auftrag stammt - fehlt beim Rückgängig. */
      aus?: Vorschlag;
    }) => {
      // Der aktuelle Stand wird unmittelbar vor dem Schreiben gelesen: der
      // Kalender kennt updated_at nicht, und ohne ihn griffe der Schutz gegen
      // ein verlorenes Update nicht (CAL-003).
      const termin = await fetchAppointment(auftrag.v.terminId);
      if (!termin) throw new Error('Der Termin ist nicht mehr verfügbar.');

      await updateAppointment(
        auftrag.v.terminId,
        termin.updated_at,
        {
          staff_member_id: auftrag.v.staffMemberId,
          appointment_type: termin.appointment_type,
          date: auftrag.v.datum,
          start_time: minuteZuZeit(auftrag.v.startMinute),
          end_time: minuteZuZeit(auftrag.v.endeMinute),
          location_id: termin.location_id ?? '',
        },
        auftrag.bestaetigt,
        auftrag.vergangenheit,
      );
    },
    onSuccess: async (_ergebnis, auftrag) => {
      setVorschlag(null);
      setRueckgaengig(auftrag.zurueck ?? null);
      // Nach dem Verschieben steht der Fokus auf „Rückgängig" (KAL-01).
      if (auftrag.zurueck) rueckgaengigFokussieren.current = true;
      // Erst jetzt wandert die Kachel - vorher hat der Server nichts zugesagt.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      // Nach dem Zurückholen gibt es keine Leiste mehr: Der Fokus geht an die
      // Kachel, die zurückgewandert ist (KAL-21).
      if (!auftrag.zurueck) setRasterFokus({ kachel: auftrag.v.terminId });
    },
    onError: (fehler, auftrag) => {
      // Der Server sieht die Zielzeit außerhalb der Arbeitszeit, die geladenen
      // Arbeitszeiten sahen es nicht (veraltet oder nicht geladen): DIESELBE
      // Rückfrage kommt mit dem Hinweis wieder - kein zweiter Kasten (CAL-023).
      //
      // Nur, wenn diese Rückfrage noch offen ist: Wer inzwischen geblättert
      // hat, bekommt keine Frage zu einem Ausschnitt, der nicht mehr dasteht.
      setVorschlag((aktuell) => {
        if (!auftrag.aus || aktuell !== auftrag.aus) return aktuell;
        if (istAusserhalbArbeitszeit(fehler)) {
          return { ...auftrag.aus, frage: { ...auftrag.aus.frage, ausserhalb: true } };
        }
        // Dasselbe für die Vergangenheit (FIX-019): der Praxistag kann seit
        // dem Laden gewechselt haben.
        if (istVergangenheit(fehler)) {
          return { ...auftrag.aus, frage: { ...auftrag.aus.frage, vergangenheit: true } };
        }
        // Jeder andere Fehler - der Platz ist belegt, der Termin fort - steht
        // in derselben Rückfrage, neben der Kachel (KAL-01). Bis dahin schloss
        // sie, und die Meldung stand über dem Raster, außer Sicht.
        return aktuell;
      });
    },
  });

  function setze(teil: Partial<KalenderParameter>) {
    // Wer den Ausschnitt wechselt, hat die letzte Verschiebung hinter sich
    // gelassen - eine Leiste, die dabei stehen bliebe, boete das Rueckgaengig
    // fuer etwas an, das gar nicht mehr zu sehen ist.
    setRueckgaengig(null);
    // Dasselbe gilt fuer eine offene Rueckfrage und fuer ein offenes
    // Anlegen-Menue: Beide nennen Zeiten aus einem Ausschnitt, der gleich
    // nicht mehr dasteht.
    setVorschlag(null);
    setAuswahl(null);
    setSuche(schreibeParameter({ ...p, ...teil }), { replace: false });
  }

  /**
   * Eine Zoomstufe weiter (KAL-11) - über „+" und „−" oder mit zwei Fingern.
   *
   * Nicht über `setze`: Beim Zoomen bleibt der Ausschnitt derselbe, also
   * bleiben auch Auswahl, offene Rückfrage und Rückgängig stehen - wer feiner
   * zoomt, um das zweite Feld zu treffen, verlor sonst das erste. Und die
   * Stufe ersetzt den Verlaufseintrag: Die Zurück-Geste führt aus dem
   * Kalender heraus und nicht erst durch jede Zoomstufe.
   */
  function zoomen(richtung: 1 | -1) {
    setSuche(schreibeParameter({ ...p, zoom: zoomSchritt(p.zoom, richtung) }), { replace: true });
  }

  if (!zone) {
    return (
      <ErrorState
        title="Kalender nicht verfügbar"
        description="Für diese Praxis ist keine Zeitzone hinterlegt. Ohne sie lassen sich Termine nicht verlässlich einordnen."
      />
    );
  }

  const tage = tageImBereich(bereich);
  const alleTherapeuten = therapeuten.data?.alle ?? [];
  const wochenplanDaten = wochenplan.data ?? [];
  const ausnahmenDaten = ausnahmen.data ?? [];
  // Solange der Wochenplan nicht da ist, behauptet das Gitter nichts: Ohne
  // Bänder wäre sonst jeder Tag ganz grau, bis die Antwort kommt (UX-005c).
  const arbeitszeitBekannt = wochenplan.data !== undefined;

  // Die eigene Person, wenn sie im Kalender eine Spalte hat (KAL-03).
  const eigenePerson =
    user.staffMemberId && alleTherapeuten.some((t) => t.staff_member_id === user.staffMemberId)
      ? user.staffMemberId
      : null;

  // In der Wochenansicht steht genau eine Person im Gitter. Ohne ausdrückliche
  // Wahl ist das die eigene (KAL-03): Wer auf „Kalender" tippt, will den
  // eigenen Plan sehen und nicht den der ersten Person der Praxis. Wer keine
  // Spalte hat - etwa das Praxismanagement -, sieht wie bisher die erste.
  const wochenPerson = p.person ?? eigenePerson ?? alleTherapeuten[0]?.staff_member_id ?? null;

  // In der Tagesansicht steht jede behandelnde Person in einer eigenen Spalte;
  // ein Personenfilter grenzt sie zusätzlich ein.
  const tagesPersonen = p.person
    ? alleTherapeuten.filter((t) => t.staff_member_id === p.person)
    : alleTherapeuten;

  /**
   * Der Spaltenkopf wechselt die Ansicht (CAL-012).
   *
   * Beide Ansichten zeigen denselben Kalender aus zwei Richtungen: die
   * Tagesansicht fragt „wer hat wann was", die Wochenansicht „wie sieht die
   * Woche dieser Person aus". Ein Kopf trägt genau die Antwort, die die
   * andere Richtung als Eingabe braucht — ein Name die Person, ein Datum den
   * Tag. Der Wechsel läuft deshalb über den Kopf und nicht über einen
   * zusätzlichen Umweg durch die Filterzeile.
   *
   * Alles Übrige der Adresse bleibt stehen, auch die Zoomstufe.
   */
  const zumWochenplan = (staffMemberId: string, name: string) => ({
    to: `/kalender?${schreibeParameter({ ...p, ansicht: 'woche', person: staffMemberId })}`,
    beschriftung:
      staffMemberId === eigenePerson ? `Wochenplan von ${name} (ich)` : `Wochenplan von ${name}`,
  });

  const zumTag = (tag: string) => ({
    // Ohne Person: der Tag gehoert allen: genau die Frage, die die
    // Tagesansicht beantwortet.
    to: `/kalender?${schreibeParameter({ ...p, ansicht: 'tag', datum: tag, person: null })}`,
    beschriftung: `Tagesansicht aller behandelnden Personen am ${wochentagKurz(tag)} ${tagesZahl(tag)}`,
  });

  // ANN-202 Fassung 2 (Jannes 2026-10-05): Die Woche zeigt Montag bis
  // Sonntag durchgehend. Bis dahin standen Samstag und Sonntag nur mit einem
  // Termin der gezeigten Person da (Design-Handoff 2026-10-01, Abschnitt 7a).
  const wochenTage = tage;

  // UBK-005, ANN-235: Fahrwege als Blöcke - je Spalte eine Person an einem
  // Tag. Nur für die Praxisrollen, wie in der Übersicht: Der Server gibt die
  // Tagesroute der Trainingsbetreuung nicht.
  const fahrwegSpalten: FahrwegSpalte[] =
    p.ansicht === 'tag'
      ? tagesPersonen.map((t) => ({
          id: t.staff_member_id,
          datum: bereich.von,
          person: t.staff_member_id,
        }))
      : wochenPerson
        ? wochenTage.map((tag) => ({ id: tag, datum: tag, person: wochenPerson }))
        : [];
  const fahrwege = useFahrwege({
    spalten: fahrwegSpalten,
    heute,
    zeitzone: zone ?? null,
    aktiv: isTherapyStaff(user.roles),
  });

  const spaltenModell: GitterSpalte[] =
    p.ansicht === 'tag'
      ? tagesPersonen.map((t) => ({
          id: t.staff_member_id,
          titel: t.display_name,
          // Die eigene Spalte, nicht nur als Farbton (KAL-03, KAL-B01).
          hervorgehoben: t.staff_member_id === eigenePerson,
          zusatz: t.staff_member_id === eigenePerson ? 'ich' : undefined,
          baender: arbeitszeitBekannt
            ? arbeitszeitBaender(t.staff_member_id, bereich.von, wochenplanDaten, ausnahmenDaten)
            : null,
          belegt: belegtFuer(t.staff_member_id, bereich.von),
          fahrwege: fahrwege.jeSpalte.get(t.staff_member_id) ?? [],
          ziel: zumWochenplan(t.staff_member_id, t.display_name),
        }))
      : wochenTage.map((tag) => ({
          id: tag,
          titel: wochentagKurz(tag),
          unterTitel: tagesZahl(tag),
          // Heute als Wort und für Vorlesesoftware, nicht nur als Farbton (KAL-B01).
          hervorgehoben: tag === heute,
          zusatz: tag === heute ? 'heute' : undefined,
          aktuellesDatum: tag === heute,
          baender:
            wochenPerson && arbeitszeitBekannt
              ? arbeitszeitBaender(wochenPerson, tag, wochenplanDaten, ausnahmenDaten)
              : null,
          belegt: wochenPerson ? belegtFuer(wochenPerson, tag) : [],
          fahrwege: fahrwege.jeSpalte.get(tag) ?? [],
          ziel: zumTag(tag),
        }));

  // Die Wochenansicht zeigt genau eine Person; alles andere blendet sie aus.
  const nachPerson =
    p.ansicht === 'woche' ? eintraege.filter((e) => e.staff_member_id === wochenPerson) : eintraege;

  // Der Patientenfilter kommt aus der Akte mit (AKTE-003). Er wirkt in der
  // Darstellung und nicht im Lesepfad: Der Kalender liest den Ausschnitt
  // ohnehin vollständig, und eine eigene Serverabfrage je Patient:in wäre ein
  // zweiter Weg zu denselben Daten. Was sichtbar ist, entscheidet unverändert
  // die RLS (ADR-004).
  const sichtbar = p.patient ? nachPerson.filter((e) => e.patient_id === p.patient) : nachPerson;

  // Der Name für die Filteranzeige stammt aus den geladenen Terminen und nicht
  // aus einer zusätzlichen Abfrage: Wer aus der Akte kommt, landet auf einem
  // Tag mit einem Termin dieser Person. Findet sich keiner, bleibt der Hinweis
  // ohne Namen stehen - er nennt keine Person, die hier gerade nicht vorkommt.
  const gefilterterName = p.patient
    ? (nachPerson.find((e) => e.patient_id === p.patient) ?? null)
    : null;

  const gitterEintraege: GitterEintrag[] = sichtbar.map((e) => ({
    eintrag: e,
    spalteId: p.ansicht === 'tag' ? e.staff_member_id : dayKey(e.starts_at, zone),
    beginnMinute: minutesOfDay(e.starts_at, zone),
    endeMinute: minutesOfDay(e.ends_at, zone),
    // Nur bestätigte Termine werden gezogen. Ein abgeschlossener oder als
    // nicht angetroffen geführter müsste erst wieder geöffnet werden, ein
    // abgesagter bleibt terminal (CAL-004, ADR-018).
    // Ein Trainingstermin wird über seine Seite verschoben (TRN-004), nicht
    // gezogen: Die Geste liest den Termin über die Sicht der Praxis.
    ziehbar: e.status === 'confirmed' && e.kind !== 'training' && darfAendern,
    ...(e.id === neuerTermin ? { neu: true } : {}),
  }));

  /**
   * Jeder je gezeigte Termin mit seinem Platz (FIX-018).
   *
   * Wer waehrend des Ziehens blaettert, laesst den Termin hinter sich: Er
   * gehoert nicht mehr zum geladenen Ausschnitt. Beim Loslassen muss sein
   * alter Platz trotzdem bekannt sein - fuer die Rueckfrage und die
   * Rueckgaengig-Leiste. Eintraege werden ueberschrieben, nie entfernt.
   */
  const bekannt = useRef(new Map<string, GitterEintrag & { datum: string }>());
  useEffect(() => {
    for (const g of gitterEintraege) {
      // Der Tag kommt aus dem Termin selbst, nicht aus dem Ausschnitt: Waehrend
      // des Blaetterns stehen kurz die alten Termine unter dem neuen Tag
      // (keepPreviousData), und der Ursprung darf davon nichts abbekommen.
      bekannt.current.set(g.eintrag.id, { ...g, datum: dayKey(g.eintrag.starts_at, zone) });
    }
  });

  const fenster = fensterMitArbeitszeit(
    tagesFenster(gitterEintraege.map((g) => ({ beginn: g.beginnMinute, ende: g.endeMinute }))),
    spaltenModell.flatMap((s) => s.baender ?? []),
  );

  /** Übersetzt eine Zielspalte zurück in Person und Datum. */
  function ablegen(ziel: { terminId: string; spalteId: string; startMinute: number }) {
    // Nach dem Blaettern waehrend der Geste steht der Termin nicht mehr im
    // gezeigten Ausschnitt; sein Ursprung kommt dann aus dem Gedaechtnis
    // (FIX-018).
    const g = bekannt.current.get(ziel.terminId);
    if (!g) return;

    const dauer = g.endeMinute - g.beginnMinute;
    const staffMemberId = p.ansicht === 'tag' ? ziel.spalteId : g.eintrag.staff_member_id;
    const datum = p.ansicht === 'tag' ? bereich.von : ziel.spalteId;
    const person = alleTherapeuten.find((t) => t.staff_member_id === staffMemberId);
    const ende = ziel.startMinute + dauer;

    // Die Umkehrung wird VOR dem Schreiben festgehalten: danach ist der alte
    // Stand aus den geladenen Terminen nicht mehr abzulesen.
    const altesDatum = g.datum;
    const altePerson = alleTherapeuten.find((t) => t.staff_member_id === g.eintrag.staff_member_id);

    const alteZeit = `${wochentagKurz(altesDatum)} ${tagesZahl(altesDatum)}, ${minuteZuZeit(g.beginnMinute)}–${minuteZuZeit(g.endeMinute)}`;
    const neueZeit = `${wochentagKurz(datum)} ${tagesZahl(datum)}, ${minuteZuZeit(ziel.startMinute)}–${minuteZuZeit(ende)}`;

    // Der Hinweis auf die Arbeitszeit gehört in DIESELBE Rückfrage (CAL-023).
    // Er stammt aus den geladenen Bändern der Zielspalte und ist nur dann
    // belastbar, wenn sie geladen sind; verbindlich entscheidet der Server, und
    // widerspricht er, kommt die Rückfrage mit dem Hinweis wieder.
    const zielSpalte = spaltenModell.find((s) => s.id === ziel.spalteId);
    const ausserhalb =
      wochenplan.isSuccess &&
      ausnahmen.isSuccess &&
      zielSpalte?.baender !== undefined &&
      zielSpalte.baender !== null &&
      !inArbeitszeit(zielSpalte.baender, ziel.startMinute, ende);

    // Ein Fehler der vorigen Verschiebung ist mit der neuen Geste erledigt.
    if (verschieben.isError) verschieben.reset();

    // Das Loslassen schreibt nicht mehr - es fragt (CAL-023).
    setVorschlag({
      zielSpalteId: ziel.spalteId,
      frage: {
        alteZeit,
        neueZeit,
        personWechsel:
          staffMemberId === g.eintrag.staff_member_id
            ? null
            : { von: alnamePerson(altePerson), nach: alnamePerson(person) },
        ausserhalb,
        // Der neue Tag vor dem heutigen: gefragt wird im selben Kasten (FIX-019).
        vergangenheit: liegtInVergangenheit(datum, heute),
      },
      v: {
        terminId: ziel.terminId,
        staffMemberId,
        datum,
        startMinute: ziel.startMinute,
        endeMinute: ende,
        beschreibung: `${alnamePerson(person)}, ${neueZeit}`,
      },
      zurueck: {
        terminId: ziel.terminId,
        staffMemberId: g.eintrag.staff_member_id,
        datum: altesDatum,
        startMinute: g.beginnMinute,
        endeMinute: g.endeMinute,
        beschreibung: `${alnamePerson(altePerson)}, ${wochentagKurz(altesDatum)} ${tagesZahl(altesDatum)}, ${minuteZuZeit(g.beginnMinute)}–${minuteZuZeit(g.endeMinute)}`,
      },
    });
  }

  /**
   * Was die Auswahl auf der freien Fläche bedeutet (CAL-019).
   *
   * Person und Tag stehen mit der Spalte fest, Beginn und Ende mit der
   * Spanne. Was daraus wird, fragt das Menü — und je Eintrag steht hier, wohin
   * der Weg führt. Ein angetippter Rasterpunkt hat keine Länge; dann kommt sie
   * aus der Vorbelegung der jeweiligen Art: beim Behandlungstermin das
   * Terminfenster (PROJECT_PRINCIPLES.md 8.1), bei der Fehlzeit gar keine —
   * ein Ereignis hat keine feste Länge, und das Formular fragt danach.
   *
   * Durchgesetzt wird beides serverseitig (CAL-010a, CAL-020); hier steht nur
   * die Vorbelegung.
   */
  function anlegenMenue(gewaehlt: Spanne): GitterAuswahl {
    const staffMemberId = p.ansicht === 'tag' ? gewaehlt.spalteId : wochenPerson;
    const datum = p.ansicht === 'tag' ? bereich.von : gewaehlt.spalteId;
    const spanne = gewaehlt.bisMinute > gewaehlt.vonMinute;
    // Wessen Spalte und welcher Tag - vor der Uhrzeit in der Leiste (KAL-10).
    const personName = alleTherapeuten.find(
      (t) => t.staff_member_id === staffMemberId,
    )?.display_name;
    const kopf = [personName, `${wochentagKurz(datum)} ${tagesZahl(datum)}`]
      .filter(Boolean)
      .join(' · ');
    // Fehlzeiten gibt es nur ab heute - der Server wiese sie ab (KAL-22).
    const vergangen = liegtInVergangenheit(datum, heute);
    const beginn = minuteZuZeit(gewaehlt.vonMinute);
    const ende = spanne ? minuteZuZeit(gewaehlt.bisMinute) : undefined;

    const person = staffMemberId ? { person: staffMemberId } : {};
    /** Der Weg mit Rückweg in genau diesen Kalenderstand (BEF-016). */
    function hin(ziel: string) {
      setAuswahl(null);
      void navigate(mitRueckweg(ziel, kalenderStand));
    }

    // Behandlungstermin: ohne aufgezogene Spanne das Terminfenster.
    const terminVorbelegung: TerminVorbelegung = {
      datum,
      beginn,
      ende: ende ?? minuteZuZeit(gewaehlt.vonMinute + TERMINFENSTER_MINUTEN),
      art: 'home_visit',
      ...person,
    };
    const terminParameter = schreibeTerminVorbelegung(terminVorbelegung);

    // Ist der Kalender auf eine Patient:in gefiltert, ist die Frage „für wen?"
    // längst beantwortet (CAL-015c) - dann geht es ohne zweite Suche direkt ins
    // Formular, samt Verordnung, wenn der Weg von dort kam.
    const terminZiel = p.patient
      ? `/patienten/${p.patient}/termine/neu${terminParameter}${
          p.verordnung ? `&verordnung=${p.verordnung}` : ''
        }`
      : `/termine/neu${terminParameter}`;

    // Fehlzeit und Dauerfehlzeit sind Ereignisse: Bezeichnung statt
    // Patient:in, freie Länge (CAL-021). Ohne Spanne bleibt das Ende offen.
    const ereignisParameter = schreibeTerminVorbelegung({
      datum,
      beginn,
      ...(ende ? { ende } : {}),
      ...person,
    });

    // Die Serie übernimmt Tag, Beginn und die Person der Spalte (KAL-05) -
    // nicht die Länge: Die steht beim Behandlungstermin im Terminfenster.
    const serienParameter = schreibeTerminVorbelegung({ datum, beginn, ...person });

    // Wer in dieser Spalte behandelt oder Training betreut (TRN-004). Ohne
    // Person in der Spalte - Woche ohne Wahl - stehen beide Wege offen.
    const behandelt = !staffMemberId || therapeuten.data?.behandlung.has(staffMemberId) === true;
    const trainiert = !staffMemberId || therapeuten.data?.training.has(staffMemberId) === true;
    const trainingsParameter = schreibeTerminVorbelegung({
      datum,
      beginn,
      ende: ende ?? minuteZuZeit(gewaehlt.vonMinute + TERMINFENSTER_MINUTEN),
      art: 'practice',
      ...person,
    });

    const praxisEintraege: GitterAuswahl['eintraege'] = [
      {
        schluessel: 'termin',
        beschriftung: `Neuer ${BEGRIFFE.termin}`,
        hinweis: spanne
          ? `${beginn}–${ende!} Uhr`
          : `${beginn} Uhr, ${TERMINFENSTER_MINUTEN} Minuten`,
        onWaehlen: () => hin(terminZiel),
      },
      // Ein Dauertermin ist eine Terminserie und gehört damit zu einer
      // Grundlage: Ihr offenes Kontingent gibt die Anzahl vor (CAL-007). Steht
      // sie im Kalenderstand, geht es direkt in die Serie; sonst fragt eine
      // kleine Seite erst nach der Person und dann nach der Grundlage - wie
      // der neue Termin, der ebenfalls ohne Vorauswahl geht (BEF-042).
      {
        schluessel: 'dauertermin',
        beschriftung: BEGRIFFE.dauertermin,
        hinweis: p.verordnung ? 'Terminserie aus der gefilterten Grundlage' : 'Terminserie',
        onWaehlen: () =>
          hin(
            p.patient && p.verordnung
              ? `/patienten/${p.patient}/verordnungen/${p.verordnung}/serie${serienParameter}`
              : `/termine/dauertermin${serienParameter}${p.patient ? `&patient=${p.patient}` : ''}`,
          ),
      },
      {
        schluessel: 'fehlzeit',
        beschriftung: BEGRIFFE.fehlzeit,
        hinweis: vergangen ? 'Nur ab heute möglich' : FEHLZEIT_BEISPIELE,
        deaktiviert: vergangen,
        onWaehlen: () => hin(`/termine/ereignis${ereignisParameter}`),
      },
      {
        schluessel: 'dauerfehlzeit',
        beschriftung: BEGRIFFE.dauerfehlzeit,
        hinweis: vergangen ? 'Nur ab heute möglich' : 'Über mehrere Wochen',
        deaktiviert: vergangen,
        onWaehlen: () => hin(`/termine/dauerfehlzeit${ereignisParameter}`),
      },
    ];

    const eintraege: GitterAuswahl['eintraege'] = [
      // Behandlungstermin und Dauertermin nur in der Spalte einer
      // behandelnden Person; Fehlzeiten in jeder (CAL-015b).
      ...(darfAendern
        ? praxisEintraege.filter(
            (e) => behandelt || e.schluessel === 'fehlzeit' || e.schluessel === 'dauerfehlzeit',
          )
        : []),
      ...(darfTraining && trainiert
        ? [
            {
              schluessel: 'training',
              beschriftung: 'Trainingstermin',
              hinweis: spanne
                ? `${beginn}–${ende!} Uhr`
                : `${beginn} Uhr, ${TERMINFENSTER_MINUTEN} Minuten`,
              onWaehlen: () => hin(`/training/termine/neu${trainingsParameter}`),
            },
          ]
        : []),
    ];

    return {
      ...gewaehlt,
      kopf,
      eintraege,
      // Escape und „Abbrechen": Der Fokus kehrt in die Spalte zurück (KAL-21).
      onSchliessen: () => {
        setAuswahl(null);
        setRasterFokus({ spalte: gewaehlt.spalteId });
      },
    };
  }

  /** Der Tastaturweg zum Trainingstermin (TRN-004), wie „Termin anlegen" daneben. */
  const trainingsterminAnlegen = (
    <ButtonLink
      to={mitRueckweg(
        `/training/termine/neu${schreibeTerminVorbelegung({
          datum: p.datum,
          art: 'practice',
          ...(p.ansicht === 'woche' && wochenPerson ? { person: wochenPerson } : {}),
          ...(p.ansicht === 'tag' && p.person ? { person: p.person } : {}),
        })}`,
        kalenderStand,
      )}
      variant="secondary"
    >
      Trainingstermin anlegen
    </ButtonLink>
  );

  const laedt = termine.isPending || therapeuten.isPending;
  // Ein Raster gibt es nur mit Spalten - und in der Woche nur mit einer
  // Person. Scheitert die Personenliste, stünde sonst eine leere Woche da, die
  // wie eine freie aussieht (KAL-07).
  const rasterDa =
    termine.isSuccess &&
    !laedt &&
    spaltenModell.length > 0 &&
    (p.ansicht === 'tag' || wochenPerson !== null);
  const laedtNach = termine.isPlaceholderData || ausnahmen.isPlaceholderData;

  // Die Kalenderwoche des gezeigten Ausschnitts und in der Tagesansicht der
  // Tag selbst (BEF-039): die Frage „wo bin ich?" in einer Zeile.
  const woche = kalenderwoche(bereich.von);
  const zeitraumKurz =
    p.ansicht === 'tag'
      ? `${wochentagKurz(p.datum)} ${tagesZahl(p.datum)}`
      : `${tagesZahl(bereich.von)}–${tagesZahl(tagePlus(bereich.bis, -1))}`;

  // Ein Filter, der nicht die Voreinstellung ist, steht am Knopf - ein fast
  // leerer Kalender ohne erkennbaren Grund ist ein Fehlerbild
  // (PROJECT_PRINCIPLES.md 13).
  const filterAktiv = p.standort !== null || p.status !== 'active';

  /**
   * Der Knopf zu Ansicht und Filter (BEF-039, ANN-109). Er steht in der Ecke
   * des Rasters; ohne Raster (Fehler, leere Praxis) steht er über der
   * Meldung, damit die Einstellungen erreichbar bleiben.
   */
  const optionenKnopf = (
    <Symbolknopf
      ref={optionenKnopfRef}
      beschriftung={filterAktiv ? 'Ansicht und Filter, Filter aktiv' : 'Ansicht und Filter'}
      // Aufgeklappt ist der Knopf ausgewählt: im System die gefüllte
      // Hauptfarbe. 44 px statt 40 (KAL-08, UIK-01).
      variant={optionenOffen ? 'primary' : 'quiet'}
      aria-expanded={optionenOffen}
      aria-controls="kalender-optionen"
      title="Ansicht und Filter"
      className="relative"
      onClick={() => setOptionenOffen((offen) => !offen)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
      {filterAktiv ? (
        <span className="bg-warnung rounded-pill absolute top-1 right-1 size-2.5" />
      ) : null}
    </Symbolknopf>
  );

  // Wessen Tour: die gezeigte Person, sonst wählt die Tourenseite selbst.
  const tourPerson = p.ansicht === 'woche' ? wochenPerson : p.person;

  return (
    <>
      {/* Über dem Raster nur noch Monat, Person mit Woche und „Jetzt"
          (BEF-039). Der Titel bleibt für Vorlesesoftware: Er benennt die
          Seite, sichtbar tut es die Navigation. */}
      <h1 className="sr-only">Kalender</h1>
      <p className="sr-only" aria-live="polite">
        {bereichsBeschriftung(p.ansicht, bereich.von, bereich.bis)}
      </p>

      <div className="flex items-center justify-between gap-1 sm:gap-3">
        <button
          ref={monatKnopfRef}
          type="button"
          aria-expanded={monatOffen}
          aria-controls="kalender-monat"
          onClick={() => setMonatOffen((offen) => !offen)}
          className="text-ink hover:bg-surface-sunken rounded-button inline-flex min-h-11 shrink-0 items-center gap-1 px-1 text-sm font-semibold sm:px-2"
        >
          <span className="sm:hidden">{monatKurz(p.datum, heute)}</span>
          <span className="hidden sm:inline">{monatLang(p.datum)}</span>
          <span aria-hidden="true" className="text-ink-muted text-xs">
            {monatOffen ? '▴' : '▾'}
          </span>
          <span className="sr-only">– Monatskalender</span>
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5">
          {/* 44 px auf jeder Breite (KAL-08, UIK-01) - am Telefon waren es 32. */}
          <Symbolknopf
            beschriftung="Vorheriger Zeitraum"
            className="text-xl"
            onClick={() => setze({ datum: blaettern(p.ansicht, p.datum, -1) })}
          >
            ‹
          </Symbolknopf>
          <div className="flex min-w-0 flex-col items-center text-center">
            {/* Der Name ist zugleich die Wahl der Person - dort, wo man ihn
                liest. Eine Auswahlliste des Browsers: am Telefon die
                vertraute Walze, am Rechner mit der Tastatur bedienbar. */}
            <select
              aria-label="Behandelnde Person"
              value={(p.ansicht === 'woche' ? wochenPerson : p.person) ?? ''}
              onChange={(e) => setze({ person: e.target.value || null })}
              // 44 px hoch und 16 px Schrift (KAL-08): Darunter zoomt iOS beim
              // Antippen hinein, und mit Handschuhen traf man 22 px schlecht.
              className="text-ink hover:bg-surface-sunken rounded-button min-h-11 max-w-full min-w-0 cursor-pointer truncate bg-transparent px-1 text-center text-base font-semibold"
            >
              {/* In der Woche steht immer genau eine Person im Gitter. */}
              {p.ansicht === 'tag' ? <option value="">Alle Personen</option> : null}
              {alleTherapeuten.map((t) => (
                <option key={t.staff_member_id} value={t.staff_member_id}>
                  {t.display_name}
                </option>
              ))}
            </select>
            <span className="text-ink-muted text-xs whitespace-nowrap tabular-nums">
              KW {woche} · {zeitraumKurz}
            </span>
          </div>
          <Symbolknopf
            beschriftung="Nächster Zeitraum"
            className="text-xl"
            onClick={() => setze({ datum: blaettern(p.ansicht, p.datum, 1) })}
          >
            ›
          </Symbolknopf>
        </div>

        {/* Zum aktuellen Zeitpunkt: heutiger Tag, und das Raster rollt zur
            Linie der aktuellen Uhrzeit (BEF-039). */}
        <Button
          type="button"
          variant="secondary"
          groesse="kompakt"
          className="shrink-0"
          onClick={() => {
            if (p.datum !== heute) setze({ datum: heute });
            setSprung((n) => n + 1);
          }}
        >
          Heute
        </Button>
      </div>

      {/* Der Ansichtswechsel im Kopf (Design-Handoff 2026-10-01, Abschnitt 7a):
          am Rechner „Woche | Team", am Telefon „Tag | Team". Die Woche zeigt
          die eigenen Termine, der Tag am Telefon ebenso; „Team" ist der Tag mit
          einer Spalte je Person. Dieselben Ansichten wie bisher - der Weg
          dorthin steht jetzt sichtbar statt hinter „Ansicht und Filter". */}
      <div role="group" aria-label="Ansicht" className="mt-2 flex">
        {(
          [
            {
              wert: 'woche',
              text: 'Woche',
              klasse: 'rounded-l-button max-sm:hidden',
              aktiv: p.ansicht === 'woche',
              ziel: { ansicht: 'woche' as const, person: user.staffMemberId ?? p.person },
            },
            {
              wert: 'tag-eigen',
              text: 'Tag',
              klasse: 'rounded-l-button sm:hidden',
              aktiv: p.ansicht === 'tag' && p.person !== null,
              ziel: { ansicht: 'tag' as const, person: user.staffMemberId ?? null },
            },
            {
              wert: 'team',
              text: 'Team',
              klasse: 'rounded-r-button',
              aktiv: p.ansicht === 'tag' && p.person === null,
              ziel: { ansicht: 'tag' as const, person: null },
            },
          ] as const
        ).map((wahl) => (
          <button
            key={wahl.wert}
            type="button"
            aria-pressed={wahl.aktiv}
            onClick={() => setze(wahl.ziel)}
            className={`border-line-strong inline-flex min-h-11 items-center border px-4 text-sm font-semibold transition-colors [&+&]:-ml-px ${
              wahl.aktiv
                ? 'bg-accent text-surface border-accent'
                : 'text-accent hover:bg-accent-soft'
            } ${wahl.klasse}`}
          >
            {wahl.text}
          </button>
        ))}
      </div>

      {monatOffen ? (
        <Monatskalender
          id="kalender-monat"
          datum={p.datum}
          heute={heute}
          gewaehlt={tage}
          onWaehlen={(tag) => {
            setMonatOffen(false);
            setze({ datum: tag });
            // Der Fokus kehrt an den Monatsknopf zurück (KAL-21).
            monatKnopfRef.current?.focus();
          }}
          onSchliessen={() => {
            setMonatOffen(false);
            monatKnopfRef.current?.focus();
          }}
        />
      ) : null}

      {optionenOffen ? (
        <div
          ref={optionenRef}
          id="kalender-optionen"
          role="group"
          aria-label="Ansicht und Filter"
          className="border-line-strong bg-surface rounded-card mt-3 flex flex-col gap-4 border p-4"
          // Escape schließt und gibt den Fokus an den Eckknopf zurück (KAL-21).
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            setOptionenOffen(false);
            optionenKnopfRef.current?.focus();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1">
              {/* „Woche | Team" steht seit dem Design-Handoff vom 2026-10-01
                  im Kopf; hier bleibt die Tour. */}
              {/* Die Tour als dritte Ansicht (BEF-044, ANN-113): dieselben
                  Fragen wie hier - Tag und Person -, deshalb reisen beide
                  mit. Die eigene Zeile „Kalender · Touren" über dem Raster
                  ist dafür entfallen; `/touren` bleibt als Adresse. */}
              {/* Die Tourenseite gehört zur Praxis; die Trainingsbetreuung
                  hat sie nicht (TRN-006). */}
              {darfAendern ? (
                <ButtonLink
                  to={`/touren?${new URLSearchParams({
                    tag: p.datum,
                    ...(tourPerson ? { person: tourPerson } : {}),
                  }).toString()}`}
                  variant="secondary"
                >
                  Tour
                </ButtonLink>
              ) : null}
            </div>

            {/* Zoom (CAL-011). Beschriftet wird nicht die Pixelzahl, sondern
                was sie bewirkt - das Raster, das dabei sichtbar ist.
                `aria-live` sagt die Änderung an, weil sonst nur ein Bild sich
                ändert. Am Telefon geht dasselbe mit zwei Fingern (BEF-038). */}
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <Button
                type="button"
                variant="secondary"
                aria-label="Raster gröber"
                disabled={p.zoom === ZOOMSTUFEN[0]}
                onClick={() => zoomen(-1)}
              >
                −
              </Button>
              <span
                aria-live="polite"
                className="text-ink-muted min-w-34 text-center text-xs tabular-nums"
              >
                {rasterBeschriftung(linien.fein, linien.halbeStunde)}
              </span>
              <Button
                type="button"
                variant="secondary"
                aria-label="Raster feiner"
                disabled={p.zoom === ZOOMSTUFEN[ZOOMSTUFEN.length - 1]}
                onClick={() => zoomen(1)}
              >
                +
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Scheitert die Liste, sagt das der Kasten - eine Auswahl nur
                mit „Alle" sähe aus wie eine Praxis ohne Standorte (KAL-07). */}
            {standorte.isError ? (
              <ErrorState
                title="Die Standorte konnten nicht geladen werden."
                description="Bitte die Verbindung prüfen und erneut versuchen."
                onErneut={() => standorte.refetch()}
              />
            ) : (
              <Select
                label="Standort"
                value={p.standort ?? ''}
                onChange={(e) => setze({ standort: e.target.value || null })}
              >
                <option value="">Alle</option>
                {(standorte.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            )}

            <Select
              label="Status"
              value={p.status}
              onChange={(e) => setze({ status: e.target.value as StatusFilter })}
            >
              <option value="active">Alle außer abgesagten</option>
              <option value="confirmed">Nur bestätigte</option>
              <option value="done">Nur erledigte</option>
              <option value="no_show">Nur nicht angetroffene</option>
              <option value="cancelled">Nur abgesagte</option>
              <option value="all">Alle</option>
            </Select>
          </div>

          {/* Der Weg ueber die Tastatur zu dem, was das Tippen auf eine freie
              Stelle abkuerzt (UX-005, CAL-019): Eine Spanne zieht man nicht
              mit der Tastatur auf. Ohne Uhrzeit: die waehlt das Formular.
              „Dauertermin" fragt nach Person und Grundlage (BEF-042). */}
          {darfAendern ? (
            <div className="flex flex-wrap gap-2">
              {/* Tag umplanen bei einem Ausfall (CAL-009). Nur dort, wo Person
                  UND Tag feststehen: in der Tagesansicht mit Personenfilter.
                  Ohne beides wäre der Knopf eine Einladung zum teuersten
                  denkbaren Irrtum. */}
              {p.ansicht === 'tag' && p.person ? (
                <ButtonLink
                  // Mit dem Kalenderstand als Rückweg (KAL-19).
                  to={mitRueckweg(
                    `/kalender/tag-umplanen?person=${p.person}&datum=${p.datum}`,
                    kalenderStand,
                  )}
                  variant="secondary"
                >
                  Tag umplanen
                </ButtonLink>
              ) : null}
              <ButtonLink
                to={mitRueckweg(
                  `/termine/neu${schreibeTerminVorbelegung({
                    datum: p.datum,
                    art: 'home_visit',
                    ...(p.ansicht === 'woche' && wochenPerson ? { person: wochenPerson } : {}),
                    ...(p.ansicht === 'tag' && p.person ? { person: p.person } : {}),
                  })}`,
                  kalenderStand,
                )}
                variant="secondary"
              >
                Termin anlegen
              </ButtonLink>
              {/* Eine Fehlzeit des Praxisbetriebs - Besprechung, Teamtermin
                  (CAL-015b). Eigener Weg neben dem Termin: Er kennt weder
                  Patient:in noch Grundlage, und seine Länge ist frei. */}
              <ButtonLink
                to={mitRueckweg(
                  `/termine/ereignis${schreibeTerminVorbelegung({ datum: p.datum })}`,
                  kalenderStand,
                )}
                variant="secondary"
              >
                {BEGRIFFE.fehlzeit} eintragen
              </ButtonLink>
              <ButtonLink
                to={mitRueckweg(
                  `/termine/dauerfehlzeit${schreibeTerminVorbelegung({ datum: p.datum })}`,
                  kalenderStand,
                )}
                variant="secondary"
              >
                {BEGRIFFE.dauerfehlzeit} eintragen
              </ButtonLink>
              <ButtonLink
                to={mitRueckweg(
                  `/termine/dauertermin${schreibeTerminVorbelegung({ datum: p.datum })}`,
                  kalenderStand,
                )}
                variant="secondary"
              >
                {BEGRIFFE.dauertermin} anlegen
              </ButtonLink>
              {/* Wer auf einen Termin wartet (PRX-001). */}
              <ButtonLink to={mitRueckweg('/warteliste', kalenderStand)} variant="secondary">
                Warteliste
              </ButtonLink>
              {darfTraining ? trainingsterminAnlegen : null}
            </div>
          ) : darfTraining ? (
            <div className="flex flex-wrap gap-2">{trainingsterminAnlegen}</div>
          ) : null}

          {/* Die Bedienhilfe stand als Dauertext unter 1 250 px Raster
              (KAL-26). Hier ist sie eingeklappt dort, wo man nach Ansicht
              und Bedienung sucht - und nur, wenn es ein Raster gibt, das sie
              beschreibt. Mit der Erklärung der Zeichen in den Kacheln. */}
          {rasterDa ? (
            <Disclosure summary="So bedienen Sie den Kalender">
              <div className="text-ink-muted flex max-w-prose flex-col gap-3 text-sm">
                <p>
                  Auf freier Zeit wählt ein Tipp einen Zeitpunkt, ein zweiter Tipp in derselben
                  Spalte die Spanne bis dorthin. Ein Tipp in die Auswahl hebt sie wieder auf.
                </p>
                <p>
                  Termine lassen sich mit der Maus oder dem Finger auf eine andere Zeit
                  {p.ansicht === 'tag'
                    ? ' oder eine andere behandelnde Person'
                    : ' oder einen anderen Tag'}{' '}
                  ziehen; der Beginn rastet auf dem Praxisraster ein, die Dauer bleibt gleich. Am
                  Rand des Fensters scrollt die Seite mit, und wer den Zeiger seitlich am Raster
                  hält, blättert in den nächsten Ausschnitt. Nach dem Loslassen fragt der Kalender
                  mit alter und neuer Zeit nach – verschoben wird erst auf die Bestätigung, und
                  danach lässt es sich rückgängig machen.
                </p>
                <p>
                  Dasselbe geht jederzeit über „Bearbeiten“ in der Detailansicht – das Ziehen ist
                  eine Abkürzung, kein eigener Weg.
                </p>
                <p>
                  Mit zwei Fingern oder über „+“ und „−“ wird das Raster feiner oder gröber;
                  gezeichnet wird dabei genau das Raster, auf dem ein Termin einrastet.
                </p>
                <ul className="flex flex-col gap-1">
                  <li>
                    <span aria-hidden="true" className="text-ink">
                      ▪{' '}
                    </span>
                    vor der Bezeichnung: eine {BEGRIFFE.fehlzeit}, ein Eintrag ohne Patient:in
                  </li>
                  <li>
                    <span aria-hidden="true" className="text-ink inline-flex align-[-0.1em]">
                      <SpannenBild />
                    </span>{' '}
                    neben der Zeit: Die Länge weicht ab, weder 45 noch 60 Minuten.
                  </li>
                  <li>
                    Grau schraffiert: außerhalb der Arbeitszeit der Person – auch ein Tag ohne
                    hinterlegte Arbeitszeit. Die weiße Fläche ist ihre Arbeitszeit.
                  </li>
                  <li>
                    Gestrichelt in Grün, „Weg ≈ n min“: die Fahrt zum Besuch, vom Termin davor oder
                    vom Startort der Praxis. Ob es reicht, sagt der Fahrpuffer.
                  </li>
                  <li>
                    Gelb gestrichelt, „! Adresse veraltet“: Die Akte nennt inzwischen eine andere
                    Anschrift. In der Akte unter Stammdaten den Termin umstellen, dann gibt es
                    wieder eine Fahrzeit.
                  </li>
                </ul>
                <p>
                  Der Kalender zeigt ausschließlich organisatorische Angaben. Zeiten gelten in der
                  Zeitzone der Praxis.
                </p>
              </div>
            </Disclosure>
          ) : null}
        </div>
      ) : null}

      {/* Eine Nachbildung ohne Kartendienst sieht aus wie eine Fahrzeit; die
          Seite sagt es dazu, wie Tour und Übersicht (MAP-006c). */}
      {fahrwege.nachbildung ? (
        <Statusmeldung ton="warnung" className="mt-3">
          Nachbildung ohne Kartendienst: Die Fahrwege sind über die Luftlinie mit 15 km/h gerechnet.
        </Statusmeldung>
      ) : null}

      {/* MAP-006c: Fahrpuffer nach §8.1, wo Person und Tag feststehen. Der
          Stand der Termine dieser Person steckt im Schlüssel - nach einer
          Verschiebung wird neu geprüft. Eine Warnung, keine Sperre. */}
      {p.ansicht === 'tag' && p.person ? (
        <FahrpufferHinweis
          datum={p.datum}
          staffMemberId={p.person}
          zeitzone={zone}
          stand={eintraege
            .filter((e) => e.staff_member_id === p.person)
            .map((e) => `${e.id}:${e.starts_at}:${e.ends_at}:${e.status}`)
            .join('|')}
        />
      ) : null}

      {/* Der Filter aus der Akte steht sichtbar über dem Gitter und lässt sich
          mit einem Tap aufheben: Ein Kalender, der ohne erkennbaren Grund fast
          leer ist, ist ein Fehlerbild (PROJECT_PRINCIPLES.md 13). */}
      {p.patient ? (
        <div
          role="status"
          className="border-line-strong bg-surface-sunken rounded-card mt-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
        >
          <p className="text-ink text-sm">
            Nur die Termine von{' '}
            <strong>
              {gefilterterName
                ? `${gefilterterName.patient_given_name} ${gefilterterName.patient_family_name}`
                : 'einer Patient:in'}
            </strong>
            . Andere Termine dieses Zeitraums sind ausgeblendet.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/patienten/${p.patient}/termine`} variant="secondary">
              Zur Akte
            </ButtonLink>
            <Button type="button" variant="secondary" onClick={() => setze({ patient: null })}>
              Filter aufheben
            </Button>
          </div>
        </div>
      ) : null}

      {/* Zurück aus dem Formular (FIX-016): Der neue Termin ist im Gitter
          hervorgehoben; die Zeile sagt es auch dem, der nicht hinsieht. */}
      {neuerTermin && termine.isSuccess ? (
        <Statusmeldung ton="erfolg" className="mt-4">
          Termin angelegt.{' '}
          {gitterEintraege.some((g) => g.eintrag.id === neuerTermin) ? (
            // Kein eigener Termin mehr: Der Knopf wählt ihn im Panel aus.
            <button
              type="button"
              className={textlinkKlassen(false)}
              onClick={() => setGewaehltId(neuerTermin)}
            >
              Termin öffnen
            </button>
          ) : (
            'Er liegt außerhalb des gezeigten Ausschnitts.'
          )}
        </Statusmeldung>
      ) : null}

      {/* Zurück aus dem Fehlzeit-Formular (KAL-22): Die Fehlzeit kann an
          einem anderen Tag liegen - die Zeile sagt, dass es geklappt hat. */}
      {eingangsmeldung ? <Rueckmeldung className="mt-4">{eingangsmeldung}</Rueckmeldung> : null}

      {eingetragen ? (
        <Statusmeldung ton="erfolg" className="mt-4">
          {eingetragen === 'dauerfehlzeit' ? BEGRIFFE.dauerfehlzeit : BEGRIFFE.fehlzeit}{' '}
          eingetragen.
        </Statusmeldung>
      ) : null}

      {/* Nur noch der Rest: Läuft oder scheitert ein Verschieben, während
          weder Rückfrage noch Rückgängig-Leiste steht - etwa, weil
          inzwischen geblättert wurde. Sonst steht beides dort (KAL-01). */}
      {verschieben.isPending && !vorschlag && !rueckgaengig ? (
        <Statusmeldung className="mt-4">Der Termin wird verschoben …</Statusmeldung>
      ) : null}

      {verschieben.isError && !vorschlag && !rueckgaengig ? (
        <div className="mt-4">
          <ErrorState
            title="Der Termin konnte nicht verschoben werden."
            description={verschieben.error.message}
          />
        </div>
      ) : null}

      {laedt ? <LoadingState label="Termine werden geladen …" /> : null}
      {/* Ladefehler mit einem Weg heraus (KAL-07, WRT-01), mit Abstand zur
          Bedienzeile (ZST-21): Ein Funkloch darf nicht aussehen wie eine
          leere Praxis oder ein freier Tag. */}
      {therapeuten.isError ? (
        <div className="mt-3">
          <ErrorState
            title="Die behandelnden Personen konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => therapeuten.refetch()}
          />
        </div>
      ) : null}
      {termine.isError ? (
        <div className="mt-3">
          <ErrorState
            title="Die Termine konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => termine.refetch()}
          />
        </div>
      ) : null}

      {/* Der Leerzustand steht über dem Raster und nennt den Filter
          (KAL-26) - unter 1 250 px Raster sah ihn niemand. Nicht während
          ein neuer Ausschnitt lädt: Dann stünde der alte Zustand da. */}
      {rasterDa && !laedtNach && gitterEintraege.length === 0 ? (
        <EmptyState title={leerTitel(p)} />
      ) : null}

      {/* Beim Blättern bleibt der alte Stand stehen, bis der neue da ist
          (FIX-018). Das sagt diese Zeile - statt das Raster blass zu zeichnen
          (KAL-18): Deckkraft ist im System kein Zustand. */}
      {rasterDa && laedtNach ? (
        <Statusmeldung className="mt-3">Der Zeitraum wird geladen …</Statusmeldung>
      ) : null}

      {rasterDa ? (
        <CalendarGrid
          // Der Rückweg ist der Kalenderstand selbst - Ansicht, Datum,
          // Zoomstufe und alle Filter (UX-012). Wer von einer Kachel in den
          // Termin springt, kommt damit genau hierher zurück.
          rueckweg={kalenderStand}
          spaltenModell={spaltenModell}
          eintraege={gitterEintraege}
          fenster={fenster}
          raster={user.appointmentGridMinutes}
          stundenHoehe={p.zoom}
          // Auch bei offener Rückfrage darf weitergezogen werden (BEF-015):
          // Die nächste Geste ersetzt den Vorschlag, statt gesperrt zu sein.
          ziehbarErlaubt={darfAendern && !verschieben.isPending}
          // Rückfrage beim Verschieben (CAL-023, FIX-017): immer, auch bei
          // freier Zielzeit, gezeichnet im Gitter - und der Hinweis auf die
          // Arbeitszeit steht in ihr, nicht in einem zweiten Kasten dahinter.
          vorschlag={
            vorschlag
              ? {
                  terminId: vorschlag.v.terminId,
                  spalteId: vorschlag.zielSpalteId,
                  startMinute: vorschlag.v.startMinute,
                  endeMinute: vorschlag.v.endeMinute,
                  frage: vorschlag.frage,
                  laeuft: verschieben.isPending,
                  onBestaetigen: () =>
                    verschieben.mutate({
                      v: vorschlag.v,
                      // Bestätigt ist die Arbeitszeit nur, wenn die Rückfrage
                      // sie genannt hat. Sonst fragt der Server zurück (CAL-005).
                      bestaetigt: vorschlag.frage.ausserhalb,
                      vergangenheit: vorschlag.frage.vergangenheit,
                      zurueck: vorschlag.zurueck,
                      aus: vorschlag,
                    }),
                  // Scheitert das Verschieben aus einem anderen Grund als
                  // Arbeitszeit oder Vergangenheit, steht der Fehler in der
                  // Rückfrage selbst (KAL-01).
                  fehler:
                    verschieben.isError &&
                    !istAusserhalbArbeitszeit(verschieben.error) &&
                    !istVergangenheit(verschieben.error)
                      ? verschieben.error.message
                      : undefined,
                  onAbbrechen: () => {
                    // Ein Fehler des abgebrochenen Versuchs ist mit ihm erledigt.
                    if (verschieben.isError) verschieben.reset();
                    setVorschlag(null);
                    // Der Fokus kehrt an die Kachel zurück, um die es ging (KAL-21).
                    setRasterFokus({ kachel: vorschlag.v.terminId });
                  },
                }
              : null
          }
          onVerschieben={ablegen}
          kontext={bereich.von}
          // Waehrend des Blaetterns stehen noch die alten Termine da; das
          // Gitter meldet es mit aria-busy, die Zeile darueber sagt es.
          laedtNach={laedtNach}
          onBlaettern={(richtung) => setze({ datum: blaettern(p.ansicht, p.datum, richtung) })}
          // Zwei Finger wirken wie „+" und „−" (BEF-038) - ohne die Auswahl
          // zu verwerfen (KAL-11).
          onZoom={zoomen}
          fokus={rasterFokus}
          // In der Woche beginnt das Raster beim heutigen Tag (RSP-03).
          startSpalte={p.ansicht === 'woche' && tage.includes(heute) ? heute : null}
          // Ein zweiter Tipp hebt auf oder zieht die Spanne auf (BEF-035,
          // BEF-036); was er bewirkt, entscheidet `naechsteAuswahl`.
          ecke={optionenKnopf}
          // Die Linie der aktuellen Uhrzeit in den Spalten, die heute sind.
          jetzt={
            jetztMinute === null || !tage.includes(heute)
              ? null
              : {
                  minute: jetztMinute,
                  spalten: p.ansicht === 'tag' ? spaltenModell.map((x) => x.id) : [heute],
                }
          }
          sprung={sprung}
          onAuswahl={
            darfAendern || darfTraining
              ? (neu) => setAuswahl((bisher) => naechsteAuswahl(bisher, neu))
              : undefined
          }
          auswahl={auswahl ? anlegenMenue(auswahl) : null}
          // Ein Tipp auf die Kachel öffnet das Terminpanel (Abschnitt 7a).
          onWaehlen={(eintrag) =>
            setGewaehltId((bisher) => (bisher === eintrag.id ? null : eintrag.id))
          }
          gewaehlt={gewaehlt?.id ?? null}
          beschriftung={
            p.ansicht === 'tag'
              ? 'Tagesansicht nach behandelnder Person'
              : 'Wochenansicht einer behandelnden Person'
          }
        />
      ) : null}

      {/* Rückgängig-Leiste (UX-010). Ein Termin wandert mit einer Geste, und
          eine Geste ist schnell versehentlich gemacht. Das Rückgängig ist
          selbst ein normaler Schreibvorgang: derselbe Weg, dieselben
          serverseitigen Prüfungen, ein eigener Auditeintrag. Ist der alte
          Platz inzwischen belegt, sagt der Server das - und der Termin bleibt,
          wo er ist.

          Seit KAL-01 steht sie unten, an der Stelle der Anlegen-Leiste, und
          trägt den Fokus: Über dem Raster stand sie nach einem
          Nachmittagstermin rund 1 000 px außer Sicht. Seit BEF-075 fest am
          Bildrand statt klebend: Klebend hing sie am Ende des Rasters und
          stand je nach Bildlauf doch außerhalb. Solange eine
          Rückfrage oder die Anlegen-Leiste offen ist, tritt sie zurück: zwei
          Kästen übereinander wären eine Frage zu viel (CAL-023). */}
      {rueckgaengig && !vorschlag && !auswahl && !gewaehlt ? (
        <div
          role="status"
          className="border-line-strong bg-surface-sunken nicht-drucken rounded-card fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[28rem]"
        >
          <p className="text-ink text-sm">
            Termin verschoben. Vorher: <strong>{rueckgaengig.beschreibung}</strong>
          </p>
          <Button
            ref={rueckgaengigRef}
            type="button"
            variant="secondary"
            disabled={verschieben.isPending}
            onClick={() =>
              // `bestaetigt` steht auf true: der alte Platz war bereits in
              // Gebrauch, eine Arbeitszeit-Rückfrage dafür wäre eine Frage
              // nach etwas, das die Praxis schon so hatte.
              // Dasselbe fuer die Vergangenheit: Der alte Platz war der alte Platz.
              verschieben.mutate({ v: rueckgaengig, bestaetigt: true, vergangenheit: true })
            }
          >
            {verschieben.isPending ? 'Wird zurückgeholt …' : 'Rückgängig'}
          </Button>
          {verschieben.isError ? (
            <Statusmeldung ton="fehler" className="basis-full">
              Der Termin konnte nicht zurückgeholt werden. {verschieben.error.message}
            </Statusmeldung>
          ) : null}
        </div>
      ) : null}

      {/* Solange das Fenster „Aktionen" offen ist, weicht das Panel: Es läge
          ohnehin gesperrt darunter, und nichts stünde doppelt da. */}
      {gewaehlt && !vorschlag && !auswahl && !aktionenId ? (
        <TerminPanel
          eintrag={gewaehlt}
          user={user}
          rueckweg={kalenderStand}
          onSchliessen={() => {
            setGewaehltId(null);
            if (terminImLink) setSuche(new URLSearchParams(kalenderSuche), { replace: true });
          }}
          onAktionen={() => setAktionenId(gewaehlt.id)}
        />
      ) : null}

      {aktionenId ? (
        <TerminAktionenDialog
          appointmentId={aktionenId}
          user={user}
          eingehend={kalenderStand}
          zumTermin={`${kalenderStand}&${TERMIN_PARAM}=${aktionenId}`}
          onSchliessen={() => setAktionenId(null)}
        />
      ) : null}

      {/* Ohne Raster keine Ecke: Der Knopf steht dann hier, damit Ansicht
          und Filter erreichbar bleiben (BEF-039). */}
      {!laedt && !rasterDa ? <div className="mt-3">{optionenKnopf}</div> : null}

      {/* Nur aus geladenen Daten (KAL-07, ZST-09): Scheitert die Liste, sagt
          das der Fehlerkasten oben und nicht „keine Person hinterlegt". */}
      {therapeuten.isSuccess && alleTherapeuten.length === 0 ? (
        <EmptyState title="Für diese Praxis ist keine behandelnde Person hinterlegt." />
      ) : null}
    </>
  );
}
