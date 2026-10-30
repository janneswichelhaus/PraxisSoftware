import { useContext, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Buehne } from '@/components/ui/Buehne';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { HakenSymbol } from '@/components/ui/HakenSymbol';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { Linkliste } from '@/components/ui/Linkliste';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TascheSymbol } from '@/components/ui/TascheSymbol';
import { Uebungsliste, Uebungszeile } from '@/components/ui/Uebungszeile';
import { Wochenleiste } from '@/components/ui/Wochenleiste';
import { useFenstertitelId } from '@/components/ui/fenstertitel';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { ZurueckSymbol } from '@/components/ui/ZurueckSymbol';
import { Planblatt } from '@/features/exercise/exercise-plans/Planblatt';
import { haeufigkeit } from '@/features/exercise/exercise-plans/dosierung';
import {
  plaeneSchluessel,
  termineSchluessel,
  ladePlaene,
  ladeTermine,
  uebungstageSetzen,
  type EigenerPlan,
  type Plattformzugang,
} from './api';
import { useRechner } from './geruestbreite';
import {
  DurchfuehrungKontext,
  abgelegteZugaenge,
  abweisungGelesen,
  geraetetag,
  useWarteschlange,
  type Ablageplan,
  type WartendeEinheit,
} from './ablage';
import { Anleitung } from './Anleitung';
import { Dosierungsmarken } from './Dosierungsmarken';
import { heutigeEinheit, uebungErledigt } from './haken';
import { inLesefrist, naechsterTermin } from './hauptsache';
import { hauptzahl } from './hauptzahl';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import {
  WOCHENTAGE,
  isoWochentag,
  naechsterUebungstag,
  tageText,
  wochenleisteSatz,
} from './uebungstage';
import { lageDesPlans, planDerVorschau, umfangText, wasManBraucht, weiterBei } from './vorschau';
import { datum, letzterTag, tagUndMonat } from './zeit';

type Position = Ablageplan['items'][number];

/**
 * Reiter „Übungen" bzw. „Training" (UEB-009, DSN-001 4.1 und 5; Handoff
 * 2026-10-24, Abschnitt 5.1): „Was mache ich heute?"
 *
 * Heute zuerst: Oben steht die Vorschau der Einheit als die eine Hero-Karte
 * der Seite - Lage, Umfang mit geschätzter Dauer (ANN-704), was man braucht
 * und der eine Knopf. Darunter je Plan Laufzeit, Übungstage, die Übungen als
 * Zeilen und „Zum Plan“. Am Rechner stehen Plan links und Vorschau rechts;
 * im Baum steht die Vorschau zuerst, damit sie am Telefon und für
 * Vorlesesoftware oben ist (ANN-724).
 *
 * Der Heimübungsplan gehört zur Behandlung und kostet nichts extra (§4.6);
 * im Training gehört der Plan zum Paket (§4.10). Gezeigt wird, was der Server
 * über den Zugang liefert: die zugewiesenen Pläne, sonst der zuletzt beendete
 * nur zum Lesen und Mitnehmen (ANN-304). Keine Punktzahl, keine Serie, kein
 * Lob aus der Software (DSN-001 4.1).
 */
export function Uebungen({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const verbunden = useIstVerbunden();
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });
  // ANN-726 (N1): Wer die Einheit sieht, ist die Person des nächsten Termins
  // - ohne Termin oder ohne Antwort „Ihre Therapeut:in“. Dieselbe Abfrage wie
  // auf der Übersicht; ihr Fehler hält die Seite nicht auf.
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const training = zugang.relationship_kind === 'training';
  const bereich = bereichParameter(suche);
  const name = naechsterTermin(termine.data ?? [])?.staff_name ?? null;

  return (
    <>
      <PageHeader title={training ? 'Training' : 'Übungen'} />
      <Wartehinweis zugangId={zugang.access_id} />
      {plaene.data !== undefined ? (
        plaene.data.plans.length === 0 ? (
          <div className="[[data-rechner]_&]:max-w-spalte">
            <EmptyState
              markenform
              title="Noch kein Plan"
              description={
                training
                  ? 'Ihre Trainingsbetreuung stellt Ihnen hier Ihren Plan zusammen.'
                  : `${name ?? 'Ihre Therapeut:in'} stellt Ihnen hier Übungen zusammen.`
              }
            />
          </div>
        ) : (
          <AmGeraet>
            {(wartend) => (
              <Reiter
                zugang={zugang}
                plaene={plaene.data.plans}
                heute={plaene.data.today}
                bereich={bereich}
                name={name}
                verbunden={verbunden}
                wartend={wartend}
              />
            )}
          </AmGeraet>
        )
      ) : plaene.isError || plaene.fetchStatus === 'paused' ? (
        // BEF-197: ohne Antwort der Plan vom Gerät - ohne Netz sagt es die
        // Verbindungszeile, bei Verbindung eine eigene Meldung.
        <AmGeraet>
          {(wartend) => (
            <PlanVomGeraet
              zugang={zugang}
              bereich={bereich}
              verbunden={verbunden}
              wartend={wartend}
              onErneut={() => plaene.refetch()}
            />
          )}
        </AmGeraet>
      ) : (
        <Ladezustand />
      )}
    </>
  );
}

/**
 * TRK-008 (ADR-024 Punkt 8): Was noch auf dem Gerät wartet und was der Server
 * abgewiesen hat - bis nichts mehr wartet. Ohne Ablage (Tests des Gerüsts)
 * steht hier nichts. Über der Vorschau, wie der Handoff es will (5.1).
 */
function Wartehinweis({ zugangId }: { zugangId: string }) {
  const traeger = useContext(DurchfuehrungKontext);
  if (!traeger) return null;
  return <Wartestand besitzer={traeger.besitzer} zugangId={zugangId} />;
}

function Wartestand({ besitzer, zugangId }: { besitzer: string; zugangId: string }) {
  const stand = useWarteschlange(besitzer);
  const wartend = stand.einheiten.filter((e) => e.zugangId === zugangId).length;
  return (
    <>
      {wartend > 0 ? (
        <Statusmeldung ton="neutral" className="mb-4">
          {wartend === 1
            ? 'Eine Einheit liegt noch auf diesem Gerät und ist noch nicht übertragen.'
            : `${wartend} Einheiten liegen noch auf diesem Gerät und sind noch nicht übertragen.`}
        </Statusmeldung>
      ) : null}
      {stand.abgewiesen.map((a) => (
        <div key={a.einheitId} className="mb-4 flex flex-wrap items-center gap-x-3">
          <Statusmeldung ton="fehler">{`Eine Einheit wurde nicht übertragen: ${a.satz}`}</Statusmeldung>
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
    </>
  );
}

/**
 * Die Einheiten, die noch auf dem Gerät warten (BEF-218): Vorschau,
 * Übungszeilen und Plan vom Gerät rechnen mit ihnen wie der Start der
 * Durchführung - `heutigeEinheit` wählt selbst nach Zugang, Plan und Tag.
 * Bis die Ablage gelesen ist, steht das Skelett: Sonst sagte die Vorschau
 * einen Augenblick „Gespeichert“ für eine Einheit, die nur auf dem Gerät
 * liegt. Ohne Ablage (Tests des Gerüsts) keine.
 */
function AmGeraet({ children }: { children: (wartend: readonly WartendeEinheit[]) => ReactNode }) {
  const traeger = useContext(DurchfuehrungKontext);
  if (!traeger) return children([]);
  return <AmGeraetGelesen besitzer={traeger.besitzer}>{children}</AmGeraetGelesen>;
}

function AmGeraetGelesen({
  besitzer,
  children,
}: {
  besitzer: string;
  children: (wartend: readonly WartendeEinheit[]) => ReactNode;
}) {
  const stand = useWarteschlange(besitzer);
  if (stand.gelesenBis < 0) return <Ladezustand />;
  return children(stand.einheiten);
}

/**
 * Vorschau und Pläne nebeneinander (Handoff 2026-10-24, Abschnitt 4; ANN-724):
 * am Rechner der Plan links, die Vorschau rechts, 340 bis 460 breit - so breit
 * sie werden kann, ohne dass der Plan unter 1024 px zu schmal wird. Im Baum
 * steht die Vorschau zuerst; das Raster stellt sie nach rechts. Am Telefon
 * untereinander, die Vorschau oben; zwischen 640 und 1023 in `max-w-formular`.
 */
function Spalten({ vorschau, children }: { vorschau: ReactNode; children: ReactNode }) {
  return (
    <div className="max-w-formular flex flex-col gap-10 [[data-rechner]_&]:grid [[data-rechner]_&]:max-w-none [[data-rechner]_&]:grid-cols-[minmax(0,1fr)_minmax(var(--container-vorschau-min),var(--container-vorschau))] [[data-rechner]_&]:items-start [[data-rechner]_&]:gap-12">
      <div className="min-w-0 [[data-rechner]_&]:col-start-2 [[data-rechner]_&]:row-start-1">
        {vorschau}
      </div>
      <div className="min-w-0 [[data-rechner]_&]:col-start-1 [[data-rechner]_&]:row-start-1">
        {children}
      </div>
    </div>
  );
}

/** Der Reiter mit Antwort des Servers: Vorschau, dann je Plan ein Abschnitt. */
function Reiter({
  zugang,
  plaene,
  heute,
  bereich,
  name,
  verbunden,
  wartend,
}: {
  zugang: Plattformzugang;
  plaene: EigenerPlan[];
  heute: string;
  bereich: string;
  name: string | null;
  verbunden: boolean;
  wartend: readonly WartendeEinheit[];
}) {
  const erster = planDerVorschau(plaene, heute);
  const reihe = [erster, ...plaene.filter((p) => p !== erster)];
  const lesefrist = inLesefrist(zugang);
  return (
    <>
      {lesefrist && zugang.read_until ? (
        // Wortlaut der Übersicht (Briefing 1); der Satz am Plan entfällt.
        <Statusmeldung ton="warnung" className="mb-6">
          {`Ihre ${zugang.relationship_kind === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können hier noch bis ${datum(letzterTag(zugang.read_until))} lesen.`}
        </Statusmeldung>
      ) : null}
      <Spalten
        vorschau={
          <Vorschau
            zugang={zugang}
            plan={erster}
            heute={heute}
            bereich={bereich}
            name={name}
            verbunden={verbunden}
            mehrere={plaene.length > 1}
            wartend={wartend}
          />
        }
      >
        {reihe.map((plan, i) => (
          <div key={plan.id} className={i === 0 ? undefined : 'border-line mt-10 border-t pt-10'}>
            <PlanAbschnitt
              zugang={zugang}
              plan={plan}
              heute={heute}
              bereich={bereich}
              verbunden={verbunden}
              mitKnopf={i > 0}
              wartend={wartend}
            />
          </div>
        ))}
      </Spalten>
    </>
  );
}

function einheitPfad(planId: string, bereich: string): string {
  return `${PLATTFORM_PFAD}/uebungen/einheit/${planId}${bereich ? `?${bereich}` : ''}`;
}

function blattPfad(planId: string, bereich: string): string {
  return `${PLATTFORM_PFAD}/uebungen/blatt/${planId}${bereich ? `?${bereich}` : ''}`;
}

/** „1. Oktober“ - Tag und Monat brechen nicht auseinander. */
function tagImSatz(tag: string): string {
  return tagUndMonat(tag).replace(' ', '\u00a0');
}

/**
 * Ein Name im Fließtext: Ein Plan- oder Übungsname trennt nur unter 23rem an
 * der Silbe (ANN-707), ein Personenname nie (DR-114) - der Satz drumherum
 * trennt als Fließtext wie überall.
 */
function Name({ children, person = false }: { children: string; person?: boolean }) {
  return (
    <span className={person ? 'hyphens-manual' : 'min-[23rem]:hyphens-manual'}>{children}</span>
  );
}

/** „Montag“ - der Tag einer nahen Woche, ohne Datum. */
function wochentagName(tag: string): string {
  return WOCHENTAGE.find((w) => w.nummer === isoWochentag(tag))?.lang ?? '';
}

/**
 * Die Vorschau der Einheit (Handoff 2026-10-24, Abschnitt 3): Etikett und
 * Titel nach der Lage des Plans (`lageDesPlans`), darunter die Angaben und
 * der eine Knopf - „Übungen beginnen“, „Weiter üben“, nach dem Üben leise
 * „Noch einmal üben“, in der Lesefrist „Plan als PDF sichern“.
 */
function Vorschau({
  zugang,
  plan,
  heute,
  bereich,
  name,
  verbunden,
  mehrere,
  wartend,
}: {
  zugang: Plattformzugang;
  plan: EigenerPlan;
  heute: string;
  bereich: string;
  name: string | null;
  verbunden: boolean;
  mehrere: boolean;
  wartend: readonly WartendeEinheit[];
}) {
  const training = zugang.relationship_kind === 'training';
  const einheit = heutigeEinheit(plan, zugang.access_id, wartend, geraetetag());
  const lage = lageDesPlans(plan, heute, einheit);
  const ueben = plan.can_exercise && plan.items.length > 0;

  if (lage === 'lesefrist') {
    return (
      <HeroKarte
        schmalOhneRad
        etikett="Plan beendet"
        titel="Ihr Plan zum Mitnehmen"
        satz={
          <>
            <Name>{plan.title}</Name>
            {plan.ended_on ? `, beendet am ${tagImSatz(plan.ended_on)}` : ''}. Als PDF bleibt er bei
            Ihnen.
          </>
        }
        aktion={{ text: 'Plan als PDF sichern', to: blattPfad(plan.id, bereich) }}
      />
    );
  }

  const naechster = naechsterUebungstag(plan, heute);
  const fuerHeute = lage === 'heute' || lage === 'begonnen' || lage === 'geuebt';
  const titel = training
    ? 'Ihr Plan für zu Hause'
    : fuerHeute
      ? 'Ihre Übungen für heute'
      : 'Ihre Übungen';
  const etikett =
    lage === 'heute' ? (
      'Heute ist Übungstag'
    ) : lage === 'begonnen' ? (
      'Heute begonnen'
    ) : lage === 'geuebt' ? (
      <span className="inline-flex items-center gap-1.5">
        <HakenSymbol className="size-5" />
        Heute geübt
      </span>
    ) : lage === 'ab' && plan.runs_from ? (
      `Ab ${tagImSatz(plan.runs_from)}`
    ) : lage === 'anderer-tag' && naechster ? (
      `Nächster Übungstag: ${wochentagName(naechster)}`
    ) : (
      'Ihr Plan'
    );

  if (lage === 'geuebt') {
    const wer = name ?? (training ? 'Ihre Trainingsbetreuung' : 'Ihre Therapeut:in');
    // Ohne Netz geht auch „Noch einmal üben“ mit dem Plan vom Gerät.
    const angaben = [
      naechster
        ? {
            schluessel: 'naechster',
            zeichen: ZEICHEN.kalender,
            text: `Nächster Übungstag: ${wochentagName(naechster)}`,
          }
        : null,
      !verbunden && ueben ? OHNE_NETZ : null,
    ].filter((a) => a !== null);
    return (
      <HeroKarte
        schmalOhneRad
        etikett={etikett}
        titel={titel}
        satz={
          // Liegt die Einheit nur auf dem Gerät, ist sie nicht bei der Praxis
          // (ADR-024 Punkt 8); das sagt der Hinweis darüber, die Karte
          // wiederholt es nicht (ANN-730).
          einheit.beendetAufGeraet ? undefined : (
            <>
              Gespeichert. <Name person>{wer}</Name> sieht Ihre Einheit beim nächsten Termin.
            </>
          )
        }
        angaben={angaben}
        leiseAktion={
          ueben ? { text: 'Noch einmal üben', to: einheitPfad(plan.id, bereich) } : undefined
        }
      />
    );
  }

  const offen = lage === 'begonnen' ? weiterBei(plan.items, einheit) : null;
  return (
    <HeroKarte
      schmalOhneRad
      etikett={etikett}
      titel={titel}
      angaben={angabenDerEinheit({
        items: plan.items,
        planname: mehrere ? plan.title : null,
        offen,
        ohneNetz: !verbunden && ueben,
      })}
      aktion={
        ueben
          ? {
              text: lage === 'begonnen' ? 'Weiter üben' : 'Übungen beginnen',
              to: einheitPfad(plan.id, bereich),
            }
          : undefined
      }
    />
  );
}

/**
 * Die Angaben einer Einheit: wo es weitergeht, Umfang mit Dauer, was man
 * braucht, ohne Netz „Geht auch ohne Netz.“ (Briefing 1).
 */
function angabenDerEinheit({
  items,
  planname,
  offen,
  ohneNetz,
}: {
  items: readonly Position[];
  planname: string | null;
  offen: Position | null;
  ohneNetz: boolean;
}) {
  const brauchen = wasManBraucht(items);
  const umfang = umfangText(items);
  return [
    offen
      ? {
          schluessel: 'weiter',
          zeichen: ZEICHEN.weiter,
          text: (
            <>
              Weiter bei Übung {offen.position}: <Name>{offen.variant_lay_name}</Name>
            </>
          ),
        }
      : null,
    {
      schluessel: 'umfang',
      zeichen: ZEICHEN.uhr,
      text: planname ? (
        <>
          <Name>{planname}</Name> · {umfang}
        </>
      ) : (
        umfang
      ),
    },
    brauchen.length > 0
      ? {
          schluessel: 'brauchen',
          zeichen: ZEICHEN.tasche,
          text: `Sie brauchen: ${brauchen.join(', ')}`,
        }
      : null,
    ohneNetz ? OHNE_NETZ : null,
  ].filter((a) => a !== null);
}

/**
 * Ein Plan (Abschnitt 5.1): der Name als Abschnittstitel, Laufzeit und Stand
 * in Worten, die Übungstage, die Übungen und „Zum Plan“. Ein weiterer Plan
 * trägt seinen eigenen Knopf als Zweitknopf - der Hauptknopf steht in der
 * Vorschau.
 */
function PlanAbschnitt({
  zugang,
  plan,
  heute,
  bereich,
  verbunden,
  mitKnopf,
  wartend,
}: {
  zugang: Plattformzugang;
  plan: EigenerPlan;
  heute: string;
  bereich: string;
  verbunden: boolean;
  mitKnopf: boolean;
  wartend: readonly WartendeEinheit[];
}) {
  const einheit = heutigeEinheit(plan, zugang.access_id, wartend, geraetetag());
  const beendet = plan.status === 'ended';
  const mitLeiste = !beendet && plan.can_choose_days;
  const zeile = [
    laufzeitText(plan, heute),
    // Befund B9: der Tag der Zuweisung - eine neue Fassung ist so als
    // aktualisierter Plan zu erkennen.
    !beendet && plan.assigned_on ? `Stand ${tagImSatz(plan.assigned_on)}` : null,
    // Die Häufigkeit steht sonst im Satz der Wochenleiste.
    !mitLeiste && !beendet && plan.sessions_per_week ? haeufigkeit(plan.sessions_per_week) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Section titel={plan.title} trennen>
      <div className="flex flex-col gap-6">
        <p className="text-ink-muted">{zeile}</p>
        {mitLeiste ? (
          <Uebungstage zugang={zugang} plan={plan} verbunden={verbunden} />
        ) : !beendet && plan.weekdays.length > 0 ? (
          <p className="text-ink-muted">Ihre Übungstage: {tageText(plan.weekdays)}</p>
        ) : null}
        <UebungenDesPlans items={plan.items} haken={einheit.haken} beendet={beendet} />
        {mitKnopf && plan.can_exercise && plan.items.length > 0 ? (
          <ButtonLink
            variant="secondary"
            className="w-full [[data-rechner]_&]:w-auto [[data-rechner]_&]:self-start"
            to={einheitPfad(plan.id, bereich)}
          >
            {einheit.id ? 'Weiter üben' : 'Übungen beginnen'}
          </ButtonLink>
        ) : null}
        {beendet ? null : (
          <ZumPlan
            zeilen={[
              {
                text: 'Plan als PDF',
                zeichen: ZEICHEN.dokument,
                to: blattPfad(plan.id, bereich),
              },
              // KOM-001: eine Frage mit dem Plan als Bezug (IDEA-KOM-001).
              plan.status === 'assigned'
                ? {
                    text: 'Frage zu diesem Plan',
                    zeichen: ZEICHEN.frage,
                    to: `${PLATTFORM_PFAD}/nachrichten/neu?${new URLSearchParams([
                      ...new URLSearchParams(bereich).entries(),
                      ['plan', plan.id],
                    ]).toString()}`,
                  }
                : null,
            ]}
          />
        )}
      </div>
    </Section>
  );
}

/**
 * „Bis 29. Oktober“, „Ab 3. November“, „Beendet am 15. Oktober · zum
 * Nachlesen“ - in Worten wie die Übersicht, das Jahr nur, wenn es nicht das
 * laufende ist.
 */
function laufzeitText(plan: EigenerPlan, heute: string): string | null {
  if (plan.status === 'ended') {
    return plan.ended_on ? `Beendet am ${tagImSatz(plan.ended_on)} · zum Nachlesen` : null;
  }
  if (plan.runs_from && plan.runs_from > heute) return `Ab ${tagImSatz(plan.runs_from)}`;
  return plan.runs_until ? `Bis ${tagImSatz(plan.runs_until)}` : null;
}

/**
 * „Die Übungen“ als Zeilen; eine Zeile öffnet die Übung zum Nachlesen. Heute
 * Erledigtes nach den Haken der heutigen Einheit aus Server und Gerät
 * (ANN-730). Für Pläne vom Server und vom Gerät gleich.
 */
function UebungenDesPlans({
  items: positionen,
  haken,
  beendet = false,
}: {
  items: readonly Position[];
  haken: ReadonlySet<string>;
  beendet?: boolean;
}) {
  const [offen, setOffen] = useState<Position | null>(null);
  const items = [...positionen].sort((a, b) => a.position - b.position);
  return (
    <div>
      <Zwischentitel ebene={3}>Die Übungen</Zwischentitel>
      <Uebungsliste>
        {items.map((p) => (
          <Uebungszeile
            key={p.id}
            nummer={p.position}
            titel={p.variant_lay_name}
            dosierung={dosierungKurz(p)}
            erledigt={uebungErledigt(p, haken)}
            beendet={beendet}
            onClick={() => setOffen(p)}
          />
        ))}
      </Uebungsliste>
      {offen ? (
        <Uebungsfenster
          position={offen}
          nummer={items.indexOf(offen) + 1}
          anzahl={items.length}
          onSchliessen={() => setOffen(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * „Zum Plan“ (Abschnitt 5.1): Plan als PDF und die Frage zum Plan als
 * `Linkliste` - am Telefon Zeilen 60 hoch, am Rechner Textlinks in einer Reihe.
 */
function ZumPlan({
  zeilen,
}: {
  zeilen: readonly ({ text: string; zeichen: ReactNode; to: string } | null)[];
}) {
  return (
    <div>
      <Zwischentitel ebene={3}>Zum Plan</Zwischentitel>
      <Linkliste eintraege={zeilen.filter((z) => z !== null)} />
    </div>
  );
}

/**
 * „3 Durchgänge · je 10 bis 12 Wiederholungen" - die Zeile unter dem Namen;
 * mit „je Seite“, sobald die Fachperson es einträgt (UEB-012).
 */
function dosierungKurz(p: Position): string {
  const durchgaenge = `${p.sets} ${p.sets === 1 ? 'Durchgang' : 'Durchgänge'}`;
  const seite = p.per_side ? ' · je Seite' : '';
  if (p.reps_min !== null && p.reps_max !== null) {
    const wdh = p.reps_min === p.reps_max ? `${p.reps_min}` : `${p.reps_min} bis ${p.reps_max}`;
    return `${durchgaenge} · je ${wdh} Wiederholungen${seite}`;
  }
  const s = p.duration_seconds ?? 0;
  return `${durchgaenge} · je ${s} ${s === 1 ? 'Sekunde' : 'Sekunden'}${seite}`;
}

/**
 * Eine Übung zum Nachlesen (Abschnitt 5.2): ein Fenster über die ganze Höhe
 * mit eigenem Kopf („Übung 2 von 3“, „Schließen“), darin dieselbe Bühne wie
 * die Durchführung - Name und Hauptzahl -, die Marken, Anleitung, was man
 * braucht und der Hinweis, ohne Durchgänge. Das Fenster heißt nach dem Namen
 * auf der Bühne. Die Schrift der Plattform gilt auch hier, obwohl das Fenster
 * außerhalb des Gerüsts gezeichnet wird.
 */
function Uebungsfenster({
  position,
  nummer,
  anzahl,
  onSchliessen,
}: {
  position: Position;
  nummer: number;
  anzahl: number;
  onSchliessen: () => void;
}) {
  return (
    <Dialogfenster
      titel={position.variant_lay_name}
      onSchliessen={onSchliessen}
      vollbild
      titelImInhalt
      ohneKopfzeile
    >
      <Fensterinhalt
        position={position}
        nummer={nummer}
        anzahl={anzahl}
        onSchliessen={onSchliessen}
      />
    </Dialogfenster>
  );
}

function Fensterinhalt({
  position,
  nummer,
  anzahl,
  onSchliessen,
}: {
  position: Position;
  nummer: number;
  anzahl: number;
  onSchliessen: () => void;
}) {
  const titelId = useFenstertitelId();
  const { zahl, einheit } = hauptzahl(position);
  return (
    <div className="plattform-schrift flex min-h-0 flex-1 flex-col">
      {/* Eine Zeile wie im Handoff, auch bei „Sehr groß“; erst unter 23rem
          rückt „Schließen“ unter die Zählung. */}
      <div className="border-line flex min-h-16 shrink-0 items-center justify-between gap-x-3 border-b py-2 pr-2 pl-5 max-[23rem]:flex-wrap max-[23rem]:pl-3">
        <p className="text-ink-muted min-w-0">{`Übung\u00a0${nummer} von\u00a0${anzahl}`}</p>
        {/* Der Knopf schrumpft nie - sonst bräche „Schließen“ mitten im Wort;
            bei „Sehr groß“ bricht die Zählung an ihrem Leerzeichen. */}
        <Button
          type="button"
          variant="quiet"
          className="shrink-0 max-[23rem]:px-2"
          onClick={onSchliessen}
        >
          <span className="inline-flex items-center gap-2">
            Schließen
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
              className="size-5"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </span>
        </Button>
      </div>
      {/* Unter 23rem 12 Rand wie die Seite: Sonst passte ein Name wie
          „heranziehen“ nicht in die Bühne und bräche ohne Strich (BEF-196). */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8 max-[23rem]:px-3">
        {/* Der Fokus steht am Anfang der Übung, nicht auf „Schließen“: So
            liegen Name und Zahl im Blick, und Vorlesesoftware beginnt dort. */}
        <span data-autofocus tabIndex={-1} className="block outline-none" />
        {/* Am breiten Fenster in der Spalte wie die Durchführung, nicht gestreckt. */}
        <div className="max-w-spalte mx-auto flex w-full flex-col gap-6">
          <Buehne
            name={position.variant_lay_name}
            zahl={zahl}
            einheit={einheit}
            ebene={2}
            titelId={titelId}
          />
          <Dosierungsmarken dosis={position} />
          {/* Derselbe Inhalt wie in der Durchführung, eine Ebene unter der Bühne. */}
          <Anleitung position={position} ebene={3} />
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto sm:self-end sm:px-7"
            onClick={onSchliessen}
          >
            Schließen
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * „Ihre Übungstage" (UEB-011, ANN-307) als `Wochenleiste`: Die Person legt
 * selbst fest, an welchen Tagen sie übt; die Tage erscheinen unter „Termine"
 * neben den Terminen. Jeder Tipp wird sofort gespeichert und bei einem Fehler
 * zurückgenommen (ANN-305). Die Praxis sieht die Tage nicht. ANN-723: Ohne
 * Netz ist die Leiste gesperrt, statt einen Tipp zurückspringen zu lassen.
 */
function Uebungstage({
  zugang,
  plan,
  verbunden,
}: {
  zugang: Plattformzugang;
  plan: EigenerPlan;
  verbunden: boolean;
}) {
  const queryClient = useQueryClient();
  const [tage, setTage] = useState<number[]>(plan.weekdays);
  const speichern = useMutation({
    // Der Reihe nach, damit der letzte Tipp auch der letzte Stand am Server ist.
    scope: { id: `tage-${plan.id}` },
    mutationFn: (neu: number[]) => uebungstageSetzen(zugang.access_id, plan.id, neu),
    onMutate: (neu) => {
      const vorher = tage;
      setTage(neu);
      return { vorher };
    },
    onError: (_e, _neu, kontext) => {
      if (kontext) setTage(kontext.vorher);
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: plaeneSchluessel(zugang.access_id) }),
  });
  return (
    <div>
      <Wochenleiste
        titel="Ihre Übungstage"
        wochentage={WOCHENTAGE}
        tage={tage}
        gesperrt={!verbunden}
        satz={wochenleisteSatz(tage.length, plan.sessions_per_week, !verbunden)}
        onUmschalten={(tag) =>
          speichern.mutate(
            tage.includes(tag)
              ? tage.filter((t) => t !== tag)
              : [...tage, tag].sort((a, b) => a - b),
          )
        }
      />
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

/**
 * Ohne Antwort des Servers (Abschnitt 5.6, BEF-197): die Pläne vom letzten
 * Laden zum Üben (ADR-024 Punkt 5). Die Ablage trägt nur die Felder der
 * Durchführung - Vorschau und Übungen, keine Übungstage, keine Laufzeit, kein
 * PDF. Ohne Netz spricht die Verbindungszeile; bei Verbindung sagt eine
 * Meldung, dass die Praxis gerade nicht antwortet, mit dem Tag des Plans
 * (ANN-721). Liegt nichts auf dem Gerät, der Fehler mit „Erneut versuchen“.
 */
function PlanVomGeraet({
  zugang,
  bereich,
  verbunden,
  wartend,
  onErneut,
}: {
  zugang: Plattformzugang;
  bereich: string;
  verbunden: boolean;
  wartend: readonly WartendeEinheit[];
  onErneut: () => unknown;
}) {
  const traeger = useContext(DurchfuehrungKontext);
  const abgelegt = useQuery({
    queryKey: ['abgelegte-plaene', traeger?.besitzer, zugang.access_id],
    queryFn: async () =>
      traeger
        ? ((await abgelegteZugaenge(traeger.besitzer)).find(
            (z) => z.zugangId === zugang.access_id,
          ) ?? null)
        : null,
    gcTime: 0,
    // Die Ablage liegt auf dem Gerät: Sie wird auch ohne Netz gelesen.
    networkMode: 'always',
  });
  if (abgelegt.isPending) return <Ladezustand />;
  const ablage = abgelegt.data;
  if (!ablage || ablage.plaene.length === 0) {
    return (
      <div className="[[data-rechner]_&]:max-w-spalte">
        <ErrorState
          title="Ihre Übungen lassen sich gerade nicht laden."
          description="Prüfen Sie die Verbindung oder versuchen Sie es gleich noch einmal."
          onErneut={onErneut}
        />
      </div>
    );
  }
  const training = zugang.relationship_kind === 'training';
  const [erster, ...weitere] = ablage.plaene as [Ablageplan, ...Ablageplan[]];
  // Die heutige Einheit je Plan wie in der Durchführung (ANN-722, ANN-730).
  const heute = geraetetag();
  const einheit = (plan: Ablageplan) => heutigeEinheit(plan, zugang.access_id, wartend, heute);
  return (
    <>
      {verbunden ? (
        <div className="mb-6 flex flex-col items-start gap-1">
          <Statusmeldung ton="warnung">
            {`Die Praxis antwortet gerade nicht. Üben können Sie trotzdem – mit Ihrem Plan vom ${tagImSatz(ablage.tag)}.`}
          </Statusmeldung>
          <Button type="button" variant="quiet" onClick={() => void onErneut()}>
            Erneut versuchen
          </Button>
        </div>
      ) : null}
      <Spalten
        vorschau={
          <HeroKarte
            schmalOhneRad
            etikett="Ihr Plan auf diesem Gerät"
            titel={training ? 'Ihr Plan für zu Hause' : 'Ihre Übungen'}
            angaben={angabenDerEinheit({
              items: erster.items,
              planname: weitere.length > 0 ? erster.title : null,
              offen: weiterBei(erster.items, einheit(erster)),
              ohneNetz: false,
            })}
            aktion={{
              text: einheit(erster).id ? 'Weiter üben' : 'Übungen beginnen',
              to: einheitPfad(erster.id, bereich),
            }}
          />
        }
      >
        {ablage.plaene.map((plan, i) => (
          <div key={plan.id} className={i === 0 ? undefined : 'border-line mt-10 border-t pt-10'}>
            <Section titel={plan.title} trennen>
              <div className="flex flex-col gap-6">
                <p className="text-ink-muted">
                  {verbunden
                    ? 'Übungstage und Laufzeit sehen Sie wieder, sobald die Praxis antwortet.'
                    : 'Übungstage und Laufzeit sehen Sie wieder mit Verbindung.'}
                </p>
                <UebungenDesPlans items={plan.items} haken={einheit(plan).haken} />
                {i > 0 ? (
                  <ButtonLink
                    variant="secondary"
                    className="w-full [[data-rechner]_&]:w-auto [[data-rechner]_&]:self-start"
                    to={einheitPfad(plan.id, bereich)}
                  >
                    {einheit(plan).id ? 'Weiter üben' : 'Übungen beginnen'}
                  </ButtonLink>
                ) : null}
              </div>
            </Section>
          </div>
        ))}
      </Spalten>
    </>
  );
}

/**
 * Das Skelett des Reiters (Abschnitt 5.6): Der Seitentitel steht schon; die
 * Vorschau 300 hoch, der Plan mit zwei Zeilen, Leiste und Liste - am Rechner
 * in zwei Spalten wie die Seite. Für Vorlesesoftware „Übungen werden
 * geladen“.
 */
function Ladezustand() {
  return (
    <SkelettBereich beschriftung="Übungen werden geladen">
      <Spalten vorschau={<Skelett form="vorschau" />}>
        <span className="flex flex-col gap-4">
          <Skelett form="titel" className="w-60 max-w-full" />
          <Skelett form="zeile" className="w-50 max-w-full" />
          <Skelett form="leiste" className="mt-2" />
          <Skelett form="karte" className="mt-2 min-h-60" />
        </span>
      </Spalten>
    </SkelettBereich>
  );
}

const SVG = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  focusable: 'false',
} as const;

/** Zeichen der Angaben und Zeilen (Raster 24, Strich 2), für Vorlesesoftware ausgeblendet. */
const ZEICHEN = {
  uhr: (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  tasche: <TascheSymbol />,
  weiter: (
    <svg {...SVG}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.5 8.5l4 3.5-4 3.5z" />
    </svg>
  ),
  telefon: (
    <svg {...SVG}>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 18h2" />
    </svg>
  ),
  kalender: (
    <svg {...SVG}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  ),
  dokument: (
    <svg {...SVG}>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </svg>
  ),
  frage: (
    <svg {...SVG}>
      <path d="M5 5h14v10H10l-4 4v-4H5z" />
      <path d="M10 9.5a2 2 0 1 1 2.5 1.9c-.3.1-.5.4-.5.7v.4M12 14h.01" />
    </svg>
  ),
};

/**
 * Der Plan als Blatt auf der Plattform (UEB-009, ANN-303): derselbe Baustein
 * wie in der Praxis, ohne Namen - die Person weiß, wer sie ist. Auch in der
 * Lesefrist (DSN-001 D2): „Plan als PDF" ist das, was nach dem Ende bleibt.
 *
 * Handoff 2026-10-24, Abschnitt 5.7: Titel „Plan als PDF“ mit einem Satz und
 * dem Hauptknopf, darunter die Vorschau als Blatt - am Rechner der Knopf
 * rechts neben Titel und Satz. Gedruckt wird nur das Blatt. Unter 23rem steht
 * es ohne Rahmen, sonst bliebe bei 200 % kaum Breite für den Text (ANN-731).
 */
export function PlanblattPlattform({
  zugang,
  praxis,
}: {
  zugang: Plattformzugang;
  praxis: string;
}) {
  const rechner = useRechner();
  // Die Kennung aus dem Pfad `/p/uebungen/blatt/<id>` wie bei den Terminen.
  const { pathname } = useLocation();
  const planId = pathname.slice(pathname.lastIndexOf('/') + 1);
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}/uebungen${bereich ? `?${bereich}` : ''}`;
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });
  const plan = plaene.data?.plans.find((p) => p.id === planId);

  return (
    <div className="flex flex-col gap-6">
      <div className="nicht-drucken flex flex-col gap-6">
        <ButtonLink variant="quiet" to={zurueck} className="-ml-2 gap-1 self-start pl-2">
          <ZurueckSymbol />
          Zurück
        </ButtonLink>
        <div
          className={
            rechner
              ? 'flex flex-wrap items-end justify-between gap-x-8 gap-y-4'
              : 'flex flex-col gap-6'
          }
        >
          <div
            className={`flex max-w-prose flex-col gap-2 ${rechner ? 'min-w-0 flex-1 basis-72' : ''}`}
          >
            <PageHeader title="Plan als PDF" stufe="seite" />
            {plan ? (
              <p className="text-ink">
                Drucken Sie den Plan aus oder sichern Sie ihn als PDF. Die Datei bleibt auf Ihrem
                Gerät.
              </p>
            ) : null}
          </div>
          {plan ? (
            <Button
              type="button"
              onClick={() => window.print()}
              className={rechner ? 'shrink-0' : 'w-full'}
            >
              Drucken oder als PDF sichern
            </Button>
          ) : null}
        </div>
      </div>
      {plaene.isPending ? (
        <LoadingState label="Ihr Plan wird geladen …" />
      ) : plaene.data === undefined ? (
        <ErrorState
          title="Ihr Plan konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => plaene.refetch()}
        />
      ) : !plan ? (
        <EmptyState markenform title="Diesen Plan gibt es hier nicht." />
      ) : (
        <div
          className={`bg-surface-sunken rounded-card max-[23rem]:bg-transparent max-[23rem]:p-0 print:p-0 ${rechner ? 'p-6' : 'p-3'}`}
        >
          {/* Eckig wie Papier: Das System kennt keinen Radius 4 (ANN-731). */}
          <div
            className={`bg-surface border-line border max-[23rem]:border-0 max-[23rem]:p-0 print:border-0 print:p-0 ${rechner ? 'p-12' : 'px-4 py-5'}`}
          >
            <Planblatt
              plan={plan}
              praxis={praxis}
              stand={plan.assigned_on}
              uebungstage={plan.weekdays}
              gross={rechner}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** „Geht auch ohne Netz.“ (Briefing 1): Die Pläne liegen auf dem Gerät. */
const OHNE_NETZ = { schluessel: 'netz', zeichen: ZEICHEN.telefon, text: 'Geht auch ohne Netz.' };
