import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import { nurFragen } from '@/lib/erfassungsgroessen';
import {
  BEREICHSNAME,
  aboSchluessel,
  befundbogenSchluessel,
  checkinsSchluessel,
  gewohnheitenSchluessel,
  ladeAbo,
  ladeBefundbogen,
  ladeCheckins,
  ladeGewohnheiten,
  ladeRechnungen,
  ladeTermine,
  ladeNachrichten,
  ladeTrainingsangebot,
  ladeWuensche,
  nachrichtenSchluessel,
  rechnungenSchluessel,
  trainingsangebotSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
} from './api';
import { nachDemCheckin } from './checkintexte';
import { fuerDiePlattform } from './instrumentwahl';
import { NICHT_AKUT, NOTFALL, THEMA_NAME } from './nachrichtentexte';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { terminBeschreibung } from './terminbeschreibung';
import { datum, kuenftig, tagLang, zeitraum } from './zeit';

/**
 * Die Übersicht - „Was ist jetzt dran?" (POR-015, DSN-001 4.1).
 *
 * Eine kurze Liste dessen, was zu tun ist, keine Kennzahlen (IDEA-ORG-001),
 * in der Reihenfolge aus DSN-001: Befundbogen ausfüllen, nächster Termin,
 * Check-in (TRK-003), Antwort der Praxis auf einen Wunsch, offene Rechnung. Leer heißt: „Gerade ist nichts zu
 * tun" mit dem nächsten Termin, nie eine leere Fläche (Abschnitt 7).
 *
 * Jede Kachel kommt aus der Projektion ihres Bereichs; was eine Rolle nicht
 * sehen darf, liefert der Server nicht (eine Begleitung ohne Einwilligung
 * sieht keine Rechnung).
 */
export function Uebersicht({
  praxis,
  zugang,
  eigeneBereiche,
}: {
  praxis: string;
  zugang: Plattformzugang;
  eigeneBereiche: number;
}) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const eigen = zugang.access_kind === 'self';
  const name = zugang.represented_name ?? 'die Person';
  const behandlung = zugang.relationship_kind === 'treatment';

  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => ladeWuensche(zugang.access_id),
  });
  const rechnungen = useQuery({
    queryKey: rechnungenSchluessel(zugang.access_id),
    queryFn: () => ladeRechnungen(zugang.access_id),
  });
  // KOM-001: eine Antwort der Praxis auf eine Nachricht (DSN-001 4.1 Punkt 5).
  const nachrichten = useQuery({
    queryKey: nachrichtenSchluessel(zugang.access_id),
    queryFn: () => ladeNachrichten(zugang.access_id),
  });
  const bogen = useQuery({
    queryKey: befundbogenSchluessel(zugang.access_id),
    queryFn: () => ladeBefundbogen(zugang.access_id),
    enabled: behandlung,
  });

  // ANG-004 (ANN-274): Nach einem Nachsorge-Abo zählt die Lesezeit vom Ende des Abos.
  const abo = useQuery({
    queryKey: aboSchluessel(zugang.access_id),
    queryFn: () => ladeAbo(zugang.access_id),
    enabled: behandlung,
  });
  const aboEndet = abo.data && abo.data.state !== 'running' ? abo.data : null;

  // KND-003: das Angebot aus dem Abschlussgespräch. Eine Begleitung sieht es
  // nicht - der Server liefert ihr nichts (Recht contract).
  const angebot = useQuery({
    queryKey: trainingsangebotSchluessel(zugang.access_id),
    queryFn: () => ladeTrainingsangebot(zugang.access_id),
    enabled: behandlung && zugang.access_kind !== 'companion',
  });

  // TRK-003: der Check-in, wenn er fällig ist (DSN-001 4.1 Punkt 3). Ohne
  // Mahnung: Verpasstes zählt nicht (IDEA-TRK-004).
  const checkin = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
  });
  const checkinOffen = Boolean(checkin.data?.can_answer);
  // ALT-003: laufende Gewohnheiten zum Antippen - ohne Zählwerk, ohne Mahnung.
  const gewohnheiten = useQuery({
    queryKey: gewohnheitenSchluessel(zugang.access_id),
    queryFn: () => ladeGewohnheiten(zugang.access_id),
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
  const abfragen = [termine, wuensche, rechnungen, bogen];
  const gescheitert = abfragen.some((a) => a.isError);
  const geladen = termine.data !== undefined && !gescheitert;

  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Guten Tag</h1>
      {eigen ? (
        <p className="text-ink mt-2 text-base leading-relaxed">
          Sie sind bei {praxis || 'Ihrer Praxis'} angemeldet
          {eigeneBereiche > 1 ? ` – Bereich ${BEREICHSNAME[zugang.relationship_kind]}` : ''}.
        </p>
      ) : (
        <p className="text-ink mt-2 text-base leading-relaxed">
          Sie sehen hier, was {praxis || 'die Praxis'} für {name} bereitstellt.{' '}
          {zugang.access_kind === 'companion'
            ? `Als Begleitung lesen Sie mit und können Terminwünsche und Nachrichten schreiben. Einwilligungen gibt nur ${name} selbst.`
            : `Als rechtliche Vertretung handeln Sie in allem, was ${name} hier tun kann.`}
        </p>
      )}
      {zugang.read_until ? (
        <Statusmeldung className="mt-4" ton="warnung">
          {!eigen
            ? `Ihr Zugang für ${name} endet am ${datum(zugang.read_until)}.`
            : aboEndet?.ends_on
              ? `Ihr Nachsorge-Abo ${aboEndet.state === 'ending' ? 'endet' : 'endete'} am ${datum(aboEndet.ends_on)}. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`
              : `Ihre ${zugang.relationship_kind === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`}
        </Statusmeldung>
      ) : null}
      {suche.get('checkin') === '1' ? (
        <Statusmeldung className="mt-4" ton="erfolg">
          {nachDemCheckin(zugang)}
        </Statusmeldung>
      ) : null}
      {suche.get('bogen') === '1' ? (
        <Statusmeldung className="mt-4" ton="erfolg">
          Danke. Ihr Befundbogen ist bei der Praxis. Ihre Therapeut:in sieht Ihre Angaben beim
          nächsten Termin.
        </Statusmeldung>
      ) : null}

      {gescheitert ? (
        <div className="mt-6">
          <ErrorState
            title="Ihre Übersicht konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => void Promise.all(abfragen.map((a) => a.refetch()))}
          />
        </div>
      ) : null}

      {geladen && kacheln === 0 ? (
        <p className="text-ink mt-6 max-w-prose text-base leading-relaxed">
          Gerade ist nichts zu tun. Zurzeit ist kein Termin vereinbart.
        </p>
      ) : null}

      <div className="mt-6">
        <TileGrid spalte="breit">
          {bogenOffen ? (
            <Tile
              label="Befundbogen ausfüllen"
              ton="akzent"
              zusatz={
                naechster
                  ? `Vor Ihrem ersten Termin am ${tagLang(naechster.starts_at)} · etwa 10 Minuten`
                  : 'Vor Ihrem ersten Termin · etwa 10 Minuten'
              }
              aktion={
                <Textlink alleinstehend to={mit('/befundbogen')}>
                  {bogenEntwurf ? 'Weiter ausfüllen →' : 'Jetzt ausfüllen →'}
                </Textlink>
              }
            >
              {instrument?.meta.name_de ?? 'Befundbogen'}
            </Tile>
          ) : null}
          {angebot.data ? (
            <Tile
              label="Training nach der Behandlung"
              ton="akzent"
              zusatz={`Angebot der Praxis, gilt bis ${datum(angebot.data.valid_until)}`}
              aktion={
                <Textlink alleinstehend to={mit('/angebot')}>
                  Angebot ansehen →
                </Textlink>
              }
            >
              {angebot.data.label}
            </Tile>
          ) : null}
          {naechster ? (
            <Tile
              label="Nächster Termin"
              zusatz={terminBeschreibung(naechster).ort ?? undefined}
              aktion={
                <Textlink alleinstehend to={mit('/termine')}>
                  Alle Termine →
                </Textlink>
              }
            >
              {tagLang(naechster.starts_at)}, {zeitraum(naechster.starts_at, naechster.ends_at)}
              <span className="text-ink-muted block text-sm font-normal">
                {terminBeschreibung(naechster).titel}
              </span>
            </Tile>
          ) : null}
          {checkinOffen && checkin.data?.schedule ? (
            <Tile
              label="Check-in"
              ton="akzent"
              zusatz="Freiwillig · etwa 1 Minute"
              aktion={
                <Textlink alleinstehend to={mit('/checkin')}>
                  Jetzt beantworten →
                </Textlink>
              }
            >
              {/* Der Zusammenhang zählt nicht als Frage (ANN-355, ANN-369). */}
              {nurFragen(checkin.data.schedule.parameter_keys).length === 1
                ? 'Eine kurze Frage'
                : `${nurFragen(checkin.data.schedule.parameter_keys).length} kurze Fragen`}
            </Tile>
          ) : checkinBrauchtEinwilligung ? (
            <Tile
              label="Check-in"
              zusatz="Der Check-in fragt nach Ihrer Gesundheit. Dafür braucht es Ihre Einwilligung."
              aktion={
                <Textlink alleinstehend to={mit('/einwilligungen')}>
                  Zu den Einwilligungen →
                </Textlink>
              }
            >
              Ihre Praxis bittet um einen Check-in
            </Tile>
          ) : null}
          {laufendeGewohnheiten.length > 0 ? (
            <Tile
              label="Gewohnheiten"
              zusatz={laufendeGewohnheiten.map((g) => g.action).join(' · ')}
              aktion={
                <Textlink alleinstehend to={mit('/gewohnheiten')}>
                  {gewohnheiten.data?.can_mark ? 'Tage antippen →' : 'Ansehen →'}
                </Textlink>
              }
            >
              {laufendeGewohnheiten.length === 1
                ? 'Eine kleine Gewohnheit'
                : `${laufendeGewohnheiten.length} kleine Gewohnheiten`}
            </Tile>
          ) : null}
          {antwort ? (
            <Tile
              label="Antwort der Praxis"
              ton={antwort.status === 'done' ? 'akzent' : 'warnung'}
              zusatz={antwort.answer ?? undefined}
              aktion={
                <Textlink alleinstehend to={mit('/termine')}>
                  Zu den Terminen →
                </Textlink>
              }
            >
              {antwort.status === 'done'
                ? 'Ihr Terminwunsch ist erledigt.'
                : 'Ihr Terminwunsch war leider nicht möglich.'}
            </Tile>
          ) : offenerWunsch ? (
            <Tile
              label="Terminwunsch"
              zusatz="Die Praxis meldet sich bei Ihnen."
              aktion={
                <Textlink alleinstehend to={mit('/termine')}>
                  Zu den Terminen →
                </Textlink>
              }
            >
              Angefragt am {formatDate(offenerWunsch.created_at.slice(0, 10))}
            </Tile>
          ) : null}
          {beantwortet.length > 0 ? (
            <Tile
              label="Antwort der Praxis"
              ton="akzent"
              zusatz={beantwortet.map((m) => THEMA_NAME[m.topic]).join(' · ')}
              aktion={
                <Textlink
                  alleinstehend
                  to={mit(
                    beantwortet.length === 1
                      ? `/nachrichten/${beantwortet[0]!.id}`
                      : '/nachrichten',
                  )}
                >
                  {beantwortet.length === 1 ? 'Antwort lesen →' : 'Zu den Nachrichten →'}
                </Textlink>
              }
            >
              {beantwortet.length === 1
                ? 'Die Praxis hat auf Ihre Nachricht geantwortet.'
                : `Die Praxis hat auf ${beantwortet.length} Nachrichten geantwortet.`}
            </Tile>
          ) : null}
          {offeneRechnung ? (
            <Tile
              label="Offene Rechnung"
              ton={offeneRechnung.overdue ? 'warnung' : 'neutral'}
              zusatz={`Rechnung ${offeneRechnung.invoice_number} · fällig am ${formatDate(offeneRechnung.due_on)}`}
              aktion={
                <Textlink alleinstehend to={mit(`/rechnungen/${offeneRechnung.id}`)}>
                  Zur Rechnung →
                </Textlink>
              }
            >
              {formatEuro(offeneRechnung.outstanding_cents, offeneRechnung.currency)}
            </Tile>
          ) : null}
        </TileGrid>
      </div>

      <Section titel="Fragen an die Praxis">
        <p className="text-ink max-w-prose text-base leading-relaxed">
          <strong>{NICHT_AKUT}</strong> {NOTFALL}
        </p>
        {/* Ein eigenes Ziel mit 44 px, kein Link im Fließtext (DSN-001 Abschnitt 7). */}
        <Textlink alleinstehend to={mit('/nachrichten')}>
          Der Praxis schreiben →
        </Textlink>
      </Section>
    </>
  );
}
