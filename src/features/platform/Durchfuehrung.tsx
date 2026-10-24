import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Angabefeld } from '@/components/ui/Angabefeld';
import { Buehne } from '@/components/ui/Buehne';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { Hakenzeile } from '@/components/ui/Hakenzeile';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TextArea } from '@/components/ui/TextArea';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
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
import { Anleitung } from './Anleitung';
import {
  plaeneSchluessel,
  termineSchluessel,
  type EigenerPlan,
  type PlanPosition,
  type Plattformzugang,
} from './api';
import { Dosierungsmarken } from './Dosierungsmarken';
import { ersteOffeneUebung, hakenSchluessel as schluessel } from './haken';
import {
  Durchfuehrungsfuss,
  type Hauptaktion,
  type Uebertragungsstand,
} from './Durchfuehrungsfuss';
import { Durchfuehrungskopf } from './Durchfuehrungskopf';
import { usePlattformApi } from './einsicht';
import { Endseite } from './Endseite';
import { naechsterTermin } from './hauptsache';
import { hauptzahl } from './hauptzahl';
import { Notrufnummer } from './Notfallsatz';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { naechsterUebungstag } from './uebungstage';
import { Verbindungszeile } from './Verbindungszeile';
import { tagFest } from './zeit';

/**
 * Die Durchführungsansicht (UEB-010, IDEA-ORG-003): „Ich stehe gerade in der
 * Küche und mache meine Übungen."
 *
 * Übung für Übung, große Ziele für einen Finger, Durchgang abhaken, die
 * Pause der Fachperson als Ring. **Jeder Haken liegt zuerst auf dem Gerät und
 * geht dann an den Server** (TRK-008, ADR-024 Punkt 5, ANN-358): Wer im
 * Keller ohne Empfang übt, verliert nichts, und wer „Später weiter“ wählt
 * oder das Telefon weglegt, auch nicht. Ohne Verbindung übt die Person am
 * Plan vom letzten Laden. Der Fuß sagt, ob noch etwas auf dem Gerät wartet
 * oder alles übertragen ist - niemand soll glauben, etwas sei bei der Praxis,
 * das nur auf dem Telefon liegt (ADR-001, ADR-024 Punkt 8).
 *
 * **Gestalt** (Handoff 2026-10-24, Abschnitte 3 bis 5; DRP-EPIC-008): Vollbild
 * ohne Kopf und Reiterleiste der Plattform (`PlattformApp`), mit eigenem Kopf
 * (Zurück, Später weiter, Balken) und festem Fuß mit genau einem Hauptknopf;
 * dazwischen Bühne, Marken, Anleitung und die Hakenzeilen. Nach dem Beenden
 * folgt die `Endseite` auf derselben Route (`?gespeichert=…`).
 *
 * Keine Punktzahl, keine Serie, kein Lob aus der Software (DSN-001 4.1).
 * Während der Einheit bittet die Ansicht das Gerät, den Bildschirm wach zu
 * halten, soweit der Browser das kann - auf der Endseite nicht mehr.
 */
export function Durchfuehrung({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
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
    queryFn: () => api.ladePlaene(zugang.access_id),
    // Die Haken stehen in der Ansicht; ein Neuladen im Hintergrund würde sie
    // mit dem Stand vom Öffnen überschreiben.
    refetchOnWindowFocus: false,
  });
  const ende = endeAusSuche(suche);
  // Ohne Antwort - ein Fehler oder, ohne Netz, ein angehaltener erster Abruf
  // (BEF-211): der Plan vom letzten Laden (ADR-024 Punkt 5).
  const ohneAntwort = plaene.isError || (plaene.isPending && plaene.fetchStatus === 'paused');
  const abgelegt = useQuery({
    queryKey: ['abgelegter-plan', besitzer, zugang.access_id, planId],
    queryFn: async () => (await abgelegterPlan(besitzer, zugang.access_id, planId)) ?? null,
    enabled: ohneAntwort && !ende,
    // Liest nur das Gerät: auch ohne Netz.
    networkMode: 'always',
    gcTime: 0,
  });
  const plan = plaene.data?.plans.find((p) => p.id === planId);

  // Nach „Einheit beenden“ (ANN-706): dieselbe Route mit dem Ziel im Link,
  // damit Neuladen und „Zurück“ des Browsers nicht in eine neue Einheit führen.
  function beendet(ziel: Beendetziel, tag: string) {
    const parameter = new URLSearchParams(suche);
    const [schluessel, wert] = ziel.split('=') as [string, string];
    parameter.set(schluessel, wert);
    parameter.set('tag', tag);
    void navigate(`${pathname}?${parameter.toString()}`, { replace: true });
  }

  if (ende) {
    return <EndeDerEinheit zugang={zugang} plan={plan} ende={ende} zurueck={zurueck} />;
  }
  if (ohneAntwort ? abgelegt.isPending : plaene.isPending) {
    return <EinheitLaedt spaeter={{ pfad: zurueck }} />;
  }
  if (plaene.data === undefined) {
    if (abgelegt.data) {
      return (
        <EinheitMitWarteschlange
          zugangId={zugang.access_id}
          plan={abgelegt.data}
          ohneVerbindung
          zurueckPfad={zurueck}
          onBeendet={beendet}
        />
      );
    }
    return (
      <Ausweg pfad={zurueck}>
        <ErrorState
          title="Ihre Übungen lassen sich gerade nicht laden."
          description="Prüfen Sie die Verbindung oder versuchen Sie es gleich noch einmal."
          onErneut={() => plaene.refetch()}
        />
      </Ausweg>
    );
  }
  if (!plan || !plan.can_exercise || plan.items.length === 0) {
    return (
      <Ausweg pfad={zurueck}>
        <EmptyState title="Mit diesem Plan können Sie hier gerade nicht üben." />
      </Ausweg>
    );
  }
  return (
    <EinheitMitWarteschlange
      zugangId={zugang.access_id}
      plan={plan}
      zurueckPfad={zurueck}
      onBeendet={(ziel, tag) => {
        // Neu laden, aber nicht darauf warten (BEF-210): Ohne Netz pausiert
        // die Abfrage bis zur nächsten Verbindung, und „Wird gespeichert …“
        // stünde so lange da. Die Endseite liest den Plan aus dem Speicher.
        void queryClient.invalidateQueries({ queryKey: plaeneSchluessel(zugang.access_id) });
        beendet(ziel, tag);
      }}
    />
  );
}

/** Wohin nach dem Beenden: übertragen oder noch auf dem Gerät. */
export type Beendetziel = 'gespeichert=1' | 'gespeichert=geraet';

/** Die Fassung der Endseite aus dem Link, `null` während der Einheit. */
function endeAusSuche(suche: URLSearchParams): 'uebertragen' | 'geraet' | null {
  const wert = suche.get('gespeichert');
  return wert === '1' ? 'uebertragen' : wert === 'geraet' ? 'geraet' : null;
}

interface EinheitProps {
  zugangId: string;
  plan: Ablageplan;
  /** Der Plan kommt aus der Ablage, nicht vom Server. */
  ohneVerbindung?: boolean;
  /** „Später weiter“: in der Plattform ein Link, sonst ein Knopf. */
  zurueckPfad?: string;
  onZurueck?: () => void;
  /** `tag` ist der Kalendertag der Einheit (ANN-357). */
  onBeendet: (ziel: Beendetziel, tag: string) => void | Promise<void>;
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
    // Liest nur das Gerät: auch ohne Netz, sonst hielte die Abfrage an (BEF-211).
    networkMode: 'always',
    gcTime: 0,
    staleTime: Infinity,
  });
  if (wartend.isPending) {
    return (
      <EinheitLaedt
        spaeter={props.zurueckPfad ? { pfad: props.zurueckPfad } : { onSpaeter: props.onZurueck }}
      />
    );
  }
  return <Einheit {...props} wartend={wartend.data ?? []} />;
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
  const verbunden = useIstVerbunden();

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

  const [index, setIndex] = useState(() => ersteOffeneUebung(plan.items, start.haken));
  const [fertig, setFertig] = useState(false);
  const [haken, setHaken] = useState<ReadonlySet<string>>(start.haken);
  const [fehler, setFehler] = useState<string | null>(null);
  // Die laufende Pause vor `durchgang`; `nummer` startet den Ring auch bei
  // gleicher Dauer neu.
  const [pause, setPause] = useState<{
    sekunden: number;
    nummer: number;
    durchgang: number;
  } | null>(null);

  useBildschirmWach();

  // Beim Wechsel der Übung oder zum Abschluss: nach oben und der Fokus auf den
  // Namen (Handoff 5.3) - nicht beim ersten Zeichnen.
  const titel = useRef<HTMLHeadingElement>(null);
  const abschlusskopf = useRef<HTMLDivElement>(null);
  const ansicht = fertig ? -1 : index;
  const vorige = useRef(ansicht);
  useEffect(() => {
    if (vorige.current === ansicht) return;
    vorige.current = ansicht;
    window.scrollTo({ top: 0 });
    const ziel = titel.current ?? abschlusskopf.current?.querySelector('h1');
    ziel?.setAttribute('tabindex', '-1');
    ziel?.focus();
  }, [ansicht]);

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

  const beenden = useEinheitBeenden({ zugangId, plan, einheitskopf, onBeendet });

  const position = plan.items[index]!;
  const letzte = index === plan.items.length - 1;
  const wartet =
    einheit.current !== null &&
    warteschlange.einheiten.some((e) => e.id === einheit.current?.id && e.ereignisse.length > 0);
  const stand: Uebertragungsstand = wartet
    ? 'geraet'
    : einheit.current && haken.size > 0
      ? 'uebertragen'
      : 'ohne';
  const abgewiesen = warteschlange.abgewiesen.filter((a) => a.planId === plan.id);
  const spaeter = zurueckPfad ? { pfad: zurueckPfad } : { onSpaeter: onZurueck ?? (() => {}) };

  function wechseln(neu: number) {
    setPause(null);
    setIndex(neu);
  }

  if (fertig) {
    return (
      <Abschluss
        plan={plan}
        tag={einheit.current?.tag ?? geraetetag()}
        abgehakt={haken.size}
        stand={stand}
        gesperrt={!anstossen}
        kopf={
          <Durchfuehrungskopf
            uebung={plan.items.length}
            von={plan.items.length}
            abschluss
            onZurueck={() => setFertig(false)}
            spaeter={spaeter}
            ohneNetz={!verbunden}
          />
        }
        titelRef={abschlusskopf}
        beenden={beenden}
        onZurueck={() => setFertig(false)}
      />
    );
  }

  // Ohne Einwilligung im Training gibt es nichts zu fragen (ADR-021 Punkt 4):
  // Die letzte Übung beendet direkt (Handoff, Abschnitt 0). Ohne einen Haken
  // führt der Knopf zum Abschluss, der sagt, dass es nichts zu speichern gibt.
  const direkt = letzte && !plan.note_allowed && haken.size > 0;
  const aktion: Hauptaktion = direkt
    ? {
        text: beenden.isPending ? 'Wird gespeichert …' : 'Einheit beenden',
        onClick: () => beenden.mutate({ notiz: '', werte: {} }),
        disabled: beenden.isPending,
      }
    : {
        text: letzte ? 'Zum Abschluss' : 'Nächste Übung',
        onClick: () => {
          if (letzte) {
            setPause(null);
            setFertig(true);
          } else wechseln(index + 1);
        },
      };
  const { zahl, einheit: zahleinheit } = hauptzahl(position);

  return (
    <Rahmen
      kopf={
        <Durchfuehrungskopf
          uebung={index + 1}
          von={plan.items.length}
          onZurueck={index > 0 ? () => wechseln(index - 1) : undefined}
          spaeter={spaeter}
          ohneNetz={!verbunden}
        />
      }
      fuss={
        <>
          {beenden.isError ? (
            <Meldungsleiste>
              <Statusmeldung ton="fehler">{beenden.error.message}</Statusmeldung>
            </Meldungsleiste>
          ) : null}
          <Durchfuehrungsfuss aktion={aktion} stand={stand} gesperrt={!anstossen} />
        </>
      }
    >
      {/* BEF-197: Meldet das Gerät Verbindung und antwortet der Server
          nicht, sagt es diese Zeile; ohne Netz spricht der Kopf. */}
      {ohneVerbindung && verbunden ? (
        <Statusmeldung ton="warnung">
          Die Praxis antwortet gerade nicht. Üben können Sie trotzdem – mit Ihrem Plan von diesem
          Gerät.
        </Statusmeldung>
      ) : null}
      {abgewiesen.map((a) => (
        <div key={a.einheitId} className="flex flex-wrap items-center gap-x-3">
          <Statusmeldung ton="fehler">{`Nicht übertragen: ${a.satz}`}</Statusmeldung>
          <Button
            type="button"
            variant="quiet"
            groesse="kompakt"
            onClick={() => abweisungGelesen(a.einheitId)}
          >
            Ausblenden
          </Button>
        </div>
      ))}
      {/* Der Schlüssel blendet die neue Übung ein (Abschnitt 7). */}
      <div key={position.id} className="uebung-wechsel flex flex-col gap-6">
        <Buehne
          name={position.variant_lay_name}
          zahl={zahl}
          einheit={zahleinheit}
          titelRef={titel}
        />
        <Dosierungsmarken dosis={position} />
        <div className="flex flex-wrap gap-6">
          <div className="min-w-0 flex-[1_1_21.25rem] empty:hidden">
            <Anleitung position={position} />
          </div>
          <Durchgaenge
            anzahl={position.sets}
            erledigt={(d) => haken.has(schluessel(position.id, d))}
            pause={pause}
            fehler={fehler}
            onUmschalten={(durchgang, erledigt) => {
              void setzen(position, durchgang, !erledigt);
              if (!erledigt && position.rest_seconds && durchgang < position.sets) {
                const sekunden = position.rest_seconds;
                setPause((alt) => ({
                  sekunden,
                  nummer: (alt?.nummer ?? 0) + 1,
                  durchgang: durchgang + 1,
                }));
              } else if (pause?.durchgang === durchgang) {
                setPause(null);
              }
            }}
            onPauseEnde={() => setPause(null)}
          />
        </div>
      </div>
    </Rahmen>
  );
}

/** Die Hakenzeilen einer Übung (Handoff 5.3: „Durchgänge“ als `h2`). */
function Durchgaenge({
  anzahl,
  erledigt,
  pause,
  fehler,
  onUmschalten,
  onPauseEnde,
}: {
  anzahl: number;
  erledigt: (durchgang: number) => boolean;
  pause: { sekunden: number; nummer: number; durchgang: number } | null;
  fehler: string | null;
  onUmschalten: (durchgang: number, erledigt: boolean) => void;
  onPauseEnde: () => void;
}) {
  const titelId = useId();
  return (
    <section aria-labelledby={titelId} className="flex min-w-0 flex-[1_1_16.25rem] flex-col">
      <Zwischentitel ebene={2} stufe="abschnitt" id={titelId}>
        Durchgänge
      </Zwischentitel>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: anzahl }, (_, i) => i + 1).map((durchgang) => {
          const fertig = erledigt(durchgang);
          return (
            <li key={durchgang}>
              <Hakenzeile
                durchgang={durchgang}
                erledigt={fertig}
                pause={pause?.durchgang === durchgang ? pause : null}
                onUmschalten={() => onUmschalten(durchgang, fertig)}
                onPauseEnde={onPauseEnde}
              />
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
          einmal, nicht jede Sekunde und nicht ihr Ende (ANN-709). */}
      <p role="status" className="sr-only">
        {pause ? `Pause: ${pause.sekunden} Sekunden.` : ''}
      </p>
    </section>
  );
}

function umschalten(alt: ReadonlySet<string>, schluessel: string, an: boolean): Set<string> {
  const neu = new Set(alt);
  if (an) neu.add(schluessel);
  else neu.delete(schluessel);
  return neu;
}

/**
 * Das Ende der Einheit, auf dem Gerät und zum Server - dasselbe vom
 * Abschluss und, ohne Einwilligung im Training, direkt von der letzten Übung.
 */
function useEinheitBeenden({
  zugangId,
  plan,
  einheitskopf,
  onBeendet,
}: {
  zugangId: string;
  plan: Ablageplan;
  einheitskopf: () => Einheitskopf;
  onBeendet: EinheitProps['onBeendet'];
}) {
  const { besitzer, anstossen } = useDurchfuehrungstraeger();
  return useMutation({
    // Auch ohne Netz sofort (BEF-211): Mit dem Standard `online` hielt die
    // Abfragebibliothek das Ende an, bis das Gerät wieder Verbindung meldete -
    // es lag so lange nicht einmal auf dem Gerät, und „Wird gespeichert …“
    // stand still. Ob übertragen wird, entscheidet `anstossen`.
    networkMode: 'always',
    mutationFn: async ({
      notiz,
      werte,
    }: {
      notiz: string;
      werte: Record<string, number | null>;
    }): Promise<{ ziel: Beendetziel; tag: string }> => {
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
      if (!anstossen) return { ziel: 'gespeichert=geraet', tag: kopf.tag };
      const ergebnis = await anstossen().catch(() => null);
      return {
        ziel: ergebnis?.angekommen.includes(kopf.id) ? 'gespeichert=1' : 'gespeichert=geraet',
        tag: kopf.tag,
      };
    },
    onSuccess: ({ ziel, tag }) => onBeendet(ziel, tag),
  });
}

/** Handoff 5.4: „Einheit beenden“ mit den freiwilligen Angaben und einem Hauptknopf. */
function Abschluss({
  plan,
  tag,
  abgehakt,
  stand,
  gesperrt,
  kopf,
  titelRef,
  beenden,
  onZurueck,
}: {
  plan: Ablageplan;
  tag: string;
  /** Ohne einen Haken gibt es nichts zu beenden - „geübt" hieße sonst nichts. */
  abgehakt: number;
  stand: Uebertragungsstand;
  gesperrt: boolean;
  kopf: ReactNode;
  /** Um den Titel: Beim Wechsel hierher geht der Fokus auf ihn. */
  titelRef: RefObject<HTMLDivElement | null>;
  beenden: ReturnType<typeof useEinheitBeenden>;
  onZurueck: () => void;
}) {
  const formId = useId();
  const fragenId = useId();
  const [notiz, setNotiz] = useState('');
  // TRK-001: Anstrengung und Schmerz, freiwillig, nichts vorausgewählt.
  const [werte, setWerte] = useState<Record<string, number | null>>({});
  const groessen = groessenImTakt('session');
  const ungueltig = groessen.find((g) => {
    const w = werte[g.key];
    return w !== null && w !== undefined && !angabeGueltig(g, w);
  });
  // TRK-001: Angaben zur Einheit - im Training nur mit Einwilligung
  // (ADR-021 Punkt 4), dieselbe Bedingung wie der Satz darunter.
  const fragen = plan.note_allowed && abgehakt > 0;
  const aktion: Hauptaktion =
    abgehakt > 0
      ? {
          text: beenden.isPending ? 'Wird gespeichert …' : 'Einheit beenden',
          form: formId,
          disabled: beenden.isPending,
        }
      : { text: 'Zurück zu den Übungen', onClick: onZurueck };
  return (
    <Rahmen
      kopf={kopf}
      fuss={
        <>
          {beenden.isError || ungueltig ? (
            <Meldungsleiste>
              {beenden.isError ? (
                <Statusmeldung ton="fehler">{beenden.error.message}</Statusmeldung>
              ) : null}
              {ungueltig ? (
                <Statusmeldung ton="fehler">
                  {`„${ungueltig.kurz}“: bitte eine ganze Zahl von ${ungueltig.min} bis ${ungueltig.max}.`}
                </Statusmeldung>
              ) : null}
            </Meldungsleiste>
          ) : null}
          <Durchfuehrungsfuss aktion={aktion} stand={stand} gesperrt={gesperrt} />
        </>
      }
    >
      <div ref={titelRef}>
        <PageHeader
          title="Einheit beenden"
          description={
            <p className="text-ink-muted">
              {/* Der Planname ist ein Name: getrennt wird nur unter 23rem (ANN-707). */}
              <span className="trennen-schmal hyphens-manual">{plan.title}</span> · {tagFest(tag)}
            </p>
          }
        />
      </div>
      {abgehakt > 0 ? null : (
        <Statusmeldung>
          Sie haben noch keinen Durchgang abgehakt. Ohne Haken gibt es nichts zu speichern.
        </Statusmeldung>
      )}
      <form
        id={formId}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!ungueltig && abgehakt > 0) beenden.mutate({ notiz, werte });
        }}
      >
        {fragen ? (
          <section aria-labelledby={fragenId} className="flex flex-col gap-4">
            <div>
              <Zwischentitel ebene={2} stufe="abschnitt" id={fragenId}>
                Wie war es heute?
              </Zwischentitel>
              <p className="text-ink-muted">Alle Angaben sind freiwillig.</p>
            </div>
            {groessen.map((g) => (
              <Angabefeld
                key={g.key}
                groesse={g}
                wert={werte[g.key] ?? null}
                onChange={(w) => setWerte((bisher) => ({ ...bisher, [g.key]: w }))}
              />
            ))}
            <TextArea
              label="Das war schwierig, weil … (freiwillig)"
              hint={
                <>
                  {plan.service_area === 'therapy'
                    ? 'Ihre Therapeut:in'
                    : 'Ihre Trainingsbetreuung'}{' '}
                  sieht diesen Satz. Er wird nicht laufend gelesen – bei akuten Beschwerden:{' '}
                  <Notrufnummer nummer="112" /> oder <Notrufnummer nummer="116117" />.
                </>
              }
              maxLength={500}
              rows={3}
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
            />
          </section>
        ) : null}
      </form>
    </Rahmen>
  );
}

/**
 * Die Seite der Durchführung (Handoff, Abschnitt 4): Kopf und Fuß stehen fest,
 * dazwischen rollt der Inhalt in `max-w-spalte`. Unter 23rem rollen Kopf und
 * Fuß mit, der Fuß steht am Ende des Inhalts.
 */
function Rahmen({
  kopf,
  fuss,
  children,
}: {
  kopf: ReactNode;
  fuss: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-20 max-[23rem]:static">{kopf}</div>
      <div className="max-w-spalte mx-auto flex w-full flex-1 flex-col gap-6 px-5 pt-5 pb-8 max-[23rem]:px-3">
        {children}
      </div>
      <div className="sticky bottom-0 z-20 max-[23rem]:static">{fuss}</div>
    </div>
  );
}

/** Meldungen über dem Fuß, auf dessen Fläche. */
function Meldungsleiste({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface px-5 pt-3 max-[23rem]:px-3">
      <div className="max-w-spalte mx-auto flex w-full flex-col gap-2">{children}</div>
    </div>
  );
}

/** Ein Kopf nur mit dem Ausweg: beim Laden, bei Fehlern und ohne Plan. */
function Notkopf({
  spaeter,
}: {
  spaeter: { pfad: string } | { onSpaeter?: (() => void) | undefined };
}) {
  return (
    <div className="bg-surface border-line flex min-h-16 items-center justify-end border-b p-2">
      {'pfad' in spaeter ? (
        <ButtonLink variant="quiet" to={spaeter.pfad}>
          Später weiter
        </ButtonLink>
      ) : (
        <Button type="button" variant="quiet" onClick={spaeter.onSpaeter}>
          Später weiter
        </Button>
      )}
    </div>
  );
}

/** Fehler und „kann hier nicht üben“: der Satz und ein Weg zurück zu den Übungen. */
function Ausweg({ pfad, children }: { pfad: string; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="bg-surface border-line flex min-h-16 items-center border-b p-2">
        <ButtonLink variant="quiet" to={pfad}>
          Zu den Übungen
        </ButtonLink>
      </div>
      <div className="max-w-spalte mx-auto w-full px-5 pt-5 pb-8 max-[23rem]:px-3">{children}</div>
    </div>
  );
}

/** Handoff 5.6: „Später weiter“ steht, Bühne, Marken, Zeilen und der Fuß als Fläche. */
function EinheitLaedt({
  spaeter,
}: {
  spaeter: { pfad: string } | { onSpaeter?: (() => void) | undefined };
}) {
  return (
    <SkelettBereich beschriftung="Übung wird geladen" className="flex flex-1 flex-col">
      <Notkopf spaeter={spaeter} />
      <div className="max-w-spalte mx-auto flex w-full flex-1 flex-col gap-6 px-5 pt-5 pb-8 max-[23rem]:px-3">
        <Skelett form="buehne" />
        <span className="flex gap-2">
          <Skelett form="zeile" className="w-32" />
          <Skelett form="zeile" className="w-40" />
        </span>
        <span className="flex flex-col gap-3">
          <Skelett form="karte" />
          <Skelett form="karte" />
        </span>
      </div>
      <div className="bg-surface border-line border-t px-5 pt-3 pb-4">
        <Skelett form="knopf" className="max-w-spalte mx-auto" />
      </div>
    </SkelettBereich>
  );
}

/**
 * Die Endseite in der Plattform (Handoff 5.5, ANN-706): wer die Einheit
 * sieht - die Person des nächsten Termins, sonst „Ihre Therapeut:in“ bzw.
 * „Ihre Trainingsbetreuung“ (ANN-712) - und der nächste Übungstag aus dem
 * Plan, wenn der Server ihn geliefert hat. Ohne Netz steht die
 * Verbindungszeile darüber.
 */
function EndeDerEinheit({
  zugang,
  plan,
  ende,
  zurueck,
}: {
  zugang: Plattformzugang;
  plan: EigenerPlan | undefined;
  ende: 'uebertragen' | 'geraet';
  zurueck: string;
}) {
  const api = usePlattformApi();
  const [suche] = useSearchParams();
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => api.ladeTermine(zugang.access_id),
    enabled: ende === 'uebertragen',
  });
  const bereich = bereichParameter(suche);
  const tagImLink = suche.get('tag');
  const tag = tagImLink && /^\d{4}-\d{2}-\d{2}$/.test(tagImLink) ? tagImLink : geraetetag();
  const name = termine.data ? naechsterTermin(termine.data)?.staff_name : null;
  const wer =
    name ??
    (zugang.relationship_kind === 'training' ? 'Ihre Trainingsbetreuung' : 'Ihre Therapeut:in');
  return (
    <div className="flex flex-1 flex-col">
      {ende === 'geraet' ? <Verbindungszeile /> : null}
      <Endseite
        fassung={ende}
        tag={tag}
        // Den Satz erst, wenn feststeht, wer ihn sieht - kein Springen des Namens.
        wer={termine.isPending && ende === 'uebertragen' ? null : wer}
        naechsterTag={plan ? naechsterUebungstag(plan, tag) : null}
        zurUebersicht={`${PLATTFORM_PFAD}${bereich ? `?${bereich}` : ''}`}
        zuDenUebungen={zurueck}
      />
    </div>
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
