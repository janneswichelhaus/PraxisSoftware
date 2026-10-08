import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge, type Ton } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import {
  ladePlaene,
  ladeTermine,
  ladeWuensche,
  plaeneSchluessel,
  type EigenePlaene,
  termineSchluessel,
  wuenscheSchluessel,
  wunschZurueckziehen,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { terminBeschreibung, wunschText } from './terminbeschreibung';
import { datum, kalendertag, kuenftig, tagKurz, wochentagMitDatum, zeitraum } from './zeit';
import { tageAb, uebungstageAm } from './uebungstage';

/**
 * Reiter „Termine" (POR-008, DSN-001 4.1): „Wann komme ich dran, und was
 * möchte ich ändern?"
 *
 * Kommende Termine oben, vergangene darunter - beides nur aus dem gewählten
 * Verhältnis, geliefert vom Server über den Zugang. Jede Zeile sagt, wann,
 * wo und wer: beim Hausbesuch die eigene Anschrift und wer kommt, beim
 * Praxistermin der Standort. Der Zustand steht als Wort mit Zeichen, nie als
 * Farbe allein (Abschnitt 7).
 *
 * Dazu die Wünsche (POR-009): „Termin wünschen" als der eine Hauptknopf;
 * ein offener Wunsch steht als „angefragt – die Praxis meldet sich", nie wie
 * ein Termin (§8). Die Belegung anderer Personen ist nirgends zu sehen.
 */
export function Termine({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });
  const wuensche = useQuery({
    queryKey: wuenscheSchluessel(zugang.access_id),
    queryFn: () => ladeWuensche(zugang.access_id),
  });
  // UEB-011: die Übungstage neben den Terminen (IDEA-ORG-004). Lädt der Plan
  // nicht, bleiben die Termine - die Woche fehlt dann einfach.
  const plaene = useQuery({
    queryKey: plaeneSchluessel(zugang.access_id),
    queryFn: () => ladePlaene(zugang.access_id),
  });
  // Der gewählte Bereich reist in jeden Link mit (D6).
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const wunschPfad = `${PLATTFORM_PFAD}/termine/wunsch${bereich ? `?${bereich}` : ''}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-accent text-h3 font-bold">Termine</h1>
        <ButtonLink to={wunschPfad}>Termin wünschen</ButtonLink>
      </div>
      {suche.get('gesendet') === '1' ? (
        <Statusmeldung ton="erfolg" className="mt-4">
          Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.
        </Statusmeldung>
      ) : null}
      {wuensche.data && wuensche.data.length > 0 ? (
        <Wuensche zugang={zugang} wuensche={wuensche.data} />
      ) : null}
      {termine.data && plaene.data ? (
        <DieseWoche termine={termine.data} plaene={plaene.data} />
      ) : null}
      {termine.isPending ? (
        <LoadingState label="Ihre Termine werden geladen …" />
      ) : termine.data === undefined ? (
        <ErrorState
          title="Ihre Termine konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => termine.refetch()}
        />
      ) : (
        <Terminlisten termine={termine.data} bereich={bereich} />
      )}
    </>
  );
}

/**
 * „Diese Woche" (UEB-011, IDEA-ORG-004): heute und die sechs Tage danach,
 * Termine und Übungstage nebeneinander - klar unterschieden durch Wort und
 * Zeichen, nicht durch Farbe allein. Ein Übungstag, an dem schon geübt wurde,
 * trägt „geübt"; keine Serie, keine Quote (DSN-001 4.1).
 */
function DieseWoche({ termine, plaene }: { termine: Termin[]; plaene: EigenePlaene }) {
  const heute = kalendertag(new Date());
  const tage = tageAb(heute, 7);
  const hatUebungstage = plaene.plans.some((p) => p.weekdays.length > 0);
  if (!hatUebungstage) return null;
  return (
    <Section titel="Diese Woche">
      <ul aria-label="Die nächsten sieben Tage" className="flex flex-col gap-2">
        {tage.map((tag) => {
          const amTag = termine.filter(
            (t) => t.status !== 'cancelled' && kalendertag(new Date(t.starts_at)) === tag,
          );
          const uebungen = uebungstageAm(plaene.plans, tag);
          return (
            <li key={tag} className="rounded-card border-line bg-surface border p-3">
              <p className="font-semibold">
                {tag === heute ? 'Heute, ' : ''}
                {wochentagMitDatum(tag)}
              </p>
              {amTag.length === 0 && uebungen.length === 0 ? (
                <p className="text-ink-muted mt-1">Nichts geplant.</p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {amTag.map((t) => (
                    <li key={t.id} className="flex items-start gap-2">
                      <span className="shrink-0">
                        <Badge ton="akzent">Termin</Badge>
                      </span>
                      <span>
                        {zeitraum(t.starts_at, t.ends_at)} · {terminBeschreibung(t).titel}
                      </span>
                    </li>
                  ))}
                  {uebungen.map((p) => {
                    const geuebt = p.recent_sessions.some(
                      (s) => s.performed_on === tag && s.finished,
                    );
                    return (
                      <li key={p.id} className="flex items-start gap-2">
                        <span className="shrink-0">
                          <Badge ton="neutral">Übungstag</Badge>
                        </span>
                        <span>
                          {p.title}
                          {geuebt ? ' · geübt' : ''}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function Terminlisten({ termine, bereich }: { termine: Termin[]; bereich: string }) {
  const jetzt = new Date();
  const kommende = termine.filter((t) => kuenftig(t.ends_at, jetzt));
  const vergangene = termine.filter((t) => !kuenftig(t.ends_at, jetzt)).reverse();
  return (
    <>
      <Section titel="Kommende Termine">
        {kommende.length === 0 ? (
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Zurzeit ist kein Termin vereinbart. Über „Termin wünschen“ sagen Sie der Praxis, wann es
            Ihnen passt.
          </p>
        ) : (
          <ListRows>
            {kommende.map((t) => (
              <Terminzeile key={t.id} termin={t} bereich={bereich} />
            ))}
          </ListRows>
        )}
      </Section>
      {vergangene.length > 0 ? (
        <Section titel="Vergangene Termine">
          <ListRows>
            {vergangene.map((t) => (
              <Terminzeile key={t.id} termin={t} gedaempft />
            ))}
          </ListRows>
        </Section>
      ) : null}
    </>
  );
}

const ZUSTAND: Record<Termin['status'], { wort: string; ton: Ton } | null> = {
  confirmed: null,
  cancelled: { wort: 'abgesagt', ton: 'kritisch' },
  no_show: { wort: 'nicht angetroffen', ton: 'warnung' },
  completed: { wort: 'durchgeführt', ton: 'positiv' },
};

function Terminzeile({
  termin,
  bereich = '',
  gedaempft = false,
}: {
  termin: Termin;
  bereich?: string;
  gedaempft?: boolean;
}) {
  const { titel, ort } = terminBeschreibung(termin);
  const zustand = ZUSTAND[termin.status];
  // Nur ein bestätigter künftiger Termin führt zur Seite mit Ändern und
  // Absagen (POR-010); ein offener Wunsch steht als Wort an der Zeile.
  const aenderbar =
    termin.status === 'confirmed' && new Date(termin.starts_at).getTime() > Date.now();
  const wunsch =
    termin.open_request_kind === 'cancel'
      ? 'Absage angefragt'
      : termin.open_request_kind === 'change'
        ? 'Änderung angefragt'
        : null;
  return (
    <ListRow
      {...(aenderbar
        ? { to: `${PLATTFORM_PFAD}/termine/${termin.id}${bereich ? `?${bereich}` : ''}` }
        : {})}
      zeit={
        <span className="flex flex-col leading-tight">
          <span>{tagKurz(termin.starts_at)}</span>
          <span className="text-sm font-medium">{zeitraum(termin.starts_at, termin.ends_at)}</span>
        </span>
      }
      titel={titel}
      meta={ort ?? undefined}
      status={
        zustand ? (
          <Badge ton={zustand.ton}>{zustand.wort}</Badge>
        ) : wunsch ? (
          <Badge ton="akzent">{wunsch}</Badge>
        ) : undefined
      }
      gedaempft={gedaempft || termin.status === 'cancelled'}
    />
  );
}

// -----------------------------------------------------------------------------
// Wünsche (POR-009)
// -----------------------------------------------------------------------------

const WUNSCHART: Record<Terminwunsch['kind'], string> = {
  new: 'Terminwunsch',
  change: 'Änderungswunsch',
  cancel: 'Absagewunsch',
};

const WUNSCHZUSTAND: Record<Terminwunsch['status'], { wort: string; ton: Ton }> = {
  open: { wort: 'angefragt', ton: 'akzent' },
  done: { wort: 'erledigt', ton: 'positiv' },
  declined: { wort: 'nicht möglich', ton: 'warnung' },
  withdrawn: { wort: 'zurückgezogen', ton: 'neutral' },
};

function Wuensche({ zugang, wuensche }: { zugang: Plattformzugang; wuensche: Terminwunsch[] }) {
  // Beantwortete Wünsche nur, solange sie neu sind (14 Tage) - danach wäre es
  // eine Liste alter Vorgänge, keine Auskunft.
  const grenze = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const sichtbar = wuensche.filter(
    (w) => w.status === 'open' || (w.resolved_at && new Date(w.resolved_at).getTime() > grenze),
  );
  if (sichtbar.length === 0) return null;
  return (
    <Section titel="Ihre Wünsche">
      <ul className="flex flex-col gap-3">
        {sichtbar.map((w) => (
          <Wunschkarte key={w.id} zugang={zugang} wunsch={w} />
        ))}
      </ul>
    </Section>
  );
}

function Wunschkarte({ zugang, wunsch: w }: { zugang: Plattformzugang; wunsch: Terminwunsch }) {
  const queryClient = useQueryClient();
  const zurueckziehen = useMutation({
    mutationFn: () => wunschZurueckziehen(zugang.access_id, w.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) }),
  });
  const zustand = WUNSCHZUSTAND[w.status];
  const text = wunschText(w);
  return (
    <li className="border-line bg-surface rounded-card border px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink text-base font-semibold">
          {WUNSCHART[w.kind]} vom {datum(w.created_at)}
        </p>
        <Badge ton={zustand.ton}>{zustand.wort}</Badge>
      </div>
      {text ? <p className="text-ink mt-1 text-sm">{text}</p> : null}
      {w.note ? <p className="text-ink-muted mt-1 text-sm">„{w.note}“</p> : null}
      {w.status === 'open' ? (
        <p className="text-ink-muted mt-2 text-sm">
          Die Praxis meldet sich bei Ihnen. Ein vereinbarter Termin ist das noch nicht.
        </p>
      ) : null}
      {w.answer ? (
        <p className="text-ink mt-2 text-sm">
          <span className="font-semibold">Antwort der Praxis:</span> {w.answer}
        </p>
      ) : null}
      {w.status === 'open' ? (
        <div className="mt-3">
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
        </div>
      ) : null}
    </li>
  );
}
