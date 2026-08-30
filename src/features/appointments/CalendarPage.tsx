import { useMemo, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import type { CurrentUser } from '@/features/session/types';
import {
  appointmentStatusLabels,
  appointmentTypeLabels,
  dayKey,
  fetchAppointments,
  fetchAssignableTherapists,
  fetchLocations,
  formatLocalTime,
  minutesOfDay,
  todayInTimeZone,
  type CalendarEntry,
} from './api';
import {
  bereichFuer,
  blaettern,
  leseParameter,
  position,
  schreibeParameter,
  kachelBreite,
  spalten,
  tageImBereich,
  tagesFenster,
  type KalenderAnsicht,
  type KalenderParameter,
  type StatusFilter,
} from './calendar';

/**
 * Zentrale Kalenderansicht (CAL-002).
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

function uhrzeit(eintrag: CalendarEntry, zone: string): string {
  return `${formatLocalTime(eintrag.starts_at, zone)}–${formatLocalTime(eintrag.ends_at, zone)}`;
}

function ortsHinweis(eintrag: CalendarEntry): string {
  if (eintrag.appointment_type === 'practice') return eintrag.location_name ?? '—';
  if (eintrag.appointment_type === 'video') return 'Video';
  return 'Hausbesuch';
}

/** Eine Terminkachel. Im Wochengitter zusätzlich zeitlich eingeordnet. */
function Terminkachel({
  eintrag,
  zone,
  farbe,
  stil,
  gitter,
}: {
  eintrag: CalendarEntry;
  zone: string;
  farbe: string;
  stil?: CSSProperties;
  gitter: boolean;
}) {
  const abgesagt = eintrag.status === 'cancelled';

  return (
    <Link
      to={`/termine/${eintrag.id}`}
      title={
        gitter
          ? `${appointmentTypeLabels[eintrag.appointment_type]} · ${ortsHinweis(eintrag)}`
          : undefined
      }
      style={{ borderLeftColor: farbe, ...stil }}
      className={[
        'border-line bg-surface hover:bg-surface-sunken block overflow-hidden rounded-lg border',
        'border-l-4 px-2 py-1.5 text-left transition-colors',
        abgesagt ? 'opacity-60' : '',
        gitter
          ? 'mb-1.5 min-h-11 lg:absolute lg:top-[var(--top)] lg:left-[var(--left)] lg:mb-0 lg:h-[var(--h)] lg:min-h-0 lg:w-[var(--w)]'
          : 'min-h-11',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="text-ink block truncate text-sm font-medium">
        {eintrag.patient_given_name} {eintrag.patient_family_name}
      </span>
      <span className="text-ink-muted block truncate text-xs">
        {uhrzeit(eintrag, zone)} · {eintrag.staff_given_name} {eintrag.staff_family_name}
      </span>
      {gitter ? (
        abgesagt ? (
          <span className="text-ink-subtle block truncate text-xs">
            {appointmentStatusLabels.cancelled}
          </span>
        ) : null
      ) : (
        <span className="text-ink-subtle block truncate text-xs">
          {appointmentTypeLabels[eintrag.appointment_type]} · {ortsHinweis(eintrag)}
          {abgesagt ? ` · ${appointmentStatusLabels.cancelled}` : ''}
        </span>
      )}
    </Link>
  );
}

/** Tagesansicht: rein chronologisch, auf jeder Breite dieselbe Liste. */
function Tagesliste({
  eintraege,
  zone,
  farbeVon,
}: {
  eintraege: CalendarEntry[];
  zone: string;
  farbeVon: (staffId: string) => string;
}) {
  if (eintraege.length === 0) {
    return (
      <p className="text-ink-muted py-8 text-sm">Für diesen Tag sind keine Termine geplant.</p>
    );
  }

  return (
    <ul className="mt-4 flex flex-col gap-2">
      {eintraege.map((e) => (
        <li key={e.id}>
          <Terminkachel
            eintrag={e}
            zone={zone}
            farbe={farbeVon(e.staff_member_id)}
            gitter={false}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * Wochenansicht.
 *
 * Auf dem Desktop sieben Tagesspalten mit Stundenachse; die Termine sind
 * proportional zur Uhrzeit angeordnet und überlappende Personen stehen
 * nebeneinander. Ab hier abwärts greifen die `lg:`-Regeln nicht mehr: dieselbe
 * Auszeichnung wird zur gestapelten Tagesagenda, ohne zweites Markup und ohne
 * erzwungene Sieben-Spalten-Woche auf schmalen Displays.
 */
function Wochengitter({
  tage,
  proTag,
  zone,
  farbeVon,
  heute,
}: {
  tage: string[];
  proTag: Map<string, CalendarEntry[]>;
  zone: string;
  farbeVon: (staffId: string) => string;
  heute: string;
}) {
  const alle = tage.flatMap((t) => proTag.get(t) ?? []);
  const fenster = tagesFenster(
    alle.map((e) => ({
      beginn: minutesOfDay(e.starts_at, zone),
      ende: minutesOfDay(e.ends_at, zone),
    })),
  );

  const stunden: number[] = [];
  for (let m = fenster.vonMinute; m < fenster.bisMinute; m += 60) stunden.push(m);
  const hoehe = Math.max(360, ((fenster.bisMinute - fenster.vonMinute) / 60) * 48);

  return (
    <div className="mt-4 lg:grid lg:grid-cols-[3rem_repeat(7,minmax(0,1fr))] lg:gap-1">
      {/* Stundenachse - nur im Gitter sinnvoll. */}
      <div className="hidden lg:block" aria-hidden="true">
        <div className="h-7" />
        <div className="relative" style={{ height: `${hoehe}px` }}>
          {stunden.map((m) => (
            <div
              key={m}
              className="text-ink-subtle absolute right-1 -translate-y-1/2 text-[0.6875rem]"
              style={{
                top: `${((m - fenster.vonMinute) / (fenster.bisMinute - fenster.vonMinute)) * 100}%`,
              }}
            >
              {String(Math.floor(m / 60)).padStart(2, '0')}:00
            </div>
          ))}
        </div>
      </div>

      {tage.map((tag) => {
        const eintraege = proTag.get(tag) ?? [];
        const minuten = eintraege.map((e) => ({
          beginn: minutesOfDay(e.starts_at, zone),
          ende: minutesOfDay(e.ends_at, zone),
        }));
        const verteilung = spalten(minuten);

        return (
          <section key={tag} className="mt-5 lg:mt-0">
            <h3
              className={[
                'flex h-7 items-center gap-1.5 text-sm font-medium',
                tag === heute ? 'text-accent' : 'text-ink-muted',
              ].join(' ')}
            >
              <span>{wochentagKurz(tag)}</span>
              <span className="text-ink-subtle">{tagesZahl(tag)}</span>
              {tag === heute ? <span className="sr-only">(heute)</span> : null}
            </h3>

            <div
              className="border-line relative lg:rounded-lg lg:border"
              style={{ ['--tag-hoehe' as string]: `${hoehe}px` }}
            >
              <div className="lg:h-[var(--tag-hoehe)]">
                {eintraege.length === 0 ? (
                  <p className="text-ink-subtle py-2 text-xs lg:hidden">Keine Termine.</p>
                ) : null}
                {eintraege.map((e, i) => {
                  const { top, hoehe: h } = position(minuten[i]!.beginn, minuten[i]!.ende, fenster);
                  const { spalte, anzahl } = verteilung[i]!;
                  const { links, breite } = kachelBreite(spalte, anzahl);
                  return (
                    <Terminkachel
                      key={e.id}
                      eintrag={e}
                      zone={zone}
                      farbe={farbeVon(e.staff_member_id)}
                      gitter
                      stil={
                        {
                          ['--top']: `${top}%`,
                          ['--h']: `${h}%`,
                          ['--left']: `${links}%`,
                          ['--w']: `${breite}%`,
                          // Die spaetere Kachel legt sich ueber den rechten
                          // Rand der frueheren, statt sie zu verdecken.
                          zIndex: spalte + 1,
                        } as CSSProperties
                      }
                    />
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function CalendarPage({ user }: { user: CurrentUser }) {
  const [suche, setSuche] = useSearchParams();
  const zone = user.organizationTimeZone;

  // Ohne Praxiszeitzone wird der Kalender nicht dargestellt (siehe unten).
  // Die Ableitungen brauchen trotzdem einen gueltigen Kalendertag: Hooks
  // duerfen nicht bedingt laufen, und ein leerer Wert liess die
  // Kalenderarithmetik abstuerzen statt den Fehlerzustand zu zeigen.
  const heute = zone ? todayInTimeZone(zone) : '1970-01-01';
  const p = leseParameter(suche, heute);
  const bereich = bereichFuer(p.ansicht, p.datum);

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

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

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

  const proTag = useMemo(() => {
    const karte = new Map<string, CalendarEntry[]>();
    if (!zone) return karte;
    for (const e of eintraege) {
      const tag = dayKey(e.starts_at, zone);
      const bisher = karte.get(tag);
      if (bisher) bisher.push(e);
      else karte.set(tag, [e]);
    }
    return karte;
  }, [eintraege, zone]);

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
  const sichtbarePersonen = (therapeuten.data ?? []).filter((t) =>
    eintraege.some((e) => e.staff_member_id === t.staff_member_id),
  );

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
          value={p.person ?? ''}
          onChange={(e) => setze({ person: e.target.value || null })}
        >
          <option value="">Alle</option>
          {(therapeuten.data ?? []).map((t) => (
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
          <option value="scheduled">Nur geplante</option>
          <option value="cancelled">Nur abgesagte</option>
          <option value="all">Geplante und abgesagte</option>
        </Select>
      </div>

      {sichtbarePersonen.length > 1 ? (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1" aria-label="Farbzuordnung">
          {sichtbarePersonen.map((t) => (
            <li
              key={t.staff_member_id}
              className="text-ink-muted flex items-center gap-1.5 text-xs"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: farbeVon(t.staff_member_id) }}
              />
              {t.display_name}
            </li>
          ))}
        </ul>
      ) : null}

      {termine.isPending ? <LoadingState label="Termine werden geladen …" /> : null}
      {termine.isError ? <ErrorState title="Die Termine konnten nicht geladen werden." /> : null}

      {termine.isSuccess && p.ansicht === 'tag' ? (
        <Tagesliste eintraege={proTag.get(bereich.von) ?? []} zone={zone} farbeVon={farbeVon} />
      ) : null}

      {termine.isSuccess && p.ansicht === 'woche' ? (
        <Wochengitter tage={tage} proTag={proTag} zone={zone} farbeVon={farbeVon} heute={heute} />
      ) : null}

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Der Kalender zeigt ausschließlich organisatorische Angaben. Zeiten gelten in der Zeitzone
        der Praxis ({zone}).
      </p>
    </>
  );
}
