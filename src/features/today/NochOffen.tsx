import { useQueries } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { tagePlus } from '@/features/appointments/calendar';
import { formatLocalTime } from '@/features/appointments/api';
import { fetchLeistungenAmTermin } from '@/features/appointments/leistungenAmTermin';
import {
  fetchDayPlan,
  nachUhrzeit,
  offenGrund,
  TAGESPLAN_VORHALTEDAUER_MS,
  type DayPlanEntry,
} from './api';
import { schreibseite } from './besuchswege';
import { nichtAbgeschlossen, terminName } from './tagesstart';

/**
 * Was an einem Besuch noch fehlt, als Wort - oder `null`, wenn nichts fehlt.
 *
 * Nicht abgeschlossen (vorbei, kein Haken), Doku offen oder im Entwurf; die
 * Doku nur für die, die schreiben (`istOffen`). `jetzt` entscheidet, ob ein
 * bestätigter Besuch schon vorbei ist.
 */
function fehlt(termin: DayPlanEntry, darfDokumentieren: boolean, jetzt: number): string | null {
  if (termin.kind !== 'therapy' || !termin.patient_id) return null;
  if (nichtAbgeschlossen(termin, jetzt)) return 'Nicht abgeschlossen';
  return darfDokumentieren ? offenGrund(termin) : null;
}

function DokuKnopf({ termin }: { termin: DayPlanEntry }) {
  return (
    <ButtonLink to={schreibseite(termin.id)} variant="secondary">
      Doku <span className="sr-only">zu {terminName(termin)}</span>
    </ButtonLink>
  );
}

/**
 * Der Tagesabschluss als Liste (Auftrag C1, Analyse „Alltag unterwegs“
 * Rang 13): erst was heute noch offen ist - Doku und Heilmittel -, dann
 * kommt „Morgen“. Jede Zeile führt mit einem Tipp auf die Schreibseite;
 * dort stehen nach dem Festschreiben auch die Heilmittel (`Danach`).
 *
 * „Heilmittel offen“ liest je dokumentiertem Besuch den Stand am Termin
 * (`get_appointment_services`, ohne Protokollierung) - nur, wo die Rolle an
 * diesem Termin bestätigen darf (ANN-140).
 */
export function NochOffen({
  plan,
  tagWort,
  darfDokumentieren,
  darfHeilmittel,
  jetzt,
  zeitzone,
}: {
  plan: readonly DayPlanEntry[];
  /** „Heute“, „Gestern“ … am Satzanfang. */
  tagWort: string;
  darfDokumentieren: boolean;
  darfHeilmittel: (staffMemberId: string) => boolean;
  jetzt: number;
  zeitzone: string;
}) {
  const dokumentiert = plan.filter(
    (t) =>
      t.kind === 'therapy' &&
      t.patient_id !== null &&
      t.status === 'documented' &&
      darfHeilmittel(t.staff_member_id),
  );
  const leistungen = useQueries({
    queries: dokumentiert.map((t) => ({
      queryKey: ['appointment', t.id, 'leistungen'],
      queryFn: () => fetchLeistungenAmTermin(t.id),
      retry: false,
    })),
  });
  const heilmittelOffen = new Set(
    dokumentiert
      .filter((_, index) => {
        const stand = leistungen[index]?.data;
        return !!stand && stand.can_record && stand.services.length === 0;
      })
      .map((t) => t.id),
  );

  const zeilen = plan.flatMap((termin) => {
    const grund = fehlt(termin, darfDokumentieren, jetzt);
    if (grund) return [{ termin, grund, heilmittel: false }];
    if (heilmittelOffen.has(termin.id)) {
      return [{ termin, grund: 'Heilmittel offen', heilmittel: true }];
    }
    return [];
  });
  if (zeilen.length === 0) return null;

  return (
    <Listenabschnitt titel={`${tagWort} noch offen`} anzahl={zeilen.length}>
      {zeilen.map(({ termin, grund, heilmittel }) => (
        <ListRow
          key={termin.id}
          zeit={formatLocalTime(termin.starts_at, zeitzone)}
          titel={terminName(termin)}
          meta={
            <span className="text-warnung font-medium">
              <span aria-hidden="true">! </span>
              {grund}
            </span>
          }
          aktion={
            heilmittel ? (
              <ButtonLink to={schreibseite(termin.id)} variant="secondary">
                Heilmittel <span className="sr-only">bestätigen: {terminName(termin)}</span>
              </ButtonLink>
            ) : darfDokumentieren ? (
              <DokuKnopf termin={termin} />
            ) : undefined
          }
        />
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
 * Serverfunktion gibt es dafür nicht. Unbestätigte Heilmittel früherer Tage
 * kennt die Tagesliste nicht - sie stehen hier deshalb nicht.
 *
 * Eine Zeile, zugeklappt; aufgeklappt führt jeder Eintrag mit einem Tipp auf
 * die Schreibseite.
 */
export function Nachzuholen({
  heute,
  staffMemberId,
  zeitzone,
}: {
  heute: string;
  staffMemberId: string;
  zeitzone: string;
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
    <section className="mt-6">
      <Disclosure inKarte kopf="betont" anzahl={offen.length} summary={<h2>Nachzuholen</h2>}>
        <ListRows rahmen={false}>
          {offen.map(({ termin, grund }) => (
            <ListRow
              key={`${termin.id}-${termin.starts_at}`}
              zeit={formatLocalTime(termin.starts_at, zeitzone)}
              titel={terminName(termin)}
              meta={`${tagLang(termin, zeitzone)} · ${grund}`}
              aktion={<DokuKnopf termin={termin} />}
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
