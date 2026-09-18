import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchWorkingHourExceptions, fetchWorkingHours } from '@/features/scheduling/api';
import {
  dayKey,
  fetchAppointment,
  fetchAppointments,
  fetchAssignableTherapists,
  fetchLocations,
  istAusserhalbArbeitszeit,
  minutesOfDay,
  NEUER_TERMIN_PARAM,
  schreibeTerminVorbelegung,
  TERMINFENSTER_MINUTEN,
  todayInTimeZone,
  updateAppointment,
  type TerminVorbelegung,
} from './api';
import { CalendarGrid, type GitterEintrag, type GitterSpalte } from './CalendarGrid';
import { VerschiebenRueckfrage, type VerschiebenFrage } from './VerschiebenRueckfrage';
import {
  arbeitszeitBaender,
  bereichFuer,
  blaettern,
  fensterMitArbeitszeit,
  gitterlinien,
  leseParameter,
  minuteZuZeit,
  schreibeParameter,
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
const PERSONEN_FARBEN = [
  'oklch(48% 0.075 205)',
  'oklch(50% 0.09 145)',
  'oklch(52% 0.1 60)',
  'oklch(48% 0.1 300)',
  'oklch(50% 0.09 25)',
  'oklch(45% 0.06 260)',
] as const;

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
  const p = leseParameter(suche, heute);
  // Der gerade angelegte Termin (FIX-016): einmal hervorgehoben, beim
  // naechsten Blaettern faellt der Parameter weg (`schreibeParameter`).
  const neuerTermin = suche.get(NEUER_TERMIN_PARAM);
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

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
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
  });

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
  });

  const eintraege = useMemo(() => termine.data ?? [], [termine.data]);

  // Feste Farbzuordnung über die Personen der Praxis, damit dieselbe Person
  // beim Blättern nicht die Farbe wechselt.
  const farbeVon = useMemo(() => {
    const liste = (therapeuten.data ?? []).map((t) => t.staff_member_id);
    return (staffId: string) => {
      const index = liste.indexOf(staffId);
      return PERSONEN_FARBEN[(index < 0 ? 0 : index) % PERSONEN_FARBEN.length]!;
    };
  }, [therapeuten.data]);

  const verschieben = useMutation({
    mutationFn: async (auftrag: {
      v: Verschiebung;
      bestaetigt: boolean;
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
      );
    },
    onSuccess: async (_ergebnis, auftrag) => {
      setVorschlag(null);
      setRueckgaengig(auftrag.zurueck ?? null);
      // Erst jetzt wandert die Kachel - vorher hat der Server nichts zugesagt.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
    onError: (fehler, auftrag) => {
      // Der Server sieht die Zielzeit außerhalb der Arbeitszeit, die geladenen
      // Arbeitszeiten sahen es nicht (veraltet oder nicht geladen): DIESELBE
      // Rückfrage kommt mit dem Hinweis wieder - kein zweiter Kasten (CAL-023).
      //
      // Nur, wenn diese Rückfrage noch offen ist: Wer inzwischen geblättert
      // hat, bekommt keine Frage zu einem Ausschnitt, der nicht mehr dasteht.
      setVorschlag((aktuell) =>
        istAusserhalbArbeitszeit(fehler) && auftrag.aus && aktuell === auftrag.aus
          ? { ...auftrag.aus, frage: { ...auftrag.aus.frage, ausserhalb: true } }
          : null,
      );
    },
  });

  function setze(teil: Partial<KalenderParameter>) {
    // Wer den Ausschnitt wechselt, hat die letzte Verschiebung hinter sich
    // gelassen - eine Leiste, die dabei stehen bliebe, boete das Rueckgaengig
    // fuer etwas an, das gar nicht mehr zu sehen ist.
    setRueckgaengig(null);
    // Dasselbe gilt fuer eine offene Rueckfrage: Sie nennt Zeiten aus einem
    // Ausschnitt, der gleich nicht mehr dasteht.
    setVorschlag(null);
    setSuche(schreibeParameter({ ...p, ...teil }), { replace: false });
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
  const alleTherapeuten = therapeuten.data ?? [];
  const wochenplanDaten = wochenplan.data ?? [];
  const ausnahmenDaten = ausnahmen.data ?? [];

  // In der Wochenansicht steht genau eine Person im Gitter. Ohne ausdrückliche
  // Wahl ist das die erste der Praxis - eine Darstellungsentscheidung.
  const wochenPerson = p.person ?? alleTherapeuten[0]?.staff_member_id ?? null;

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
    beschriftung: `Wochenplan von ${name}`,
  });

  const zumTag = (tag: string) => ({
    // Ohne Person: der Tag gehoert allen: genau die Frage, die die
    // Tagesansicht beantwortet.
    to: `/kalender?${schreibeParameter({ ...p, ansicht: 'tag', datum: tag, person: null })}`,
    beschriftung: `Tagesansicht aller behandelnden Personen am ${wochentagKurz(tag)} ${tagesZahl(tag)}`,
  });

  const spaltenModell: GitterSpalte[] =
    p.ansicht === 'tag'
      ? tagesPersonen.map((t) => ({
          id: t.staff_member_id,
          titel: t.display_name,
          baender: arbeitszeitBaender(
            t.staff_member_id,
            bereich.von,
            wochenplanDaten,
            ausnahmenDaten,
          ),
          ziel: zumWochenplan(t.staff_member_id, t.display_name),
        }))
      : tage.map((tag) => ({
          id: tag,
          titel: wochentagKurz(tag),
          unterTitel: tagesZahl(tag),
          hervorgehoben: tag === heute,
          baender: wochenPerson
            ? arbeitszeitBaender(wochenPerson, tag, wochenplanDaten, ausnahmenDaten)
            : [],
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
    farbe: farbeVon(e.staff_member_id),
    // Nur bestätigte Termine werden gezogen. Ein abgeschlossener oder als
    // nicht angetroffen geführter müsste erst wieder geöffnet werden, ein
    // abgesagter bleibt terminal (CAL-004, ADR-018).
    ziehbar: e.status === 'confirmed',
    ...(e.id === neuerTermin ? { neu: true } : {}),
  }));

  const fenster = fensterMitArbeitszeit(
    tagesFenster(gitterEintraege.map((g) => ({ beginn: g.beginnMinute, ende: g.endeMinute }))),
    spaltenModell.flatMap((s) => s.baender),
  );

  /** Übersetzt eine Zielspalte zurück in Person und Datum. */
  function ablegen(ziel: { terminId: string; spalteId: string; startMinute: number }) {
    const g = gitterEintraege.find((x) => x.eintrag.id === ziel.terminId);
    if (!g) return;

    const dauer = g.endeMinute - g.beginnMinute;
    const staffMemberId = p.ansicht === 'tag' ? ziel.spalteId : g.eintrag.staff_member_id;
    const datum = p.ansicht === 'tag' ? bereich.von : ziel.spalteId;
    const person = alleTherapeuten.find((t) => t.staff_member_id === staffMemberId);
    const ende = ziel.startMinute + dauer;

    // Die Umkehrung wird VOR dem Schreiben festgehalten: danach ist der alte
    // Stand aus den geladenen Terminen nicht mehr abzulesen.
    const altesDatum = p.ansicht === 'tag' ? bereich.von : g.spalteId;
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
      zielSpalte !== undefined &&
      !inArbeitszeit(zielSpalte.baender, ziel.startMinute, ende);

    // Ein Fehler der vorigen Verschiebung ist mit der neuen Geste erledigt.
    if (verschieben.isError) verschieben.reset();

    // Das Loslassen schreibt nicht mehr - es fragt (CAL-023).
    setVorschlag({
      frage: {
        alteZeit,
        neueZeit,
        personWechsel:
          staffMemberId === g.eintrag.staff_member_id
            ? null
            : { von: alnamePerson(altePerson), nach: alnamePerson(person) },
        ausserhalb,
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
   * Tippen auf eine freie Stelle: Zeit und Person stehen damit fest, die
   * Patient:in noch nicht (UX-005). Die Auswahl passiert auf der naechsten
   * Seite; hier wird nur uebersetzt, was die Spalte bedeutet.
   *
   * Das Ende ergibt sich aus dem Terminfenster (PROJECT_PRINCIPLES.md 8.1).
   * Durchgesetzt wird es serverseitig in create_appointment (CAL-010a); hier
   * steht nur die Vorbelegung, die das Formular ohnehin selbst ableitet.
   */
  function freieZeit(ziel: { spalteId: string; startMinute: number }) {
    const staffMemberId = p.ansicht === 'tag' ? ziel.spalteId : wochenPerson;
    const datum = p.ansicht === 'tag' ? bereich.von : ziel.spalteId;

    const vorbelegung: TerminVorbelegung = {
      datum,
      beginn: minuteZuZeit(ziel.startMinute),
      ende: minuteZuZeit(ziel.startMinute + TERMINFENSTER_MINUTEN),
      art: 'home_visit',
      ...(staffMemberId ? { person: staffMemberId } : {}),
    };

    const parameter = schreibeTerminVorbelegung(vorbelegung);

    // Ist der Kalender auf eine Person gefiltert, ist die Frage „für wen?"
    // längst beantwortet (CAL-015c). Dann führt die freie Stelle direkt ins
    // Formular dieser Person - samt Verordnung, wenn der Weg von dort kam -
    // statt noch einmal durch die Suche. Der Rückweg ist der Kalenderstand,
    // damit „Abbrechen" wieder an derselben Stelle landet.
    if (p.patient) {
      const ziel = `/patienten/${p.patient}/termine/neu${parameter}${
        p.verordnung ? `&verordnung=${p.verordnung}` : ''
      }`;
      void navigate(mitRueckweg(ziel, `/kalender?${suche.toString()}`));
      return;
    }

    // Auch ohne Personenfilter: Der Kalenderstand ist der Rückweg, damit das
    // Anlegen wieder hier landet - nicht in der Terminansicht (BEF-016).
    void navigate(mitRueckweg(`/termine/neu${parameter}`, `/kalender?${suche.toString()}`));
  }

  const laedt = termine.isPending || therapeuten.isPending;

  return (
    <>
      <PageHeader
        title="Kalender"
        description={bereichsBeschriftung(p.ansicht, bereich.von, bereich.bis)}
        actions={
          // Der Weg ueber die Tastatur zu dem, was das Tippen auf eine freie
          // Stelle abkuerzt (UX-005). Ohne Uhrzeit: die waehlt das Formular.
          darfAendern ? (
            <div className="flex flex-wrap gap-2">
              {/* Tag umplanen bei einem Ausfall (CAL-009). Nur dort, wo Person
                  UND Tag feststehen: in der Tagesansicht mit Personenfilter.
                  Ohne beides wäre der Knopf eine Einladung zum teuersten
                  denkbaren Irrtum. */}
              {p.ansicht === 'tag' && p.person ? (
                <ButtonLink
                  to={`/kalender/tag-umplanen?person=${p.person}&datum=${p.datum}`}
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
                  `/kalender?${suche.toString()}`,
                )}
                variant="secondary"
              >
                Termin anlegen
              </ButtonLink>
              {/* Ein Ereignis des Praxisbetriebs - Besprechung, Teamtermin
                  (CAL-015b). Eigener Weg neben dem Termin: Er kennt weder
                  Patient:in noch Verordnung, und seine Länge ist frei. Der
                  Rückweg ist der Kalenderstand. */}
              <ButtonLink
                to={mitRueckweg(
                  `/termine/ereignis${schreibeTerminVorbelegung({ datum: p.datum })}`,
                  `/kalender?${suche.toString()}`,
                )}
                variant="secondary"
              >
                Ereignis eintragen
              </ButtonLink>
            </div>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Ansicht">
          {(['tag', 'woche'] as const).map((a) => (
            <Button
              key={a}
              type="button"
              variant={p.ansicht === a ? 'primary' : 'secondary'}
              aria-pressed={p.ansicht === a}
              onClick={() => setze({ ansicht: a })}
            >
              {a === 'tag' ? 'Tag' : 'Woche'}
            </Button>
          ))}
        </div>

        <div className="flex gap-1">
          <Button
            type="button"
            variant="secondary"
            aria-label="Vorheriger Zeitraum"
            onClick={() => setze({ datum: blaettern(p.ansicht, p.datum, -1) })}
          >
            ←
          </Button>
          <Button type="button" variant="secondary" onClick={() => setze({ datum: heute })}>
            Heute
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-label="Nächster Zeitraum"
            onClick={() => setze({ datum: blaettern(p.ansicht, p.datum, 1) })}
          >
            →
          </Button>
        </div>

        {/* Zoom (CAL-011). Beschriftet wird nicht die Pixelzahl, sondern was
            sie bewirkt - das Raster, das dabei sichtbar ist. `aria-live` sagt
            die Änderung an, weil sonst nur ein Bild sich ändert. */}
        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <Button
            type="button"
            variant="secondary"
            aria-label="Gitter verkleinern"
            disabled={p.zoom === ZOOMSTUFEN[0]}
            onClick={() => setze({ zoom: zoomSchritt(p.zoom, -1) })}
          >
            −
          </Button>
          <span
            aria-live="polite"
            className="text-ink-muted min-w-[8.5rem] text-center text-xs tabular-nums"
          >
            {rasterBeschriftung(linien.fein, linien.halbeStunde)}
          </span>
          <Button
            type="button"
            variant="secondary"
            aria-label="Gitter vergrößern"
            disabled={p.zoom === ZOOMSTUFEN[ZOOMSTUFEN.length - 1]}
            onClick={() => setze({ zoom: zoomSchritt(p.zoom, 1) })}
          >
            +
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Select
          label="Behandelnde Person"
          value={(p.ansicht === 'woche' ? wochenPerson : p.person) ?? ''}
          onChange={(e) => setze({ person: e.target.value || null })}
        >
          {/* In der Woche steht immer genau eine Person im Gitter. */}
          {p.ansicht === 'tag' ? <option value="">Alle</option> : null}
          {alleTherapeuten.map((t) => (
            <option key={t.staff_member_id} value={t.staff_member_id}>
              {t.display_name}
            </option>
          ))}
        </Select>

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
        <Statusmeldung className="mt-4">
          Termin angelegt.{' '}
          {gitterEintraege.some((g) => g.eintrag.id === neuerTermin) ? (
            <Link
              to={mitRueckweg(`/termine/${neuerTermin}`, `/kalender?${suche.toString()}`)}
              className="text-accent hover:underline"
            >
              Termin öffnen
            </Link>
          ) : (
            'Er liegt außerhalb des gezeigten Ausschnitts.'
          )}
        </Statusmeldung>
      ) : null}

      {verschieben.isPending && !vorschlag ? (
        <Statusmeldung className="mt-4">Der Termin wird verschoben …</Statusmeldung>
      ) : null}

      {/* Rückfrage beim Verschieben (CAL-023): immer, auch bei freier
          Zielzeit - und der Hinweis auf die Arbeitszeit steht in ihr, nicht in
          einem zweiten Kasten dahinter. */}
      {vorschlag ? (
        <VerschiebenRueckfrage
          frage={vorschlag.frage}
          laeuft={verschieben.isPending}
          onBestaetigen={() =>
            verschieben.mutate({
              v: vorschlag.v,
              // Bestätigt ist die Arbeitszeit nur, wenn die Rückfrage sie
              // genannt hat. Sonst fragt der Server zurück (CAL-005).
              bestaetigt: vorschlag.frage.ausserhalb,
              zurueck: vorschlag.zurueck,
              aus: vorschlag,
            })
          }
          onAbbrechen={() => setVorschlag(null)}
        />
      ) : null}

      {verschieben.isError && !vorschlag ? (
        <div className="mt-4">
          <ErrorState
            title="Der Termin konnte nicht verschoben werden."
            description={verschieben.error.message}
          />
        </div>
      ) : null}

      {laedt ? <LoadingState label="Termine werden geladen …" /> : null}
      {termine.isError ? <ErrorState title="Die Termine konnten nicht geladen werden." /> : null}

      {/* Rückgängig-Leiste (UX-010). Ein Termin wandert mit einer Geste, und
          eine Geste ist schnell versehentlich gemacht. Das Rückgängig ist
          selbst ein normaler Schreibvorgang: derselbe Weg, dieselben
          serverseitigen Prüfungen, ein eigener Auditeintrag. Ist der alte
          Platz inzwischen belegt, sagt der Server das - und der Termin bleibt,
          wo er ist. */}
      {/* Solange eine Rueckfrage offen ist, tritt die Leiste zurueck: zwei
          Kaesten zu zwei verschiedenen Verschiebungen waeren eine Frage zu
          viel. Nach dem Abbrechen steht sie wieder da (CAL-023). */}
      {rueckgaengig && !verschieben.isPending && !vorschlag ? (
        <div
          role="status"
          className="border-line-strong bg-surface-sunken nicht-drucken rounded-card mt-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
        >
          <p className="text-ink text-sm">
            Termin verschoben. Vorher: <strong>{rueckgaengig.beschreibung}</strong>
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              // `bestaetigt` steht auf true: der alte Platz war bereits in
              // Gebrauch, eine Arbeitszeit-Rückfrage dafür wäre eine Frage
              // nach etwas, das die Praxis schon so hatte.
              verschieben.mutate({ v: rueckgaengig, bestaetigt: true })
            }
          >
            Rückgängig
          </Button>
        </div>
      ) : null}

      {termine.isSuccess && !laedt && spaltenModell.length > 0 ? (
        <CalendarGrid
          // Der Rückweg ist der Kalenderstand selbst - Ansicht, Datum,
          // Zoomstufe und alle Filter (UX-012). Wer von einer Kachel in den
          // Termin springt, kommt damit genau hierher zurück.
          rueckweg={`/kalender?${suche.toString()}`}
          spaltenModell={spaltenModell}
          eintraege={gitterEintraege}
          fenster={fenster}
          raster={user.appointmentGridMinutes}
          stundenHoehe={p.zoom}
          // Solange eine Rückfrage offen ist, wird nicht weitergezogen: Sonst
          // stünde eine Frage da, deren Kachel schon woanders hängt (CAL-023).
          ziehbarErlaubt={darfAendern && !verschieben.isPending && !vorschlag}
          onVerschieben={ablegen}
          onFreieZeit={darfAendern ? freieZeit : undefined}
          beschriftung={
            p.ansicht === 'tag'
              ? 'Tagesansicht nach behandelnder Person'
              : 'Wochenansicht einer behandelnden Person'
          }
        />
      ) : null}

      {termine.isSuccess && !laedt && spaltenModell.length === 0 ? (
        <p className="text-ink-muted mt-4 text-sm">
          Für diese Praxis ist keine behandelnde Person hinterlegt.
        </p>
      ) : null}

      {termine.isSuccess && !laedt && spaltenModell.length > 0 && gitterEintraege.length === 0 ? (
        <p className="text-ink-muted mt-3 text-sm">
          {p.patient
            ? p.ansicht === 'tag'
              ? 'Für diese Patient:in steht an diesem Tag kein Termin an.'
              : 'Für diese Patient:in steht in dieser Woche kein Termin an.'
            : p.ansicht === 'tag'
              ? 'Für diesen Tag sind keine Termine geplant.'
              : 'Für diese Woche sind keine Termine geplant.'}
        </p>
      ) : null}

      <p className="text-ink-subtle mt-6 max-w-prose text-xs leading-relaxed">
        Termine lassen sich mit der Maus oder dem Finger auf eine andere Zeit
        {p.ansicht === 'tag'
          ? ' oder eine andere behandelnde Person'
          : ' oder einen anderen Tag'}{' '}
        ziehen; der Beginn rastet auf dem Praxisraster ein, die Dauer bleibt gleich. Nach dem
        Loslassen fragt der Kalender mit alter und neuer Zeit nach — verschoben wird erst auf die
        Bestätigung, und danach lässt es sich rückgängig machen. Dasselbe geht jederzeit über
        „Bearbeiten" in der Detailansicht — das Ziehen ist eine Abkürzung, kein eigener Weg. Über
        „+" und „−" wird das Gitter feiner oder gröber; gezeichnet wird dabei genau das Raster, auf
        dem ein Termin einrastet.
      </p>

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Der Kalender zeigt ausschließlich organisatorische Angaben. Zeiten gelten in der Zeitzone
        der Praxis ({zone}); der hinterlegte Hintergrund einer Spalte ist die Arbeitszeit.
      </p>
    </>
  );
}
