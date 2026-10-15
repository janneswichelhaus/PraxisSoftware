import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Badge, type Ton } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckmeldung } from '@/components/ui/Rueckmeldung';
import { Section } from '@/components/ui/Section';

import {
  plaeneSchluessel,
  type EigenePlaene,
  termineSchluessel,
  wuenscheSchluessel,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { TAGE_NUR_DIE_PERSON, useNurLesen, usePlattformApi } from './einsicht';
import { PLATTFORM_PFAD } from './pfade';
import { terminBeschreibung, wunschText } from './terminbeschreibung';
import { datum, kalendertag, kuenftig, tagKurz, zeitraum } from './zeit';
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
  const api = usePlattformApi();
  // E-001: In der Einsicht kein Wunsch, kein Ändern, kein Zurückziehen.
  const nurLesen = useNurLesen();
  const [suche] = useSearchParams();
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
  // Der gewählte Bereich reist in jeden Link mit (D6).
  const bereich = new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
  const wunschPfad = `${PLATTFORM_PFAD}/termine/wunsch${bereich ? `?${bereich}` : ''}`;
  // Die eine Aufgabe der Seite als Hauptknopf unter den kommenden Terminen,
  // am Telefon in voller Breite und mit dem Daumen erreichbar (DESIGN.md,
  // Seitentyp „Plattform“) - nicht klein oben rechts im Kopf.
  const wunschKnopf = nurLesen ? null : (
    <div className="mt-6">
      <ButtonLink to={wunschPfad} groesse="normal" className="w-full sm:w-auto">
        Termin wünschen
      </ButtonLink>
    </div>
  );

  return (
    <>
      <PageHeader title="Termine" />
      {suche.get('gesendet') === '1' ? (
        <Rueckmeldung className="mb-6">
          Ihr Wunsch ist bei der Praxis angekommen. Sie meldet sich bei Ihnen.
        </Rueckmeldung>
      ) : null}
      <Abfragezustand
        abfrage={termine}
        laden="Ihre Termine werden geladen …"
        fehler="Ihre Termine konnten nicht geladen werden."
        inKarte
      >
        {(liste) => (
          <>
            <Kommende termine={liste} bereich={bereich} />
            {wunschKnopf}
            {wuensche.data && wuensche.data.length > 0 ? (
              <Wuensche zugang={zugang} wuensche={wuensche.data} />
            ) : null}
            {plaene.data && !nurLesen ? <DieseWoche termine={liste} plaene={plaene.data} /> : null}
            {/* ANN-307: Die Übungstage der Woche sieht nur die Person; die
                Einsicht bekommt sie leer und sagt das, statt still zu fehlen. */}
            {nurLesen && plaene.data?.plans.some((p) => p.status === 'assigned') ? (
              <p className="text-ink-muted mt-8 max-w-prose">{TAGE_NUR_DIE_PERSON}</p>
            ) : null}
            <Vergangene termine={liste} />
          </>
        )}
      </Abfragezustand>
      {/* Ohne geladene Termine bleibt der Wunsch trotzdem möglich. */}
      {termine.data === undefined ? wunschKnopf : null}
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
  // Der Tag der Praxis, wie bei den Plänen - nicht der des Geräts.
  const heute = plaene.today;
  const tage = tageAb(heute, 7);
  const hatUebungstage = plaene.plans.some((p) => p.weekdays.length > 0);
  if (!hatUebungstage) return null;
  return (
    <Section titel="Diese Woche">
      {/* Die Klassen von `ListRows`; die Liste trägt hier einen Namen. */}
      <ul
        aria-label="Die nächsten sieben Tage"
        className="rounded-card border-line bg-surface overflow-hidden border px-4"
      >
        {tage.map((tag) => {
          const amTag = termine.filter(
            (t) => t.status !== 'cancelled' && kalendertag(new Date(t.starts_at)) === tag,
          );
          const uebungen = uebungstageAm(plaene.plans, tag);
          const leer = amTag.length === 0 && uebungen.length === 0;
          return (
            <ListRow
              key={tag}
              zeit={tag === heute ? 'Heute' : tagKurz(`${tag}T12:00:00`)}
              gedaempft={leer}
              titel={
                leer ? (
                  'Nichts geplant.'
                ) : (
                  <span className="flex flex-col gap-2 font-normal">
                    {amTag.map((t) => (
                      <span key={t.id} className="flex flex-col items-start gap-0.5">
                        <span>
                          <Badge ton="akzent">Termin</Badge>
                        </span>
                        <span>
                          {zeitraum(t.starts_at, t.ends_at)} · {terminBeschreibung(t).titel}
                        </span>
                      </span>
                    ))}
                    {uebungen.map((p) => {
                      const geuebt = p.recent_sessions.some(
                        (s) => s.performed_on === tag && s.finished,
                      );
                      return (
                        <span key={p.id} className="flex flex-col items-start gap-0.5">
                          <span>
                            <Badge ton="neutral">Übungstag</Badge>
                          </span>
                          <span>
                            {p.title}
                            {geuebt ? ' · geübt' : ''}
                          </span>
                        </span>
                      );
                    })}
                  </span>
                )
              }
            />
          );
        })}
      </ul>
    </Section>
  );
}

function Kommende({ termine, bereich }: { termine: Termin[]; bereich: string }) {
  const jetzt = new Date();
  const kommende = termine.filter((t) => kuenftig(t.ends_at, jetzt));
  return (
    <Listenabschnitt
      titel="Kommende Termine"
      leer={{
        titel: 'Zurzeit ist kein Termin vereinbart.',
        beschreibung: 'Über „Termin wünschen“ sagen Sie der Praxis, wann es Ihnen passt.',
      }}
    >
      {kommende.map((t) => (
        <Terminzeile key={t.id} termin={t} bereich={bereich} />
      ))}
    </Listenabschnitt>
  );
}

/** Vergangenes auf Abruf: Es wird mit jeder Behandlung länger (DESIGN.md, Regel 6). */
function Vergangene({ termine }: { termine: Termin[] }) {
  const jetzt = new Date();
  const vergangene = termine.filter((t) => !kuenftig(t.ends_at, jetzt)).reverse();
  if (vergangene.length === 0) return null;
  return (
    <div className="mt-8">
      <Disclosure summary="Vergangene Termine" anzahl={vergangene.length} kopf="betont">
        <ListRows>
          {vergangene.map((t) => (
            <Terminzeile key={t.id} termin={t} gedaempft />
          ))}
        </ListRows>
      </Disclosure>
    </div>
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
  const nurLesen = useNurLesen();
  const aenderbar =
    !nurLesen && termin.status === 'confirmed' && new Date(termin.starts_at).getTime() > Date.now();
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
      <ListRows>
        {sichtbar.map((w) => (
          <Wunschzeile key={w.id} zugang={zugang} wunsch={w} />
        ))}
      </ListRows>
    </Section>
  );
}

/**
 * Ein Wunsch als Zeile der Liste, mit der Rückfrage darunter: Sie öffnet
 * sich an Ort und Stelle und braucht die volle Breite.
 */
function Wunschzeile({ zugang, wunsch: w }: { zugang: Plattformzugang; wunsch: Terminwunsch }) {
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const queryClient = useQueryClient();
  const zurueckziehen = useMutation({
    mutationFn: () => api.wunschZurueckziehen(zugang.access_id, w.id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: wuenscheSchluessel(zugang.access_id) }),
  });
  const zustand = WUNSCHZUSTAND[w.status];
  const text = wunschText(w);
  return (
    <li className="border-line border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-ink text-base font-semibold">
          {WUNSCHART[w.kind]} vom {datum(w.created_at)}
        </p>
        <Badge ton={zustand.ton}>{zustand.wort}</Badge>
      </div>
      {text ? <p className="text-ink mt-1 text-sm">{text}</p> : null}
      {w.note ? <p className="text-ink-muted mt-1 text-sm">„{w.note}“</p> : null}
      {/* §8: Ein Wunsch sieht nie aus wie ein Termin. */}
      {w.status === 'open' ? (
        <p className="text-ink-muted mt-1 text-sm">
          Die Praxis meldet sich bei Ihnen. Ein vereinbarter Termin ist das noch nicht.
        </p>
      ) : null}
      {w.answer ? (
        <p className="text-ink mt-1 text-sm">
          <span className="font-semibold">Antwort der Praxis:</span> {w.answer}
        </p>
      ) : null}
      {w.status === 'open' && !nurLesen ? (
        <div className="mt-2">
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
