import { useQuery } from '@tanstack/react-query';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Aufgabenkarte } from '@/components/ui/Aufgabenkarte';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { HeroKarte } from '@/components/ui/HeroKarte';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Personenbild } from '@/components/ui/Personenbild';
import { NachladeHinweis, Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { mitRueckweg } from '@/lib/rueckweg';
import { nurFragen } from '@/lib/erfassungsgroessen';
import {
  aboSchluessel,
  befundbogenSchluessel,
  benachrichtigungSchluessel,
  checkinsSchluessel,
  ernaehrungSchluessel,
  gewohnheitenSchluessel,
  nachrichtenSchluessel,
  paketeSchluessel,
  plaeneSchluessel,
  rechnungenSchluessel,
  trainingsangebotSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  ladeAbo,
  ladeBefundbogen,
  ladeBenachrichtigungen,
  ladeCheckins,
  ladeErnaehrung,
  ladeGewohnheiten,
  ladeMeinePakete,
  ladeNachrichten,
  ladePlaene,
  ladeRechnungen,
  ladeTermine,
  ladeTrainingsangebot,
  ladeWuensche,
  type Plattformzugang,
  type Termin,
} from './api';
import { Besuchskarte } from './Besuchskarte';
import { nachDemCheckin } from './checkintexte';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import { mitteilungenOffen } from './einstiegsablauf';
import {
  ersterTermin,
  handlung,
  hauptsache,
  inLesefrist,
  lesefristSatz,
  naechsterTermin,
  terminPerson,
  terminTitel,
  terminZeit,
  uebungenHeute,
  type Hauptsache,
} from './hauptsache';
import { fuerDiePlattform } from './instrumentwahl';
import { useMarkenmoment } from './markenmoment';
import { NOTRUFNUMMERN, THEMA_NAME } from './nachrichtentexte';
import { Notrufnummer } from './Notfallsatz';
import { paketStand } from './paketbedingungen';
import { BENACHRICHTIGUNGEN_ANKER, PLATTFORM_PFAD, bereichParameter } from './pfade';
import { Statuszeichen } from './Terminbausteine';
import { heroWeg, terminZustand } from './termintexte';
import { umfangSatz, umfangText } from './vorschau';
import { zahlungsstand } from './zahlungsstand';
import {
  datum,
  grussNachTageszeit,
  kuenftig,
  letzterTag,
  tagOhneJahr,
  tagUndMonat,
  zeitraumLang,
} from './zeit';

/**
 * Die Übersicht - „Was ist jetzt dran?" (POR-015, DSN-001 4.1), seit Schritt
 * 1e des Design-Reviews in der Fassung des Handoffs 2026-10-22 (5.1).
 *
 * Von oben: der Gruß nach Tageszeit mit dem eigenen Namen (N1) und dem
 * Datum; genau eine Hauptsache als Hero-Karte (`hauptsache.ts`, ANN-698,
 * statt der Liste „Jetzt dran“ aus ANN-465);
 * „Heute“ mit höchstens drei Aufgabenkarten; der nächste Besuch, wenn er
 * nicht schon die Hauptsache ist; „Neu für Sie“ als Liste - Antworten der
 * Praxis, ein Angebot, eine offene Rechnung. Antwort und Rechnung werden nie
 * Hauptsache: keine Dringlichkeit aus Geld. Abschnitte ohne Eintrag
 * entfallen; keine Kennzahlen (IDEA-ORG-001). Der Notfallhinweis steht nicht
 * mehr hier, sondern über jedem Feld für Nachrichten (Entscheidung 4).
 *
 * Training: die nächste Einheit als Hauptsache, „Zwischen den Einheiten“ und
 * „Ihr Paket“. Vertretung: der Gruß gilt ihr, die Hauptsache der Person,
 * „Für {Name}“ statt „Neu für Sie“. Lesefrist: „Unterlagen sichern“ und
 * „Ihre Behandlung“.
 *
 * Alle Abfragen haben einen Zustand (DR-126): Solange eine lädt, steht das
 * Skelett der Seite; scheitert eine ohne Stand, der Fehler mit „Erneut
 * versuchen“. Ohne Netz bleibt der Stand stehen. Ab 900 px Inhaltsbreite
 * zweispaltig (Handoff, Abschnitt 4).
 *
 * Jede Zeile kommt aus der Projektion ihres Bereichs; was eine Rolle nicht
 * sehen darf, liefert der Server nicht (eine Begleitung ohne Einwilligung
 * sieht keine Rechnung).
 */
export function Uebersicht({ zugang }: { zugang: Plattformzugang }) {
  const verbunden = useIstVerbunden();
  const [suche] = useSearchParams();
  const nachCheckin = useEinmaligeRueckmeldung('checkin');
  const nachBogen = useEinmaligeRueckmeldung('bogen');
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${pfad}${bereich ? `?${bereich}` : ''}`;
  const p = (pfad: string) => mit(`${PLATTFORM_PFAD}${pfad}`);
  const id = zugang.access_id;
  const eigen = zugang.access_kind === 'self';
  const begleitung = zugang.access_kind === 'companion';
  const name = zugang.represented_name ?? 'die Person';
  const behandlung = zugang.relationship_kind === 'treatment';

  const termine = useQuery({
    queryKey: termineSchluessel(id),
    queryFn: () => ladeTermine(id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(id),
    queryFn: () => ladeWuensche(id),
  });
  const rechnungen = useQuery({
    queryKey: rechnungenSchluessel(id),
    queryFn: () => ladeRechnungen(id),
  });
  // KOM-001: eine Antwort der Praxis auf eine Nachricht (DSN-001 4.1 Punkt 5).
  const nachrichten = useQuery({
    queryKey: nachrichtenSchluessel(id),
    queryFn: () => ladeNachrichten(id),
  });
  const bogen = useQuery({
    queryKey: befundbogenSchluessel(id),
    queryFn: () => ladeBefundbogen(id),
    enabled: behandlung,
  });
  // ANG-004 (ANN-274): Nach einem Nachsorge-Abo zählt die Lesezeit vom Ende des Abos.
  const abo = useQuery({
    queryKey: aboSchluessel(id),
    queryFn: () => ladeAbo(id),
    enabled: behandlung,
  });
  // KND-003: das Angebot aus dem Abschlussgespräch. Eine Begleitung sieht es
  // nicht - der Server liefert ihr nichts (Recht contract).
  const angebot = useQuery({
    queryKey: trainingsangebotSchluessel(id),
    queryFn: () => ladeTrainingsangebot(id),
    enabled: behandlung && !begleitung,
  });
  // TRK-003: der Check-in, wenn er fällig ist. Ohne Mahnung: Verpasstes
  // zählt nicht (IDEA-TRK-004).
  const checkin = useQuery({
    queryKey: checkinsSchluessel(id),
    queryFn: () => ladeCheckins(id),
  });
  // ALT-003: laufende Gewohnheiten - ohne Zählwerk, ohne Mahnung.
  const gewohnheiten = useQuery({
    queryKey: gewohnheitenSchluessel(id),
    queryFn: () => ladeGewohnheiten(id),
  });
  // UEB-009: die Übungen für heute, im Training der Plan für zu Hause.
  const plaene = useQuery({
    queryKey: plaeneSchluessel(id),
    queryFn: () => ladePlaene(id),
  });
  // ANG-008: das eigene Paket; `null` ohne Recht billing.
  const pakete = useQuery({
    queryKey: paketeSchluessel(id),
    queryFn: () => ladeMeinePakete(id),
    enabled: !behandlung,
  });
  // Das Tagebuch einer gebuchten Beratung; eine Begleitung bekommt nichts.
  const ernaehrung = useQuery({
    queryKey: ernaehrungSchluessel(id),
    queryFn: () => ladeErnaehrung(id),
    enabled: !begleitung,
  });
  // ANN-702: ob die Person schon über Mitteilungen entschieden hat.
  const mitteilungen = useQuery({
    queryKey: benachrichtigungSchluessel(id, null),
    queryFn: () => ladeBenachrichtigungen(id, null),
  });

  // Nur, was die Übersicht hier selbst abfragt: Eine ausgeschaltete Abfrage
  // übernähme sonst den Fehler, den eine andere Seite unter demselben
  // Schlüssel hinterließ.
  const abfragen = (
    [
      [termine, true],
      [wuensche, true],
      [rechnungen, true],
      [nachrichten, true],
      [bogen, behandlung],
      [abo, behandlung],
      [angebot, behandlung && !begleitung],
      [checkin, true],
      [gewohnheiten, true],
      [plaene, true],
      [pakete, !behandlung],
      [ernaehrung, !begleitung],
      [mitteilungen, true],
    ] as const
  )
    .filter(([, an]) => an)
    .map(([abfrage]) => abfrage);
  // Ein Zustand für alle (ANN-699): Das Skelett steht, solange eine Abfrage
  // lädt. Ohne Netz wartet die Seite nur auf die Termine, wie vor Schritt 1e;
  // was sonst ohne Stand pausiert, fehlt, bis das Netz wieder da ist - die
  // Verbindungszeile sagt es.
  const laedt =
    abfragen.some((a) => a.isPending && a.fetchStatus === 'fetching') ||
    (termine.isPending && termine.fetchStatus === 'paused');
  const gescheitert = abfragen.filter((a) => a.isError && a.data === undefined);
  // Scheitert ein Nachladen, bleibt der Stand, darüber der Hinweis „veraltet“.
  const veraltet = abfragen.filter((a) => a.isError && a.data !== undefined);
  // Der Moment endet erst, wenn die Übersicht steht (ANN-680).
  const markenmoment = useMarkenmoment(!laedt);

  const jetzt = new Date();
  const alleTermine = termine.data ?? [];
  const naechster = naechsterTermin(alleTermine, jetzt);
  // Vor dem ersten Termin: kein anderer, der stattfand oder stattfinden sollte.
  const erster = naechster
    ? ersterTermin(alleTermine, naechster)
    : !alleTermine.some((t) => t.status !== 'cancelled');
  // Die Lesefrist sagt der Server, auch für Vertretungen und solange ein Abo läuft (ANN-809).
  const lesefrist = inLesefrist(zugang);
  const haupt = hauptsache({
    zugang,
    bogenId: fuerDiePlattform()[0]?.meta.id,
    boegen: bogen.data,
    checkins: checkin.data,
    plaene: plaene.data,
    naechster,
  });

  const kopf = (
    <Kopfteil
      zugang={zugang}
      abo={abo.data ?? null}
      jetzt={jetzt}
      mitName={gescheitert.length === 0}
      // Fehler: der Gruß ohne Namen und ohne Datum (Leinwand „Fehler“).
      mitDatum={gescheitert.length === 0}
    >
      {nachCheckin === '1' ? (
        <Rueckmeldung>
          <MitNotrufnummern satz={nachDemCheckin(zugang)} />
        </Rueckmeldung>
      ) : null}
      {nachBogen === '1' ? (
        <Rueckmeldung>
          Danke. Ihr Fragebogen ist bei der Praxis. Ihre Therapeut:in sieht Ihre Angaben beim
          nächsten Termin.
        </Rueckmeldung>
      ) : null}
    </Kopfteil>
  );

  // Laden und Fehler stehen am Rechner in der Spalte, nicht über die ganze
  // Breite (Design-Review 1e).
  if (gescheitert.length > 0) {
    return (
      <div className="[[data-rechner]_&]:max-w-spalte flex flex-col gap-8">
        {kopf}
        <ErrorState
          title="Die Übersicht lässt sich gerade nicht laden."
          description="Prüfen Sie die Verbindung oder versuchen Sie es gleich noch einmal."
          onErneut={() => Promise.all(gescheitert.map((a) => a.refetch()))}
        />
      </div>
    );
  }
  if (laedt) return <Ladezustand />;

  // --- Heute bzw. Zwischen den Einheiten (ANN-700) -------------------------
  const heute: Eintrag[] = [];
  if (!lesefrist) {
    const fragen = checkin.data?.schedule ? nurFragen(checkin.data.schedule.parameter_keys) : [];
    const checkinHaupt = haupt.art === 'aufgabe' && haupt.aufgabe.art === 'checkin';
    if (checkin.data?.can_answer && checkin.data.schedule && !checkinHaupt) {
      heute.push({
        schluessel: 'checkin',
        zeichen: ZEICHEN.checkin,
        titel: 'Check-in beantworten',
        satz: `${fragenText(fragen.length)}, freiwillig, etwa 1 Minute`,
        to: p('/checkin'),
      });
    } else if (
      !begleitung &&
      !checkin.data?.can_answer &&
      checkin.data?.due &&
      checkin.data.consent_needed
    ) {
      // Im Training ohne Einwilligung: der Weg dorthin, nicht der Check-in.
      heute.push({
        schluessel: 'einwilligung',
        zeichen: ZEICHEN.checkin,
        titel: 'Ihre Praxis bittet um einen Check-in',
        satz: 'Dafür braucht es Ihre Einwilligung.',
        to: p('/einwilligungen'),
      });
    }
    if (behandlung) {
      const uebungen = uebungenHeute(plaene.data);
      const uebungenHaupt = haupt.art === 'aufgabe' && haupt.aufgabe.art === 'uebungen';
      if (uebungen && !uebungenHaupt) {
        heute.push({
          schluessel: 'uebungen',
          zeichen: ZEICHEN.uebungen,
          titel: eigen ? 'Ihre Übungen für heute' : 'Übungen für heute',
          satz: uebungenText(uebungen, verbunden),
          to: mit(handlung(uebungen).pfad),
        });
      }
    } else {
      const zuHause = (plaene.data?.plans ?? []).filter((plan) => plan.status === 'assigned');
      if (zuHause.length > 0) {
        heute.push({
          schluessel: 'plan',
          zeichen: ZEICHEN.uebungen,
          titel: eigen ? 'Ihr Plan für zu Hause' : 'Plan für zu Hause',
          satz: umfangText(zuHause.flatMap((plan) => plan.items)),
          to: p('/uebungen'),
        });
      }
    }
    const laufend = (gewohnheiten.data?.habits ?? []).filter(
      (g) => g.ended_at === null && !g.paused,
    );
    if (laufend.length > 0) {
      heute.push({
        schluessel: 'gewohnheit',
        zeichen: ZEICHEN.gewohnheit,
        titel:
          laufend.length === 1 ? 'Eine kleine Gewohnheit' : `${laufend.length} kleine Gewohnheiten`,
        satz: laufend.map((g) => g.action).join(' · '),
        to: p('/gewohnheiten'),
      });
    }
    const beratung = ernaehrung.data;
    if (
      beratung?.can_write &&
      beratung.profile.ended_on === null &&
      beratung.profile.diary_enabled
    ) {
      heute.push({
        schluessel: 'tagebuch',
        zeichen: ZEICHEN.tagebuch,
        // Weiche Trennstelle: Bei „Sehr groß“ brach das Wort sonst vor dem „h“.
        titel: 'Ernährungs\u00ADtagebuch',
        satz: 'Mahlzeit eintragen',
        // Der Rückweg reist mit und heißt im Tagebuch dann „Übersicht“ (ANN-779).
        to: mitRueckweg(p('/ernaehrung/tagebuch'), mit(PLATTFORM_PFAD)),
      });
    }
    // Wer im Einstieg nichts gewählt hat (etwa mit „Später“), findet hier den
    // Weg dorthin - bis zur ersten Wahl (ANN-702). Immer zuletzt.
    if (mitteilungenOffen(mitteilungen.data ?? null)) {
      heute.push({
        schluessel: 'mitteilungen',
        zeichen: ZEICHEN.mitteilungen,
        titel: 'Mitteilungen einschalten',
        satz: 'Am Vortag eines Termins oder wenn die Praxis antwortet',
        to: `${p('/einstellungen')}#${BENACHRICHTIGUNGEN_ANKER}`,
      });
    }
  }

  // --- Neu für Sie bzw. Für {Name} ------------------------------------------
  const neu: ReactNode[] = [];
  if (angebot.data) {
    neu.push(
      <ListRow
        key="angebot"
        to={p('/angebot')}
        titel="Training nach der Behandlung"
        meta={`${angebot.data.label} · Angebot der Praxis, gilt bis ${datum(angebot.data.valid_until)}`}
      />,
    );
  }
  // Eine Antwort der Praxis auf einen Wunsch, jünger als 14 Tage (DSN-001 4.1 Punkt 5).
  const grenze = jetzt.getTime() - 14 * 24 * 60 * 60 * 1000;
  const antwort = (wuensche.data ?? []).find(
    (w) =>
      (w.status === 'done' || w.status === 'declined') &&
      w.resolved_at !== null &&
      new Date(w.resolved_at).getTime() > grenze,
  );
  const offenerWunsch = (wuensche.data ?? []).find((w) => w.status === 'open');
  if (antwort) {
    // Jede Antwort nach ihrem Bezug benannt: Zwei Zeilen „Antwort der
    // Praxis“ untereinander hielt man für eine (Persona-Review 1e).
    const satz = antwort.status === 'done' ? 'Erledigt' : 'Leider nicht möglich';
    neu.push(
      <ListRow
        key="wunsch"
        to={p('/termine')}
        titel="Antwort auf Ihren Terminwunsch"
        meta={antwort.answer ? `${satz}: ${antwort.answer}` : `${satz}.`}
      />,
    );
  } else if (offenerWunsch) {
    neu.push(
      <ListRow
        key="wunsch"
        to={p('/termine')}
        titel="Terminwunsch angefragt"
        meta={`Am ${formatDate(offenerWunsch.created_at.slice(0, 10))} · Die Praxis meldet sich bei Ihnen.`}
      />,
    );
  }
  const beantwortet = (nachrichten.data?.messages ?? []).filter((m) => m.status === 'answered');
  if (beantwortet.length > 0) {
    neu.push(
      <ListRow
        key="nachrichten"
        to={p(beantwortet.length === 1 ? `/nachrichten/${beantwortet[0]!.id}` : '/nachrichten')}
        titel={
          beantwortet.length === 1
            ? 'Antwort auf Ihre Nachricht'
            : `Antworten auf ${beantwortet.length} Nachrichten`
        }
        meta={`Thema: ${[...new Set(beantwortet.map((m) => THEMA_NAME[m.topic]))].join(' · ')}`}
      />,
    );
  }
  const offeneRechnung = (rechnungen.data ?? []).find(
    (r) => !r.cancelled && r.outstanding_cents > 0,
  );
  if (offeneRechnung) {
    // Keine Dringlichkeit aus Geld: Vor der Fälligkeit ohne Warnzeichen
    // (ANN-701); überfällig sagt es die Rechnungsliste ebenso.
    const stand = zahlungsstand(offeneRechnung);
    const ton = offeneRechnung.overdue ? stand.ton : 'neutral';
    neu.push(
      <ListRow
        key="rechnung"
        to={p(`/rechnungen/${offeneRechnung.id}`)}
        titel={`Rechnung ${offeneRechnung.invoice_number}`}
        meta={`Fällig am ${formatDate(offeneRechnung.due_on)}`}
        betrag={formatEuro(offeneRechnung.outstanding_cents, offeneRechnung.currency)}
        status={<Badge ton={ton}>{stand.wort}</Badge>}
      />,
    );
  }

  // --- Die Spalten ------------------------------------------------------------
  // Links Hauptsache und „Heute“, rechts Besuch, Paket und „Neu für Sie“; am
  // Telefon untereinander in dieser Reihenfolge (Handoff, Abschnitt 4).
  let folge = 0;
  const teil = (inhalt: ReactNode, schluessel: string) => (
    <div
      key={schluessel}
      className="markenmoment-folge"
      style={{ '--folge': ++folge } as CSSProperties}
    >
      {inhalt}
    </div>
  );

  const links: ReactNode[] = [
    <Hauptsachekarte
      key="hauptsache"
      haupt={haupt}
      zugang={zugang}
      naechster={naechster}
      erster={erster}
      jetzt={jetzt}
      verbunden={verbunden}
      mit={mit}
      markenmoment={markenmoment}
    />,
  ];
  if (heute.length > 0) {
    links.push(
      teil(
        <Heute titel={behandlung ? 'Heute' : 'Zwischen den Einheiten'} eintraege={heute} />,
        'heute',
      ),
    );
  }

  const rechts: ReactNode[] = [];
  if (lesefrist) {
    const zeitraum = vergangen(alleTermine, jetzt);
    if (zeitraum) {
      rechts.push(
        teil(
          <Section
            titel={
              behandlung
                ? `${eigen ? 'Ihre' : 'Die'} Behandlung`
                : `${eigen ? 'Ihr' : 'Das'} Training`
            }
            rahmen
          >
            <Rueckblick {...zeitraum} />
          </Section>,
          'rueckblick',
        ),
      );
    }
  } else if (naechster && haupt.art !== 'termin') {
    rechts.push(
      teil(
        <Section titel={erster ? 'Ihr erster Besuch' : 'Nächster Besuch'}>
          {/* Wie der Hero: zur Seite des Termins. */}
          <Besuchskarte termin={naechster} to={zumTermin(naechster.id, mit)} />
        </Section>,
        'besuch',
      ),
    );
  }
  const paket = (pakete.data ?? []).find((k) => k.state !== 'ended');
  if (paket) {
    rechts.push(
      teil(
        <Section titel="Ihr Paket">
          <ListRows rahmen>
            <ListRow
              to={p('/paket')}
              titel={paket.label}
              meta={`${paketStand(paket)} ${formatEuro(paket.price_cents, paket.currency)}, einmal zu Beginn berechnet.`}
            />
          </ListRows>
        </Section>,
        'paket',
      ),
    );
  }
  if (neu.length > 0) {
    const titel = eigen ? 'Neu für Sie' : `Für ${name}`;
    rechts.push(
      teil(
        <Section titel={titel}>
          <ListRows rahmen beschriftung={titel}>
            {neu}
          </ListRows>
        </Section>,
        'neu',
      ),
    );
  }
  // Was eine Vertretung hier darf (ADR-023 Punkt 13), als Kleingedrucktes am Ende unter beiden
  // Spalten. In der Lesefrist weist der Server auch Wünsche und Nachrichten der Begleitung
  // ab (ANN-809).
  const rechte =
    zugang.access_kind === 'legal_representative'
      ? `Als rechtliche Vertretung handeln Sie in allem, was ${name} hier tun kann.`
      : begleitung
        ? `Als Begleitung lesen Sie mit${lesefrist ? '' : ' und können Terminwünsche und Nachrichten schreiben'}. Einwilligungen gibt nur ${name} selbst.`
        : null;

  const spalte = 'flex min-w-0 flex-col gap-10 [[data-rechner]_&]:gap-12';
  // Markenmoment B statt Startbild (ANN-680): beim ersten Erscheinen je Tab
  // kommen Gruß und Abschnitte gestaffelt (`index.css`).
  return (
    <div
      className={`flex flex-col gap-10 [[data-rechner]_&]:gap-12 ${markenmoment ? 'markenmoment' : ''}`.trim()}
    >
      {kopf}
      {veraltet.length > 0 ? (
        <NachladeHinweis
          laeuft={veraltet.some((a) => a.isFetching)}
          onErneut={() => void Promise.all(veraltet.map((a) => a.refetch()))}
        />
      ) : null}
      {rechts.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] items-start gap-10 [[data-rechner]_&]:gap-12">
          <div className={spalte}>{links}</div>
          <div className={spalte}>{rechts}</div>
        </div>
      ) : (
        <div className={`${spalte} [[data-rechner]_&]:max-w-spalte`}>{links}</div>
      )}
      {rechte ? teil(<Kleingedrucktes>{rechte}</Kleingedrucktes>, 'rechte') : null}
    </div>
  );
}

/**
 * Gruß und Datum, darüber eine Statusmeldung der Lesefrist oder des Endes
 * einer Vertretung, darunter einmalige Rückmeldungen.
 */
function Kopfteil({
  zugang,
  abo,
  jetzt,
  mitName,
  mitDatum,
  children,
}: {
  zugang: Plattformzugang;
  abo: { state: string; ends_on: string | null } | null;
  jetzt: Date;
  mitName: boolean;
  mitDatum: boolean;
  children: ReactNode;
}) {
  const name = zugang.represented_name ?? 'die Person';
  // Eine Vertretung hat außerhalb der Lesefrist ihr eigenes Ende, etwa die Volljährigkeit.
  const eigenesEnde = zugang.access_kind !== 'self' && !inLesefrist(zugang);
  return (
    <div className="markenmoment-gruss flex flex-col gap-6">
      {zugang.read_until ? (
        <Statusmeldung ton="warnung">
          {eigenesEnde
            ? `Ihr Zugang für ${name} endet am ${datum(zugang.read_until)}.`
            : lesefristSatz(zugang, abo)}
        </Statusmeldung>
      ) : null}
      <Gruss name={mitName ? zugang.own_name : null} jetzt={jetzt} mitDatum={mitDatum} />
      {children}
    </div>
  );
}

/**
 * Der Gruß als `h1` (Handoff 2026-10-22, 5.1): „Guten Morgen,“ und in eigener
 * Zeile der Name; ohne Namen „Guten Tag“ ohne Komma. Darunter das Datum.
 * Unter 23rem in der Größe des Seitentitels, ein langer Name in 22 - brechen
 * darf er nur am Bindestrich (ANN-696).
 */
function Gruss({ name, jetzt, mitDatum }: { name: string | null; jetzt: Date; mitDatum: boolean }) {
  const gruss = grussNachTageszeit(jetzt);
  const eigener = name?.trim() || null;
  return (
    <PageHeader
      stufe="gruss"
      title={eigener ? `${gruss},\n${eigener}` : gruss}
      // Als Element: ein Text würde gekürzt und hinter „Mehr“ gestellt (DR-122).
      description={mitDatum ? <span>{tagOhneJahr(jetzt.toISOString())}</span> : undefined}
    />
  );
}

/**
 * Die Hauptsache als Hero-Karte, die ganze Karte als Ziel (ANN-817); gibt es keine, der
 * Leerzustand mit Markenform.
 */
function Hauptsachekarte({
  haupt,
  zugang,
  naechster,
  erster,
  jetzt,
  verbunden,
  mit,
  markenmoment,
}: {
  haupt: Hauptsache;
  zugang: Plattformzugang;
  naechster: Termin | undefined;
  erster: boolean;
  jetzt: Date;
  verbunden: boolean;
  mit: (pfad: string) => string;
  markenmoment: boolean;
}) {
  const vertretung = zugang.access_kind !== 'self';
  switch (haupt.art) {
    case 'unterlagen':
      return (
        <HeroKarte
          titel="Unterlagen sichern"
          // `read_until` ist die Mitternacht nach dem letzten Tag. Rechnungen sieht eine Vertretung
          // nur mit dem Recht `billing` (`app.platform_access_allows`): für sie „Die Unterlagen“.
          satz={`${vertretung ? 'Die Unterlagen' : 'Rechnungen und Dokumente'} können Sie bis ${tagUndMonat(letzterTag(haupt.bis), jetzt)} herunterladen.`}
          aktion={{ text: 'Unterlagen ansehen', to: `${PLATTFORM_PFAD}/ich` }}
          ganzeKarte
          markenmoment={markenmoment}
        />
      );
    case 'termin': {
      const t = haupt.termin;
      const zeile = terminPerson(t, vertretung);
      // Ein offener Änderungs- oder Absagewunsch steht an der Karte wie in der Liste (ANN-772).
      const offenerWunsch = terminZustand(t);
      return (
        <HeroKarte
          titel={terminTitel(
            t,
            zugang.relationship_kind,
            vertretung ? zugang.represented_name : null,
            jetzt,
          )}
          satz={terminZeit(t, vertretung, jetzt)}
          zustand={offenerWunsch ? <Statuszeichen {...offenerWunsch} /> : undefined}
          person={t.staff_name && zeile ? { name: t.staff_name, zeile } : undefined}
          // Zur Seite des Termins; ihr Rückweg heißt dann „Übersicht“ (ANN-779).
          aktion={{
            text: heroWeg(t, inLesefrist(zugang), jetzt),
            to: zumTermin(t.id, mit),
          }}
          ganzeKarte
          markenmoment={markenmoment}
        />
      );
    }
    case 'aufgabe': {
      const a = haupt.aufgabe;
      const knopf = handlung(a);
      const aktion = { text: knopf.text, to: mit(knopf.pfad) };
      // Für eine Vertretung die Aufgabe der Person, nicht die eigene (5.1).
      const fuer = vertretung ? zugang.represented_name : null;
      const welcher = erster ? 'ersten' : 'nächsten';
      if (a.art === 'fragebogen') {
        const wer = naechster?.staff_name ?? (fuer ? 'Die Therapeut:in' : 'Ihre Therapeut:in');
        return (
          <HeroKarte
            titel={fuer ? `Fragebogen für ${fuer}` : `Fragebogen vor Ihrem ${welcher} Termin`}
            satz={`Etwa 10 Minuten. ${wer} sieht ${fuer ? 'die' : 'Ihre'} Angaben beim ${welcher} Termin.`}
            aktion={aktion}
            ganzeKarte
            markenmoment={markenmoment}
          />
        );
      }
      if (a.art === 'checkin') {
        return (
          <HeroKarte
            titel={fuer ? `Check-in für ${fuer}` : 'Ihr Check-in für heute'}
            satz={`${fragenText(a.fragen)}, freiwillig, etwa 1 Minute.`}
            aktion={aktion}
            ganzeKarte
            markenmoment={markenmoment}
          />
        );
      }
      return (
        <HeroKarte
          titel={fuer ? `Übungen für ${fuer}` : 'Ihre Übungen für heute'}
          satz={uebungenText(a, verbunden)}
          aktion={aktion}
          ganzeKarte
          markenmoment={markenmoment}
        />
      );
    }
    case 'nichts':
      // Im Markenmoment läuft der Leerzustand ein wie sonst die Hero-Karte.
      return (
        <div className={markenmoment ? 'hero-erscheint' : undefined}>
          <EmptyState
            markenform
            inKarte
            title="Gerade ist nichts zu tun."
            description="Zurzeit ist kein Termin vereinbart."
          />
        </div>
      );
  }
}

interface Eintrag {
  schluessel: string;
  zeichen: ReactNode;
  titel: string;
  satz: string;
  to: string;
}

/**
 * „Heute“ bzw. „Zwischen den Einheiten“: höchstens drei Aufgabenkarten, alles
 * Weitere als Zeile (PLATTFORM.md).
 */
function Heute({ titel, eintraege }: { titel: string; eintraege: Eintrag[] }) {
  const karten = eintraege.slice(0, 3);
  const zeilen = eintraege.filter((e) => !karten.includes(e));
  return (
    <Section titel={titel}>
      <div className="flex flex-col gap-4">
        {karten.map((e) => (
          <Aufgabenkarte
            key={e.schluessel}
            zeichen={e.zeichen}
            titel={e.titel}
            satz={e.satz}
            to={e.to}
          />
        ))}
        {zeilen.length > 0 ? (
          <ListRows rahmen>
            {zeilen.map((e) => (
              <ListRow key={e.schluessel} titel={e.titel} meta={e.satz} to={e.to} />
            ))}
          </ListRows>
        ) : null}
      </div>
    </Section>
  );
}

/**
 * „Ihre Behandlung“ in der Lesefrist: mit wem und von wann bis wann - eine
 * Auskunft im Rahmen des Abschnitts, keine Karte zum Antippen. Unter 23rem
 * das Bild über dem Text.
 */
function Rueckblick({
  person,
  von,
  bis,
}: {
  person: string | null;
  von: string | null;
  bis: string;
}) {
  return (
    <p className="flex items-center gap-4 hyphens-manual max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2">
      {person ? <Personenbild name={person} farbe={null} groesse="karte" /> : null}
      <span className="flex min-w-0 flex-col">
        {person ? <span className="font-semibold">Mit {person}</span> : null}{' '}
        <span className="text-ink-muted">
          {von ? zeitraumLang(von, bis) : `bis ${zeitraumLang(bis, bis)}`}
        </span>
      </span>
    </p>
  );
}

/**
 * Erster und letzter Termin, der stattfand, und wer zuletzt kam. Die
 * Termine reichen zwölf Monate zurück (ANN-251): Liegt der erste nahe an
 * diesem Rand, kann es frühere geben - dann nur „bis …“.
 */
function vergangen(
  termine: readonly Termin[],
  jetzt: Date,
): { person: string | null; von: string | null; bis: string } | null {
  const liste = termine
    .filter((t) => t.status !== 'cancelled' && !kuenftig(t.starts_at, jetzt))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const erster = liste[0];
  const letzter = liste.at(-1);
  if (!erster || !letzter) return null;
  const rand = jetzt.getTime() - 330 * 24 * 60 * 60 * 1000;
  const von = new Date(erster.starts_at).getTime() > rand ? erster.starts_at : null;
  return { person: letzter.staff_name, von, bis: letzter.starts_at };
}

function fragenText(anzahl: number): string {
  return anzahl === 1 ? 'Eine kurze Frage' : `${anzahl} kurze Fragen`;
}

/**
 * Der Satz nach dem Check-in mit 112 und 116117 zum Antippen (Handoff 5.1). Der Satz bleibt die
 * Konstante; Link wird nur eine Nummer aus `NOTRUFNUMMERN`, wie im `Notfallsatz`.
 */
function MitNotrufnummern({ satz }: { satz: string }) {
  return satz
    .split(/(\d+)/)
    .map((teil, index) =>
      istNotrufnummer(teil) ? (
        <Notrufnummer key={index} nummer={teil} />
      ) : (
        <Fragment key={index}>{teil}</Fragment>
      ),
    );
}

function istNotrufnummer(teil: string): teil is (typeof NOTRUFNUMMERN)[number] {
  return (NOTRUFNUMMERN as readonly string[]).includes(teil);
}

/**
 * „3 Übungen · etwa 10 Minuten“ wie die Vorschau im Reiter (Handoff
 * 2026-10-24, Abschnitt 9 Punkt 3; ANN-704). Die Pläne liegen auf dem Gerät
 * (`PlattformAblage`): Ohne Netz geht es trotzdem, und die Karte sagt es -
 * ANN-727: hinter dem Umfang, nicht an seiner Stelle.
 */
function uebungenText(
  aufgabe: { uebungen: number; minuten: number | null },
  verbunden: boolean,
): string {
  const umfang = umfangSatz(aufgabe.uebungen, aufgabe.minuten);
  return verbunden ? umfang : `${umfang}. Geht auch ohne Netz.`;
}

/**
 * Das Skelett der Übersicht (Leinwand „Laden“, DR-126): zwei Zeilen Gruß und
 * das Datum, die Hero-Karte, ein Abschnitt mit Aufgabenkarte und einer mit
 * Besuchskarte. Für Vorlesesoftware „Übersicht wird geladen“.
 */
function Ladezustand() {
  return (
    <SkelettBereich
      beschriftung="Übersicht wird geladen"
      className="[[data-rechner]_&]:max-w-spalte flex flex-col gap-10"
    >
      <span className="flex flex-col gap-2">
        <Skelett form="gruss" className="w-60 max-w-full" />
        <Skelett form="gruss" className="w-47.5 max-w-full" />
        <Skelett form="zeile" className="mt-2 w-50 max-w-full" />
      </span>
      <Skelett form="hero" />
      <span className="flex flex-col gap-4">
        <Skelett form="titel" className="w-22.5" />
        <Skelett form="karte" />
      </span>
      <span className="flex flex-col gap-4">
        <Skelett form="titel" className="w-37.5" />
        <Skelett form="besuch" />
      </span>
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

/** Die Zeichen der Aufgabenkarten (Raster 24, Strich 2; Leinwand „Übersicht“). */
const ZEICHEN = {
  gewohnheit: (
    <svg {...SVG}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M9 2h6" />
    </svg>
  ),
  uebungen: (
    <svg {...SVG}>
      <path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11" />
    </svg>
  ),
  tagebuch: (
    <svg {...SVG}>
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" />
      <path d="M9 9h5M9 13h5M18 8h1.5M18 12h1.5" />
    </svg>
  ),
  checkin: (
    <svg {...SVG}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 13l2 2 4-4" />
    </svg>
  ),
  mitteilungen: (
    <svg {...SVG}>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </svg>
  ),
};

/**
 * Die Seite des Termins von der Übersicht aus: Der Rückweg reist mit, wie überall in der App, und
 * heißt dann „Übersicht“ (ANN-779).
 */
function zumTermin(terminId: string, mit: (pfad: string) => string): string {
  return mitRueckweg(mit(`${PLATTFORM_PFAD}/termine/${terminId}`), mit(PLATTFORM_PFAD));
}
