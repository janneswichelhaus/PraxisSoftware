import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EINGABETEXTE, useTextverlustschutz } from '@/app/Textverlustschutz';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { GefuehrterAblauf } from '@/components/ui/GefuehrterAblauf';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import {
  aendern,
  imAendern,
  kannZurueck,
  weiter,
  zurueck,
  type Abfolge,
} from '@/components/ui/abfolge';
import {
  antwortFehler,
  type Antwort,
  type Antworten,
} from '@/features/clinical/assessments/antworten';
import type { ScoreDefinition } from '@/features/clinical/assessments/schema';
import {
  befundbogenSchluessel,
  befundbogenAbsenden,
  befundbogenSpeichern,
  befundbogenVerwerfen,
  ladeBefundbogen,
  type Bogenstand,
  type Plattformzugang,
} from './api';
import { Bogenthema } from './Bogenthema';
import {
  beginn,
  bogenthemen,
  offeneFragen,
  offenText,
  seitentitel,
  type Bogenthema as Thema,
} from './bogenthemen';
import { BOGEN_TITEL, bogenVorlage, fuerDiePlattform } from './instrumentwahl';
import { NICHT_AKUT } from './nachrichtentexte';
import { Notfallsatz } from './Notfallsatz';
import { PLATTFORM_PFAD } from './pfade';
import { Verbindungszeile } from './Verbindungszeile';
import { Vertretungsband } from './Vertretungsband';
import { fest, tagUndMonat } from './zeit';

/**
 * Der Fragebogen vor dem ersten Termin, von der Person selbst: dieselben Fragen wie in der Praxis,
 * geprüft mit denselben Regeln; der Server prüft noch einmal. Senden heißt abgeschlossen (ANN-248),
 * ein Entwurf liegt nur auf dem Server, nie im Browser (ADR-001).
 */
export function Befundbogen({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const zurueckZu = `${PLATTFORM_PFAD}${bereich ? `?${bereich}` : ''}`;
  const stand = useQuery({
    queryKey: befundbogenSchluessel(zugang.access_id),
    queryFn: () => ladeBefundbogen(zugang.access_id),
  });
  const instrument = fuerDiePlattform()[0];
  const behandlung = instrument !== undefined && zugang.relationship_kind === 'treatment';
  const begleitung = zugang.access_kind === 'companion';
  const boegen = (stand.data ?? []).filter((b) => b.instrument_id === instrument?.meta.id);
  const abgeschlossen = boegen.find((b) => b.status === 'abgeschlossen');

  if (stand.data !== undefined && behandlung && !begleitung && !abgeschlossen) {
    return (
      <Ablauf
        zugang={zugang}
        definition={instrument}
        entwurf={boegen.find((b) => b.status === 'entwurf' && b.source === 'platform')}
        zurueck={zurueckZu}
      />
    );
  }

  return (
    <>
      <Rueckweg standard={zurueckZu} beschriftung="Übersicht" />
      <PageHeader title={BOGEN_TITEL} />
      {stand.isPending ? (
        <Ladezustand />
      ) : stand.data === undefined ? (
        <ErrorState
          title="Ihr Fragebogen konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => stand.refetch()}
        />
      ) : !behandlung ? (
        <EmptyState
          markenform
          title="Zurzeit kein Fragebogen"
          description="Hier gibt es zurzeit nichts auszufüllen."
        />
      ) : begleitung ? (
        // ANN-248: Angaben zur eigenen Gesundheit macht die Person selbst; der Server weist eine
        // Begleitung ab, hier steht der Grund.
        <EmptyState
          markenform
          title={`Fragebogen für ${zugang.represented_name ?? 'die Person'}`}
          description={`Den Fragebogen füllt ${zugang.represented_name ?? 'die Person'} selbst aus. Als Begleitung lesen Sie mit, machen aber keine Angaben zur Gesundheit.`}
        />
      ) : (
        <EmptyState
          markenform
          title="Ihr Fragebogen liegt der Praxis vor"
          description={`${
            abgeschlossen?.completed_at
              ? `Seit ${fest(tagUndMonat(abgeschlossen.completed_at))}. `
              : ''
          }Hat sich etwas geändert, besprechen Sie es bitte beim Termin.`}
        />
      )}
    </>
  );
}

/** Die Form des ersten Themas, solange der Stand lädt: Sätze, Titel und zwei Felder. */
function Ladezustand() {
  return (
    <SkelettBereich beschriftung="Ihr Fragebogen wird geladen" className="flex flex-col gap-3">
      <Skelett form="zeile" className="w-[90%]" />
      <Skelett form="zeile" className="w-[70%]" />
      <Skelett form="titel" className="mt-5 w-1/2" />
      <Skelett form="zeile" className="mt-5 w-1/4" />
      <Skelett form="hauptknopf" />
      <Skelett form="zeile" className="mt-5 w-1/3" />
      <Skelett form="hauptknopf" />
    </SkelettBereich>
  );
}

/** Ein Wert, der nicht von der Reihenfolge der Schlüssel abhängt: verglichen wird der Inhalt. */
function inhalt(wert: unknown): string {
  return JSON.stringify(wert, (_, teil: unknown) =>
    teil && typeof teil === 'object' && !Array.isArray(teil)
      ? Object.fromEntries(Object.entries(teil).sort(([a], [b]) => a.localeCompare(b)))
      : teil,
  );
}

const SPEICHERFEHLER =
  'Ihre Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.';

/**
 * Speichern beim Weitergehen: Jeder Wechsel sichert im Hintergrund alle Antworten, wenn sich seit
 * dem letzten Mal etwas geändert hat. Die Vorgänge laufen nacheinander - sonst legten zwei
 * gleichzeitige ohne Kennung zwei Entwürfe an.
 */
function useBogenspeicher({
  zugangId,
  definition,
  entwurf,
  antworten,
  verbunden,
}: {
  zugangId: string;
  definition: ScoreDefinition;
  entwurf: Bogenstand | undefined;
  antworten: Antworten;
  verbunden: boolean;
}) {
  const [entwurfId, setEntwurfId] = useState<string | null>(entwurf?.id ?? null);
  const [gespeichert, setGespeichert] = useState(() => inhalt(entwurf?.answers ?? {}));
  const [fehler, setFehler] = useState<string | null>(null);
  const kennung = useRef(entwurfId);
  const zuletzt = useRef(gespeichert);
  const aktuell = useRef(antworten);
  aktuell.current = antworten;
  const kette = useRef<Promise<unknown>>(Promise.resolve());

  /** Sichert, was sich geändert hat; `true`, wenn danach alle Antworten auf dem Server liegen. */
  const speichern = useCallback(
    (mitEntwurf = false): Promise<boolean> => {
      const lauf = kette.current
        .catch(() => undefined)
        .then(async () => {
          const jetzt = aktuell.current;
          const text = inhalt(jetzt);
          if (text === zuletzt.current && (kennung.current !== null || !mitEntwurf)) return true;
          const id = await befundbogenSpeichern({
            zugangId,
            entwurfId: kennung.current,
            instrumentId: definition.meta.id,
            version: definition.meta.version,
            antworten: jetzt,
          });
          kennung.current = id;
          zuletzt.current = text;
          setEntwurfId(id);
          setGespeichert(text);
          return inhalt(aktuell.current) === text;
        });
      kette.current = lauf;
      return lauf;
    },
    [zugangId, definition],
  );

  const ungespeichert = inhalt(antworten) !== gespeichert;
  const ungespeichertRef = useRef(ungespeichert);
  ungespeichertRef.current = ungespeichert;

  /** Im Hintergrund, beim Wechsel der Seite; ohne Netz wartet es, bis die Verbindung zurück ist. */
  const imHintergrund = useCallback(() => {
    if (!navigator.onLine || !ungespeichertRef.current) return;
    speichern().then(
      () => setFehler(null),
      (grund: unknown) => setFehler(grund instanceof Error ? grund.message : SPEICHERFEHLER),
    );
  }, [speichern]);

  useEffect(() => {
    if (verbunden) imHintergrund();
  }, [verbunden, imHintergrund]);

  return {
    entwurfId,
    ungespeichert,
    fehler,
    speichern,
    imHintergrund,
    /** Vor dem Senden: alles sichern, notfalls einen Entwurf anlegen; die Kennung zurück. */
    sichern: async () => {
      await speichern(true);
      return kennung.current!;
    },
    abwarten: () => kette.current.catch(() => undefined),
  };
}

/**
 * Der Bogen als geführter Ablauf: ein Thema je Seite, dann „Ist alles richtig?“ mit den offenen
 * Themen und „Bogen senden“. Ein Entwurf öffnet nach dem letzten Thema mit Antwort; „Ändern“ führt
 * vom Abschluss in ein Thema und „Übernehmen“ zurück.
 */
function Ablauf({
  zugang,
  definition,
  entwurf,
  zurueck: zurueckZu,
}: {
  zugang: Plattformzugang;
  definition: ScoreDefinition;
  entwurf: Bogenstand | undefined;
  zurueck: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const verbunden = useIstVerbunden();
  const ohneNetzId = useId();
  const themen = useMemo(() => bogenthemen(definition), [definition]);
  const [antworten, setAntworten] = useState<Antworten>(
    () => (entwurf?.answers as Antworten | null) ?? {},
  );
  const [abfolge, setAbfolge] = useState<Abfolge<number>>(() => {
    const start = beginn(themen, antworten);
    return { seite: start, verlauf: Array.from({ length: start }, (_, i) => i), rueckkehr: null };
  });
  // Einmal, auf der ersten Seite nach dem Öffnen: dass der Entwurf da ist.
  const [ersterBlick, setErsterBlick] = useState(() => beginn(themen, antworten) > 0);
  const [fehlerJeFrage, setFehlerJeFrage] = useState<Record<string, string>>({});
  const speicher = useBogenspeicher({
    zugangId: zugang.access_id,
    definition,
    entwurf,
    antworten,
    verbunden,
  });
  const { seite } = abfolge;
  const abschluss = seite >= themen.length;
  const thema = themen[seite];
  const vorlage = bogenVorlage(definition);

  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: speicher.ungespeichert,
    speichern: speicher.speichern,
    texte: EINGABETEXTE,
    schrittZurueck: kannZurueck(abfolge) ? () => zurueckGehen() : undefined,
    ohneVerbindungZeigen: false,
  });

  // Wohin es auch geht: Die Übersicht liest danach den neuen Stand.
  useEffect(
    () => () => {
      void queryClient.invalidateQueries({ queryKey: befundbogenSchluessel(zugang.access_id) });
    },
    [queryClient, zugang.access_id],
  );

  const setzen = useCallback((itemId: string, antwort: Antwort | undefined) => {
    setAntworten((bisher) => {
      const neu = { ...bisher };
      if (antwort === undefined) delete neu[itemId];
      else neu[itemId] = antwort;
      return neu;
    });
    setFehlerJeFrage((bisher) => {
      if (!(itemId in bisher)) return bisher;
      const neu = { ...bisher };
      delete neu[itemId];
      return neu;
    });
  }, []);

  function gehe(neu: Abfolge<number>) {
    setErsterBlick(false);
    speicher.imHintergrund();
    senden.reset();
    setAbfolge(neu);
  }

  function zurueckGehen() {
    const vorher = zurueck(abfolge);
    if (vorher) gehe(vorher);
  }

  const spaeterLaeuft = useRef(false);
  async function spaeter() {
    if (spaeterLaeuft.current) return;
    spaeterLaeuft.current = true;
    try {
      // Erst gespeichert, dann hinaus; scheitert es oder fehlt das Netz, fragt der Schutz.
      if (verbunden && (await speicher.speichern())) freigeben();
    } catch {
      // Die Antworten stehen weiter da; die Rückfrage bietet Speichern, Verwerfen und Bleiben.
    } finally {
      spaeterLaeuft.current = false;
    }
    void navigate(zurueckZu);
  }

  const senden = useMutation({
    mutationFn: async () => {
      const id = await speicher.sichern();
      await befundbogenAbsenden(zugang.access_id, id);
    },
    onSuccess: () => {
      freigeben();
      void navigate(`${zurueckZu}${zurueckZu.includes('?') ? '&' : '?'}bogen=1`, {
        replace: true,
      });
    },
  });

  const verwerfen = useMutation({
    mutationFn: async () => {
      await speicher.abwarten();
      await befundbogenVerwerfen(zugang.access_id, speicher.entwurfId!);
    },
    onSuccess: () => {
      freigeben();
      void navigate(zurueckZu);
    },
  });

  function absenden() {
    if (!verbunden || senden.isPending) return;
    // Dieselben Regeln wie in der Praxis: Passt eine Antwort nicht, öffnet ihr Thema.
    const fehler = Object.fromEntries(
      antwortFehler(definition, antworten).map((f) => [f.itemId, f.meldung]),
    );
    const ziel = themen.findIndex((t) => t.fragen.some((f) => fehler[f.item.id] !== undefined));
    if (ziel >= 0) {
      setFehlerJeFrage(fehler);
      gehe(aendern(abfolge, ziel));
      return;
    }
    senden.mutate();
  }

  const offen = themen
    .map((t, index) => ({ thema: t, index, anzahl: offeneFragen(t, antworten) }))
    .filter((eintrag) => eintrag.anzahl > 0);

  return (
    <GefuehrterAblauf
      titel={abschluss || !thema ? 'Ist alles richtig?' : seitentitel(thema)}
      objekt={BOGEN_TITEL}
      schliessen="Später"
      onSchliessen={() => void spaeter()}
      seite={String(seite)}
      stand={
        abschluss
          ? { text: 'Abschluss', wert: 1, von: 1 }
          : { text: `Thema ${seite + 1} von ${themen.length}`, wert: seite + 1, von: themen.length }
      }
      onZurueck={kannZurueck(abfolge) ? zurueckGehen : undefined}
      schutz={schutz}
      spaeter
      balkenJeSchritt
      plattform
      fussLinie
      breit
      unterDemKopf={<Verbindungszeile />}
      band={
        zugang.access_kind === 'self' ? undefined : (
          <Vertretungsband
            zugang={zugang}
            innen="max-w-formular [.plattform-schrift[data-rechner]_&]:max-w-spalte mx-auto box-content px-5 max-[23rem]:px-3"
          />
        )
      }
      vorDemTitel={
        ersterBlick || seite === 0 ? (
          <div className="flex flex-col gap-5 pb-2">
            {ersterBlick ? (
              <Statusmeldung>Ihre bisherigen Antworten sind gespeichert.</Statusmeldung>
            ) : null}
            {seite === 0 ? (
              <>
                <p className="text-ink-muted">
                  Bitte beantworten Sie die Fragen so, wie es Ihnen heute geht. Jede Frage darf
                  offen bleiben. Ihre Therapeut:in geht den Bogen mit Ihnen beim ersten Termin
                  durch.
                </p>
                <p className="text-ink-muted">
                  Ihre Antworten werden beim Weitergehen gespeichert.
                </p>
              </>
            ) : null}
          </div>
        ) : undefined
      }
      fuss={
        abschluss || !thema ? (
          <div className="flex flex-col gap-3">
            {senden.isError || speicher.fehler ? (
              <Statusmeldung ton="fehler">
                {senden.isError ? senden.error.message : speicher.fehler}
              </Statusmeldung>
            ) : null}
            {verbunden ? null : (
              <p id={ohneNetzId} className="text-ink-muted">
                Senden geht wieder mit Verbindung. Ihre Antworten bleiben stehen.
              </p>
            )}
            <p className="text-ink-muted">
              <strong className="text-ink">{NICHT_AKUT}</strong> <Notfallsatz />
            </p>
            <Button
              className={`${HAUPTKNOPF} ${GESPERRT}`}
              aria-disabled={verbunden ? undefined : true}
              aria-describedby={verbunden ? undefined : ohneNetzId}
              disabled={senden.isPending}
              onClick={absenden}
            >
              {senden.isPending
                ? 'Wird gesendet …'
                : senden.isError
                  ? 'Erneut senden'
                  : 'Bogen senden'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {speicher.fehler ? <Statusmeldung ton="fehler">{speicher.fehler}</Statusmeldung> : null}
            <Button className={HAUPTKNOPF} onClick={() => gehe(weiter(abfolge, seite + 1, true))}>
              {imAendern(abfolge) ? 'Übernehmen' : 'Weiter'}
            </Button>
          </div>
        )
      }
    >
      {abschluss || !thema ? (
        <Abschluss
          themen={themen}
          offen={offen}
          onAendern={(index) => gehe(aendern(abfolge, index))}
          verwerfen={
            speicher.entwurfId ? (
              <Rueckfrage
                ausloeser="Antworten verwerfen"
                ausloeserVariante="quiet"
                bestaetigen="Ja, verwerfen"
                bestaetigenLaeuft="Wird verworfen …"
                fehler={verwerfen.error?.message}
                onBestaetigen={() => verwerfen.mutateAsync()}
              >
                <p>Ihre gespeicherten Antworten werden gelöscht.</p>
              </Rueckfrage>
            ) : null
          }
          vorlage={vorlage}
        />
      ) : (
        <>
          <Bogenthema
            definition={definition}
            thema={thema}
            antworten={antworten}
            onAntwort={setzen}
            fehler={fehlerJeFrage}
          />
          {seite === 0 && vorlage ? (
            <Kleingedrucktes className="mt-auto pt-4">{vorlage}</Kleingedrucktes>
          ) : null}
        </>
      )}
    </GefuehrterAblauf>
  );
}

/** Am Telefon in voller Breite, am Rechner rechts und so breit wie sein Wort, mindestens 10rem. */
const HAUPTKNOPF =
  '[.plattform-schrift[data-rechner]_&]:min-w-40 [.plattform-schrift[data-rechner]_&]:self-end';

/** Ohne Netz gestrichelt und leise wie ein gesperrter Knopf, aber erreichbar mit seinem Satz. */
const GESPERRT =
  'aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-line-strong aria-disabled:bg-transparent aria-disabled:text-ink-muted aria-disabled:hover:bg-transparent';

/** Unter 23rem hat der Ablauf 12 Rand: Die Zeile reicht nur so weit hinaus; lange Titel trennen. */
const ZEILEN =
  'max-[23rem]:[&_.listenzeile]:-mx-3 max-[23rem]:[&_.listenzeile]:w-[calc(100%+1.5rem)] max-[23rem]:[&_.listenzeile]:px-3 max-[23rem]:[&_.listenzeile]:hyphens-auto max-[23rem]:[&_.listenzeile]:[hyphenate-limit-chars:10_4_4]';

/** „Ändern“ rechts in der Zeile; Vorlesesoftware hört es nach einem Komma, nicht angehängt. */
function Aendern() {
  return (
    <span className="text-accent font-bold">
      <span className="sr-only">, </span>Ändern
    </span>
  );
}

function Abschluss({
  themen,
  offen,
  onAendern,
  verwerfen,
  vorlage,
}: {
  themen: readonly Thema[];
  offen: readonly { thema: Thema; index: number; anzahl: number }[];
  onAendern: (index: number) => void;
  verwerfen: ReactNode;
  vorlage: string | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-muted -mt-2">
        Jede Frage darf offen bleiben. Offene Fragen bespricht Ihre Therapeut:in beim ersten Termin
        mit Ihnen.
      </p>
      {offen.length > 0 ? (
        <div className={ZEILEN}>
          <Zwischentitel ebene={3}>Noch offen</Zwischentitel>
          <ListRows rahmen={false} beschriftung="Noch offen" className="border-line border-y">
            {offen.map(({ thema, index, anzahl }) => (
              <ListRow
                key={index}
                titel={thema.titel}
                meta={
                  <>
                    <span className="sr-only">, </span>
                    {offenText(anzahl)}
                  </>
                }
                status={<Aendern />}
                onClick={() => onAendern(index)}
              />
            ))}
          </ListRows>
        </div>
      ) : null}
      <div className={`border-line border-b pb-2 [&>details]:mt-0 ${ZEILEN}`}>
        <Disclosure summary="Alle Themen">
          <ListRows rahmen={false} beschriftung="Alle Themen" className="border-line border-t">
            {themen.map((thema, index) => (
              <ListRow
                key={index}
                titel={thema.titel}
                status={<Aendern />}
                onClick={() => onAendern(index)}
              />
            ))}
          </ListRows>
        </Disclosure>
      </div>
      <p className="text-ink-muted">
        Mit „Bogen senden“ geht der Bogen an die Praxis und lässt sich hier nicht mehr ändern.
      </p>
      {/* Der leise Knopf rückt an die Kante wie „← Zurück“; die offene Rückfrage nicht. */}
      {verwerfen ? <div className="[&>button]:-ml-3">{verwerfen}</div> : null}
      {vorlage ? <Kleingedrucktes>{vorlage}</Kleingedrucktes> : null}
    </div>
  );
}
