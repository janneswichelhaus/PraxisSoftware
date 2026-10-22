import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { nurFragen } from '@/lib/erfassungsgroessen';
import {
  BEREICHSNAME,
  aboSchluessel,
  befundbogenSchluessel,
  checkinsSchluessel,
  gewohnheitenSchluessel,
  nachrichtenSchluessel,
  rechnungenSchluessel,
  trainingsangebotSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
} from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
import { nachDemCheckin } from './checkintexte';
import { useEinmaligeRueckmeldung } from './einmaligeRueckmeldung';
import { fuerDiePlattform } from './instrumentwahl';
import { useMarkenmoment } from './markenmoment';
import { NICHT_AKUT, THEMA_NAME } from './nachrichtentexte';
import { Notfallsatz } from './Notfallsatz';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { terminBeschreibung } from './terminbeschreibung';
import { datum, kuenftig, tagKurz, tagLang, zeitraum } from './zeit';

/**
 * Die Übersicht - „Was ist jetzt dran?" (POR-015, DSN-001 4.1).
 *
 * Eine kurze Liste dessen, was zu tun ist, keine Kennzahlen (IDEA-ORG-001),
 * in der Reihenfolge aus DSN-001: Befundbogen ausfüllen, nächster Termin,
 * Check-in (TRK-003), Antwort der Praxis auf einen Wunsch, offene Rechnung. Leer heißt: „Gerade ist nichts zu
 * tun" mit dem nächsten Termin, nie eine leere Fläche (Abschnitt 7).
 *
 * Seit Welle B (ANN-465): „Jetzt dran" als Liste, darunter der nächste Termin
 * als Zeile wie unter „Termine" - jede Zeile ist ganz das Ziel, statt bis zu
 * zehn Kacheln mit einem Link am Fuß (DESIGN.md: höchstens vier Kacheln).
 *
 * Jede Zeile kommt aus der Projektion ihres Bereichs; was eine Rolle nicht
 * sehen darf, liefert der Server nicht (eine Begleitung ohne Einwilligung
 * sieht keine Rechnung).
 */
export function Uebersicht({
  praxis,
  zugang,
  eigeneBereiche,
  einstiegSteht = false,
}: {
  praxis: string;
  zugang: Plattformzugang;
  eigeneBereiche: number;
  /** E-001: nur in der Einsicht - die Person sähe zuerst den Einstieg. */
  einstiegSteht?: boolean;
}) {
  const api = usePlattformApi();
  // E-001: In der Einsicht führt keine Zeile auf eine Seite, die nur schreibt.
  const nurLesen = useNurLesen();
  const [suche] = useSearchParams();
  const nachCheckin = useEinmaligeRueckmeldung('checkin');
  const nachBogen = useEinmaligeRueckmeldung('bogen');
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const eigen = zugang.access_kind === 'self';
  const name = zugang.represented_name ?? 'die Person';
  const behandlung = zugang.relationship_kind === 'treatment';

  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => api.ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => api.ladeWuensche(zugang.access_id),
  });
  const rechnungen = useQuery({
    queryKey: rechnungenSchluessel(zugang.access_id),
    queryFn: () => api.ladeRechnungen(zugang.access_id),
  });
  // KOM-001: eine Antwort der Praxis auf eine Nachricht (DSN-001 4.1 Punkt 5).
  const nachrichten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => api.ladeNachrichten(zugang.access_id),
  });
  const bogen = useQuery({
    queryKey: befundbogenSchluessel(zugang.access_id),
    queryFn: () => api.ladeBefundbogen(zugang.access_id),
    enabled: behandlung,
  });

  // ANG-004 (ANN-274): Nach einem Nachsorge-Abo zählt die Lesezeit vom Ende des Abos.
  const abo = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => api.ladeAbo(zugang.access_id),
    enabled: behandlung,
  });
  const aboEndet = abo.data && abo.data.state !== 'running' ? abo.data : null;

  // KND-003: das Angebot aus dem Abschlussgespräch. Eine Begleitung sieht es
  // nicht - der Server liefert ihr nichts (Recht contract).
  const angebot = useQuery({
    queryKey: trainingsangebotSchluessel(zugang.access_id),
    queryFn: () => api.ladeTrainingsangebot(zugang.access_id),
    enabled: behandlung && zugang.access_kind !== 'companion',
  });

  // TRK-003: der Check-in, wenn er fällig ist (DSN-001 4.1 Punkt 3). Ohne
  // Mahnung: Verpasstes zählt nicht (IDEA-TRK-004).
  const checkin = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => api.ladeCheckins(zugang.access_id),
  });
  const checkinOffen = Boolean(checkin.data?.can_answer);
  // ALT-003: laufende Gewohnheiten zum Antippen - ohne Zählwerk, ohne Mahnung.
  const gewohnheiten = useQuery({
    queryKey: gewohnheitenSchluessel(zugang.access_id),
    queryFn: () => api.ladeGewohnheiten(zugang.access_id),
  });
  const laufendeGewohnheiten = (gewohnheiten.data?.habits ?? []).filter(
    (g) => g.ended_at === null && !g.paused,
  );
  // Im Training ohne Einwilligung: der Weg dorthin, nicht der Check-in.
  const checkinBrauchtEinwilligung =
    !checkinOffen &&
    zugang.access_kind !== 'companion' &&
    Boolean(checkin.data?.due && checkin.data.consent_needed);

  const jetzt = new Date();
  // Ein laufender Termin ist noch „nächster“ - wie unter Termine „kommend“.
  const naechster = (termine.data ?? []).find(
    (t) => t.status === 'confirmed' && kuenftig(t.ends_at, jetzt),
  );
  const offeneRechnung = (rechnungen.data ?? []).find(
    (r) => !r.cancelled && r.outstanding_cents > 0,
  );
  // Eine Antwort der Praxis, die jünger als 14 Tage ist (DSN-001 4.1 Punkt 5).
  const grenze = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const antwort = (wuensche.data ?? []).find(
    (w) =>
      (w.status === 'done' || w.status === 'declined') &&
      w.resolved_at !== null &&
      new Date(w.resolved_at).getTime() > grenze,
  );
  const offenerWunsch = (wuensche.data ?? []).find((w) => w.status === 'open');
  const beantwortet = (nachrichten.data?.messages ?? []).filter((m) => m.status === 'answered');
  const instrument = fuerDiePlattform()[0];
  // Eine Begleitung füllt den Bogen nicht aus (ANN-248) - der Server weist sie
  // ab, die Kachel führt sie gar nicht erst hin.
  const bogenOffen =
    behandlung &&
    zugang.access_kind !== 'companion' &&
    instrument !== undefined &&
    bogen.data !== undefined &&
    !bogen.data.some((b) => b.instrument_id === instrument.meta.id && b.status === 'abgeschlossen');
  const bogenEntwurf = bogen.data?.some(
    (b) => instrument && b.instrument_id === instrument.meta.id && b.status === 'entwurf',
  );

  const kacheln = [
    bogenOffen,
    Boolean(angebot.data),
    Boolean(naechster),
    checkinOffen,
    checkinBrauchtEinwilligung,
    laufendeGewohnheiten.length > 0,
    Boolean(antwort),
    Boolean(offenerWunsch),
    Boolean(offeneRechnung),
    beantwortet.length > 0,
  ].filter(Boolean).length;
  const zuTun = kacheln - (naechster ? 1 : 0);
  const abfragen = [termine, wuensche, rechnungen, bogen];
  const gescheitert = abfragen.some((a) => a.isError);
  const geladen = termine.data !== undefined && !gescheitert;
  // Der Moment endet erst, wenn die Übersicht steht (ANN-680).
  const markenmoment = useMarkenmoment(geladen || gescheitert);

  // Markenmoment B statt Startbild (ANN-680): beim ersten Erscheinen je Tab
  // kommen Gruß und Abschnitte gestaffelt (`index.css`).
  return (
    <div className={markenmoment ? 'markenmoment' : undefined}>
      <PageHeader
        title="Guten Tag"
        {...(eigen
          ? {
              description: `Sie sind bei ${praxis || 'Ihrer Praxis'} angemeldet${
                eigeneBereiche > 1 ? ` – Bereich ${BEREICHSNAME[zugang.relationship_kind]}` : ''
              }.`,
            }
          : {})}
      />
      {eigen ? null : (
        // Was eine Vertretung hier darf, ist eine Auskunft über Rechte
        // (ADR-023 Punkt 13) - sie steht ganz da, nicht eingeklappt.
        <p className="text-ink mb-6 max-w-prose text-base leading-relaxed">
          Sie sehen hier, was {praxis || 'die Praxis'} für {name} bereitstellt.{' '}
          {zugang.access_kind === 'companion'
            ? `Als Begleitung lesen Sie mit und können Terminwünsche und Nachrichten schreiben. Einwilligungen gibt nur ${name} selbst.`
            : `Als rechtliche Vertretung handeln Sie in allem, was ${name} hier tun kann.`}
        </p>
      )}
      {nachCheckin === '1' ? (
        <Rueckmeldung className="mb-4">{nachDemCheckin(zugang)}</Rueckmeldung>
      ) : null}
      {nachBogen === '1' ? (
        <Rueckmeldung className="mb-4">
          Danke. Ihr Fragebogen ist bei der Praxis. Ihre Therapeut:in sieht Ihre Angaben beim
          nächsten Termin.
        </Rueckmeldung>
      ) : null}
      {zugang.read_until ? (
        <Statusmeldung className="mb-4" ton="warnung">
          {!eigen
            ? `Ihr Zugang für ${name} endet am ${datum(zugang.read_until)}.`
            : aboEndet?.ends_on
              ? `Ihr Nachsorge-Abo ${aboEndet.state === 'ending' ? 'endet' : 'endete'} am ${datum(aboEndet.ends_on)}. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`
              : `Ihre ${zugang.relationship_kind === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`}
        </Statusmeldung>
      ) : null}
      {/* E-001: Status als Zeichen und Wort (DESIGN.md Regel 5), kein Erklärsatz. */}
      {einstiegSteht ? (
        <p className="mb-4">
          <StatusMark ton="warnung">Einstieg steht aus</StatusMark>
        </p>
      ) : null}

      {gescheitert ? (
        <ErrorState
          title="Ihre Übersicht konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void Promise.all(abfragen.map((a) => a.refetch()))}
        />
      ) : termine.isPending ? (
        <LoadingState label="Ihre Übersicht wird geladen …" inKarte />
      ) : null}

      {geladen && kacheln === 0 ? (
        <EmptyState
          inKarte
          title="Gerade ist nichts zu tun."
          description="Zurzeit ist kein Termin vereinbart."
        />
      ) : null}

      {/* DSN-001 4.1: was jetzt dran ist, in der Reihenfolge Befundbogen,
          Angebot, Check-in, Gewohnheiten, Antworten, offene Rechnung. Jede
          Zeile ist ganz das Ziel (DESIGN.md, Seitentyp „Plattform“). */}
      {zuTun > 0 ? (
        <Listenabschnitt titel="Jetzt dran">
          {bogenOffen ? (
            <ListRow
              {...(nurLesen ? {} : { to: mit('/befundbogen') })}
              // DR-125: der Fragebogen nach seinem Zweck, ohne Name und
              // Fassung der Vorlage.
              titel={bogenEntwurf ? 'Fragebogen weiter ausfüllen' : 'Fragebogen ausfüllen'}
              meta={[
                naechster
                  ? `vor Ihrem ersten Termin am ${tagLang(naechster.starts_at)}`
                  : 'vor Ihrem ersten Termin',
                'etwa 10 Minuten',
              ].join(' · ')}
            />
          ) : null}
          {angebot.data ? (
            <ListRow
              to={mit('/angebot')}
              titel="Training nach der Behandlung"
              meta={`${angebot.data.label} · Angebot der Praxis, gilt bis ${datum(angebot.data.valid_until)}`}
            />
          ) : null}
          {checkinOffen && checkin.data?.schedule ? (
            <ListRow
              {...(nurLesen ? {} : { to: mit('/checkin') })}
              titel="Check-in beantworten"
              meta={`${
                // Der Zusammenhang zählt nicht als Frage (ANN-355, ANN-369).
                nurFragen(checkin.data.schedule.parameter_keys).length === 1
                  ? 'Eine kurze Frage'
                  : `${nurFragen(checkin.data.schedule.parameter_keys).length} kurze Fragen`
              } · freiwillig · etwa 1 Minute`}
            />
          ) : checkinBrauchtEinwilligung ? (
            <ListRow
              to={mit('/einwilligungen')}
              titel="Ihre Praxis bittet um einen Check-in"
              meta="Der Check-in fragt nach Ihrer Gesundheit. Dafür braucht es Ihre Einwilligung."
            />
          ) : null}
          {laufendeGewohnheiten.length > 0 ? (
            <ListRow
              to={mit('/gewohnheiten')}
              titel={
                laufendeGewohnheiten.length === 1
                  ? 'Eine kleine Gewohnheit'
                  : `${laufendeGewohnheiten.length} kleine Gewohnheiten`
              }
              meta={laufendeGewohnheiten.map((g) => g.action).join(' · ')}
            />
          ) : null}
          {antwort ? (
            <ListRow
              to={mit('/termine')}
              titel={
                antwort.status === 'done'
                  ? 'Ihr Terminwunsch ist erledigt.'
                  : 'Ihr Terminwunsch war leider nicht möglich.'
              }
              meta={antwort.answer ? `Antwort der Praxis: ${antwort.answer}` : 'Antwort der Praxis'}
            />
          ) : offenerWunsch ? (
            <ListRow
              to={mit('/termine')}
              titel="Terminwunsch angefragt"
              meta={`Am ${formatDate(offenerWunsch.created_at.slice(0, 10))} · Die Praxis meldet sich bei Ihnen.`}
            />
          ) : null}
          {beantwortet.length > 0 ? (
            <ListRow
              to={mit(
                beantwortet.length === 1 ? `/nachrichten/${beantwortet[0]!.id}` : '/nachrichten',
              )}
              titel={
                beantwortet.length === 1
                  ? 'Die Praxis hat auf Ihre Nachricht geantwortet.'
                  : `Die Praxis hat auf ${beantwortet.length} Nachrichten geantwortet.`
              }
              meta={beantwortet.map((m) => THEMA_NAME[m.topic]).join(' · ')}
            />
          ) : null}
          {offeneRechnung ? (
            <ListRow
              to={mit(`/rechnungen/${offeneRechnung.id}`)}
              titel={`Offene Rechnung: ${formatEuro(offeneRechnung.outstanding_cents, offeneRechnung.currency)}`}
              meta={
                <>
                  {offeneRechnung.overdue ? (
                    <>
                      <StatusMark ton="warnung">überfällig</StatusMark>
                      {' · '}
                    </>
                  ) : null}
                  {`Rechnung ${offeneRechnung.invoice_number} · fällig am ${formatDate(offeneRechnung.due_on)}`}
                </>
              }
            />
          ) : null}
        </Listenabschnitt>
      ) : null}

      {naechster ? (
        <Section titel="Nächster Termin">
          <ListRows>
            <ListRow
              to={mit('/termine')}
              zeit={
                <span className="flex flex-col leading-tight">
                  <span>{tagKurz(naechster.starts_at)}</span>
                  <span className="text-sm font-medium">
                    {zeitraum(naechster.starts_at, naechster.ends_at)}
                  </span>
                </span>
              }
              titel={terminBeschreibung(naechster).titel}
              meta={terminBeschreibung(naechster).ort ?? undefined}
            />
          </ListRows>
        </Section>
      ) : null}

      <Section titel="Fragen an die Praxis">
        <p className="text-ink max-w-prose text-base leading-relaxed">
          <strong>{NICHT_AKUT}</strong> <Notfallsatz />
        </p>
        {/* Ein eigenes Ziel mit 44 px, kein Link im Fließtext (DSN-001 Abschnitt 7).
            16 px Luft darüber: Die Tippfläche einer Notrufnummer ragt 10 px
            unter die letzte Zeile des Satzes (`Notrufnummer`); ohne den
            Abstand lägen beide Ziele übereinander, sobald die Nummer am
            Zeilenanfang steht (Sichtung 13.10.2026, neu4). */}
        {nurLesen ? null : (
          <Textlink alleinstehend to={mit('/nachrichten')} className="mt-4">
            Der Praxis schreiben →
          </Textlink>
        )}
      </Section>
    </div>
  );
}
