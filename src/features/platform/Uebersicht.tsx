import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ErrorState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Tile, TileGrid } from '@/components/ui/Tile';
import { formatDate } from '@/lib/datum';
import { formatEuro } from '@/lib/geld';
import {
  BEREICHSNAME,
  befundbogenSchluessel,
  ladeBefundbogen,
  ladeRechnungen,
  ladeTermine,
  ladeWuensche,
  rechnungenSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
} from './api';
import { fuerDiePlattform } from './instrumentwahl';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { terminBeschreibung } from './terminbeschreibung';
import { datum, kuenftig, tagLang, zeitraum } from './zeit';

/**
 * Die Übersicht - „Was ist jetzt dran?" (POR-015, DSN-001 4.1).
 *
 * Eine kurze Liste dessen, was zu tun ist, keine Kennzahlen (IDEA-ORG-001),
 * in der Reihenfolge aus DSN-001: Befundbogen ausfüllen, nächster Termin,
 * Antwort der Praxis auf einen Wunsch, offene Rechnung. Check-in und Übungen
 * kommen mit ihren Loops (TRK-, UEB-EPIC). Leer heißt: „Gerade ist nichts zu
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
  const bogen = useQuery({
    queryKey: befundbogenSchluessel(zugang.access_id),
    queryFn: () => ladeBefundbogen(zugang.access_id),
    enabled: behandlung,
  });

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
    Boolean(naechster),
    Boolean(antwort),
    Boolean(offenerWunsch),
    Boolean(offeneRechnung),
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
          {eigen
            ? `Ihre ${zugang.relationship_kind === 'training' ? 'Trainingszeit' : 'Behandlung'} ist beendet. Sie können hier noch bis ${datum(zugang.read_until)} lesen.`
            : `Ihr Zugang für ${name} endet am ${datum(zugang.read_until)}.`}
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
          Wenden Sie sich bitte wie gewohnt direkt an die Praxis. In einem Notfall rufen Sie 112 an.
        </p>
      </Section>
    </>
  );
}
