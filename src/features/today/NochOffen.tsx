import type { ReactNode } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { hakenFehlt } from '@/features/appointments/haken';
import { TerminAbschliessenKnopf } from '@/features/appointments/TerminAbschliessen';
import type { RejectedTimeOff } from '@/features/timeaccount/api';
import { TIME_ACCOUNT_HOME } from '@/features/timeaccount/paths';
import { nachUhrzeit, offenGrund, TAGESPLAN_VORHALTEDAUER_MS } from './api';
import { schreibseite } from './besuchswege';
import { nichtAbgeschlossen, terminName } from './tagesstart';
import { formatLocalTime, tagePlus } from '@/lib/datum';
import { fetchDayPlan, type DayPlanEntry } from '@/lib/tagesplan';

/**
 * Was an einem Besuch noch fehlt, als Wort - oder `null`, wenn nichts fehlt.
 *
 * Nicht abgeschlossen (vorbei, kein Haken), Doku offen oder im Entwurf; die
 * Doku nur für die, die schreiben (`istOffen`). `jetzt` entscheidet, ob ein
 * bestätigter Besuch schon vorbei ist.
 */
function fehlt(termin: DayPlanEntry, darfDokumentieren: boolean, jetzt: number): string | null {
  if (termin.kind !== 'therapy' || !termin.patient_id) return null;
  // B4: Festgeschrieben, aber nicht abgehakt - es fehlt nur der Haken.
  if (nichtAbgeschlossen(termin, jetzt)) {
    return termin.status === 'documented' ? 'Haken fehlt' : 'Nicht abgeschlossen';
  }
  return darfDokumentieren ? offenGrund(termin) : null;
}

/**
 * Was eine Zeile anbietet: der Haken, wo nur er fehlt (B4), sonst „Doku“.
 * Der Haken ist der Weg, den auch die Übersicht geht (`complete_appointment`).
 */
function ZeilenAktion({
  termin,
  darfDokumentieren,
}: {
  termin: DayPlanEntry;
  darfDokumentieren: boolean;
}) {
  if (termin.status === 'documented' && hakenFehlt(termin.status, termin.checked_at)) {
    return <TerminAbschliessenKnopf appointmentId={termin.id} name={terminName(termin)} />;
  }
  return darfDokumentieren ? <DokuKnopf termin={termin} /> : null;
}

/**
 * „Ausfall“ unter der Zeile (B12): Das Feld dahinter - Protokoll am
 * Hausbesuch, Rückfrage sonst - braucht die volle Breite, neben dem Ziel
 * hätte es keinen Platz. Wann er steht, entscheidet die Übersicht
 * (`ausfallMoeglich`, Recht der Rolle); hier wird er nur platziert.
 */
function ausfallZeile(knopf: ReactNode): ReactNode {
  if (knopf === null || knopf === undefined || knopf === false) return null;
  return <div className="flex flex-wrap items-center justify-end gap-x-3 pb-2">{knopf}</div>;
}

function DokuKnopf({ termin }: { termin: DayPlanEntry }) {
  return (
    <ButtonLink to={schreibseite(termin.id)} variant="secondary">
      Doku <span className="sr-only">zu {terminName(termin)}</span>
    </ButtonLink>
  );
}

/** Das Warnzeichen vor einem Grund, wie an den Besuchen. */
function Warnung({ children }: { children: ReactNode }) {
  return (
    <span className="text-warnung font-medium">
      <span aria-hidden="true">! </span>
      {children}
    </span>
  );
}

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });
// Zweistellig: So ist die Spalte so breit wie die Uhrzeiten der Besuche.
const DATUM = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/**
 * Ein zurückgewiesener Freizeitausgleich (BEF-179, ANN-675): Die Zeit ist
 * wieder Arbeitszeit. Ohne Grund - die ganze Zeile führt ins Zeitkonto, wo er
 * steht. Heute steht vorn die Uhrzeit wie an den Besuchen; an einem anderen
 * Tag der Tag, kurz und zweizeilig - unter „Heute noch offen“ läse sich eine
 * nackte Uhrzeit als heute (Praxis-Review).
 */
function ZurueckgewieseneFreizeit({ eintrag, heute }: { eintrag: RejectedTimeOff; heute: string }) {
  const tag = new Date(`${eintrag.on_date}T12:00:00Z`);
  return (
    <ListRow
      zeit={
        eintrag.on_date === heute ? (
          eintrag.starts_at
        ) : (
          <span className="flex flex-col leading-tight">
            <span>{WOCHENTAG.format(tag)}</span>
            <span className="text-sm font-medium">{DATUM.format(tag)}</span>
          </span>
        )
      }
      titel="Freizeitausgleich zurückgewiesen"
      meta={<Warnung>{`${eintrag.starts_at}–${eintrag.ends_at} wieder Arbeitszeit`}</Warnung>}
      to={TIME_ACCOUNT_HOME}
    />
  );
}

/**
 * Der Tagesabschluss als Liste (Auftrag C1, Analyse „Alltag unterwegs“
 * Rang 13): erst was heute noch offen ist - Haken und Doku -, dann kommt
 * „Morgen“. Seit B7 (BEF-157) gibt es keine Heilmittel mehr zu bestätigen:
 * Mit Haken und Doku entsteht die Leistung von selbst (ANN-513).
 *
 * Unter den Besuchen ein zurückgewiesener Freizeitausgleich, bis sein Tag
 * vorbei ist (BEF-179) - ohne Benachrichtigung; die Übersicht fragt ihn nur
 * für heute ab.
 */
export function NochOffen({
  plan,
  tagWort,
  darfDokumentieren,
  jetzt,
  zeitzone,
  ausfall,
  zurueckgewiesen = [],
  heute,
}: {
  plan: readonly DayPlanEntry[];
  /** „Heute“, „Gestern“ … am Satzanfang. */
  tagWort: string;
  darfDokumentieren: boolean;
  jetzt: number;
  zeitzone: string;
  /** „Ausfall“ zu einem Termin, wo er passt, sonst `null` (B12). */
  ausfall?: (termin: DayPlanEntry) => ReactNode;
  /** Zurückgewiesene Freizeitausgleiche, deren Tag noch kommt (BEF-179). */
  zurueckgewiesen?: readonly RejectedTimeOff[];
  /** Der heutige Tag der Praxis - für „Heute“, „Morgen“ an diesen Zeilen. */
  heute: string;
}) {
  const zeilen = plan.flatMap((termin) => {
    const grund = fehlt(termin, darfDokumentieren, jetzt);
    return grund ? [{ termin, grund }] : [];
  });
  if (zeilen.length === 0 && zurueckgewiesen.length === 0) return null;

  return (
    <Listenabschnitt
      titel={`${tagWort} noch offen`}
      anzahl={zeilen.length + zurueckgewiesen.length}
    >
      {zeilen.map(({ termin, grund }) => (
        <ListRow
          key={termin.id}
          zeit={formatLocalTime(termin.starts_at, zeitzone)}
          titel={terminName(termin)}
          meta={<Warnung>{grund}</Warnung>}
          aktion={<ZeilenAktion termin={termin} darfDokumentieren={darfDokumentieren} />}
          darunter={ausfall ? ausfallZeile(ausfall(termin)) : undefined}
        />
      ))}
      {zurueckgewiesen.map((eintrag) => (
        <ZurueckgewieseneFreizeit key={eintrag.id} eintrag={eintrag} heute={heute} />
      ))}
    </Listenabschnitt>
  );
}

/** Wie weit „Nachzuholen“ zurückschaut (ANN-478). */
export const NACHZUHOLEN_TAGE = 7;

/**
 * „Nachzuholen“: was in den letzten sieben Tagen liegen geblieben ist - ein
 * Besuch ohne Haken, eine Doku offen oder im Entwurf (Auftrag C1, Analyse
 * Rang 5, ANN-478). Gelesen über dieselbe Tagesliste wie die Wochenleiste
 * (`list_day_plan`, ohne Protokollierung), je Tag eine Abfrage; eine neue
 * Serverfunktion gibt es dafür nicht.
 *
 * Eine Zeile, zugeklappt; aufgeklappt führt jeder Eintrag mit einem Tipp auf
 * die Schreibseite.
 */
export function Nachzuholen({
  heute,
  staffMemberId,
  zeitzone,
  ausfall,
}: {
  heute: string;
  staffMemberId: string;
  zeitzone: string;
  /** „Ausfall“ zu einem Termin, wo er passt, sonst `null` (B12). */
  ausfall?: (termin: DayPlanEntry) => ReactNode;
}) {
  const tage = Array.from({ length: NACHZUHOLEN_TAGE }, (_, index) =>
    tagePlus(heute, index - NACHZUHOLEN_TAGE),
  );
  const abfragen = useQueries({
    queries: tage.map((tag) => ({
      queryKey: ['day-plan', tag, staffMemberId],
      queryFn: () => fetchDayPlan(tag, staffMemberId),
      retry: false,
      gcTime: TAGESPLAN_VORHALTEDAUER_MS,
    })),
  });
  // Vergangene Tage liegen ganz hinter einem: Was nicht abgehakt ist, ist liegen geblieben.
  const offen = abfragen
    .flatMap((abfrage) => abfrage.data ?? [])
    .flatMap((termin) => {
      const grund = fehlt(termin, true, Number.POSITIVE_INFINITY);
      return grund ? [{ termin, grund }] : [];
    })
    .sort((a, b) => nachUhrzeit(a.termin, b.termin));
  if (offen.length === 0) return null;

  return (
    <section>
      <Disclosure inKarte kopf="betont" anzahl={offen.length} summary={<h2>Nachzuholen</h2>}>
        <ListRows rahmen={false}>
          {offen.map(({ termin, grund }) => (
            <ListRow
              key={`${termin.id}-${termin.starts_at}`}
              zeit={formatLocalTime(termin.starts_at, zeitzone)}
              titel={terminName(termin)}
              meta={`${tagLang(termin, zeitzone)} · ${grund}`}
              aktion={<ZeilenAktion termin={termin} darfDokumentieren />}
              darunter={ausfall ? ausfallZeile(ausfall(termin)) : undefined}
            />
          ))}
        </ListRows>
      </Disclosure>
    </section>
  );
}

/** „Mo., 12.10.“ in der Zeit der Praxis. */
function tagLang(termin: DayPlanEntry, zeitzone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: zeitzone,
  }).format(new Date(termin.starts_at));
}
