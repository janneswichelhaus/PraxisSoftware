import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Angabefeld } from '@/components/ui/Angabefeld';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { dosierungAlltag } from '@/features/exercise-plans/dosierung';
import { angabeGueltig, groessenImTakt } from '@/lib/erfassungsgroessen';
import {
  abgelegterPlan,
  abweisungGelesen,
  ereignisAblegen,
  geraetetag,
  useDurchfuehrungstraeger,
  useWarteschlange,
  wartendeEinheiten,
  type Ablageplan,
  type WartendeEinheit,
} from './ablage';
import { ladePlaene, plaeneSchluessel, type PlanPosition, type Plattformzugang } from './api';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';

/**
 * Die Durchführungsansicht (UEB-010, IDEA-ORG-003): „Ich stehe gerade in der
 * Küche und mache meine Übungen."
 *
 * Übung für Übung, große Ziele für einen Finger, Durchgang abhaken, die
 * Pause der Fachperson als Uhr. **Jeder Haken liegt zuerst auf dem Gerät und
 * geht dann an den Server** (TRK-008, ADR-024 Punkt 5, ANN-358): Wer im
 * Keller ohne Empfang übt, verliert nichts, und wer abbricht oder das Telefon
 * weglegt, auch nicht. Ohne Verbindung übt die Person am Plan vom letzten
 * Laden. Die Ansicht sagt, ob noch etwas auf dem Gerät wartet oder alles
 * übertragen ist - niemand soll glauben, etwas sei bei der Praxis, das nur
 * auf dem Telefon liegt (ADR-001, ADR-024 Punkt 8). Löst ANN-305 im
 * Verhalten ohne Verbindung ab.
 *
 * Keine Punktzahl, keine Serie, kein Lob aus der Software (DSN-001 4.1).
 * Während der Einheit bittet die Ansicht das Gerät, den Bildschirm wach zu
 * halten, soweit der Browser das kann.
 */
export function Durchfuehrung({ zugang }: { zugang: Plattformzugang }) {
  const { pathname } = useLocation();
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { besitzer } = useDurchfuehrungstraeger();
  const planId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/uebungen${bereich ? `?${bereich}` : ''}`;
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
    // Die Haken stehen in der Ansicht; ein Neuladen im Hintergrund würde sie
    // mit dem Stand vom Öffnen überschreiben.
    refetchOnWindowFocus: false,
  });
  // Ohne Verbindung: der Plan vom letzten Laden (ADR-024 Punkt 5).
  const abgelegt = useQuery({
    queryKey: ['abgelegter-plan', besitzer, zugang.access_id, planId],
    queryFn: async () => (await abgelegterPlan(besitzer, zugang.access_id, planId)) ?? null,
    enabled: plaene.isError,
    gcTime: 0,
  });
  const plan = plaene.data?.plans.find((p) => p.id === planId);

  if (plaene.isPending || (plaene.isError && abgelegt.isPending)) {
    return <LoadingState label="Ihre Übungen werden geladen …" />;
  }
  if (plaene.data === undefined) {
    if (abgelegt.data) {
      return (
        <EinheitMitWarteschlange
          zugangId={zugang.access_id}
          plan={abgelegt.data}
          ohneVerbindung
          zurueckPfad={zurueck}
          onBeendet={(ziel) =>
            void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}${ziel}`)
          }
        />
      );
    }
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
  return (
    <EinheitMitWarteschlange
      zugangId={zugang.access_id}
      plan={plan}
      zurueckPfad={zurueck}
      onBeendet={async (ziel) => {
        await queryClient.invalidateQueries({ queryKey: plaeneSchluessel(zugang.access_id) });
        void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}${ziel}`);
      }}
    />
  );
}

/** Wohin nach dem Beenden: übertragen oder noch auf dem Gerät. */
export type Beendetziel = 'gespeichert=1' | 'gespeichert=geraet';

interface EinheitProps {
  zugangId: string;
  plan: Ablageplan;
  /** Der Plan kommt aus der Ablage, nicht vom Server. */
  ohneVerbindung?: boolean;
  /** Zurück zur Übersicht: als Link in der Plattform, sonst als Knopf. */
  zurueckPfad?: string;
  onZurueck?: () => void;
  onBeendet: (ziel: Beendetziel) => void | Promise<void>;
}

/**
 * Die Einheit, sobald klar ist, was schon auf dem Gerät wartet: Eine heute
 * ohne Verbindung begonnene Einheit geht weiter, mit ihren Haken.
 */
export function EinheitMitWarteschlange(props: EinheitProps) {
  const { besitzer } = useDurchfuehrungstraeger();
  const wartend = useQuery({
    queryKey: ['wartende-einheiten', besitzer],
    queryFn: () => wartendeEinheiten(besitzer),
    gcTime: 0,
    staleTime: Infinity,
  });
  if (wartend.isPending) return <LoadingState label="Ihre Übungen werden geladen …" />;
  return <Einheit {...props} wartend={wartend.data ?? []} />;
}

function schluessel(positionId: string, durchgang: number): string {
  return `${positionId}:${durchgang}`;
}

/** Die Einheit am Gerät: welche, seit wann, für welchen Tag (ANN-357). */
interface Einheitskopf {
  id: string;
  begonnenAm: string;
  tag: string;
}

function Einheit({
  zugangId,
  plan,
  ohneVerbindung = false,
  zurueckPfad,
  onZurueck,
  onBeendet,
  wartend,
}: EinheitProps & { wartend: WartendeEinheit[] }) {
  const { besitzer, anstossen } = useDurchfuehrungstraeger();
  const warteschlange = useWarteschlange(besitzer);

  // Weiter mit der heute auf dem Gerät begonnenen Einheit, sonst mit der heute
  // beim Server offenen; eine neue entsteht mit dem ersten Haken.
  const [start] = useState(() => {
    const tag = geraetetag();
    const lokal = wartend.find(
      (e) =>
        e.zugangId === zugangId &&
        e.planId === plan.id &&
        e.tag === tag &&
        !e.ereignisse.some((x) => x.kind === 'finish'),
    );
    const haken = new Set(
      (plan.open_session?.sets ?? []).map((x) => schluessel(x.item_id, x.set_number)),
    );
    for (const x of lokal?.ereignisse ?? []) {
      if (x.kind === 'set') {
        if (x.done) haken.add(schluessel(x.item_id, x.set_number));
        else haken.delete(schluessel(x.item_id, x.set_number));
      }
    }
    const id = lokal?.id ?? plan.open_session?.id ?? null;
    const kopf: Einheitskopf | null = id
      ? { id, begonnenAm: lokal?.begonnenAm ?? new Date().toISOString(), tag }
      : null;
    return { kopf, haken };
  });
  const einheit = useRef<Einheitskopf | null>(start.kopf);

  const [index, setIndex] = useState(0);
  const [fertig, setFertig] = useState(false);
  const [haken, setHaken] = useState<ReadonlySet<string>>(start.haken);
  const [fehler, setFehler] = useState<string | null>(null);
  // Die laufende Pause; `nummer` startet die Uhr auch bei gleicher Dauer neu.
  const [pause, setPause] = useState<{ sekunden: number; nummer: number } | null>(null);

  useBildschirmWach();

  function einheitskopf(): Einheitskopf {
    einheit.current ??= {
      id: crypto.randomUUID(),
      begonnenAm: new Date().toISOString(),
      tag: geraetetag(),
    };
    return einheit.current;
  }

  async function setzen(
    position: PlanPosition | Ablageplan['items'][number],
    durchgang: number,
    erledigt: boolean,
  ) {
    setFehler(null);
    setHaken((alt) => umschalten(alt, schluessel(position.id, durchgang), erledigt));
    const kopf = einheitskopf();
    try {
      // Erst auf das Gerät (ADR-024 Punkt 5), dann zum Server.
      await ereignisAblegen(
        besitzer,
        { ...kopf, zugangId, planId: plan.id },
        {
          id: crypto.randomUUID(),
          kind: 'set',
          at: new Date().toISOString(),
          item_id: position.id,
          set_number: durchgang,
          done: erledigt,
        },
      );
    } catch {
      // Nicht einmal auf dem Gerät: zurücknehmen, was nicht gespeichert ist (ADR-001).
      setHaken((alt) => umschalten(alt, schluessel(position.id, durchgang), !erledigt));
      setFehler('Nicht gespeichert. Bitte erneut tippen.');
      setPause(null);
      return;
    }
    void anstossen?.();
  }

  const position = plan.items[index]!;
  const letzte = index === plan.items.length - 1;
  const wartet =
    einheit.current !== null &&
    warteschlange.einheiten.some((e) => e.id === einheit.current?.id && e.ereignisse.length > 0);
  const abgewiesen = warteschlange.abgewiesen.filter((a) => a.planId === plan.id);

  if (fertig) {
    return (
      <Abschluss
        zugangId={zugangId}
        plan={plan}
        einheitskopf={einheitskopf}
        abgehakt={haken.size}
        zurueckPfad={zurueckPfad}
        onAbbrechen={onZurueck}
        onZurueck={() => setFertig(false)}
        onBeendet={onBeendet}
      />
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-ink-muted">
          Übung {index + 1} von {plan.items.length}
        </p>
        <Zurueck pfad={zurueckPfad} onZurueck={onZurueck}>
          Abbrechen
        </Zurueck>
      </div>
      {ohneVerbindung ? (
        <p className="text-ink-muted mt-2 text-sm">
          Ohne Verbindung: Ihr Plan vom letzten Laden. Die Haken bleiben auf dem Gerät, bis
          Verbindung besteht.
        </p>
      ) : null}
      {abgewiesen.map((a) => (
        <Statusmeldung key={a.einheitId} ton="fehler" className="mt-3">
          {`Nicht übertragen: ${a.satz}`}{' '}
          <button type="button" className="underline" onClick={() => abweisungGelesen(a.einheitId)}>
            Ausblenden
          </button>
        </Statusmeldung>
      ))}
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
                  void setzen(position, durchgang, !erledigt);
                  if (!erledigt && position.rest_seconds && durchgang < position.sets) {
                    const sekunden = position.rest_seconds;
                    setPause((alt) => ({ sekunden, nummer: (alt?.nummer ?? 0) + 1 }));
                  }
                }}
                className="rounded-card border-line bg-surface aria-pressed:border-accent aria-pressed:bg-accent-soft flex min-h-16 w-full items-center justify-between gap-3 border-2 px-5 text-left text-lg font-medium"
              >
                <span>{durchgang}. Durchgang</span>
                <span
                  aria-hidden="true"
                  className="border-line-strong text-accent rounded-pill inline-flex size-9 items-center justify-center border-2"
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
      {/* Eine dauerhafte Live-Region: Vorgelesen wird der Anfang der Pause,
          nicht jede Sekunde. */}
      <p role="status" className="sr-only">
        {pause ? `Pause: ${pause.sekunden} Sekunden.` : ''}
      </p>
      {pause ? (
        <Pause key={pause.nummer} sekunden={pause.sekunden} onEnde={() => setPause(null)} />
      ) : null}

      <div className="mt-8 flex gap-3">
        {index > 0 ? (
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setPause(null);
              setIndex(index - 1);
            }}
          >
            Vorige Übung
          </Button>
        ) : null}
        <Button
          className="flex-1"
          onClick={() => {
            setPause(null);
            if (letzte) setFertig(true);
            else setIndex(index + 1);
          }}
        >
          {letzte ? 'Fertig' : 'Nächste Übung'}
        </Button>
      </div>
      <p className="text-ink-muted mt-4 text-sm" data-testid="uebertragungsstand">
        {wartet
          ? anstossen
            ? 'Auf dem Gerät gespeichert, noch nicht übertragen. Übertragen wird, sobald Verbindung besteht.'
            : 'Auf dem Gerät gespeichert, noch nicht übertragen. Übertragen wird, sobald Verbindung besteht und Sie die Anwendung entsperrt haben.'
          : einheit.current && haken.size > 0
            ? 'Alles übertragen. Sie können jederzeit abbrechen.'
            : 'Jeder Haken wird gespeichert – auch ohne Verbindung. Sie können jederzeit abbrechen.'}
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
    const uhr = window.setInterval(() => setRest((r) => Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(uhr);
  }, [sekunden]);
  return (
    <div className="rounded-card border-line bg-surface mt-4 flex items-center justify-between gap-3 border p-4">
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
  zugangId,
  plan,
  einheitskopf,
  abgehakt,
  zurueckPfad,
  onAbbrechen,
  onZurueck,
  onBeendet,
}: {
  zugangId: string;
  plan: Ablageplan;
  einheitskopf: () => Einheitskopf;
  /** Ohne einen Haken gibt es nichts zu beenden - „geübt" hieße sonst nichts. */
  abgehakt: number;
  zurueckPfad: string | undefined;
  onAbbrechen: (() => void) | undefined;
  onZurueck: () => void;
  onBeendet: (ziel: Beendetziel) => void | Promise<void>;
}) {
  const { besitzer, anstossen } = useDurchfuehrungstraeger();
  const [notiz, setNotiz] = useState('');
  // TRK-001: Anstrengung und Schmerz, freiwillig, nichts vorausgewählt.
  const [werte, setWerte] = useState<Record<string, number | null>>({});
  const groessen = groessenImTakt('session');
  const ungueltig = groessen.find((g) => {
    const w = werte[g.key];
    return w !== null && w !== undefined && !angabeGueltig(g, w);
  });
  const beenden = useMutation({
    mutationFn: async (): Promise<Beendetziel> => {
      const kopf = einheitskopf();
      const angaben = Object.fromEntries(
        Object.entries(werte).filter((e): e is [string, number] => e[1] !== null),
      );
      // Auch das Ende liegt zuerst auf dem Gerät (ADR-024 Punkt 5).
      try {
        await ereignisAblegen(
          besitzer,
          { ...kopf, zugangId, planId: plan.id },
          {
            id: crypto.randomUUID(),
            kind: 'finish',
            at: new Date().toISOString(),
            note: plan.note_allowed ? notiz : '',
            values: plan.note_allowed ? angaben : {},
          },
        );
      } catch {
        throw new Error('Nicht gespeichert. Bitte erneut versuchen.');
      }
      if (!anstossen) return 'gespeichert=geraet';
      const ergebnis = await anstossen().catch(() => null);
      return ergebnis?.angekommen.includes(kopf.id) ? 'gespeichert=1' : 'gespeichert=geraet';
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
          if (!ungueltig) beenden.mutate();
        }}
      >
        {/* TRK-001: Angaben zur Einheit - im Training nur mit Einwilligung
            (ADR-021 Punkt 4), dieselbe Bedingung wie der Satz darunter. */}
        {plan.note_allowed && abgehakt > 0
          ? groessen.map((g) => (
              <Angabefeld
                key={g.key}
                groesse={g}
                wert={werte[g.key] ?? null}
                onChange={(w) => setWerte((bisher) => ({ ...bisher, [g.key]: w }))}
              />
            ))
          : null}
        {plan.note_allowed && abgehakt > 0 ? (
          <TextArea
            label="Das war schwierig, weil … (freiwillig)"
            hint={`${
              plan.service_area === 'therapy' ? 'Ihre Therapeut:in' : 'Ihre Trainingsbetreuung'
            } sieht diesen Satz. Er wird nicht laufend gelesen – bei akuten Beschwerden: 112 oder 116117.`}
            maxLength={500}
            rows={3}
            value={notiz}
            onChange={(e) => setNotiz(e.target.value)}
          />
        ) : null}
        {beenden.isError ? (
          <Statusmeldung ton="fehler">{beenden.error.message}</Statusmeldung>
        ) : null}
        {ungueltig ? (
          <Statusmeldung ton="fehler">
            {`„${ungueltig.kurz}“: bitte eine ganze Zahl von ${ungueltig.min} bis ${ungueltig.max}.`}
          </Statusmeldung>
        ) : null}
        {abgehakt > 0 ? (
          <Button type="submit" disabled={beenden.isPending}>
            {beenden.isPending ? 'Wird gespeichert …' : 'Einheit beenden'}
          </Button>
        ) : (
          <Statusmeldung>
            Sie haben noch keinen Durchgang abgehakt. Ohne Haken gibt es nichts zu speichern.
          </Statusmeldung>
        )}
        <Button type="button" variant="secondary" onClick={onZurueck}>
          Zurück zu den Übungen
        </Button>
        <Zurueck pfad={zurueckPfad} onZurueck={onAbbrechen}>
          Abbrechen
        </Zurueck>
      </form>
    </>
  );
}

/** „Abbrechen": in der Plattform ein Link, in der lokalen Ansicht ein Knopf. */
function Zurueck({
  pfad,
  onZurueck,
  children,
}: {
  pfad: string | undefined;
  onZurueck: (() => void) | undefined;
  children: string;
}) {
  if (pfad) {
    return (
      <ButtonLink variant="quiet" to={pfad}>
        {children}
      </ButtonLink>
    );
  }
  return (
    <Button variant="quiet" onClick={onZurueck}>
      {children}
    </Button>
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
