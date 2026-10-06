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
  ladeTermine,
  ladeWuensche,
  termineSchluessel,
  wuenscheSchluessel,
  wunschZurueckziehen,
  type Plattformzugang,
  type Termin,
  type Terminwunsch,
} from './api';
import { PLATTFORM_PFAD } from './pfade';
import { terminBeschreibung, wunschText } from './termine';
import { datum, kuenftig, tagKurz, zeitraum } from './zeit';

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
  const wunschPfad = `${PLATTFORM_PFAD}/termine/wunsch${
    suche.get('bereich') || suche.get('zugang')
      ? `?${new URLSearchParams(
          Object.fromEntries(
            [...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang'),
          ),
        ).toString()}`
      : ''
  }`;

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
      {termine.isPending ? (
        <LoadingState label="Ihre Termine werden geladen …" />
      ) : termine.data === undefined ? (
        <ErrorState
          title="Ihre Termine konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => termine.refetch()}
        />
      ) : (
        <Terminlisten termine={termine.data} />
      )}
    </>
  );
}

function Terminlisten({ termine }: { termine: Termin[] }) {
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
              <Terminzeile key={t.id} termin={t} />
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

function Terminzeile({ termin, gedaempft = false }: { termin: Termin; gedaempft?: boolean }) {
  const { titel, ort } = terminBeschreibung(termin);
  const zustand = ZUSTAND[termin.status];
  return (
    <ListRow
      zeit={
        <span className="flex flex-col leading-tight">
          <span>{tagKurz(termin.starts_at)}</span>
          <span className="text-sm font-medium">{zeitraum(termin.starts_at, termin.ends_at)}</span>
        </span>
      }
      titel={titel}
      meta={ort ?? undefined}
      status={zustand ? <Badge ton={zustand.ton}>{zustand.wort}</Badge> : undefined}
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
