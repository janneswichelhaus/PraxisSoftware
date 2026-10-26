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
  aktuellerAblagestand,
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
  ladePlaene,
  ladeTermine,
  type EigenerPlan,
  type PlanPosition,
  type Plattformzugang,
} from './api';
import { Dosierungsmarken } from './Dosierungsmarken';
import { ersteOffeneUebung, hakenSchluessel as schluessel, heutigeEinheit } from './haken';
import {
  Durchfuehrungsfuss,
  type Hauptaktion,
  type Uebertragungsstand,
} from './Durchfuehrungsfuss';
import { Durchfuehrungskopf } from './Durchfuehrungskopf';
import { useRechner } from './geruestbreite';
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
  // Wer die Einheit sieht (ANN-712): die Fachperson des nächsten Termins,
  // sonst das Wort des Bereichs - am freien Feld und auf der Endseite.
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const name = termine.data ? naechsterTermin(termine.data)?.staff_name : null;
  const wer =
    name ??
    (zugang.relationship_kind === 'training' ? 'Ihre Trainingsbetreuung' : 'Ihre Therapeut:in');
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
    return (
      <EndeDerEinheit
        plan={plan}
        ende={ende}
        // Den Satz erst, wenn feststeht, wer ihn sieht - kein Springen des Namens.
        wer={termine.isPending ? null : wer}
        zurueck={zurueck}
      />
    );
  }
  // Übt die Person schon am Plan vom Gerät, bleibt die Einheit stehen, auch
  // wenn der Abruf beim Wiederverbinden neu beginnt: Kommt der Plan vom
  // Server, nimmt dieselbe Einheit ihn auf, mit ihren Haken und ihrer Übung.
  if (plaene.data === undefined && abgelegt.data) {
    return (
      <EinheitMitWarteschlange
        zugangId={zugang.access_id}
        plan={abgelegt.data}
        ohneVerbindung
        zurueckPfad={zurueck}
        werSieht={wer}
        onBeendet={beendet}
      />
    );
  }
  if (ohneAntwort ? abgelegt.isPending : plaene.isPending) {
    return <EinheitLaedt spaeter={{ pfad: zurueck }} />;
  }
  // Der Seitentitel wie am Reiter: „Übungen“ bzw. „Training“.
  const seitentitel = zugang.relationship_kind === 'training' ? 'Training' : 'Übungen';
  if (plaene.data === undefined) {
    return (
      <Ausweg titel={seitentitel} pfad={zurueck}>
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
      <Ausweg titel={seitentitel} pfad={zurueck}>
        <EmptyState markenform title="Mit diesem Plan können Sie hier gerade nicht üben." />
      </Ausweg>
    );
  }
  return (
    <EinheitMitWarteschlange
      zugangId={zugang.access_id}
      plan={plan}
      zurueckPfad={zurueck}
      werSieht={wer}
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

/** Ein Kalendertag `YYYY-MM-DD` aus dem Link, nur wenn es ihn gibt. */
function tagAusLink(wert: string | null): string | null {
  if (!wert || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const tag = new Date(`${wert}T12:00:00`);
  return Number.isNaN(tag.getTime()) || geraetetag(tag) !== wert ? null : wert;
}

interface EinheitProps {
  zugangId: string;
  plan: Ablageplan;
  /** Der Plan kommt aus der Ablage, nicht vom Server. */
  ohneVerbindung?: boolean;
  /** „Später weiter“: in der Plattform ein Link, sonst ein Knopf. */
  zurueckPfad?: string;
  onZurueck?: () => void;
  /** Wer den Satz am freien Feld sieht (ANN-712); ohne Angabe das Wort des Bereichs. */
  werSieht?: string;
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

/** Der Server hat das Ende abgewiesen; die Einheit ist verworfen (ADR-024 Punkt 8). */
class EndeAbgewiesen extends Error {
  readonly einheitId: string;
  constructor(einheitId: string, satz: string) {
    super(`Nicht übertragen: ${satz}`);
    this.einheitId = einheitId;
  }
}

function Einheit({
  zugangId,
  plan,
  ohneVerbindung = false,
  zurueckPfad,
  onZurueck,
  werSieht,
  onBeendet,
  wartend,
}: EinheitProps & { wartend: WartendeEinheit[] }) {
  const { besitzer, anstossen } = useDurchfuehrungstraeger();
  const warteschlange = useWarteschlange(besitzer);
  const verbunden = useIstVerbunden();
  const formId = useId();

  // Weiter mit der heute auf dem Gerät begonnenen Einheit, sonst mit der heute
  // beim Server offenen; eine neue entsteht mit dem ersten Haken. Dieselbe
  // Rechnung wie die Vorschau im Reiter (BEF-218).
  const [start] = useState(() => {
    const tag = geraetetag();
    const heutige = heutigeEinheit(plan, zugangId, wartend, tag);
    const kopf: Einheitskopf | null = heutige.id
      ? { id: heutige.id, begonnenAm: heutige.lokal?.begonnenAm ?? new Date().toISOString(), tag }
      : null;
    return {
      kopf,
      haken: heutige.haken,
      ereignisse: (heutige.lokal?.ereignisse ?? []).map((x) => x.id),
    };
  });
  const einheit = useRef<Einheitskopf | null>(start.kopf);
  // Die Ereignisse dieser Einheit auf dem Gerät - weist der Server eines ab,
  // ist sie nicht (ganz) bei der Praxis.
  const eigene = useRef(new Set<string>(start.ereignisse));

  const [gewaehlt, setIndex] = useState(() => ersteOffeneUebung(plan.items, start.haken));
  // Kommt der Plan nach dem Wiederverbinden vom Server, kann er kürzer sein.
  const index = Math.min(gewaehlt, plan.items.length - 1);
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
  // Überblendet wird erst beim Wechsel, nicht beim ersten Zeigen (Abschnitt 7).
  const [gewechselt, setGewechselt] = useState(false);
  // Die freiwilligen Angaben des Abschlusses bleiben beim „Zurück“ stehen.
  const [notiz, setNotiz] = useState('');
  // TRK-001: Anstrengung und Schmerz, freiwillig, nichts vorausgewählt.
  const [werte, setWerte] = useState<Record<string, number | null>>({});
  // Was dieser Bildschirm abgelegt hat: wie viele Haken gerade auf dem Weg
  // auf das Gerät sind, und bis zu welchem Stand der Ablage (ADR-024 Punkt 8).
  const [schreibend, setSchreibend] = useState(0);
  const [geschrieben, setGeschrieben] = useState(0);

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

  const beenden = useEinheitBeenden({
    zugangId,
    plan,
    einheitskopf,
    onBeendet,
    merken: (id) => eigene.current.add(id),
  });
  // Während des Beendens nimmt die Einheit keinen Haken mehr an: Er käme
  // hinter ihr Ende (BEF-213).
  const beendetGerade = beenden.isPending || beenden.isSuccess;

  async function setzen(
    position: PlanPosition | Ablageplan['items'][number],
    durchgang: number,
    erledigt: boolean,
  ) {
    setFehler(null);
    setHaken((alt) => umschalten(alt, schluessel(position.id, durchgang), erledigt));
    const kopf = einheitskopf();
    const ereignis = {
      id: crypto.randomUUID(),
      kind: 'set' as const,
      at: new Date().toISOString(),
      item_id: position.id,
      set_number: durchgang,
      done: erledigt,
    };
    eigene.current.add(ereignis.id);
    setSchreibend((n) => n + 1);
    try {
      // Erst auf das Gerät (ADR-024 Punkt 5), dann zum Server.
      const { einheitId: abgelegtIn } = await ereignisAblegen(
        besitzer,
        { ...kopf, zugangId, planId: plan.id },
        ereignis,
      );
      // War die Einheit auf dem Gerät schon beendet, liegt der Haken in
      // einer neuen; die nächsten gehören dorthin (BEF-213).
      if (abgelegtIn !== kopf.id) einheit.current = { ...kopf, id: abgelegtIn };
      setGeschrieben((bis) => Math.max(bis, aktuellerAblagestand()));
    } catch {
      // Nicht einmal auf dem Gerät: zurücknehmen, was nicht gespeichert ist (ADR-001).
      setHaken((alt) => umschalten(alt, schluessel(position.id, durchgang), !erledigt));
      setFehler('Nicht gespeichert. Bitte erneut tippen.');
      setPause(null);
      return;
    } finally {
      setSchreibend((n) => n - 1);
    }
    void anstossen?.();
  }

  const position = plan.items[index]!;
  const letzte = index === plan.items.length - 1;
  // Der Stand im Fuß (ADR-024 Punkt 8, ANN-710): „übertragen“ nur, wenn die
  // Warteschlange gelesen ist, nachdem der letzte Haken dieses Bildschirms auf
  // dem Gerät lag, und nichts dieses Plans mehr wartet. Ohne Netz sagt der
  // Fuß nicht „übertragen“, während der Kopf „Ihre Haken liegen auf diesem
  // Gerät“ sagt.
  const gelesen = schreibend === 0 && warteschlange.gelesenBis >= geschrieben;
  const planWartet = warteschlange.einheiten.some(
    (e) => e.zugangId === zugangId && e.planId === plan.id && e.ereignisse.length > 0,
  );
  // Hat der Server ein Ereignis dieser Einheit abgewiesen, ist sie verworfen:
  // Danach sagt der Fuß nie mehr „übertragen“, auch nicht nach „Ausblenden“
  // (ANN-716).
  const [abgewiesenGesehen, setAbgewiesenGesehen] = useState(false);
  if (
    !abgewiesenGesehen &&
    warteschlange.abgewiesen.some((a) => a.ereignisse.some((id) => eigene.current.has(id)))
  ) {
    setAbgewiesenGesehen(true);
  }
  const stand: Uebertragungsstand =
    gelesen && !planWartet && haken.size === 0
      ? 'ohne'
      : !gelesen || planWartet
        ? 'geraet'
        : anstossen && verbunden && einheit.current && !abgewiesenGesehen
          ? 'uebertragen'
          : 'ohne';
  // Eine Abweisung des Endes steht über dem Fuß, nicht noch einmal oben.
  const endeAbgewiesen = beenden.error instanceof EndeAbgewiesen ? beenden.error.einheitId : null;
  const abgewiesen = warteschlange.abgewiesen.filter(
    (a) => a.planId === plan.id && a.einheitId !== endeAbgewiesen,
  );
  const spaeter = zurueckPfad ? { pfad: zurueckPfad } : { onSpaeter: onZurueck ?? (() => {}) };
  const groessen = groessenImTakt('session');
  const ungueltig = groessen.find((g) => {
    const w = werte[g.key];
    return w !== null && w !== undefined && !angabeGueltig(g, w);
  });

  function wechseln(neu: number) {
    setPause(null);
    setGewechselt(true);
    setIndex(neu);
  }

  // Ohne Einwilligung im Training gibt es nichts zu fragen (ADR-021 Punkt 4):
  // Die letzte Übung beendet direkt (Handoff, Abschnitt 0; ANN-715). Ohne
  // einen Haken führt der Knopf zum Abschluss, der sagt, dass es nichts zu
  // speichern gibt.
  const direkt = letzte && !plan.note_allowed && haken.size > 0;
  const speichert = beenden.isPending ? 'Wird gespeichert …' : 'Einheit beenden';
  const aktion: Hauptaktion = fertig
    ? haken.size > 0
      ? { text: speichert, form: formId, disabled: beendetGerade }
      : { text: 'Zurück zu den Übungen', onClick: () => setFertig(false) }
    : direkt
      ? {
          text: speichert,
          onClick: () => beenden.mutate({ notiz: '', werte: {} }),
          disabled: beendetGerade,
        }
      : {
          text: letzte ? 'Zum Abschluss' : 'Nächste Übung',
          onClick: () => {
            if (!letzte) return wechseln(index + 1);
            setPause(null);
            setFertig(true);
          },
        };
  const { zahl, einheit: zahleinheit } = hauptzahl(position);

  // Ein Kopf und ein Fuß für Übung und Abschluss: Beim Wechsel bleibt der
  // Stand im Fuß stehen, statt neu zu warten (ANN-710).
  return (
    <Rahmen
      kopf={
        <Durchfuehrungskopf
          uebung={fertig ? plan.items.length : index + 1}
          von={plan.items.length}
          abschluss={fertig}
          onZurueck={
            fertig ? () => setFertig(false) : index > 0 ? () => wechseln(index - 1) : undefined
          }
          spaeter={spaeter}
          ohneNetz={!verbunden}
        />
      }
      fuss={
        <>
          {beenden.isError || (fertig && ungueltig) ? (
            <Meldungsleiste>
              {beenden.isError ? (
                <Statusmeldung ton="fehler">{beenden.error.message}</Statusmeldung>
              ) : null}
              {fertig && ungueltig ? (
                <Statusmeldung ton="fehler">
                  {`„${ungueltig.kurz}“: bitte eine ganze Zahl von ${ungueltig.min} bis ${ungueltig.max}.`}
                </Statusmeldung>
              ) : null}
            </Meldungsleiste>
          ) : null}
          <Durchfuehrungsfuss aktion={aktion} stand={stand} gesperrt={!anstossen} />
        </>
      }
    >
      {fertig ? (
        <Abschluss
          plan={plan}
          tag={einheit.current?.tag ?? geraetetag()}
          abgehakt={haken.size}
          werSieht={
            werSieht ??
            (plan.service_area === 'therapy' ? 'Ihre Therapeut:in' : 'Ihre Trainingsbetreuung')
          }
          formId={formId}
          titelRef={abschlusskopf}
          notiz={notiz}
          onNotiz={setNotiz}
          werte={werte}
          onWert={(key, w) => setWerte((bisher) => ({ ...bisher, [key]: w }))}
          onAbsenden={() => {
            if (!ungueltig && haken.size > 0 && !beendetGerade) beenden.mutate({ notiz, werte });
          }}
        />
      ) : (
        <>
          {/* BEF-197, ANN-713: Meldet das Gerät Verbindung und antwortet der
              Server nicht, sagt es diese Zeile; ohne Netz spricht der Kopf. */}
          {ohneVerbindung && verbunden ? (
            <Statusmeldung ton="warnung">
              Die Praxis antwortet gerade nicht. Üben können Sie trotzdem – mit Ihrem Plan von
              diesem Gerät.
            </Statusmeldung>
          ) : null}
          {abgewiesen.map((a) => (
            <div key={a.einheitId} className="flex flex-wrap items-center gap-x-3">
              <Statusmeldung ton="fehler">{`Nicht übertragen: ${a.satz}`}</Statusmeldung>
              <Button type="button" variant="quiet" onClick={() => abweisungGelesen(a.einheitId)}>
                Ausblenden
              </Button>
            </div>
          ))}
          {/* Der Schlüssel blendet die neue Übung ein (Abschnitt 7). */}
          <div
            key={position.id}
            className={`flex flex-col gap-6 ${gewechselt ? 'uebung-wechsel' : ''}`}
          >
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
                  if (beendetGerade) return;
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
        </>
      )}
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
  merken,
}: {
  zugangId: string;
  plan: Ablageplan;
  einheitskopf: () => Einheitskopf;
  onBeendet: EinheitProps['onBeendet'];
  /** Das Ende gehört zu den Ereignissen der Einheit (Abweisung im Fuß). */
  merken: (ereignisId: string) => void;
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
      let ende: string;
      try {
        ({ ereignisId: ende } = await ereignisAblegen(
          besitzer,
          { ...kopf, zugangId, planId: plan.id },
          {
            id: crypto.randomUUID(),
            kind: 'finish',
            at: new Date().toISOString(),
            note: plan.note_allowed ? notiz : '',
            values: plan.note_allowed ? angaben : {},
          },
        ));
      } catch {
        throw new Error('Nicht gespeichert. Bitte erneut versuchen.');
      }
      merken(ende);
      if (!anstossen) return { ziel: 'gespeichert=geraet', tag: kopf.tag };
      const ergebnis = await anstossen().catch(() => null);
      // Entschieden wird am Ende selbst, nicht an der Kennung der Einheit -
      // die wechselt, wenn der Server sie anderswo beendet fand („closed“).
      // In diesem Lauf abgewiesen: keine Endseite, die sie „auf diesem Gerät“
      // nennt, sondern der Grund (ADR-024 Punkt 8).
      const abweisung = ergebnis?.abgewiesen.find((a) => a.ereignisse.includes(ende));
      if (abweisung) throw new EndeAbgewiesen(abweisung.einheitId, abweisung.satz);
      const wartet = (await wartendeEinheiten(besitzer)).some((e) =>
        e.ereignisse.some((x) => x.id === ende),
      );
      return { ziel: wartet ? 'gespeichert=geraet' : 'gespeichert=1', tag: kopf.tag };
    },
    onSuccess: ({ ziel, tag }) => onBeendet(ziel, tag),
  });
}

/** Handoff 5.4: „Einheit beenden“ mit den freiwilligen Angaben; der Knopf steht im Fuß. */
function Abschluss({
  plan,
  tag,
  abgehakt,
  werSieht,
  formId,
  titelRef,
  notiz,
  onNotiz,
  werte,
  onWert,
  onAbsenden,
}: {
  plan: Ablageplan;
  tag: string;
  /** Ohne einen Haken gibt es nichts zu beenden - „geübt" hieße sonst nichts. */
  abgehakt: number;
  werSieht: string;
  formId: string;
  /** Um den Titel: Beim Wechsel hierher geht der Fokus auf ihn. */
  titelRef: RefObject<HTMLDivElement | null>;
  notiz: string;
  onNotiz: (notiz: string) => void;
  werte: Record<string, number | null>;
  onWert: (key: string, wert: number | null) => void;
  onAbsenden: () => void;
}) {
  const fragenId = useId();
  // TRK-001: Angaben zur Einheit - im Training nur mit Einwilligung
  // (ADR-021 Punkt 4), dieselbe Bedingung wie der Satz darunter.
  const fragen = plan.note_allowed && abgehakt > 0;
  return (
    // Der Seitenkopf bringt seinen Abstand mit; darunter 24 wie im Rahmen.
    <div>
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
      <div className="flex flex-col gap-6">
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
            onAbsenden();
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
              {groessenImTakt('session').map((g) => (
                <Angabefeld
                  key={g.key}
                  groesse={g}
                  wert={werte[g.key] ?? null}
                  onChange={(w) => onWert(g.key, w)}
                />
              ))}
              <TextArea
                label="Das war schwierig, weil … (freiwillig)"
                hint={
                  <>
                    {werSieht} sieht diesen Satz. Er wird nicht laufend gelesen – bei akuten
                    Beschwerden: <Notrufnummer nummer="112" /> oder <Notrufnummer nummer="116117" />
                    .
                  </>
                }
                maxLength={500}
                rows={3}
                value={notiz}
                onChange={(e) => onNotiz(e.target.value)}
              />
            </section>
          ) : null}
        </form>
      </div>
    </div>
  );
}

/**
 * Die Seite der Durchführung (Handoff, Abschnitt 4): Kopf und Fuß stehen fest,
 * dazwischen rollt der Inhalt in `max-w-spalte` - mit dem Rand außen wie im
 * Fuß, damit Stand und Hauptknopf an den Kanten der Spalte stehen. Unter 23rem
 * rollen Kopf und Fuß mit, der Fuß steht am Ende des Inhalts.
 */
function Rahmen({
  kopf,
  fuss,
  children,
}: {
  kopf?: ReactNode;
  fuss: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      {kopf ? <div className="sticky top-0 z-20 max-[23rem]:static">{kopf}</div> : null}
      <div className="flex-1 px-5 pt-5 pb-8 max-[23rem]:px-3">
        <div className="max-w-spalte mx-auto flex w-full flex-col gap-6">{children}</div>
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

/** Der Kopf beim Laden: nur der Ausweg, an seinem Platz im Kopf der Durchführung. */
function Notkopf({
  spaeter,
}: {
  spaeter: { pfad: string } | { onSpaeter?: (() => void) | undefined };
}) {
  return (
    <div className="bg-surface border-line border-b">
      <div className="[[data-rechner]_&]:max-w-durchfuehrung mx-auto flex min-h-16 w-full items-center justify-end p-2">
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
    </div>
  );
}

/**
 * Fehler und „kann hier nicht üben“: Seitentitel, der Satz und als
 * Hauptknopf im Fuß der Weg zurück zu den Übungen - ohne Reiterleiste der
 * einzige (ANN-714).
 */
function Ausweg({ titel, pfad, children }: { titel: string; pfad: string; children: ReactNode }) {
  return (
    <Rahmen fuss={<Durchfuehrungsfuss aktion={{ text: 'Zu den Übungen', to: pfad }} />}>
      <div>
        <PageHeader title={titel} />
        {children}
      </div>
    </Rahmen>
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
      <div className="flex-1 px-5 pt-5 pb-8 max-[23rem]:px-3">
        <div className="max-w-spalte mx-auto flex w-full flex-col gap-6">
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
      </div>
      <div className="bg-surface border-line border-t px-5 pt-3 pb-4 max-[23rem]:px-3">
        <div className="max-w-spalte mx-auto flex w-full justify-end">
          <Skelett form="knopf" className="[[data-rechner]_&]:w-hauptknopf w-full" />
        </div>
      </div>
    </SkelettBereich>
  );
}

/**
 * Die Endseite in der Plattform (Handoff 5.5, ANN-706): wer die Einheit
 * sieht (ANN-712) und der nächste Übungstag aus dem Plan, wenn der Server
 * ihn geliefert hat. Ohne Netz steht die Verbindungszeile darüber.
 */
function EndeDerEinheit({
  plan,
  ende,
  wer,
  zurueck,
}: {
  plan: EigenerPlan | undefined;
  ende: 'uebertragen' | 'geraet';
  wer: string | null;
  zurueck: string;
}) {
  const [suche] = useSearchParams();
  const rechner = useRechner();
  const bereich = bereichParameter(suche);
  const tag = tagAusLink(suche.get('tag')) ?? geraetetag();
  return (
    <div className="flex flex-1 flex-col">
      {ende === 'geraet' ? <Verbindungszeile rechner={rechner} /> : null}
      <Endseite
        fassung={ende}
        tag={tag}
        wer={wer}
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
