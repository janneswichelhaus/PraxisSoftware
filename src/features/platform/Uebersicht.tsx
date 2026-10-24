import { useQuery } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';
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
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { nurFragen } from '@/lib/erfassungsgroessen';
import {
  aboSchluessel,
  befundbogenSchluessel,
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
  type Plattformzugang,
  type Termin,
} from './api';
import { Besuchskarte } from './Besuchskarte';
import { useNurLesen, usePlattformApi } from './einsicht';
import { nachDemCheckin } from './checkintexte';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import {
  ersterTermin,
  handlung,
  hauptsache,
  inLesefrist,
  naechsterTermin,
  terminPerson,
  terminTitel,
  terminZeit,
  uebungenHeute,
  type Hauptsache,
} from './hauptsache';
import { fuerDiePlattform } from './instrumentwahl';
import { useMarkenmoment } from './markenmoment';
import { THEMA_NAME } from './nachrichtentexte';
import { paketStand } from './paketbedingungen';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { zahlungsstand } from './zahlungsstand';
import {
  datum,
  grussNachTageszeit,
  kuenftig,
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
export function Uebersicht({
  zugang,
  einstiegSteht = false,
}: {
  zugang: Plattformzugang;
  /** E-001: nur in der Einsicht - die Person sähe zuerst den Einstieg. */
  einstiegSteht?: boolean;
}) {
  const api = usePlattformApi();
  // E-001: In der Einsicht führt kein Ziel auf eine Seite, die nur schreibt.
  const nurLesen = useNurLesen();
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
    queryFn: () => api.ladeTermine(id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(id),
    queryFn: () => api.ladeWuensche(id),
  });
  const rechnungen = useQuery({
    queryKey: rechnungenSchluessel(id),
    queryFn: () => api.ladeRechnungen(id),
  });
  // KOM-001: eine Antwort der Praxis auf eine Nachricht (DSN-001 4.1 Punkt 5).
  const nachrichten = useQuery({
    queryKey: nachrichtenSchluessel(id),
    queryFn: () => api.ladeNachrichten(id),
  });
  const bogen = useQuery({
    queryKey: befundbogenSchluessel(id),
    queryFn: () => api.ladeBefundbogen(id),
    enabled: behandlung,
  });
  // ANG-004 (ANN-274): Nach einem Nachsorge-Abo zählt die Lesezeit vom Ende des Abos.
  const abo = useQuery({
    queryKey: aboSchluessel(id),
    queryFn: () => api.ladeAbo(id),
    enabled: behandlung,
  });
  // KND-003: das Angebot aus dem Abschlussgespräch. Eine Begleitung sieht es
  // nicht - der Server liefert ihr nichts (Recht contract).
  const angebot = useQuery({
    queryKey: trainingsangebotSchluessel(id),
    queryFn: () => api.ladeTrainingsangebot(id),
    enabled: behandlung && !begleitung,
  });
  // TRK-003: der Check-in, wenn er fällig ist. Ohne Mahnung: Verpasstes
  // zählt nicht (IDEA-TRK-004).
  const checkin = useQuery({
    queryKey: checkinsSchluessel(id),
    queryFn: () => api.ladeCheckins(id),
  });
  // ALT-003: laufende Gewohnheiten - ohne Zählwerk, ohne Mahnung.
  const gewohnheiten = useQuery({
    queryKey: gewohnheitenSchluessel(id),
    queryFn: () => api.ladeGewohnheiten(id),
  });
  // UEB-009: die Übungen für heute, im Training der Plan für zu Hause.
  const plaene = useQuery({
    queryKey: plaeneSchluessel(id),
    queryFn: () => api.ladePlaene(id),
  });
  // ANG-008: das eigene Paket; `null` ohne Recht billing.
  const pakete = useQuery({
    queryKey: paketeSchluessel(id),
    queryFn: () => api.ladeMeinePakete(id),
    enabled: !behandlung,
  });
  // ERN-002: das Tagebuch einer gebuchten Beratung. Die Einsicht liest die
  // Ernährung nicht (ADR-027 Punkt 4), eine Begleitung bekommt nichts.
  const ernaehrung = useQuery({
    queryKey: ernaehrungSchluessel(id),
    queryFn: () => api.ladeErnaehrung(id),
    enabled: !nurLesen && !begleitung,
  });

  const abfragen = [
    termine,
    wuensche,
    rechnungen,
    nachrichten,
    bogen,
    abo,
    angebot,
    checkin,
    gewohnheiten,
    plaene,
    pakete,
    ernaehrung,
  ];
  // Ein Zustand für alle (ANN-699): Eine ausgeschaltete Abfrage wartet nicht
  // (`idle`); eine pausierte ohne Netz schon. Scheitert ein Nachladen, bleibt
  // der Stand stehen.
  const laedt = abfragen.some((a) => a.isPending && a.fetchStatus !== 'idle');
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
  // Ein gekündigtes Abo läuft bis zu seinem Ende - erst danach ist Lesefrist
  // (ANN-274), auch wenn `read_until` schon steht.
  const aboLaeuft = abo.data?.state === 'running' || abo.data?.state === 'ending';
  const lesefrist = inLesefrist(zugang, aboLaeuft);
  const haupt = hauptsache({
    zugang,
    bogenId: fuerDiePlattform()[0]?.meta.id,
    boegen: bogen.data,
    checkins: checkin.data,
    plaene: plaene.data,
    aboLaeuft,
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
      {nachCheckin === '1' ? <Rueckmeldung>{nachDemCheckin(zugang)}</Rueckmeldung> : null}
      {nachBogen === '1' ? (
        <Rueckmeldung>
          Danke. Ihr Fragebogen ist bei der Praxis. Ihre Therapeut:in sieht Ihre Angaben beim
          nächsten Termin.
        </Rueckmeldung>
      ) : null}
      {/* E-001: Status als Zeichen und Wort (DESIGN.md Regel 5), kein Erklärsatz. */}
      {einstiegSteht ? (
        <p>
          <StatusMark ton="warnung">Einstieg steht aus</StatusMark>
        </p>
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
        to: nurLesen ? null : p('/checkin'),
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
          titel: 'Ihre Übungen für heute',
          satz: uebungenText(uebungen.uebungen, verbunden),
          to: nurLesen ? p('/uebungen') : mit(handlung(uebungen).pfad),
        });
      }
    } else {
      const zuHause = (plaene.data?.plans ?? []).filter((plan) => plan.status === 'assigned');
      if (zuHause.length > 0) {
        const anzahl = zuHause.reduce((summe, plan) => summe + plan.items.length, 0);
        heute.push({
          schluessel: 'plan',
          zeichen: ZEICHEN.uebungen,
          titel: 'Ihr Plan für zu Hause',
          satz: anzahl === 1 ? 'Eine Übung' : `${anzahl} Übungen`,
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
        to: p('/ernaehrung/tagebuch'),
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
      nurLesen={nurLesen}
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
          <Section titel={behandlung ? 'Ihre Behandlung' : 'Ihr Training'} rahmen>
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
          <Besuchskarte termin={naechster} to={p('/termine')} />
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
  // Was eine Vertretung hier darf, ist eine Auskunft über Rechte (ADR-023
  // Punkt 13) - als Kleingedrucktes am Ende der Seite, unter beiden Spalten,
  // nicht mehr als Absatz oben.
  const rechte =
    zugang.access_kind === 'legal_representative'
      ? `Als rechtliche Vertretung handeln Sie in allem, was ${name} hier tun kann.`
      : begleitung
        ? `Als Begleitung lesen Sie mit und können Terminwünsche und Nachrichten schreiben. Einwilligungen gibt nur ${name} selbst.`
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
  const eigen = zugang.access_kind === 'self';
  const name = zugang.represented_name ?? 'die Person';
  const aboEndet = abo && abo.state !== 'running' ? abo : null;
  return (
    <div className="markenmoment-gruss flex flex-col gap-6">
      {zugang.read_until ? (
        <Statusmeldung ton="warnung">
          {!eigen
            ? `Ihr Zugang für ${name} endet am ${datum(zugang.read_until)}.`
            : aboEndet?.ends_on
              ? `Ihr Nachsorge-Abo ${aboEndet.state === 'ending' ? 'endet' : 'endete'} am ${datum(aboEndet.ends_on)}. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`
              : `Ihre ${zugang.relationship_kind === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`}
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

/** Die Hauptsache als Hero-Karte; gibt es keine, der Leerzustand mit Markenform. */
function Hauptsachekarte({
  haupt,
  zugang,
  naechster,
  erster,
  jetzt,
  verbunden,
  nurLesen,
  mit,
  markenmoment,
}: {
  haupt: Hauptsache;
  zugang: Plattformzugang;
  naechster: Termin | undefined;
  erster: boolean;
  jetzt: Date;
  verbunden: boolean;
  nurLesen: boolean;
  mit: (pfad: string) => string;
  markenmoment: boolean;
}) {
  const vertretung = zugang.access_kind !== 'self';
  switch (haupt.art) {
    case 'unterlagen':
      return (
        <HeroKarte
          titel="Unterlagen sichern"
          satz={`Rechnungen und Dokumente können Sie bis ${tagUndMonat(haupt.bis, jetzt)} herunterladen.`}
          aktion={{ text: 'Unterlagen ansehen', to: `${PLATTFORM_PFAD}/ich` }}
          markenmoment={markenmoment}
        />
      );
    case 'termin': {
      const t = haupt.termin;
      const zeile = terminPerson(t, vertretung);
      return (
        <HeroKarte
          titel={terminTitel(
            t,
            zugang.relationship_kind,
            vertretung ? zugang.represented_name : null,
            jetzt,
          )}
          satz={terminZeit(t, vertretung, jetzt)}
          person={t.staff_name && zeile ? { name: t.staff_name, zeile } : undefined}
          aktion={{ text: 'Termin ansehen', to: mit(`${PLATTFORM_PFAD}/termine`) }}
          markenmoment={markenmoment}
        />
      );
    }
    case 'aufgabe': {
      const a = haupt.aufgabe;
      const knopf = handlung(a);
      const aktion = nurLesen ? undefined : { text: knopf.text, to: mit(knopf.pfad) };
      if (a.art === 'fragebogen') {
        return (
          <HeroKarte
            titel={`Fragebogen vor Ihrem ${erster ? 'ersten' : 'nächsten'} Termin`}
            satz={`Etwa 10 Minuten. ${naechster?.staff_name ?? 'Ihre Therapeut:in'} sieht Ihre Angaben beim ${erster ? 'ersten' : 'nächsten'} Termin.`}
            aktion={aktion}
            markenmoment={markenmoment}
          />
        );
      }
      if (a.art === 'checkin') {
        return (
          <HeroKarte
            titel="Ihr Check-in für heute"
            satz={`${fragenText(a.fragen)}, freiwillig, etwa 1 Minute.`}
            aktion={aktion}
            markenmoment={markenmoment}
          />
        );
      }
      return (
        <HeroKarte
          titel="Ihre Übungen für heute"
          satz={uebungenText(a.uebungen, verbunden)}
          aktion={aktion}
          markenmoment={markenmoment}
        />
      );
    }
    case 'nichts':
      return (
        <EmptyState
          markenform
          inKarte
          title="Gerade ist nichts zu tun."
          description="Zurzeit ist kein Termin vereinbart."
        />
      );
  }
}

interface Eintrag {
  schluessel: string;
  zeichen: ReactNode;
  titel: string;
  satz: string;
  /** Ohne Ziel (Einsicht) als Zeile ohne Link. */
  to: string | null;
}

/**
 * „Heute“ bzw. „Zwischen den Einheiten“: höchstens drei Aufgabenkarten, alles
 * Weitere als Zeile (PLATTFORM.md).
 */
function Heute({ titel, eintraege }: { titel: string; eintraege: Eintrag[] }) {
  const karten = eintraege.filter((e) => e.to !== null).slice(0, 3);
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
            to={e.to!}
          />
        ))}
        {zeilen.length > 0 ? (
          <ListRows rahmen>
            {zeilen.map((e) => (
              <ListRow
                key={e.schluessel}
                titel={e.titel}
                meta={e.satz}
                {...(e.to ? { to: e.to } : {})}
              />
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
function Rueckblick({ person, von, bis }: { person: string | null; von: string; bis: string }) {
  return (
    <p className="flex items-center gap-4 hyphens-manual max-[23rem]:flex-col max-[23rem]:items-start max-[23rem]:gap-2">
      {person ? <Personenbild name={person} farbe={null} groesse="karte" /> : null}
      <span className="flex min-w-0 flex-col">
        {person ? <span className="font-semibold">Mit {person}</span> : null}{' '}
        <span className="text-ink-muted">{zeitraumLang(von, bis)}</span>
      </span>
    </p>
  );
}

/** Erster und letzter Termin, der stattfand, und wer zuletzt kam. */
function vergangen(
  termine: readonly Termin[],
  jetzt: Date,
): { person: string | null; von: string; bis: string } | null {
  const liste = termine
    .filter((t) => t.status !== 'cancelled' && !kuenftig(t.starts_at, jetzt))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  const erster = liste[0];
  const letzter = liste.at(-1);
  if (!erster || !letzter) return null;
  return { person: letzter.staff_name, von: erster.starts_at, bis: letzter.starts_at };
}

function fragenText(anzahl: number): string {
  return anzahl === 1 ? 'Eine kurze Frage' : `${anzahl} kurze Fragen`;
}

/** Die Pläne liegen auf dem Gerät (`PlattformAblage`): Ohne Netz geht es trotzdem. */
function uebungenText(anzahl: number, verbunden: boolean): string {
  if (!verbunden) return 'Geht auch ohne Netz.';
  return anzahl === 1 ? 'Eine Übung aus Ihrem Plan' : `${anzahl} Übungen aus Ihrem Plan`;
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
};
