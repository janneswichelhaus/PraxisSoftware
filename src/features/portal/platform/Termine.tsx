import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { PageHeader } from '@/components/ui/PageHeader';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { HeroSkelett, Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Terminliste } from '@/components/ui/Terminliste';
import { Terminsymbol, type Terminzeichen } from '@/components/ui/Terminsymbole';
import {
  ladePlaene,
  ladeTermine,
  ladeWuensche,
  plaeneSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type EigenePlaene,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import { useRechner } from './geruestbreite';
import {
  ersterTermin,
  lesefristSatz,
  naechsterTermin,
  terminPerson,
  terminTitel,
  terminZeit,
} from './hauptsache';
import { useLesefrist } from './lesefrist';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import {
  PraxisErreichen,
  Statuszeichen,
  Terminzeile,
  Wunschzeile,
  Zurueckziehen,
} from './Terminbausteine';
import {
  artUndPerson,
  artzeichen,
  heroEtikett,
  leereTage,
  tagDerWoche,
  terminZustand,
} from './termintexte';
import { terminBeschreibung } from './terminbeschreibung';
import { tageAb, uebungstageAm } from './uebungstage';
import { WUENSCHE_OHNE_NETZ } from './wunschtexte';
import { kalendertag, kuenftig, uhrzeit } from './zeit';

/**
 * Reiter „Termine“: der nächste Termin als Hero-Karte (ANN-772), darunter die übrigen, die Wünsche,
 * die Woche und das Vergangene. Ein Wunsch steht als „angefragt“, nie wie ein Termin (§8); gezeigt
 * wird nur, was der Server über den Zugang liefert, die Belegung anderer Personen nirgends.
 */
export function Termine({ zugang }: { zugang: Plattformzugang }) {
  const verbunden = useIstVerbunden();
  const rechner = useRechner();
  const [suche] = useSearchParams();
  const gesendet = useEinmaligeRueckmeldung('gesendet');
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => ladeWuensche(zugang.access_id),
  });
  // Die Übungstage neben den Terminen. Lädt der Plan nicht, bleiben die Termine - die Woche fehlt
  // dann einfach.
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });
  const { lesefrist, abo } = useLesefrist(zugang);
  // Ohne Antwort des Servers bleibt das Skelett, auch ohne Netz: Wie auf der Übersicht sagt die
  // Verbindungszeile, was fehlt, darunter steht der Weg zur Praxis (ANN-780).
  const laedt =
    (termine.data === undefined && !termine.isError) ||
    (abo.isPending && abo.fetchStatus === 'fetching');
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  // In der Lesefrist weder Wunsch noch Woche, das Vergangene offen (ANN-774).
  const wuenschen = !lesefrist;
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
        // Der Satz zu neuen Terminen steht hier statt im Kopf, der höchstens eine Zeile trägt.
        <Statusmeldung ton="warnung" className={rechner ? 'max-w-spalte' : ''}>
          <span>{satz}</span>{' '}
          <span>Neue Termine vereinbaren Sie bei Bedarf direkt mit der Praxis.</span>
        </Statusmeldung>
      ) : null}
      <PageHeader title="Termine" stufe="seite" />
      {gesendet === '1' ? (
        // Über zwei Spalten reicht sie über beide, sonst so breit wie die eine.
        <Rueckmeldung
          className={teile?.zweispaltig ? ZWEI_SPALTEN.breite : rechner ? 'max-w-spalte' : ''}
        >
          Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.
        </Rueckmeldung>
      ) : null}
      {laedt ? (
        <>
          <Ladezustand rechner={rechner} />
          {verbunden ? null : (
            <PraxisErreichen
              zugang={zugang}
              mit={mit}
              lesefrist={lesefrist}
              className={rechner ? 'max-w-spalte' : ''}
            />
          )}
        </>
      ) : termine.data === undefined || teile === undefined ? (
        // Ohne Termine bleibt der Wunsch möglich - der Satz sagt es.
        <div className={`flex flex-col ${rechner ? 'max-w-spalte gap-12' : 'gap-10'}`}>
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
          <PraxisErreichen zugang={zugang} mit={mit} lesefrist={lesefrist} />
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
            mit={mit}
          />
        </>
      )}
    </div>
  );
}

/**
 * Zwei Spalten am Rechner (ANN-775), gemessen in rem, also mit der Schrift: Reicht die Breite für
 * die Listen nicht (1024 px mit „Sehr groß“), stehen beide untereinander, Hero und Knopf zuerst.
 * `breite` gilt für, was über beiden steht.
 */
const ZWEI_SPALTEN = {
  raster:
    'max-w-spalte flex flex-col gap-12 @terminspalten:grid @terminspalten:max-w-none @terminspalten:grid-cols-[minmax(var(--container-terminliste-min),1fr)_minmax(var(--container-vorschau-min),var(--container-vorschau))] @terminspalten:items-start',
  rechts: '@terminspalten:col-start-2 @terminspalten:row-start-1',
  links: '@terminspalten:col-start-1 @terminspalten:row-start-1',
  breite: 'max-w-spalte @terminspalten:max-w-none',
};

/** Nach Beginn, die Reihenfolge des Servers ist keine Zusage. */
function nachBeginn(a: Termin, b: Termin): number {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

/**
 * Was die Liste zeigt. Zwei Spalten nur mit einem nächsten Termin und etwas für links, sonst stünde
 * die Hero-Karte neben einer leeren Hälfte.
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
    // Nur ein Wunsch, noch kein Termin: Die Hauptsache ist erledigt.
    nurWunsch: !naechster && sichtbar.some((w) => w.status === 'open' && w.kind === 'new'),
    zweispaltig: zweiSpaltenMoeglich && naechster !== undefined && links,
  };
}

/** Zeigt „Diese Woche“ etwas? Ohne Übungstage nicht (`DieseWoche`). */
function hatWoche(plaene: EigenePlaene | undefined): boolean {
  return plaene?.plans.some((p) => p.weekdays.length > 0) ?? false;
}

/**
 * Die geladene Liste, am Rechner in zwei Spalten nach `aufteilen`. Ein `Section` trägt den Abstand
 * zum Vorgänger selbst; in Stapeln mit `gap` steht er allein in seinem Block, sonst zählte der
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
  mit: (pfad: string) => string;
}) {
  const bereich = zugang.relationship_kind;
  const vertretung = zugang.access_kind !== 'self';
  const { naechster, weitere, vergangene, sichtbar, nurWunsch, zweispaltig } = teile;
  // Ohne Netz sagt ein Satz, warum Wünschen und Zurückziehen gesperrt sind - einmal, unter dem
  // Knopf oder, fehlt er, unter den Wünschen (ANN-773).
  const ohneNetzId = useId();
  // Jede Zeile führt zur Seite ihres Termins, auch eine vergangene oder abgesagte (ANN-776).
  const zielVon = (t: Termin) => mit(`${PLATTFORM_PFAD}/termine/${t.id}`);

  const offenerWunsch = naechster ? terminZustand(naechster) : null;
  const knopf = lesefrist ? null : (
    <Wunschknopf
      pfad={mit(`${PLATTFORM_PFAD}/termine/wunsch`)}
      verbunden={verbunden}
      zweit={nurWunsch}
      breit={!rechner || zweispaltig}
      satzId={ohneNetzId}
    />
  );
  // Ohne Termin ist „Termin wünschen“ der Weg des Leerzustands, gleich unter seinem Satz (ANN-803).
  const knopfImLeerzustand = !naechster && !nurWunsch && !lesefrist;
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
      zustand={offenerWunsch ? <Statuszeichen {...offenerWunsch} /> : undefined}
      person={personDesTermins(naechster, vertretung)}
      ziel={{ text: 'Termin ansehen', to: zielVon(naechster) }}
    />
  ) : nurWunsch ? (
    // Der Wunsch ist gesendet: die Uhr auf der Vertiefung statt des Laufrads.
    <EmptyState
      markenform
      zeichen={<Terminsymbol zeichen="uhr" />}
      title="Ihr Wunsch ist bei der Praxis."
      description="Sie meldet sich bei Ihnen. Danach steht Ihr Termin hier."
    />
  ) : lesefrist ? null : (
    <EmptyState
      markenform
      title="Zurzeit ist kein Termin vereinbart."
      description="Über „Termin wünschen“ sagen Sie der Praxis, wann es Ihnen passt."
      aktion={knopf}
    />
  );
  // Sind alle kommenden abgesagt, gibt es keinen „weiteren“.
  const weitereTitel = naechster
    ? 'Weitere Termine'
    : weitere.every((t) => t.status === 'cancelled')
      ? 'Abgesagte Termine'
      : 'Kommende Termine';
  const offeneWuensche = sichtbar.some((w) => w.status === 'open');
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
                  w.status === 'open' ? (
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
  // In der Lesefrist ist nichts mehr zu üben.
  const woche =
    plaene && !lesefrist ? (
      <DieseWoche termine={termine} plaene={plaene} bereich={bereich} />
    ) : null;
  const vergangenAbschnitt =
    vergangene.length === 0 ? null : lesefrist ? (
      // In der Lesefrist ist das Vergangene der Inhalt, nicht der Rest.
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
      // Vergangenes auf Abruf: Es wird mit jeder Behandlung länger (DESIGN.md, Regel 6). Den
      // Abstand davor trägt der Stapel (`gap`), nicht der Aufklapper.
      <div className="[&>details]:mt-0">
        <Disclosure summary="Vergangene Termine" anzahl={vergangene.length} kopf="betont">
          <Terminliste name="Vergangene Termine">
            {vergangene.map((t) => (
              <Terminzeile key={t.id} termin={t} bereich={bereich} to={zielVon(t)} jetzt={jetzt} />
            ))}
          </Terminliste>
        </Disclosure>
      </div>
    );

  if (zweispaltig) {
    // Im Baum zuerst Hero und Knopf: Vorlesesoftware hört die Hauptsache vor den Listen.
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
  // Am Telefon steht der Knopf unter den kommenden Terminen, mit dem Daumen erreichbar; ist schon
  // ein Wunsch unterwegs, unter den Wünschen.
  return (
    <div className={`flex flex-col ${rechner ? 'max-w-spalte gap-12' : 'gap-10'}`}>
      {hauptsache}
      {/* Vor dem Vergangenen, ohne Rollen erreichbar: Der Satz der Lesefrist verweist hierher. */}
      {lesefrist ? <PraxisErreichen zugang={zugang} mit={mit} lesefrist /> : null}
      {weitereAbschnitt}
      {nurWunsch || knopfImLeerzustand ? null : knopf}
      {wuenscheAbschnitt}
      {nurWunsch ? knopf : null}
      {woche}
      {vergangenAbschnitt}
    </div>
  );
}

/** Wer kommt und wohin: zu Hause die Anschrift, in der Praxis der Standort, im Video kein Ort. */
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
 * „Termin wünschen“, der eine Hauptknopf; ist schon ein Wunsch unterwegs und kein Termin da, der
 * Zweitknopf. Ohne Netz gesperrt wie die Übungstage, der Satz darunter sagt, wann es geht
 * (ANN-773).
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
 * „Diese Woche“: heute und die sechs Tage danach, nur die Tage mit etwas, die leeren zusammen in
 * einer Zeile. Ein Übungstag, an dem geübt wurde, trägt „geübt“; keine Serie, keine Quote, denn die
 * Plattform bleibt ruhig (PLATTFORM.md).
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
 * Zeile der Woche: links der Tag, rechts der Inhalt. Unter 23rem und bei „Sehr groß“ steht der Tag
 * über dem Inhalt, sonst bräche „Übungstag“ im Wort (ANN-777).
 */
const WOCHENZEILE =
  'grid min-h-14 grid-cols-[var(--spacing-tagesspalte)_minmax(0,1fr)] items-start gap-3 px-4 py-3 hyphens-manual max-[23rem]:grid-cols-1 max-[23rem]:gap-1 max-[23rem]:px-3 [[data-schrift=sehr-gross]_&]:grid-cols-1 [[data-schrift=sehr-gross]_&]:gap-1';

/**
 * Ein Eintrag der Woche: Zeichen 20 in der Hauptfarbe, daneben der Text. Unter 23rem steht das
 * Zeichen darüber wie an den Karten: Daneben blieben bei 200 % nur 110 px, zu knapp für
 * „Heimübungen“.
 */
function Eintrag({ zeichen, children }: { zeichen: Terminzeichen; children: string }) {
  return (
    <span className="flex items-start gap-2 max-[23rem]:flex-col max-[23rem]:gap-1">
      <Terminsymbol zeichen={zeichen} className="text-accent mt-0.5 size-5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

/**
 * Das Skelett in der Form der Liste, der Knopf nur als Fläche: Bedienbar wäre er eine Zusage, die
 * das Laden noch nicht hält. Für Vorlesesoftware „Termine werden geladen“.
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
          {liste}
          <Skelett form="hauptknopf" />
        </div>
      )}
    </SkelettBereich>
  );
}
