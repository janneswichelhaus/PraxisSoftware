import { useId } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { HeroSkelett, Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Terminliste } from '@/components/ui/Terminliste';
import { Terminsymbol, type Terminzeichen } from '@/components/ui/Terminsymbole';
import {
  aboSchluessel,
  plaeneSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type EigenePlaene,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { TAGE_NUR_DIE_PERSON, useNurLesen, usePlattformApi } from './einsicht';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import { useRechner } from './geruestbreite';
import {
  ersterTermin,
  inLesefrist,
  lesefristSatz,
  naechsterTermin,
  terminPerson,
  terminTitel,
  terminZeit,
} from './hauptsache';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { Terminzeile, Wunschzeile } from './Terminbausteine';
import { artUndPerson, artzeichen, heroEtikett, leereTage, tagDerWoche } from './termintexte';
import { terminBeschreibung } from './terminbeschreibung';
import { tageAb, uebungstageAm } from './uebungstage';
import { WUENSCHE_OHNE_NETZ } from './wunschtexte';
import { kalendertag, kuenftig, uhrzeit } from './zeit';

/**
 * Reiter „Termine“ (POR-008, DSN-001 4.1; Handoff 2026-10-24 „Termine“,
 * 5.1, Schritt 3b): „Wann komme ich dran, und was möchte ich ändern?“
 *
 * Von oben: der nächste Termin als Hero-Karte - die ganze Karte führt zur
 * Seite des Termins (Frage 1, ANN-740) -, die übrigen kommenden als „Weitere
 * Termine“, „Termin wünschen“ als der eine Hauptknopf, „Ihre Wünsche“,
 * „Diese Woche“ und die vergangenen auf Abruf. Jede Zeile führt zur Seite
 * ihres Termins, auch eine vergangene oder abgesagte (ANN-744). Ein Wunsch
 * steht als „angefragt“, nie wie ein Termin (§8); die Belegung anderer
 * Personen ist nirgends zu sehen. Gezeigt wird nur, was der Server über den
 * Zugang liefert.
 *
 * Am Rechner stehen Hero und Knopf rechts, die Listen links (ANN-743). Ohne
 * Netz bleibt alles lesbar, „Termin wünschen“ ist gesperrt (Frage 4,
 * ANN-741); in der Lesefrist fehlt er (Frage 5, ANN-742), in der Einsicht der
 * Praxis auch, ebenso „Wunsch zurückziehen“ (E-001).
 */
export function Termine({ zugang }: { zugang: Plattformzugang }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const verbunden = useIstVerbunden();
  // Wie das Gerüst: Die Einsicht zeigt immer das Telefon (`geruestbreite.ts`).
  const rechner = useRechner() && !nurLesen;
  const [suche] = useSearchParams();
  const gesendet = useEinmaligeRueckmeldung('gesendet');
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => api.ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => api.ladeWuensche(zugang.access_id),
  });
  // UEB-011: die Übungstage neben den Terminen (IDEA-ORG-004). Lädt der Plan
  // nicht, bleiben die Termine - die Woche fehlt dann einfach.
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => api.ladePlaene(zugang.access_id),
  });
  // Die Lesefrist beginnt erst nach einem Nachsorge-Abo (ANN-274), wie auf
  // der Übersicht. Gefragt wird nur, wenn sie überhaupt in Frage kommt.
  const abo = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => api.ladeAbo(zugang.access_id),
    enabled: inLesefrist(zugang) && zugang.relationship_kind === 'treatment',
  });
  const lesefrist = inLesefrist(
    zugang,
    abo.data?.state === 'running' || abo.data?.state === 'ending',
  );
  // Ohne Antwort des Servers bleibt das Skelett, auch ohne Netz - wie auf
  // der Übersicht sagt dann die Verbindungszeile, was fehlt.
  const laedt =
    (termine.data === undefined && !termine.isError) ||
    (abo.isPending && abo.fetchStatus === 'fetching');
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  const wuenschen = !nurLesen && !lesefrist;
  const satz = lesefrist ? lesefristSatz(zugang, abo.data ?? null) : null;
  const jetzt = new Date();
  const teile =
    termine.data === undefined
      ? undefined
      : aufteilen(termine.data, wuensche.data ?? [], plaene.data, rechner && !lesefrist, jetzt);

  return (
    // Gemessen wird der Inhalt: Ob zwei Spalten passen, sagt `ZWEI_SPALTEN`.
    <div className={`@container flex flex-col ${rechner ? 'gap-12' : 'gap-10'}`}>
      {satz ? (
        <Statusmeldung ton="warnung" className={rechner ? 'max-w-spalte' : ''}>
          {satz}
        </Statusmeldung>
      ) : null}
      <PageHeader
        title="Termine"
        stufe="seite"
        description={
          lesefrist ? (
            <span>Neue Termine vereinbaren Sie bei Bedarf direkt mit der Praxis.</span>
          ) : undefined
        }
      />
      {gesendet === '1' ? (
        // Über zwei Spalten reicht sie über beide, sonst so breit wie die eine (5.5).
        <Rueckmeldung
          className={teile?.zweispaltig ? ZWEI_SPALTEN.breite : rechner ? 'max-w-spalte' : ''}
        >
          Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.
        </Rueckmeldung>
      ) : null}
      {laedt ? (
        <Ladezustand rechner={rechner} />
      ) : termine.data === undefined || teile === undefined ? (
        // Ohne Termine bleibt der Wunsch möglich - der Satz sagt es (DR-136).
        <div className={`flex flex-col gap-10 ${rechner ? 'max-w-spalte' : ''}`}>
          <ErrorState
            title="Ihre Termine lassen sich gerade nicht laden."
            description={
              wuenschen && verbunden
                ? 'Versuchen Sie es gleich noch einmal. Einen Termin wünschen können Sie trotzdem.'
                : 'Versuchen Sie es gleich noch einmal.'
            }
            onErneut={() => termine.refetch()}
          />
          {wuenschen ? (
            <Wunschknopf
              pfad={mit(`${PLATTFORM_PFAD}/termine/wunsch`)}
              verbunden={verbunden}
              breit={!rechner}
            />
          ) : null}
        </div>
      ) : (
        <>
          {termine.isError ? (
            <NachladeHinweis laeuft={termine.isFetching} onErneut={() => void termine.refetch()} />
          ) : null}
          <Liste
            zugang={zugang}
            termine={termine.data}
            teile={teile}
            plaene={plaene.data}
            jetzt={jetzt}
            rechner={rechner}
            verbunden={verbunden}
            lesefrist={lesefrist}
            nurLesen={nurLesen}
            mit={mit}
          />
        </>
      )}
    </div>
  );
}

/**
 * Zwei Spalten am Rechner (Handoff 4 und 5.5, ANN-743): rechts Hero und
 * Knopf, 21.25 bis 28.75rem; links die Listen, mindestens 32.5rem - die
 * Liste geht vor. Gemessen wird die Breite des Inhalts in rem, also mit der
 * Schrift: Reicht sie nicht (1024 px mit „Sehr groß“), stehen beide in einer
 * Spalte untereinander, Hero und Knopf zuerst. `breite` für, was über beiden
 * steht.
 */
const ZWEI_SPALTEN = {
  raster:
    'max-w-spalte flex flex-col gap-10 @min-[56.75rem]:grid @min-[56.75rem]:max-w-none @min-[56.75rem]:grid-cols-[minmax(32.5rem,1fr)_minmax(var(--container-vorschau-min),var(--container-vorschau))] @min-[56.75rem]:items-start @min-[56.75rem]:gap-12',
  rechts: '@min-[56.75rem]:col-start-2 @min-[56.75rem]:row-start-1',
  links: '@min-[56.75rem]:col-start-1 @min-[56.75rem]:row-start-1',
  breite: 'max-w-spalte @min-[56.75rem]:max-w-none',
};

/** Nach Beginn, die Reihenfolge des Servers ist keine Zusage. */
function nachBeginn(a: Termin, b: Termin): number {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

/**
 * Was die Liste zeigt (Handoff 5.1): der nächste Termin, die weiteren, die
 * vergangenen und die sichtbaren Wünsche. Zwei Spalten am Rechner nur mit
 * einem nächsten Termin und etwas für die linke Spalte - sonst stünde die
 * Hero-Karte neben einer leeren Hälfte (5.5).
 */
function aufteilen(
  termine: Termin[],
  wuensche: Terminwunsch[],
  plaene: EigenePlaene | undefined,
  zweiSpaltenMoeglich: boolean,
  jetzt: Date,
) {
  const naechster = naechsterTermin(termine, jetzt);
  const weitere = termine
    .filter((t) => t !== naechster && kuenftig(t.ends_at, jetzt))
    .sort(nachBeginn);
  const vergangene = termine
    .filter((t) => !kuenftig(t.ends_at, jetzt))
    .sort((a, b) => nachBeginn(b, a));
  const sichtbar = sichtbareWuensche(wuensche, jetzt);
  const links =
    weitere.length > 0 || sichtbar.length > 0 || vergangene.length > 0 || hatWoche(plaene);
  return {
    naechster,
    weitere,
    vergangene,
    sichtbar,
    // Nur ein Wunsch, noch kein Termin: Die Hauptsache ist erledigt (5.1).
    nurWunsch: !naechster && sichtbar.some((w) => w.status === 'open' && w.kind === 'new'),
    zweispaltig: zweiSpaltenMoeglich && naechster !== undefined && links,
  };
}

/** Zeigt „Diese Woche“ etwas? Ohne Übungstage nicht (`DieseWoche`). */
function hatWoche(plaene: EigenePlaene | undefined): boolean {
  return plaene?.plans.some((p) => p.weekdays.length > 0) ?? false;
}

/**
 * Die geladene Liste (Handoff 5.1): Hauptsache, „Weitere Termine“, Knopf,
 * Wünsche, Woche, Vergangene. Am Rechner zwei Spalten, wenn es einen
 * nächsten Termin und links etwas gibt (`aufteilen`); sonst, in der
 * Lesefrist und beim Fehler eine Spalte in `max-w-spalte` (5.5).
 *
 * Ein `Section` trägt den Abstand zu seinem Vorgänger selbst; in den Stapeln
 * mit `gap` steht er deshalb allein in seinem Block, sonst zählte der
 * Abstand doppelt.
 */
function Liste({
  zugang,
  termine,
  teile,
  plaene,
  jetzt,
  rechner,
  verbunden,
  lesefrist,
  nurLesen,
  mit,
}: {
  zugang: Plattformzugang;
  termine: Termin[];
  teile: ReturnType<typeof aufteilen>;
  plaene: EigenePlaene | undefined;
  jetzt: Date;
  rechner: boolean;
  verbunden: boolean;
  lesefrist: boolean;
  nurLesen: boolean;
  mit: (pfad: string) => string;
}) {
  const bereich = zugang.relationship_kind;
  const vertretung = zugang.access_kind !== 'self';
  const { naechster, weitere, vergangene, sichtbar, nurWunsch, zweispaltig } = teile;
  // Ohne Netz sagt ein Satz, warum Wünschen und Zurückziehen gesperrt sind -
  // einmal, unter dem Knopf oder, fehlt er, unter den Wünschen (Frage 4).
  const ohneNetzId = useId();
  // Die Einsicht hat noch keine Seite des Termins (ANN-744).
  const zielVon = (t: Termin) => (nurLesen ? undefined : mit(`${PLATTFORM_PFAD}/termine/${t.id}`));

  const hauptsache = naechster ? (
    <HeroKarte
      etikett={heroEtikett(
        naechster.appointment_type,
        bereich,
        ersterTermin(termine, naechster),
        vertretung,
      )}
      titel={terminTitel(naechster, bereich, vertretung ? zugang.represented_name : null, jetzt)}
      satz={terminZeit(naechster, vertretung, jetzt)}
      person={personDesTermins(naechster, vertretung)}
      ziel={
        nurLesen
          ? undefined
          : { text: 'Termin ansehen', to: mit(`${PLATTFORM_PFAD}/termine/${naechster.id}`) }
      }
    />
  ) : nurWunsch ? (
    // Der Wunsch ist gesendet: die Uhr auf der Vertiefung statt des Laufrads (5.1).
    <EmptyState
      markenform
      inKarte
      zeichen={<Terminsymbol zeichen="uhr" />}
      title="Ihr Wunsch ist bei der Praxis."
      description="Sie meldet sich bei Ihnen. Danach steht Ihr Termin hier."
    />
  ) : lesefrist ? null : (
    <EmptyState
      markenform
      inKarte
      title="Zurzeit ist kein Termin vereinbart."
      description="Über „Termin wünschen“ sagen Sie der Praxis, wann es Ihnen passt."
    />
  );
  const knopf =
    nurLesen || lesefrist ? null : (
      <Wunschknopf
        pfad={mit(`${PLATTFORM_PFAD}/termine/wunsch`)}
        verbunden={verbunden}
        zweit={nurWunsch}
        breit={!rechner || zweispaltig}
        satzId={ohneNetzId}
      />
    );
  // Sind alle kommenden abgesagt, gibt es keinen „weiteren“ (H9).
  const weitereTitel = naechster
    ? 'Weitere Termine'
    : weitere.every((t) => t.status === 'cancelled')
      ? 'Abgesagte Termine'
      : 'Kommende Termine';
  const offeneWuensche = !nurLesen && sichtbar.some((w) => w.status === 'open');
  const weitereAbschnitt =
    weitere.length > 0 ? (
      <div>
        <Section titel={weitereTitel}>
          <Terminliste name={weitereTitel}>
            {weitere.map((t) => (
              <Terminzeile key={t.id} termin={t} bereich={bereich} to={zielVon(t)} jetzt={jetzt} />
            ))}
          </Terminliste>
        </Section>
      </div>
    ) : null;
  const wuenscheAbschnitt =
    sichtbar.length > 0 ? (
      <div>
        <Section
          titel="Ihre Wünsche"
          hinweis="Ein Wunsch ist noch kein Termin. Die Praxis meldet sich bei Ihnen."
        >
          <Terminliste name="Ihre Wünsche">
            {sichtbar.map((w) => (
              <Wunschzeile
                key={w.id}
                wunsch={w}
                termine={termine}
                jetzt={jetzt}
                zurueckziehen={
                  w.status === 'open' && !nurLesen ? (
                    <Zurueckziehen
                      zugang={zugang}
                      wunschId={w.id}
                      verbunden={verbunden}
                      ohneNetzId={ohneNetzId}
                    />
                  ) : undefined
                }
              />
            ))}
          </Terminliste>
          {!verbunden && !knopf && offeneWuensche ? (
            <p id={ohneNetzId} className="text-ink-muted mt-2">
              {WUENSCHE_OHNE_NETZ}
            </p>
          ) : null}
        </Section>
      </div>
    ) : null;
  // ANN-307: Die Übungstage der Woche sieht nur die Person; die Einsicht
  // bekommt sie leer und sagt das, statt still zu fehlen. In der Lesefrist
  // ist nichts mehr zu üben (5.1).
  const woche = nurLesen ? (
    plaene?.plans.some((p) => p.status === 'assigned') ? (
      <p className="text-ink-muted max-w-prose">{TAGE_NUR_DIE_PERSON}</p>
    ) : null
  ) : plaene && !lesefrist ? (
    <DieseWoche termine={termine} plaene={plaene} bereich={bereich} />
  ) : null;
  const vergangenAbschnitt =
    vergangene.length === 0 ? null : lesefrist ? (
      // In der Lesefrist ist das Vergangene der Inhalt, nicht der Rest (5.1).
      <div>
        <Section titel="Vergangene Termine">
          <Terminliste name="Vergangene Termine">
            {vergangene.map((t) => (
              <Terminzeile key={t.id} termin={t} bereich={bereich} to={zielVon(t)} jetzt={jetzt} />
            ))}
          </Terminliste>
        </Section>
      </div>
    ) : (
      // Vergangenes auf Abruf: Es wird mit jeder Behandlung länger (DESIGN.md, Regel 6).
      <Disclosure summary="Vergangene Termine" anzahl={vergangene.length} kopf="betont">
        <Terminliste name="Vergangene Termine">
          {vergangene.map((t) => (
            <Terminzeile key={t.id} termin={t} bereich={bereich} to={zielVon(t)} jetzt={jetzt} />
          ))}
        </Terminliste>
      </Disclosure>
    );

  if (zweispaltig) {
    // Im Baum zuerst Hero und Knopf, am Rechner rechts (Handoff, Abschnitt 4).
    return (
      <div data-spalten="zwei" className={ZWEI_SPALTEN.raster}>
        <div className={`flex min-w-0 flex-col gap-6 ${ZWEI_SPALTEN.rechts}`}>
          {hauptsache}
          {knopf}
        </div>
        <div className={`flex min-w-0 flex-col gap-12 ${ZWEI_SPALTEN.links}`}>
          {weitereAbschnitt}
          {wuenscheAbschnitt}
          {woche}
          {vergangenAbschnitt}
        </div>
      </div>
    );
  }
  // Am Telefon steht der Knopf unter den kommenden Terminen, mit dem Daumen
  // erreichbar; ist schon ein Wunsch unterwegs, unter den Wünschen.
  return (
    <div className={`flex flex-col ${rechner ? 'max-w-spalte gap-12' : 'gap-10'}`}>
      {hauptsache}
      {weitereAbschnitt}
      {nurWunsch ? null : knopf}
      {wuenscheAbschnitt}
      {nurWunsch ? knopf : null}
      {woche}
      {vergangenAbschnitt}
    </div>
  );
}

/**
 * Wer kommt und wohin, für die Hero-Karte: beim Hausbesuch die Anschrift,
 * in der Praxis der Standort, beim Video kein Ort (Handoff, Abschnitt 3).
 */
function personDesTermins(termin: Termin, vertretung: boolean) {
  const zeile = terminPerson(termin, vertretung);
  if (!termin.staff_name || !zeile) return undefined;
  return {
    name: termin.staff_name,
    zeile,
    ort: termin.appointment_type === 'video' ? null : terminBeschreibung(termin).ort,
  };
}

/**
 * Beantwortete Wünsche nur, solange sie neu sind (14 Tage) - danach wäre es
 * eine Liste alter Vorgänge, keine Auskunft.
 */
function sichtbareWuensche(wuensche: Terminwunsch[], jetzt: Date): Terminwunsch[] {
  const grenze = jetzt.getTime() - 14 * 24 * 60 * 60 * 1000;
  return wuensche.filter(
    (w) => w.status === 'open' || (w.resolved_at && new Date(w.resolved_at).getTime() > grenze),
  );
}

/**
 * „Termin wünschen“ (Handoff 5.1): der eine Hauptknopf der Seite, am Telefon
 * und in der rechten Spalte des Rechners in voller Breite. Ist schon ein
 * Wunsch unterwegs und kein Termin da, der Zweitknopf „Noch einen Termin
 * wünschen“. Ohne Netz gesperrt - gestrichelt wie die Übungstage, der Satz
 * darunter sagt, wann es wieder geht (Frage 4, ANN-741).
 */
function Wunschknopf({
  pfad,
  verbunden,
  zweit = false,
  breit,
  satzId,
}: {
  pfad: string;
  verbunden: boolean;
  zweit?: boolean;
  breit: boolean;
  /** Die Kennung des Satzes ohne Netz, wenn auch „Wunsch zurückziehen“ auf ihn zeigt. */
  satzId?: string;
}) {
  const eigeneId = useId();
  const id = satzId ?? eigeneId;
  const text = zweit ? 'Noch einen Termin wünschen' : 'Termin wünschen';
  const variant = zweit ? 'secondary' : 'primary';
  const breite = breit ? 'w-full' : 'self-start';
  if (verbunden) {
    return (
      <ButtonLink to={pfad} variant={variant} groesse="normal" className={breite}>
        {text}
      </ButtonLink>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={variant}
        groesse="normal"
        disabled
        aria-describedby={id}
        className={breite}
      >
        {text}
      </Button>
      <p id={id} className="text-ink-muted">
        {WUENSCHE_OHNE_NETZ}
      </p>
    </div>
  );
}

/**
 * „Wunsch zurückziehen“ mit der Rückfrage an Ort und Stelle. Danach lädt
 * die Liste Wünsche und Termine neu: Ein zurückgezogener Änderungs- oder
 * Absagewunsch nimmt auch das Statuszeichen am Termin mit. Ohne Netz
 * gesperrt wie „Termin wünschen“, mit demselben Satz (Frage 4, ANN-741).
 */
function Zurueckziehen({
  zugang,
  wunschId,
  verbunden,
  ohneNetzId,
}: {
  zugang: Plattformzugang;
  wunschId: string;
  verbunden: boolean;
  ohneNetzId: string;
}) {
  const api = usePlattformApi();
  const queryClient = useQueryClient();
  const zurueckziehen = useMutation({
    mutationFn: () => api.wunschZurueckziehen(zugang.access_id, wunschId),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) }),
        queryClient.invalidateQueries({ queryKey: termineSchluessel(zugang.access_id) }),
      ]),
  });
  if (!verbunden) {
    return (
      <Button type="button" variant="quiet" disabled aria-describedby={ohneNetzId}>
        Wunsch zurückziehen
      </Button>
    );
  }
  return (
    <Rueckfrage
      ausloeser="Wunsch zurückziehen"
      ausloeserVariante="quiet"
      bestaetigen="Ja, zurückziehen"
      bestaetigenLaeuft="Wird zurückgezogen …"
      fehler={zurueckziehen.error?.message}
      onBestaetigen={() => zurueckziehen.mutateAsync()}
    >
      <p>Die Praxis bearbeitet diesen Wunsch dann nicht weiter.</p>
    </Rueckfrage>
  );
}

/**
 * „Diese Woche“ (UEB-011, IDEA-ORG-004; Handoff, Abschnitt 3): heute und die
 * sechs Tage danach, nur die Tage mit etwas - je Eintrag Zeichen und Text in
 * einer Zeile, ohne Pillen (DR-135); die leeren Tage zusammen in einer
 * letzten Zeile. Ein Übungstag, an dem schon geübt wurde, trägt „geübt“;
 * keine Serie, keine Quote (DSN-001 4.1).
 */
function DieseWoche({
  termine,
  plaene,
  bereich,
}: {
  termine: Termin[];
  plaene: EigenePlaene;
  bereich: Plattformzugang['relationship_kind'];
}) {
  // Der Tag der Praxis, wie bei den Plänen - nicht der des Geräts.
  const heute = plaene.today;
  if (!hatWoche(plaene)) return null;
  const tage = tageAb(heute, 7).map((tag) => ({
    tag,
    termine: termine
      .filter((t) => t.status !== 'cancelled' && kalendertag(new Date(t.starts_at)) === tag)
      .sort(nachBeginn),
    uebungen: uebungstageAm(plaene.plans, tag),
  }));
  const belegt = tage.filter((t) => t.termine.length > 0 || t.uebungen.length > 0);
  const leer = tage.filter((t) => t.termine.length === 0 && t.uebungen.length === 0);
  // Allein in seinem Block: Die Liste stapelt mit `gap` (siehe `Liste`).
  return (
    <div>
      <Section titel="Diese Woche">
        <Terminliste name="Die nächsten sieben Tage">
          {belegt.map(({ tag, termine: amTag, uebungen }) => (
            <li key={tag} className={WOCHENZEILE}>
              <span className="font-semibold">{tag === heute ? 'Heute' : tagDerWoche(tag)}</span>
              <span className="flex min-w-0 flex-col gap-1">
                {amTag.map((t) => (
                  <Eintrag key={t.id} zeichen={artzeichen(t.appointment_type, bereich)}>
                    {`${uhrzeit(t.starts_at)} ${artUndPerson(t, bereich)}`}
                  </Eintrag>
                ))}
                {uebungen.map((p) => (
                  <Eintrag key={p.id} zeichen="training">
                    {`Übungstag · ${p.title}${
                      p.recent_sessions.some((s) => s.performed_on === tag && s.finished)
                        ? ' · geübt'
                        : ''
                    }`}
                  </Eintrag>
                ))}
              </span>
            </li>
          ))}
          {leer.length > 0 ? (
            <li className={`${WOCHENZEILE} text-ink-muted`}>
              <span className="font-semibold">{leereTage(leer.map((t) => t.tag))}</span>
              <span>nichts geplant</span>
            </li>
          ) : null}
        </Terminliste>
      </Section>
    </div>
  );
}

/**
 * Zeile der Woche: Tag in 6.5rem und Inhalt. Unter 23rem und bei „Sehr
 * groß“ steht der Tag über dem Inhalt - neben 8rem blieben dort rund 90 px,
 * und „Übungstag“ bräche im Wort (ANN-745).
 */
const WOCHENZEILE =
  'grid min-h-14 grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 hyphens-manual max-[23rem]:grid-cols-1 max-[23rem]:gap-1 max-[23rem]:px-3 [[data-schrift=sehr-gross]_&]:grid-cols-1 [[data-schrift=sehr-gross]_&]:gap-1';

/** Ein Eintrag der Woche: Zeichen 20 in der Hauptfarbe, daneben der Text. */
function Eintrag({ zeichen, children }: { zeichen: Terminzeichen; children: string }) {
  return (
    <span className="flex items-start gap-2">
      <Terminsymbol zeichen={zeichen} className="text-accent mt-0.5 size-5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * Das Skelett der Liste (Handoff 5.6): Der Seitentitel steht schon; der
 * nächste Termin 300 hoch, ein Abschnittstitel, die Liste 168 und der Knopf
 * als Fläche 48 - kein bedienbarer Knopf (DR-136). Am Rechner in zwei
 * Spalten wie die Liste. Für Vorlesesoftware „Termine werden geladen“.
 */
function Ladezustand({ rechner }: { rechner: boolean }) {
  const liste = (
    <span className="flex flex-col gap-4">
      <Skelett form="titel" className="w-45 max-w-full" />
      <Skelett form="liste" />
    </span>
  );
  return (
    <SkelettBereich beschriftung="Termine werden geladen">
      {rechner ? (
        <div className={ZWEI_SPALTEN.raster}>
          <span className={`flex min-w-0 flex-col gap-6 ${ZWEI_SPALTEN.rechts}`}>
            <HeroSkelett />
            <Skelett form="hauptknopf" />
          </span>
          <span className={`min-w-0 ${ZWEI_SPALTEN.links}`}>{liste}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <HeroSkelett />
          <span className="flex flex-col gap-4">
            <Skelett form="titel" className="w-45 max-w-full" />
            <Skelett form="liste" />
            <Skelett form="hauptknopf" />
          </span>
        </div>
      )}
    </SkelettBereich>
  );
}
