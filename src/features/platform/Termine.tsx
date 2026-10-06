import { useQuery } from '@tanstack/react-query';
import { Badge, type Ton } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { ladeTermine, termineSchluessel, type Plattformzugang, type Termin } from './api';
import { terminBeschreibung } from './termine';
import { kuenftig, tagKurz, zeitraum } from './zeit';

/**
 * Reiter „Termine" (POR-008, DSN-001 4.1): „Wann komme ich dran?"
 *
 * Kommende Termine oben, vergangene darunter - beides nur aus dem gewählten
 * Verhältnis, geliefert vom Server über den Zugang. Jede Zeile sagt, wann,
 * wo und wer: beim Hausbesuch die eigene Anschrift und wer kommt, beim
 * Praxistermin der Standort. Der Zustand steht als Wort mit Zeichen, nie als
 * Farbe allein (Abschnitt 7).
 *
 * Die Wünsche (Termin wünschen, ändern, absagen) kommen mit POR-009/010.
 */
export function Termine({ zugang }: { zugang: Plattformzugang }) {
  const termine = useQuery({
    queryKey: termineSchluessel(zugang.access_id),
    queryFn: () => ladeTermine(zugang.access_id),
  });

  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Termine</h1>
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
            Zurzeit ist kein Termin vereinbart. Wenden Sie sich für einen Termin bitte an die
            Praxis.
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
