import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
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
  todayInTimeZone,
  updateAppointment,
} from './api';
import { CalendarGrid, type GitterEintrag, type GitterSpalte } from './CalendarGrid';
import {
  arbeitszeitBaender,
  bereichFuer,
  blaettern,
  fensterMitArbeitszeit,
  leseParameter,
  minuteZuZeit,
  schreibeParameter,
  tageImBereich,
  tagesFenster,
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

/** Was beim Verschieben an den Server geht, samt Beschreibung für die Rückfrage. */
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

  const [offen, setOffen] = useState<Verschiebung | null>(null);

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
    mutationFn: async (auftrag: { v: Verschiebung; bestaetigt: boolean }) => {
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
    onSuccess: async () => {
      setOffen(null);
      // Erst jetzt wandert die Kachel - vorher hat der Server nichts zugesagt.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: (fehler, auftrag) => {
      setOffen(istAusserhalbArbeitszeit(fehler) ? auftrag.v : null);
    },
  });

  function setze(teil: Partial<KalenderParameter>) {
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
        }))
      : tage.map((tag) => ({
          id: tag,
          titel: wochentagKurz(tag),
          unterTitel: tagesZahl(tag),
          hervorgehoben: tag === heute,
          baender: wochenPerson
            ? arbeitszeitBaender(wochenPerson, tag, wochenplanDaten, ausnahmenDaten)
            : [],
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
    });
  }

  const laedt = termine.isPending || therapeuten.isPending;

  return (
    <>
      <PageHeader
        title="Kalender"
        description={bereichsBeschriftung(p.ansicht, bereich.von, bereich.bis)}
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
        <p className="text-ink-muted mt-4 text-sm" role="status">
          Der Termin wird verschoben …
        </p>
      ) : null}

      {offen ? (
        <div
          role="group"
          aria-label="Außerhalb der Arbeitszeit"
          className="border-line-strong bg-surface-sunken mt-4 rounded-lg border p-4"
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

      {termine.isSuccess && !laedt && spaltenModell.length > 0 ? (
        <CalendarGrid
          spaltenModell={spaltenModell}
          eintraege={gitterEintraege}
          fenster={fenster}
          raster={user.appointmentGridMinutes}
          ziehbarErlaubt={darfAendern && !verschieben.isPending}
          onVerschieben={ablegen}
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
        eigener Weg.
      </p>

      <p className="text-ink-subtle mt-4 max-w-prose text-xs leading-relaxed">
        Der Kalender zeigt ausschließlich organisatorische Angaben. Zeiten gelten in der Zeitzone
        der Praxis ({zone}); der hinterlegte Hintergrund einer Spalte ist die Arbeitszeit.
      </p>
    </>
  );
}
