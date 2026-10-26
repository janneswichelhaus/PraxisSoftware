import { useId, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmptyState } from '@/components/ui/Feedback';
import { Textlink } from '@/components/ui/Textlink';
import { travelPlan } from '@/components/ui/travelPlan';
import { nachUhrzeit, TAGESPLAN_VORHALTEDAUER_MS } from './api';
import { useTagesfahrzeiten } from './fahrzeiten';
import { Tageskacheln, type Abfahrt } from './Tageskacheln';
import { tagesPfad } from './tageswahl';
import { kopfDatum } from './wochenfenster';
import { hausbesucheDesTages, liegeHeute } from './tagesstart';
import { Zeitstrahl } from './Zeitstrahl';
import { formatLocalTime } from '@/lib/datum';
import { fetchDayPlan } from '@/features/day-plan/api';

/** Ohne Bezug auf eine Uhr: Morgen liegt ganz vor einem (`bezugszeitpunkt`). */
const VOR_ALLEM = 0;

/**
 * Was morgen kommt (Jannes, 2026-10-11): unter dem heutigen Tag, sobald heute
 * kein Weg mehr aussteht - weil es keinen Besuch gibt oder alle vorbei sind.
 * Die Frage der Übersicht ist „was kommt als Nächstes", und das ist dann
 * morgen.
 *
 * Dieselben Kacheln wie heute: Liege morgen und die späteste Abfahrt zum
 * ersten Hausbesuch. Einen Puffer gibt es dort nicht - vor dem ersten Weg
 * liegt kein Termin. Darunter die Termine als Zeilen, ohne Karte und ohne
 * Knöpfe; „Zum Tag" öffnet morgen in der Übersicht. Die Tagesliste kommt aus
 * demselben Lesepfad und Schlüssel wie die Wochenleiste.
 */
export function MorgenVorschau({
  morgen,
  heute,
  staffMemberId,
  zeitzone,
  mitBehandlung,
}: {
  morgen: string;
  heute: string;
  staffMemberId: string;
  zeitzone: string;
  /** Praxisrolle mit Akten: nur sie bekommt Fahrzeiten (`useTagesfahrzeiten`). */
  mitBehandlung: boolean;
}) {
  const titelId = useId();
  const abfrage = useQuery({
    queryKey: ['day-plan', morgen, staffMemberId],
    queryFn: () => fetchDayPlan(morgen, staffMemberId),
    retry: false,
    gcTime: TAGESPLAN_VORHALTEDAUER_MS,
  });
  const plan = useMemo(() => [...(abfrage.data ?? [])].sort(nachUhrzeit), [abfrage.data]);
  const fahrzeiten = useTagesfahrzeiten({
    datum: morgen,
    staffMemberId,
    plan: abfrage.data,
    aktiv: mitBehandlung,
    jetzt: VOR_ALLEM,
  });

  // Ohne Liste bleibt die Vorschau weg: Ein Fehler hier nimmt dem heutigen
  // Tag nichts, und „Zum Tag" führt zur ausführlichen Meldung.
  if (!abfrage.data) return null;

  const hausbesuche = hausbesucheDesTages(plan);
  const erster = hausbesuche[0];
  const anfahrt = erster ? fahrzeiten.anfahrten.get(erster.id) : undefined;
  const abfahrt: Abfahrt | null =
    erster && anfahrt
      ? {
          titel: 'Abfahrt',
          zeit: travelPlan('00:00', formatLocalTime(erster.starts_at, zeitzone), anfahrt.minuten)
            .abfahrt,
          fahrtMin: anfahrt.minuten,
          pufferMin: null,
          stufe: 'clear',
        }
      : null;

  return (
    <section aria-labelledby={titelId}>
      {/* Kopfzeile 32 px wie jeder Abschnitt (`Section`); das Tippziel von
          „Zum Tag" bleibt 44 px und ragt über die Zeile hinaus. */}
      <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-x-4">
        <h2 id={titelId} className="text-accent tracking-label text-xs font-semibold uppercase">
          Morgen · {kopfDatum(morgen)}
        </h2>
        <Textlink
          alleinstehend
          to={tagesPfad(morgen, heute)}
          className="-my-1.5 gap-1 text-sm font-semibold"
        >
          Zum Tag <span aria-hidden="true">→</span>
        </Textlink>
      </div>
      {plan.length === 0 ? (
        // In der Karte wie der Leerzustand des heutigen Tags darüber: zwei
        // Leerzustände auf einer Seite, ein Bau (DESIGN.md Regel 8;
        // Design-Review R2, U4).
        <EmptyState inKarte title="Morgen sind Ihnen keine Termine zugeordnet" />
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4">
          <Tageskacheln
            liege={hausbesuche.length > 0 ? liegeHeute(plan, VOR_ALLEM) : null}
            abfahrt={abfahrt}
            tagWort="morgen"
          />
          <Zeitstrahl
            titel="Termine morgen"
            plan={plan}
            fokusId={null}
            jetzt={VOR_ALLEM}
            jetztMarke={false}
            zeitzone={zeitzone}
            anfahrten={new Map()}
            karte={null}
          />
        </div>
      )}
    </section>
  );
}
