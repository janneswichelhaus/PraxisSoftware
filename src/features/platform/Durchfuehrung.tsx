import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { dosierungAlltag } from '@/features/exercise-plans/dosierung';
import {
  durchgangSetzen,
  einheitBeenden,
  einheitBeginnen,
  ladePlaene,
  plaeneSchluessel,
  type EigenerPlan,
  type PlanPosition,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';

/**
 * Die Durchführungsansicht (UEB-010, IDEA-ORG-003): „Ich stehe gerade in der
 * Küche und mache meine Übungen."
 *
 * Übung für Übung, große Ziele für einen Finger, Durchgang abhaken, die
 * Pause der Fachperson als Uhr. **Jeder Haken geht sofort an den Server**
 * (ANN-305): Wer abbricht oder das Telefon weglegt, verliert nichts, und auf
 * dem Gerät liegt nichts (ADR-001, ADR-015 Punkt 16). Ohne Verbindung sagt
 * die Ansicht „nicht gespeichert" und nimmt den Haken zurück - niemand soll
 * glauben, etwas sei gespeichert, das es nicht ist (ADR-001, Konsequenzen).
 *
 * Keine Punktzahl, keine Serie, kein Lob aus der Software (DSN-001 4.1).
 * Während der Einheit bittet die Ansicht das Gerät, den Bildschirm wach zu
 * halten, soweit der Browser das kann.
 */
export function Durchfuehrung({ zugang }: { zugang: Plattformzugang }) {
  const { pathname } = useLocation();
  const planId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
    // Die Haken stehen in der Ansicht; ein Neuladen im Hintergrund würde sie
    // mit dem Stand vom Öffnen überschreiben.
    refetchOnWindowFocus: false,
  });
  const plan = plaene.data?.plans.find((p) => p.id === planId);

  if (plaene.isPending) return <LoadingState label="Ihre Übungen werden geladen …" />;
  if (plaene.data === undefined) {
    return (
      <ErrorState
        title="Ihre Übungen konnten nicht geladen werden."
        description="Bitte die Verbindung prüfen und erneut versuchen."
        onErneut={() => plaene.refetch()}
      />
    );
  }
  if (!plan || !plan.can_exercise || plan.items.length === 0) {
    return <EmptyState title="Mit diesem Plan können Sie hier gerade nicht üben." />;
  }
  return <Einheit zugang={zugang} plan={plan} />;
}

function schluessel(positionId: string, durchgang: number): string {
  return `${positionId}:${durchgang}`;
}

function Einheit({ zugang, plan }: { zugang: Plattformzugang; plan: EigenerPlan }) {
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/uebungen${bereich ? `?${bereich}` : ''}`;

  const [index, setIndex] = useState(0);
  const [fertig, setFertig] = useState(false);
  const [haken, setHaken] = useState<ReadonlySet<string>>(
    () => new Set((plan.open_session?.sets ?? []).map((s) => schluessel(s.item_id, s.set_number))),
  );
  const [fehler, setFehler] = useState<string | null>(null);
  const [pause, setPause] = useState<number | null>(null);
  // Eine Einheit entsteht mit dem ersten Haken; parallele Haken warten auf
  // dieselbe (der Server lässt ohnehin nur eine offene je Tag zu).
  const einheit = useRef<Promise<string> | null>(
    plan.open_session ? Promise.resolve(plan.open_session.id) : null,
  );
  const einheitHolen = () => {
    einheit.current ??= einheitBeginnen(zugang.access_id, plan.id).catch((e: unknown) => {
      einheit.current = null;
      throw e;
    });
    return einheit.current;
  };

  useBildschirmWach();

  const setzen = useMutation({
    mutationFn: async (v: { position: PlanPosition; durchgang: number; erledigt: boolean }) => {
      const id = await einheitHolen();
      await durchgangSetzen(zugang.access_id, id, v.position.id, v.durchgang, v.erledigt);
    },
    onMutate: (v) => {
      setFehler(null);
      setHaken((alt) => umschalten(alt, schluessel(v.position.id, v.durchgang), v.erledigt));
    },
    onError: (e, v) => {
      // Zurücknehmen, was nicht gespeichert ist (ADR-001).
      setHaken((alt) => umschalten(alt, schluessel(v.position.id, v.durchgang), !v.erledigt));
      setFehler(e instanceof Error ? e.message : 'Nicht gespeichert.');
      setPause(null);
    },
  });

  const position = plan.items[index]!;
  const letzte = index === plan.items.length - 1;

  if (fertig) {
    return (
      <Abschluss
        zugang={zugang}
        plan={plan}
        einheitHolen={einheitHolen}
        zurueck={zurueck}
        onZurueck={() => setFertig(false)}
        onBeendet={async () => {
          await queryClient.invalidateQueries({ queryKey: plaeneSchluessel(zugang.access_id) });
          void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}gespeichert=1`);
        }}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-muted">
          Übung {index + 1} von {plan.items.length}
        </p>
        <ButtonLink variant="quiet" to={zurueck}>
          Abbrechen
        </ButtonLink>
      </div>
      <h1 className="text-accent text-h3 mt-2 font-bold">{position.variant_lay_name}</h1>
      <p className="mt-3 text-lg">{dosierungAlltag(position)}</p>
      {position.instruction ? <p className="mt-2">{position.instruction}</p> : null}
      {position.equipment.length > 0 ? (
        <p className="text-ink-muted mt-2">Sie brauchen: {position.equipment.join(', ')}</p>
      ) : null}
      {position.note ? (
        <p className="mt-2">
          <span className="font-semibold">Hinweis: </span>
          {position.note}
        </p>
      ) : null}

      <ul className="mt-6 flex flex-col gap-3" aria-label="Durchgänge">
        {Array.from({ length: position.sets }, (_, i) => i + 1).map((durchgang) => {
          const erledigt = haken.has(schluessel(position.id, durchgang));
          return (
            <li key={durchgang}>
              <button
                type="button"
                aria-pressed={erledigt}
                onClick={() => {
                  setzen.mutate({ position, durchgang, erledigt: !erledigt });
                  if (!erledigt && position.rest_seconds && durchgang < position.sets) {
                    setPause(position.rest_seconds);
                  }
                }}
                className="rounded-card border-line bg-surface aria-pressed:border-accent aria-pressed:bg-accent-soft flex min-h-16 w-full items-center justify-between gap-3 border-2 px-5 text-left text-lg font-medium"
              >
                <span>{durchgang}. Durchgang</span>
                <span
                  aria-hidden="true"
                  className="border-line-strong text-accent inline-flex size-9 items-center justify-center rounded-full border-2"
                >
                  {erledigt ? <HakenSymbol className="size-6" /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {fehler ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {fehler}
        </Statusmeldung>
      ) : null}
      {pause !== null ? <Pause sekunden={pause} onEnde={() => setPause(null)} /> : null}

      <div className="mt-8 flex gap-3">
        {index > 0 ? (
          <Button
            variant="secondary"
            className="min-h-14 flex-1"
            onClick={() => {
              setPause(null);
              setIndex(index - 1);
            }}
          >
            Vorige Übung
          </Button>
        ) : null}
        <Button
          className="min-h-14 flex-1"
          onClick={() => {
            setPause(null);
            if (letzte) setFertig(true);
            else setIndex(index + 1);
          }}
        >
          {letzte ? 'Fertig' : 'Nächste Übung'}
        </Button>
      </div>
      <p className="text-ink-muted mt-4 text-sm">
        Jeder Haken wird sofort gespeichert. Sie können jederzeit abbrechen.
      </p>
    </>
  );
}

function umschalten(alt: ReadonlySet<string>, schluessel: string, an: boolean): Set<string> {
  const neu = new Set(alt);
  if (an) neu.add(schluessel);
  else neu.delete(schluessel);
  return neu;
}

/** Die Pause zwischen zwei Durchgängen - so lang, wie die Fachperson sie eingetragen hat. */
function Pause({ sekunden, onEnde }: { sekunden: number; onEnde: () => void }) {
  const [rest, setRest] = useState(sekunden);
  useEffect(() => {
    setRest(sekunden);
    const uhr = window.setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(uhr);
  }, [sekunden]);
  return (
    <div className="rounded-card border-line bg-surface mt-4 flex items-center justify-between gap-3 border p-4">
      {/* Vorgelesen wird nur der Anfang, nicht jede Sekunde. */}
      <p role="status" className="sr-only">
        Pause: {sekunden} Sekunden.
      </p>
      <p className="text-lg" aria-hidden="true">
        {rest > 0 ? (
          <>
            Pause: <span className="font-bold tabular-nums">{rest}</span> s
          </>
        ) : (
          'Weiter mit dem nächsten Durchgang.'
        )}
      </p>
      <Button variant="quiet" onClick={onEnde}>
        {rest > 0 ? 'Pause überspringen' : 'Ausblenden'}
      </Button>
    </div>
  );
}

function Abschluss({
  zugang,
  plan,
  einheitHolen,
  zurueck,
  onZurueck,
  onBeendet,
}: {
  zugang: Plattformzugang;
  plan: EigenerPlan;
  einheitHolen: () => Promise<string>;
  zurueck: string;
  onZurueck: () => void;
  onBeendet: () => Promise<void>;
}) {
  const [notiz, setNotiz] = useState('');
  const beenden = useMutation({
    mutationFn: async () => {
      const id = await einheitHolen();
      await einheitBeenden(zugang.access_id, id, plan.note_allowed ? notiz : '');
    },
    onSuccess: onBeendet,
  });
  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Einheit beenden</h1>
      <p className="mt-2">{plan.title}</p>
      <form
        noValidate
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          beenden.mutate();
        }}
      >
        {plan.note_allowed ? (
          <TextArea
            label="Das war schwierig, weil … (freiwillig)"
            hint={`${
              plan.service_area === 'therapy' ? 'Ihre Therapeut:in' : 'Ihre Trainingsbetreuung'
            } liest das beim nächsten Termin. Bei akuten Beschwerden: 112 oder 116117.`}
            maxLength={500}
            rows={3}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />
        ) : null}
        {beenden.isError ? (
          <Statusmeldung ton="fehler">{beenden.error.message}</Statusmeldung>
        ) : null}
        <Button type="submit" className="min-h-14" disabled={beenden.isPending}>
          {beenden.isPending ? 'Wird gespeichert …' : 'Einheit beenden'}
        </Button>
        <Button type="button" variant="secondary" className="min-h-14" onClick={onZurueck}>
          Zurück zu den Übungen
        </Button>
        <ButtonLink variant="quiet" to={zurueck}>
          Abbrechen
        </ButtonLink>
      </form>
    </>
  );
}

/**
 * Bittet das Gerät, den Bildschirm wach zu halten (Screen Wake Lock), solange
 * die Einheit offen ist. Kann der Browser das nicht, geschieht nichts.
 */
function useBildschirmWach() {
  useEffect(() => {
    let sperre: { release: () => Promise<void> } | null = null;
    let aus = false;
    const wach = (
      navigator as Navigator & {
        wakeLock?: { request: (art: 'screen') => Promise<{ release: () => Promise<void> }> };
      }
    ).wakeLock;
    wach
      ?.request('screen')
      .then((s) => {
        if (aus) void s.release();
        else sperre = s;
      })
      .catch(() => undefined);
    return () => {
      aus = true;
      void sperre?.release().catch(() => undefined);
    };
  }, []);
}
