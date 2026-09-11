import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { fetchWorkingHourExceptions, fetchWorkingHours } from '@/features/scheduling/api';
import {
  dayKey,
  fetchAppointment,
  fetchAppointments,
  fetchAssignableTherapists,
  fetchLocations,
  istAusserhalbArbeitszeit,
  minutesOfDay,
  schreibeTerminVorbelegung,
  STANDARD_DAUER_MINUTEN,
  todayInTimeZone,
  updateAppointment,
  type TerminVorbelegung,
} from './api';
import { CalendarGrid, type GitterEintrag, type GitterSpalte } from './CalendarGrid';
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

/** Was beim Verschieben an den Server geht, samt Beschreibung für die Rückfrage. */
/** Anzeigename einer behandelnden Person, auch wenn die Liste sie nicht kennt. */
function alnamePerson(person: { display_name: string } | undefined): string {
  return person?.display_name ?? 'Behandelnde Person';
}

interface Verschiebung {
  terminId: string;
  staffMemberId: string;
  datum: string;
  startMinute: number;
  endeMinute: number;
  beschreibung: string;
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
  const bereich = bereichFuer(p.ansicht, p.datum);
  // Welche Linien die gewaehlte Zoomstufe traegt - dieselbe Auskunft fuer die
  // Beschriftung der Bedienung und fuer das Gitter selbst.
  const linien = gitterlinien(p.zoom, user.appointmentGridMinutes);

  const [offen, setOffen] = useState<Verschiebung | null>(null);
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
      setOffen(null);
      setRueckgaengig(auftrag.zurueck ?? null);
      // Erst jetzt wandert die Kachel - vorher hat der Server nichts zugesagt.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
    onError: (fehler, auftrag) => {
      setOffen(istAusserhalbArbeitszeit(fehler) ? auftrag.v : null);
    },
  });

  function setze(teil: Partial<KalenderParameter>) {
    // Wer den Ausschnitt wechselt, hat die letzte Verschiebung hinter sich
    // gelassen - eine Leiste, die dabei stehen bliebe, boete das Rueckgaengig
    // fuer etwas an, das gar nicht mehr zu sehen ist.
    setRueckgaengig(null);
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
  const sichtbar =
    p.ansicht === 'woche' ? eintraege.filter((e) => e.staff_member_id === wochenPerson) : eintraege;

  const gitterEintraege: GitterEintrag[] = sichtbar.map((e) => ({
    eintrag: e,
    spalteId: p.ansicht === 'tag' ? e.staff_member_id : dayKey(e.starts_at, zone),
    beginnMinute: minutesOfDay(e.starts_at, zone),
    endeMinute: minutesOfDay(e.ends_at, zone),
    farbe: farbeVon(e.staff_member_id),
    // Nur geplante Termine werden gezogen. Ein abgeschlossener müsste erst
    // wieder geöffnet werden, ein abgesagter bleibt terminal (CAL-004).
    ziehbar: e.status === 'scheduled',
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

    setOffen(null);
    verschieben.mutate({
      v: {
        terminId: ziel.terminId,
        staffMemberId,
        datum,
        startMinute: ziel.startMinute,
        endeMinute: ende,
        beschreibung: `${person?.display_name ?? 'Behandelnde Person'}, ${wochentagKurz(datum)} ${tagesZahl(datum)}, ${minuteZuZeit(ziel.startMinute)}–${minuteZuZeit(ende)}`,
      },
      bestaetigt: false,
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
   * Das Ende wird auf 60 Minuten nach dem Beginn vorbelegt
   * (PROJECT_PRINCIPLES.md 8.1). Das ist die Vorbelegung, nicht die
   * Durchsetzung - die verlangt 8.1 serverseitig und sie kommt mit CAL-010a.
   */
  function freieZeit(ziel: { spalteId: string; startMinute: number }) {
    const staffMemberId = p.ansicht === 'tag' ? ziel.spalteId : wochenPerson;
    const datum = p.ansicht === 'tag' ? bereich.von : ziel.spalteId;

    const vorbelegung: TerminVorbelegung = {
      datum,
      beginn: minuteZuZeit(ziel.startMinute),
      ende: minuteZuZeit(ziel.startMinute + STANDARD_DAUER_MINUTEN),
      art: 'home_visit',
      ...(staffMemberId ? { person: staffMemberId } : {}),
    };
    void navigate(`/termine/neu${schreibeTerminVorbelegung(vorbelegung)}`);
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
            <ButtonLink
              to={`/termine/neu${schreibeTerminVorbelegung({
                datum: p.datum,
                art: 'home_visit',
                ...(p.ansicht === 'woche' && wochenPerson ? { person: wochenPerson } : {}),
                ...(p.ansicht === 'tag' && p.person ? { person: p.person } : {}),
              })}`}
              variant="secondary"
            >
              Termin anlegen
            </ButtonLink>
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
          <option value="active">Geplante und abgeschlossene</option>
          <option value="scheduled">Nur geplante</option>
          <option value="completed">Nur abgeschlossene</option>
          <option value="cancelled">Nur abgesagte</option>
          <option value="all">Alle</option>
        </Select>
      </div>

      {verschieben.isPending ? (
        <Statusmeldung className="mt-4">Der Termin wird verschoben …</Statusmeldung>
      ) : null}

      {offen ? (
        <div
          role="group"
          aria-label="Außerhalb der Arbeitszeit"
          className="border-line-strong bg-surface-sunken rounded-card mt-4 border p-4"
        >
          <p className="text-ink text-sm">
            {offen.beschreibung} liegt außerhalb der hinterlegten Arbeitszeit. Der Termin wurde noch
            nicht verschoben.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={verschieben.isPending}
              onClick={() => verschieben.mutate({ v: offen, bestaetigt: true })}
            >
              Trotzdem verschieben
            </Button>
            <Button type="button" variant="quiet" onClick={() => setOffen(null)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : null}

      {verschieben.isError && !offen ? (
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
      {rueckgaengig && !verschieben.isPending ? (
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
          spaltenModell={spaltenModell}
          eintraege={gitterEintraege}
          fenster={fenster}
          raster={user.appointmentGridMinutes}
          stundenHoehe={p.zoom}
          ziehbarErlaubt={darfAendern && !verschieben.isPending}
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
          {p.ansicht === 'tag'
            ? 'Für diesen Tag sind keine Termine geplant.'
            : 'Für diese Woche sind keine Termine geplant.'}
        </p>
      ) : null}

      <p className="text-ink-subtle mt-6 max-w-prose text-xs leading-relaxed">
        Termine lassen sich mit der Maus oder dem Finger auf eine andere Zeit
        {p.ansicht === 'tag'
          ? ' oder eine andere behandelnde Person'
          : ' oder einen anderen Tag'}{' '}
        ziehen; der Beginn rastet auf dem Praxisraster ein, die Dauer bleibt gleich. Dasselbe geht
        jederzeit über „Bearbeiten" in der Detailansicht — das Ziehen ist eine Abkürzung, kein
        eigener Weg. Über „+" und „−" wird das Gitter feiner oder gröber; gezeichnet wird dabei
        genau das Raster, auf dem ein Termin einrastet.
      </p>

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Der Kalender zeigt ausschließlich organisatorische Angaben. Zeiten gelten in der Zeitzone
        der Praxis ({zone}); der hinterlegte Hintergrund einer Spalte ist die Arbeitszeit.
      </p>
    </>
  );
}
