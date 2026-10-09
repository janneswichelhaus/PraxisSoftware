import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Section } from '@/components/ui/Section';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchRueckfragen, rueckfragenKey, type Verhaeltnisart } from './api';
import { RueckfragenListe } from './RueckfragenListe';

/**
 * Rückfragen an der Akte bzw. am Trainingsverhältnis (KOM-002, KOM-003): die
 * Vorgänge dieses einen Verhältnisses, erledigte eingeschlossen. Die Akte
 * und das Trainingsverhältnis haben je einen eigenen Abschnitt, nie einen
 * gemeinsamen (§4.8, DSN-001 Abschnitt 6).
 */
export function RueckfragenAbschnitt({
  art,
  verhaeltnisId,
}: {
  art: Verhaeltnisart;
  verhaeltnisId: string;
}) {
  return (
    <Section
      titel="Rückfragen"
      hinweis="Fragen über die Plattform. Öffnen zeigt den Verlauf und die Antwort."
    >
      <RueckfragenListe
        art={art}
        verhaeltnisId={verhaeltnisId}
        mitErledigten
        mitName={false}
        leer="Noch keine Rückfrage über die Plattform."
      />
    </Section>
  );
}

/**
 * „Rückfragen" in Offene Punkte (KOM-002, ANN-309): wie viele offen sind und
 * wie viele davon überfällig - die Zusage an die Patient:innen wird hier
 * überwacht, nicht durch eine Benachrichtigung. Je Bereich, den die Rolle
 * liest; verbindlich zählt der Server.
 */
export function OffeneRueckfragen({ bereiche }: { bereiche: Verhaeltnisart[] }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: rueckfragenKey(null, null, false),
    queryFn: () => fetchRueckfragen(null),
    retry: false,
  });
  return (
    <Section titel="Rückfragen von der Plattform">
      {isPending ? <LoadingState label="Rückfragen werden gezählt …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Rückfragen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data ? (
        <ul className="flex flex-col gap-2">
          {bereiche.map((art) => {
            const offen = data.filter((z) => z.relationship_kind === art && z.status === 'open');
            const ueberfaellig = offen.filter((z) => z.overdue).length;
            const ziel = art === 'treatment' ? '/rueckfragen' : '/training/rueckfragen';
            return (
              <li key={art} className="text-ink">
                {bereiche.length > 1 ? (
                  <span className="font-semibold">
                    {art === 'treatment' ? 'Behandlung: ' : 'Training: '}
                  </span>
                ) : null}
                {offen.length === 0
                  ? 'Keine offene Rückfrage.'
                  : `${offen.length} offen${ueberfaellig > 0 ? `, davon ${ueberfaellig} überfällig` : ''}.`}{' '}
                {offen.length > 0 ? (
                  <Link to={ziel} className="text-accent underline">
                    Zu den Rückfragen
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </Section>
  );
}
